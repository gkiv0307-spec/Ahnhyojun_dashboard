  // ───────────────────────────────────────────────────────────────────────
  // v107 (2026-11-10 대리님 지시): 자금일보 복사용 게시판.
  // 본사 "○부동산 자금일보 보고양식" 날짜 탭(B~G열: 계좌·거래처·입금금액·출금금액·사유·구분)에
  // 그날 우리은행 거래를 그대로 붙여 넣을 수 있게, 같은 열 순서로 탭 구분 텍스트를 만들어 준다.
  // 사유·구분은 대시보드 분류(category·expenseCategory)에서 기본값을 채우고, 대리님이 고치면
  // 거래에 fundReason·fundKind 로 남기고 적요별로 학습(state.meta.fundKeywordMap)해 다음에 같은 적요가
  // 오면 그 값을 먼저 쓴다. 비어 있는 칸은 양식의 노란 칸처럼 표시해 복사 전에 채우게 한다.
  var FUND_KINDS = ["카드매출", "현금매출", "플랫폼매출-야놀자", "플랫폼매출-여기어때", "플랫폼매출-네이버", "플랫폼매출-에어비앤비", "플랫폼매출-부킹닷컴", "플랫폼매출-아고다", "플랫폼매출-꿀스테이", "플랫폼매출-페이오니어", "플랫폼매출-익스피디아", "전도금/투자금", "잡이익", "매출차감", "인건비", "운영비", "유지보수비", "소모품비", "광고비", "기타잡비", "공과금 및 세금", "대출이자", "공사비"];
  var FUND_ACCOUNT_DEFAULT = "우리(부동산에듀)";
  var FUND_DEPOSIT_DEFAULTS = {
    tuition: { reason: "수강료 입금", kind: "현금매출" },
    consulting: { reason: "대리입찰 컨설팅비", kind: "현금매출" },
    capital: { reason: "출자금·전도금", kind: "전도금/투자금" },
    general: { reason: "환급·기타 입금", kind: "잡이익" },
    reimburse: { reason: "임장·회식비 수강생 정산", kind: "잡이익" }
  };
  var FUND_EXPENSE_DEFAULTS = {
    ceo_personal: { reason: "대표 개인경비", kind: "기타잡비" },
    edu_supplies: { reason: "소모품 구입", kind: "소모품비" },
    edu_utility: { reason: "세금·공과금 납부", kind: "공과금 및 세금" },
    edu_platform: { reason: "플랫폼·카드단말기 수수료", kind: "운영비" },
    edu_student_accompany: { reason: "수강생 동행 교통비", kind: "운영비" },
    edu_advertising: { reason: "광고비", kind: "광고비" },
    edu_tax_accountant: { reason: "세무사·법무사 기장료", kind: "운영비" },
    edu_telecom: { reason: "통신비", kind: "운영비" },
    edu_rental: { reason: "임차료(월세·렌탈)", kind: "운영비" },
    edu_maintenance: { reason: "건물 관리비", kind: "운영비" },
    edu_facility: { reason: "인테리어 공사대금", kind: "공사비" },
    edu_printing: { reason: "교재 인쇄·제본", kind: "소모품비" },
    edu_utilities_bill: { reason: "전기·가스·수도요금", kind: "공과금 및 세금" },
    edu_salary: { reason: "직원 급여", kind: "인건비" },
    edu_bank_fee: { reason: "은행 수수료", kind: "기타잡비" },
    edu_welfare: { reason: "직원 식대·복리후생", kind: "기타잡비" },
    edu_entertainment: { reason: "접대비", kind: "기타잡비" },
    edu_bid_outsourcing: { reason: "대리입찰 대행 수수료", kind: "운영비" },
    edu_vehicle: { reason: "차량 유류비", kind: "운영비" },
    edu_tuition_refund: { reason: "수강료 환불", kind: "매출차감" },
    edu_advance: { reason: "임장·회식 대납(수강생 정산 예정)", kind: "기타잡비" }
  };
  var fundDailyDate = null;
  function fundKeywordKey(desc) {
    var s = String(desc || "").trim();
    if (!s) return "";
    // 카드사 정산은 뒤 숫자(가맹점 번호)가 매번 달라 앞 글자만 키로 쓴다.
    if (CARD_SETTLEMENT_PATTERN.test(s)) return s.replace(/\d+$/, "").toLowerCase();
    return s.replace(/\d{2,}$/, "").replace(/\s+/g, " ").toLowerCase();
  }
  function fundDefaultsFor(t) {
    var map = (state.meta && state.meta.fundKeywordMap) || {};
    var learned = map[fundKeywordKey(t.description)];
    var base = { reason: "", kind: "" };
    if (t.deposit > 0) {
      var isCard = t.cardPayment || CARD_SETTLEMENT_PATTERN.test(String(t.description || "").trim());
      var d = FUND_DEPOSIT_DEFAULTS[t.category];
      if (d) base = { reason: d.reason, kind: d.kind };
      if (isCard) base = { reason: t.category === "tuition" || !t.category ? "수강료 카드결제 정산" : base.reason, kind: "카드매출" };
    } else if (t.withdrawal > 0) {
      var e = FUND_EXPENSE_DEFAULTS[t.expenseCategory];
      if (e) base = { reason: e.reason, kind: e.kind };
    }
    if (learned) {
      if (learned.reason) base.reason = learned.reason;
      if (learned.kind) base.kind = learned.kind;
    }
    return base;
  }
  function fundRowValues(t) {
    var d = fundDefaultsFor(t);
    return {
      account: (state.meta && state.meta.fundAccountName) || FUND_ACCOUNT_DEFAULT,
      party: String(t.description || "").trim(),
      deposit: Number(t.deposit) || 0,
      withdrawal: Number(t.withdrawal) || 0,
      reason: t.fundReason != null && t.fundReason !== "" ? t.fundReason : d.reason,
      kind: t.fundKind != null && t.fundKind !== "" ? t.fundKind : d.kind,
      auto: !(t.fundReason || t.fundKind)
    };
  }
  function fundTxForDate(dateStr) {
    // 같은 날 거래는 등록 순서(= 은행 조회 순서의 역순인 경우가 많음)대로 두되, 잔액으로 시간 순을 복원한다:
    // 잔액은 거래 뒤 값이므로 직전 잔액 = 잔액 − 입금 + 출금 이 앞 거래의 잔액과 이어진다.
    var rows = state.transactions.filter(function (t) { return t.date === dateStr; });
    if (rows.length <= 1) return rows;
    var byBal = {};
    rows.forEach(function (t) { byBal[Number(t.balance)] = t; });
    var used = {}, chain = [];
    // 시작점: 직전 잔액이 같은 날 다른 거래의 잔액과 이어지지 않는 거래
    var starts = rows.filter(function (t) { var prev = Number(t.balance) - (Number(t.deposit) || 0) + (Number(t.withdrawal) || 0); return !byBal[prev] || byBal[prev] === t; });
    var cur = starts.length === 1 ? starts[0] : null;
    while (cur && !used[cur.id]) {
      used[cur.id] = true; chain.push(cur);
      var next = rows.filter(function (t) { return !used[t.id] && Number(t.balance) - (Number(t.deposit) || 0) + (Number(t.withdrawal) || 0) === Number(cur.balance); });
      cur = next.length === 1 ? next[0] : null;
    }
    if (chain.length === rows.length) return chain;
    return rows.slice();
  }
  function fundTsv(dateStr, onlyReasonKind) {
    return fundTxForDate(dateStr).map(function (t) {
      var v = fundRowValues(t);
      if (onlyReasonKind) return v.reason + "\t" + v.kind;
      return [v.account, v.party, String(v.deposit), String(v.withdrawal), v.reason, v.kind].join("\t");
    }).join("\n");
  }
  function fundShiftDate(dateStr, days) {
    var d = parseYMD(dateStr); d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function fundLearn(t, reason, kind) {
    if (!state.meta.fundKeywordMap) state.meta.fundKeywordMap = {};
    var key = fundKeywordKey(t.description);
    if (!key) return;
    var cur = state.meta.fundKeywordMap[key] || {};
    if (reason != null) cur.reason = reason;
    if (kind != null) cur.kind = kind;
    cur.at = new Date().toISOString();
    state.meta.fundKeywordMap[key] = cur;
  }
  function renderFundDaily() {
    var main = document.getElementById("main");
    if (!fundDailyDate) fundDailyDate = fundShiftDate(todayStr(), -1);
    var dateStr = fundDailyDate;
    var rows = fundTxForDate(dateStr);
    var reported = (state.meta && state.meta.fundReported) || {};
    var sumIn = 0, sumOut = 0, blanks = 0;
    rows.forEach(function (t) { sumIn += Number(t.deposit) || 0; sumOut += Number(t.withdrawal) || 0; var v = fundRowValues(t); if (!v.reason || !v.kind) blanks++; });
    var html = "";
    html += '<style>' +
      '.fund-wrap .fund-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0 14px}' +
      '.fund-wrap .fund-ctl input[type=date]{padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--ink);font-size:14px}' +
      '.fund-wrap .fund-days{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}' +
      '.fund-wrap .fund-day{border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-size:12px;background:transparent;color:var(--ink-soft);cursor:pointer}' +
      '.fund-wrap .fund-day.on{border-color:var(--brand);color:var(--brand);font-weight:700}' +
      '.fund-wrap .fund-day .ok{color:#27AE60;margin-left:3px}' +
      '.fund-wrap .fund-table input,.fund-wrap .fund-table select{width:100%;min-width:120px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--ink);font-size:13px}' +
      '.fund-wrap .fund-table td.blank{background:rgba(242,201,76,.22)}' +
      '.fund-wrap .fund-table td.auto input,.fund-wrap .fund-table td.auto select{border-style:dashed}' +
      '.fund-wrap .fund-tsv{width:100%;min-height:120px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre;overflow:auto;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--ink);margin-top:8px}' +
      '.fund-wrap .fund-sum{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--ink-soft);margin:8px 0}' +
      '.fund-wrap .fund-sum b{color:var(--ink)}' +
      '</style>';
    html += '<div class="fund-wrap">';
    html += '<div class="page-head"><div><h1>자금일보 복사용 게시판</h1><div class="sub">본사 자금일보 양식의 날짜 탭에 붙여 넣는 순서(계좌 · 거래처 · 입금금액 · 출금금액 · 사유 · 구분)대로 그날 우리은행 거래를 만들어 둡니다. 전체 복사 → 그날 탭 B5 셀에 붙여넣기. 노란 칸은 사유·구분이 비어 있는 것이니 복사 전에 채워 주세요.</div></div></div>';
    html += '<div class="card" style="margin-bottom:16px">';
    html += '<div class="fund-ctl">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-fund-shift="-1">◀ 전날</button>' +
      '<input type="date" id="fundDate" value="' + esc(dateStr) + '">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-fund-shift="1">다음날 ▶</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-fund-today="1">어제(전일 보고)</button>' +
      '<span style="font-size:13px;color:var(--ink-soft)">' + esc(formatShortDate(dateStr)) + ' 거래 <b style="color:var(--ink)">' + rows.length + '건</b>' + (blanks ? ' · <span style="color:var(--warn)">빈칸 ' + blanks + '건</span>' : '') + (reported[dateStr] ? ' · <span style="color:#27AE60">보고 완료 ' + esc(new Date(reported[dateStr]).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) + '</span>' : '') + '</span>' +
      '</div>';
    // 최근 10일 칩: 거래 건수와 보고 완료 표시
    html += '<div class="fund-days">';
    for (var i = 0; i < 10; i++) {
      var dd = fundShiftDate(todayStr(), -i);
      var n = state.transactions.filter(function (t) { return t.date === dd; }).length;
      html += '<button type="button" class="fund-day' + (dd === dateStr ? " on" : "") + '" data-fund-date="' + dd + '">' + esc(formatShortDate(dd)) + ' ' + n + '건' + (reported[dd] ? '<span class="ok">✓</span>' : '') + '</button>';
    }
    html += '</div>';
    if (!rows.length) {
      html += '<div class="empty-state">' + esc(formatShortDate(dateStr)) + ' 에 등록된 거래가 없습니다. 은행 거래내역을 먼저 올리거나 날짜를 바꿔 주세요.</div>';
    } else {
      html += '<div class="table-wrap"><table class="data-table fund-table"><thead><tr><th>계좌</th><th>거래처</th><th class="num">입금금액</th><th class="num">출금금액</th><th>사유</th><th>구분</th></tr></thead><tbody>';
      rows.forEach(function (t) {
        var v = fundRowValues(t);
        var opts = '<option value="">(구분 선택)</option>' + FUND_KINDS.map(function (k) { return '<option value="' + esc(k) + '"' + (k === v.kind ? " selected" : "") + '>' + esc(k) + '</option>'; }).join("");
        if (v.kind && FUND_KINDS.indexOf(v.kind) === -1) opts = '<option value="' + esc(v.kind) + '" selected>' + esc(v.kind) + '</option>' + opts;
        html += '<tr data-fund-row="' + esc(t.id) + '">' +
          '<td>' + esc(v.account) + '</td>' +
          '<td>' + esc(v.party) + '</td>' +
          '<td class="num">' + (v.deposit ? v.deposit.toLocaleString("ko-KR") : "0") + '</td>' +
          '<td class="num">' + (v.withdrawal ? v.withdrawal.toLocaleString("ko-KR") : "0") + '</td>' +
          '<td class="' + (v.reason ? (v.auto ? "auto" : "") : "blank") + '"><input type="text" data-fund-reason="' + esc(t.id) + '" value="' + esc(v.reason) + '" placeholder="사유 입력"></td>' +
          '<td class="' + (v.kind ? (v.auto ? "auto" : "") : "blank") + '"><select data-fund-kind="' + esc(t.id) + '">' + opts + '</select></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<div class="fund-sum"><span>입금 합계 <b>' + sumIn.toLocaleString("ko-KR") + '</b></span><span>출금 합계 <b>' + sumOut.toLocaleString("ko-KR") + '</b></span><span>점선 칸 = 자동 채움(고치면 같은 적요에 학습) · 노란 칸 = 비어 있음</span></div>';
      html += '<div class="fund-ctl">' +
        '<button type="button" class="btn btn-primary" id="fundCopyAll">📋 전체 복사 (계좌~구분)</button>' +
        '<button type="button" class="btn btn-ghost" id="fundCopyRK">📋 사유·구분만 복사</button>' +
        '<button type="button" class="btn btn-ghost" id="fundMarkReported">' + (reported[dateStr] ? "✓ 보고 완료 취소" : "✅ 이 날짜 보고 완료 표시") + '</button>' +
        '</div>';
      html += '<textarea class="fund-tsv" id="fundTsv" readonly spellcheck="false">' + esc(fundTsv(dateStr)) + '</textarea>';
      html += '<div class="hint" style="margin-top:6px">붙여넣기가 안 되면 위 상자를 눌러 전체 선택(Ctrl+A) → 복사(Ctrl+C) 하세요. 금액은 숫자만 들어가므로 시트의 천 단위 표시는 셀 서식이 처리합니다.</div>';
    }
    html += '</div></div>';
    main.innerHTML = html;

    function rerender() { renderFundDaily(); }
    var dateInp = document.getElementById("fundDate");
    if (dateInp) dateInp.addEventListener("change", function () { if (dateInp.value) { fundDailyDate = normalizeDateStr(dateInp.value) || dateInp.value; rerender(); } });
    Array.prototype.forEach.call(main.querySelectorAll("[data-fund-shift]"), function (b) {
      b.addEventListener("click", function () { fundDailyDate = fundShiftDate(fundDailyDate, parseInt(b.getAttribute("data-fund-shift"), 10)); rerender(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-fund-today]"), function (b) {
      b.addEventListener("click", function () { fundDailyDate = fundShiftDate(todayStr(), -1); rerender(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-fund-date]"), function (b) {
      b.addEventListener("click", function () { fundDailyDate = b.getAttribute("data-fund-date"); rerender(); });
    });
    function txById(id) { return state.transactions.filter(function (t) { return t.id === id; })[0]; }
    function refreshTsv() { var ta = document.getElementById("fundTsv"); if (ta) ta.value = fundTsv(dateStr); }
    Array.prototype.forEach.call(main.querySelectorAll("[data-fund-reason]"), function (inp) {
      inp.addEventListener("change", function () {
        var t = txById(inp.getAttribute("data-fund-reason")); if (!t) return;
        t.fundReason = inp.value.trim();
        fundLearn(t, t.fundReason, null);
        persistLocal(); rerender();
      });
      inp.addEventListener("input", function () { var t = txById(inp.getAttribute("data-fund-reason")); if (t) { t.fundReason = inp.value; refreshTsv(); } });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-fund-kind]"), function (sel) {
      sel.addEventListener("change", function () {
        var t = txById(sel.getAttribute("data-fund-kind")); if (!t) return;
        t.fundKind = sel.value;
        fundLearn(t, null, t.fundKind);
        persistLocal(); rerender();
      });
    });
    var copyAll = document.getElementById("fundCopyAll");
    if (copyAll) copyAll.addEventListener("click", function () { copyToClipboard(fundTsv(dateStr), formatShortDate(dateStr) + " 거래 " + rows.length + "건 복사됨 — 양식 탭 B5 셀에 붙여넣기"); });
    var copyRK = document.getElementById("fundCopyRK");
    if (copyRK) copyRK.addEventListener("click", function () { copyToClipboard(fundTsv(dateStr, true), "사유·구분 " + rows.length + "줄 복사됨 — F열에 붙여넣기"); });
    var mark = document.getElementById("fundMarkReported");
    if (mark) mark.addEventListener("click", function () {
      if (!state.meta.fundReported) state.meta.fundReported = {};
      if (state.meta.fundReported[dateStr]) delete state.meta.fundReported[dateStr]; else state.meta.fundReported[dateStr] = new Date().toISOString();
      persistLocal(); rerender();
    });
  }
