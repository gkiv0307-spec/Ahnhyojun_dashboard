
var state={meta:{},marketAuctions:[]}; function persistLocal(){}
  function uid() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function monthKey() { return todayStr().slice(0, 7); }

  function parseYMD(s) {
    var parts = s.split("-");
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  function marketCaseKey(caseNumber) {
    var t = String(caseNumber || "").trim();
    var c = t.match(/(20\d\d)\s*타경\s*(\d+)/);
    if (!c) return t.toLowerCase();
    var n = t.match(/물건\s*(\d+)|\((\d+)\)/);
    return c[1] + "타경" + String(Number(c[2])) + "#" + (n ? Number(n[1] || n[2]) : 1);
  }

  // 결과가 확정된 상태. 이걸 중간 상태(매각·유찰·조사중)로 되돌리면 안 된다.
  var MARKET_STATUS_FINAL = { "매각종료": true, "낙찰": true, "패찰": true, "취하": true };
  // v84: 상태의 "진행 정도". 현황판이 같은 사건을 '물건1' 꼬리로 다시 보내면서 status 를 조사중으로 보내
  // 대시보드의 변경·입찰예정을 되돌린 사고(2026-09-21, 8824·8801·1098·3134)를 막는다.
  // 들어온 상태가 기존보다 덜 진행된 것이면 무시한다. 같은 단계끼리(변경↔입찰예정↔유찰)는 바꿔도 된다 —
  // 법원 대조 결과가 그 사이를 오가기 때문이다. 확정 상태(FINAL)는 그 위 단계다.
  // 낙찰·패찰은 대리님이 직접 정하는 값이라 맨 위 — 청크가 매각종료로 덮지 못한다.
  var MARKET_STATUS_RANK = { "조사중": 0, "입찰예정": 1, "변경": 1, "유찰": 1, "매각": 2, "매각종료": 3, "취하": 3, "낙찰": 4, "패찰": 4 };
  function marketStatusRank(st) { return MARKET_STATUS_RANK[st] === undefined ? 0 : MARKET_STATUS_RANK[st]; }

  /* v85 (2026-09-22) → v88 (2026-10-08 대리님 지시): 자동으로 들어오는 물건(현황판 자동 등록·PC 수집·check 블록이 있는 줄)의 등록 기준.
     - 매각기일: 오늘부터 45일 안(예전 14일). 15~30일·31~45일 남은 물건도 아래 검증을 통과하면 올린다. 기일이 지난 것은 올리지 않는다.
     - 대구·경산·칠곡(대구권): 기일까지 10일 이상 남아야 한다. 면적 제한 없음(95㎡ 초과도 올린다).
     - 그 밖의 지역: ⭐대장 단지(isStar)이고 전용 95㎡ 이하이고 기일 미경과.
     - 공통: 아파트, 유찰 1회 이하, 최저가 ≥ 감정가 70%, 법원 확인(check.ok === true, 확인일 7일 안). 오래된 check.ok 는 믿지 않는다.
       하나라도 확인이 안 되면 "검증대기"(pendingMarketAdds, waitKind "검증")로 두고 매 병합 때 다시 판정한다. 45일 밖·기일 미정은 "기간 대기".
     - 권리분석 작성 체크(analysisWritten)는 등록 판정에 쓰지 않는다. 법원 검색 화면의 조회 기간은 등록 기간 제한이 아니다.
     - 대리님이 현황판에서 "권리분석보내기"를 체크한 물건과 손으로 만든 청크(manual:true)는 이 제한을 받지 않는다.
       이미 대시보드에 있는 카드의 갱신(결과·기일 변경)도 제한하지 않는다. 기준을 벗어난 기존 카드도 지우지 않는다. */
  var MARKET_AUTO_ADD_WINDOW_DAYS = 45;
  var MARKET_AUTO_HOME_MIN_DAYS = 10;
  var MARKET_AUTO_MAX_FAIL_COUNT = 1;
  var MARKET_AUTO_MIN_PRICE_RATIO = 0.7;
  var MARKET_AUTO_CHECK_MAX_AGE_DAYS = 7;
  // 대구권 판정은 낱말 단위로 한다 — "해운대구"·"수영구" 같은 글자 포함을 대구로 잘못 보지 않게(부산 해운대구 사고 방지).
  function isMarketHomeRegion(m) {
    var toks = String([m && m.region, m && m.address].join(" ")).split(/[\s,()]+/);
    return toks.some(function (t) { return /^대구/.test(t) || /^경산/.test(t) || /^칠곡/.test(t); });
  }
  // ⭐ 대장 단지: isStar 필드. 예전 청크는 단지명 앞에 "⭐ " 를 붙여 보냈으므로 그것도 ⭐로 보되, 저장할 때는 떼어 원본 단지명을 지킨다.
  function isMarketStar(m) { return !!(m && (m.isStar === true || /^\s*⭐/.test(String(m.buildingName || "")))); }
  function marketRawName(m) { return String((m && m.buildingName) || "").replace(/^\s*⭐\s*/, ""); }
  function marketDisplayName(m) { var n = marketRawName(m); return n ? (isMarketStar(m) ? "⭐ " + n : n) : ""; }
  function normalizeMarketStar(m) {
    if (!m) return false;
    var n = String(m.buildingName || "");
    if (!/^\s*⭐/.test(n)) return false;
    m.buildingName = n.replace(/^\s*⭐\s*/, "");
    m.isStar = true;
    return true;
  }
  function normalizeMarketStarsIfNeeded() {
    if (!state.meta || state.meta.marketStarNormalizedV88) return;
    (state.marketAuctions || []).forEach(normalizeMarketStar);
    (state.meta.pendingMarketAdds || []).forEach(normalizeMarketStar);
    state.meta.marketStarNormalizedV88 = true;
    persistLocal();
  }
  // 우선순위: 대구권 ⭐ → 그 밖 ⭐ → 대구권 일반 → 그 밖 일반. 같은 급에서는 탱크 조회수(같은 종류끼리) 높은 순, 미확인(null)은 뒤.
  function marketPriorityTier(m) { var home = isMarketHomeRegion(m), star = isMarketStar(m); return home && star ? 0 : star ? 1 : home ? 2 : 3; }
  function compareMarketPriority(a, b) {
    var t = marketPriorityTier(a) - marketPriorityTier(b);
    if (t) return t;
    var ah = typeof a.tankViews === "number", bh = typeof b.tankViews === "number";
    if (ah !== bh) return ah ? -1 : 1;
    if (ah) {
      var at = String(a.tankViewsType || ""), bt = String(b.tankViewsType || "");
      if (at !== bt) return at.localeCompare(bt);   // 누적↔당일처럼 종류가 다르면 섞어 비교하지 않고 종류별로 묶는다
      if (b.tankViews !== a.tankViews) return b.tankViews - a.tankViews;
    }
    return String(a.saleDate || "9999").localeCompare(String(b.saleDate || "9999"));
  }
  function isBoardAutoRegistration(m) {
    var memo = String((m && m.memo) || "");
    if (memo.indexOf("권리분석보내기") !== -1) return false;
    if (m && m.manual === true) return false;
    if (memo.indexOf("자동 등록") !== -1) return true;
    if (/현황판|PC 수집|탱크/.test(String((m && m.source) || ""))) return true;
    return !!(m && m.check && typeof m.check === "object");
  }
  // 국민평형 기준 (2026-09-22 대리님 지시) — v88 부터 대구권 밖에만 적용한다. 대구·경산·칠곡은 면적 제한 없음.
  // 전용면적을 알 수 있을 때만 판정한다 — 청크의 exclusiveArea(㎡) 또는 메모의 "전용 NN㎡". 모르면 통과.
  var MARKET_AUTO_MAX_AREA = 95;
  // 대리님이 지운(또는 대형평형이라 뺀) 자동 등록 물건은 다시 보내도 되살리지 않는다.
  // state.meta.marketDeletedKeys = { "<사건키>": "YYYY-MM-DD" }. 120일 지나면 잊는다.
  var MARKET_AUTO_EXCLUDED_SEED = { "2025타경7975#1": "포스코더샵 전용 151㎡", "2026타경600574#1": "반석마을2단지 전용 150㎡", "2026타경132#1": "금성백조예미지 전용 101㎡", "2025타경1124#1": "동탄파크자이 전용 99.7㎡" };
  function rememberMarketDeleted(caseNumber) {
    var key = caseNumber && marketCaseKey(caseNumber);
    if (!key) return;
    if (!state.meta.marketDeletedKeys) state.meta.marketDeletedKeys = {};
    state.meta.marketDeletedKeys[key] = todayStr();
  }
  function isMarketKeyExcluded(key) {
    if (!key) return false;
    if (MARKET_AUTO_EXCLUDED_SEED[key]) return true;
    var d = state.meta.marketDeletedKeys && state.meta.marketDeletedKeys[key];
    if (!d) return false;
    if ((Date.now() - parseYMD(d).getTime()) > 120 * 86400000) { delete state.meta.marketDeletedKeys[key]; return false; }
    return true;
  }   // 전용 ㎡. 84형(공급 34평)~36평형(전용 약 90)까지 포함, 40평대(전용 100 이상)는 대형으로 본다
  function marketExclusiveArea(m) {
    if (!m) return 0;
    var a = Number(m.exclusiveArea || m.area || 0);
    if (a > 0) return a;
    var t = String(m.memo || "") + " " + String(m.address || "");
    var c = t.match(/전용\s*(\d+(?:\.\d+)?)\s*㎡/) || t.match(/(\d+(?:\.\d+)?)\s*㎡/);
    return c ? Number(c[1]) : 0;
  }
  function marketDaysUntil(sd, today) {
    sd = String(sd || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) return null;
    return Math.round((parseYMD(sd).getTime() - parseYMD(today || todayStr()).getTime()) / 86400000);
  }
  // 판정 { code, reason }. code: "add"(지금 올림) / "wait"(45일 밖·기일 미정, 기간 대기) / "verify"(확인 안 된 것이 있어 검증대기)
  //   / "drop"(기일 지남·대구권 10일 미만 — 되돌아올 수 없으니 버림) / "large"(대구권 밖 대형평형) / "reject"(유찰 2회 이상·70% 미만·아파트 아님)
  function marketAutoAddDecision(m, today) {
    today = today || todayStr();
    var home = isMarketHomeRegion(m);
    var pt = String((m && m.propertyType) || "");
    if (pt && pt !== "아파트") return { code: "reject", reason: "아파트 아님(" + pt + ")" };
    var diff = marketDaysUntil(m && m.saleDate, today);
    if (diff === null) return { code: "wait", reason: "매각기일 미정" };
    if (diff < 0) return { code: "drop", reason: "매각기일 지남" };
    if (home && diff < MARKET_AUTO_HOME_MIN_DAYS) return { code: "drop", reason: "대구권인데 기일까지 " + diff + "일(10일 미만)" };
    if (diff > MARKET_AUTO_ADD_WINDOW_DAYS) return { code: "wait", reason: "매각기일 " + diff + "일 뒤(45일 밖)" };
    if (!home) {
      var ar = marketExclusiveArea(m);
      if (ar > MARKET_AUTO_MAX_AREA) return { code: "large", reason: "대구권 밖 대형평형(전용 " + ar + "㎡)" };
      if (!isMarketStar(m)) return { code: "verify", reason: "대구권 밖 — ⭐대장 단지 근거 없음" };
    }
    var fc = Number((m && m.failCount) || 0);
    if (fc > MARKET_AUTO_MAX_FAIL_COUNT) return { code: "reject", reason: "유찰 " + fc + "회(1회 초과)" };
    var ap = Number((m && m.appraisalValue) || 0), mp = Number((m && m.minSalePrice) || 0);
    if (!(ap > 0 && mp > 0)) return { code: "verify", reason: "감정가·최저가 누락" };
    if (mp < ap * MARKET_AUTO_MIN_PRICE_RATIO) return { code: "reject", reason: "최저가가 감정가의 " + Math.round(mp / ap * 100) + "%(70% 미만)" };
    var chk = m && m.check;
    if (!chk || typeof chk !== "object") return { code: "verify", reason: "법원 확인 자료 없음(check 없음) — 탱크·현황판만 본 물건" };
    if (chk.ok !== true) return { code: "verify", reason: "check.ok=" + String(chk.ok) + (chk.why ? " · " + chk.why : "") };
    var ca = String(chk.checkedAt || m.courtCheckedAt || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ca)) return { code: "verify", reason: "법원 확인일 없음" };
    var age = -marketDaysUntil(ca, today);
    if (age > MARKET_AUTO_CHECK_MAX_AGE_DAYS) return { code: "verify", reason: "확인 자료가 " + age + "일 전 것(7일 초과) — 최신 자료로 재확인 필요" };
    if (!m.courtCheckedAt && !m.courtStatusRaw && !m.courtResult) return { code: "verify", reason: "법원 원문 확인 기록 없음(courtStatusRaw·courtResult)" };
    var inh = chk.tankInherit !== undefined ? chk.tankInherit : m.tankInherit;
    if (inh !== undefined && inh !== null && inh !== false && inh !== "없음") return { code: "verify", reason: "탱크 인수 여부: " + String(inh) };
    return { code: "add", reason: "기준 충족" + (chk.why ? " · " + chk.why : "") };
  }

  function mergeMarketMemo(oldMemo, newMemo) {
    var a = String(oldMemo || "").trim(), b = String(newMemo || "").trim();
    if (!b) return a;
    if (!a) return b;
    if (a.indexOf(b) !== -1) return a;   // 이미 들어 있다
    if (b.indexOf(a) !== -1) return b;   // 새 글이 옛 글을 품고 있다(내 결과 청크)
    return a + " · " + b;                // 서로 다른 내용이면 붙인다 — 지우지 않는다
  }

  // 들어온 조각을 기존 카드에 얹는다. 빈 값으로 덮어써 지우거나,
  // 확정된 결과를 중간 상태로 되돌리는 일이 없게 한다.
  // v87: 법원 확인(courtCheckedAt)이 기존 카드보다 오래된 조각은 법원 쪽 필드를 덮지 못한다.
  var MARKET_COURT_FIELDS = { courtResult: 1, courtCheckedAt: 1, saleDate: 1, minPrice: 1 };
  function applyMarketChunkFields(existing, incoming) {
    var staleCourt = !!(incoming.courtCheckedAt && existing.courtCheckedAt &&
      String(incoming.courtCheckedAt) < String(existing.courtCheckedAt));
    Object.keys(incoming).forEach(function (k) {
      if (k === "id" || k === "caseNumber") return;   // 식별자와 표기는 기존 것을 지킨다
      if (staleCourt && MARKET_COURT_FIELDS[k]) return;   // 더 새 법원 확인이 이미 있으면 옛 확인으로 되돌리지 않는다
      var v = incoming[k];
      if (k === "memo") { existing.memo = mergeMarketMemo(existing.memo, v); return; }
      if (k === "status") {
        if (!v) return;
        if (MARKET_STATUS_FINAL[existing.status] && !MARKET_STATUS_FINAL[v]) return;
        if (marketStatusRank(v) < marketStatusRank(existing.status)) return;   // 덜 진행된 상태로 되돌리지 않는다
        existing.status = v;
        return;
      }
      // 유찰 횟수는 줄어들지 않는다 — 재등록 카드가 낮은 값을 들고 와도 기존 값을 지킨다
      if (k === "failCount") {
        var fc = Number(v) || 0;
        if (fc > (Number(existing.failCount) || 0)) existing.failCount = fc;
        return;
      }
      if (k === "analysisWritten") { if (v) existing.analysisWritten = true; return; }
      // v88: 단지명 앞의 ⭐는 표시용이다 — isStar 로 옮기고 원본 단지명만 저장한다. isStar 는 켜기만 한다.
      if (k === "buildingName") {
        var nm = String(v || "");
        if (/^\s*⭐/.test(nm)) { existing.isStar = true; nm = nm.replace(/^\s*⭐\s*/, ""); }
        if (nm) existing.buildingName = nm;
        return;
      }
      if (k === "isStar") { if (v === true) existing.isStar = true; return; }
      if (k === "tankViews") { if (typeof v === "number") existing.tankViews = v; return; }
      // 0·빈 문자열로 기존 값을 지우지 않는다 (현황판은 낙찰가를 0으로 보낸다)
      if (v === 0 || v === "" || v === null || v === undefined) return;
      existing[k] = v;
    });
    existing.updatedAt = new Date().toISOString();
  }


