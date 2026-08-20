/**
 * 구글시트(리뷰노트) 내용을 대시보드 발행본에 반영한다.
 *
 * 발행된 페이지는 보안 정책상 구글에 직접 접속할 수 없다. 그래서 시트를 읽는 일은
 * 바깥(예약 실행 세션)에서 하고, 이 스크립트가 그 내용을 페이지에 심는다.
 *
 * 무엇을 덮어쓰고 무엇을 지키는가
 *  - 리뷰어 명단 : 시트가 원본이므로 매번 새로 만든다.
 *  - 대시보드에서 직접 잡은 예약(localEdit 표시가 붙은 항목) : 그대로 지킨다.
 *    담당자가 화면에서 배정한 날짜·시간·상태가 동기화 때마다 되돌아가면 쓸 수 없기 때문이다.
 *  - 시트 값이 비어 있고 대시보드에 값이 있으면 : 대시보드 값을 지킨다(빈 값으로 지우지 않는다).
 *  - 대시보드에서 직접 추가한 사람(source=manual) : 시트에 없어도 남긴다.
 *  - 지점의 예약 가능 날짜·시간대·인원, 안내문구 : 시트에 없는 정보이므로 발행본에서 그대로 가져온다.
 *  - 시트에 새 지점이 나타나면 지점만 추가하고 일정은 비워 둔다(담당자가 채운다).
 *
 * 사용법
 *   node sheets-to-state.mjs --sheets <덤프1.json> [<덤프2.json> ...] \
 *        --live <현재발행본.html> --password <비밀번호> [--out <출력.html>]
 *
 * <덤프>는 Drive 도구의 read_file_content 결과({"fileContent": "..."}) 를 저장한 파일이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/* ----------------------------------------------------------- 인자 */
const argv = process.argv.slice(2);
const opt = (name, many) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return many ? [] : null;
  if (!many) return argv[i + 1];
  const out = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]);
  return out;
};
const sheetFiles = opt('sheets', true);
const liveFile = opt('live');
const password = opt('password');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const outFile = opt('out') || path.join(HERE, '..', 'dashboard-seeded.html');
const buildFile = path.join(HERE, '..', 'dashboard.html');

if (!sheetFiles.length || !liveFile || !password) {
  console.error('사용법: node sheets-to-state.mjs --sheets <덤프...> --live <발행본.html> --password <비밀번호> [--out <파일>]');
  process.exit(2);
}

/* ------------------------------------------------------ 시트 파싱 */
const clean = (s) => String(s || '').replace(/\\(.)/g, '$1').replace('[merged]', '').trim();
const BRANCH_RE = /(브라운도트\s*\S+점|스테이레브소유\s*\S+점)/;
const PERIOD_RE = /체험기간\s*:?\s*(\d{1,2})\s*[./]\s*(\d{1,2})/;
const YMD = /(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/;
const MD = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})/;
const DONE = new Set(['o', 'O', 'ㅇ', '0', '완료']);
const pad = (n) => (n < 10 ? '0' + n : String(n));

function rowsOf(block) {
  return block.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && !/^\|[\s:|-]+\|$/.test(l))
    .map((l) => l.replace(/^\||\|$/g, '').split('|').map(clean));
}

function normDate(raw, year, blockMonth) {
  const v = (raw || '').trim();
  if (!v) return { iso: '', left: '' };
  let m = YMD.exec(v);
  if (m) return { iso: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, left: '' };
  m = MD.exec(v);
  if (m) {
    const mo = +m[1], da = +m[2];
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return { iso: '', left: v };
    const y = (blockMonth && mo < blockMonth - 6) ? year + 1 : year;
    return { iso: `${y}-${pad(mo)}-${pad(da)}`, left: '' };
  }
  return { iso: '', left: v };
}

