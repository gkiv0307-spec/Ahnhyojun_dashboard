import re
p='app_script_clean.js'; s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    assert s.count(old)==count, (s.count(old), old[:80])
    s=s.replace(old,new)

# 1. 자동 등록 기준 블록 교체 (v85 주석 ~ marketAutoAddDecision 끝)
start=s.index('  /* v85 (2026-09-22 대리님 지시): 현황판이 자동으로 골라 보내는 물건')
end=s.index('  function mergeMarketMemo(oldMemo, newMemo) {')
old_block=s[start:end]
assert 'var MARKET_AUTO_EXCLUDED_SEED' in old_block and 'function marketExclusiveArea' in old_block
# 보존할 부분: rememberMarketDeleted / isMarketKeyExcluded / marketExclusiveArea / EXCLUDED_SEED
keep_start=old_block.index('  var MARKET_AUTO_EXCLUDED_SEED')
keep_end=old_block.index('  // "add"(지금 올림)')
keep=old_block[keep_start:keep_end]
new_block = '''  /* v85 (2026-09-22) → v88 (2026-10-08 대리님 지시): 자동으로 들어오는 물건(현황판 자동 등록·PC 수집·check 블록이 있는 줄)의 등록 기준.
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
  var MARKET_HOME_REGION_RE = /대구|경산|칠곡/;
  function isMarketHomeRegion(m) { return MARKET_HOME_REGION_RE.test([m && m.region, m && m.address].join(" ")); }
  // ⭐ 대장 단지: isStar 필드. 예전 청크는 단지명 앞에 "⭐ " 를 붙여 보냈으므로 그것도 ⭐로 보되, 저장할 때는 떼어 원본 단지명을 지킨다.
  function isMarketStar(m) { return !!(m && (m.isStar === true || /^\\s*⭐/.test(String(m.buildingName || "")))); }
  function marketRawName(m) { return String((m && m.buildingName) || "").replace(/^\\s*⭐\\s*/, ""); }
  function marketDisplayName(m) { var n = marketRawName(m); return n ? (isMarketStar(m) ? "⭐ " + n : n) : ""; }
  function normalizeMarketStar(m) {
    if (!m) return false;
    var n = String(m.buildingName || "");
    if (!/^\\s*⭐/.test(n)) return false;
    m.buildingName = n.replace(/^\\s*⭐\\s*/, "");
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
''' + keep + '''  function marketDaysUntil(sd, today) {
    sd = String(sd || "").slice(0, 10);
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(sd)) return null;
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
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(ca)) return { code: "verify", reason: "법원 확인일 없음" };
    var age = -marketDaysUntil(ca, today);
    if (age > MARKET_AUTO_CHECK_MAX_AGE_DAYS) return { code: "verify", reason: "확인 자료가 " + age + "일 전 것(7일 초과) — 최신 자료로 재확인 필요" };
    if (!m.courtCheckedAt && !m.courtStatusRaw && !m.courtResult) return { code: "verify", reason: "법원 원문 확인 기록 없음(courtStatusRaw·courtResult)" };
    var inh = chk.tankInherit !== undefined ? chk.tankInherit : m.tankInherit;
    if (inh !== undefined && inh !== null && inh !== false && inh !== "없음") return { code: "verify", reason: "탱크 인수 여부: " + String(inh) };
    return { code: "add", reason: "기준 충족" + (chk.why ? " · " + chk.why : "") };
  }

'''
s=s[:start]+new_block+s[end:]

# 2. applyMarketChunkFields: ⭐ 이름 분리, isStar 켜기만, tankViews 0 허용
rep('''      if (k === "analysisWritten") { if (v) existing.analysisWritten = true; return; }
      // 0·빈 문자열로 기존 값을 지우지 않는다 (현황판은 낙찰가를 0으로 보낸다)''',
'''      if (k === "analysisWritten") { if (v) existing.analysisWritten = true; return; }
      // v88: 단지명 앞의 ⭐는 표시용이다 — isStar 로 옮기고 원본 단지명만 저장한다. isStar 는 켜기만 한다.
      if (k === "buildingName") {
        var nm = String(v || "");
        if (/^\\s*⭐/.test(nm)) { existing.isStar = true; nm = nm.replace(/^\\s*⭐\\s*/, ""); }
        if (nm) existing.buildingName = nm;
        return;
      }
      if (k === "isStar") { if (v === true) existing.isStar = true; return; }
      if (k === "tankViews") { if (typeof v === "number") existing.tankViews = v; return; }
      // 0·빈 문자열로 기존 값을 지우지 않는다 (현황판은 낙찰가를 0으로 보낸다)''')

