const { chromium } = require('playwright');
const path = '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/mk1008/';
function dplus(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const mk=(i,st,n,extra)=>Object.assign({id:"t"+i,date:"2026-10-01",caseNumber:"2099타경"+i,buildingName:"T"+i+"_"+st,region:"대구 수성구",propertyType:"아파트",address:"대구 수성구",appraisalValue:100000000,minSalePrice:100000000,saleDate:n===null?"":dplus(n),failCount:0,status:st,winningBid:0,memo:""},extra||{});
const cards=[mk(1,"조사중",3),mk(2,"입찰예정",10),mk(3,"유찰",18),mk(4,"조사중",30),mk(5,"조사중",-2),mk(6,"조사중",null),mk(7,"변경",5),mk(8,"취하",5),mk(9,"매각종료",-3),mk(10,"매각",-3),mk(11,"낙찰",-5,{winningBid:90000000}),mk(12,"패찰",-5)];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const page = await browser.newPage({ viewport:{width:1280,height:900} });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(({cards}) => {
    window.claude = { mcp: { callTool: function(server, tool, input){ if (tool==='search_files') return Promise.resolve({payload:{files:[]}}); return Promise.resolve({payload:{}}); } } };
    const seed = { students:[],auctions:[],loans:[],tasks:[],transactions:[],blogPosts:[],blogPostsTrash:[],blogAutomationLog:[],studentDb:[],loanConsultants:[],marketResearch:[],contentIdeas:[],schedule:[],workReports:[],resources:[],carouselDrafts:[],brandStrategyReports:[],routineRuns:[],ceoOrders:[], marketAuctions:cards, meta:{cloudPulledOnce:true, marketAuctionsClearedV1:true, marketStarNormalizedV88:true} };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, {cards});
  await page.goto('file://' + path + 'dashboard_v89.html');
  await page.waitForTimeout(1500);
  const nav = await page.$('[data-view="marketAuction"], [data-rail-view="marketAuction"], [data-goto="marketAuction"]');
  await page.evaluate(el => el.click(), nav); await page.waitForTimeout(600);
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-market-tab]')).map(b=>b.textContent));
  const dues = await page.evaluate(() => Array.from(document.querySelectorAll('[data-market-due]')).map(b=>b.textContent));
  const names = async () => page.evaluate(() => Array.from(document.querySelectorAll('.stage-card-name')).map(e=>e.textContent));
  console.log('TABS', JSON.stringify(tabs)); console.log('DUE', JSON.stringify(dues)); console.log('ACTIVE_ALL', JSON.stringify(await names()));
  let fail=0; const ck=(n,c)=>{ if(!c) fail++; console.log((c?'PASS':'FAIL')+'  '+n); };
  ck('탭 카운트 진행6/종료4/낙패2', tabs[0].includes('(6)') && tabs[1].includes('(4)') && tabs[2].includes('(2)'));
  ck('매각기일 칩 카운트 7일안1/14일안2/20일안3/21이후1/지남·미정2', dues[1].includes('(1)') && dues[2].includes('(2)') && dues[3].includes('(3)') && dues[4].includes('(1)') && dues[5].includes('(2)'));
  await page.evaluate(() => document.querySelector('[data-market-due="14"]').click()); await page.waitForTimeout(400);
  const n14 = await names(); ck('14일 안 클릭 → 2건(3일·10일)', n14.length===2 && n14.join().includes('T1_') && n14.join().includes('T2_'));
  await page.screenshot({ path: path + 'e2e_v89_active.png' });
  await page.evaluate(() => document.querySelector('[data-market-tab="closed"]').click()); await page.waitForTimeout(400);
  const nc = await names(); ck('종료·변경 탭 → 변경·취하·매각종료·매각 4건', nc.length===4 && nc.every(x=>/변경|취하|매각종료|매각$/.test(x)));
  const dueHidden = await page.evaluate(() => document.querySelectorAll('[data-market-due]').length===0); ck('종료 탭에서는 기일 칩 숨김', dueHidden);
  await page.screenshot({ path: path + 'e2e_v89_closed.png' });
  await page.evaluate(() => document.querySelector('[data-market-tab="mine"]').click()); await page.waitForTimeout(400);
  const nm = await names(); ck('낙찰·패찰 탭 → 2건', nm.length===2);
  await browser.close(); process.exit(fail?1:0);
})().catch(e => { console.error(e); process.exit(2); });
