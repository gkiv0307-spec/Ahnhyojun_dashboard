const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v94/';
const file = process.env.DASH_FILE || 'dashboard_v94.html';
const mk = (id, o) => Object.assign({ id, date: '2026-10-10', caseNumber: '2026타경' + id, court: '대구지방법원', region: '대구 수성구', propertyType: '아파트', buildingName: '단지' + id, address: '', appraisalValue: 300000000, minSalePrice: 300000000, saleDate: '2026-10-30', failCount: 0, status: '조사중', winningBid: 0, analysisWritten: false, memo: '', isStar: false }, o);
const cards = [
  mk('1', { region: '대구 수성구', address: '대구광역시 수성구 범어동 1', isStar: true }),
  mk('2', { region: '대구 북구', address: '대구광역시 북구 침산동 2' }),
  mk('3', { region: '경북 경산시', address: '경산시 중산동 3' }),
  mk('4', { region: '부산 해운대구', address: '해운대구 우동 4', isStar: true }),
  mk('5', { region: '', address: '수영구 민락동 5' }),            // 부산 단어 없이 구 이름만
  mk('6', { region: '경남 김해시', address: '김해시 장유동 6' }),
  mk('7', { region: '울산 남구', address: '울산광역시 남구 7' }),
  mk('8', { region: '경북 포항시 북구', address: '포항시 북구 8', isStar: true }),
  mk('9', { region: '경기 성남시 분당구', address: '분당구 9' }),
  mk('10', { region: '부산 서구', address: '서구 암남동 10', status: '낙찰', winningBid: 250000000 }),
  mk('11', { region: '대구 달서구', address: '달서구 11', status: '매각종료', winningBid: 280000000, saleDate: '2026-10-01' }),
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript((cards) => {
    window.claude = { mcp: { callTool: function (s, t) { if (t === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: cards, meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, cards);
  await page.goto('file://' + path + file); await page.waitForTimeout(1500);
  const d = await page.$('#navDrawerBtn'); if (d) { await page.evaluate(el => el.click(), d); await page.waitForTimeout(400); }
  const nav = await page.evaluateHandle(() => Array.from(document.querySelectorAll('[data-rail-view],[data-view]')).find(b => /경매분석/.test(b.textContent)));
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(800);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const chips = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-market-area]')).map(b => b.getAttribute('data-market-area') + '=' + b.textContent.match(/\((\d+)\)/)[1] + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')));
  const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('.market-card, [data-market-id], [data-market-detail]')).map(e => e.getAttribute('data-market-id') || e.getAttribute('data-market-detail') || '').filter(Boolean));
  const names = () => page.evaluate(() => (document.getElementById('main') || document.body).innerText);
  let c = await chips(); console.log('CHIPS active', JSON.stringify(c));
  ck('진행 탭 칩 건수: 전체 9 · ⭐ 3 · 대구권 3 · 부산 2 · 경남권 2 · 그 밖 2', c.includes('all=9*') && c.includes('star=3') && c.includes('daegu=3') && c.includes('busan=2') && c.includes('gyeongnam=2') && c.includes('other=2'));
  await page.evaluate(() => document.querySelector('[data-market-area="busan"]').click()); await page.waitForTimeout(500);
  let t = await names();
  ck('부산 칩 → 단지4·단지5만 보임(해운대구·수영구)', t.includes('단지4') && t.includes('단지5') && !t.includes('단지1') && !t.includes('단지6') && !t.includes('단지8'));
  await page.evaluate(() => document.querySelector('[data-market-area="star"]').click()); await page.waitForTimeout(500);
  t = await names();
  ck('⭐ 칩 → 대장 3건(대구1·부산4·포항8)만', t.includes('단지1') && t.includes('단지4') && t.includes('단지8') && !t.includes('단지2') && !t.includes('단지6'));
  await page.evaluate(() => document.querySelector('[data-market-area="gyeongnam"]').click()); await page.waitForTimeout(500);
  t = await names();
  ck('경남권 칩 → 김해6·울산7', t.includes('단지6') && t.includes('단지7') && !t.includes('단지4') && !t.includes('단지9'));
  await page.evaluate(() => document.querySelector('[data-market-area="daegu"]').click()); await page.waitForTimeout(500);
  t = await names();
  ck('대구권 칩 → 대구1·2·경산3 (해운대구 제외)', t.includes('단지1') && t.includes('단지2') && t.includes('단지3') && !t.includes('단지4'));
  // 매각기일 칩과 결합: 대구권 + 7일 안 → 0건 안내
  await page.evaluate(() => document.querySelector('[data-market-due="7"]').click()); await page.waitForTimeout(500);
  t = await names();
  ck('대구권 + 7일 안 → 빈 상태 안내', t.includes('이 지역·대장 조건에 맞는 물건이 없습니다'));
  await page.evaluate(() => document.querySelector('[data-market-due="all"]').click()); await page.waitForTimeout(400);
  // 낙찰·패찰 탭에서도 지역 칩이 보이고 유지됨
  await page.evaluate(() => document.querySelector('[data-market-tab="mine"]').click()); await page.waitForTimeout(500);
  c = await chips(); t = await names();
  ck('낙찰 탭: 칩 유지(대구권 선택) · 부산 1건 · 대구권 0건 → 빈 안내', c.includes('daegu=0*') && c.includes('busan=1') && t.includes('이 지역·대장 조건에'));
  await page.evaluate(() => document.querySelector('[data-market-area="all"]').click()); await page.waitForTimeout(400);
  t = await names();
  ck('낙찰 탭 전체 → 단지10 보임', t.includes('단지10'));
  await page.evaluate(() => document.querySelector('[data-market-tab="closed"]').click()); await page.waitForTimeout(500);
  c = await chips();
  ck('종료 탭: 대구권 1(단지11) · 전체 1', c.includes('daegu=1') && c.includes('all=1*'));
  ck('페이지 오류 없음', errors.length === 0); if (errors.length) console.log(errors);
  await page.screenshot({ path: path + 'e2e_v94_area.png' });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
