const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v93/';
const file = process.env.DASH_FILE || 'dashboard_v93.html';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const calls = [];
  await page.addInitScript(() => {
    window.claude = { mcp: { callTool: function (server, tool) { window.__calls = (window.__calls || []).concat([server + ':' + tool]); if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const posts = [];
    for (let i = 0; i < 6; i++) posts.push({ id: 'bp' + i, title: '대구경매학원 테스트 글 ' + i, status: i < 4 ? '발행완료' : '발행대기', url: i < 4 ? 'https://blog.naver.com/hjko0/22443884140' + i : '', publishedAt: '2026-10-1' + i, createdAt: '2026-10-1' + i + 'T00:00:00Z', body: '본문', topic: 't', date: '2026-10-1' + i, memo: '', stageLog: [] });
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: posts, blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], routineRuns: [], ceoOrders: [], marketAuctions: [], meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  });
  await page.goto('file://' + path + file); await page.waitForTimeout(1500);
  const d = await page.$('#navDrawerBtn'); if (d) { await page.evaluate(el => el.click(), d); await page.waitForTimeout(400); }
  let nav = await page.$('[data-rail-view="blog"], [data-view="blog"], [data-goto="blog"]');
  if (!nav) { const t = await page.$('#navToggleBtn, [data-nav-toggle], .nav-toggle'); if (t) { await page.evaluate(el => el.click(), t); await page.waitForTimeout(400); } nav = await page.$('[data-view="blog"], [data-rail-view="blog"], [data-goto="blog"]'); }
  if (!nav) { console.log('NAV NOT FOUND', await page.evaluate(() => Array.from(document.querySelectorAll('[data-view],[data-rail-view],[data-goto]')).map(e => e.outerHTML.slice(0, 80)).slice(0, 10))); }
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({ perf: !!document.querySelector('.blog-perf-card'), txt: (document.getElementById('main') || document.body).innerText.includes('발행 콘텐츠 성과'), btn: !!document.getElementById('blogRankTodayBtn'), head: !!document.querySelector('h1') && document.querySelector('h1').textContent, posts: document.querySelectorAll('.blog-post-list, [data-blog-preview]').length, calls: (window.__calls || []).filter(c => c.indexOf('PlayMCP') === 0) }));
  console.log(JSON.stringify(r));
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  ck('성과 카드·순위 버튼 없음', !r.perf && !r.txt && !r.btn);
  ck('블로그 화면 정상 렌더(제목·글 목록)', r.head === '블로그 업무' && r.posts > 0);
  ck('PlayMCP 순위 자동 확인 호출 0건', r.calls.length === 0);
  ck('페이지 오류 없음', errors.length === 0);
  if (errors.length) console.log(errors);
  await page.screenshot({ path: path + 'e2e_v93_blog.png' });
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
