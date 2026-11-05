// v105 지출 분류 "시설장치 (인테리어 공사대금)" edu_facility + 기장료 라벨 + 아파트투자반 확인
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v105/';
const file = process.env.DASH_FILE || 'dashboard_v105.html';
const transactions = [
  { id: 'f1', sig: '2026-02-02|아이희성이엔씨(최규|0|4000000|3000000', date: '2026-02-02', description: '아이희성이엔씨(최규', deposit: 0, withdrawal: 4000000, balance: 3000000, studentId: null, category: '', expenseCategory: 'edu_facility', expenseCategoryAuto: false },
  { id: 'f2', sig: '2026-02-09|아이희성이엔씨(최규|0|500000|2500000', date: '2026-02-09', description: '아이희성이엔씨(최규', deposit: 0, withdrawal: 500000, balance: 2500000, studentId: null, category: '' },
  { id: 't1', sig: '2026-01-22|아이정미화|0|413240|2005660', date: '2026-01-22', description: '아이정미화', deposit: 0, withdrawal: 413240, balance: 2005660, studentId: null, category: '', expenseCategory: 'edu_tax_accountant', expenseCategoryAuto: false },
  { id: 'w4', sig: '2026-02-07|코웨이렌탈05|0|30000|6920000', date: '2026-02-07', description: '코웨이렌탈05', deposit: 0, withdrawal: 30000, balance: 6920000, studentId: null, category: '' },
];
const students = [{ id: 'stuA', name: '테스트A', level: '아파트투자반', appliedDate: '2026-10-31', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: true, paidDate: '2026-10-31', taxInvoice: false, monthlyAmount: 0, installments: [], memo: '', studentDbId: null }];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.addInitScript(({ transactions, students }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students, auctions: [], loans: [], tasks: [], transactions, blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { transactions, students });
  await page.goto('file://' + path + file); await page.waitForTimeout(1500);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  const nav = await page.$('[data-view="bank"], [data-rail-view="bank"], [data-goto="bank"]'); await page.evaluate(el => el.click(), nav); await page.waitForTimeout(700);
  const consts = await page.evaluate(() => { const el = document.querySelector('[data-expense-category="t1"]'); return el ? Array.from(el.options).filter(o => o.value).map(o => ({ v: o.value, t: o.textContent })) : null; });
  ck('선택지에 edu_facility 가 edu_maintenance 바로 뒤', !!consts && consts.findIndex(o => o.v === 'edu_facility') === consts.findIndex(o => o.v === 'edu_maintenance') + 1);
  ck('라벨: 시설장치 (인테리어 공사대금)', !!consts && consts.some(o => o.v === 'edu_facility' && o.t === '시설장치 (인테리어 공사대금)'));
  ck('라벨: 지급수수료 (세무사·법무사 기장료)', !!consts && consts.some(o => o.v === 'edu_tax_accountant' && o.t === '지급수수료 (세무사·법무사 기장료)'));
  ck('선택지 라벨 undefined 없음(21종)', !!consts && consts.length === 21 && consts.every(o => o.t && o.t !== 'undefined'));
  let s = await st();
  ck('같은 적요(아이희성이엔씨) 미분류 → edu_facility 자동', s.transactions.find(t => t.id === 'f2').expenseCategory === 'edu_facility' && s.transactions.find(t => t.id === 'f2').expenseCategoryAuto === true);
  ck('코웨이는 미분류 유지', !s.transactions.find(t => t.id === 'w4').expenseCategory);
  const pills = await page.evaluate(() => document.querySelector('[data-expense-category="f1"]').closest('tr').textContent);
  ck('행 알약 시설장치', pills.includes('시설장치 (인테리어 공사대금)'));
  await page.evaluate(() => document.getElementById('expenseMonthlyToggleBtn').click()); await page.waitForTimeout(400);
  const tbl = await page.evaluate(() => { const t = document.querySelector('.expense-monthly-table'); if (!t) return null; const heads = Array.from(t.querySelectorAll('thead th')).map(h => h.textContent); const rows = Array.from(t.querySelectorAll('tbody tr')).map(r => Array.from(r.querySelectorAll('td')).map(d => d.textContent)); return { heads, rows }; });
  ck('월별 표에 시설장치 열', !!tbl && tbl.heads.includes('시설장치'));
  const fi = tbl ? tbl.heads.indexOf('시설장치') : -1; const feb = tbl ? tbl.rows.find(r => r[0].includes('2026-02') || r[0].includes('2월')) : null;
  ck('2월 시설장치 4,500,000', !!feb && feb[fi].replace(/[^0-9]/g, '') === '4500000');
  await page.selectOption('#expenseFilterSelect', 'edu_facility'); await page.waitForTimeout(500);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-expense-category]')).map(e => e.getAttribute('data-expense-category')).sort());
  ck('시설장치 필터 → f1,f2', rows.join(',') === 'f1,f2');
  await page.selectOption('#expenseFilterSelect', 'all'); await page.waitForTimeout(300);
  // 수강생 탭: 아파트투자반 level select
  await page.goto('file://' + path + file); await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelector('[data-goto="students"]').click(); }); await page.waitForTimeout(900);
  console.log('VIEW has 반별 인원:', await page.evaluate(() => document.body.textContent.includes('반별 인원')));
  const body = await page.evaluate(() => document.body.textContent);
  ck('수강생 화면에 아파트투자반 표시', body.includes('아파트투자반'));
  const lvOpts = await page.evaluate(() => Array.from(document.querySelectorAll('select')).map(s => Array.from(s.options).map(o => o.value)).filter(a => a.includes('낙찰반')));
  console.log('LEVEL SELECTS', JSON.stringify(lvOpts));
  ck('반(STUDENT_LEVELS) select 가 있으면 전부 아파트투자반 포함', lvOpts.every(a => a.includes('아파트투자반')));
  const dist = await page.evaluate(() => { const h = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('반별 인원')); return h ? h.parentElement.textContent.replace(/\s+/g, '') : ''; });
  console.log('DIST', JSON.stringify(dist.slice(0,200)), 'toggle:', await page.evaluate(() => !!document.querySelector('[data-student-toggle="stuA"]')), 'view:', await page.evaluate(() => (document.querySelector('.main') || document.body).textContent.replace(/\s+/g,' ').slice(0,160)));
  ck('반별 인원 카드에 아파트투자반 1명', dist.includes('아파트투자반1'));
  await page.evaluate(() => { const b = document.querySelector('[data-student-toggle="stuA"]'); if (b) b.click(); }); await page.waitForTimeout(700);
  const lv2 = await page.evaluate(() => Array.from(document.querySelectorAll('select')).map(s => Array.from(s.options).map(o => o.value)).filter(a => a.includes('낙찰반')));
  console.log('LEVEL SELECTS after expand', JSON.stringify(lv2));
  ck('수강생 상세 반 select 에 아파트투자반(선택됨)', lv2.length > 0 && lv2.every(a => a.includes('아파트투자반')));
  ck('pageerror 없음', errors.length === 0);
  console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); await browser.close(); process.exit(fail ? 1 : 0);
})();