function parseSheet(text, defaultBranch, startYear) {
  const out = [];
  let year = startYear, prevMonth = null;
  const rounds = {};

  for (const block of text.split('\n\n')) {
    const rows = rowsOf(block);
    if (!rows.length) continue;
    const hi = rows.findIndex((r) => r.some((c) => c === '이름'));
    if (hi < 0) continue;

    const col = {};
    rows[hi].forEach((c, i) => {
      if (c === '이름') col.name = i;
      else if (c === '연락처') col.phone = i;
      else if (c === '예약날짜' || c === '예약 날짜') col.date = i;
      else if (c === '체험 여부') col.exp = i;
      else if (c === '링크') col.url = i;
      else if (c === '배정 호수') col.room = i;
      else if (c === '메인 키워드') col.kw = i;
      else if (c.startsWith('포스팅 성과')) col.perf = i;
      else if (c === '특이 사항' || c === '기타 사항') col.note = i;
    });
    if (col.name === undefined) continue;

    const head = rows.slice(0, hi).map((r) => r.join(' ')).join(' ');
    const bm = BRANCH_RE.exec(head);
    const branch = bm ? bm[1].replace(/\s+/g, ' ') : defaultBranch;
    const pm = PERIOD_RE.exec(head);
    const blockMonth = pm ? +pm[1] : null;
    if (blockMonth) {
      if (prevMonth !== null && blockMonth < prevMonth - 6) year += 1;
      prevMonth = blockMonth;
    }
    rounds[branch] = (rounds[branch] || 0) + 1;
    const round = rounds[branch];

    for (const r of rows.slice(hi + 1)) {
      const cell = (k) => (col[k] === undefined ? '' : (r[col[k]] || '').trim());
      const name = cell('name');
      if (!name || !/[가-힣A-Za-z]/.test(name)) continue;
      if (name === '이름' || name.startsWith('전객실') || name.startsWith('스탠다드')) continue;

      const dateRaw = cell('date'), expRaw = cell('exp'), url = cell('url');
      const { iso, left } = normDate(dateRaw, year, blockMonth);
      const blob = `${dateRaw} ${expRaw}`;
      let status = null, extra = '';
      if (blob.includes('취소')) status = '취소';
      else if (blob.includes('노쇼')) { status = '취소'; extra = '노쇼'; }
      else if (blob.includes('다음번')) { status = '예약전'; extra = '다음번 선정'; }
      else if (DONE.has(expRaw.trim())) status = '방문완료';
      if (!status) status = iso ? '예약확정' : '예약전';

      const memo = [`${round}차`];
      if (extra) memo.push(extra);
      for (const [k, label] of [['room', '호수'], ['kw', '키워드'], ['perf', '성과'], ['note', '']]) {
        const v = cell(k);
        if (v && v !== '일정 안내') memo.push(`${label} ${v}`.trim());
      }
      if (left && left !== 'x' && left !== 'X') memo.push(`원본 예약날짜: ${left}`);

      out.push({
        branchName: branch, name, accountUrl: url, phone: cell('phone'),
        address: '', exposureScore: '', grade: '', dailyVisits: '', applyMessage: '',
        memo: memo.join(' / '), wishDate: iso, wishTime: '', status,
        reviewRegistered: !!url,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------- 암복호화 */
const SEED_RE = /(<script id="seed-data" type="application\/json">)([\s\S]*?)(<\/script>)/;

function deriveKey(page) {
  const salt = Buffer.from(/salt: '([^']+)'/.exec(page)[1], 'base64');
  const iters = Number(/iter: (\d+)/.exec(page)[1]);
  const want = /hash: '([^']+)'/.exec(page)[1];
  const bits = crypto.pbkdf2Sync(password, salt, iters, 64, 'sha256');
  if (bits.subarray(0, 32).toString('base64') !== want) {
    throw new Error('비밀번호가 페이지의 잠금과 맞지 않습니다.');
  }
  return bits.subarray(32);
}

function decryptSeed(page, key) {
  const m = SEED_RE.exec(page);
  if (!m) throw new Error('발행본에서 seed 를 찾지 못했습니다.');
  const raw = m[2].trim();
  if (!raw || raw === 'null') return null;
  const seed = JSON.parse(raw.replace(/\\u003c/g, '<'));
  const iv = Buffer.from(seed.payload.iv, 'base64');
  const buf = Buffer.from(seed.payload.data, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
}

function encryptSeed(state, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(state), 'utf8')), c.final(), c.getAuthTag()]);
  return {
    version: String(Date.now()),
    savedAt: new Date().toISOString(),
    savedBy: '구글시트 자동 동기화',
    payload: { iv: iv.toString('base64'), data: ct.toString('base64') },
  };
}

/* --------------------------------------------------------- 실행 */
const live = fs.readFileSync(liveFile, 'utf8');
const key = deriveKey(live);
const prev = decryptSeed(live, key);

let reviewers = [];
sheetFiles.forEach((f, i) => {
  const text = JSON.parse(fs.readFileSync(f, 'utf8')).fileContent;
  // 시트 안에 지점명이 적혀 있으면 그것을 쓰고, 없으면 첫 시트는 포항죽도점 기준
  reviewers = reviewers.concat(parseSheet(text, i === 0 ? '브라운도트 포항죽도점' : '스테이레브소유 김해점', i === 0 ? 2025 : 2026));
});