var T="2026-10-08";
function row(o){ return Object.assign({date:T,buildingName:"테스트",address:"대구 수성구 범어동 1",region:"대구 수성구",propertyType:"아파트",appraisalValue:100000000,minSalePrice:100000000,failCount:0,status:"조사중",memo:"현황판 자동 등록 (2026-10-08)",source:"전국 경매 물건 현황판"},o); }
var okChk={ok:true,why:"비고 공란·탱크 인수 없음",checkedAt:T};
var cases=[
 ["부산 해운대구 비⭐ → verify(대구권 오판 방지)", row({caseNumber:"2026타경18",region:"부산 해운대구",address:"부산 해운대구 우동 1",saleDate:"2026-10-28",exclusiveArea:84,check:okChk,courtStatusRaw:"진행"}), "verify"],
 ["대구광역시 표기 → home add", row({caseNumber:"2026타경19",region:"대구광역시 달서구",address:"대구광역시 달서구 이곡동 1",saleDate:"2026-10-28",exclusiveArea:120,check:okChk,courtStatusRaw:"진행"}), "add"],
 ["home ⭐ 15일 110㎡ check ok → add", row({caseNumber:"2026타경1 물건1",saleDate:"2026-10-23",exclusiveArea:110,isStar:true,check:okChk,courtStatusRaw:"진행"}), "add"],
 ["home 30일 → add", row({caseNumber:"2026타경2",saleDate:"2026-11-07",check:okChk,courtStatusRaw:"진행"}), "add"],
 ["home 45일 → add", row({caseNumber:"2026타경3",saleDate:"2026-11-22",check:okChk,courtStatusRaw:"진행"}), "add"],
 ["home 46일 → wait", row({caseNumber:"2026타경4",saleDate:"2026-11-23",check:okChk,courtStatusRaw:"진행"}), "wait"],
 ["home tankOnly(check 없음) → verify", row({caseNumber:"2026타경5",saleDate:"2026-10-28"}), "verify"],
 ["home check.ok=false → verify", row({caseNumber:"2026타경6",saleDate:"2026-10-28",check:{ok:false,why:"비고 미확인",checkedAt:T},courtStatusRaw:"진행"}), "verify"],
 ["부산 ⭐ 84㎡ check ok → add", row({caseNumber:"2026타경7",region:"부산 해운대구",address:"부산 해운대구 우동 1",saleDate:"2026-10-28",exclusiveArea:84,isStar:true,check:okChk,courtStatusRaw:"진행"}), "add"],
 ["부산 ⭐ 100㎡ → large", row({caseNumber:"2026타경8",region:"부산 해운대구",address:"부산 해운대구 우동 1",saleDate:"2026-10-28",exclusiveArea:100,isStar:true,check:okChk,courtStatusRaw:"진행"}), "large"],
 ["부산 비⭐ 84㎡ → verify", row({caseNumber:"2026타경9",region:"부산 해운대구",address:"부산 해운대구 우동 1",saleDate:"2026-10-28",exclusiveArea:84,check:okChk,courtStatusRaw:"진행"}), "verify"],
 ["home 9일 → drop", row({caseNumber:"2026타경10",saleDate:"2026-10-17",check:okChk,courtStatusRaw:"진행"}), "drop"],
 ["home 10일 → add", row({caseNumber:"2026타경10b",saleDate:"2026-10-18",check:okChk,courtStatusRaw:"진행"}), "add"],
 ["home 유찰2 → reject", row({caseNumber:"2026타경11",saleDate:"2026-10-28",failCount:2,check:okChk,courtStatusRaw:"진행"}), "reject"],
 ["home 60% → reject", row({caseNumber:"2026타경12",saleDate:"2026-10-28",minSalePrice:60000000,check:okChk,courtStatusRaw:"진행"}), "reject"],
 ["home 확인 9/20 stale → verify", row({caseNumber:"2026타경13",saleDate:"2026-10-28",check:{ok:true,why:"x",checkedAt:"2026-09-20"},courtStatusRaw:"진행"}), "verify"],
 ["경산 95㎡ 초과 → add(면적 제한 없음)", row({caseNumber:"2026타경14",region:"경북 경산시",address:"경산시 중방동 1",saleDate:"2026-10-28",exclusiveArea:130,check:okChk,courtStatusRaw:"진행"}), "add"],
 ["기일 미정 → wait", row({caseNumber:"2026타경15",saleDate:"",check:okChk}), "wait"],
 ["analysisWritten 만 켜진 tankOnly → verify", row({caseNumber:"2026타경16",saleDate:"2026-10-28",analysisWritten:true}), "verify"],
 ["탱크 인수 있음 → verify", row({caseNumber:"2026타경17",saleDate:"2026-10-28",check:{ok:true,checkedAt:T,tankInherit:"있음"},courtStatusRaw:"진행"}), "verify"],
];
var fail=0;
cases.forEach(function(c){ var d=marketAutoAddDecision(c[1],T); var ok=d.code===c[2]; if(!ok) fail++; console.log((ok?"PASS":"FAIL")+"  "+c[0]+"  → "+d.code+" ("+d.reason+")"); });
// bypass: 권리분석보내기 is not auto
console.log((isBoardAutoRegistration(row({memo:"권리분석보내기 체크 (2026-10-08)"}))===false?"PASS":"FAIL")+"  권리분석보내기 → 자동 등록 판정 대상 아님(제한 없음)");
console.log((isBoardAutoRegistration({memo:"PC 수집·법원 확인",source:"PC 수집(법원경매정보 화면 확인)",check:okChk})===true?"PASS":"FAIL")+"  PC 수집 줄 → 판정 대상");
// ⭐ normalize
var m={buildingName:"⭐ 빌리브범어120"}; normalizeMarketStar(m); console.log((m.buildingName==="빌리브범어120"&&m.isStar===true&&marketDisplayName(m)==="⭐ 빌리브범어120"?"PASS":"FAIL")+"  ⭐ 분리·원본 단지명 보존·표시");
// priority sort
var list=[
 {id:"a",region:"부산",buildingName:"x",tankViews:900,tankViewsType:"누적"},
 {id:"b",region:"대구 북구",buildingName:"y",tankViews:50,tankViewsType:"누적"},
 {id:"c",region:"대구 수성구",buildingName:"z",isStar:true,tankViews:10,tankViewsType:"누적"},
 {id:"d",region:"대구 수성구",buildingName:"w",isStar:true,tankViews:300,tankViewsType:"누적"},
 {id:"e",region:"인천",buildingName:"v",isStar:true,tankViews:null},
 {id:"f",region:"대구 수성구",buildingName:"u",isStar:true},
 {id:"g",region:"대구 달서구",buildingName:"t",tankViews:5,tankViewsType:"당일"},
];
var order=list.slice().sort(compareMarketPriority).map(function(x){return x.id}).join(",");
console.log((order==="d,c,f,e,b,g,a"?"PASS":"FAIL")+"  우선순위 정렬 → "+order+" (기대 d,c,f,e,b,g,a: 대구⭐ 조회 높은순→미확인, 타지역⭐, 대구 일반(당일/누적 종류별), 타지역)");
// apply fields: 낙찰 보존, ⭐ 이름 분리, isStar 켜기만
var ex={caseNumber:"2026타경99",status:"낙찰",buildingName:"호반써밋수성",winningBid:500000000};
applyMarketChunkFields(ex,{caseNumber:"2026타경99",status:"매각종료",buildingName:"⭐ 호반써밋수성",isStar:false,winningBid:0,tankViews:0});
console.log((ex.status==="낙찰"&&ex.winningBid===500000000&&ex.buildingName==="호반써밋수성"&&ex.isStar===true&&ex.tankViews===0?"PASS":"FAIL")+"  기존 낙찰 보존 + ⭐ 분리 + 조회수 0 허용");
process.exit(fail?1:0);
