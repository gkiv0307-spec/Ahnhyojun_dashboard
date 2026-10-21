// v103 (2026-10-21 대리님 지시 "14일 체크하면 현재로부터 14일 남은 것을 보여줘야 하는데 당일 입찰 물건도 보인다"):
// 진행 탭 매각기일 칩을 누적(오늘~N일)에서 구간(오늘~7일 / 8~14일 / 15~20일 / 21일 이후 / 기일 지남·미정)으로 바꿨다.
// "14일 이내 기일" 요약 타일만 오늘~14일 누적(marketQuick "due14")로 남겼다.
// 실행: NODE_PATH=/opt/node22/lib/node_modules node tests/dashboard_market_due_bands_v103.e2e.js  (DASH_DIR/DASH_FILE 로 빌드 지정)
const { chromium } = require('playwright');
const path = process.env.DASH_DIR || '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/v103/';
const file = process.env.DASH_FILE || 'dashboard_v103.html';
function dplus(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const mk=(i,st,n,extra)=>Object.assign({id:"t"+i,date:"2026-10-01",caseNumber:"2099타경"+i,buildingName:"T"+i+"_d"+n,region:"대구 수성구",propertyType:"아파트",address:"대구 수성구 범어동 "+i,appraisalValue:100000000,minSalePrice:100000000,saleDate:n===null?"":dplus(n),failCount:0,status:st,winningBid:0,memo:""},extra||{});
// 기일: 오늘(0) · 3 · 7 · 8 · 14 · 15 · 20 · 21 · 30 · 지남(-2) · 미정
const cards=[mk(1,"조사중",0),mk(2,"조사중",3),mk(3,"조사중",7),mk(4,"입찰예정",8),mk(5,"조사중",14),mk(6,"유찰",15),mk(7,"조사중",20),mk(8,"조사중",21),mk(9,"조사중",30),mk(10,"조사중",-2),mk(11,"조사중",null),mk(12,"취하",5)];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const page = await browser.newPage({ viewport:{width:1280,height:900} });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(({cards}) => {
    window.claude = { mcp: { callTool: function(server, tool){ if (tool==='search_files') return Promise.resolve({payload:{files:[]}}); return Promise.resolve({payload:{}}); } } };
    const seed = { students:[],auctions:[],loans:[],tasks:[],transactions:[],blogPosts:[],blogPostsTrash:[],blogAutomationLog:[],studentDb:[],loanConsultants:[],marketResearch:[],contentIdeas:[],schedule:[],workReports:[],resources:[],carouselDrafts:[],brandStrategyReports:[],routineRuns:[],ceoOrders:[], marketAuctions:cards, meta:{cloudPulledOnce:true, marketAuctionsClearedV1:true, marketStarNormalizedV88:true, marketFocusOff:true} };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, {cards});
  await page.goto('file://' + path + file); await page.waitForTimeout(1500);
  const nav = await page.$('[data-view="marketAuction"], [data-rail-view="marketAuction"], [data-goto="marketAuction"]');
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(600);
  const goList = async () => { const s = await page.$('[data-market-section="list"]'); if (s) { await page.evaluate(el => el.click(), s); await page.waitForTimeout(500); } };
  await goList();
  const dues = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-market-due]')).map(b=>b.textContent.replace(/\s+/g,' ').trim()));
  const names = () => page.evaluate(() => Array.from(document.querySelectorAll('#marketListArea .stage-card-name')).map(e=>{const c=e.cloneNode(true); c.querySelectorAll('.stage-card-case-inline,.mcard-case').forEach(s=>s.remove()); return c.textContent.trim();}));
  const clickDue = async (k) => { await page.evaluate(k => document.querySelector('[data-market-due="'+k+'"]').click(), k); await page.waitForTimeout(400); };
  let fail=0; const ck=(n,c)=>{ if(!c) fail++; console.log((c?'PASS':'FAIL')+'  '+n); };
  const d0 = await dues(); console.log('DUE', JSON.stringify(d0));
  ck('칩 라벨: 전체 / 오늘~7일 / 8~14일 / 15~20일 / 21일 이후 / 기일 지남·미정', d0.length===6 && /^오늘~7일/.test(d0[1]) && /^8~14일/.test(d0[2]) && /^15~20일/.test(d0[3]) && /^21일 이후/.test(d0[4]) && /기일 지남/.test(d0[5]));
  ck('칩 건수 구간별: 오늘~7일 3 · 8~14일 2 · 15~20일 2 · 21일 이후 2 · 지남·미정 2', d0[1].includes('(3)') && d0[2].includes('(2)') && d0[3].includes('(2)') && d0[4].includes('(2)') && d0[5].includes('(2)'));
  await clickDue('14'); let n = await names(); console.log('N14', JSON.stringify(n));
  ck('8~14일 클릭 → 8일·14일 2건만, 당일(0)·3일·7일 물건 없음', n.length===2 && n.some(x=>/T4_/.test(x)) && n.some(x=>/T5_/.test(x)) && !n.some(x=>/T1_|T2_|T3_/.test(x)));
  await clickDue('7'); n = await names();
  ck('오늘~7일 클릭 → 당일·3일·7일 3건', n.length===3 && n.some(x=>/T1_/.test(x)) && n.some(x=>/T3_/.test(x)));
  await clickDue('20'); n = await names();
  ck('15~20일 클릭 → 15일·20일 2건', n.length===2 && n.some(x=>/T6_/.test(x)) && n.some(x=>/T7_/.test(x)));
  await clickDue('21plus'); n = await names();
  ck('21일 이후 클릭 → 21일·30일 2건', n.length===2 && n.some(x=>/T8_/.test(x)) && n.some(x=>/T9_/.test(x)));
  await clickDue('overdue'); n = await names();
  ck('기일 지남·미정 → 2건', n.length===2 && n.some(x=>/T10_/.test(x)) && n.some(x=>/T11_/.test(x)));
  await clickDue('all'); n = await names(); ck('전체 → 진행 11건', n.length===11);
  // 요약 타일 "14일 이내 기일" 은 오늘~14일 누적 5건, 누르면 목록이 5건·칩은 전체 유지
  const tile = await page.evaluate(() => { const t = document.querySelector('[data-market-quick="due14"]'); return t ? { v: (t.querySelector('.mkpi-v')||{}).textContent, pressed: t.getAttribute('aria-pressed') } : null; });
  ck('요약 타일 14일 이내 = 5(오늘·3·7·8·14)', tile && String(tile.v).trim()==='5');
  await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').click()); await page.waitForTimeout(500);
  n = await names(); const d1 = await dues();
  ck('타일 클릭 → 목록 5건(오늘~14일), 칩 "전체" 선택 유지', n.length===5 && !n.some(x=>/T6_|T7_|T8_|T9_|T10_|T11_/.test(x)) && (await page.evaluate(() => document.querySelector('[data-market-due="all"]').getAttribute('aria-pressed')))==='true');
  ck('타일 클릭 상태에서 칩 건수는 5건 안에서 셈: 오늘~7일 3 · 8~14일 2 · 나머지 0', d1[1].includes('(3)') && d1[2].includes('(2)') && d1[3].includes('(0)') && d1[4].includes('(0)') && d1[5].includes('(0)'));
  await page.evaluate(() => document.querySelector('[data-market-quick="due14"]').click()); await page.waitForTimeout(400);
  n = await names(); ck('타일 다시 클릭 → 해제, 11건', n.length===11);
  await page.screenshot({ path: path + 'e2e_v103_due.png' });
  await browser.close(); process.exit(fail?1:0);
})().catch(e => { console.error(e); process.exit(2); });