// 지점 설정은 발행본 것을 지킨다
const prevBranches = (prev && prev.branches) || [];
const byName = new Map(prevBranches.map((b) => [b.name.replace(/\s+/g, ''), b]));
const branches = prevBranches.map((b) => ({ ...b }));
const checkin = new Map(branches.map((b) => [b.name.replace(/\s+/g, ''), (b.times || [])[0] || '']));

for (const name of new Set(reviewers.map((r) => r.branchName))) {
  const k = name.replace(/\s+/g, '');
  if (byName.has(k)) continue;
  branches.push({ id: 'br_' + crypto.randomBytes(4).toString('hex'), name,
    dates: [], times: [], defaultCapacity: 2, slotOverrides: {}, memo: '시트에서 새로 발견된 지점 — 일정을 등록하세요' });
  checkin.set(k, '');
}

// 날짜가 잡힌 건은 그 지점 체크인 시각으로 (숙박이라 하루 한 타임)
reviewers.forEach((r) => {
  r.branchId = null;
  r.source = 'sheet';
  r.localEdit = {};
  if (r.wishDate) r.wishTime = checkin.get(r.branchName.replace(/\s+/g, '')) || '';
});

/* --------------------------------------------- 대시보드 편집분과 합치기 */
const idOf = (r) => {
  const digits = String(r.phone || '').replace(/\D/g, '');
  const branch = String(r.branchName || '').replace(/\s+/g, '');
  return digits ? branch + '|' + digits : branch + '|n:' + String(r.name || '').replace(/\s+/g, '');
};

const prevList = (prev && prev.reviewers) || [];
const prevByKey = new Map();
prevList.forEach((r) => { if (!prevByKey.has(idOf(r))) prevByKey.set(idOf(r), r); });

let keptEdits = 0, keptFilled = 0;
const usedPrev = new Set();

reviewers.forEach((r) => {
  const prevR = prevByKey.get(idOf(r));
  if (!prevR) return;
  usedPrev.add(prevR);
  r.id = prevR.id;
  r.localEdit = prevR.localEdit && typeof prevR.localEdit === 'object' ? prevR.localEdit : {};

  for (const key of ['wishDate', 'wishTime', 'status', 'reviewRegistered', 'memo',
                     'grade', 'exposureScore', 'dailyVisits', 'address', 'applyMessage', 'accountUrl', 'name']) {
    const mine = r[key], theirs = prevR[key];
    if (r.localEdit[key] !== undefined) {           // 대시보드에서 직접 고친 항목은 그대로 둔다
      r[key] = theirs;
      keptEdits += 1;
    } else if ((mine === '' || mine === undefined) && theirs !== '' && theirs !== undefined) {
      r[key] = theirs;                              // 시트가 비어 있으면 기존 값을 지우지 않는다
      keptFilled += 1;
    }
  }
});

// 대시보드에서 직접 추가한 사람은 시트에 없어도 남긴다
const manualKept = prevList.filter((r) => r.source === 'manual' && !usedPrev.has(r));
reviewers = reviewers.concat(manualKept.map((r) => ({ ...r, branchId: null })));

reviewers.forEach((r, i) => { if (!r.id) r.id = 'rv_' + String(i).padStart(4, '0'); });

const state = {
  version: 1,
  branches,
  reviewers,
  settings: (prev && prev.settings) || { maskPII: false, shareNote: '' },
  isSample: false,
};

const fresh = fs.readFileSync(buildFile, 'utf8');
const seedJson = JSON.stringify(encryptSeed(state, key)).replace(/</g, '\\u003c');
const outHtml = fresh.replace(SEED_RE, (_, a, __, b) => a + seedJson + b);
if (outHtml === fresh) throw new Error('dashboard.html 에 seed 자리가 없습니다. build-dashboard.py 를 먼저 실행하세요.');
fs.writeFileSync(outFile, outHtml);

const before = prev ? prev.reviewers.length : 0;
const byBranch = {};
reviewers.forEach((r) => { byBranch[r.branchName] = (byBranch[r.branchName] || 0) + 1; });
console.log(`리뷰어 ${before}명 → ${reviewers.length}명`);
console.log(`대시보드 편집 유지 ${keptEdits}건 · 시트 빈칸 보존 ${keptFilled}건 · 직접추가 유지 ${manualKept.length}명`);
console.log('지점별:', JSON.stringify(byBranch, null, 0));
console.log('지점 설정 유지:', branches.map((b) => `${b.name}(날짜 ${b.dates.length})`).join(', '));
console.log(`→ ${path.basename(outFile)} (${Math.round(outHtml.length / 1024)}KB) · 이 파일을 발행하세요`);
