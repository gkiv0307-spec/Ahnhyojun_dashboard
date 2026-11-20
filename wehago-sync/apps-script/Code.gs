/**
 * 위하고 수신결재 → 이체관리 시트 입력용 웹앱 (독립형 Apps Script 프로젝트)
 *
 * 시트에 이미 붙어 있는 기존 Apps Script 와 doPost 가 겹치지 않도록
 * 반드시 "새 프로젝트"(script.google.com → 새 프로젝트)에 붙여넣어 쓴다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)에 넣을 값:
 *   SYNC_TOKEN      : 아무도 모르는 긴 문자열 (PC 쪽 config.json 의 token 과 같게)
 *   SPREADSHEET_ID  : 1kUKbSUju8N5AhBM_JonOijMXnuj-A9JBSa2WIoqfNZA
 */

var COL = { // B열=2 부터
  paid: 2, date: 3, property: 4, bankbook: 5, holder: 6, amount: 7, content: 8,
  method: 9, proofType: 10, proofRecv: 11, resolution: 12, note: 13, bank: 14, account: 15,
};
var FIRST_COL = 2, NUM_COLS = 14, HEADER_ROWS = 2;
var LOG_SHEET = '위하고_처리기록';
var MAP_SHEET = '위하고_매핑';
var LOG_HEADER = ['문서키', '제목', '탭', '받는사람', '금액', '결과', '처리시각', '증빙수취'];

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    if (!req.token || req.token !== props.getProperty('SYNC_TOKEN')) throw new Error('토큰 불일치');
    var ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      if (req.action === 'known') out = { ok: true, keys: knownKeys_(ss) };
      else if (req.action === 'add') out = { ok: true, results: (req.items || []).map(function (it) { return addItem_(ss, it, !!req.dryRun); }) };
      else if (req.action === 'markDone') out = { ok: true, results: markDone_(ss, req.rows || [], !!req.dryRun) };
      else if (req.action === 'ping') out = { ok: true, tab: monthTabName_(new Date()) };
      else throw new Error('알 수 없는 action: ' + req.action);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function monthTabName_(d) {
  return (d.getMonth() + 1) + '월 이체';
}

function getOrCreate_(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function logSheet_(ss) { return getOrCreate_(ss, LOG_SHEET, LOG_HEADER); }

function knownKeys_(ss) {
  var sh = logSheet_(ss);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
}

// 매핑 시트: A=키워드, B=해당부동산, C=통장. 제목·기안부서에 키워드가 들어 있으면 적용.
// 여러 키워드가 동시에 맞고 결과가 다르면 추측하지 않고 비운다.
function lookupMapping_(ss, text) {
  var sh = getOrCreate_(ss, MAP_SHEET, ['키워드(제목·기안부서에 포함)', '해당부동산', '통장', '메모']);
  if (sh.getLastRow() < 2) return { property: '', bankbook: '', note: '매핑 없음' };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().filter(function (r) {
    return r[0] && text.indexOf(String(r[0]).trim()) !== -1;
  });
  if (!rows.length) return { property: '', bankbook: '', note: '매핑 키워드 없음' };
  var props = uniq_(rows.map(function (r) { return String(r[1]).trim(); }).filter(String));
  var books = uniq_(rows.map(function (r) { return String(r[2]).trim(); }).filter(String));
  return {
    property: props.length === 1 ? props[0] : '',
    bankbook: books.length === 1 ? books[0] : '',
    note: (props.length > 1 || books.length > 1) ? '매핑 키워드가 여러 개 겹침' : '',
  };
}

function uniq_(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

// 드롭다운(엄격 검증) 칸은 목록에 있는 값만 넣는다. 없으면 빈칸.
function allowed_(cell, value) {
  if (!value) return '';
  var dv = cell.getDataValidation();
  if (!dv || dv.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return value;
  return dv.getCriteriaValues()[0].indexOf(value) !== -1 ? value : '';
}

function lastDataRow_(sh) {
  var n = sh.getLastRow();
  if (n <= HEADER_ROWS) return HEADER_ROWS;
  var vals = sh.getRange(HEADER_ROWS + 1, COL.date, n - HEADER_ROWS, COL.amount - COL.date + 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i].some(function (v) { return v !== '' && v !== null; })) return HEADER_ROWS + 1 + i;
  }
  return HEADER_ROWS;
}

function findSame_(sh, holder, amount) {
  var last = lastDataRow_(sh);
  if (last <= HEADER_ROWS) return 0;
  var vals = sh.getRange(HEADER_ROWS + 1, COL.holder, last - HEADER_ROWS, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === holder && Number(vals[i][1]) === amount) return HEADER_ROWS + 1 + i;
  }
  return 0;
}

