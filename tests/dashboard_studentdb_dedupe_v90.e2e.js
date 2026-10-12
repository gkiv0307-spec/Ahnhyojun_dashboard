const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v90/';
const C = (o) => Object.assign({ basic: true, intermediate: false, regular: false, advanced: false, consulting: false, trial: false }, o || {});
const db = [
  { id: 'dP1', name: '중복P', phone: '010-3333-0001', registeredDate: '2026-09-01', courses: C(), paymentStatus: null, memo: '첫번째', linkedStudentId: 'sP1' },
  { id: 'dP2', name: '중복P', phone: '010-3333-0001', registeredDate: '2026-09-05', courses: C({ intermediate: true }), paymentStatus: '입금완료', memo: '두번째', linkedStudentId: 'sP2', classTime: '10시' },
  { id: 'dN1', name: '동명', phone: '010-3333-0002', registeredDate: '2026-08-01', courses: C(), paymentStatus: '입금완료' },
  { id: 'dN2', name: '동명', phone: '010-3333-0003', registeredDate: '2026-08-02', courses: C(), paymentStatus: null },
  { id: 'dB', name: '이관B', phone: '010-3333-0004', registeredDate: null, courses: C(), paymentStatus: null, linkedStudentId: 'idmsfchk2e48hg6f' },
  { id: 'dB2', name: '이관B', phone: '010-3333-0004', registeredDate: null, courses: C(), paymentStatus: null, memo: '메타광고', linkedStudentId: 'sB2' },
  { id: 'dT', name: '체험T', phone: '010-3333-0005', registeredDate: '2026-10-01', courses: C({ trial: true }), paymentStatus: null },
  { id: 'dQ', name: '문의Q', phone: '010-3333-0006', registeredDate: '2026-10-02', courses: C(), paymentStatus: null },
];
const students = [
  { id: 'sP1', name: '중복P', level: '초급반', appliedDate: '2026-09-01', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: false, installments: [], studentDbId: 'dP1' },
  { id: 'sP2', name: '중복P', level: '중급반', appliedDate: '2026-09-05', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: true, paidDate: '2026-09-05', installments: [], studentDbId: 'dP2' },
  { id: 'idmsfchk2e48hg6f', name: '이관B', level: '초급반', appliedDate: '2026-08-05', status: '등록완료', paymentType: '단발성', tuition: 0, paid: false, installments: [], studentDbId: 'dB' },
  { id: 'sB2', name: '이관B', level: '초급반', appliedDate: '2026-08-05', status: '등록완료', paymentType: '단발성', tuition: 0, paid: false, installments: [], studentDbId: 'dB2' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(({ db, students }) => {
    window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students, auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: db, loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { db, students });
  await page.goto('file://' + path + 'dashboard_v90.html');
  await page.waitForTimeout(1500);
  const nav = await page.$('[data-view="studentDb"], [data-rail-view="studentDb"], [data-goto="studentDb"]');
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(600);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const head = await page.evaluate(() => document.querySelector('#studentDbDupCard h3').textContent.replace(/\s+/g, ' '));
  console.log('HEAD', head);
  ck('중복 카드: 3묶음 · 같은 번호 2 · 같은 이름 1', head.includes('3묶음') && head.includes('같은 번호 2') && head.includes('같은 이름 1'));
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-studentdb-course-filter]')).map(b => b.textContent));
  console.log('CHIPS', JSON.stringify(chips));
  ck('✅ 결제확인 칩 = 3 (P2·N1·이관B)', chips.some(t => t.includes('결제확인') && t.includes('(3)')));
  ck('📞 문의·미결제 = 4 (P1·N2·B2·Q)', chips.some(t => t.includes('문의·미결제') && t.includes('(4)')));
  await page.evaluate(() => document.getElementById('studentDbDupToggle').click()); await page.waitForTimeout(400);
  const groups = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dup-group]')).map(g => g.getAttribute('data-dup-group')));
  console.log('GROUPS', JSON.stringify(groups));
  ck('묶음 키 p01033330001 · p01033330004 · n동명', groups.includes('p01033330001') && groups.includes('p01033330004') && groups.includes('n동명'));
  const defKeep = await page.evaluate(() => document.querySelector('[data-dup-group="p01033330001"] input[data-dup-keep]:checked').value);
  ck('기본 남길 항목 = 결제완료 연동된 dP2', defKeep === 'dP2');
  await page.evaluate(() => document.querySelector('[data-dup-merge="p01033330001"]').click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('confirmOkBtn').click()); await page.waitForTimeout(500);
  const after = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')); return { db: s.studentDb.map(x => x.id), keep: s.studentDb.find(x => x.id === 'dP2'), students: s.students.map(x => x.id + ':' + x.studentDbId), log: s.meta.studentDbMergeLog }; });
  console.log('AFTER', JSON.stringify(after));
  ck('dP1 삭제·dP2 유지', !after.db.includes('dP1') && after.db.includes('dP2'));
  ck('메모 합침 · 수강과정 OR · 분류 유지', after.keep.memo.includes('두번째') && after.keep.memo.includes('첫번째') && after.keep.memo.includes('합침') && after.keep.courses.basic && after.keep.courses.intermediate);
  ck('미입금 빈 수강생 sP1 삭제, sP2 유지', !after.students.some(x => x.startsWith('sP1:')) && after.students.includes('sP2:dP2'));
  ck('병합 로그 1건', Array.isArray(after.log) && after.log.length === 1 && after.log[0].keepId === 'dP2');
  // 이관 묶음: 과거 데이터도 합침. 둘 다 미입금·빈 기록 → 기본 keep 은 메모 있는 dB2
  const keepB = await page.evaluate(() => document.querySelector('[data-dup-group="p01033330004"] input[data-dup-keep]:checked').value);
  ck('이관 묶음 기본 남길 항목 = 이관 학생에 연결된 dB(결제확인 취급)', keepB === 'dB');
  await page.evaluate(() => { document.querySelector('[data-dup-group="p01033330004"] input[value="dB"]').click(); });
  await page.evaluate(() => document.querySelector('[data-dup-merge="p01033330004"]').click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('confirmOkBtn').click()); await page.waitForTimeout(500);
  const afterB = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')); return { db: s.studentDb.map(x => x.id), keep: s.studentDb.find(x => x.id === 'dB'), students: s.students.map(x => x.id) }; });
  console.log('AFTERB', JSON.stringify(afterB));
  ck('이관 묶음: dB2 삭제, 빈 수강생 sB2 삭제, 이관 학생 유지, 메모 이어붙임', !afterB.db.includes('dB2') && !afterB.students.includes('sB2') && afterB.students.includes('idmsfchk2e48hg6f') && afterB.keep.memo.includes('메타광고'));
  // 이름 묶음 숨기기
  await page.evaluate(() => document.querySelector('[data-dup-ignore="n동명"]').click()); await page.waitForTimeout(400);
  const head2 = await page.evaluate(() => document.querySelector('#studentDbDupCard h3').textContent.replace(/\s+/g, ' '));
  console.log('HEAD2', head2);
  ck('숨긴 뒤 0묶음 + 숨긴 묶음 1개 다시 보기', head2.includes('0묶음') && head2.includes('숨긴 묶음 1개'));
  const ig = await page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')).meta.studentDbDupIgnore);
  ck('meta.studentDbDupIgnore 저장', ig && ig['n동명'] === true);
  await page.evaluate(() => document.getElementById('studentDbDupUnignore').click()); await page.waitForTimeout(400);
  const head3 = await page.evaluate(() => document.querySelector('#studentDbDupCard h3').textContent.replace(/\s+/g, ' '));
  ck('다시 보기 → 1묶음', head3.includes('1묶음'));
  const total = await page.evaluate(() => Array.from(document.querySelectorAll('[data-studentdb-course-filter]')).map(b => b.textContent)[0]);
  ck('전체 6명 (8 → 2건 합침)', total.includes('(6)'));
  await page.screenshot({ path: path + 'e2e_v90_dup.png', fullPage: false });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
