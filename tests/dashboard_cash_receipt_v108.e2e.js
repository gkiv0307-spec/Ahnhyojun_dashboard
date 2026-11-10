// v108 현금영수증 게시판 — 메뉴·대상 선별(카드사 정산·카드결제 제외)·상태 타일·DB 번호 자동·상태 변경↔은행 체크 동기화·면세/과세·TSV·일괄 발급
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v108/';
const file = process.env.DASH_FILE || 'dashboard_v108.html';
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const T = ymd(new Date());
const Y = new Date(); Y.setDate(Y.getDate() - 1); const D = ymd(Y);
const P = new Date(); P.setMonth(P.getMonth() - 2); const D2 = ymd(P);
const students = [
  { id: 's1', name: '홍OO', level: '초급반', tuition: 330000, paid: true, appliedDate: D, studentDbId: 'db1', installments: [] },
  { id: 's2', name: '김OO', level: '중급반', tuition: 440000, paid: true, appliedDate: D2, studentDbId: null, installments: [] },
  { id: 's3', name: '박OO', level: '초급반', tuition: 328680, paid: true, appliedDate: D, studentDbId: null, installments: [] },
];
const studentDb = [
  { id: 'db1', name: '홍OO', phone: '010-1234-5678', cashReceipt: '010-1234-5678', linkedStudentId: 's1', courses: { basic: true }, registeredDate: D },
];
const transactions = [
  { id: 't1', sig: D + '|홍OO|330000|0|7330000', date: D, description: '홍OO', deposit: 330000, withdrawal: 0, balance: 7330000, studentId: 's1', category: 'tuition' },
  { id: 't2', sig: D + '|롯데9927821022|328680|0|7658680', date: D, description: '롯데9927821022', deposit: 328680, withdrawal: 0, balance: 7658680, studentId: 's3', category: 'tuition' },
  { id: 't3', sig: D + '|이OO|150000|0|7808680', date: D, description: '이OO', deposit: 150000, withdrawal: 0, balance: 7808680, studentId: null, category: 'consulting' },
  { id: 't4', sig: D + '|최OO|440000|0|8248680', date: D, description: '최OO', deposit: 440000, withdrawal: 0, balance: 8248680, studentId: null, category: 'tuition', cardPayment: true },
  { id: 't5', sig: D2 + '|김OO|440000|0|6900000', date: D2, description: '김OO', deposit: 440000, withdrawal: 0, balance: 6900000, studentId: 's2', category: 'tuition', cashReceiptIssued: true },
  { id: 't6', sig: D + '|국민제이(J)207|0|349690|7898990', date: D, description: '국민제이(J)207', deposit: 0, withdrawal: 349690, balance: 7898990, studentId: null, category: '', expenseCategory: 'edu_maintenance' },
  { id: 't7', sig: D + '|정OO|3000|0|7901990', date: D, description: '정OO', deposit: 3000, withdrawal: 0, balance: 7901990, studentId: null, category: 'reimburse' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.addInitScript(({ transactions, students, studentDb }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } }, configurable: true });
    const seed = { students, auctions: [], loans: [], tasks: [], transactions, blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb, loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { transactions, students, studentDb });
  await page.goto('file://' + path + file);
  await page.waitForTimeout(1500);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  const rowIds = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-cr-row]')).map(r => r.getAttribute('data-cr-row')));
  // 1. 메뉴
  await page.click('#navDrawerBtn'); await page.waitForTimeout(400);
  const item = await page.$('[data-rail-view="cashReceipt"]');
  ck('메뉴 서랍에 "현금영수증" 항목', !!item);
  await page.evaluate(el => el.click(), item); await page.waitForTimeout(600);
  ck('화면 제목 "현금영수증 게시판"', (await page.textContent('#main')).includes('현금영수증 게시판'));
  // 2. 대상 선별 — 기본 필터 미발행
  let ids = await rowIds();
  ck('기본 "미발행" 필터: 홍OO 이체·이OO 컨설팅 2건만(카드사 정산·카드결제·출금·정산입금 제외)', ids.length === 2 && ids.includes('t1') && ids.includes('t3') && !ids.includes('t2') && !ids.includes('t4'));
  const tiles = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-cr-filter]')).map(b => [b.getAttribute('data-cr-filter'), b.querySelector('.n').textContent])));
  ck('타일 건수: 미발행 2 · 발급완료 1 · 전체 3', tiles.pending === '2건' && tiles.issued === '1건' && tiles.all === '3건');
  ck('미발행 타일에 합계 480,000', (await page.textContent('[data-cr-filter="pending"]')).includes('480,000'));
  await page.click('[data-cr-filter="all"]'); await page.waitForTimeout(400);
  ids = await rowIds();
  ck('전체 필터 3건, 최근 날짜 먼저', ids.length === 3 && ids[0] !== 't5' && ids[2] === 't5');
  // 3. DB 번호 자동·수강생 표시·컨설팅 알약
  const r1 = await page.evaluate(() => { const r = document.querySelector('[data-cr-row="t1"]'); return { no: r.querySelector('[data-cr-no]').value, title: r.querySelector('[data-cr-no]').getAttribute('title'), txt: r.textContent, status: r.querySelector('[data-cr-status]').value }; });
  ck('홍OO 행 식별번호가 수강생 DB 번호로 미리 채워짐(자동 표시)', r1.no === '010-1234-5678' && (r1.title || '').includes('자동'));
  ck('홍OO 행에 수강생·반 표시', r1.txt.includes('홍OO') && r1.txt.includes('초급반') && r1.status === 'pending');
  const r3 = await page.evaluate(() => document.querySelector('[data-cr-row="t3"]').textContent);
  ck('컨설팅 행에 "컨설팅" 알약·수강생 미연결', r3.includes('컨설팅') && r3.includes('수강생 미연결'));
  const r5 = await page.evaluate(() => document.querySelector('[data-cr-row="t5"] [data-cr-status]').value);
  ck('옛 cashReceiptIssued=true 거래는 발급완료로 읽힘', r5 === 'issued');
  // 4. TSV (면세 기본)
  let tsv = await page.inputValue('#crTsv');
  let lines = tsv.split('\n');
  ck('TSV 3줄 · 11열', lines.length === 3 && lines.every(l => l.split('\t').length === 11));
  const l1 = lines.find(l => l.includes('홍OO')).split('\t');
  ck('홍OO 줄: 날짜·우리(부동산에듀)·에듀·330000·공급가액 330000·부가세 0·수강료(초급반)·미발행', l1[0] === D && l1[1] === '우리(부동산에듀)' && l1[2] === '에듀' && l1[4] === '330000' && l1[5] === '330000' && l1[6] === '0' && l1[7] === '수강료(초급반)' && l1[8] === '미발행');
  ck('홍OO 줄 비고에 DB 번호', l1[10].includes('010-1234-5678'));
  const l3 = lines.find(l => l.includes('이OO')).split('\t');
  ck('컨설팅 줄 사유 "대리입찰 컨설팅비"', l3[7] === '대리입찰 컨설팅비');
  // 5. 과세 토글 → 10/11 분리, meta 저장
  await page.check('#crVat'); await page.waitForTimeout(500);
  tsv = await page.inputValue('#crTsv'); lines = tsv.split('\n');
  const l1b = lines.find(l => l.includes('홍OO')).split('\t');
  ck('과세: 330000 → 공급가액 300000 · 부가세 30000', l1b[5] === '300000' && l1b[6] === '30000');
  let s = await st();
  ck('meta.cashReceiptVat = 과세', s.meta.cashReceiptVat === '과세');
  await page.uncheck('#crVat'); await page.waitForTimeout(500);
  s = await st();
  ck('토글 끄면 면세로 저장', s.meta.cashReceiptVat === '면세');
  // 6. 복사
  await page.click('#crCopy'); await page.waitForTimeout(300);
  const copied = await page.evaluate(() => window.__copied);
  ck('복사 버튼이 TSV 를 클립보드에', copied.length === 1 && copied[0] === (await page.inputValue('#crTsv')));
  // 7. 상태 변경 → cashReceiptIssued·발급일 동기화
  await page.selectOption('[data-cr-status="t1"]', 'issued'); await page.waitForTimeout(500);
  s = await st();
  let t1 = s.transactions.find(t => t.id === 't1');
  ck('발급완료로 바꾸면 cashReceiptIssued=true · 발급일 오늘', t1.cashReceiptStatus === 'issued' && t1.cashReceiptIssued === true && t1.cashReceiptDate === T);
  await page.selectOption('[data-cr-status="t1"]', 'notNeeded'); await page.waitForTimeout(500);
  s = await st(); t1 = s.transactions.find(t => t.id === 't1');
  ck('불필요로 바꾸면 cashReceiptIssued=false', t1.cashReceiptStatus === 'notNeeded' && t1.cashReceiptIssued === false);
  await page.selectOption('[data-cr-status="t1"]', 'pending'); await page.waitForTimeout(500);
  s = await st(); t1 = s.transactions.find(t => t.id === 't1');
  ck('미발행으로 되돌리면 발급일 비움', t1.cashReceiptStatus === 'pending' && !t1.cashReceiptDate);
  // 8. 구분·번호·비고 저장
  await page.selectOption('[data-cr-type="t3"]', '지출증빙'); await page.waitForTimeout(400);
  await page.fill('[data-cr-no="t3"]', '123-45-67890'); await page.press('[data-cr-no="t3"]', 'Tab'); await page.waitForTimeout(400);
  await page.fill('[data-cr-memo="t3"]', '승인 A1'); await page.press('[data-cr-memo="t3"]', 'Tab'); await page.waitForTimeout(400);
  s = await st(); const t3 = s.transactions.find(t => t.id === 't3');
  ck('구분·식별번호·비고가 거래에 저장', t3.cashReceiptType === '지출증빙' && t3.cashReceiptNo === '123-45-67890' && t3.cashReceiptMemo === '승인 A1');
  tsv = await page.inputValue('#crTsv');
  ck('TSV 비고에 "지출증빙 · 123-45-67890 · 승인 A1"', tsv.includes('지출증빙 · 123-45-67890 · 승인 A1'));
  // 9. 발급일 입력만 해도 발급완료
  await page.fill('[data-cr-date="t3"]', D); await page.dispatchEvent('[data-cr-date="t3"]', 'change'); await page.waitForTimeout(500);
  s = await st();
  ck('발급일을 적으면 미발행→발급완료', s.transactions.find(t => t.id === 't3').cashReceiptStatus === 'issued');
  // 10. 검색 · 월 필터
  await page.fill('#crQuery', '홍'); await page.waitForTimeout(600);
  ids = await rowIds();
  ck('검색 "홍" → 홍OO 1건', ids.length === 1 && ids[0] === 't1');
  await page.fill('#crQuery', ''); await page.waitForTimeout(600);
  await page.selectOption('#crMonth', D2.slice(0, 7)); await page.waitForTimeout(500);
  ids = await rowIds();
  ck('월 필터 → 그 달 거래만(t5)', ids.length === 1 && ids[0] === 't5');
  await page.selectOption('#crMonth', 'all'); await page.waitForTimeout(500);
  // 11. 일괄 발급완료 (미발행 필터에서)
  await page.click('[data-cr-filter="pending"]'); await page.waitForTimeout(400);
  ids = await rowIds();
  ck('미발행 필터에 t1 만 남음', ids.length === 1 && ids[0] === 't1');
  page.once('dialog', d => d.accept());
  await page.click('#crAllIssued'); await page.waitForTimeout(400);
  const okBtn = await page.$('#confirmOkBtn');
  if (okBtn) { await okBtn.click(); await page.waitForTimeout(500); }
  s = await st();
  ck('일괄 발급완료 → t1 발급완료 · 발급일 오늘', s.transactions.find(t => t.id === 't1').cashReceiptStatus === 'issued' && s.transactions.find(t => t.id === 't1').cashReceiptDate === T);
  ck('미발행 0건 안내', (await page.textContent('#main')).includes('조건에 맞는 거래가 없습니다'));
  // 12. 은행 화면 체크와 동기화
  await page.click('#navDrawerBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-rail-view="bank"]').click()); await page.waitForTimeout(800);
  const cbSel = '[data-cashreceipt-toggle="t1"]';
  ck('은행 화면 홍OO 행의 "현금영수증 발행" 체크가 켜져 있음', (await page.$(cbSel)) !== null && await page.isChecked(cbSel));
  await page.click(cbSel); await page.waitForTimeout(600);
  s = await st(); t1 = s.transactions.find(t => t.id === 't1');
  ck('은행 체크 해제 → cashReceiptStatus=pending', t1.cashReceiptStatus === 'pending' && t1.cashReceiptIssued === false);
  const cb5 = '[data-cashreceipt-toggle="t5"]';
  const has5 = (await page.$(cb5)) !== null;
  if (has5) { await page.click(cb5); await page.waitForTimeout(500); await page.click(cb5); await page.waitForTimeout(600); }
  s = await st(); const t5 = s.transactions.find(t => t.id === 't5');
  ck('은행 체크 켜면 status=issued · 발급일 기록', has5 && t5.cashReceiptStatus === 'issued' && t5.cashReceiptDate === T);
  ck('페이지 오류 없음', errors.length === 0);
  console.log(fail ? ('FAILED ' + fail) : 'ALL PASS');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