# 3. mergeMarketChunksIfNeeded 판정 부분 교체
ms=s.index('    }).then(function (items) {\n      if (!items) return;\n      // 지난번에 짝(카드)을 못 찾아 미뤄 둔 결과 줄을 앞에 붙인다.')
me=s.index('    }).catch(syncChunkFailure("경매 물건")).then(finish);')
new_merge='''    }).then(function (items) {
      normalizeMarketStarsIfNeeded();
      var waitingBefore = state.meta.pendingMarketAdds || [];
      // v88: 새 파일이 없어도 대기 물건은 날짜가 바뀌었으니 다시 판정한다(45일 안으로 들어왔는지·확인 자료가 붙었는지).
      if (!items) { if (!waitingBefore.length) return; items = []; }
      // 지난번에 짝(카드)을 못 찾아 미뤄 둔 결과 줄을 앞에 붙인다. 카드보다 결과가 먼저 도착하면
      // 결과가 버려지는 일이 있었다(2025타경9339 — 유찰 결과가 카드 생성 청크와 같은 배치에 오면 빈 껍데기 방지에 걸려 사라짐).
      items = (state.meta.pendingMarketPatches || []).concat(items);
      // 기다리던 자동 등록 물건(기간 대기·검증대기)도 다시 판정한다.
      items = waitingBefore.concat(items);
      // 카드를 만드는 줄(date·단지명·주소가 있는 것)을 먼저 적용하고, 결과만 담긴 줄은 그 뒤에 적용한다.
      // Drive 검색 순서는 날짜순이 아니라서 같은 배치 안에서도 순서를 믿을 수 없다.
      var isFull = function (m) { return !!(m.date || m.buildingName || m.address); };
      var ordered = items.filter(isFull).concat(items.filter(function (m) { return !isFull(m); }));
      var added = 0, updated = 0, deferred = [], waiting = [], waitingNew = 0, verifyNew = 0, dropped = 0, large = 0, excluded = 0, rejected = 0;
      var today = todayStr();
      ordered.forEach(function (m) {
        if (isFull(m)) normalizeMarketStar(m);
        var key = m.caseNumber && marketCaseKey(m.caseNumber);
        var existing = key && state.marketAuctions.find(function (x) { return marketCaseKey(x.caseNumber) === key; });
        if (existing) {
          applyMarketChunkFields(existing, m);   // 기존 카드 갱신은 기준과 상관없이 이어 간다(지우지 않는다)
          updated++;
          return;
        }
        if (!isFull(m)) {
          var w0 = key && waiting.find(function (x) { return marketCaseKey(x.caseNumber) === key; });
          if (w0) { applyMarketChunkFields(w0, m); return; }   // 기다리는 물건의 결과·확인 자료는 대기 항목에 얹어 둔다
          if (key) {
            // 결과만 있는데 카드가 아직 없다 — 버리지 말고 다음 병합 때 다시 맞춰 본다. 30일 넘으면 놓아준다.
            var age = Date.now() - new Date(m.updatedAt || Date.now()).getTime();
            if (age < 30 * 86400000) deferred.push(m);
          }
          return;
        }
        if (isBoardAutoRegistration(m)) {
          if (isMarketKeyExcluded(key)) { excluded++; return; }   // 대리님이 지운 물건 — 다시 보내도 올리지 않는다
          var dec = marketAutoAddDecision(m, today);
          if (dec.code === "drop") { dropped++; return; }
          if (dec.code === "large") { large++; return; }
          if (dec.code === "reject") { rejected++; return; }
          if (dec.code !== "add") {
            var w = key && waiting.find(function (x) { return marketCaseKey(x.caseNumber) === key; });
            if (w) { applyMarketChunkFields(w, m); }
            else {
              if (!m.waitingSince) { m.waitingSince = today; if (dec.code === "verify") verifyNew++; else waitingNew++; }
              waiting.push(m); w = m;
            }
            w.waitKind = dec.code === "verify" ? "검증" : "기간";
            w.waitReason = dec.reason;
            w.waitDecidedAt = today;
            return;
          }
          m.autoAddedAt = today;
          m.autoAddNote = dec.reason;
        }
        if (!m.id) m.id = uid();
        delete m.waitingSince; delete m.waitKind; delete m.waitReason; delete m.waitDecidedAt;
        if (key && state.meta.marketDeletedKeys) delete state.meta.marketDeletedKeys[key];   // 권리분석보내기·수동 등록은 대리님 뜻이니 차단을 푼다
        state.marketAuctions.push(m);
        added++;
      });
      state.meta.pendingMarketPatches = deferred;
      // 대기 목록: 기다린 지 90일이 넘은 것은 놓아준다(기일이 계속 미정이거나 확인 자료가 영영 안 오는 물건).
      state.meta.pendingMarketAdds = waiting.filter(function (m) {
        var since = parseYMD(m.waitingSince || today);
        return (Date.now() - since.getTime()) < 90 * 86400000;
      });
      state.meta.processedMarketChunkIds = processed;
      persistLocal();
      if (added || updated || waitingNew || verifyNew || dropped || large || excluded || rejected) {
        var parts = [];
        if (added) parts.push(added + "건 추가");
        if (updated) parts.push(updated + "건 갱신");
        if (waitingNew) parts.push(waitingNew + "건은 매각기일 45일 밖·미정이라 기간 대기");
        if (verifyNew) parts.push(verifyNew + "건은 법원 확인·대장 근거가 없어 검증대기");
        if (dropped) parts.push(dropped + "건은 기일이 지났거나 10일 미만이라 제외");
        if (large) parts.push(large + "건은 대구권 밖 대형평형(전용 " + MARKET_AUTO_MAX_AREA + "㎡ 초과)이라 제외");
        if (rejected) parts.push(rejected + "건은 유찰 2회 이상·최저가 70% 미만이라 제외");
        if (excluded) parts.push(excluded + "건은 지운 물건이라 제외");
        notifySync("☁ 경매 물건 " + parts.join(" · ") + (added || updated ? "되었습니다." : "."));
        render();
        if (added || updated) driveSaveSnapshot(null, true);
      }
'''
s=s[:ms]+new_merge+s[me:]

