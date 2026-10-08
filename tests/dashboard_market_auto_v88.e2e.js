const { chromium } = require('playwright');
const fs = require('fs');
const path = '/tmp/claude-0/-home-user-yeopkerphone-auction-site/7eab6cea-debf-5c8b-aa10-1319f64a3bc8/scratchpad/mk1008/';
const T = "2026-10-08";
function row(o){ return Object.assign({date:T,buildingName:"테스트단지",address:"대구 수성구 범어동 1",region:"대구 수성구",propertyType:"아파트",appraisalValue:100000000,minSalePrice:100000000,failCount:0,status:"조사중",winningBid:0,memo:"현황판 자동 등록 (2026-10-08) · 테스트",source:"전국 경매 물건 현황판"},o); }
const okChk={ok:true,why:"비고 공란·탱크 인수 없음",checkedAt:T};
const rows=[
 row({caseNumber:"2099타경1 물건1",buildingName:"⭐ 테스트15일",saleDate:"2026-10-23",exclusiveArea:110,check:okChk,courtStatusRaw:"진행",courtCheckedAt:T,tankViews:321,tankViewsType:"누적",tankViewsAt:T}),
 row({caseNumber:"2099타경2",buildingName:"테스트30일",saleDate:"2026-11-07",check:okChk,courtStatusRaw:"진행",courtCheckedAt:T}),
 row({caseNumber:"2099타경3",buildingName:"테스트45일",saleDate:"2026-11-22",check:okChk,courtStatusRaw:"진행",courtCheckedAt:T}),
 row({caseNumber:"2099타경4",buildingName:"테스트46일",saleDate:"2026-11-23",check:okChk,courtStatusRaw:"진행",courtCheckedAt:T}),
 row({caseNumber:"2099타경5",buildingName:"테스트탱크만",saleDate:"2026-10-28"}),
 row({caseNumber:"2099타경6",buildingName:"테스트권리미확인",saleDate:"2026-10-28",check:{ok:false,why:"법원 비고 미확인",checkedAt:T}}),
 row({caseNumber:"2099타경7",buildingName:"테스트부산대장",region:"부산 해운대구",address:"부산 해운대구 우동 1",saleDate:"2026-10-28",exclusiveArea:84,isStar:true,starBasis:"테스트",check:okChk,courtStatusRaw:"진행",courtCheckedAt:T}),
 row({caseNumber:"2099타경8",buildingName:"테스트부산대형",region:"부산 해운대구",address:"부산 해운대구 우동 1",saleDate:"2026-10-28",exclusiveArea:100,isStar:true,check:okChk,courtStatusRaw:"진행",courtCheckedAt:T}),
 row({caseNumber:"2099타경9",buildingName:"테스트9일",saleDate:"2026-10-17",check:okChk,courtStatusRaw:"진행",courtCheckedAt:T}),
 row({caseNumber:"2099타경10",buildingName:"테스트권리분석보내기",saleDate:"2026-12-20",memo:"권리분석보내기 체크 (2026-10-08)"}),
 // 기존 낙찰 카드에 매각종료 결과 줄 → 낙찰 보존
 {caseNumber:"2099타경50",status:"매각종료",winningBid:0,courtResult:"매각 (99,000,000원)",courtCheckedAt:T,updatedAt:new Date().toISOString()},
];
const b64 = Buffer.from(JSON.stringify(rows),'utf8').toString('base64');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args:['--no-sandbox'] });
  const page = await browser.newPage({ viewport:{width:1280,height:900} });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(({b64}) => {
    window.__calls = [];
    window.claude = { mcp: { callTool: function(server, tool, input){
      window.__calls.push([tool, JSON.stringify(input).slice(0,120)]);
      if (tool === 'search_files') {
        const q = (input && input.query) || '';
        if (q.indexOf("application/vnd.google-apps.folder") !== -1) return Promise.resolve({payload:{files:[{id:'folder1',title:'안효준 대시보드 백업'}]}});
        if (q.indexOf("ahj_market_chunk_") !== -1) return Promise.resolve({payload:{files:[{id:'tf1',title:'ahj_market_chunk_2026-10-08_test.json',createdTime:'2026-10-08T01:00:00Z'}]}});
        return Promise.resolve({payload:{files:[]}});
      }
      if (tool === 'download_file_content') { if (input.fileId==='tf1') return Promise.resolve({payload:{content:b64}}); return Promise.reject(new Error('no file')); }
      if (tool === 'create_file') return Promise.resolve({payload:{id:'new1'}});
      return Promise.resolve({payload:{}});
    } } };
    const seed = { students:[],auctions:[],loans:[],tasks:[],transactions:[],blogPosts:[],blogPostsTrash:[],blogAutomationLog:[],studentDb:[],loanConsultants:[],marketResearch:[],contentIdeas:[],schedule:[],workReports:[],resources:[],carouselDrafts:[],brandStrategyReports:[],routineRuns:[],ceoOrders:[],
      marketAuctions:[
        {id:"ex50",date:"2026-09-01",caseNumber:"2099타경50",buildingName:"⭐ 기존낙찰단지",region:"대구 북구",propertyType:"아파트",address:"대구 북구",appraisalValue:100000000,minSalePrice:70000000,saleDate:"2026-10-01",failCount:1,status:"낙찰",winningBid:88000000,memo:"대리님 직접 입력"},
        {id:"ex51",date:"2026-09-01",caseNumber:"2099타경51",buildingName:"기존일반단지",region:"대구 달서구",propertyType:"아파트",address:"대구 달서구",appraisalValue:100000000,minSalePrice:100000000,saleDate:"2026-12-30",failCount:0,status:"조사중",winningBid:0,memo:"기존 카드(기준 밖 기일)"}
      ],
      meta:{ cloudPulledOnce:true, marketAuctionsClearedV1:true, pendingMarketAdds:[ {date:"2026-10-01",caseNumber:"2099타경60",buildingName:"테스트옛대기",address:"대구 수성구 범어동 1",region:"대구 수성구",propertyType:"아파트",appraisalValue:100000000,minSalePrice:100000000,failCount:0,status:"조사중",winningBid:0,memo:"현황판 자동 등록 (2026-10-01) · 테스트",source:"전국 경매 물건 현황판",saleDate:"2026-10-30",waitingSince:"2026-10-01"} ] } };
    localStorage.setItem('ahj_realestate_dashboard_v1', JSON.stringify(seed));
  }, {b64});
  await page.goto('file://' + path + 'dashboard_v88.html');
  // wait until chunk processed
  await page.waitForFunction(() => { try { const s = JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')); return s.meta.processedMarketChunkIds && s.meta.processedMarketChunkIds.tf1; } catch(e){ return false; } }, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('ahj_realestate_dashboard_v1')));
  const cards = st.marketAuctions.map(m => ({c:m.caseNumber, n:m.buildingName, star:!!m.isStar, st:m.status, wb:m.winningBid, note:m.autoAddNote}));
  const pend = (st.meta.pendingMarketAdds||[]).map(m => ({c:m.caseNumber, n:m.buildingName, kind:m.waitKind, why:m.waitReason}));
  console.log('CARDS', JSON.stringify(cards, null, 0));
  console.log('PENDING', JSON.stringify(pend, null, 0));
  const have = c => st.marketAuctions.some(m => m.caseNumber === c);
  const checks = [
    ['15일 ⭐ 110㎡ 등록', have("2099타경1 물건1")],
    ['30일 등록', have("2099타경2")], ['45일 등록', have("2099타경3")],
    ['46일 미등록(기간 대기)', !have("2099타경4") && pend.some(p=>p.c==="2099타경4"&&p.kind==="기간")],
    ['tankOnly 미등록(검증대기)', !have("2099타경5") && pend.some(p=>p.c==="2099타경5"&&p.kind==="검증")],
    ['권리 미확인 미등록(검증대기)', !have("2099타경6") && pend.some(p=>p.c==="2099타경6"&&p.kind==="검증")],
    ['부산 ⭐ 84㎡ 등록', have("2099타경7")],
    ['부산 ⭐ 100㎡ 제외(대기도 아님)', !have("2099타경8") && !pend.some(p=>p.c==="2099타경8")],
    ['대구 9일 제외', !have("2099타경9") && !pend.some(p=>p.c==="2099타경9")],
    ['권리분석보내기 60일 no-check 등록(제한 없음)', have("2099타경10")],
    ['기존 낙찰 보존(매각종료 줄 무시)', (st.marketAuctions.find(m=>m.caseNumber==="2099타경50")||{}).status==="낙찰" && (st.marketAuctions.find(m=>m.caseNumber==="2099타경50")||{}).winningBid===88000000],
    ['기존 ⭐ 이름 → isStar + 원본명', (()=>{const m=st.marketAuctions.find(m=>m.caseNumber==="2099타경50"); return m.buildingName==="기존낙찰단지" && m.isStar===true;})()],
    ['기존 기준 밖 카드 삭제 안 됨', have("2099타경51")],
    ['옛 대기(14일 제한) 물건 → 일괄 등록 아님, 검증대기', !have("2099타경60") && pend.some(p=>p.c==="2099타경60"&&p.kind==="검증")],
    ['⭐ 접두사 분리 저장', (()=>{const m=st.marketAuctions.find(m=>m.caseNumber==="2099타경1 물건1"); return m && m.buildingName==="테스트15일" && m.isStar===true;})()],
  ];
  let fail=0; checks.forEach(c => { if(!c[1]) fail++; console.log((c[1]?'PASS':'FAIL')+'  '+c[0]); });
  // render market page
  const nav = await page.$('[data-view="marketAuction"], [data-rail-view="marketAuction"], [data-goto="marketAuction"]');
  if (nav) { await page.evaluate(el => el.click(), nav); await page.waitForTimeout(800); } else { console.log('NAV_NOT_FOUND'); }
  const txt = await page.evaluate(() => document.body.innerText);
  console.log('NOTICE', (txt.match(/⏳[^\n]*/)||[''])[0].slice(0,300));
  const sortVal = await page.evaluate(() => { const s=document.getElementById('marketSortSelect'); return s ? s.value + '|' + s.options[s.selectedIndex].text : 'NO_SELECT'; });
  const order = await page.evaluate(() => Array.from(document.querySelectorAll('.stage-card-name')).map(e=>e.textContent));
  console.log('SORT_SELECT', sortVal); console.log('CARD_ORDER', JSON.stringify(order));
  console.log('TITLE_STAR', txt.indexOf('⭐ 테스트15일') !== -1, 'SORT_DEFAULT', txt.indexOf('정렬: 우선순위') !== -1, 'VIEWS_PILL', txt.indexOf('조회 321') !== -1, 'CHECK_PILL', txt.indexOf('검증 충족') !== -1);
  await page.screenshot({ path: path + 'e2e_market.png', fullPage: false });
  await browser.close();
  process.exit(fail?1:0);
})().catch(e => { console.error(e); process.exit(2); });
