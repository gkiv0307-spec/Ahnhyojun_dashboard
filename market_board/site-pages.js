/* ══════ 1. 홈 ══════ */
function pgHome(){
  const dg = D.filter(x=>DAEGU.has(x.r));
  const d3 = LIVE.filter(x=>x.d && x.d>=TODAY && x.d<=plusDays(3));
  const kindCount = KINDS.map(k=>({k, n:D.filter(x=>kindOf(x)===k).length})).filter(o=>o.n);
  const recent = D.filter(isSold).slice(0,6);

  return `
  <section class="hero-home" style="margin-top:18px;border-radius:14px;padding:20px 24px;
     background:linear-gradient(105deg,var(--navy-a),var(--navy-b));color:#fff;
     display:flex;flex-wrap:wrap;align-items:center;gap:18px 26px">
    <div style="min-width:0;flex:1 1 320px">
      <span class="eyebrow" style="background:rgba(255,255,255,.14);color:#cfe0ff">
        <span class="dot" style="background:#4ade80"></span>대구권 우선 · 법원 원본 대조</span>
      <h1 style="color:#fff;margin:10px 0 0;font-size:24px;line-height:1.25">법원경매 물건 현황판</h1>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <input id="hq" type="search" placeholder="사건번호 또는 주소로 검색"
          style="flex:1 1 240px;min-width:0;padding:10px 13px;border-radius:9px;border:1px solid rgba(255,255,255,.22);
                 background:rgba(255,255,255,.10);color:#fff;font:inherit;font-size:13.5px">
        <button class="tab on" id="hq-go" data-go="search" style="padding:10px 18px;font-size:13.5px">검색</button>
        <button class="tab" data-go="calendar"
          style="padding:10px 18px;font-size:13.5px;background:rgba(255,255,255,.13);color:#fff">기일 캘린더</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(94px,1fr));gap:10px;flex:1 1 380px;min-width:0">
      ${[['진행중',LIVE.length,'#fff'],
         ['7일 내 기일',LIVE.filter(x=>x.d&&x.d>=TODAY&&x.d<=plusDays(7)).length,'#ffd7a8'],
         ['대구권',DAEGU_GU?D.filter(x=>DAEGU_GU.has((x.a1||'').trim())).length:0,'#a8d8ff'],
         ['법원 대조',VERIFIED.length,'#b7f5cf']].map(([k,v,c])=>`
        <div style="background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);
                    border-radius:10px;padding:10px 12px;min-width:0">
          <div style="font-size:11px;color:#b9c8e6;white-space:nowrap">${k}</div>
          <div class="mono" style="font-size:21px;font-weight:800;color:${c};line-height:1.2">${v}</div>
        </div>`).join('')}
    </div>
  </section>

  ${SRC_NOTE}

  <div class="slay">
    ${fbar()}
    <div class="smain">
    ${(()=>{
      /* 필터를 걸었을 때만 결과를 여기서 보여준다. 아무것도 안 걸었으면
         숨긴다 — 그냥 두면 아래 '입찰 임박' 과 같은 카드가 두 번 나온다. */
      if(!fsCount()) return '';
      const hits = searchHits();
      return `
      <h2 class="sec" style="margin-top:0">조건에 맞는 물건 <span class="mono">${hits.length}</span>건</h2>
      <p class="sub">왼쪽 필터로 좁힌 결과입니다.</p>
      ${fpills()}
      ${hits.length
        ? `<div class="grid">${hits.slice(0,6).map(card).join('')}</div>`
          + (hits.length>6
             ? `<div style="margin-top:12px"><button class="tab on" id="see-all"
                  style="padding:9px 16px">경매검색에서 ${hits.length}건 전부 보기 →</button></div>`
             : '')
        : `<div class="empty">조건에 맞는 물건이 없습니다. 왼쪽에서 조건을 풀어 보십시오.</div>`}`;
    })()}

  ${(()=>{
    /* ── 오늘 볼 것 ── 탭마다 흩어져 있는 '지금 봐야 하는 수'를 한자리에 모은다. */
    const d0 = LIVE.filter(x=>x.d===TODAY).length;
    const d3 = LIVE.filter(x=>x.d && x.d>=TODAY && x.d<=plusDays(3)).length;
    const d7 = LIVE.filter(x=>x.d && x.d>=TODAY && x.d<=plusDays(7));
    const dg7 = d7.filter(x=>DAEGU.has(x.r)).length;
    const cl = LIVE.filter(x=>x.screen==='clean').length;
    const blogN = blogPool().length;
    const unver = D.filter(x=>!x.verified).length;
    const chip = (cls,k,v,u,to) => `<button class="${cls}" data-go="${to}">
      <span class="k">${k}</span><span class="v">${v}</span><span class="u">${u}</span></button>`;
    return `
  <h2 class="sec" style="margin-top:${fsCount()?'34px':'0'}">오늘 볼 것</h2>
  <p class="sub">탭마다 흩어져 있는 수를 한자리에 모았습니다. 누르면 그 탭으로 갑니다.</p>
  <div class="todo">
    ${chip(d0?'hot':'', '오늘 기일', d0, '건', 'calendar')}
    ${chip(d3?'warm':'', '3일 내', d3, '건', 'upcoming')}
    ${chip('', '7일 내', d7.length, `건 · 대구권 ${dg7}`, 'upcoming')}
    ${chip('', '권리 자국 없음', cl, '건 진행중', 'search')}
    ${chip('', '블로그 글감', blogN, '건 남음', 'blog')}
    ${chip('', '법원 미대조', unver, '건', 'search')}
  </div>`;
  })()}

  ${(()=>{
    /* ── 앞으로 2주 기일 ── 캘린더 한 달을 다 펴지 않고 필요한 만큼만 보여준다. */
    const DOW=['일','월','화','수','목','금','토'];
    const cells = Array.from({length:14},(_,i)=>plusDays(i)).map(d=>{
      const it = (BY_DAY[d]||[]).filter(x=>x.st==='진행중');
      const dg = it.filter(x=>DAEGU.has(x.r)).length;
      const dt = new Date(d+'T00:00:00');
      return `<button data-day="${d}" class="${it.length?'':'z'}${d===TODAY?' today':''}"
        title="${d} ${it.length}건${dg?` (대구권 ${dg})`:''}">
        <div class="sd">${d.slice(5).replace('-','/')} ${DOW[dt.getDay()]}</div>
        <div class="sn">${it.length}</div>
        <div class="sg">${dg?`대구 ${dg}`:'&nbsp;'}</div></button>`;
    }).join('');
    return `
  <h2 class="sec">앞으로 2주 기일</h2>
  <p class="sub">진행중 물건의 매각기일입니다. 날짜를 누르면 캘린더의 그날로 갑니다.</p>
  <div class="strip">${cells}</div>`;
  })()}

  ${(()=>{ const s = LIVE.filter(x=>x.d&&x.d>=TODAY&&x.d<=plusDays(7))
              .sort((a,b)=>a.d<b.d?-1:1);
     const dgF = s.filter(x=>DAEGU.has(x.r)), etc = s.filter(x=>!DAEGU.has(x.r));
     /* 여섯 장까지만. dgF 를 안 자르면 대구권 임박이 늘어난 날 이 한 칸이
        카드 수십 장으로 부푼다 — 오늘 56장이 깔렸다. 대구권을 먼저 채우고
        모자란 만큼만 다른 지역으로 메운다. */
     const pick = [...dgF.slice(0,6), ...etc.slice(0,Math.max(0,6-dgF.length))]
                    .sort((a,b)=>a.d<b.d?-1:1);
     return `
  <h2 class="sec">입찰 임박</h2>
  <p class="sub">진행중이면서 7일 내 매각기일이 있는 물건 <b class="mono">${s.length}</b>건
    (대구권 ${dgF.length}건)${s.length>pick.length?` — 기일이 빠른 ${pick.length}건만 보여줍니다.
    <button class="lnk" data-go="upcoming">예정물건에서 전부 보기 →</button>`:''}</p>
  ${pick.length ? `<div class="grid">${pick.map(card).join('')}</div>`
       : `<div class="empty">7일 내 예정된 매각기일이 없습니다.</div>`}`; })()}

  ${(()=>{
    /* ── 권리 자국 없음 ── 바로 위 '입찰 임박' 에 나온 건 뺀다.
       같은 물건을 두 번 보여주면 모아보기가 아니라 반복이다. */
    const s7 = LIVE.filter(x=>x.d&&x.d>=TODAY&&x.d<=plusDays(7)).sort((a,b)=>a.d<b.d?-1:1);
    const dgF = s7.filter(x=>DAEGU.has(x.r)), etc = s7.filter(x=>!DAEGU.has(x.r));
    const shown = new Set([...dgF.slice(0,6), ...etc.slice(0,Math.max(0,6-dgF.length))]
      .map(x=>`${x.ct}|${x.caNo}|${x.ino||1}`));
    const pool = LIVE.filter(x=>x.screen==='clean' && !shown.has(`${x.ct}|${x.caNo}|${x.ino||1}`))
      .sort((a,b)=> (inDaegu(b)-inDaegu(a)) || ((a.d||'9999')<(b.d||'9999')?-1:1));
    if(!pool.length) return '';
    return `
  <h2 class="sec">권리 자국 없음 · 진행중</h2>
  <p class="sub">특이사항이 없고 유찰 1회 이하인 아파트입니다.
    <b>권리분석을 마쳤다는 뜻이 아닙니다.</b> 위 '입찰 임박' 에 나온 건 뺐습니다.</p>
  <div class="dl">${pool.slice(0,6).map(x=>dlRow(x)).join('')}
    ${pool.length>6?dlMore('search',`경매검색에서 ${pool.length}건 전부 보기`):''}</div>`;
  })()}



  ${(()=>{
    /* ── 공매·자동차 ── 탭을 따로 들어가야 보이던 것을 줄로 눕혀 끌어올린다. */
    /* 온비드의 st 는 수집 시점 값이라 마감이 지난 것도 '입찰진행중' 으로 남아
       있다(24건 중 10건이 그랬다). '입찰중' 이라 써 놓고 지난 걸 보여주면
       거짓말이므로 마감이 오늘 이후인 것만 센다. */
    const ob = ONBID.filter(x=>x.st==='입찰진행중' && x.end && x.end>=TODAY)
                    .sort((a,b)=>a.end<b.end?-1:1);
    /* 자동차도 같다 — 기일이 지난 '진행중' 은 보여주지 않는다. */
    const cars = CARS.filter(x=>x.st==='진행중' && (!x.d || x.d>=TODAY))
                     .sort((a,b)=>((a.d||'9999')<(b.d||'9999')?-1:1));
    const block=(title,sub,rows,to,n,label)=>`
  <h2 class="sec">${title}</h2><p class="sub">${sub}</p>
  <div class="dl">${rows}${n>3?dlMore(to,`${label} ${n}건 전부 보기`):''}</div>`;
    return (ob.length? block('공매 입찰중', '한국자산관리공사 온비드. 입찰 마감이 아직 남은 물건을 마감 빠른 순으로 봅니다.',
        ob.slice(0,3).map(x=>dlRow(x,{det:false, date:x.end, title:x.nm||'이름 미색인',
          sub:`${x.a1||''} ${x.a2||''} · ${x.scls||''} · 마감`, amt:won(x.mn), rt:x.rt})).join(''),
        'onbid', ob.length, '온비드'):'')
      + (cars.length? block('자동차 경매', '차량은 부동산과 목록이 따로입니다.',
        cars.slice(0,3).map(x=>dlRow(x,{det:false, date:x.d, title:x.name||x.kind||'차량',
          sub:`${x.caNo||''} · ${x.ct||''}${x.plate?' · '+x.plate:''}`, amt:won(x.mn), rt:x.rt})).join(''),
        'car', cars.length, '자동차'):'');
  })()}

  ${(()=>{
    const N = NEWS.slice().sort((a,b)=>a.date<b.date?1:-1);
    if(!N.length) return '';
    return `
  <h2 class="sec">경매뉴스</h2>
  <p class="sub">네이버 뉴스 검색에서 모읍니다. 제목을 누르면 원문으로 갑니다.</p>
  <div class="dl">${N.slice(0,3).map(x=>`<a class="dl-row" href="${esc(x.url)}"
      target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
      <span class="dl-d">${esc(x.date).slice(5)}</span>
      <span class="dl-t"><b>${esc(x.title)}</b><span>${esc(x.sum||'')}</span></span>
      <span class="dl-n"><span>${esc(x.src||'')}</span></span></a>`).join('')}
    ${dlMore('news',`경매뉴스 ${N.length}건 전부 보기`)}</div>`;
  })()}

  <h2 class="sec">지역별 법원경매</h2>
  <p class="sub">지역을 누르면 경매검색에서 해당 지역 물건만 볼 수 있습니다. 대구·경북을 강조 표시했습니다.</p>
  <div class="panel"><div class="panel-b">
    <div style="display:flex;flex-wrap:wrap;gap:7px">
      ${REGIONS.map(r=>{
        const n = D.filter(x=>x.r===r).length, on = DAEGU.has(r);
        return `<button class="fsel" data-region="${esc(r)}"
          style="${on?'border-color:var(--green);color:var(--green);font-weight:800':''}">
          ${esc(r)} <span class="mono" style="color:${on?'var(--green)':'var(--primary)'}">${n}</span></button>`;
      }).join('')}
    </div>
  </div></div>

  <h2 class="sec">종별 법원경매</h2>
  <p class="sub">용도는 CODEF로 확정된 것 외에는 색인 기준 추정입니다.</p>
  <div class="panel"><div class="panel-b">
    <div style="display:flex;flex-wrap:wrap;gap:7px">
      ${kindCount.map(o=>`<button class="fsel" data-kind="${esc(o.k)}">
        ${esc(o.k)} <span class="mono" style="color:var(--primary)">${o.n}</span></button>`).join('')}
    </div>
  </div></div>

  <h2 class="sec">이전 매각 결과</h2>
  <p class="sub">이미 매각이 끝난 물건입니다. 입찰할 수 없고, 시세 참고용입니다.</p>
  ${recent.length?`<div class="dl">${recent.slice(0,5).map(x=>dlRow(x)).join('')}</div>`
    :`<div class="empty">매각 완료된 물건이 없습니다.</div>`}
    </div>
  </div>

  ${FOOT}`;
}

/* ══════ 2. 경매검색 ══════ */
/* 좌측 검색필터. 기본값과 다른 항목만 '적용' 으로 센다. */
const FS0 = { q:'', court:'전체', yr:'전체', no:'', d1:'', d2:'',
              region:'전체', gu:'전체', st:'진행중', fail:'전체',
              ap:'전체', mn:'전체', kind:[], sp:[], screen:[] };
const FS = Object.assign({}, FS0, {kind:[], sp:[], screen:[]});
const FLAB = { q:'키워드', court:'법원', yr:'사건연도', no:'사건번호', d1:'기일 시작',
               d2:'기일 종료', region:'시·도', gu:'시·군·구', st:'경매결과',
               fail:'유찰횟수', ap:'감정가', mn:'최저가', kind:'부동산구분', sp:'특이사항',
               screen:'선별' };

/* 금액 구간. 값은 원 단위, [최소, 최대) 이고 최대가 null 이면 위로 열려 있다. */
const MONEY = { '전체':null, '1억 이하':[0,1e8], '1~2억':[1e8,2e8], '2~3억':[2e8,3e8],
                '3~5억':[3e8,5e8], '5~10억':[5e8,1e9], '10억 초과':[1e9,null] };
const MONEY_KEYS = Object.keys(MONEY);
function inMoney(v, key){
  if(key==='전체') return true;
  // 금액이 색인되지 않은 물건은 금액 조건에 걸 수 없다. 조용히 통과시키면
  // '3억 이하' 결과에 금액 모르는 물건이 섞인다 — 빼는 쪽이 정직하다.
  if(v==null) return false;
  const [lo,hi] = MONEY[key];
  return v>=lo && (hi==null || v<hi);
}
const fsOn = k => Array.isArray(FS[k]) ? FS[k].length>0 : FS[k]!==FS0[k];
const fsCount = () => Object.keys(FS0).filter(fsOn).length;
function fsReset(){ Object.assign(FS, FS0); FS.kind=[]; FS.sp=[]; FS.screen=[]; }

