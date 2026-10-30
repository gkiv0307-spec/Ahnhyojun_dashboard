// v104 지출 분류 "관리비 (건물 관리비)" edu_maintenance 분리 — 선택지·자동학습·월별 표·필터 확인
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v104/';
const file = process.env.DASH_FILE || 'dashboard_v104.html';
const transactions = [
  { id: 'w1', sig: '2026-10-30|국민제이(J)207|0|320900|6835676', date: '2026-10-30', description: '국민제이(J)207', deposit: 0, withdrawal: 320900, balance: 6835676, studentId: null, category: '', expenseCategory: 'edu_maintenance', expenseCategoryAuto: false },
  { id: 'w2', sig: '2026-10-02|국민제이(J)207|0|948370|7000000', date: '2026-10-02', description: '국민제이(J)207', deposit: 0, withdrawal: 948370, balance: 7000000, studentId: null, category: '' },
  { id: 'w3', sig: '2026-10-05|아이파킹 주식회사|0|50000|6950000', date: '2026-10-05', description: '아이파킹 주식회사', deposit: 0, withdrawal: 50000, balance: 6950000, studentId: null, category: '', expenseCategory: 'edu_rental', expenseCategoryAuto: false },
  { id: 'w4', sig: '2026-10-07|코웨이렌탈05|0|30000|6920000|', date: '2026-10-07', description: '코웨이렌탈05', deposit: 0, withdrawal: 30000, balance: 6920000, studentId: null, category: '' },
  { id: 'd1', sig: '2026-10-08|홍길동|330000|0|7250000', date: '2026-10-08', description: '홍길동', deposit: 330000, withdrawal: 0, balance: 7250000, studentId: null, category: null },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.addInitScript(({ transactions }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions, blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { transactions });
  await page.goto('file://' + path + file);
  await page.waitForTimeout(1500);
  const nav = await page.$('[data-view="bank"], [data-rail-view="bank"], [data-goto="bank"]');
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(700);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  // 1. 분류 상수는 클로저 안이라 select 선택지(순서·라벨)로 확인한다
  const consts = await page.evaluate(() => { const el = document.querySelector('[data-expense-category="w3"]'); return el ? Array.from(el.options).filter(o => o.value).map(o => ({ v: o.value, t: o.textContent })) : null; });
  ck('분류 선택지에 edu_maintenance 가 edu_rental 바로 뒤에 있다', !!consts && consts.findIndex(o => o.v === 'edu_maintenance') === consts.findIndex(o => o.v === 'edu_rental') + 1);
  ck('라벨: 관리비 (건물 관리비) / 임차료엔 "관리비" 없음', !!consts && consts.some(o => o.v === 'edu_maintenance' && o.t === '관리비 (건물 관리비)') && consts.some(o => o.v === 'edu_rental' && o.t.indexOf('관리비') === -1 && o.t.indexOf('월세') > -1));
  ck('선택지 모두 라벨이 비어 있지 않다(undefined 없음)', !!consts && consts.every(o => o.t && o.t !== 'undefined'));
  // 2. 자동학습: 같은 적요(국민제이) 미분류 건이 관리비로 붙음, 코웨이는 미분류 그대로
  let s = await st();
  const w2 = s.transactions.find(t => t.id === 'w2'), w4 = s.transactions.find(t => t.id === 'w4');
  ck('국민제이 미분류 건 → 자동으로 edu_maintenance(auto)', w2.expenseCategory === 'edu_maintenance' && w2.expenseCategoryAuto === true);
  ck('학습 근거 없는 코웨이렌탈은 미분류 유지', !w4.expenseCategory);
  // 3. 행 select 선택지
  const sel = await page.evaluate(() => { const el = document.querySelector('[data-expense-category="w3"]'); return el ? Array.from(el.options).map(o => o.value + '|' + o.textContent) : null; });
  ck('행 분류 select 에 관리비 선택지', !!sel && sel.some(o => o === 'edu_maintenance|관리비 (건물 관리비)'));
  ck('행 분류 select 임차료 라벨 갱신', !!sel && sel.some(o => o === 'edu_rental|임차료 (월세·정수기·복합기 등)'));
  // 4. 행 알약 표시
  const pills = await page.evaluate(() => ({ w1: document.querySelector('[data-expense-category="w1"]').closest('tr').textContent, w2: document.querySelector('[data-expense-category="w2"]').closest('tr').textContent }));
  ck('w1 행에 "관리비 (건물 관리비)" 알약, w2 행에 "· 자동" 표시', pills.w1.includes('관리비 (건물 관리비)') && pills.w2.includes('관리비 (건물 관리비) · 자동'));
  // 5. 월별 출금 분류 합계 표
  await page.evaluate(() => document.getElementById('expenseMonthlyToggleBtn').click()); await page.waitForTimeout(400);
  const tbl = await page.evaluate(() => { const t = document.querySelector('.expense-monthly-table'); if (!t) return null; const heads = Array.from(t.querySelectorAll('thead th')).map(h => h.textContent); const row = Array.from(t.querySelectorAll('tbody tr')[0].querySelectorAll('td')).map(d => d.textContent); return { heads, row }; });
  console.log('TABLE', JSON.stringify(tbl));
  ck('월별 표 머리에 관리비·임차료 열이 따로 있다', !!tbl && tbl.heads.includes('관리비') && tbl.heads.includes('임차료'));
  const mi = tbl ? tbl.heads.indexOf('관리비') : -1, ri = tbl ? tbl.heads.indexOf('임차료') : -1;
  ck('10월 관리비 1,269,270 · 임차료 50,000', !!tbl && tbl.row[mi].replace(/[^0-9]/g, '') === '1269270' && tbl.row[ri].replace(/[^0-9]/g, '') === '50000');
  // 6. 필터 select 에 관리비 → 걸면 2행
  const hasOpt = await page.evaluate(() => Array.from(document.getElementById('expenseFilterSelect').options).some(o => o.value === 'edu_maintenance' && o.textContent.includes('관리비')));
  ck('출금 분류 필터에 관리비 선택지', hasOpt);
  await page.selectOption('#expenseFilterSelect', 'edu_maintenance'); await page.waitForTimeout(500);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-expense-category]')).map(e => e.getAttribute('data-expense-category')).sort());
  ck('관리비 필터 → 국민제이 2행만', rows.length === 2 && rows.join(',') === 'w1,w2');
  await page.selectOption('#expenseFilterSelect', 'all'); await page.waitForTimeout(500);
  // 7. 손으로 바꾸기: 코웨이 → 관리비, 다시 임차료
  await page.selectOption('[data-expense-category="w4"]', 'edu_maintenance'); await page.waitForTimeout(500);
  s = await st(); let w4b = s.transactions.find(t => t.id === 'w4');
  ck('select 변경 → edu_maintenance 저장(auto false)', w4b.expenseCategory === 'edu_maintenance' && w4b.expenseCategoryAuto === false);
  await page.selectOption('[data-expense-category="w4"]', 'edu_rental'); await page.waitForTimeout(500);
  s = await st(); w4b = s.transactions.find(t => t.id === 'w4');
  ck('다시 임차료로 되돌림', w4b.expenseCategory === 'edu_rental');
  ck('페이지 오류 없음', errors.length === 0);
  console.log(fail ? ('FAILED ' + fail) : 'ALL PASS');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