function addItem_(ss, it, dryRun) {
  var key = String(it.docKey || '');
  var res = { docKey: key, title: it.title || '' };
  if (!key) return mark_(res, '건너뜀', '문서키 없음');
  if (knownKeys_(ss).indexOf(key) !== -1) return mark_(res, '건너뜀', '이미 처리한 문서');
  var holder = String(it.holder || '').trim();
  var amount = Number(it.amount) || 0;
  if (!holder || !amount) return logResult_(ss, res, it, '', '수동확인', '받는사람/금액 미확정: ' + (it.warnings || []).join(', '), dryRun);

  var now = new Date();
  var tab = monthTabName_(now);
  var sh = ss.getSheetByName(tab);
  if (!sh) return mark_(res, '오류', '"' + tab + '" 탭이 없음 — 탭을 먼저 만들어 주세요');

  var dup = findSame_(sh, holder, amount);
  if (dup) return logResult_(ss, res, it, tab, '중복의심', tab + ' ' + dup + '행에 같은 받는사람+금액 있음', dryRun);

  var row = lastDataRow_(sh) + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 10);
  var map = lookupMapping_(ss, [it.title, it.dept].join(' '));
  var notes = ['위하고 수신결재'];
  if (it.requestDate) notes.push('요청일 ' + it.requestDate);
  if (map.note) notes.push(map.note);
  (it.warnings || []).forEach(function (w) { notes.push(w); });

  var values = {};
  values[COL.paid] = '';
  values[COL.date] = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  values[COL.property] = allowed_(sh.getRange(row, COL.property), map.property);
  values[COL.bankbook] = allowed_(sh.getRange(row, COL.bankbook), map.bankbook);
  values[COL.holder] = holder;
  values[COL.amount] = amount;
  values[COL.content] = String(it.content || it.title || '');
  values[COL.method] = '계좌이체';
  values[COL.proofType] = allowed_(sh.getRange(row, COL.proofType), String(it.proofType || ''));
  values[COL.proofRecv] = '필요'; // 수신결재함에 있음 = 증빙 미수취 (가이드 3번)
  values[COL.resolution] = '결재';
  values[COL.note] = notes.join(' / ');
  values[COL.bank] = String(it.bank || '');
  values[COL.account] = String(it.account || '');
  if (map.property && !values[COL.property]) notes.push('매핑 부동산 "' + map.property + '"이 목록에 없음');
  if (map.bankbook && !values[COL.bankbook]) notes.push('매핑 통장 "' + map.bankbook + '"이 목록에 없음');
  values[COL.note] = notes.join(' / ');

  res.row = row; res.tab = tab; res.values = values;
  if (dryRun) return mark_(res, '미리보기', '');

  var line = [];
  for (var c = FIRST_COL; c < FIRST_COL + NUM_COLS; c++) line.push(values[c]);
  sh.getRange(row, COL.account).setNumberFormat('@'); // 앞자리 0 보존
  sh.getRange(row, FIRST_COL, 1, NUM_COLS).setValues([line]);
  sh.getRange(row, COL.date).setNumberFormat('yyyy. m. d');
  SpreadsheetApp.flush();
  // 가이드 6-4: 날짜가 비어 저장되는 경우 확인
  var check = sh.getRange(row, COL.date, 1, COL.amount - COL.date + 1).getValues()[0];
  if (!check[0]) sh.getRange(row, COL.date).setValue(values[COL.date]);
  return logResult_(ss, res, it, tab, '입력', '', false);
}

function mark_(res, result, reason) { res.result = result; res.reason = reason; return res; }

function logResult_(ss, res, it, tab, result, reason, dryRun) {
  mark_(res, result, reason);
  if (dryRun) { res.result = '미리보기:' + result; return res; }
  logSheet_(ss).appendRow([res.docKey, it.title || '', tab, it.holder || '', it.amount || '', result + (reason ? ' (' + reason + ')' : ''), new Date(), result === '입력' ? '필요' : '']);
  return res;
}

// 결재내역함으로 넘어간 문서(=증빙 수취완료)의 증빙수취 칸을 '필요' → '완료'로 바꾼다.
// rows: 결재내역함 목록의 각 행 글자. 기록된 제목이 그 글자에 포함되면 같은 문서로 본다.
function markDone_(ss, rows, dryRun) {
  var log = logSheet_(ss);
  if (log.getLastRow() < 2) return [];
  var data = log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADER.length).getValues();
  var results = [];
  data.forEach(function (r, i) {
    var title = String(r[1]), tab = String(r[2]), holder = String(r[3]), amount = Number(r[4]);
    if (r[7] !== '필요' || !title || !tab) return;
    var norm = function (s) { return String(s).replace(/\s+/g, ''); };
    if (!rows.some(function (t) { return norm(t).indexOf(norm(title)) !== -1; })) return;
    var sh = ss.getSheetByName(tab);
    var rowNo = sh ? findSame_(sh, holder, amount) : 0;
    var item = { docKey: r[0], title: title, tab: tab, row: rowNo };
    if (!rowNo) { item.result = '수동확인'; item.reason = '시트에서 받는사람+금액 행을 못 찾음'; results.push(item); return; }
    var cell = sh.getRange(rowNo, COL.proofRecv);
    if (cell.getValue() !== '필요') { item.result = '건너뜀'; item.reason = '이미 ' + cell.getValue(); }
    else if (dryRun) { item.result = '미리보기:완료로 변경'; }
    else { cell.setValue('완료'); log.getRange(i + 2, 8).setValue('완료'); item.result = '완료로 변경'; }
    results.push(item);
  });
  return results;
}

/** 편집기에서 한 번 실행: 기록·매핑 시트를 만들고 권한을 승인받는다. */
function setup() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('스크립트 속성 SPREADSHEET_ID 를 먼저 넣어 주세요');
  var ss = SpreadsheetApp.openById(id);
  logSheet_(ss);
  lookupMapping_(ss, '');
  Logger.log('준비 완료: ' + monthTabName_(new Date()) + ' 탭에 입력됩니다.');
}
