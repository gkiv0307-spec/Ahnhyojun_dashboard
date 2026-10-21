// v102 (2026-10-19 대리님 지시 "대시보드 디자인 전면 수정 — 가시성, 중복 표기 제거") — 데일리 경매분석 탭:
//   ① 상단 고정 섹션 내비(오늘 확인 / 전체 물건 / 진행 변경 / 작업 기록) — 활성 섹션 하나만 DOM 에 그린다
//   ② 요약 카운트는 숫자·링크만(물건 이름·사건번호 없음) ③ 카드마다 제목(아파트명·사건번호)·기일·주소·가격·근거가 한 번씩
//   ④ 변경 전→후는 진행 변경 섹션에서만 ⑤ 작업 기록은 기본 접힘 ⑥ 모바일 가로 스크롤 없음 ⑦ 키보드 조작
//   미리보기 검증용 — 운영 발행본(v101)이 아니라 scratch v102 빌드를 연다.
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v102/';
const file = process.env.DASH_FILE || 'dashboard_v102.html';
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mk = (id, o) => Object.assign({ id, date: day(-20), caseNumber: '2026타경' + id, court: '대구지방법원', region: '대구 수성구', propertyType: '아파트', buildingName: '단지' + id, address: '범어동 ' + id + '번지', appraisalValue: 300000000, minSalePrice: 240000000, saleDate: day(10), failCount: 0, status: '조사중', winningBid: 0, analysisWritten: false, memo: '', isStar: false }, o);
const cards = [
  mk('S1', { isStar: true, starBasis: '호갱노노 왕관 — 범어동 월간 방문자 1위(' + day(0) + ' 확인)', saleDate: day(12), failCount: 1, source: '전국 경매 물건 현황판', courtCheckedAt: day(-3), courtResult: '진행중 · 매각기일 ' + day(12).slice(5) + ' 최저 240,000,000원', memo: '남향 고층. [탱크 상태확인 ' + day(-9) + ' 09:00 KST] ' + day(-10) + ' 유찰. 조사중 → 유찰(1회). 출처: https://www.tankauction.com/s1' }),
  mk('S2', { isStar: true, saleDate: day(5) }),
  mk('S3', { isStar: true, starBasis: '근거 있음', saleDate: day(-1) }),
  mk('N1', { date: day(0), saleDate: day(30) }),
  mk('N2', { date: day(-20), autoAddedAt: day(-2) + 'T01:00:00Z', saleDate: day(30) }),
  mk('C1', { status: '유찰', failCount: 1, saleDate: day(25), memo: '[탱크 상태확인 ' + day(-4) + ' 13:17 KST] ' + day(-5) + ' 유찰. 조사중 → 유찰(1회), 다음 기일 ' + day(25) + ', 최저가 210,000,000원. 출처: https://www.tankauction.com/x' }),
  mk('C2', { status: '매각종료', winningBid: 250000000, saleDate: day(-6), courtResult: day(-6) + ' 매각(250,000,000원)', courtCheckedAt: day(-5), courtCheckedBy: 'PC GPT 화면 확인', courtStatusRaw: '매각' }),
  mk('C3', { status: '변경', saleDate: day(3), memo: '[법원 확인 ' + day(-40) + '] 조사중 → 변경. 새 기일 미정' }),
  mk('W1', { analysisWritten: true, saleDate: day(6) }),
  mk('W2', { saleDate: day(2) }),
  mk('F2', { failCount: 2, saleDate: day(15), address: '대구 수성구 범어동 F2번지' }),   // 소재지에 지역명이 이미 있음 → 지역 중복 금지
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript((cards) => {
    window.claude = { mcp: { callTool: function (s, t) { if (t === 'search_files') return Promise.resolve({ payload: { files: [] } }); return Promise.resolve({ payload: {} }); } } };
    const seed = { students: [], auctions: [], loans: [], tasks: [], transactions: [], blogPosts: [], blogPostsTrash: [], blogAutomationLog: [], studentDb: [], loanConsultants: [], marketResearch: [], contentIdeas: [], schedule: [], workReports: [], resources: [], carouselDrafts: [], brandStrategyReports: [], ceoOrders: [], marketAuctions: cards,
      routineRuns: [{ id: 'rr-test-auctionSync', job: 'auctionSync', at: new Date().toISOString(), status: 'hold', summary: 'PC 결과 0건 검토' }],
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
  const $txt = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, ' ') : null; }, sel);
  const count = (hay, needle) => (hay || '').split(needle).length - 1;
  const panelKey = () => page.evaluate(() => { const ps = document.querySelectorAll('[data-mkt-panel]'); return ps.length === 1 ? ps[0].getAttribute('data-mkt-panel') : 'N=' + ps.length; });
  const cardInfo = (id) => page.evaluate((id) => {
    const c = document.querySelector('.mcard[data-market-card="' + id + '"]'); if (!c) return null;
    return { text: c.textContent.replace(/\s+/g, ' '), name: c.querySelectorAll('.stage-card-name').length, cas: c.querySelectorAll('.mcard-case').length, due: c.querySelectorAll('.mcard-due-main').length, court: c.querySelectorAll('.mcard-court').length, addr: c.querySelectorAll('.mcard-addr').length, price: c.querySelectorAll('.mcard-min').length, legacy: c.querySelectorAll('.stage-card-updated,.stage-card-case,.stage-card-pills').length, memo: (c.querySelector('.mcard-memo') || {}).textContent || '', analysisBtn: c.querySelectorAll('[data-market-analysis]').length };
  }, id);

  // ① 활성 섹션 하나만 — 기본 "오늘 확인"
  ck('기본 섹션 = 오늘 확인, 패널 1개만 렌더', (await panelKey()) === 'today');
  ck('오늘 확인 패널에 전체 목록·변경·기록 DOM 없음', await page.evaluate(() => !document.querySelector('#marketListArea') && !document.querySelector('.chg-list') && !document.querySelector('.log-wrap')));
  ck('섹션 탭 4개 · aria-selected 정확', await page.evaluate(() => { const t = Array.from(document.querySelectorAll('.mkt-tab')); return t.length === 4 && t.filter(b => b.getAttribute('aria-selected') === 'true').length === 1 && t[0].getAttribute('aria-selected') === 'true'; }));
  ck('상단 내비 sticky', await page.evaluate(() => getComputedStyle(document.querySelector('.mkt-nav')).position === 'sticky'));
  // ② 요약 카운트: 숫자만, 물건 이름·사건번호 없음
  const kpiTxt = await $txt('.mkt-kpis');
  console.log('KPI', kpiTxt);
  ck('요약 카운트에 단지명·사건번호 없음', !/단지|타경/.test(kpiTxt));
  const kpiVals = await page.evaluate(() => Array.from(document.querySelectorAll('[data-market-quick]')).map(b => [b.getAttribute('data-market-quick'), Number(b.querySelector('.mkpi-v').textContent)]));
  const kv = Object.fromEntries(kpiVals);
  ck('카운트: 촬영 1 · 14일 4 · 신규 2 · 변경 3(C1 메모·C2 법원·S1 메모) · 권리검토 대기 8', kv.shoot === 1 && kv.due14 === 4 && kv.new === 2 && kv.changed === 3 && kv.missing === 8);
  // ③ 오늘 확인: 묶음(지남/오늘/7일) + 카드 한 장씩, 사건번호 한 번씩
  const todayTxt = await $txt('[data-mkt-panel="today"]');
  const todayIds = await page.evaluate(() => Array.from(document.querySelectorAll('[data-mkt-panel="today"] .mcard')).map(c => c.getAttribute('data-market-card')));
  console.log('오늘 확인', todayIds.join(' > '));
  ck('오늘 확인 = S3(지남) > W2 > S2 > W1, 기일 순', todayIds.join(',') === 'S3,W2,S2,W1');
  ck('오늘 확인 묶음 제목: 기일 지남 · 7일 안', /기일 지남 · 결과 미입력/.test(todayTxt) && /7일 안/.test(todayTxt) && !/오늘 매각기일/.test(todayTxt));
  ck('오늘 확인 패널에서 각 사건번호가 정확히 1회', ['S3', 'W2', 'S2', 'W1'].every(id => count(todayTxt, '2026타경' + id) === 1));
  ck('오늘 확인에 다른 물건(S1·N1·C1) 없음', !/2026타경S1|2026타경N1|2026타경C1/.test(todayTxt));
  // 카드 한 장 안의 중복 검사
  const s3 = await cardInfo('S3');
  ck('S3 카드: 제목 1 · 사건번호 1 · 기일 1 · 주소 1 · 최저가 1 · 옛 중복 요소 0', s3 && s3.name === 1 && s3.cas === 1 && s3.due === 1 && s3.addr === 1 && s3.price === 1 && s3.legacy === 0);
  ck('S3 카드 텍스트에 단지명·사건번호·주소 각 1회', s3 && count(s3.text, '단지S3') === 1 && count(s3.text, '2026타경S3') === 1 && count(s3.text, '범어동 S3번지') === 1);
  ck('S3(기일 지남) 결과 입력 버튼 · 기일 지남 표시', s3 && /기일 지남 · 결과 미입력/.test(s3.text) && await page.evaluate(() => document.querySelectorAll('.mcard[data-market-card="S3"] [data-market-quick-status]').length === 5));
  // ④ 전체 물건 섹션
  await page.evaluate(() => document.querySelector('[data-market-section="list"]').click()); await page.waitForTimeout(500);
  ck('전체 물건 섹션으로 전환, 패널 1개', (await panelKey()) === 'list' && await page.evaluate(() => !!document.querySelector('#marketListArea')));
  const s1 = await cardInfo('S1');
  console.log('S1', s1 && s1.text);
  ck('S1 카드: 법원 확인 1회 · 기일 1회 · 권리검토 버튼 1개', s1 && s1.court === 1 && s1.due === 1 && s1.analysisBtn === 1 && count(s1.text, '법원 확인') === 1);
  ck('S1 카드: 단지명·사건번호 1회 · ⭐근거 표시 · 출처 현황판 · 감정가/최저가', s1 && count(s1.text, '단지S1') === 1 && count(s1.text, '2026타경S1') === 1 && /호갱노노 왕관/.test(s1.text) && /출처 현황판/.test(s1.text) && /최저/.test(s1.text) && /감정/.test(s1.text));
  ck('S1 카드 메모: 확인 기록([탱크…]·→·출처 URL) 숨김, 일반 메모만', s1 && s1.memo === '남향 고층.' && !/→/.test(s1.text));
  const s2 = await cardInfo('S2');
  ck('S2 카드: ⭐ 근거 미기재(대장으로 부르지 않음)', s2 && /근거 미기재/.test(s2.text));
  const f2 = await cardInfo('F2');
  ck('F2 카드: 소재지에 지역이 이미 있으면 "대구 수성구" 1회만', f2 && count(f2.text, '대구 수성구') === 1 && /범어동 F2번지/.test(f2.text));
  const mainTxt = await $txt('#main');
  ck('전체 목록 화면 전체에서 진행 물건 사건번호 각 1회, 종료 물건(C2·C3)은 0회(요약·내비에 중복 없음)', cards.every(c => count(mainTxt, c.caseNumber) === (['C2', 'C3'].includes(c.id) ? 0 : 1)));
  ck('전체 목록 카드에 변경 전→후 화살표 없음', !(await page.evaluate(() => Array.from(document.querySelectorAll('.mcard')).some(c => /→/.test(c.textContent)))));
  // 필터 유지(v89·v94·v95 요소)
  ck('상태 탭·지역 칩·기일 칩·집중 버튼·검색 유지', await page.evaluate(() => document.querySelectorAll('[data-market-tab]').length === 3 && document.querySelectorAll('[data-market-area]').length === 6 && document.querySelectorAll('[data-market-due]').length === 6 && !!document.getElementById('marketFocusBtn') && !!document.getElementById('marketSearchInput')));
  // ⑤ 요약 카운트 클릭 → 이동/필터, 재클릭 해제
  await page.evaluate(() => document.querySelector('[data-market-quick="shoot"]').click()); await page.waitForTimeout(400);
  let ids = await page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .mcard')).map(c => c.getAttribute('data-market-card')));
  ck('촬영 후보 클릭 → S1 만', ids.join(',') === 'S1' && await page.evaluate(() => document.querySelector('[data-market-quick="shoot"]').getAttribute('aria-pressed') === 'true'));
  await page.evaluate(() => document.querySelector('[data-market-quick="shoot"]').click()); await page.waitForTimeout(400);
  ids = await page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .mcard')).length);
  ck('촬영 후보 재클릭 → 해제(전체 진행 물건)', ids === 9);
  await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').click()); await page.waitForTimeout(400);
  // v103: 타일은 오늘~14일 누적 빠른 필터(marketQuick due14)로 걸고, 기일 칩은 구간별이라 "전체" 선택을 유지한다
  ck('14일 이내 클릭 → 타일 눌림 · 목록 4건(오늘~14일) · 기일 칩은 전체 유지', await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('#marketListArea .mcard').length === 4 && document.querySelector('[data-market-due="all"]').getAttribute('aria-pressed') === 'true'));
  await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').click()); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-market-quick="missing"]').click()); await page.waitForTimeout(400);
  ids = await page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .mcard')).map(c => c.getAttribute('data-market-card')));
  ck('권리검토 대기 클릭 → 미작성 8건(W1 제외)', ids.length === 8 && !ids.includes('W1'));
  await page.evaluate(() => document.querySelector('[data-market-quick="missing"]').click()); await page.waitForTimeout(300);
  // ⑥ 진행 변경: 전→후는 여기서만
  await page.evaluate(() => document.querySelector('[data-market-quick="changed"]').click()); await page.waitForTimeout(400);
  ck('변경 카운트 클릭 → 진행 변경 섹션', (await panelKey()) === 'changes');
  const chg = await page.evaluate(() => Array.from(document.querySelectorAll('.chg-row:not(.chg-headrow)')).map(r => r.getAttribute('data-market-card') + ':' + r.querySelector('.chg-arrow').textContent.replace(/\s+/g, ' ').trim()));
  console.log('변경', chg.join(' | '));
  ck('진행 변경 3건(C1 메모 · C2 법원 · S1 메모, 최근순) · 전→후 표시', chg.length === 3 && /^C1:조사중→유찰\(1회\)/.test(chg[0]) && /^C2:→.*매각/.test(chg[1]) && /^S1:조사중→유찰\(1회\)/.test(chg[2]));
  await page.evaluate(() => document.getElementById('marketChangesAllBtn').click()); await page.waitForTimeout(400);
  ck('전체 기간 → C3(40일 전) 포함 4건', await page.evaluate(() => document.querySelectorAll('.chg-row:not(.chg-headrow)').length === 4));
  await page.evaluate(() => document.getElementById('marketChangesAllBtn').click()); await page.waitForTimeout(300);
  // ⑦ 작업 기록: 기본 접힘
  await page.evaluate(() => document.querySelector('[data-market-section="log"]').click()); await page.waitForTimeout(400);
  ck('작업 기록 섹션: 그룹 4개 전부 접힘', await page.evaluate(() => { const g = document.querySelectorAll('.log-group'); return g.length === 4 && Array.from(g).every(d => !d.open); }));
  ck('작업 기록에 자동 등록 대기 1건 · 루틴 기록 표시(textContent)', await page.evaluate(() => { const t = document.querySelector('.log-wrap').textContent; return /자동 등록 대기 1/.test(t) && /대기단지/.test(t) && /PC 결과 0건 검토/.test(t); }));
  ck('작업 기록 섹션에 물건 카드 없음', await page.evaluate(() => document.querySelectorAll('.mcard').length === 0));
  // ⑧ 키보드: 탭 화살표 이동, 카드 Enter → 상세
  await page.focus('[data-market-section="log"]'); await page.keyboard.press('Home'); await page.waitForTimeout(400);
  ck('탭에서 Home 키 → 오늘 확인으로 이동·포커스', (await panelKey()) === 'today' && await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-market-section') === 'today'));
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
  ck('ArrowRight → 전체 물건', (await panelKey()) === 'list');
  await page.evaluate(() => document.querySelector('[data-market-section="today"]').click()); await page.waitForTimeout(400);
  await page.focus('.mcard[data-market-card="W2"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  ck('카드 Enter → 상세 모달(W2)', await page.evaluate(() => { const o = document.getElementById('marketDetailOverlay'); const inp = o && o.querySelector('[data-inline-text="caseNumber"]'); return !!o && /단지W2/.test(o.textContent) && !!inp && inp.value === '2026타경W2'; }));
  await page.evaluate(() => document.getElementById('marketDetailCloseBtn').click()); await page.waitForTimeout(300);
  await page.screenshot({ path: path + 'e2e_v102_today.png', fullPage: false });
  await page.evaluate(() => document.querySelector('[data-market-section="list"]').click()); await page.waitForTimeout(400);
  await page.screenshot({ path: path + 'e2e_v102_list.png', fullPage: false });
  // ⑨ 모바일
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-market-section="today"]').click()); await page.waitForTimeout(500);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ck('390px: 가로 스크롤 없음 (' + ov.sw + '/' + ov.cw + ')', ov.sw <= ov.cw + 1);
  ck('390px: 내비 4탭 전부 화면 폭 안 · 요약 5개 보임', await page.evaluate(() => { const t = Array.from(document.querySelectorAll('.mkt-tab')); return t.length === 4 && t.every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= 390; }) && Array.from(document.querySelectorAll('.mkpi')).every(e => e.getBoundingClientRect().width > 40); }));
  await page.screenshot({ path: path + 'e2e_v102_mobile.png', fullPage: false });
  await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(300);
  ck('390px: 스크롤 후 내비가 화면 안에 고정 (top=' + (await page.evaluate(() => Math.round(document.querySelector('.mkt-nav').getBoundingClientRect().top))) + ')', await page.evaluate(() => { const r = document.querySelector('.mkt-nav').getBoundingClientRect(); return r.top >= 0 && r.top < 140; }));
  ck('페이지 오류 없음', errors.length === 0);
  if (errors.length) console.log('ERRORS', errors);
  await browser.close();
  console.log(fail ? 'FAILED ' + fail : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
