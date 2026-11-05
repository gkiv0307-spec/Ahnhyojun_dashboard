// v106 클라우드 스냅샷 압축: 실제 11/2 스냅샷(+청크 반영본)을 시드해 저장 payload 가 980KB 아래인지, 로컬은 그대로인지, 압축본을 받아도 화면이 그려지는지
const { chromium } = require('playwright');
const fs = require('fs');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v106/';
const file = process.env.DASH_FILE || 'dashboard_v106.html';
const snapPath = process.env.SNAP || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/bp1105/snap_overlay_after_blog.json';
const seedText = fs.readFileSync(snapPath, 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  await page.addInitScript(({ seedText }) => {
    window.__saved = [];
    window.claude = { mcp: { callTool: function (server, tool, input) {
      if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } });
      if (tool === 'create_file') { window.__saved.push({ title: input.title, b64len: (input.base64Content || '').length, textlen: (input.textContent || '').length, b64: input.base64Content || '' }); return Promise.resolve({ payload: { id: 'f1', modifiedTime: new Date().toISOString() } }); }
      return Promise.resolve({ payload: {} }); } } };
    const seed = JSON.parse(seedText); seed.meta = seed.meta || {}; seed.meta.cloudPulledOnce = true; seed.meta.cloudFileModifiedTime = '2099-01-01T00:00:00Z';
    for (let i = 0; i < 40; i++) seed.routineRuns.push({ id: 'rr-x' + i, job: 'blogVerify', at: '2026-11-05T00:00:00Z', status: 'ok', summary: 'x'.repeat(80), detail: 'y'.repeat(600) });
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, { seedText });
  await page.goto('file://' + path + file); await page.waitForTimeout(2500);
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const before = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')); return { wr: s.workReports.length, wrSum: s.workReports.filter(r => r.summary).length, rr: s.routineRuns.length, trash: s.blogPostsTrash.length, bodies: s.blogPosts.filter(p => p.body).length }; });
  console.log('BEFORE', JSON.stringify(before));
  // 백업 화면으로 가서 저장 버튼
  await page.evaluate(() => { const el = Array.from(document.querySelectorAll('[data-goto="backup"]')).find(e => e.offsetParent !== null) || document.querySelector('[data-goto="backup"]'); if (el) el.click(); }); await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('driveSaveBtn').click()); await page.waitForTimeout(6000);
  const saved = await page.evaluate(() => window.__saved.map(s => ({ title: s.title, b64len: s.b64len, textlen: s.textlen })));
  console.log('SAVED', JSON.stringify(saved));
  const snaps = saved.filter(s => s.title === 'ahj_dashboard_snapshot.json.gz');
  ck('스냅샷 create_file 호출(gzip)', snaps.length >= 1);
  ck('payload base64 980KB 미만', snaps.length >= 1 && snaps.every(s => s.b64len < 980000));
  const after = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')); return { wr: s.workReports.length, wrSum: s.workReports.filter(r => r.summary).length, rr: s.routineRuns.length, trash: s.blogPostsTrash.length, bodies: s.blogPosts.filter(p => p.body).length, err: s.meta.lastCloudSaveError, compact: s.meta.lastCloudSaveCompact }; });
  console.log('AFTER', JSON.stringify(after));
  ck('로컬 state 는 그대로(마감보고·summary·루틴·휴지통·본문 수 동일)', after.wr === before.wr && after.wrSum === before.wrSum && after.rr === before.rr && after.trash === before.trash && after.bodies === before.bodies);
  ck('저장 오류 없음', !after.err);
  ck('압축 정보 기록(stage·건수)', after.compact && after.compact.stage >= 1 && after.compact.workReportSummaryDropped > 0 && after.compact.routineRunsCut > 0);
  // 올라간 payload 를 풀어 내용 검증
  const b64 = await page.evaluate(() => window.__saved.filter(s => s.title === 'ahj_dashboard_snapshot.json.gz').pop().b64);
  const zlib = require('zlib'); const up = JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'));
  ck('업로드본 마감보고 건수 동일·summary 생략·sections 유지', up.workReports.length === before.wr && up.workReports.every(r => !r.sections || !r.summary) && up.workReports.filter(r => r.sections).length > 0);
  ck('업로드본 루틴 기록 300건 이하·최신 포함', up.routineRuns.length <= 300 && up.routineRuns.some(r => r.at && r.at.slice(0, 10) === '2026-11-05'));
  ck('업로드본 휴지통 10건 이하 본문 없음', up.blogPostsTrash.length <= 10 && up.blogPostsTrash.every(p => !p.body));
  ck('업로드본 발행대기 글 본문 유지', up.blogPosts.filter(p => p.status === '발행대기').every(p => p.body && p.body.length > 500));
  ck('업로드본 학생·거래·경매 건수 동일', up.students.length > 0 && up.transactions.length > 900 && up.marketAuctions.length > 150);
  console.log('UPLOAD', JSON.stringify({ wr: up.workReports.length, trimmed: up.workReports.filter(r => r.trimmed).length, rr: up.routineRuns.length, bodiesDropped: up.blogPosts.filter(p => p.bodyOmitted).length, b64len: b64.length }));
  // 압축본을 받은 기기 시뮬레이션: 업로드본을 시드해 업무일지·블로그·팀 화면이 오류 없이 그려지는지
  const page2 = await ctx.newPage(); const errors2 = []; page2.on('pageerror', e => { errors2.push(e.message); console.log('PAGEERROR2', e.message); });
  await page2.addInitScript(({ upText }) => { window.claude = { mcp: { callTool: function (server, tool) { if (tool === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } }; const s = JSON.parse(upText); s.meta.cloudFileModifiedTime = '2099-01-01T00:00:00Z'; localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(s)); }, { upText: JSON.stringify(up) });
  await page2.goto('file://' + path + file); await page2.waitForTimeout(2500);
  for (const v of ['workReports', 'team', 'blog', 'bank', 'marketAuction']) { await page2.evaluate(v => { const el = document.querySelector('[data-goto="' + v + '"]'); if (el) el.click(); }, v); await page2.waitForTimeout(700); }
  await page2.goto('file://' + path + file); await page2.waitForTimeout(2000);
  await page2.evaluate(() => { const tb = document.getElementById('navDrawerBtn'); if (tb) tb.click(); }); await page2.waitForTimeout(500);
  await page2.evaluate(() => { const el = document.querySelector('[data-rail-view="workReports"]'); if (el) el.click(); }); await page2.waitForTimeout(1200);
  const wrView = await page2.evaluate(() => ({ secs: document.querySelectorAll('.wr-sections').length, txt: document.body.textContent.includes('① 결과물') || document.body.textContent.includes('결과물') }));
  console.log('WRVIEW', JSON.stringify(wrView));
  ck('압축본 기기: 업무일지 화면에 sections 가 그려짐', wrView.secs > 0);
  ck('압축본 기기: 페이지 오류 없음', errors2.length === 0);
  ck('원본 기기: 페이지 오류 없음', errors.length === 0);
  console.log(fail ? 'FAILED ' + fail : 'ALL PASS'); await browser.close(); process.exit(fail ? 1 : 0);
})();
