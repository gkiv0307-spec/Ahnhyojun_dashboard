const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v90/';
const C = (o) => Object.assign({ basic: true, intermediate: false, regular: false, advanced: false, consulting: false, trial: false }, o || {});
const db = [
  { id: 'dA', name: '문의A', phone: '010-1111-0001', registeredDate: '2026-10-01', courses: C(), paymentStatus: null, memo: '' },
  { id: 'dB', name: '입금B', phone: '010-1111-0002', registeredDate: '2026-10-02', courses: C(), paymentStatus: '입금완료', memo: '' },
  { id: 'dC', name: '연동C', phone: '010-1111-0003', registeredDate: '2026-10-03', courses: C(), paymentStatus: null, linkedStudentId: 'sC' },
  { id: 'dD', name: '체험D', phone: '010-1111-0004', registeredDate: '2026-10-04', courses: C({ trial: true }), paymentStatus: null },
  { id: 'dE', name: '전환E', phone: '010-1111-0005', registeredDate: '2026-10-05', courses: C(), paymentStatus: null, leadStatus: '결제전환' },
  { id: 'dF', name: '거래F', phone: '010-1111-0006', registeredDate: '2026-10-06', courses: C(), paymentStatus: null, linkedStudentId: 'sF' },
  { id: 'dG', name: '보류G', phone: '010-1111-0007', registeredDate: '2026-10-07', courses: C(), paymentStatus: null, leadStatus: '보류' },
  { id: 'dH', name: '이관H', phone: '010-1111-0008', registeredDate: '2026-08-05', courses: C(), paymentStatus: null, linkedStudentId: 'idmsfchk2e48hg6f' },
  { id: 'dI', name: '미결제I', phone: '010-1111-0009', registeredDate: '2026-09-20', courses: C(), paymentStatus: null, linkedStudentId: 'sI' },
];
const students = [
  { id: 'sC', name: '연동C', level: '초급반', appliedDate: '2026-10-03', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: true, paidDate: '2026-10-03', installments: [], studentDbId: 'dC' },
  { id: 'sF', name: '거래F', level: '초급반', appliedDate: '2026-10-06', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: false, installments: [], studentDbId: 'dF' },
  { id: 'sI', name: '미결제I', level: '초급반', appliedDate: '2026-09-20', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: false, cardPayment: true, installments: [], studentDbId: 'dI' },
  { id: 'idmsfchk2e48hg6f', name: '이관H', level: '초급반', appliedDate: '2026-08-05', status: '등록완료', paymentType: '단발성', tuition: 0, paid: false, installments: [], studentDbId: 'dH' },
];
const transactions = [ { sig: '2026-10-06|거래F|330000|0|1', date: '2026-10-06', description: '거래F', deposit: 330000, withdrawal: 0, balance: 1, studentId: 'sF', category: 'tuition' } ];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(({ db, students, transactions }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students, auctions: [], loans: [], tasks: [], transactions, blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: db, loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { db, students, transactions });
  await page.goto('file://' + path + 'dashboard_v90.html');
  await page.waitForTimeout(1500);
  const nav = await page.$('[data-view="studentDb"], [data-rail-view="studentDb"], [data-goto="studentDb"]');
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(600);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-studentdb-course-filter]')).map(b => b.textContent));
  console.log('CHIPS', JSON.stringify(chips));
  const kpi = await page.evaluate(() => Array.from(document.querySelectorAll('.kpi-card')).map(c => c.textContent.replace(/\s+/g, ' ')).filter(t => t.includes('문의만')));
  console.log('KPI', JSON.stringify(kpi));
  ck('문의만 칩 = 2 (A·G) — 카드결제 예정 I 는 제외', chips.some(t => t.includes('문의만') && t.includes('(2)')));
  ck('KPI 카드 문의만 2명', kpi.length === 1 && /2/.test(kpi[0]));
  await page.evaluate(() => document.querySelector('[data-studentdb-course-filter="inquiry"]').click()); await page.waitForTimeout(400);
  const rows = async () => page.evaluate(() => Array.from(document.querySelectorAll('.data-table tbody tr td:nth-child(2) b')).map(e => e.textContent));
  const r1 = await rows(); console.log('ROWS', JSON.stringify(r1));
  ck('필터 → A·G 만, 최근 문의 순(G, A)', r1.join(',') === '보류G,문의A');
  const pills = await page.evaluate(() => Array.from(document.querySelectorAll('.data-table tbody .pill-warn, .data-table tbody .pill-neutral')).map(e => e.textContent));
  ck('알약 📞 문의만 2 + 📞 보류 1', pills.filter(t => t === '📞 문의만').length === 1 && pills.filter(t => t === '📞 보류').length === 1);
  const copyLabel = await page.evaluate(() => document.getElementById('studentDbCopyContacts').textContent);
  ck('복사 버튼 (2)', copyLabel.includes('(2)'));
  await page.evaluate(() => document.getElementById('studentDbCopyContacts').click()); await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log('CLIP', JSON.stringify(clip));
  ck('클립보드 3줄(헤더+2) · 탭 구분 · 전화번호 포함', clip.split('\n').length === 3 && clip.includes('010-1111-0001\t') && clip.includes('보류G\t010-1111-0007'));
  await page.screenshot({ path: path + 'e2e_v90_inquiry.png' });
  await page.evaluate(() => document.querySelector('[data-studentdb-toggle="dA"]').click()); await page.waitForTimeout(400);
  const hasSel = await page.evaluate(() => !!document.querySelector('select[data-inline-select="leadStatus"][data-id="dA"]'));
  ck('상세 행에 분류 select', hasSel);
  await page.selectOption('select[data-inline-select="leadStatus"][data-id="dA"]', '결제전환'); await page.waitForTimeout(500);
  const chips2 = await page.evaluate(() => Array.from(document.querySelectorAll('[data-studentdb-course-filter]')).map(b => b.textContent));
  ck('A 결제전환 → 문의만 1', chips2.some(t => t.includes('문의만') && t.includes('(1)')));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')).studentDb.find(x => x.id === 'dA').leadStatus);
  ck('leadStatus 저장됨', saved === '결제전환');
  await page.evaluate(() => document.querySelector('[data-studentdb-course-filter="all"]').click()); await page.waitForTimeout(300);
  const all = await rows(); ck('전체 → 9명', all.length === 9);
  await page.screenshot({ path: path + 'e2e_v90_all.png' });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
