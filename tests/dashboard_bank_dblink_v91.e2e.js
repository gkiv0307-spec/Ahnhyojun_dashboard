const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v91/';
const file = process.env.DASH_FILE || 'dashboard_v91.html';
const C = (o) => Object.assign({ basic: true, intermediate: false, regular: false, advanced: false, consulting: false, trial: false }, o || {});
const db = [
  { id: 'dX', name: '이수경', phone: '010-3333-0001', registeredDate: '2026-08-24', courses: C({ basic: false, intermediate: true }), paymentStatus: null, memo: '' },
  { id: 'dL', name: '연동L', phone: '010-3333-0002', registeredDate: '2026-09-01', courses: C(), paymentStatus: '입금완료', linkedStudentId: 'sL' },
  { id: 'dM', name: '카드M', phone: '010-3333-0003', registeredDate: '2026-10-12', courses: C(), paymentStatus: null, amount: 330000 },
  { id: 'dN', name: '카드N', phone: '010-3333-0004', registeredDate: '2026-10-12', courses: C(), paymentStatus: null },
  { id: 'dZ', name: '', phone: '010-3333-0005', registeredDate: '2026-10-12', courses: C(), paymentStatus: null },
];
const students = [
  { id: 'sL', name: '연동L', level: '초급반', appliedDate: '2026-09-01', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: true, paidDate: '2026-09-01', installments: [], studentDbId: 'dL' },
];
const transactions = [
  { id: 't1', sig: '2026-10-13|이수경|440000|0|5091206', date: '2026-10-13', description: '이수경', deposit: 440000, withdrawal: 0, balance: 5091206, studentId: null, category: null },
  { id: 't2', sig: '2026-10-14|삼성20317813|657360|0|6407576', date: '2026-10-14', description: '삼성20317813', deposit: 657360, withdrawal: 0, balance: 6407576, studentId: null, category: null },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.addInitScript(({ db, students, transactions }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students, auctions: [], loans: [], tasks: [], transactions, blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: db, loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { db, students, transactions });
  await page.goto('file://' + path + file);
  await page.waitForTimeout(1500);
  const nav = await page.$('[data-view="bank"], [data-rail-view="bank"], [data-goto="bank"]');
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(700);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  // 1. 미확정 입금 행에 DB 전용 후보가 뜨고, 적요 이름이 맞으면 추천(DB)
  const row1 = await page.evaluate(() => { const sel = document.querySelector('[data-link-select="t1"]'); const list = document.querySelector('[data-single-list="t1"]'); return { selVal: sel && sel.value, opts: sel ? Array.from(sel.options).map(o => o.value) : [], items: list ? Array.from(list.querySelectorAll('[data-single-pick]')).map(d => d.getAttribute('data-value')) : [], pill: (sel && sel.closest('td') ? sel.closest('td').textContent : '') , search: (document.querySelector('[data-single-search="t1"]') || {}).value }; });
  console.log('ROW1', JSON.stringify(row1).slice(0, 400));
  ck('DB 전용 항목이 후보에 있음 (db::dX, db::dM, db::dN)', ['db::dX', 'db::dM', 'db::dN'].every(v => row1.items.includes(v) && row1.opts.includes(v)));
  ck('이미 연동된 DB(dL)·이름 없는 DB(dZ)는 후보에 없음', !row1.items.includes('db::dL') && !row1.items.includes('db::dZ'));
  ck('적요 "이수경" → 추천(DB) 표시 + select 기본값 db::dX', row1.selVal === 'db::dX' && row1.pill.includes('추천(DB): 이수경') && row1.search === '이수경');
  // 검색 필터
  await page.focus('[data-single-search="t2"]'); await page.fill('[data-single-search="t2"]', '카드'); await page.waitForTimeout(200);
  const vis = await page.evaluate(() => Array.from(document.querySelectorAll('[data-single-list="t2"] [data-single-pick]')).map(d => d.getAttribute('data-value') + ':' + d.style.display));
  console.log('VIS', JSON.stringify(vis));
  ck('검색 "카드" → DB 후보 카드M·카드N 만 표시', vis.includes('db::dM:block') && vis.includes('db::dN:block') && vis.includes('db::dX:none') && vis.includes('sL:::none'));
  // 2. 단건 확정 → 자동 등록 + 연결
  await page.evaluate(() => document.querySelector('[data-confirm-select="t1"]').click()); await page.waitForTimeout(600);
  let s = await st();
  const nu = s.students.find(x => x.name === '이수경');
  const dX = s.studentDb.find(x => x.id === 'dX'); const t1 = s.transactions.find(x => x.id === 't1');
  console.log('NEW', JSON.stringify(nu), '| dX', JSON.stringify({ l: dX.linkedStudentId, p: dX.paymentStatus, d: dX.paymentDate, a: dX.amount }), '| t1', JSON.stringify({ sid: t1.studentId, cat: t1.category }));
  ck('수강생 레코드 자동 생성 (중급반 · 수강료 440,000 · 결제완료 10/13 · DB 연동)', !!nu && nu.level === '중급반' && nu.tuition === 440000 && nu.paid === true && nu.paidDate === '2026-10-13' && nu.studentDbId === 'dX' && nu.appliedDate === '2026-08-24');
  ck('DB 항목 연동·입금완료 표시', dX.linkedStudentId === (nu && nu.id) && dX.paymentStatus === '입금완료' && dX.paymentDate === '2026-10-13' && dX.amount === 440000);
  ck('입금 건이 새 수강생에게 tuition 으로 연결', t1.studentId === (nu && nu.id) && t1.category === 'tuition');
  const row1after = await page.evaluate(() => document.querySelector('[data-unlink-tx="t1"]') ? document.querySelector('[data-unlink-tx="t1"]').closest('td').textContent : '');
  ck('행이 "수강료 확정 → 이수경" 으로 바뀜', row1after.includes('수강료 확정') && row1after.includes('이수경'));
  ck('확정 후 DB 후보 목록에서 이수경 사라짐', !(await page.evaluate(() => !!document.querySelector('[data-single-list="t2"] [data-value="db::dX"]'))));
  // 3. 여러 명 확정에서 DB 전용 2명 체크 → 둘 다 자동 등록
  await page.evaluate(() => { const d = document.querySelector('[data-multi-details="t2"]'); d.open = true; });
  await page.evaluate(() => { document.querySelector('[data-multi-select="t2"][value="db::dM"]').click(); document.querySelector('[data-multi-select="t2"][value="db::dN"]').click(); });
  await page.evaluate(() => document.querySelector('[data-confirm-multi="t2"]').click()); await page.waitForTimeout(600);
  s = await st();
  const m = s.students.find(x => x.name === '카드M'), n = s.students.find(x => x.name === '카드N'); const t2 = s.transactions.find(x => x.id === 't2');
  console.log('MULTI', JSON.stringify({ m: m && { t: m.tuition, p: m.paid, l: m.level }, n: n && { t: n.tuition, p: n.paid }, links: t2.studentLinks, cat: t2.category }));
  ck('여러 명 확정: 카드M(DB 금액 330,000)·카드N(0) 수강생 자동 생성 + paid', !!m && !!n && m.tuition === 330000 && n.tuition === 0 && m.paid === true && n.paid === true && m.level === '초급반');
  ck('t2.studentLinks 2명 · tuition', t2.category === 'tuition' && Array.isArray(t2.studentLinks) && t2.studentLinks.length === 2 && t2.studentLinks.every(l => [m.id, n.id].includes(l.studentId)));
  ck('DB dM·dN 연동됨', s.studentDb.find(x => x.id === 'dM').linkedStudentId === m.id && s.studentDb.find(x => x.id === 'dN').linkedStudentId === n.id);
  // 4. 해제하면 수강생 레코드는 남고 paid 만 되돌아감(기존 동작 유지)
  await page.evaluate(() => document.querySelector('[data-unlink-tx="t1"]').click()); await page.waitForTimeout(500);
  s = await st();
  const nu2 = s.students.find(x => x.name === '이수경');
  const backInList = await page.evaluate((id) => !!document.querySelector('[data-single-list="t1"] [data-value="' + id + '::"]'), nu2 ? nu2.id : 'none');
  ck('해제 후 수강생 레코드 유지 · paid false · 다시 후보(일반 수강생)로 등장', !!nu2 && nu2.paid === false && backInList);
  ck('페이지 오류 없음', errors.length === 0);
  await page.screenshot({ path: path + 'e2e_v91_dblink.png', fullPage: false });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