function searchHits(){
  return D.filter(x=>{
    if(FS.q){ const q=FS.q.toLowerCase();
      if(!`${x.caNo||''} ${x.a||''} ${x.ct||''}`.toLowerCase().includes(q)) return false; }
    if(FS.court!=='전체' && x.ct!==FS.court) return false;
    if(FS.yr!=='전체' && !String(x.caNo||'').startsWith(FS.yr)) return false;
    if(FS.no && String(x.caNo||'').split('타경')[1] !== FS.no) return false;
    // 기일이 색인되지 않은 물건은 기간에 걸 수 없다. 금액과 같은 이유로 뺀다.
    if(FS.d1 && !(x.d && x.d>=FS.d1)) return false;
    if(FS.d2 && !(x.d && x.d<=FS.d2)) return false;
    if(FS.region!=='전체' && x.r!==FS.region) return false;
    if(FS.gu!=='전체' && (x.a1||'').trim()!==FS.gu) return false;
    if(FS.kind.length && !FS.kind.includes(kindOf(x))) return false;
    if(FS.st==='진행중' && x.st!=='진행중') return false;
    // 나이스옥션 색인분은 진행상태가 없다. '진행중' 으로 뭉뚱그리면
    // 이미 끝난 사건이 첫 화면을 덮는다. 별도 값으로 두고 따로 고른다.
    if(FS.st==='상태 미확인' && x.st!=='미확인') return false;
    if(FS.st==='매각' && !isSold(x)) return false;
    if(FS.st==='종료' && x.st!=='종료') return false;
    if(FS.st==='법원 확인분' && !x.verified) return false;
    if(FS.fail!=='전체'){ const f=x.f ?? -1;
      if(FS.fail==='신건' && f!==0) return false;
      if(FS.fail==='1~3회' && !(f>=1&&f<=3)) return false;
      if(FS.fail==='4~6회' && !(f>=4&&f<=6)) return false;
      if(FS.fail==='7회 이상' && !(f>=7)) return false; }
    if(!inMoney(x.ap, FS.ap)) return false;
    if(!inMoney(x.mn, FS.mn)) return false;
    if(FS.sp.length && !(x.sp||[]).some(s=>FS.sp.includes(s))) return false;
    if(FS.screen.length && !FS.screen.includes(SCREEN_LAB[x.screen]||'판정 불가')) return false;
    return true;
  }).sort(SORTS[S.sort] || SORTS['기일 임박순']);
}

/* 정렬. **기본은 기일 임박순이다.**
   예전 기본은 최저가율 낮은순이었는데, 그러면 첫 화면이 1% 짜리로 덮인다.
   최저가율이 바닥이라는 건 유찰이 그만큼 쌓였다는 뜻이고 대개 이유가 있는
   물건이다. 처음 온 사람이 제일 먼저 보게 될 목록은 '지금 입찰할 수 있는
   것' 이어야지 '아무도 안 사 간 것' 이 아니다. */
const SORTS = {
  /* 앞으로 올 기일이 먼저, 가까운 것부터. 그다음이 이미 지난 기일(최근 것
     부터), 마지막이 기일 미색인이다. 날짜만 오름차순으로 정렬하면 색인이
     낡아 이미 지난 기일이 맨 앞에 온다 — '임박' 이라 써 놓고 지난 걸
     보여주게 된다. */
  '기일 임박순': (a,b) => {
    const rank = x => !x.d ? 2 : x.d >= TODAY ? 0 : 1;
    const ra = rank(a), rb = rank(b);
    if(ra !== rb) return ra - rb;
    if(ra === 2) return 0;
    // 지난 기일끼리는 최근 것이 먼저다.
    return ra === 0 ? (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)
                    : (a.d > b.d ? -1 : a.d < b.d ? 1 : 0);
  },
  '최저가율 낮은순': (a,b) => {
    const A=ratioOf(a), B=ratioOf(b);
    if(A==null) return 1; if(B==null) return -1; return A-B;
  },
  '최저가 낮은순': (a,b) => (a.mn ?? Infinity) - (b.mn ?? Infinity),
  '감정가 높은순': (a,b) => (b.ap ?? -1) - (a.ap ?? -1),
};

/* 자주 쓰는 조합. 사이드바에 조작 요소가 34개인데, 처음 온 사람은 그중
   무엇을 눌러야 할지 모른다. 한 번에 걸리는 단추로 대신 준다.
   누르면 **기존 조건을 지우고** 그 조합만 건다 — 남은 조건이 섞이면
   눌렀는데 0건이 나오고, 왜인지 알 수 없다. */
const PRESETS = [
  {k:'대구권 아파트',   f:{region:'대구', kind:['아파트'], st:'진행중'}},
  {k:'이번 주 기일',    f:{st:'진행중', d1:TODAY, d2:plusDays(7)}},
  {k:'권리 자국 없음',  f:{st:'진행중', screen:['권리 자국 없음']}},
  {k:'최저가 1억 이하', f:{st:'진행중', mn:'1억 이하'}},
  {k:'법원 확인분',     f:{st:'법원 확인분'}},
];
function presetOn(pre){
  return Object.entries(pre.f).every(([k,v]) =>
    Array.isArray(v) ? v.length===FS[k].length && v.every(x=>FS[k].includes(x)) : FS[k]===v)
    && fsCount() === Object.keys(pre.f).filter(k=>{
         const v=pre.f[k]; return Array.isArray(v) ? v.length>0 : v!==FS0[k]; }).length;
}
function applyPreset(i){
  fsReset();
  const f = PRESETS[i].f;
  for(const [k,v] of Object.entries(f)) FS[k] = Array.isArray(v) ? [...v] : v;
}

function fbar(){
  const scope = D.filter(x=>FS.region==='전체'||x.r===FS.region);
  const courts = [...new Set(scope.map(x=>x.ct).filter(Boolean))].sort();
  const gus    = [...new Set(scope.map(x=>(x.a1||'').trim()).filter(Boolean))].sort();
  const sps    = [...new Set(D.flatMap(x=>x.sp||[]))].sort();
  const yrs    = [...new Set(D.map(x=>String(x.caNo||'').slice(0,4)))]
                   .filter(v=>/^\d{4}$/.test(v)).sort().reverse();
  const n = fsCount();
  const opt=(v,cur)=>`<option value="${esc(v)}"${v===cur?' selected':''}>${esc(v)}</option>`;
  const sel=(id,vals,cur)=>`<select class="fsel w" id="${id}">${vals.map(v=>opt(v,cur)).join('')}</select>`;
  const grp=(lab,inner,hint)=>`<div class="fgrp"><div class="flab">${lab}</div>${inner}${
    hint?`<div class="fhint">${hint}</div>`:''}</div>`;
  const chips=(attr,vals,on)=>`<div class="fchips">${vals.map(([v,c])=>
    `<button class="fchip${on.includes(v)?' on':''}" data-${attr}="${esc(v)}"
       aria-pressed="${on.includes(v)}">${esc(v)}<i class="mono">${c}</i></button>`).join('')}</div>`;

  return `
  <aside class="fbar" id="fbar">
    <div class="fbar-h">
      <b>검색필터</b>
      <span class="chip${n?' g':''}">${n?`적용 ${n}개`:'전체'}</span>
      <span style="flex:1"></span>
      <button class="fsel fbar-t" id="fbar-t">펼치기</button>
      <button class="fsel" id="reset"${n?'':' disabled'}>초기화</button>
    </div>
    <div class="fbar-b">
      ${grp('자주 쓰는 조합',
         `<div class="fchips">${PRESETS.map((pre,i)=>{
            const n = (()=>{ const save=JSON.stringify(FS); applyPreset(i);
              const c = searchHits().length; Object.assign(FS, JSON.parse(save)); return c; })();
            return `<button class="fchip${presetOn(pre)?' on':''}" data-fpre="${i}"
              aria-pressed="${presetOn(pre)}">${esc(pre.k)}<i class="mono">${n}</i></button>`;
          }).join('')}</div>`,
         '누르면 지금 걸린 조건을 지우고 그 조합만 겁니다.')}

      ${grp('키워드', `<input class="fsel w" id="q" type="search" value="${esc(FS.q)}"
         placeholder="사건번호 또는 주소" aria-label="키워드 검색">`)}

      ${grp('법원', sel('f-court', ['전체',...courts], FS.court))}

      ${grp('사건번호', `<div class="frow">${sel('f-yr',['전체',...yrs],FS.yr)}
         <span class="fmid">타경</span>
         <input class="fsel" id="f-no" type="text" inputmode="numeric" placeholder="번호"
           value="${esc(FS.no)}" style="width:76px" aria-label="사건번호">
       </div>`)}

      ${/* 날짜칸 둘을 262px 안에 나란히 두면 'mm/dd/yyyy' 가 잘린다. 세로로 쌓는다. */''
      }${grp('매각기일', `<div class="fdate">
         <span class="fmid">시작</span><input class="fsel w" id="f-d1" type="date"
           value="${esc(FS.d1)}" aria-label="기일 시작">
         <span class="fmid">종료</span><input class="fsel w" id="f-d2" type="date"
           value="${esc(FS.d2)}" aria-label="기일 종료">
       </div>`, `기일이 색인된 물건은 ${DATED.length}건입니다. 기간을 걸면 나머지 ${D.length-DATED.length}건은 빠집니다.`)}

      ${grp('소재지', `<div class="fdate">
         <span class="fmid">시·도</span>${sel('f-region', ['전체',...REGIONS], FS.region)}
         <span class="fmid">시·군·구</span>${sel('f-gu', ['전체',...gus], FS.gu)}
       </div>`, `주소가 색인되지 않은 ${D.filter(x=>!x.r).length}건은 지역을 걸면 빠집니다.`)}

      ${grp('경매결과', sel('f-st', ['전체','진행중','상태 미확인','매각','종료','법원 확인분'], FS.st))}
      ${grp('유찰횟수', sel('f-fail', ['전체','신건','1~3회','4~6회','7회 이상'], FS.fail))}

      ${grp('감정가', sel('f-ap', MONEY_KEYS, FS.ap),
         `감정가 색인 ${D.filter(x=>x.ap).length}건`)}
      ${grp('최저가', sel('f-mn', MONEY_KEYS, FS.mn),
         `최저가 색인 ${D.filter(x=>x.mn).length}건`)}

      ${grp('부동산구분',
         chips('fkind', KINDS.map(k=>[k, D.filter(x=>kindOf(x)===k).length]).filter(o=>o[1]), FS.kind),
         '용도는 CODEF로 확정된 것 외에는 색인 기준 추정입니다.')}

      ${grp('선별',
         chips('fscr', SCREEN_ORDER.map(v=>[v, D.filter(x=>(SCREEN_LAB[x.screen]||'판정 불가')===v
             && x.ut==='아파트' && x.st!=='종료' && x.st!=='매각').length]).filter(o=>o[1]), FS.screen),
         '아파트만 매깁니다. 특이사항·유찰횟수로 거른 것이라 '
         + '<b>권리분석을 마쳤다는 뜻이 아닙니다.</b>')}

      ${grp('특이사항',
         chips('fsp', sps.map(s=>[s, D.filter(x=>(x.sp||[]).includes(s)).length]), FS.sp),
         '여러 개를 고르면 하나라도 해당하는 물건을 보여줍니다.')}
    </div>
  </aside>`;
}

/* 걸린 조건을 결과 위에 다시 늘어놓는다. × 를 누르면 그 조건만 풀린다. */
function fpills(){
  const on = Object.keys(FS0).filter(fsOn);
  if(!on.length) return '';
  const pill=(k,v,clr)=>`<button class="fpill" data-clr="${esc(clr)}"
     aria-label="${esc(FLAB[k])} 조건 해제"><em>${esc(FLAB[k])}</em>${esc(v)}<span>×</span></button>`;
  return `<div class="fpills">${on.map(k=> Array.isArray(FS[k])
      ? FS[k].map(v=>pill(k,v,k+':'+v)).join('')
      : pill(k, FS[k], k)).join('')}</div>`;
}

function pgSearch(){
  const hits = searchHits();
  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>법원경매 통합검색 · 대법원경매정보 조회</span>
    <h1>법원경매 검색</h1>
    <p class="dek">필터로 법원·사건번호·매각기일·소재지·금액을 좁혀 봅니다.</p>
  </header>

  <div class="slay">
    ${fbar()}
    <div class="smain">
      <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px">
        <div><h2 class="sec" style="margin:0">경매물건 <span class="mono">${hits.length}</span>건</h2>
          <p class="sub">${STAMP} 기준 · 매각·종결 물건은 흐리게 표시</p></div>
        <span style="flex:1"></span>
        <select class="fsel" id="f-sort" aria-label="정렬">${Object.keys(SORTS).map(k=>
          `<option value="${esc(k)}"${k===S.sort?' selected':''}>${esc(k)}</option>`).join('')}</select>
        <div class="seg"><button data-v="card" class="${S.view==='card'?'on':''}">카드형</button>
          <button data-v="list" class="${S.view==='list'?'on':''}">리스트형</button></div>
        <div class="seg"><span class="lb">면적</span>
          <button data-u="m2" class="${S.unit==='m2'?'on':''}">㎡</button>
          <button data-u="py" class="${S.unit==='py'?'on':''}">평</button></div>
      </div>
      ${fpills()}
      ${listOf(hits)}
      ${SRC_NOTE}
    </div>
  </div>
  ${FOOT}`;
}

/* ══════ 3. 예정물건 ══════ */
let UPD = 14;
function pgUpcoming(){
  const lim = plusDays(UPD);
  const items = UPCOMING.filter(x=>x.d<=lim);
  const dg = items.filter(x=>DAEGU.has(x.r));
  const byDay = {};
  for(const x of items) (byDay[x.d] ??= []).push(x);
  const days = Object.keys(byDay).sort();
  const DOW=['일','월','화','수','목','금','토'];
  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>예정물건 · 매각기일 순</span>
    <h1>예정물건</h1>
    <p class="dek">매각기일이 아직 남은 진행중 물건입니다. 기일이 색인되지 않은 물건은 여기 올라오지 않습니다.</p>
  </header>

  <div class="stats">
    <div class="stat hl"><div class="stat-k">${UPD}일 내 예정</div>
      <div class="stat-v"><span class="n mono">${items.length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">그중 대구권</div>
      <div class="stat-v"><span class="n mono">${dg.length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">기일 있는 진행중 전체</div>
      <div class="stat-v"><span class="n mono">${UPCOMING.length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">기일 미색인</div>
      <div class="stat-v"><span class="n mono">${D.length-DATED.length}</span><span class="u">건</span></div></div>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px">
    <div class="seg">${[7,14,30,90].map(k=>
      `<button data-up="${k}" class="${UPD===k?'on':''}">${k}일</button>`).join('')}</div>
    <span style="flex:1"></span>
    <div class="seg"><button data-v="card" class="${S.view==='card'?'on':''}">카드형</button>
      <button data-v="list" class="${S.view==='list'?'on':''}">리스트형</button></div>
  </div>

  ${days.length ? days.map(d=>{
      const [y,m,dd]=d.split('-').map(Number);
      const n = byDay[d].length, ndg = byDay[d].filter(x=>DAEGU.has(x.r)).length;
      return `<h2 class="sec" style="font-size:16px">${d.replace(/-/g,'.')} ${DOW[new Date(y,m-1,dd).getDay()]}요일
        <span class="chip" style="margin-left:6px">${n}건</span>
        ${ndg?`<span class="chip g">대구권 ${ndg}</span>`:''}</h2>
      ${listOf(byDay[d])}`;
    }).join('')
    : `<div class="empty">${UPD}일 내 예정된 매각기일이 없습니다. 기간을 넓혀 보세요.</div>`}
  ${FOOT}`;
}