# 4. 정렬
rep('''  var marketSortKey = "saleDate_asc";''','''  var marketSortKey = "priority";   // v88: 대구권 ⭐ → 그 밖 ⭐ → 대구권 일반 → 그 밖 일반, 같은 급은 탱크 조회수 순''')
rep('''  var MARKET_SORT_OPTIONS = [
    { key: "saleDate_asc", label: "매각기일 임박순" },''','''  var MARKET_SORT_OPTIONS = [
    { key: "priority", label: "우선순위(대장·조회수)" },
    { key: "saleDate_asc", label: "매각기일 임박순" },''')
rep('''    var sorted = list.slice();
    switch (sortKey) {
      case "saleDate_asc":''','''    var sorted = list.slice();
    switch (sortKey) {
      case "priority":
        sorted.sort(compareMarketPriority);
        break;
      case "saleDate_asc":''')

# 5. 카드·대기 표시
rep('''    // v85: 현황판 자동 등록은 매각기일 2주 안 물건만 올린다. 기다리는 물건이 있으면 몇 건인지만 보여 준다.
    var waitingAdds = (state.meta.pendingMarketAdds || []);
    if (waitingAdds.length) {
      var soon = waitingAdds.slice().sort(function (a, b) { return String(a.saleDate || "9999").localeCompare(String(b.saleDate || "9999")); }).slice(0, 3)
        .map(function (m) { return esc((m.buildingName || m.caseNumber || "") + (m.saleDate ? " " + String(m.saleDate).slice(5).replace("-", "/") : " 기일미정")); }).join(", ");
      html += '<div class="backup-note">⏳ 현황판 자동 등록 대기 ' + waitingAdds.length + '건 — 매각기일이 2주 안으로 들어오면 자동으로 올라옵니다. (' + soon + (waitingAdds.length > 3 ? " 외" : "") + ')</div>';
    }''','''    // v88: 자동 등록은 매각기일 45일 안 + 법원 확인(check.ok) 물건만 올린다. 기다리는 물건은 기간 대기·검증대기로 나눠 보여 준다.
    var waitingAdds = (state.meta.pendingMarketAdds || []);
    if (waitingAdds.length) {
      var verifyN = waitingAdds.filter(function (m) { return m.waitKind === "검증"; }).length;
      var soon = waitingAdds.slice().sort(compareMarketPriority).slice(0, 3)
        .map(function (m) { return esc((marketDisplayName(m) || m.caseNumber || "") + (m.saleDate ? " " + String(m.saleDate).slice(5).replace("-", "/") : " 기일미정") + (m.waitReason ? " — " + m.waitReason : "")); }).join(" / ");
      html += '<div class="backup-note">⏳ 자동 등록 대기 ' + waitingAdds.length + '건 (기간 대기 ' + (waitingAdds.length - verifyN) + ' · 검증대기 ' + verifyN + ') — 매각기일 45일 안이고 법원 확인(check.ok)이 붙으면 자동으로 올라옵니다. ' + soon + (waitingAdds.length > 3 ? " 외" : "") + '</div>';
    }''')
