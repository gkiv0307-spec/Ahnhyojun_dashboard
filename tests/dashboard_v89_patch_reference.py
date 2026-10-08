p='app_script_clean.js'; s=open(p,encoding='utf-8').read()
def rep(old,new):
    global s
    assert s.count(old)==1, old[:70]
    s=s.replace(old,new)
rep('''  var marketFilterAnalysis = "all";''','''  var marketFilterAnalysis = "all";
  // v89 (2026-10-08 대리님 지시): 위쪽 탭으로 진행 물건 / 종료·변경(변경·취하·매각종료·매각) / 낙찰·패찰 을 나누고,
  // 진행 탭에는 매각기일까지 남은 날짜 칩(7일 안·14일 안·20일 안·21일 이후·기일 지남)을 둔다.
  var marketTab = "active";
  var marketDueFilter = "all";
  var MARKET_TAB_CLOSED = { "변경": true, "취하": true, "매각종료": true, "매각": true };
  var MARKET_TAB_MINE = { "낙찰": true, "패찰": true };
  function marketTabOf(m) { var st = (m && m.status) || ""; return MARKET_TAB_MINE[st] ? "mine" : MARKET_TAB_CLOSED[st] ? "closed" : "active"; }
  var MARKET_DUE_OPTIONS = [
    { key: "all", label: "전체" }, { key: "7", label: "7일 안" }, { key: "14", label: "14일 안" }, { key: "20", label: "20일 안" },
    { key: "21plus", label: "21일 이후" }, { key: "overdue", label: "기일 지남·미정" }
  ];
  function marketDueMatch(m, key) {
    if (key === "all") return true;
    var d = marketDaysUntil(m && m.saleDate);
    if (key === "overdue") return d === null || d < 0;
    if (d === null || d < 0) return false;
    if (key === "21plus") return d >= 21;
    return d <= Number(key);
  }''')
rep('''    var filtered = state.marketAuctions.filter(function (m) {
      if (marketStatusFilterActive && !marketFilterStatuses[m.status]) return false;''','''    var tabCounts = { active: 0, closed: 0, mine: 0 };
    state.marketAuctions.forEach(function (m) { tabCounts[marketTabOf(m)]++; });
    var tabItems = state.marketAuctions.filter(function (m) { return marketTabOf(m) === marketTab; });
    var dueCounts = {};
    MARKET_DUE_OPTIONS.forEach(function (o) { dueCounts[o.key] = tabItems.filter(function (m) { return marketDueMatch(m, o.key); }).length; });
    var filtered = tabItems.filter(function (m) {
      if (marketTab === "active" && !marketDueMatch(m, marketDueFilter)) return false;
      if (marketStatusFilterActive && !marketFilterStatuses[m.status]) return false;''')
rep('''    // ── 검색 + 접이식 필터 ──
    // 필터 줄이 네 개(검색·종류·상태·권리분석) 연달아 깔려 모바일에서 목록이 한참 아래로 밀렸다.''','''    // ── v89 탭: 진행 / 종료·변경 / 낙찰·패찰 + 진행 탭의 매각기일 칩 ──
    html += '<div class="filter-bar market-tabs">' + [
      { key: "active", label: "🔵 진행 물건" }, { key: "closed", label: "📁 종료·변경 (변경·취하·매각종료)" }, { key: "mine", label: "🏁 낙찰·패찰" }
    ].map(function (t) {
      return '<button type="button" class="filter-chip" data-market-tab="' + t.key + '" aria-pressed="' + (marketTab === t.key) + '">' + t.label + " (" + tabCounts[t.key] + ")</button>";
    }).join("") + "</div>";
    if (marketTab === "active") {
      html += '<div class="filter-bar market-due"><span class="filter-bar-label">매각기일</span>' + MARKET_DUE_OPTIONS.map(function (o) {
        return '<button type="button" class="filter-chip" data-market-due="' + o.key + '" aria-pressed="' + (marketDueFilter === o.key) + '">' + o.label + " (" + dueCounts[o.key] + ")</button>";
      }).join("") + "</div>";
    }

    // ── 검색 + 접이식 필터 ──
    // 필터 줄이 네 개(검색·종류·상태·권리분석) 연달아 깔려 모바일에서 목록이 한참 아래로 밀렸다.''')
rep('''    Array.prototype.forEach.call(document.querySelectorAll("[data-market-analysis-filter]"), function (btn) {
      btn.addEventListener("click", function () { marketFilterAnalysis = btn.getAttribute("data-market-analysis-filter"); render(); });
    });''','''    Array.prototype.forEach.call(document.querySelectorAll("[data-market-analysis-filter]"), function (btn) {
      btn.addEventListener("click", function () { marketFilterAnalysis = btn.getAttribute("data-market-analysis-filter"); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-tab]"), function (btn) {
      btn.addEventListener("click", function () { marketTab = btn.getAttribute("data-market-tab"); render(); window.scrollTo(0, 0); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-market-due]"), function (btn) {
      btn.addEventListener("click", function () { marketDueFilter = btn.getAttribute("data-market-due"); render(); });
    });''')
# 빈 목록 문구
rep('''      html += '<div class="empty-state">해당하는 경매 물건이 없습니다.</div>';''','''      html += '<div class="empty-state">' + (marketTab === "closed" ? "종료·변경된 물건이 없습니다." : marketTab === "mine" ? "낙찰·패찰로 표시한 물건이 없습니다." : "해당하는 경매 물건이 없습니다.") + "</div>";''')
open(p,'w',encoding='utf-8').write(s); print('ok')