/* ══════ 4. 캘린더 ══════ */
const CAL = { y:NOW.getFullYear(), m:NOW.getMonth()+1, sel:TODAY, mode:'day' };
function pgCalendar(){
  const first = new Date(CAL.y, CAL.m-1, 1).getDay();
  const n = new Date(CAL.y, CAL.m, 0).getDate();
  const prevN = new Date(CAL.y, CAL.m-1, 0).getDate();
  let cells = [];
  for(let i=first-1;i>=0;i--) cells.push({pad:true,d:prevN-i});
  for(let d=1;d<=n;d++) cells.push({d,key:iso(CAL.y,CAL.m,d)});
  while(cells.length%7) cells.push({pad:true,d:cells.length-first-n+1});

  const monthItems = DATED.filter(x=>x.d.startsWith(`${CAL.y}-${pad(CAL.m)}`));
  const nod = D.filter(x=>!x.d);
  const selItems = CAL.mode==='nodate' ? nod : (BY_DAY[CAL.sel]||[]);
  const byCourt = {};
  for(const x of selItems) (byCourt[x.ct] ??= []).push(x);
  const [sy,sm,sd] = CAL.sel.split('-').map(Number);
  const DOW=['일','월','화','수','목','금','토'];

  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>경매캘린더 · 날짜별 매각 일정</span>
    <h1>매각기일 캘린더</h1>
    <p class="dek">매각기일을 날짜와 법원으로 확인합니다. 날짜를 누르면 그날 예정된 물건만 아래에 표시됩니다.</p>
  </header>

  <div class="panel"><div class="panel-b" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
    <button class="fsel" data-cal="first">처음</button>
    <button class="fsel" data-cal="prev">이전</button>
    <span style="display:flex;align-items:baseline;gap:3px;margin:0 6px">
      <span class="mono" style="font-size:20px">${CAL.y}</span>
      <span style="font-size:13px;color:var(--muted-fg);font-weight:600;margin-right:7px">년</span>
      <span class="mono" style="font-size:25px">${CAL.m}</span>
      <span style="font-size:13px;color:var(--muted-fg);font-weight:600">월</span></span>
    <button class="fsel" data-cal="next">다음</button>
    <button class="fsel" data-cal="last">끝</button>
    <span style="flex:1"></span>
    <button class="tab on" data-cal="today" style="padding:8px 15px">오늘로</button>
  </div></div>

  <div class="stats">
    <div class="stat"><div class="stat-k">월 전체</div>
      <div class="stat-v"><span class="n mono">${monthItems.length}</span><span class="u">건</span></div></div>
    <div class="stat hl"><div class="stat-k">선택일</div>
      <div class="stat-v"><span class="n mono">${CAL.mode==='nodate'?'—':(BY_DAY[CAL.sel]||[]).length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">법원</div>
      <div class="stat-v"><span class="n mono">${Object.keys(byCourt).length}</span><span class="u">곳</span></div></div>
    <button class="stat as-btn${CAL.mode==='nodate'?' on':''}" data-cal="nodate">
      <div class="stat-k">기일 미색인 · 눌러서 보기</div>
      <div class="stat-v"><span class="n mono">${nod.length}</span><span class="u">건</span></div></button>
  </div>

  <section class="panel">
    <div class="panel-h"><h3>매각일정 캘린더</h3>
      <span class="chip">${CAL.y}.${pad(CAL.m)} · ${monthItems.length}건</span>
      <span class="sp"></span><span class="chip g">초록 = 대구권</span></div>
    <div class="panel-b">
      <div class="cal-head">${DOW.map((d,i)=>
        `<span class="${i===0?'sun':i===6?'sat':''}">${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.map((c,i)=>{
        const dow=i%7;
        if(c.pad) return `<div class="day pad"><span class="dn">${c.d}</span></div>`;
        const it = BY_DAY[c.key]||[], dgn = it.filter(x=>DAEGU.has(x.r)).length;
        const cls = ['day',dow===0?'sun':'',dow===6?'sat':'',it.length?'has':'',
          c.key===TODAY?'today':'', (CAL.mode==='day'&&c.key===CAL.sel)?'sel':''].filter(Boolean).join(' ');
        return `<button class="${cls}" data-day="${c.key}" aria-label="${c.key} ${it.length}건">
          <span class="dn">${c.d}</span>${it.length?`<span class="cnt">${it.length}</span>`:''}
          ${dgn?`<span class="dg">대구 ${dgn}</span>`:''}</button>`;
      }).join('')}</div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-h"><h3>${CAL.mode==='nodate'?'기일 미색인 물건':'선택일 법원별 현황'}</h3>
      <span class="chip mono">${CAL.mode==='nodate'?`${nod.length}건`:CAL.sel.replace(/-/g,'.')}</span></div>
    <div class="panel-b">${Object.keys(byCourt).length
      ? `<div style="display:flex;flex-wrap:wrap;gap:7px">${Object.keys(byCourt).sort().map(k=>{
          const isDg = byCourt[k].some(x=>DAEGU.has(x.r));
          return `<span class="fsel"${isDg?' style="border-color:var(--green);color:var(--green)"':''}>
            ${esc(k)} <span class="mono" style="color:${isDg?'var(--green)':'var(--primary)'}">${byCourt[k].length}</span></span>`;
        }).join('')}</div>`
      : '<p style="margin:0;color:var(--muted-fg);font-size:13px">해당 날짜에 매각기일이 없습니다.</p>'}
    </div>
  </section>

  <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-top:22px">
    <div><h2 class="sec" style="margin:0">${CAL.mode==='nodate'?'기일 미색인 물건':'매각 예정 물건'}
        <span class="mono">${selItems.length}</span>건</h2>
      <p class="sub">${CAL.mode==='nodate'
        ? '매각기일이 색인되지 않은 물건입니다. 기일이 없다는 뜻이 아니라 확인하지 못했다는 뜻입니다.'
        : `${CAL.sel.replace(/-/g,'.')} ${DOW[new Date(sy,sm-1,sd).getDay()]}요일`}</p></div>
    <span style="flex:1"></span>
    <div class="seg"><button data-v="card" class="${S.view==='card'?'on':''}">카드형</button>
      <button data-v="list" class="${S.view==='list'?'on':''}">리스트형</button></div>
  </div>
  ${listOf(selItems)}
  ${FOOT}`;
}

/* ══════ 5. 경매지도 (권역 집계) ══════ */
function pgMap(){
  const byR = REGIONS.map(r=>{
    const all = D.filter(x=>x.r===r);
    return {r, n:all.length, live:all.filter(x=>x.st==='진행중').length};
  }).filter(o=>o.n);
  const mx = Math.max(...byR.map(o=>o.n));
  // 남한 시도의 대략적 배치. 실제 좌표가 아니라 읽기 위한 도식이다.
  const POS = {서울:[3,0],경기:[3,1],인천:[2,1],강원:[5,0],충북:[4,2],충남:[2,2],대전:[3,3],
    세종:[3,2],전북:[2,4],전남:[2,6],광주:[1,5],경북:[5,2],대구:[5,3],울산:[6,4],
    부산:[5,5],경남:[4,5],제주:[1,7]};
  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>경매지도 · 권역 집계</span>
    <h1>경매물건 지도</h1>
    <p class="dek">권역별 물건 수를 한눈에 봅니다. 진한 칸일수록 물건이 많습니다.</p>
  </header>

  <div class="notice" style="border-color:var(--border);background:var(--muted)">
    <span class="pk" style="color:var(--muted-fg)">지도 안내</span>
    <p><b>이것은 실제 위치를 찍은 지도가 아니라 권역별 집계 도식입니다.</b>
    물건의 위경도 좌표가 수집 데이터에 없고, 이 페이지는 외부 지도 타일을 불러올 수 없습니다.
    없는 좌표를 만들어 지도에 찍는 대신, 있는 정보(권역·시군구)만으로 배치했습니다.
    칸의 위치는 대략적인 방위이지 실제 지리가 아닙니다.</p></div>

  <section class="panel">
    <div class="panel-h"><h3>권역별 물건 분포</h3><span class="sp"></span>
      <span class="chip g">초록 테두리 = 대구권</span></div>
    <div class="panel-b">
      <div class="map-grid">
        ${(()=>{ let out=[];
          for(let row=0; row<8; row++) for(let col=0; col<7; col++){
            const hit = Object.entries(POS).find(([,p])=>p[0]===col&&p[1]===row);
            if(!hit){ out.push('<span></span>'); continue; }
            const r = hit[0], o = byR.find(z=>z.r===r);
            if(!o){ out.push('<span></span>'); continue; }
            const t = o.n/mx, dgc = DAEGU.has(r);
            out.push(`<button class="map-cell${dgc?' dg':''}" data-region="${esc(r)}"
              title="${r} ${o.n}건 (진행중 ${o.live})"
              style="background:color-mix(in oklab, var(--primary) ${Math.round(t*72+8)}%, var(--card));
                     color:${t>.45?'#fff':'var(--foreground)'}">
              <span class="mc-r">${esc(r)}</span><span class="mc-n mono">${o.n}</span></button>`);
          }
          return out.join(''); })()}
      </div>
    </div>
  </section>

  <h2 class="sec">권역별 상세</h2>
  <p class="sub">진행중 기준으로 정렬했습니다. 지역을 누르면 경매검색으로 넘어갑니다.</p>
  <div class="tblwrap"><table style="min-width:520px">
    <thead><tr><th>권역</th><th style="text-align:right">전체</th>
      <th style="text-align:right">진행중</th><th style="text-align:right">법원 확인</th>
      <th style="text-align:right">시군구</th></tr></thead>
    <tbody>${byR.slice().sort((a,b)=>b.live-a.live||b.n-a.n).map(o=>{
      const all = D.filter(x=>x.r===o.r);
      const gus = new Set(all.map(x=>x.a1).filter(Boolean));
      return `<tr><td><button class="fsel" data-region="${esc(o.r)}"
          style="${DAEGU.has(o.r)?'border-color:var(--green);color:var(--green);font-weight:800':''}">${esc(o.r)}</button></td>
        <td class="n mono">${o.n}</td><td class="n mono" style="color:var(--primary)">${o.live}</td>
        <td class="n mono">${all.filter(x=>x.verified).length}</td>
        <td class="n mono">${gus.size}</td></tr>`;
    }).join('')}</tbody></table></div>
  ${FOOT}`;
}

/* ══════ 6. 아파트/건물 정보 ══════ */
const AS = { gu:'전체', q:'' };
function pgApt(){
  let rows = APTS.filter(a=>(AS.gu==='전체'||a.gu===AS.gu) &&
    (!AS.q || (a.nm+a.dong).toLowerCase().includes(AS.q.toLowerCase())));
  rows = rows.slice(0,160);
  const gus = [...new Set(APTS.map(a=>a.gu))];
  // 경매 물건과 단지명이 일치하는 것 표시
  const auctionNames = new Set(D.filter(x=>x.tx).map(x=>x.tx.nm));
  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>국토교통부 실거래가 · 공식 데이터</span>
    <h1>아파트 · 건물 정보</h1>
    <p class="dek">대구권 9개 시군구의 아파트 매매 실거래가입니다. 경매 물건의 최저가가 시세 대비 어디쯤인지 대조하는 데 씁니다.</p>
  </header>

  <div class="notice" style="border-color:var(--green);background:var(--green-soft)">
    <span class="pk" style="color:var(--green)">공식 데이터</span>
    <p>이 페이지의 금액은 <b>국토교통부 아파트 매매 실거래가 오픈API</b>에서 직접 받은 신고 실거래가입니다.
    경매 물건과 달리 색인 추정이 아닙니다. 다만 <b>거래가 3건 이상인 단지만</b> 실었습니다 —
    표본이 한두 건이면 시세라고 부를 수 없습니다. 최근 3개월(2026-06~08) 기준입니다.</p></div>

  <div class="stats">
    <div class="stat"><div class="stat-k">수집 거래</div>
      <div class="stat-v"><span class="n mono">5,065</span><span class="u">건</span></div></div>
    <div class="stat hl"><div class="stat-k">단지</div>
      <div class="stat-v"><span class="n mono">${APTS.length}</span><span class="u">개</span></div></div>
    <div class="stat"><div class="stat-k">시군구</div>
      <div class="stat-v"><span class="n mono">${gus.length}</span><span class="u">곳</span></div></div>
    <div class="stat"><div class="stat-k">경매 물건과 매칭</div>
      <div class="stat-v"><span class="n mono">${D.filter(x=>x.tx).length}</span><span class="u">건</span></div></div>
  </div>

  <div class="panel"><div class="panel-b" style="display:flex;gap:8px;flex-wrap:wrap">
    <input class="fsel" id="apt-q" type="search" placeholder="단지명 또는 법정동" value="${esc(AS.q)}"
      style="flex:1;min-width:200px;font-weight:500" aria-label="단지 검색">
    <select class="fsel" id="apt-gu">${['전체',...gus].map(g=>
      `<option${g===AS.gu?' selected':''}>${esc(g)}</option>`).join('')}</select>
  </div></div>

  <h2 class="sec">단지별 실거래 <span class="mono">${rows.length}</span>개</h2>
  <p class="sub">거래 건수 순. 최대 160개까지 표시합니다. <b>경매</b> 표시는 현재 보드의 경매 물건과 단지명이 일치하는 곳입니다.</p>
  ${rows.length?`<div class="tblwrap"><table>
    <thead><tr><th>단지</th><th>법정동</th><th style="text-align:right">거래</th>
      <th style="text-align:right">중위가</th><th style="text-align:right">최저~최고</th>
      <th style="text-align:right">전용면적</th><th style="text-align:right">준공</th></tr></thead>
    <tbody>${rows.map(a=>`<tr>
      <td><b>${esc(a.nm)}</b>${auctionNames.has(a.nm)?' <span class="chip r" style="font-size:9.5px">경매</span>':''}
        <div class="t-sub">${esc(a.gu)}</div></td>
      <td>${esc(a.dong)}</td>
      <td class="n mono">${a.n}</td>
      <td class="n mono" style="color:var(--primary)">${won(a.med)}</td>
      <td class="n t-sub">${won(a.min)} ~ ${won(a.max)}</td>
      <td class="n t-sub">${a.arMin}~${a.arMax}㎡</td>
      <td class="n t-sub">${esc(a.yr||'—')}</td></tr>`).join('')}</tbody></table></div>`
    :`<div class="empty">조건에 맞는 단지가 없습니다.</div>`}
  ${FOOT}`;
}

/* ══════ 7. 경매위키 ══════ */
const WIKI = [
  {cat:'경매 입문', icon:'🏠', items:[
    {t:'사건번호 읽는 법', d:'<b>2025타경8313</b> 은 2025년에 접수된 부동산경매(타경) 8313번 사건입니다. 뒤에 <b>[2]</b> 같은 물건번호가 붙으면 같은 사건 안의 두 번째 물건이라는 뜻입니다. 한 사건에 물건이 수십 개 달리기도 해서, 사건번호만으로는 물건을 특정할 수 없습니다. 이 보드가 (법원, 사건번호, 물건번호) 세 개를 묶어 키로 쓰는 이유입니다.'},
    {t:'유찰과 저감', d:'입찰자가 없으면 유찰되고, 다음 기일의 최저매각가격이 통상 20~30% 내려갑니다. 유찰이 쌓이면 최저가율(감정가 대비 최저가)이 떨어집니다. <b>다만 가격이 낮은 데는 이유가 있습니다.</b> 유찰 6회 이상이면 권리관계나 물건 상태에 문제가 있는지 먼저 의심해야 합니다.'},
    {t:'최저가율이 100%로 돌아가는 경우', d:'유찰 기록이 여러 번인데 최저가가 감정가와 같아지는 일이 있습니다. 절차 변경·재매각으로 가격이 리셋된 것입니다. 이 보드에서는 해당 물건 카드에 사유를 표시합니다. 현재 3건이 여기 해당합니다.'},
  ]},
  {cat:'권리분석', icon:'📋', items:[
    {t:'말소기준권리', d:'경매로 소멸하는 권리와 낙찰자가 인수하는 권리를 가르는 기준입니다. 통상 (근)저당권·압류·가압류·담보가등기·경매개시결정등기 중 <b>가장 먼저 등기된 것</b>이 기준이 되고, 그보다 뒤에 온 권리는 원칙적으로 소멸합니다. 앞선 권리는 남습니다.'},
    {t:'대항력 있는 임차인', d:'주택 인도 + 전입신고를 마친 임차인은 다음 날 0시부터 대항력이 생깁니다. 이 시점이 말소기준권리보다 <b>빠르면</b> 낙찰자가 보증금을 인수할 수 있습니다. 배당요구를 했는지, 확정일자가 있는지, 배당으로 전액 회수되는지까지 봐야 실제 인수액이 나옵니다.'},
    {t:'이 보드가 담지 못하는 것', d:'<b>등기부등본·현황조사서·매각물건명세서는 이 보드에 없습니다.</b> 권리분석의 핵심 자료가 통째로 빠져 있다는 뜻입니다. 여기서 확인할 수 있는 것은 금액·기일·유찰횟수·일부 특수권리 표시까지입니다. 입찰 판단은 반드시 법원 원본 서류로 하십시오.'},
  ]},
  {cat:'특수권리', icon:'⚠️', items:[
    {t:'유치권', d:'공사대금 등 채권이 있는 사람이 목적물을 점유하며 인도를 거절하는 권리입니다. 등기부에 안 나오고 신고로만 드러나며, <b>낙찰자가 인수</b>합니다. 신고가 있다고 항상 성립하는 것은 아니어서 소송으로 다투는 일이 잦습니다. 현재 보드에 유치권 표시 3건이 있습니다.'},
    {t:'법정지상권', d:'토지와 건물의 소유자가 같았다가 경매로 달라질 때, 건물 소유자가 토지를 계속 쓸 수 있게 되는 권리입니다. 성립하면 토지 낙찰자는 건물을 철거하지 못하고 지료만 받습니다. 토지만 나온 물건에서 특히 확인해야 합니다.'},
    {t:'별도등기 · 재매각 · 특별매각조건', d:'<b>별도등기</b>는 집합건물 대지권에 딸린 별도 권리가 있다는 표시입니다. <b>재매각</b>은 낙찰자가 대금을 내지 않아 다시 파는 것으로, 보증금이 통상 20~30%로 올라갑니다. <b>특별매각조건</b>은 법원이 정한 추가 조건입니다. 현재 보드에 특별매각조건 4 · 재매각 4 · 별도등기 2건이 표시돼 있습니다.'},
  ]},
  {cat:'가격 읽기', icon:'💰', items:[
    {t:'감정가 · 최저가 · 낙찰가', d:'<b>감정가</b>는 감정평가액, <b>최저매각가격</b>은 그 기일에 그 아래로는 못 쓰는 하한선, <b>낙찰가</b>는 실제 낙찰된 금액입니다. 최저가율은 감정가 대비 최저가 비율입니다. 감정가는 감정 시점 기준이라 시장이 움직였으면 현재 시세와 벌어집니다.'},
    {t:'실거래가와 대조하는 이유', d:'감정가만 보면 과대평가된 물건을 걸러낼 수 없습니다. 이 보드는 국토교통부 실거래가를 같은 단지·같은 전용면적대로 묶어 중위값을 붙입니다. 단지명이 <b>정확히 일치</b>할 때만 붙이고, 부분일치는 버립니다 — 범물영남보성에 범물영남을 붙이면 다른 단지 시세가 됩니다.'},
    {t:'≈ 표시의 뜻', d:'최저가 앞의 <b>≈</b> 는 색인이 유효숫자 2자리로 반올림한 값이라는 뜻입니다. 법원 확정가가 아닙니다. CODEF로 대조를 마친 값에는 ≈ 가 없습니다. 검색 색인으로 유찰을 확인해 다음 최저가를 저감 계단(×0.7·×0.8)으로 계산한 값에도 ≈ 가 붙습니다.'},
  ]},
];
function pgWiki(){
  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>경매위키 · 실전 용어와 권리분석</span>
    <h1>경매위키</h1>
    <p class="dek">모르는 용어를 찾고, 입찰 판단으로 연결합니다.</p>
  </header>

  <div class="notice">
    <span class="pk">읽기 전에</span>
    <p>아래 설명은 <b>일반적인 제도 안내이지 법률 자문이 아닙니다.</b> 실제 사건의 권리관계는 등기부·현황조사서·매각물건명세서를 봐야 하고,
    특수권리가 걸린 물건은 전문가 검토가 필요합니다. 이 보드에는 그 서류들이 없습니다.</p></div>

  ${WIKI.map(g=>`
    <h2 class="sec">${g.icon} ${g.cat}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-top:12px">
      ${g.items.map(i=>`<div class="panel" style="margin:0"><div class="panel-b">
        <h3 style="margin:0 0 8px;font-size:14.5px;font-weight:800;letter-spacing:-.02em">${i.t}</h3>
        <p style="margin:0;font-size:13px;color:var(--muted-fg);line-height:1.75">${i.d}</p>
      </div></div>`).join('')}
    </div>`).join('')}
  ${FOOT}`;
}

/* ══════ 8. 경매뉴스 ══════ */
let NDESK = '전체';
function pgNews(){
  const desks = ['전체',...new Set(NEWS.map(n=>n.desk))];
  const items = NDESK==='전체' ? NEWS : NEWS.filter(n=>n.desk===NDESK);
  const sorted = items.slice().sort((a,b)=>a.date<b.date?1:-1);
  const [head,...rest] = sorted;
  return `
  <header class="phead">
    <span class="eyebrow"><span class="dot"></span>경매뉴스 · 데스크별 최신 기사</span>
    <h1>경매뉴스</h1>
    <p class="dek">네이버 뉴스 검색으로 모은 경매·대구 부동산·정책 기사입니다. 제목과 요약은 검색 결과에 실린 내용을 옮긴 것입니다.</p>
  </header>

  <div class="panel"><div class="panel-b">
    <div style="display:flex;flex-wrap:wrap;gap:7px">${desks.map(d=>
      `<button class="fsel" data-desk="${esc(d)}"
        style="${d===NDESK?'background:var(--primary);color:var(--primary-fg);border-color:var(--primary);font-weight:800':''}">
        ${esc(d)} <span class="mono">${d==='전체'?NEWS.length:NEWS.filter(n=>n.desk===d).length}</span></button>`).join('')}
    </div></div></div>

  ${head?`<h2 class="sec">HEADLINE</h2>
  <div class="panel"><div class="panel-b">
    <div style="display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--muted-fg);font-weight:600">
      <span class="chip">${esc(head.desk)}</span><span>${esc(head.src)}</span><span class="mono">${esc(head.date)}</span></div>
    <h3 style="margin:9px 0 0;font-size:19px;font-weight:800;letter-spacing:-.03em;line-height:1.35">
      <a href="${esc(head.url)}" target="_blank" rel="noopener">${esc(head.title)}</a></h3>
    <p style="margin:8px 0 0;font-size:13.5px;color:var(--muted-fg);line-height:1.7">${esc(head.sum)}</p>
  </div></div>`:''}

  <h2 class="sec">기사 <span class="mono">${rest.length}</span>건</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(292px,1fr));gap:12px;margin-top:12px">
    ${rest.map(n=>`<div class="panel" style="margin:0"><div class="panel-b">
      <div style="display:flex;gap:7px;align-items:center;font-size:11px;color:var(--muted-fg);font-weight:600">
        <span class="chip${n.desk==='대구'?' g':''}">${esc(n.desk)}</span>
        <span>${esc(n.src)}</span><span class="mono">${esc(n.date)}</span></div>
      <h3 style="margin:8px 0 0;font-size:14.5px;font-weight:700;letter-spacing:-.02em;line-height:1.45">
        <a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
      <p style="margin:7px 0 0;font-size:12.5px;color:var(--muted-fg);line-height:1.7">${esc(n.sum)}</p>
    </div></div>`).join('')}
  </div>
  ${FOOT}`;
}

/* ══════ 이벤트 배선 ══════ */
function segWire(){
  $('view').querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{ S.view=b.dataset.v; go(CUR); });
  $('view').querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{ S.unit=b.dataset.u; go(CUR); });
}
/* 좌측 검색필터 배선. 홈과 경매검색이 같은 사이드바를 쓰므로 한 곳에 둔다.
   page 는 다시 그릴 화면이다 — 홈에서 필터를 건드리면 홈이 다시 그려진다. */
function fbarWire(page){
  /* 필터를 건드릴 때마다 화면을 다시 그린다. 그대로 두면 보던 자리와
     입력 포커스를 잃으므로, 스크롤을 유지하고 포커스를 되돌려 준다. */
  const redraw = focusId => {
    go(page, true);
    const el = focusId && $(focusId);
    if(el){ el.focus(); try{ const v=el.value; el.value=''; el.value=v; }catch(_){} }
  };
  const selBind=(id,key)=>{ const el=$(id); if(!el) return;
    el.onchange=()=>{ FS[key]=el.value;
      // 법원·시군구 목록은 시·도에 딸려 있다. 시·도가 바뀌면 같이 푼다.
      if(key==='region'){ FS.court='전체'; FS.gu='전체'; }
      redraw(id); }; };
  selBind('f-court','court'); selBind('f-yr','yr');
  selBind('f-region','region'); selBind('f-gu','gu');
  selBind('f-st','st'); selBind('f-fail','fail');
  selBind('f-ap','ap'); selBind('f-mn','mn');

  /* 입력칸은 change(=확정) 에서만 다시 그린다. 키를 칠 때마다 그리면
     한 글자 넣을 때마다 전체를 다시 훑고 포커스가 튄다. */
  const txtBind=(id,key,clean)=>{ const el=$(id); if(!el) return;
    const run=()=>{ const v=clean?clean(el.value):el.value.trim();
      if(v===FS[key]) return; FS[key]=v; redraw(id); };
    el.onchange=run;
    el.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); run(); } }; };
  txtBind('q','q');
  txtBind('f-no','no', v=>v.replace(/\D/g,''));
  txtBind('f-d1','d1', v=>v);
  txtBind('f-d2','d2', v=>v);

  const toggle=(attr,key)=>$('view').querySelectorAll('['+attr+']').forEach(b=>b.onclick=()=>{
    const v=b.dataset[attr.replace('data-','')];
    const i=FS[key].indexOf(v);
    if(i<0) FS[key]=[...FS[key], v]; else FS[key]=FS[key].filter(x=>x!==v);
    redraw(); });
  toggle('data-fkind','kind'); toggle('data-fsp','sp'); toggle('data-fscr','screen');

  // 자주 쓰는 조합. 이미 걸려 있는 걸 다시 누르면 푼다.
  $('view').querySelectorAll('[data-fpre]').forEach(b=>b.onclick=()=>{
    const i = +b.dataset.fpre;
    if(presetOn(PRESETS[i])) fsReset(); else applyPreset(i);
    redraw();
  });

  // 조건 알약의 × — 그 조건 하나만 푼다.
  $('view').querySelectorAll('[data-clr]').forEach(b=>b.onclick=()=>{
    const [k,v] = b.dataset.clr.split(':');
    if(Array.isArray(FS[k])) FS[k]=FS[k].filter(x=>x!==v); else FS[k]=FS0[k];
    if(k==='region'){ FS.court='전체'; FS.gu='전체'; }
    redraw(); });

  const r=$('reset');
  if(r) r.onclick=()=>{ fsReset(); redraw(); };
  const t=$('fbar-t');
  if(t) t.onclick=()=>{ const bar=$('fbar'); const open=bar.classList.toggle('open');
    t.textContent = open?'접기':'펼치기'; };
}

const WIRE = {
  home(){
    segWire();
    $('view').querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{
      // 칩에 적힌 수는 그 지역 **전체**다. 여기서 진행중을 걸면 눌렀을 때
      // 나오는 수가 칩의 수와 달라진다. 부산은 전체 34건에 진행중이 0건이라
      // 34 를 보고 눌렀는데 빈 화면이 나왔다.
      fsReset(); FS.region=b.dataset.region; FS.st='전체'; go('search'); });
    $('view').querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{
      fsReset(); FS.kind=[b.dataset.kind]; FS.st='전체'; go('search'); });
    // 홈에도 같은 사이드바가 있다. 여기서 필터를 건드리면 홈이 다시 그려진다.
    fbarWire('home');
    // 히어로 검색창. data-go 로도 search 로 넘어가지만 입력값을 같이 실어야 한다.
    // 단추는 id 로 집는다 — data-go="search" 를 통째로 잡으면 아래 '전부 보기'
    // 단추까지 히어로 입력값에 묶인다.
    const hq = $('hq'), hgo = $('hq-go');
    if(hq){
      const run = () => { FS.q = hq.value.trim(); go('search'); };
      hq.onkeydown = e => { if(e.key==='Enter'){ e.preventDefault(); run(); } };
      if(hgo) hgo.onclick = run;
    }
    const all = $('see-all');
    if(all) all.onclick = () => go('search');
    // 2주 기일 띠. 캘린더 탭과 같은 동작이라 같은 속성을 쓴다.
    $('view').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{
      CAL.sel=b.dataset.day; CAL.mode='day'; go('calendar'); });
  },
  search(){
    segWire();
    fbarWire('search');
    const so=$('f-sort');
    if(so) so.onchange=()=>{ S.sort=so.value; go('search', true); };
  },
  upcoming(){
    segWire();
    $('view').querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{ UPD=+b.dataset.up; go('upcoming'); });
  },
  calendar(){
    segWire();
    $('view').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{
      CAL.sel=b.dataset.day; CAL.mode='day'; go('calendar'); });
    $('view').querySelectorAll('[data-cal]').forEach(b=>b.onclick=()=>{
      const a=b.dataset.cal;
      const months=[...new Set(DATED.map(x=>x.d.slice(0,7)))].sort();
      if(a==='prev'||a==='next'){ let m=CAL.m+(a==='next'?1:-1),y=CAL.y;
        while(m<1){m+=12;y--;} while(m>12){m-=12;y++;} CAL.y=y; CAL.m=m; }
      else if(a==='first'&&months.length){ const [y,m]=months[0].split('-').map(Number); CAL.y=y; CAL.m=m; }
      else if(a==='last'&&months.length){ const [y,m]=months[months.length-1].split('-').map(Number); CAL.y=y; CAL.m=m; }
      else if(a==='today'){ CAL.y=NOW.getFullYear(); CAL.m=NOW.getMonth()+1; CAL.sel=TODAY; CAL.mode='day'; }
      else if(a==='nodate'){ CAL.mode = CAL.mode==='nodate'?'day':'nodate'; }
      go('calendar');
    });
  },
  map(){
    $('view').querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{
      // 칩에 적힌 수는 그 지역 **전체**다. 여기서 진행중을 걸면 눌렀을 때
      // 나오는 수가 칩의 수와 달라진다. 부산은 전체 34건에 진행중이 0건이라
      // 34 를 보고 눌렀는데 빈 화면이 나왔다.
      fsReset(); FS.region=b.dataset.region; FS.st='전체'; go('search'); });
  },
  apt(){
    const q=$('apt-q'), gu=$('apt-gu');
    if(q){ q.onchange=()=>{ AS.q=q.value.trim(); go('apt'); };
      q.onkeydown=e=>{ if(e.key==='Enter'){ AS.q=q.value.trim(); go('apt'); } }; }
    if(gu) gu.onchange=()=>{ AS.gu=gu.value; go('apt'); };
  },
  wiki(){},
  news(){
    $('view').querySelectorAll('[data-desk]').forEach(b=>b.onclick=()=>{ NDESK=b.dataset.desk; go('news'); });
  },
};

/* ══════ 9. 물건 상세 ("경매지") ══════
   층 1(CODEF 사건검색에서 이미 받던 필드) + 층 2(실거래가)로 구성한다.
   등기부 갑구·을구는 유료라 넣지 않았다. 말소기준권리·인수/소멸 판단은
   이 화면으로 할 수 없고, 그 사실을 화면에 명시한다. */

const DKEY = x => `${x.ct}|${x.caNo}`;
let DET = null;                      // 보고 있는 물건(D 의 원소)

const dwon = n => n==null ? '—' : won(n);
const dday = d => {
  if(!d) return '';
  const n = Math.round((new Date(d+'T00:00:00') - new Date(TODAY+'T00:00:00'))/864e5);
  return n===0 ? '오늘' : n>0 ? `D-${n}` : `${-n}일 지남`;
};

/* 문건접수내역에서 입찰 판단에 걸리는 것만 골라낸다.
   상용 경매지가 파는 정보의 상당 부분이 여기에 그대로 들어 있다. */
function digest(det, x){
  const docs = det?.docs || [], parties = det?.parties || [];
  const has = re => docs.filter(o=>re.test(o.c||''));
  // 같은 사람이 임차인과 전세권자로 두 번 올라오는 일이 흔하다(2026타경3229 의 노OO).
  // 가려진 이름 기준으로 합쳐 센다. 이름이 가려져 있어 서로 다른 두 사람이
  // 같은 표기가 될 수 있으므로 '최대' 로 적는다.
  const tenants = [...new Set(parties
    .filter(p=>/임차인|임차권자|전세권자/.test(p.t||''))
    .map(p=>p.n).filter(Boolean))];
  const claimed = has(/배당요구/);
  // 배당요구한 사람을 이름 기준으로 센다(중복 제출 대비)
  const who = new Set(claimed.map(o=>(o.c||'').match(/([가-힣]OO*|[가-힣]+\s*OO+)/)?.[0]).filter(Boolean));
  const end = (det?.dist||[]).find(v=>v.no===(x.ino||1))?.d || (det?.dist||[])[0]?.d;
  const late = claimed.filter(o=>end && o.d && o.d>end);
  return {
    tenants: tenants.length,
    claimedN: who.size,
    end, late: late.length,
    lien: has(/유치권/),
    tax: has(/교부청구/),
    appraisal: has(/감정평가서/)[0]?.d,
    survey: has(/현황조사/)[0]?.d,
    stalled: (det?.delivFlag||[]).length,
  };
}

function pgDetail(){
  const x = DET;
  if(!x) return `<p class="sub" style="margin-top:30px">물건을 선택해 주세요.</p>`;
  const det = (typeof DTL!=='undefined' ? DTL[DKEY(x)] : null);
  const g = digest(det, x);
  const rt = ratioOf(x);
  const prod = (det?.prod||[]).find(p=>p.no===(x.ino||1)) || (det?.prod||[])[0];
  const ld = prod?.ld || [];

  /* '미확인' 을 '종료' 로 떨어뜨리면 모르는 것을 끝났다고 단정하게 된다.
     목록 카드는 b-unk 를 쓰는데 상세만 빠져 있었다. */
  const badge = x.st==='진행중' ? '<span class="bdg b-live">진행</span>'
    : isSold(x) ? '<span class="bdg b-sold">매각</span>'
    : x.st==='미확인' ? '<span class="bdg b-unk">상태 미확인</span>'
    : '<span class="bdg b-done">종료</span>';

  let h = `
  <div class="dtop">
    <button class="fsel" data-go="search">← 목록으로</button>
    <span class="sp"></span>
    ${vchip(x)}
  </div>

  <section class="dhead">
    <div class="dmeta"><span class="cno">${esc(x.caNo||x.c)}</span>
      ${x.multi?`<span class="ino">물건 ${x.ino}</span>`:''}
      <span>${esc(x.ct)}</span>${badge}
      ${x.sp?.map(t=>`<span class="sp-t">${esc(t)}</span>`).join('')||''}</div>
    <h1 style="margin:10px 0 0">${addrOf(x)}</h1>
    <p class="dek">${esc(x.ut||'용도 미상')}${x.utGuess?' (색인 추정)':''}
      ${x.d?` · 매각기일 <b>${esc(x.d)}</b> <span class="dd">${dday(x.d)}</span>`
        : (()=>{ /* 직전 회차가 유찰이면 '미색인' 이 아니라 '다음 기일 미게시' 다.
                    둘은 다른 상태이고, 뒤쪽 최저가를 어떻게 읽어야 하는지가 갈린다. */
            const e=(x.ld&&x.ld.length)?x.ld[x.ld.length-1]:null;
            return (x.st==='진행중'&&e&&/유찰/.test(String(e.res||'')))
              ? ` · <b>${esc(e.d)} 유찰</b> — 다음 매각기일 미게시`
              : (x.st==='진행중'&&e&&/변경|연기/.test(String(e.res||'')))
              ? ` · <b>${esc(e.d)} ${esc(e.res)}</b> — 다음 매각기일 미지정`
              : ' · 매각기일 미색인'; })()}
      ${det?.desk?` · ${esc(det.desk.replace(/\\s*\\(경매절차 관련 문의\\)\\s*$/,''))}`:''}</p>
  </section>
  ${x.stSrc==='idx'?`<div class="notice" style="margin-top:14px"><span class="pk">색인 확인</span>
    <p>${x.st==='매각'?'매각(낙찰)':x.st==='종료'?'종료':'유찰과 다음 기일'} 결과를 <b>검색 색인(${esc(x.stBy||'')})</b>에서
    ${esc(x.stAt||'')}에 확인했습니다.${x.winBid?` 색인에 적힌 낙찰가는 <b class="mono">${x.winBidApprox?'≈':''}${dwon(x.winBid)}</b>입니다.`:''}
    법원 원본이 아니므로 입찰·권리 판단 전에는 법원경매정보에서 다시 확인하십시오.</p></div>`:''}

  <div class="stats wide">
    <div class="stat"><div class="stat-k">감정가</div>
      <div class="stat-v"><span class="n mono">${dwon(x.ap)}</span></div></div>
    <div class="stat hl"><div class="stat-k">최저가</div>
      <div class="stat-v"><span class="n mono">${x.mnApprox?'≈':''}${dwon(x.mn)}</span></div></div>
    <div class="stat"><div class="stat-k">최저가율</div>
      <div class="stat-v"><span class="n mono">${rt!=null?rt+'%':'—'}</span></div>
      ${rt!=null?`<div class="meter"><i style="width:${Math.min(rt,100)}%"></i></div>`:''}</div>
    <div class="stat"><div class="stat-k">유찰</div>
      <div class="stat-v"><span class="n mono">${x.f ?? '—'}</span>${x.f!=null?'<span class="u">회</span>':''}</div>
      ${x.f==null?'<div class="stat-k" style="margin-top:4px">미색인</div>':''}</div>
    <div class="stat"><div class="stat-k">전용면적${x.br?.ar?' <span class="src-b">대장</span>':''}</div>
      <div class="stat-v"><span class="n mono">${areaOf(x)?.txt ?? '—'}</span></div></div>
    <div class="stat"><div class="stat-k">${x.mk?.t?'실거래 중앙값 <span class="src-b">국토부</span>':'최근 실거래'}</div>
      <div class="stat-v"><span class="n mono">${x.mk?.t?manwon(x.mk.t.med):(x.tx?won(x.tx.amt):'—')}</span></div>
      ${x.mk?.t?`<div class="stat-k" style="margin-top:4px">${esc(x.mk.nm)} ${x.mk.ar}㎡${x.mk.arGuess?'(대표 평형)':''} · ${x.mk.t.n}건</div>`
        :x.tx?`<div class="stat-k" style="margin-top:4px">${esc(x.tx.nm)} ${x.tx.ar}㎡</div>`:''}</div>
  </div>`;

  /* ── 등기 권리관계·임차인 (탱크옥션 상세정보가 있을 때만) ──
     보드의 다른 물건에는 이 정보가 없다. 있는 물건에만 보여주고,
     없는 물건의 '확인 불가' 고지는 그대로 둔다. */
  if(x.tank){
    const T = x.tank;
    const rows = (T.ten || []).map((t,i)=>`<tr>
      <td class="mono">${i+1}</td><td class="mono">${esc(t.in)}</td>
      <td class="mono">${esc(t.fix||'—')}</td><td class="mono">${esc(t.dist||'—')}</td>
      <td class="mono">${t.dep==null?'미상':(typeof t.dep==='number'?won(t.dep):esc(t.dep))}</td>
      <td>${t.take?'<b class="mk-warn-t">인수 여지</b>':'—'}</td></tr>`).join('');
    h += `<h2 class="sec">등기 권리관계 · 임차인</h2>
      <p class="sub">사용자가 올린 탱크옥션 상세정보에서 읽었습니다. 대법원 원본을 그대로 옮긴 것이 아니라
        상용 사이트가 정리한 값이니, 입찰 전 등기사항증명서와 매각물건명세서로 다시 확인하십시오.</p>
      <div class="mkbox">
        <div class="mk-g">
          ${T.base?`<div><span class="k">말소기준등기</span><span class="v mono">${esc(T.base.d)} ${esc(T.base.kind)}</span></div>`:''}
          ${T.base?.who?`<div><span class="k">기준권리자</span><span class="v">${esc(T.base.who)}</span></div>`:''}
          ${T.base?.amt?`<div><span class="k">채권최고액</span><span class="v mono">${won(T.base.amt)}</span></div>`:''}
          ${T.distEnd?`<div><span class="k">배당요구종기</span><span class="v mono">${esc(T.distEnd)}</span></div>`:''}
          ${T.due!=null?`<div><span class="k">체납 관리비</span><span class="v mono">${T.due?won(T.due):'없음'}</span></div>`:''}
          ${T.pub?`<div><span class="k">공시가격</span><span class="v mono">${won(T.pub)}</span></div>`:''}
        </div>
        ${rows?`<table class="mk-t"><thead><tr><th>임차인</th><th>전입</th><th>확정</th><th>배당요구</th><th>보증금</th><th>대항력</th></tr></thead><tbody>${rows}</tbody></table>`
              :`<p class="mk-n">등재된 임차인이 없습니다.</p>`}
        ${T.takeover?`<p class="mk-n mk-warn-t"><b>전입일이 말소기준등기보다 앞선 임차인이 있습니다.</b>
          보증금이 미상이면 인수 금액을 계산할 수 없습니다 — 매각물건명세서 원본으로 보증금과 확정일자를 반드시 확인하십시오.</p>`:''}
        <p class="mk-n">이름은 성만 남기고 가렸습니다. 임차인 이름은 저장하지 않습니다.</p>
      </div>`;
  }

  /* ── 말소기준등기만 있는 경우 (pointauction 발굴분) ──
     탱크옥션 상세가 없는 물건이라 임차인 표는 못 그린다. 그래도 말소기준등기
     하나만으로 '언제 이후 전입이면 소멸인지' 를 볼 수 있어 따로 적는다.
     이건 2차 집계가 정리한 값이고, 등기부 원본이 아니다. */
  if(!DTL[DKEY(x)] && x.pbase){
    h += `<h2 class="sec">말소기준등기</h2>
      <p class="sub">pointauction 공개 상세에서 읽었습니다. <b>등기부 원본이 아니라 2차 집계가 정리한 값</b>이고,
        갑구·을구 전체와 임차인 정보는 이 보드에 없습니다. 인수·소멸 판단은 반드시 등기사항증명서와
        매각물건명세서 원본으로 하십시오.</p>
      <div class="mkbox">
        <div class="mk-g">
          <div><span class="k">말소기준등기</span><span class="v mono">${esc(x.pbase)}</span></div>
        </div>
        <p class="mk-n">이 날짜보다 <b>뒤에</b> 전입한 임차인은 대항력이 없어 소멸하고,
          <b>앞서</b> 전입한 임차인이 있으면 인수 여지가 있습니다.
          이 보드에는 임차인 전입일이 없으므로 여기서는 판정하지 않습니다.</p>
      </div>`;
  }

  /* ── 실거래가 ── */
  if(x.mk){
    h += `<h2 class="sec">실거래가</h2>
      <p class="sub">국토교통부 아파트 매매·전월세 실거래가. 같은 지번·같은 평형만 골랐습니다.</p>
      ${mkPanel(x)}`;
  }

  /* ── 건축물대장 ── */
  if(x.br){
    const B=x.br, rows=[['전용면적',B.ar?`${B.ar}㎡ (${(B.ar/3.3058).toFixed(1)}평)`:null],
      ['해당 층',B.flr],['건물명',B.bld],['주용도',B.use||B.purps],['구조',B.strct],
      ['사용승인일',B.apr],['세대수',B.hhld?`${B.hhld}세대`:null],
      ['층수',B.gfl?`지상 ${B.gfl}층${B.ufl?` · 지하 ${B.ufl}층`:''}`:null]].filter(r=>r[1]);
    h += `<h2 class="sec">건축물대장</h2>
      <p class="sub">국토교통부 건축HUB 건축물대장. 전용면적은 동·호까지 특정한 값입니다.</p>
      <div class="panel"><div class="panel-b"><div class="dgrid">
      ${rows.map(([k,v])=>`<div class="dcell"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}
      </div>`;
    // 실거래 밴드는 단지 전체의 최다 거래 평형이다. 이 호수의 면적과 다르면
    // 시세 비교가 통째로 어긋나므로 반드시 알린다.
    if(B.ar && x.tx?.ar && Math.abs(B.ar - x.tx.ar) > 10)
      h += `<p class="cnote" style="color:var(--amber);margin-top:10px">이 호수의 전용면적은 <b>${B.ar}㎡</b>인데,
        위 실거래는 같은 단지에서 거래가 가장 많은 <b>${x.tx.ar}㎡</b>대 기준입니다 — 평형이 달라 그대로 비교하면 안 됩니다.</p>`;
    h += `</div>`;
  }

  if(!det) return h + `
    <div class="notice" style="margin-top:18px"><span class="pk">상세 미수집</span>
      <p>이 사건은 법원 원본 상세를 받아두지 않았습니다. 원본 대조에 쓰던 CODEF가
      2026-09-25에 끝나 지금은 새로 채워지지 않습니다.
      ${x.verified
        ? '위 금액·기일은 이미 대조된 값입니다.'
        : '<b>위 금액·기일도 법원 원본으로 대조하지 않았습니다.</b> 색인에서 읽은 값이라 '
          + '이미 바뀌었거나 사건이 끝났을 수 있습니다.'}
      ${x.note ? `<br><br>${esc(x.note)}` : ''}</p></div>` + FOOT;

  /* ── 요점 ── */
  const pts = [];
  /* 두 숫자는 출처가 다르다 — tenants 는 당사자 목록, claimedN 은 문건접수내역이다.
     배당요구는 임차인이 아닌 채권자도 낸다. 부분집합이 아니므로 '그중 M명' 이라고
     쓰면 안 된다. 실제로 '최대 1명 중 8명이 배당요구' 가 화면에 찍혔다. */
  if(g.tenants) pts.push(
    (g.claimedN > g.tenants
      ? `당사자 목록에 임차인·전세권자가 최대 <b>${g.tenants}명</b> 올라 있고, 문건접수내역에는 배당요구가 <b>${g.claimedN}건</b> 있습니다. 두 목록은 출처가 달라 그대로 대응되지 않습니다 — 배당요구는 임차인이 아닌 채권자도 냅니다.`
      : `임차인·전세권자가 최대 <b>${g.tenants}명</b> 당사자로 올라 있고, 배당요구는 <b>${g.claimedN}건</b> 접수됐습니다.`)
    + (g.claimedN < g.tenants ? ' 배당요구를 하지 않은 사람이 선순위라면 <b>보증금을 매수인이 인수</b>할 수 있습니다.' : '')
    + ' 이름이 가려져 나오므로 인원수는 정확하지 않을 수 있습니다.');
  if(g.end) pts.push(`배당요구종기는 <b>${esc(g.end)}</b>입니다.` + (g.late?` 종기 이후 접수된 배당요구가 ${g.late}건 있습니다.`:''));
  if(g.lien.length) pts.push(`<b style="color:var(--destructive)">유치권 신고가 있습니다.</b> ${g.lien.map(o=>esc(o.c)).join(' / ')}`);
  if(g.tax.length) pts.push(`교부청구: ${g.tax.map(o=>esc(o.c)).join(' / ')}`);
  if(g.stalled) pts.push(`송달이 폐문부재·주소불명 등으로 되돌아온 기록이 <b>${g.stalled}건</b> 있습니다 — 점유 상태를 짐작할 단서입니다.`);
  if(pts.length) h += `<h2 class="sec">요점</h2>
    <div class="panel"><div class="panel-b"><ul class="dpts">${pts.map(p=>`<li>${p}</li>`).join('')}</ul></div></div>`;

  /* ── 확인 불가 고지 (이게 없으면 경매지로 오해된다) ── */
  // .notice 는 display:flex 다. 본문을 p 로 감싸지 않으면 b 하나하나가
  // 별개의 flex 항목이 되어 글이 세로로 쪼개진다.
  h += `<div class="notice" style="margin-top:14px"><span class="pk">확인 불가</span>
    <p>${x.tank
      ? `<b>위 등기 권리관계·임차인은 상용 사이트가 정리한 값입니다.</b> 말소기준등기와 전입일은 실려 있지만
         가압류·가처분 전부와 확정일자·보증금액까지 담겼다는 보장은 없습니다. 인수/소멸의 최종 판단은
         등기사항증명서와 매각물건명세서 원본으로 하셔야 합니다.`
      : `<b>등기부 갑구·을구 권리관계는 이 화면에 없습니다.</b> 말소기준권리, 근저당 설정일과 채권최고액,
         가압류·가처분, 인수/소멸 판단은 등기사항증명서를 직접 확인하셔야 합니다.
         임차인의 <b>전입일·확정일자·보증금액</b>도 매각물건명세서 원본에 있고 이 서버에서는 받을 수 없습니다.`}
    아래 내용은 대법원 경매사건검색에서 받은 <b>사건 진행 기록</b>이며, 그 자체로 권리분석이 되지는 않습니다.</p></div>`;

  /* ── 사건 개요 ── */
  const ov = [['사건명',det.name],['접수일',det.receipt],['개시결정',det.decision],
    ['청구금액',det.claim!=null?won(det.claim):null],['종국결과',det.final],
    ['종국일자',det.closedAt],['병합',det.merger]].filter(r=>r[1]);
  h += `<h2 class="sec">사건 개요</h2><div class="panel"><div class="panel-b">
    <div class="dgrid">${ov.map(([k,v])=>`<div class="dcell"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}</div></div></div>`;

  if(det.rel.length) h += `<h2 class="sec">관련사건</h2><div class="panel"><div class="panel-b">
    <div style="display:flex;flex-wrap:wrap;gap:7px">${det.rel.map(r=>
      `<span class="fsel">${esc(r.ct||'')} ${esc(r.no||'')}${r.ty?` · ${esc(r.ty)}`:''}</span>`).join('')}</div></div></div>`;

  /* ── 물건 목록 ── */
  if(det.inv.length) h += `<h2 class="sec">물건 목록</h2>
    <p class="sub">한 사건에 여러 목록이 붙습니다. 토지와 건물이 나뉘어 있으면 대개 일괄매각입니다.</p>
    <div class="panel"><div class="panel-b"><div class="tblwrap"><table>
    <thead><tr><th>번호</th><th>소재지</th><th>종류</th><th>비고</th></tr></thead><tbody>
    ${det.inv.map(v=>`<tr${v.no===(x.ino||1)?' class="now"':''}><td class="n">${v.no??'—'}</td>
      <td>${esc(v.a||'—')}</td><td>${esc(v.ty||'—')}</td><td>${esc(v.note||'—')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;

  /* ── 기일 내역 ── */
  if(ld.length) h += `<h2 class="sec">기일 내역</h2>
    <p class="sub">유찰될 때마다 최저가가 어떻게 내려왔는지가 그대로 남습니다.</p>
    <div class="panel"><div class="panel-b"><div class="tblwrap"><table>
    <thead><tr><th>일자</th><th>구분</th><th>최저매각가격</th><th>결과</th><th>장소</th></tr></thead><tbody>
    ${ld.map(v=>`<tr${!v.r&&/매각기일/.test(v.k||'')?' class="now"':''}>
      <td>${esc(v.d||'—')}${v.t?` <span class="t-sub">${esc(v.t)}</span>`:''}</td>
      <td>${esc(v.k||'—')}</td><td class="n">${dwon(v.amt)}</td>
      <td>${v.r?esc(v.r):'<span class="t-sub">예정</span>'}</td>
      <td class="t-sub">${esc(v.pl||'—')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;

  /* ── 당사자 ── */
  if(det.parties.length){
    const by = det.parties.reduce((m,p)=>((m[p.t||'기타'] ??= []).push(p.n||'—'),m),{});
    h += `<h2 class="sec">당사자</h2>
      <p class="sub">이름은 대법원이 가린 상태로 옵니다. 역할과 인원수까지만 알 수 있습니다.</p>
      <div class="panel"><div class="panel-b"><div class="dgrid">
      ${Object.entries(by).map(([k,v])=>`<div class="dcell"><div class="k">${esc(k)} ${v.length}</div>
        <div class="v" style="font-size:13px">${v.map(esc).join(', ')}</div></div>`).join('')}
      </div></div></div>`;
  }

  /* ── 문건접수내역 ── */
  if(det.docs.length) h += `<h2 class="sec">문건접수내역 <span class="chip mono">${det.docs.length}건</span></h2>
    <p class="sub">누가 언제 무엇을 냈는지의 기록입니다. 배당요구·유치권신고·교부청구가 여기서 드러납니다.</p>
    <div class="panel"><div class="panel-b"><ol class="dlog">
    ${det.docs.map(o=>{const hot=/배당요구|유치권|교부청구|권리신고/.test(o.c||'');
      return `<li${hot?' class="hot"':''}><span class="dt mono">${esc(o.d||'')}</span>${esc(o.c||'')}</li>`;}).join('')}
    </ol></div></div>`;

  /* ── 송달내역 ── */
  if(det.deliv.length){
    const flag = det.delivFlag||[];
    h += `<h2 class="sec">송달내역 <span class="chip mono">${det.deliv.length}건</span></h2>`;
    if(flag.length) h += `<p class="sub">되돌아온 송달만 먼저 봅니다 — 점유·연락 상태의 단서입니다.</p>
      <div class="panel"><div class="panel-b"><ol class="dlog">
      ${flag.map(o=>`<li class="hot"><span class="dt mono">${esc(o.d||'')}</span>${esc(o.c||'')} → <b>${esc(o.r||'')}</b></li>`).join('')}
      </ol></div></div>`;
    h += `<details class="dfold"><summary>송달내역 전체 ${det.deliv.length}건 펼치기</summary>
      <ol class="dlog">${det.deliv.map(o=>
        `<li><span class="dt mono">${esc(o.d||'')}</span>${esc(o.c||'')}${o.r?` → ${esc(o.r)}`:''}</li>`).join('')}
      </ol></details>`;
  }

  /* ── 매각물건명세서 비고 ── */
  if(prod?.note) h += `<h2 class="sec">매각물건명세서 비고</h2>
    <p class="sub">법원이 적은 원문입니다. 개인 이름은 가려서 싣습니다.</p>
    <div class="panel"><div class="panel-b"><p class="dnote">${esc(prod.note)}</p></div></div>`;
  if(prod?.state) h += `<h2 class="sec">진행 경과</h2>
    <div class="panel"><div class="panel-b"><p class="dnote mono">${esc(prod.state)}</p></div></div>`;

  return h + FOOT;
}

/* ══════ 10. 블로그컨텐츠 ══════
   글로 소개해도 될 만한 물건만 남긴다. 기준은 화면에 그대로 적어 둔다 —
   무엇을 왜 걸렀는지 보이지 않으면 "문제 없음" 이 근거 없는 보증이 된다.

   중요: 여기서 말하는 '무결점' 은 **확인된 문제가 없다**는 뜻이지
   문제가 없다는 뜻이 아니다. 등기부 갑구·을구를 못 보므로 말소기준권리와
   인수/소멸은 애초에 판정 대상이 아니다. */

const BLOG = { lead: 14, src: '전체', use: '아파트', reg: '대구권' };

/* 보드의 r='대구' 는 대구·경북을 함께 묶은 권역이라 구미·포항·경주가 다 들어온다.
   '대구권' 은 대구광역시 8개 구·군만을 뜻한다. 스크롤할 때 대구 물건이
   경북 사이에 묻히지 않도록 이걸로 따로 거른다. */
const DAEGU_GU = new Set(['중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군']);
const inDaegu = x => DAEGU_GU.has((x.a1 || '').trim());

/* 권리분석을 끝낸 물건 표시. 브라우저에만 남는다 —
   서버로도, 다른 사람에게도 가지 않는다. 시크릿 창이나 사이트 데이터를
   지운 브라우저에서는 비어 있고, 접근 자체가 예외를 던지는 환경도 있어
   읽기·쓰기를 모두 감싼다. */
/* 권리분석 완료 표시.

   localStorage 만 쓰다가 사용자가 표시를 통째로 잃었다. 아티팩트 저장소는
   재배포를 넘겨준다고 문서에 적혀 있지만 실제로는 비워졌다. 브라우저 저장소
   하나에 기대면 안 된다.

   그래서 두 겹으로 둔다.
     BDONE_SEED  저장소(data/bdone.json)에 구워 넣은 값. 빌드가 박는다.
                 재배포·기기 변경·사이트 데이터 삭제를 모두 넘긴다.
     localStorage 그 위에 얹는 이번 브라우저의 변경분. 즉시 반영된다.

   해제도 기록해야 한다 — 구워진 값을 지우려면 '뺐다'는 사실이 남아야 한다.
   그래서 추가분(add)과 제외분(del)을 따로 저장한다. */
const BDONE_KEY = 'auction-board.blog.done.v2';
const BDONE_SEED = __BDONE__;
const _bd = (() => {
  try {
    const o = JSON.parse(localStorage.getItem(BDONE_KEY) || '{}');
    return { add: new Set(o.add || []), del: new Set(o.del || []) };
  } catch (_) { return { add: new Set(), del: new Set() }; }
})();
const BDONE = {
  has: k => _bd.del.has(k) ? false : (_bd.add.has(k) || BDONE_SEED.includes(k)),
  get size(){ return [...new Set([...BDONE_SEED, ..._bd.add])].filter(k=>!_bd.del.has(k)).length; },
  keys: () => [...new Set([...BDONE_SEED, ..._bd.add])].filter(k => !_bd.del.has(k)).sort(),
  set(k, on){
    if(on){ _bd.add.add(k); _bd.del.delete(k); }
    else  { _bd.del.add(k); _bd.add.delete(k); }
  },
};
/* 저장이 되는 브라우저인지 실제로 왕복해 본다.
   try/catch 로 실패를 삼키면 화면상 저장된 것처럼 보인다. 그래서 사용자가
   두 번이나 표시를 잃고서야 알았다. 되는지 안 되는지를 화면에 밝힌다. */
const LS_OK = (() => {
  try {
    const k = BDONE_KEY + '.probe';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch (_) { return false; }
})();
let BDONE_SAVED = false;
function bdoneSave(){
  try {
    localStorage.setItem(BDONE_KEY, JSON.stringify({add:[..._bd.add], del:[..._bd.del]}));
    BDONE_SAVED = true;
  } catch (_) { BDONE_SAVED = false; }
}
const BLOG_CAP = 40;   // 소재 목록이지 목록 덤프가 아니다

/* 결격 사유를 배열로 돌려준다. 비어 있으면 통과. */
function blogFaults(x){
  const r = [];
  if(!x.verified) r.push('법원 원본 대조 안 됨');
  if(x.sp?.length) r.push('특수권리 ' + x.sp.join('·'));
  if(x.ap==null || x.mn==null) r.push('감정가·최저가 미확정');
  if(x.rt!=null && x.rt < 30) r.push(`최저가율 ${x.rt}% — 특수물건 의심`);
  if(x.f >= 3) r.push(`유찰 ${x.f}회`);
  if(x.ap && x.tx && x.ap > x.tx.amt*1.1)
    r.push(`감정가가 실거래의 ${Math.round(x.ap/x.tx.amt*100)}%`);
  const d = (typeof DTL!=='undefined') ? DTL[DKEY(x)] : null;
  if(!d) r.push('사건 상세 미수집');
  else {
    const g = digest(d, x);
    if(g.tenants > g.claimedN)
      r.push(`임차인 최대 ${g.tenants}명인데 배당요구는 ${g.claimedN}건 — 인수 가능성`);
    if(g.lien.length) r.push('유치권 신고');
  }
  return r;
}

/* 공매(온비드)는 법원경매와 판정 기준이 다르다.
   목록 API 에 **등기부 권리관계도 임차인 정보도 아예 없다.** 법원경매는
   문건접수내역으로 배당요구·유치권신고를 볼 수 있었지만 공매는 그마저 없다.
   그래서 여기서 '결격 없음' 은 법원경매보다 약한 말이고, 카드와 초안에
   그 사실을 굵게 적는다. */
function gmFaults(x){
  const r = [];
  if(x.disp !== '매각') r.push(`처분방식 ${x.disp||'미상'} — 매각 물건이 아님`);
  if(!['입찰진행중','입찰준비중'].includes(x.st)) r.push(`입찰상태 ${x.st}`);
  if(x.ap==null || x.mn==null) r.push('감정가·최저입찰가 미확정');
  if(x.rt!=null && x.rt < 30) r.push(`최저가율 ${x.rt}% — 특수물건 의심`);
  if(x.rt!=null && x.rt > 130) r.push(`최저입찰가가 감정가의 ${x.rt}%`);
  if(x.f >= 3) r.push(`유찰 ${x.f}회`);
  if(!x.end) r.push('입찰 마감일 없음');
  return r;
}
const isGm = x => x.__gm === true;
/* 권리분석 콘텐츠는 아파트만 다룬다. 법원경매는 `ut`, 공매는 소분류 `scls` 를 본다.
   오피스텔·주상복합·다세대는 아파트가 아니다 — 권리관계와 시세 비교 방식이 달라
   같은 글에 섞으면 안 된다. */
const isApt = x => isGm(x) ? x.scls === '아파트' : x.ut === '아파트';
const bkey = x => isGm(x) ? `gm-${x.id}` : `ct-${x.caNo}-${x.ino||1}`;
const bdate = x => isGm(x) ? x.end : x.d;
const bfaults = x => isGm(x) ? gmFaults(x) : blogFaults(x);

function blogPool(){
  const lim = plusDays(BLOG.lead);
  const court = D.filter(x => DAEGU.has(x.r) && x.st==='진행중' && x.d && x.d >= lim);
  const gongmae = (typeof ONBID!=='undefined' ? ONBID : [])
    .filter(x => DAEGU.has(x.r) && x.end && x.end >= lim)
    .map(x => ({...x, __gm:true}));
  const all = [...court, ...gongmae];
  let pool = BLOG.use==='아파트' ? all.filter(isApt) : all;
  if(BLOG.reg==='대구권') pool = pool.filter(inDaegu);
  return pool.sort((a,b)=>
    // 전체를 볼 때도 대구권이 먼저 온다. 그다음이 기일 순.
    (inDaegu(b) - inDaegu(a)) || (bdate(a) < bdate(b) ? -1 : 1));
}

/* 붙여넣어 바로 쓸 수 있는 초안. 확인 못 한 것은 확인 못 했다고 적는다. */
function blogDraft(x){
  const A = areaOf(x), B = x.br || {}, L = [];
  // 제목에는 단지명만. 주소를 통째로 넣으면 바로 아래 '소재지' 줄과 겹친다.
  const nm = (x.br?.bld || x.tx?.nm || '').trim();
  L.push(`[${x.r} ${x.a1||''}${nm?'':' '+(x.a2||'')}] ${nm} ${x.ut||''} 경매`
    .replace(/\s+/g,' ').trim());
  L.push(`· 사건번호 ${x.caNo}${x.multi?` 물건 ${x.ino}`:''} (${x.ct})`);
  L.push(`· 소재지 ${x.a || '미색인'}`);
  L.push(`· 매각기일 ${x.d} (${dday(x.d)})`);
  L.push(`· 감정가 ${won(x.ap)} / 최저가 ${won(x.mn)}${x.rt!=null?` (${x.rt}%)`:''}`);
  if(A) L.push(`· 전용면적 ${A.txt}${A.src==='대장'?' (건축물대장)':''}`
    + (B.apr?` · ${B.apr.slice(0,4)}년 사용승인`:'') + (B.strct?` · ${B.strct}`:''));
  // 국토부 실거래가가 붙었으면 그걸 쓴다. 네이버 색인값(tx)은 대체재일 뿐이다.
  if(x.mk) L.push(...mkLines(x));
  else if(x.tx) L.push(`· 인근 실거래 ${won(x.tx.amt)} (${x.tx.nm} ${x.tx.ar}㎡, ${x.tx.d})`);
  L.push(`· 유찰 ${x.f||0}회 · 확인된 특수권리 없음`);
  L.push('');
  L.push('※ 등기부 갑구·을구(말소기준권리·근저당·가압류)와 임차인 전입일·확정일자는');
  L.push('   확인하지 않았습니다. 입찰 전 등기사항증명서와 매각물건명세서를 직접 보십시오.');
  return L.join('\n');
}

function gmDraft(x){
  const L = [];
  L.push(`[${x.r} ${x.a1||''}] ${x.scls||x.mcls||''} 공매`.replace(/\s+/g,' ').trim());
  L.push(`· 온비드 관리번호 ${x.mg}`);
  L.push(`· 물건명 ${x.nm}`);
  L.push(`· 재산구분 ${x.div} · 처분방식 ${x.disp}${x.bid?` · ${x.bid}`:''}`);
  L.push(`· 입찰마감 ${x.end}${x.endt?` ${x.endt}`:''} (${dday(x.end)})`);
  L.push(`· 감정가 ${won(x.ap)} / 최저입찰가 ${won(x.mn)}${x.rt!=null?` (${x.rt}%)`:''}`);
  if(x.land || x.bld) L.push(`· ${[x.land&&`토지 ${x.land}㎡`, x.bld&&`건물 ${x.bld}㎡`].filter(Boolean).join(' · ')}`);
  if(x.mk) L.push(...mkLines(x));
  L.push(`· 유찰 ${x.f||0}회 · 집행기관 ${x.org||'—'}`);
  L.push('');
  L.push('※ 공매는 법원경매와 절차가 다릅니다. 국세징수법을 따르므로 인도명령이 없어');
  L.push('   명도를 직접 해결해야 합니다. 등기부 권리관계와 임차인 정보는 이 목록에');
  L.push('   들어 있지 않습니다. 온비드 물건상세와 등기사항증명서를 직접 확인하십시오.');
  return L.join('\n');
}

/* ══════ 대시보드 연동 ══════
   '권리분석보내기'를 체크하면 그 물건을 '안효준 대리 업무 대시보드'의 데일리 경매분석에
   올린다. 두 아티팩트가 서로 직접 말을 걸 길은 없다. 대신 대시보드는 이미 Google Drive
   백업 폴더에서 ahj_market_chunk_*.json 파일을 찾아 읽어 들이고, 같은 사건번호가 있으면
   갱신·없으면 추가한다. 그러니 같은 폴더에 같은 모양의 파일을 하나 써 두면 대시보드를
   다음에 열 때(또는 열려 있으면 몇 분 안에) 자동으로 등록된다.
   claude.ai 안에서 열었을 때만(claude.use("mcp")) 쓸 수 있다. 밖에서 열면 체크 표시는
   전처럼 이 브라우저에만 남고, 전송은 건너뛴다. 체크를 해제해도 대시보드 쪽은 지우지 않는다
   — 조사 기록은 남겨 두는 편이 안전하고, 필요하면 대시보드에서 직접 삭제하면 된다.
   (2026-09-07 다른 세션이 배포본에 직접 넣은 기능을 원본으로 옮겨 왔다.) */
const DASH_DRIVE_SERVER = 'Google Drive';
const DASH_DRIVE_FOLDER_ID = '1ZkIT6DPRGBg8DYu9ezNTEjo6ekUJMvZ4';
const DASH_CHUNK_PREFIX = 'ahj_market_chunk_';
const DASH_SENT_KEY = 'auction-board.dash.sent.v1';
/* 연결은 claude.use('mcp') 로 받는다(런타임 0.2). window.claude.mcp 같은 멤버는 없다.
   처음 한 번 요청해 두고 결과를 기억한다. 뷰어가 답하지 않으면 10초 뒤 null 로 풀린다. */
let _dashMcp = null, _dashMcpDone = false;
const _dashMcpP = (() => {
  try {
    if(window.claude && typeof window.claude.use === 'function'){
      return Promise.resolve(window.claude.use('mcp')).then(m => { _dashMcp = m || null; _dashMcpDone = true; return _dashMcp; })
        .catch(() => { _dashMcpDone = true; return null; });
    }
  } catch (_) {}
  _dashMcpDone = true;
  return Promise.resolve(null);
})();
const dashOk = () => !!(_dashMcp && typeof _dashMcp.callTool === 'function');
const dashPossible = () => !!(window.claude && typeof window.claude.use === 'function');
/* 연결이 뒤늦게 도착하면 통계칸의 안내문을 갈아 끼운다. */
_dashMcpP.then(() => {
  const el = document.getElementById('dash-hint');
  if(el) el.innerHTML = dashHintHtml();
});
function dashHintHtml(){
  if(dashOk()) return '권리분석보내기를 체크하면 <b>안효준 대리 업무 대시보드 · 데일리 경매분석</b>에 자동 등록됩니다';
  if(dashPossible() && !_dashMcpDone) return '대시보드 연결 확인 중…';
  if(dashPossible()) return 'Google Drive 연결이 허용되지 않아 대시보드 자동 등록이 꺼져 있습니다 — 새로고침 후 연결을 허용해 주세요';
  return '대시보드 자동 등록은 claude.ai에서 연 창에서만 작동합니다';
}
const _dsent = (() => {
  try { return new Set(JSON.parse(localStorage.getItem(DASH_SENT_KEY) || '[]')); }
  catch (_) { return new Set(); }
})();
function dashSentSave(){
  try { localStorage.setItem(DASH_SENT_KEY, JSON.stringify([..._dsent])); } catch (_) {}
}
/* 대시보드의 물건종류 목록: 아파트·오피스텔·다세대·연립·단독·다가구·상가·토지·공장·기타 */
function dashPropType(x){
  const s = isGm(x) ? [x.scls, x.mcls].filter(Boolean).join(' ') : (x.ut || '');
  if(/아파트/.test(s)) return '아파트';
  if(/오피스텔/.test(s)) return '오피스텔';
  if(/다세대|연립|빌라/.test(s)) return '다세대·연립';
  if(/단독|다가구/.test(s)) return '단독·다가구';
  if(/상가|근린|점포/.test(s)) return '상가';
  if(/공장/.test(s)) return '공장';
  if(/토지|대지|임야|전답|^답$|^전$|농지/.test(s)) return '토지';
  return '기타';
}
function dashItem(x){
  const sp = Array.isArray(x.sp) ? x.sp.filter(Boolean) : [];
  const memoBits = [`현황판 권리분석보내기 (${TODAY})`];
  if(isGm(x)){
    if(x.div) memoBits.push(x.div);
    if(x.st) memoBits.push(`공매 ${x.st}`);
  } else {
    if(sp.length) memoBits.push(`특이사항 ${sp.join(', ')}`);
    if(x.note) memoBits.push(String(x.note).trim());
  }
  const bld = isGm(x)
    ? ((x.mk && x.mk.nm) || '')
    : ((x.br && x.br.bld) || (x.tx && x.tx.nm) || (x.mk && x.mk.nm) || '');
  return {
    date: TODAY,
    // 대장 단지는 대시보드에서도 한눈에 보이게 ⭐ 를 앞에 단다.
    buildingName: (x.lm ? '⭐ ' : '') + String(bld || x.lm || '').trim(),
    // 전용면적(㎡)은 건축물대장 값만 싣는다 — 동·호까지 특정한 숫자다.
    // mk.ar 은 단지 대표 평형이라(arGuess) 이 호수의 면적이 아니다.
    // 모르면 null 로 보낸다. 0 을 보내면 대시보드에서 '0㎡' 로 읽힌다.
    exclusiveArea: (!isGm(x) && x.br && x.br.ar) ? Math.round(x.br.ar * 100) / 100 : null,
    caseNumber: isGm(x) ? `공매 ${x.mg || x.id}` : `${x.caNo}${x.multi ? ` 물건${x.ino || 1}` : ''}`,
    court: isGm(x) ? (x.org || '온비드 공매') : (x.ct || ''),
    region: [x.r, x.a1].filter(Boolean).join(' '),
    propertyType: dashPropType(x),
    address: isGm(x) ? (x.nm || '') : (x.a || ''),
    appraisalValue: Number(x.ap) || 0,
    minSalePrice: Number(x.mn) || 0,
    saleDate: bdate(x) || '',
    failCount: Number(x.f) || 0,
    status: '조사중',
    winningBid: 0,
    memo: memoBits.join(' · '),
    analysisWritten: false,   // 대시보드의 '분석글 작성' 표시는 글을 올린 뒤 대시보드에서 직접 켠다
    source: '전국 경매 물건 현황판',
    sourceKey: bkey(x),
    updatedAt: new Date().toISOString(),
  };
}
/* 카드에 붙은 키(bkey)로 원본 물건을 되찾는다. 공매는 blogPool 이 __gm 을 붙여 복사하므로
   여기서도 같은 표식을 붙여 돌려준다. */
function dashItemByKey(key){
  if(key.startsWith('gm-')){
    const id = key.slice(3);
    const g = (typeof ONBID!=='undefined' ? ONBID : []).find(x => String(x.id) === id);
    return g ? {...g, __gm:true} : null;
  }
  const m = /^ct-(.+)-(\d+)$/.exec(key);
  if(!m) return null;
  return D.find(x => x.caNo === m[1] && String(x.ino||1) === m[2]) || null;
}
function dashSetStatus(c, cls, text){
  const box = c.closest('.bact'); if(!box) return;
  let el = box.querySelector('.dash-st');
  if(!text){ if(el) el.remove(); return; }
  if(!el){ el = document.createElement('span'); el.className = 'dash-st'; box.insertBefore(el, box.firstChild); }
  el.className = 'dash-st' + (cls ? ' ' + cls : '');
  el.textContent = text;
}
/* 보낸 물건의 매각 결과를 대시보드에 알린다. 현황판 데이터가 갱신되어 상태가 '진행중'이 아니게 되면
   (매각·종료·취하 등) 같은 사건번호로 courtResult 만 얹은 청크를 한 번 보낸다. 대시보드는 카드에
   "현황판 결과: 매각" 으로 표시하고, 최종 상태(낙찰/패찰/유찰)는 대리님이 고른다. 결과별로 한 번만 보낸다.
   (2026-09-09 다른 세션이 배포본에 직접 넣은 것을 원본으로 옮겨 왔다. 06시 루틴의 dash_sync.py 와
   겹치지만 해가 없다 — 대시보드는 같은 사건번호를 갱신한다.) */
const DASH_RESULT_KEY = 'auction-board.dash.result.v1';
async function dashSyncResults(){
  if(!dashOk() || !_dsent.size) return;
  let sent = {};
  try { sent = JSON.parse(localStorage.getItem(DASH_RESULT_KEY) || '{}'); } catch (_) { sent = {}; }
  const updates = [];
  for(const key of _dsent){
    const x = dashItemByKey(key); if(!x) continue;
    const st = x.st || '';
    const live = isGm(x) ? /입찰준비중|입찰진행중|수의계약가능/.test(st) : st === '진행중';
    if(live || !st) continue;
    if(sent[key] === st) continue;
    updates.push({ caseNumber: dashItem(x).caseNumber, courtResult: st, courtResultAt: TODAY, updatedAt: new Date().toISOString() });
    sent[key] = st;
  }
  if(!updates.length) return;
  try {
    await _dashMcp.callTool(DASH_DRIVE_SERVER, 'create_file', {
      title: `${DASH_CHUNK_PREFIX}${TODAY}_results_${new Date().toISOString().replace(/[-:]/g,'').slice(0,15)}.json`,
      textContent: JSON.stringify(updates),
      contentMimeType: 'application/json',
      disableConversionToGoogleType: true,
      parentId: DASH_DRIVE_FOLDER_ID,
    });
    try { localStorage.setItem(DASH_RESULT_KEY, JSON.stringify(sent)); } catch (_) {}
  } catch (_) { /* 다음에 다시 시도 */ }
}
_dashMcpP.then(() => { setTimeout(dashSyncResults, 1500); });

async function dashSend(key, c){
  if(!_dashMcpDone){ dashSetStatus(c, 'busy', '대시보드 연결 확인 중…'); await _dashMcpP; }
  if(!dashOk()){
    dashSetStatus(c, 'err', dashPossible()
      ? 'Google Drive 연결이 허용되지 않아 대시보드에 보내지 못했습니다 — 새로고침 후 연결을 허용해 주세요'
      : '대시보드 연동은 claude.ai에서 연 창에서만 됩니다');
    return;
  }
  const x = dashItemByKey(key);
  if(!x){ dashSetStatus(c, 'err', '물건을 찾지 못해 대시보드에 보내지 못했습니다'); return; }
  dashSetStatus(c, 'busy', '대시보드로 보내는 중…');
  const item = dashItem(x);
  /* 이미 대시보드에 올라가 있는 물건이면 status 를 빼고 보낸다.
     우리는 사용자가 대시보드에서 그걸 무엇으로 바꿔 뒀는지 모른다 —
     '조사중' 을 실어 보내면 그 값을 덮어쓴다. 2026-09-22 에 실제로
     입찰예정 3건이 조사중으로 되돌아가 사용자가 손으로 고쳤다
     ("현황판 재등록 카드 병합으로 조사중으로 되돌아간 상태 복구").
     모르는 값은 보내지 않는다 — 그러면 대시보드가 제 값을 지킨다.
     BDONE_SEED 는 저장소 bdone.json(루틴이 보낸 것), _dsent 는 이 브라우저가
     보낸 것이다. 체크박스 핸들러가 BDONE.set 을 먼저 하므로 BDONE.has 로는
     새 물건과 재전송을 가릴 수 없다 — 이 둘을 직접 본다.
     dash_sync.py 쪽은 마지막에 보낸 status 를 되돌려 보내 이미 지켜지고 있다.
     한쪽만 맞춰 두면 이런 식으로 어긋난다. */
  if(BDONE_SEED.includes(key) || _dsent.has(key)) delete item.status;
  const stamp = new Date().toISOString().replace(/[-:]/g,'').slice(0,15);
  const safe = key.replace(/[^0-9A-Za-z가-힣._-]+/g,'_');
  try {
    await _dashMcp.callTool(DASH_DRIVE_SERVER, 'create_file', {
      title: `${DASH_CHUNK_PREFIX}${TODAY}_${safe}_${stamp}.json`,
      textContent: JSON.stringify([item]),
      contentMimeType: 'application/json',
      disableConversionToGoogleType: true,
      parentId: DASH_DRIVE_FOLDER_ID,
    });
    _dsent.add(key); dashSentSave();
    dashSetStatus(c, 'ok', '대시보드 데일리 경매분석에 보냈습니다');
  } catch (err) {
    const code = err && (err.code || err.message) ? ` (${err.code || err.message})` : '';
    dashSetStatus(c, 'err', '대시보드 전송 실패' + code + ' — 체크를 풀었다 다시 하면 재시도합니다');
  }
}

const bchk = x => `<label class="bdone-c" title="체크하면 이 물건을 대시보드 데일리 경매분석으로 보냅니다">
  <input type="checkbox" data-bdone="${esc(bkey(x))}"${BDONE.has(bkey(x))?' checked':''}>
  <span>권리분석보내기</span></label>${BDONE.has(bkey(x)) && _dsent.has(bkey(x)) ? '<span class="dash-st ok">대시보드 전송됨</span>' : ''}`;

function pgBlog(){
  const poolAll = blogPool();
  const srcOk = x => BLOG.src==='전체' || (BLOG.src==='공매') === isGm(x);
  const passAll = poolAll.filter(x=>!bfaults(x).length);
  const nCourt = passAll.filter(x=>!isGm(x)).length, nGm = passAll.length - nCourt;
  const pass = passAll.filter(srcOk);
  const drop = poolAll.filter(x=>bfaults(x).length).filter(srcOk);
  const shown = pass.slice(0, BLOG_CAP);

  let h = `
  <div class="phead">
    <span class="eyebrow"><span class="dot"></span>블로그컨텐츠 · 대구권</span>
    <h1>글로 쓸 만한 물건</h1>
    <p class="dek">${BLOG.reg==='대구권'?'대구광역시 8개 구·군':'대구·경북'}에서 <b>매각기일(공매는 입찰마감)이 ${BLOG.lead}일 이상 남았고</b>,
      결격 사유가 하나도 걸리지 않은 물건만 남깁니다. 소개 글을 쓰고 현장을 볼 시간이 있는 물건들입니다.
      <b class="gm-t">보라 테두리</b>는 온비드 공매입니다.
      기본은 <b>아파트만</b> 봅니다 — 권리분석 글은 아파트만 쓰기 때문입니다.
      오피스텔·주상복합·다세대는 권리관계와 시세 비교 방식이 달라 빠집니다.</p>
    <div class="seg" style="margin-top:14px;width:max-content">
      <span class="lb">기일 여유</span>
      ${[7,14,21,30].map(n=>`<button data-lead="${n}" class="${BLOG.lead===n?'on':''}">${n}일</button>`).join('')}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:9px;margin-top:9px">
      <div class="seg"><span class="lb">출처</span>
        ${['전체','법원경매','공매'].map(v=>
          `<button data-bsrc="${v}" class="${BLOG.src===v?'on':''}">${v}</button>`).join('')}</div>
      <div class="seg"><span class="lb">용도</span>
        ${['아파트','전체'].map(v=>
          `<button data-buse="${v}" class="${BLOG.use===v?'on':''}">${v}</button>`).join('')}</div>
      <div class="seg"><span class="lb">지역</span>
        ${['대구권','대구·경북'].map(v=>
          `<button data-breg="${v}" class="${BLOG.reg===v?'on':''}">${v}</button>`).join('')}</div>
    </div>
  </div>

  <div class="notice"><span class="pk">읽는 법</span>
    <p><b>"확인된 문제가 없다"는 뜻이지 "문제가 없다"는 뜻이 아닙니다.</b>
    등기부 갑구·을구를 보지 못하므로 말소기준권리와 인수/소멸은 애초에 판정 대상이 아닙니다.
    임차인의 전입일·확정일자·보증금액도 매각물건명세서 원본에 있어 확인할 수 없습니다.
    아래는 <b>대법원 사건기록에서 드러나는 위험 신호가 없는 물건</b>일 뿐입니다.</p></div>

  <div class="notice gm-n"><span class="pk">공매는 더 모릅니다</span>
    <p>온비드 목록에는 <b>등기부 권리관계도 임차인 정보도 들어 있지 않습니다.</b>
    법원경매는 문건접수내역으로 배당요구·유치권신고를 볼 수 있지만 공매는 그마저 없습니다.
    게다가 공매는 국세징수법을 따라 <b>인도명령이 없어 명도를 직접 해결해야</b> 합니다.
    보라 테두리 카드의 "결격 없음" 은 법원경매 카드보다 훨씬 약한 말입니다.</p></div>

  <div class="stats" style="margin-top:14px">
    <div class="stat"><div class="stat-k">기일 ${BLOG.lead}일 이상 · ${BLOG.use==='아파트'?'아파트':'전체 용도'} · ${esc(BLOG.reg)}</div>
      <div class="stat-v"><span class="n mono">${poolAll.length}</span><span class="u">건</span></div></div>
    <div class="stat hl"><div class="stat-k">결격 사유 없음</div>
      <div class="stat-v"><span class="n mono">${pass.length}</span><span class="u">건</span></div>
      <div class="stat-k" style="margin-top:4px">법원경매 ${nCourt} · <span class="gm-t">공매 ${nGm}</span></div></div>
    <div class="stat"><div class="stat-k">걸러낸 물건</div>
      <div class="stat-v"><span class="n mono">${drop.length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">권리분석보내기</div>
      <div class="stat-v"><span class="n mono">${pass.filter(x=>BDONE.has(bkey(x))).length}</span>
        <span class="u">/ ${pass.length}</span></div>
      <div class="stat-k" style="margin-top:4px">${LS_OK
        ? `저장분 ${BDONE_SEED.length}건 + 이 브라우저 변경분`
        : '<b class="mk-warn-t">이 브라우저는 저장을 막고 있습니다</b> — 창을 닫으면 풀립니다'}</div>
      <div class="stat-k" id="dash-hint" style="margin-top:4px">${dashHintHtml()}</div>
      <button class="tab bexport${LS_OK?'':' on'}" style="margin-top:6px">표시 내보내기</button>
      ${LS_OK?'':'<div class="stat-k" style="margin-top:4px">지금 체크한 것을 내보내 알려주시면 영구 저장분에 넣어 드립니다</div>'}</div>
  </div>`;

  h += `<h2 class="sec">소재 ${pass.length}건${pass.length>BLOG_CAP?` <span class="chip mono">${BLOG_CAP}건 표시</span>`:''}</h2>`;
  if(pass.length>BLOG_CAP)
    h += `<p class="sub">임박한 순으로 ${BLOG_CAP}건만 보여줍니다. 출처나 기일 여유를 좁혀 보십시오.</p>`;
  if(!pass.length){
    h += `<div class="empty">기간을 넓히거나 기준을 낮추면 후보가 늘어납니다.</div>`;
  } else {
    h += shown.map(x=>{
      if(isGm(x)) return `<section class="bcard gm${BDONE.has(bkey(x))?' bdone':''}">
        <div class="bhead">
          <div>
            <div class="cmeta"><span class="cno gm-t">${esc(x.mg)}</span>
              <span class="ino gm-i">공매</span><span>${esc(x.org||'')}</span>
              <span class="bdg b-live">${esc(x.end)}</span><span class="dd">${dday(x.end)}</span>${mkChip(x)}</div>
            <h3>${esc(x.nm)}</h3>
            <p class="sub" style="margin:4px 0 0">${esc(x.div)} · ${esc([x.mcls,x.scls].filter(Boolean).join(' · '))}
              ${x.land||x.bld?` · ${[x.land&&`토지 ${x.land}㎡`,x.bld&&`건물 ${x.bld}㎡`].filter(Boolean).join(' · ')}`:''}
              · 감정 ${won(x.ap)} → 최저 ${won(x.mn)}${x.rt!=null?` (${x.rt}%)`:''}
              · 유찰 ${x.f||0}회</p>
          </div>
          <div class="bact">
            ${bchk(x)}
            <button class="tab on bcopy" data-copy="${esc(bkey(x))}">본문 복사</button>
          </div>
        </div>
        ${mkPanel(x)}
        <pre class="bdraft" id="bd-${esc(bkey(x))}">${esc(gmDraft(x))}</pre>
      </section>`;
      const A = areaOf(x);
      return `<section class="bcard${BDONE.has(bkey(x))?' bdone':''}">
        <div class="bhead">
          <div>
            <div class="cmeta"><span class="cno">${esc(x.caNo)}</span>
              ${x.multi?`<span class="ino">물건 ${x.ino}</span>`:''}<span>${esc(x.ct)}</span>
              <span class="bdg b-live">${esc(x.d)}</span><span class="dd">${dday(x.d)}</span>${mkChip(x)}</div>
            <h3>${addrOf(x)}</h3>
            <p class="sub" style="margin:4px 0 0">${esc(x.ut||'')}
              ${A?` · ${esc(A.txt)}`:''}${x.br?.apr?` · ${x.br.apr.slice(0,4)}년`:''}
              · 감정 ${won(x.ap)} → 최저 ${won(x.mn)}${x.rt!=null?` (${x.rt}%)`:''}
              · 유찰 ${x.f||0}회</p>
          </div>
          <div class="bact">
            ${bchk(x)}
            <button class="fsel" data-det="${esc(`${x.ct}|${x.caNo}|${x.ino||1}`)}">상세</button>
            <button class="tab on bcopy" data-copy="${esc(bkey(x))}">본문 복사</button>
          </div>
        </div>
        ${mkPanel(x)}
        <pre class="bdraft" id="bd-${esc(bkey(x))}">${esc(blogDraft(x))}</pre>
      </section>`;
    }).join('');
  }

  const dropShown = drop.slice(0, 120);
  h += `<h2 class="sec">걸러낸 ${drop.length}건${drop.length>120?' <span class="chip mono">120건 표시</span>':''}</h2>
    <p class="sub">왜 뺐는지 보여 둡니다. 기준이 과하다 싶으면 여기서 골라 쓰십시오.</p>
    <div class="panel"><div class="panel-b"><div class="tblwrap"><table>
    <thead><tr><th>사건번호</th><th>소재지</th><th>기일</th><th>결격 사유</th></tr></thead><tbody>
    ${dropShown.map(x=>isGm(x)
      ? `<tr class="gm-r"><td><b class="gm-t">${esc(x.mg)}</b> <span class="t-sub">공매</span></td>
          <td>${esc((x.nm||'').slice(0,44))}</td><td class="n">${esc(x.end||'—')}</td>
          <td>${gmFaults(x).map(f=>`<span class="sp-t">${esc(f)}</span>`).join(' ')}</td></tr>`
      : `<tr data-det="${esc(`${x.ct}|${x.caNo}|${x.ino||1}`)}">
          <td><b>${esc(x.caNo)}</b>${x.multi?` <span class="t-sub">물건 ${x.ino}</span>`:''}</td>
          <td>${x.a ? esc(x.a.slice(0,44)) : '<span class="miss">소재지 미색인</span>'}</td><td class="n">${esc(x.d)}</td>
          <td>${blogFaults(x).map(f=>`<span class="sp-t">${esc(f)}</span>`).join(' ')}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;

  return h + FOOT;
}

WIRE.blog = () => {
  $('view').querySelectorAll('[data-lead]').forEach(b=>b.onclick=()=>{
    BLOG.lead = +b.dataset.lead; go('blog');
  });
  $('view').querySelectorAll('[data-bsrc]').forEach(b=>b.onclick=()=>{
    BLOG.src = b.dataset.bsrc; go('blog');
  });
  $('view').querySelectorAll('[data-buse]').forEach(b=>b.onclick=()=>{
    BLOG.use = b.dataset.buse; go('blog');
  });
  $('view').querySelectorAll('[data-breg]').forEach(b=>b.onclick=()=>{
    BLOG.reg = b.dataset.breg; go('blog');
  });
  $('view').querySelectorAll('[data-bdone]').forEach(c=>c.onchange=e=>{
    e.stopPropagation();
    const key = c.dataset.bdone;
    BDONE.set(key, c.checked);
    bdoneSave();
    if(c.checked) dashSend(key, c);
    else dashSetStatus(c, '', '');
    // 다시 그리면 보던 자리를 잃는다. 클래스와 숫자만 손본다.
    c.closest('.bcard')?.classList.toggle('bdone', c.checked);
    const n = $('view').querySelectorAll('.bcard.bdone').length;
    const el = [...$('view').querySelectorAll('.stat')]
      .find(s=>s.querySelector('.stat-k')?.textContent==='권리분석보내기');
    const num = el?.querySelector('.n');
    if(num) num.textContent = n;
  });
  /* 브라우저 저장분을 저장소에 구워 넣으려면 값을 밖으로 꺼낼 수 있어야 한다.
     이 코드를 대화에 붙여넣으면 data/bdone.json 에 반영된다. */
  const bx = $('view').querySelector('.bexport');
  if(bx) bx.onclick = async () => {
    const t = JSON.stringify(BDONE.keys());
    let ok = true;
    try { await navigator.clipboard.writeText(t); } catch (_) { ok = false; }
    bx.textContent = ok ? `복사됨 (${BDONE.size}건)` : '복사 실패 — 아래 상자에서 직접 복사하세요';
    if(!ok){
      const ta = document.createElement('textarea');
      ta.value = t; ta.rows = 3;
      ta.style.cssText = 'width:100%;margin-top:6px;font:11px ui-monospace,monospace';
      bx.after(ta); ta.select();
    }
    setTimeout(()=>{ if(ok) bx.textContent = '표시 내보내기'; }, 2500);
  };
  $('view').querySelectorAll('.bcopy').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    const t = $(`bd-${b.dataset.copy}`)?.textContent || '';
    // 아티팩트 iframe 에서 clipboard 가 막히는 경우가 있어 실행취소용 경로를 둔다.
    let ok = true;
    try { await navigator.clipboard.writeText(t); }
    catch(_){
      try {
        const ta = document.createElement('textarea');
        ta.value = t; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy'); ta.remove();
      } catch(__) { ok = false; }
    }
    b.textContent = ok ? '복사됨' : '직접 선택하세요';
    setTimeout(()=>{ b.textContent = '본문 복사'; }, 1600);
  });
};

/* ══════ 11. 온비드 공매 ══════
   법원경매(민사집행)와 다른 절차다. 온비드 공매는 국세·지방세 체납으로
   압류된 재산(압류재산)이나 국·공유재산을 한국자산관리공사가 파는 것이다.
   최저입찰가·유찰 개념은 비슷하지만 **명도책임과 권리 인수 구조가 다르다.** */

const OB = { div:'전체', st:'2026 진행·예정', r:'전체', q:'' };
const OB_DIVS = ['전체', ...new Set(ONBID.map(x=>x.div).filter(Boolean))];
const OB_STS  = ['2026 진행·예정','입찰진행중','입찰준비중','수의계약가능','전체'];

function obFilter(){
  return ONBID.filter(x=>{
    if(OB.r!=='전체' && x.r!==OB.r) return false;
    if(OB.div!=='전체' && x.div!==OB.div) return false;
    if(OB.st==='2026 진행·예정'){
      if(!(x.end && x.end>='2026-01-01' && ['입찰진행중','입찰준비중'].includes(x.st))) return false;
    } else if(OB.st!=='전체' && x.st!==OB.st) return false;
    if(OB.q){ const q=OB.q.toLowerCase();
      if(!`${x.nm} ${x.a1} ${x.a2} ${x.org} ${x.scls} ${x.mg}`.toLowerCase().includes(q)) return false; }
    return true;
  });
}

function obRow(x){
  const live = x.st==='입찰진행중';
  return `<tr>
    <td><b>${esc(x.nm||'')}</b>
      <div class="t-sub">${esc(x.mg||'')} · ${esc(x.org||'')}</div></td>
    <td style="white-space:nowrap">${esc(x.div)}<div class="t-sub">${esc(x.disp)} · ${esc(x.bid||'')}</div></td>
    <td>${esc([x.mcls,x.scls].filter(Boolean).join(' · '))}
      ${x.land||x.bld?`<div class="t-sub">${x.land?`토지 ${x.land}㎡`:''}${x.land&&x.bld?' · ':''}${x.bld?`건물 ${x.bld}㎡`:''}</div>`:''}</td>
    <td class="n">${x.ap?won(x.ap):'—'}</td>
    <td class="n">${x.mn?won(x.mn):'—'}</td>
    <td class="n">${x.rt!=null?`<span class="${x.rt>=60?'rt-hi':x.rt>=30?'rt-mid':'rt-lo'}">${x.rt}%</span>`:'—'}</td>
    <td class="n">${x.f ?? '—'}</td>
    <td style="white-space:nowrap">${x.end?esc(x.end):'—'}${x.endt?`<div class="t-sub">${esc(x.endt)} 마감</div>`:''}</td>
    <td><span class="bdg ${live?'b-live':'b-done'}">${esc(x.st)}</span></td></tr>`;
}

function pgOnbid(){
  const hits = obFilter();
  const live2026 = ONBID.filter(x=>x.end&&x.end>='2026-01-01'&&['입찰진행중','입찰준비중'].includes(x.st));
  const seg = (arr,key,cur)=>`<div class="seg">${arr.map(v=>
    `<button data-ob="${key}" data-v="${esc(v)}" class="${cur===v?'on':''}">${esc(v)}</button>`).join('')}</div>`;

  return `
  <div class="phead">
    <span class="eyebrow"><span class="dot"></span>온비드 공매 · 대구·경북</span>
    <h1>온비드 공매물건</h1>
    <p class="dek">한국자산관리공사 온비드에서 대구·경북 물건을 받아옵니다.
      기본은 <b>입찰 마감이 2026년이고 진행중이거나 예정인 물건</b>입니다.</p>
  </div>

  <div class="notice"><span class="pk">법원경매와 다릅니다</span>
    <p>공매는 <b>국세·지방세 체납으로 압류된 재산</b>이나 국·공유재산을 캠코가 파는 절차입니다.
    민사집행법이 아니라 국세징수법을 따르므로 <b>인도명령이 없어 명도를 직접 해결해야</b> 하고,
    대항력 있는 임차인의 보증금 인수 판단도 법원경매와 다릅니다.
    이 표는 온비드가 공개하는 목록일 뿐이며 권리분석이 아닙니다.</p></div>

  <div class="stats">
    <div class="stat"><div class="stat-k">수집 물건</div>
      <div class="stat-v"><span class="n mono">${ONBID.length}</span><span class="u">건</span></div></div>
    <div class="stat hl"><div class="stat-k">2026년 진행·예정</div>
      <div class="stat-v"><span class="n mono">${live2026.length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">입찰진행중</div>
      <div class="stat-v"><span class="n mono">${ONBID.filter(x=>x.st==='입찰진행중').length}</span><span class="u">건</span></div></div>
    <div class="stat"><div class="stat-k">현재 조건</div>
      <div class="stat-v"><span class="n mono">${hits.length}</span><span class="u">건</span></div></div>
  </div>

  <div class="panel" style="margin-top:14px"><div class="panel-b">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="fsel" id="obq" type="search" placeholder="물건명·소재지·기관·관리번호"
        value="${esc(OB.q)}" style="flex:1;min-width:220px;font-weight:500" aria-label="검색">
      ${seg(['전체','대구','경북'],'r',OB.r)}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">
      ${seg(OB_STS,'st',OB.st)}${seg(OB_DIVS,'div',OB.div)}
    </div>
  </div></div>

  <h2 class="sec">${hits.length}건</h2>
  ${hits.length ? `<div class="panel"><div class="panel-b"><div class="tblwrap"><table>
    <thead><tr><th>물건</th><th>구분</th><th>용도</th><th>감정가</th><th>최저입찰가</th>
      <th>비율</th><th>유찰</th><th>입찰마감</th><th>상태</th></tr></thead>
    <tbody>${hits.slice(0,300).map(obRow).join('')}</tbody></table></div>
    ${hits.length>300?`<p class="sub" style="margin:10px 0 0">앞 300건만 표시했습니다. 검색으로 좁혀 보십시오.</p>`:''}
    </div></div>`
   : `<div class="empty">조건에 맞는 물건이 없습니다.</div>`}
  ${FOOT}`;
}

WIRE.onbid = () => {
  $('view').querySelectorAll('[data-ob]').forEach(b=>b.onclick=()=>{
    OB[b.dataset.ob] = b.dataset.v; go('onbid');
  });
  // go() 가 화면을 다시 그려 포커스를 잃는다. 검색은 다른 화면과 같이
  // change/Enter 로만 반영한다(입력 중 재렌더 금지).
  const q = $('obq');
  if(q){ q.onchange = ()=>{ OB.q = q.value.trim(); go('onbid'); };
    q.onkeydown = e=>{ if(e.key==='Enter'){ OB.q = q.value.trim(); go('onbid'); } }; }
};

/* ══════ 12. 자동차 ══════ */
function pgCar(){
  const live = CARS.filter(x=>x.st==='진행중');
  const unk = CARS.filter(x=>x.st==='미확인');
  let h = `
  <div class="phead">
    <span class="eyebrow"><span class="dot"></span>자동차 경매·공매</span>
    <h1>자동차 물건</h1>
    <p class="dek">법원 자동차경매 사건에서 나온 차량입니다.
      <b>대법원 원본으로 대조한 것</b>과 <b>나이스옥션 색인에서 발굴만 한 것</b>이 섞여 있습니다.
      색인 발굴분은 진행상태도 차종도 확인되지 않았습니다 — 카드에 표시했습니다.</p>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-k">수집 차량</div>
      <div class="stat-v"><span class="n mono">${CARS.length}</span><span class="u">대</span></div></div>
    <div class="stat hl"><div class="stat-k">법원 원본 확인 · 진행중</div>
      <div class="stat-v"><span class="n mono">${live.length}</span><span class="u">대</span></div></div>
    <div class="stat"><div class="stat-k">상태 미확인</div>
      <div class="stat-v"><span class="n mono">${unk.length}</span><span class="u">대</span></div></div>
  </div>`;

  if(!CARS.length){
    return h + `<div class="empty">아직 확인된 자동차 물건이 없습니다.</div>` + FOOT;
  }

  h += `<h2 class="sec">차량 ${CARS.length}대</h2>
  <p class="sub">법원 원본으로 대조한 ${live.length}대가 앞에 옵니다. 나머지 ${unk.length}대는 나이스옥션 색인에서 발굴만 한 상태입니다.</p>
  <div class="grid">${CARS.map(x=>`
    <article class="card${x.st!=='진행중'?' closed':''}">
      <div class="thumb"><span class="wm">자동차</span>
        <div class="badges">${x.st==='진행중'?'<span class="bdg b-live">진행</span>'
          : x.st==='미확인'?'<span class="bdg b-unk">상태 미확인</span>'
          :'<span class="bdg b-done">종료</span>'}</div>
        <span class="use-dot">${esc(x.kind||'자동차')}</span>
        <span class="vchip${x.st==='미확인'?' no':''}">${x.st==='미확인'?'미검증':'법원 확인'}</span></div>
      <div class="cbody">
        <div class="cmeta"><span class="cno">${esc(x.caNo)}</span>
          ${x.ino>1?`<span class="ino">물건 ${x.ino}</span>`:''}<span>${esc(x.ct)}</span></div>
        <p class="caddr">${esc(x.name)}</p>
        ${x.loc?`<p class="dline">보관·소재 ${esc(x.loc)}</p>`:''}
        ${x.st==='미확인'?`<div class="unk-mark">진행상태 미확인 — 색인에 상태가 없습니다. 이미 종결된 사건일 수 있어 법원 원본 대조가 필요합니다.</div>`:''}
        <div class="boxes">
          <div class="bx2"><div class="k">등록번호</div><div class="v${x.plate?'':' dim'}">${esc(x.plate||'—')}</div></div>
          <div class="bx2"><div class="k">매각기일</div><div class="v${x.d?'':' dim'}">${esc(x.d||'미색인')}</div></div>
        </div>
        ${x.note?`<p class="cnote">${esc(x.note)}</p>`:''}
        <div class="cfoot">
          <div class="pf"><div class="k">감정가</div><div class="v">${won(x.ap)}</div></div>
          <div class="pf"><div class="k">최저가</div><div class="v ${x.rt>=60?'blue':'lo'}">${won(x.mn)}</div></div>
          <div class="rt-pill"><div class="k">최저가율</div>
            ${x.rt!=null?`<div class="v ${x.rt>=60?'rt-hi':x.rt>=30?'rt-mid':'rt-lo'}">${x.rt}%</div>`
                        :'<div class="v" style="color:var(--muted-fg)">—</div>'}</div>
        </div>
      </div>
    </article>`).join('')}</div>

  <div class="notice" style="margin-top:16px"><span class="pk">자동차경매 주의</span>
    <p>자동차는 <b>차량을 실제로 확보할 수 있는지</b>가 부동산과 다른 핵심 위험입니다.
    채무자가 차를 숨기면 낙찰받아도 인도받지 못할 수 있고, 그 사이 침수·사고·부품 탈거로
    상태가 달라져 있기도 합니다. 압류·저당·과태료 체납은 별도로 확인해야 합니다.
    주행거리·사고이력은 이 화면에 없습니다.</p></div>

  <div class="notice"><span class="pk">온비드 동산</span>
    <p>온비드 공매 쪽 차량은 아직 붙이지 못했습니다. 지금 연동한 온비드 API는
    <b>부동산 물건목록</b>이라 자동차가 나오지 않고(수집 1,899건 전부 부동산),
    동산 물건목록은 별도 서비스인데 엔드포인트를 확인하지 못했습니다.</p></div>`;

  return h + FOOT;
}