rep('''        var titleMain = m.buildingName || m.caseNumber || "(아파트명 미입력)";
        var showCaseSub = m.buildingName && m.caseNumber;''','''        var titleMain = marketDisplayName(m) || m.caseNumber || "(아파트명 미입력)";
        var showCaseSub = m.buildingName && m.caseNumber;''')
rep('''          (m.failCount > 0 ? pill(m.failCount + "회 유찰", m.failCount >= 3 ? "danger" : "warn") : pill("신건", "neutral")) +
"</div>";''','''          (m.failCount > 0 ? pill(m.failCount + "회 유찰", m.failCount >= 3 ? "danger" : "warn") : pill("신건", "neutral")) +
          (typeof m.tankViews === "number" ? pill("조회 " + m.tankViews.toLocaleString("ko-KR") + (m.tankViewsType ? " " + m.tankViewsType : "") + (m.tankViewsAt ? " " + formatShortDate(m.tankViewsAt) : ""), "neutral") : "") +
          (m.check && typeof m.check === "object" ? pill("검증 " + (m.check.ok === true ? "충족" : "미충족") + (m.check.checkedAt ? " " + formatShortDate(m.check.checkedAt) : ""), m.check.ok === true ? "good" : "warn") : "") +
"</div>";''')
rep('''          (marketExclusiveArea(m) ? " " + pill("전용 " + marketExclusiveArea(m) + "㎡", marketExclusiveArea(m) > MARKET_AUTO_MAX_AREA ? "warn" : "neutral") : "") + "</div>";''',
'''          (marketExclusiveArea(m) ? " " + pill("전용 " + marketExclusiveArea(m) + "㎡", marketExclusiveArea(m) > MARKET_AUTO_MAX_AREA && !isMarketHomeRegion(m) ? "warn" : "neutral") : "") + "</div>";''')
rep('''    html += "<h2>" + esc(m.buildingName || m.caseNumber || "(아파트명 미입력)") + "</h2>";
    html += '<div class="card-detail-fields">';
    html += field("조사일", '<input type="date" class="inline-select" data-inline-date="date" data-id="' + m.id + '" data-entity="market"''',
'''    html += "<h2>" + esc(marketDisplayName(m) || m.caseNumber || "(아파트명 미입력)") + "</h2>";
    html += '<div class="card-detail-fields">';
    html += field("조사일", '<input type="date" class="inline-select" data-inline-date="date" data-id="' + m.id + '" data-entity="market"''')
rep('''    html += field("메모", '<textarea class="inline-select" data-inline-text="memo" data-id="' + m.id + '" data-entity="market" placeholder="권리분석 메모 등" style="min-height:80px">' + esc(m.memo || "") + "</textarea>", "grow");
    html += "</div>";''','''    html += field("메모", '<textarea class="inline-select" data-inline-text="memo" data-id="' + m.id + '" data-entity="market" placeholder="권리분석 메모 등" style="min-height:80px">' + esc(m.memo || "") + "</textarea>", "grow");
    // v88: 자동 등록·검증 정보는 읽기 전용으로 보여 준다(출처·⭐ 근거·check·법원 화면 원문·탱크 조회수).
    var infoLines = [];
    if (m.source) infoLines.push("출처: " + m.source);
    if (isMarketStar(m)) infoLines.push("⭐ 대장 단지" + (m.starBasis ? " — " + m.starBasis : " (근거 미기재)"));
    if (m.check && typeof m.check === "object") infoLines.push("등록 검증: " + (m.check.ok === true ? "기준 충족" : "미충족") + (m.check.checkedAt ? " · 확인 " + m.check.checkedAt : "") + (m.check.why ? " · " + m.check.why : ""));
    if (m.courtStatusRaw) infoLines.push("법원 화면: " + m.courtStatusRaw + (m.courtCheckedAt ? " (" + m.courtCheckedAt + ")" : ""));
    if (typeof m.tankViews === "number") infoLines.push("탱크 조회수: " + m.tankViews.toLocaleString("ko-KR") + (m.tankViewsType ? " (" + m.tankViewsType + ")" : "") + (m.tankViewsAt ? " · 확인 " + m.tankViewsAt : ""));
    if (m.autoAddedAt) infoLines.push("자동 등록: " + m.autoAddedAt + (m.autoAddNote ? " · " + m.autoAddNote : ""));
    if (infoLines.length) html += field("자동 등록 정보", '<div class="meta" style="white-space:pre-wrap;line-height:1.5">' + esc(infoLines.join("\\n")) + "</div>", "grow");
    html += "</div>";''')
open(p,'w',encoding='utf-8').write(s)
print('patched', len(s))
