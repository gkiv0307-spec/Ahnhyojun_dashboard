// v96 (2026-10-19 대리님 지시 "대시보드 화면 정리") — 데일리 경매분석 탭:
//   ① 오늘 요약 타일 5개(촬영 후보·14일 기일·신규 등록·진행 변경·권리검토 대기)가 기존 필드로만 계산되고 누르면 해당 목록으로 간다
//   ② "오늘 확인" 이 기일 가까운 순으로 위에 온다 ③ 물건 목록 / 진행 변경 / 작업 기록 섹션 ④ 카드 제목 = 아파트명 + 사건번호
//   ⑤ 대장 근거 없는 ⭐는 후보로 세지 않는다 ⑥ 모바일 폭에서 가로 스크롤 없음 ⑦ 키보드로 타일·행 조작
//   ※ v96(발행본 Version 101) 구조 전용 기록. v102 부터는 섹션 내비·카드 구조가 달라 tests/dashboard_market_redesign_v102.e2e.js 가 이 역할을 잇는다.
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v96/';
const file = process.env.DASH_FILE || 'dashboard_v96.html';
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mk = (id, o) => Object.assign({ id, date: day(-20), caseNumber: '2026타경' + id, court: '대구지방법원', region: '대구 수성구', propertyType: '아파트', buildingName: '단지' + id, address: '대구 수성구 범어동 ' + id, appraisalValue: 300000000, minSalePrice: 300000000, saleDate: day(10), failCount: 0, status: '조사중', winningBid: 0, analysisWritten: false, memo: '', isStar: false }, o);
const cards = [
  mk('S1', { isStar: true, starBasis: '호갱노노 왕관 — 범어동 월간 방문자 1위(' + day(0) + ' 확인)', saleDate: day(12), failCount: 1, source: '전국 경매 물건 현황판', courtCheckedAt: day(-3), courtResult: '진행중 · 매각기일 ' + day(12).slice(5) + ' 최저 300,000,000원' }), // 촬영 후보 ○
  mk('S2', { isStar: true, saleDate: day(5) }),                                   // ⭐이지만 근거 없음 → 촬영 후보 ×, 14일 기일 ○, 오늘 확인 ○(D-5)
  mk('S3', { isStar: true, starBasis: '근거 있음', saleDate: day(-1) }),           // ⭐근거 있어도 기일 지남 → 촬영 후보 ×, 오늘 확인 ○(결과 미입력)
  mk('N1', { date: day(0), saleDate: day(30) }),                                 // 신규 등록(조사일 오늘)
  mk('N2', { date: day(-20), autoAddedAt: day(-2) + 'T01:00:00Z', saleDate: day(30) }), // 신규 등록(자동 등록 2일 전)
  mk('C1', { status: '유찰', failCount: 1, saleDate: day(25), memo: '[탱크 상태확인 ' + day(-4) + ' 13:17 KST] ' + day(-5) + ' 유찰. 조사중 → 유찰(1회), 다음 기일 ' + day(25) + ', 최저가 210,000,000원. 출처: https://www.tankauction.com/x' }), // 진행 변경(메모)
  mk('C2', { status: '매각종료', winningBid: 250000000, saleDate: day(-6), courtResult: day(-6) + ' 매각(250,000,000원)', courtCheckedAt: day(-5), courtCheckedBy: 'PC GPT 화면 확인', courtStatusRaw: '매각' }), // 진행 변경(법원), 종료 탭
  mk('C3', { status: '변경', saleDate: day(3), memo: '[법원 확인 ' + day(-40) + '] 조사중 → 변경. 새 기일 미정' }), // 변경 기록 40일 전 → 30일 창 밖
  mk('W1', { analysisWritten: true, saleDate: day(6) }),                         // 권리분석 작성됨 → 대기 아님, 오늘 확인 ○(D-6)
  mk('W2', { saleDate: day(2) }),                                                // 권리검토 대기, 오늘 확인 ○(D-2)
  mk('F2', { failCount: 2, saleDate: day(15) }),                                 // 유찰 2회
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript((cards) => {
    window.claude = { mcp: { callTool: function (s, t) { if (t === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], ceoOrders: [], marketAuctions: cards,
      routineRuns: [{ id: 'rr-test-auctionSync', job: 'auctionSync', at: new Date().toISOString(), status: 'hold', summary: 'PC 결과 0건 검토 · 기존 갱신 0 · 신규 등록 0' }],
      meta: { cloudPulledOnce: true, marketAuctionsClearedV1: true, marketStarNormalizedV88: true, studentDbMergedV1: true, studentDbBackfillV1: true, consultingCourseFlagBackfillV1: true, paidDateBackfillV1: true, julyRosterAddedV1: true, aug5BulkImportExclusionV1: true, marketFocusOff: true,
        pendingMarketAdds: [{ id: 'pend1', date: cards[0].date, caseNumber: '2026타경P1 물건1', buildingName: '대기단지', court: '대구지방법원', region: '대구 북구', propertyType: '아파트', address: '대구 북구 침산동 1', appraisalValue: 300000000, minSalePrice: 300000000, saleDate: cards[0].saleDate, failCount: 0, status: '조사중', memo: '현황판 자동 등록', source: '전국 경매 물건 현황판', check: { ok: false, why: '법원 미확인' }, waitKind: '검증', waitReason: 'check.ok 미충족' }] } };
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed)); sessionStorage.setItem('seeded', '1'); }
  }, cards);
  const openMarket = async () => {
    const d = await page.$('#navDrawerBtn'); if (d) { await page.evaluate(el => el.click(), d); await page.waitForTimeout(400); }
    const nav = await page.evaluateHandle(() => Array.from(document.querySelectorAll('[data-rail-view],[data-view]')).find(b => /경매분석/.test(b.textContent)));
    await page.evaluate(el => el.click(), nav); await page.waitForTimeout(800);
  };
  await page.goto('file://' + path + file); await page.waitForTimeout(1500); await openMarket();
  let fail = 0; const ck = (n, c) => { if (!c) fail++; console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
  const txt = (sel) => page.evaluate((s) => ((s && document.querySelector(s)) || document.getElementById('main') || document.body).innerText, sel || null);
  const tile = (k) => page.evaluate((k) => { const el = document.querySelector('[data-market-quick="' + k + '"]'); return el ? el.textContent.replace(/\s+/g, ' ') : null; }, k);
  const num = (s) => Number((s || '').match(/(\d+)\s*건/)?.[1]);
  const nm = (s) => ((s || '').match(/단지[A-Z0-9]+/) || [''])[0];
  console.log('TILES', await page.evaluate(() => Array.from(document.querySelectorAll('[data-market-quick]')).map(e => e.textContent.replace(/\s+/g, ' ')).join(' | ')));

  // ① 오늘 요약 타일
  ck('촬영 후보 1건 (근거 있는 ⭐ · 기일 미경과만)', num(await tile('shoot')) === 1);
  ck('14일 이내 기일 4건 (S1 12·S2 5·W1 6·W2 2 / S3 지남·C3 변경 제외)', num(await tile('due14')) === 4);
  ck('신규 등록 2건 (조사일 오늘·자동 등록 2일 전)', num(await tile('new')) === 2);
  ck('진행상태 변경 2건 (메모 → 1·법원 결과 1, 40일 전 기록 제외)', num(await tile('changed')) === 2);
  ck('권리검토 대기 = 진행 중 미작성 8건 (진행 9 − 작성됨 W1)', num(await tile('missing')) === 8);
  // ② 오늘 확인: 기일 가까운 순, 지난 것 먼저
  const todayRows = await page.evaluate(() => Array.from(document.querySelectorAll('.today-row .today-name')).map(e => e.textContent.replace(/⭐/g, '').trim().split(' ')[0]));
  console.log('오늘 확인', todayRows.join(' > '));
  ck('오늘 확인 순서: S3(지남) > W2(D-2) > S2(D-5) > W1(D-6) (변경 C3는 종료 탭이라 제외)', todayRows.join(',') === '단지S3,단지W2,단지S2,단지W1');
  ck('오늘 확인 지난 건에 결과 미입력 표시', (await txt('.today-wrap')).includes('결과 미입력'));
  // ③ 카드 제목 = 아파트명 + 사건번호, 메타(출처·법원 확인·⭐근거·권리검토 대기)는 데이터 있을 때만
  const cardS1 = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.stage-card')).find(c => c.textContent.includes('단지S1')); return c ? { name: c.querySelector('.stage-card-name').textContent, meta: (c.querySelector('.stage-card-meta') || {}).textContent || '' } : null; });
  ck('카드 제목에 아파트명+사건번호', !!cardS1 && /단지S1/.test(cardS1.name) && /2026타경S1/.test(cardS1.name));
  ck('S1 메타: 출처 현황판 · 법원 확인 · ⭐근거 · 권리검토 대기', /출처 현황판/.test(cardS1.meta) && /법원 확인/.test(cardS1.meta) && /호갱노노 왕관/.test(cardS1.meta) && /권리검토 대기/.test(cardS1.meta));
  const cardS2 = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.stage-card')).find(c => c.textContent.includes('단지S2')); return c ? ((c.querySelector('.stage-card-meta') || {}).textContent || '') : null; });
  ck('S2 메타: ⭐ 근거 미기재(대장으로 부르지 않음) · 출처 없음', /근거 미기재/.test(cardS2) && !/출처/.test(cardS2));
  const cardC1memo = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.stage-card')).find(c => c.textContent.includes('단지C1')); return c ? ((c.querySelector('.stage-card-memo') || {}).textContent || '(없음)') : null; });
  ck('카드에서 확인 기록 로그([탱크…])는 숨김', cardC1memo === '(없음)');
  // 타일 클릭 → 목록 필터
  await page.evaluate(() => document.querySelector('[data-market-quick="shoot"]').click()); await page.waitForTimeout(500);
  let names = (await page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .stage-card-name')).map(e => e.textContent))).map(nm);
  ck('촬영 후보 타일 → 목록에 S1만', names.join(',') === '단지S1' && (await txt('#marketListArea')).includes('오늘 촬영 후보'));
  await page.evaluate(() => document.querySelector('[data-market-quick="shoot"]').click()); await page.waitForTimeout(400);
  // 키보드로 신규 등록 타일 조작
  await page.focus('[data-market-quick="new"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  names = (await page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .stage-card-name')).map(e => e.textContent))).map(nm).sort();
  ck('신규 등록 타일(Enter) → N1·N2만', names.join(',') === '단지N1,단지N2');
  await page.evaluate(() => document.querySelector('[data-mf-clear="quick"]').click()); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').click()); await page.waitForTimeout(500);
  ck('14일 타일 → 진행 탭 14일 칩', await page.evaluate(() => document.querySelector('[data-market-due="14"]').getAttribute('aria-pressed') === 'true'));
  await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').click()); await page.waitForTimeout(400);
  // ④ 진행 변경 섹션: 변경 전후·확인일·출처
  await page.evaluate(() => document.querySelector('[data-market-quick="changed"]').click()); await page.waitForTimeout(500);
  let chg = await txt('.chg-wrap');
  ck('진행 변경 섹션: C1 조사중 → 유찰(1회) · 탱크옥션 · 원문', /단지C1/.test(chg) && /조사중\s*→\s*유찰\(1회\)/.test(chg.replace(/\n/g, ' ')) && /탱크옥션/.test(chg) && /원문/.test(chg));
  ck('진행 변경 섹션: C2 법원 결과 매각 · PC GPT 화면 확인', /단지C2/.test(chg) && /매각\(250,000,000원\)/.test(chg) && /PC GPT 화면 확인/.test(chg));
  ck('30일 밖 C3 기록은 기본 제외', !/단지C3/.test(chg));
  await page.evaluate(() => document.getElementById('marketChangesAllBtn').click()); await page.waitForTimeout(400);
  chg = await txt('.chg-wrap'); ck('전체 기간 보기 → C3 포함', /단지C3/.test(chg) && /변경/.test(chg));
  // ⑤ 작업 기록 섹션
  await page.evaluate(() => document.querySelector('[data-market-section="log"]').click()); await page.waitForTimeout(500);
  const log = await page.evaluate(() => document.querySelector('.log-wrap').textContent);
  ck('작업 기록: 자동 등록 대기 1건(검증) · 루틴 기록 · 통계', /자동 등록 대기\s*1/.test(log.replace(/\n/g, ' ')) && /대기단지/.test(log) && /PC 결과 0건 검토/.test(log) && /이번달 등록/.test(log));
  ck('작업 기록 탭에서는 물건 카드 목록 없음', await page.evaluate(() => !document.querySelector('#marketListArea')));
  await page.evaluate(() => document.querySelector('[data-market-section="list"]').click()); await page.waitForTimeout(400);
  // 유찰 필터
  await page.evaluate(() => document.getElementById('marketFilterToggle').click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-market-fail-filter="2plus"]').click()); await page.waitForTimeout(400);
  names = (await page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .stage-card-name')).map(e => e.textContent))).map(nm);
  ck('유찰 2회 이상 필터 → F2만', names.join(',') === '단지F2');
  await page.evaluate(() => document.getElementById('marketFilterClearAll').click()); await page.waitForTimeout(400);
  // 오늘 확인 행 Enter → 상세 모달
  await page.focus('.today-row'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ck('오늘 확인 행 Enter → 상세 모달(S3)', await page.evaluate(() => !!document.getElementById('marketDetailOverlay') && document.querySelector('#marketDetailOverlay h2').textContent.includes('단지S3')));
  await page.evaluate(() => document.getElementById('marketDetailCloseBtn').click()); await page.waitForTimeout(300);
  // 기존 v89·v94·v95 요소 유지
  ck('기존 상태 탭·지역 칩·집중 보기 버튼 유지', await page.evaluate(() => !!document.querySelector('[data-market-tab="closed"]') && !!document.querySelector('[data-market-area="star"]') && !!document.getElementById('marketFocusBtn')));
  // ⑥ 모바일 폭
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ck('390px 폭에서 가로 스크롤 없음 (' + overflow.sw + '/' + overflow.cw + ')', overflow.sw <= overflow.cw + 1);
  await page.screenshot({ path: path + 'e2e_v96_mobile.png', fullPage: false });
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(300);
  await page.screenshot({ path: path + 'e2e_v96_overview.png' });
  ck('페이지 오류 없음', errors.length === 0); if (errors.length) console.log(errors);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
