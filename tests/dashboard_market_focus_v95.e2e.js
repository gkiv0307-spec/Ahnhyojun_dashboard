const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v95/';
const file = process.env.DASH_FILE || 'dashboard_v95.html';
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mk = (id, o) => Object.assign({ id, date: day(-3), caseNumber: '2026타경' + id, court: '대구지방법원', region: '대구 수성구', propertyType: '아파트', buildingName: '단지' + id, address: '대구 수성구 ' + id, appraisalValue: 300000000, minSalePrice: 300000000, saleDate: day(10), failCount: 0, status: '조사중', winningBid: 0, analysisWritten: false, memo: '', isStar: false }, o);
const cards = [
  mk('A', { failCount: 1 }),                                  // 보임: 유찰 아파트 10일
  mk('B', { failCount: 0 }),                                  // 숨김: 신건 아파트
  mk('C', { failCount: 0, isStar: true }),                    // 보임: ⭐ 신건
  mk('D', { failCount: 1, saleDate: day(30) }),               // 숨김: 30일 뒤
  mk('E', { failCount: 1, propertyType: '오피스텔' }),          // 숨김: 아파트 아님
  mk('F', { failCount: 1, isStar: true, saleDate: day(25) }), // 숨김: ⭐라도 3주 밖
  mk('G', { failCount: 2, saleDate: day(-2) }),               // 숨김: 기일 지남
  mk('H', { failCount: 1, saleDate: day(21) }),               // 보임: 딱 21일
  mk('I', { failCount: 1, status: '매각종료', winningBid: 250000000, saleDate: day(-5) }), // 종료 탭
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript((cards) => {
    window.claude = { mcp: { callTool: function (s, t) { if (t === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: cards, meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed)); sessionStorage.setItem('seeded', '1'); }
  }, cards);
  await page.goto('file://' + path + file); await page.waitForTimeout(1500);
  const d = await page.$('#navDrawerBtn'); if (d) { await page.evaluate(el => el.click(), d); await page.waitForTimeout(400); }
  const nav = await page.evaluateHandle(() => Array.from(document.querySelectorAll('[data-rail-view],[data-view]')).find(b => /경매분석/.test(b.textContent)));
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(800);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const txt = () => page.evaluate(() => (document.getElementById('main') || document.body).innerText);
  const has = (t, ids) => ids.every(i => t.includes('단지' + i));
  const not = (t, ids) => ids.every(i => !t.includes('단지' + i));
  let t = await txt(); const btn0 = await page.evaluate(() => document.getElementById('marketFocusBtn').textContent + '|' + document.getElementById('marketFocusBtn').getAttribute('aria-pressed'));
  console.log('BTN', btn0);
  ck('기본 집중 보기 켜짐 · 버튼 "(3/8)"', btn0.includes('켜짐') && btn0.includes('(3/8)') && btn0.endsWith('|true'));
  ck('보임: A(유찰 10일) · C(⭐ 신건) · H(딱 21일)', has(t, ['A', 'C', 'H']));
  ck('숨김: B 신건 · D 30일 · E 오피스텔 · F ⭐ 25일 · G 기일지남', not(t, ['B', 'D', 'E', 'F', 'G']));
  ck('미작성 타일: 집중 3건', /권리분석 미작성 · 집중\s*3/.test(t.replace(/\n/g, ' ')));
  // 끄기
  await page.evaluate(() => document.getElementById('marketFocusBtn').click()); await page.waitForTimeout(600);
  t = await txt();
  console.log('OFF missing', ['A','B','C','D','E','F','G','H'].filter(i => !t.includes('단지' + i)), '| 표시중', (t.match(/\d+건 표시중/) || [])[0]);
  // E(오피스텔)는 기존 접이식 필터 기본값 '아파트' 때문에 안 보이는 게 정상
  ck('끄면 진행 전부(아파트 필터 제외 7건) · 버튼 꺼짐', has(t, ['A', 'B', 'C', 'D', 'F', 'G', 'H']) && !t.includes('단지E') && t.includes('집중 보기 꺼짐'));
  ck('미작성 타일: 진행 8건', /권리분석 미작성 · 진행\s*8/.test(t.replace(/\n/g, ' ')));
  // 새로고침 후에도 꺼짐 유지
  await page.reload(); await page.waitForTimeout(1500);
  const d2 = await page.$('#navDrawerBtn'); if (d2) { await page.evaluate(el => el.click(), d2); await page.waitForTimeout(400); }
  const nav2 = await page.evaluateHandle(() => Array.from(document.querySelectorAll('[data-rail-view],[data-view]')).find(b => /경매분석/.test(b.textContent)));
  await page.evaluate(el => el.click(), nav2); await page.waitForTimeout(800);
  t = await txt(); ck('새로고침 뒤에도 꺼짐 기억', t.includes('집중 보기 꺼짐') && has(t, ['B']));
  await page.evaluate(() => document.getElementById('marketFocusBtn').click()); await page.waitForTimeout(600);
  // 종료 탭엔 영향 없음
  await page.evaluate(() => document.querySelector('[data-market-tab="closed"]').click()); await page.waitForTimeout(500);
  t = await txt(); ck('종료 탭: I 보임(집중 보기 무관)', has(t, ['I']));
  await page.evaluate(() => document.querySelector('[data-market-tab="active"]').click()); await page.waitForTimeout(500);
  // 지역 칩 건수도 집중 안에서
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-market-area]')).map(b => b.getAttribute('data-market-area') + '=' + b.textContent.match(/\((\d+)\)/)[1]));
  ck('지역 칩 건수 집중 기준: 전체 3 · ⭐ 1 · 대구권 3', chips.includes('all=3') && chips.includes('star=1') && chips.includes('daegu=3'));
  ck('페이지 오류 없음', errors.length === 0); if (errors.length) console.log(errors);
  await page.screenshot({ path: path + 'e2e_v95_focus.png' });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
