// v92 미확정 입금 수강생 선택 목록 — 지연 렌더링·검색 성능·선택 유지 확인
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v92/';
const file = process.env.DASH_FILE || 'dashboard_v92.html';
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
  { id: 'sH', name: '홍길동', level: '중급반', appliedDate: '2026-10-12', status: '등록완료', paymentType: '단발성', tuition: 450000, paid: false, installments: [] },
];
// 실제 규모 흉내: 수강생 300 + DB 전용 150
for (let i = 0; i < 300; i++) students.push({ id: 'bulk' + i, name: '학생' + String(i).padStart(3, '0'), level: '초급반', appliedDate: '2026-08-05', status: '등록완료', paymentType: '단발성', tuition: 330000, paid: i % 3 !== 0, installments: [] });
for (let i = 0; i < 150; i++) db.push({ id: 'dbb' + i, name: '문의' + String(i).padStart(3, '0'), phone: '010-0000-' + String(i).padStart(4, '0'), registeredDate: '2026-09-10', courses: C(), paymentStatus: null });
const transactions = [
  { id: 't1', sig: '2026-10-13|이수경|440000|0|5091206', date: '2026-10-13', description: '이수경', deposit: 440000, withdrawal: 0, balance: 5091206, studentId: null, category: null },
  { id: 't2', sig: '2026-10-14|삼성20317813|657360|0|6407576', date: '2026-10-14', description: '삼성20317813', deposit: 657360, withdrawal: 0, balance: 6407576, studentId: null, category: null },
];
for (let i = 0; i < 8; i++) transactions.push({ id: 'tc' + i, sig: '2026-10-14|카드정산' + i + '|' + (300000 + i) + '|0|1', date: '2026-10-14', description: '카드정산' + i, deposit: 300000 + i, withdrawal: 0, balance: 1, studentId: null, category: null });
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
  const t0 = Date.now();
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(700);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  // 1. 처음 그릴 때 목록 비어 있음(지연 렌더링) · 행 수 10
  const init = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-single-search]').length, items: document.querySelectorAll('[data-single-pick]').length, multi: document.querySelectorAll('[data-multi-select]').length, total: document.querySelectorAll('.single-select-item,.multi-select-item').length, sel1: (document.querySelector('[data-link-select="t1"]') || {}).value, pill1: document.querySelector('[data-link-select="t1"]').closest('td').textContent }));
  console.log('INIT', JSON.stringify(init));
  ck('미확정 10행 모두 목록 노드 0개로 시작(지연 렌더링)', init.rows === 10 && init.items === 0 && init.multi === 0 && init.total === 0);
  ck('적요 "이수경" → 추천(DB) + 숨은 값 db::dX 유지', init.sel1 === 'db::dX' && init.pill1.includes('추천(DB): 이수경'));
  // 2. 포커스 → 최대 40명 + "외 N명"
  await page.focus('[data-single-search="t2"]'); await page.waitForTimeout(100);
  const f = await page.evaluate(() => { const l = document.querySelector('[data-single-list="t2"]'); return { n: l.querySelectorAll('[data-single-pick]').length, note: l.textContent.includes('외 '), disp: l.style.display }; });
  console.log('FOCUS', JSON.stringify(f));
  ck('포커스 시 40명만 그리고 "… 외 N명" 안내', f.n === 40 && f.note && f.disp === 'block');
  // 3. 검색 "카드" → DB 후보 2명만(디바운스 후)
  await page.fill('[data-single-search="t2"]', '카드'); await page.waitForTimeout(250);
  const vis = await page.evaluate(() => Array.from(document.querySelectorAll('[data-single-list="t2"] [data-single-pick]')).map(d => d.getAttribute('data-value')));
  console.log('VIS', JSON.stringify(vis));
  ck('검색 "카드" → 카드M·카드N 만 (다른 노드는 그리지 않음)', vis.length === 2 && vis.includes('db::dM') && vis.includes('db::dN'));
  // 4. 입력 반응 시간: 글자마다 input 이벤트 → 핸들러 처리 시간(동기 부분) 측정
  const lat = await page.evaluate(async () => {
    const inp = document.querySelector('[data-single-search="t2"]');
    const times = [];
    for (const q of ['학', '학생', '학생0', '학생01', '학생012', '']) {
      const s = performance.now(); inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true })); times.push(performance.now() - s);
      await new Promise(r => setTimeout(r, 160));
    }
    const s2 = performance.now(); inp.dispatchEvent(new Event('focus')); const render = performance.now() - s2;
    return { maxInput: Math.max(...times), render };
  });
  console.log('LATENCY', JSON.stringify(lat));
  ck('키 입력 핸들러 5ms 미만(디바운스) · 목록 재생성 50ms 미만', lat.maxInput < 5 && lat.render < 50);
  // 5. 항목 클릭(mousedown 위임) → 숨은 값·입력칸 갱신
  await page.fill('[data-single-search="t2"]', '홍길'); await page.waitForTimeout(250);
  await page.evaluate(() => { const it = document.querySelector('[data-single-list="t2"] [data-value="sH::"]'); it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  const picked = await page.evaluate(() => ({ v: document.querySelector('[data-link-select="t2"]').value, n: document.querySelector('[data-single-search="t2"]').value, pn: document.querySelector('[data-single-search="t2"]').getAttribute('data-picked-name') }));
  ck('목록 항목 선택 → 값 sH:: · 입력칸 "홍길동"', picked.v === 'sH::' && picked.n === '홍길동' && picked.pn === '홍길동');
  // 6. 단건 확정(DB 추천) → 자동 등록 (v91 동작 유지)
  await page.evaluate(() => document.querySelector('[data-confirm-select="t1"]').click()); await page.waitForTimeout(700);
  let s = await st();
  const nu = s.students.find(x => x.name === '이수경'); const t1 = s.transactions.find(x => x.id === 't1');
  ck('v91 유지: 이수경 자동 등록(중급반 · 440,000 · paid) + t1 연결', !!nu && nu.level === '중급반' && nu.tuition === 440000 && nu.paid === true && t1.studentId === nu.id && t1.category === 'tuition');
  // 7. 여러 명: 펼치면 목록 렌더(≤40) + 요약
  await page.evaluate(() => { document.querySelector('[data-multi-details="t2"]').open = true; }); await page.waitForTimeout(150);
  const m0 = await page.evaluate(() => { const l = document.querySelector('[data-multi-list="t2"]'); return { n: l.querySelectorAll('[data-multi-select]').length, note: l.textContent.includes('외 '), sum: document.querySelector('[data-multi-summary="t2"]').textContent }; });
  console.log('MULTI0', JSON.stringify(m0));
  ck('펼치면 40명 + "외 N명" · 요약 "선택한 인원 없음"', m0.n === 40 && m0.note && m0.sum.includes('선택한 인원 없음'));
  // 8. 검색 → 체크 → 다른 검색 → 체크 → 선택 유지·요약 2명
  await page.fill('[data-multi-search="t2"]', '카드'); await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('[data-multi-list="t2"] [data-multi-select][value="db::dM"]').click());
  await page.fill('[data-multi-search="t2"]', '학생00'); await page.waitForTimeout(250);
  const m1 = await page.evaluate(() => Array.from(document.querySelectorAll('[data-multi-list="t2"] [data-multi-select]')).map(c => c.value));
  console.log('M1', JSON.stringify(m1));
  await page.evaluate(() => document.querySelector('[data-multi-list="t2"] [data-multi-select][value="bulk1::"]').click());
  const m2 = await page.evaluate(() => ({ sum: document.querySelector('[data-multi-summary="t2"]').textContent, sumBoxes: Array.from(document.querySelectorAll('[data-multi-summary="t2"] [data-multi-select]')).map(c => c.value) }));
  console.log('M2', JSON.stringify(m2));
  ck('검색을 바꿔도 선택 유지: 요약 "선택 2명" 카드M·학생001', m2.sum.includes('선택 2명') && m2.sumBoxes.includes('db::dM') && m2.sumBoxes.includes('bulk1::') && m1.length === 10);
  // 9. 요약에서 체크 해제 → pending 에서 빠짐
  await page.evaluate(() => document.querySelector('[data-multi-summary="t2"] [data-multi-select][value="bulk1::"]').click());
  const m3 = await page.evaluate(() => ({ sum: document.querySelector('[data-multi-summary="t2"]').textContent, listBox: document.querySelector('[data-multi-list="t2"] [data-multi-select][value="bulk1::"]').checked }));
  ck('요약에서 해제 → 선택 1명 · 목록 체크도 해제', m3.sum.includes('선택 1명') && m3.listBox === false);
  // 10. 검색이 걸린 상태(목록에 카드M 없음)에서 확정 → pending 기준 1명 확정 + 자동 등록
  await page.evaluate(() => document.querySelector('[data-multi-list="t2"] [data-multi-select][value="db::dN"]') || null);
  await page.fill('[data-multi-search="t2"]', '카드N'); await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('[data-multi-list="t2"] [data-multi-select][value="db::dN"]').click());
  await page.fill('[data-multi-search="t2"]', '없는이름'); await page.waitForTimeout(250);
  const none = await page.evaluate(() => ({ n: document.querySelectorAll('[data-multi-list="t2"] [data-multi-select]').length, txt: document.querySelector('[data-multi-list="t2"]').textContent }));
  ck('검색 결과 없음 표시', none.n === 0 && none.txt.includes('검색 결과 없음'));
  await page.evaluate(() => document.querySelector('[data-confirm-multi="t2"]').click()); await page.waitForTimeout(700);
  s = await st();
  const t2 = s.transactions.find(x => x.id === 't2'); const m = s.students.find(x => x.name === '카드M'), n = s.students.find(x => x.name === '카드N');
  console.log('CONFIRM', JSON.stringify({ links: t2.studentLinks, cat: t2.category, m: !!m, n: !!n }));
  ck('목록에 안 보여도 선택 2명(카드M·카드N) 확정 · 자동 등록', t2.category === 'tuition' && t2.studentLinks && t2.studentLinks.length === 2 && !!m && !!n && m.paid && n.paid);
  // 11. "+ 추가" 뒤 render 후에도 details 열림 + 새 사람 체크됨(펼침 상태에서 즉시 렌더)
  await page.evaluate(() => { document.querySelector('[data-multi-details="tc0"]').open = true; }); await page.waitForTimeout(150);
  await page.fill('[data-multi-new-student-name="tc0"]', '신규Q');
  await page.evaluate(() => document.querySelector('[data-multi-add-student="tc0"]').click()); await page.waitForTimeout(700);
  const added = await page.evaluate(() => { const d = document.querySelector('[data-multi-details="tc0"]'); const cb = d.querySelector('[data-multi-list="tc0"] [data-multi-select]:checked'); return { open: d.open, checked: cb ? cb.closest('label').textContent.trim() : null, sum: document.querySelector('[data-multi-summary="tc0"]').textContent }; });
  console.log('ADDED', JSON.stringify(added));
  ck('+ 추가 → 다시 그려도 펼침 유지 · 신규Q 체크 · 요약 1명', added.open && added.checked && added.checked.includes('신규Q') && added.sum.includes('선택 1명'));
  // 12. 해제 → 후보로 복귀(포커스 후 검색)
  await page.evaluate(() => document.querySelector('[data-unlink-tx="t1"]').click()); await page.waitForTimeout(500);
  await page.focus('[data-single-search="tc1"]'); await page.fill('[data-single-search="tc1"]', '이수경'); await page.waitForTimeout(250);
  s = await st(); const nu2 = s.students.find(x => x.name === '이수경');
  const back = await page.evaluate((id) => !!document.querySelector('[data-single-list="tc1"] [data-value="' + id + '::"]'), nu2 ? nu2.id : 'none');
  ck('해제 후 수강생 레코드 유지 · paid false · 검색에 다시 등장', !!nu2 && nu2.paid === false && back);
  ck('페이지 오류 없음', errors.length === 0);
  console.log('bank render ms(참고)', Date.now() - t0);
  await page.screenshot({ path: path + 'e2e_v92_picker.png', fullPage: false });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
