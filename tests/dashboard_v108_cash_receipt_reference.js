  // ───────────────────────────────────────────────────────────────────────
  // v108 (2026-11-10 대리님 지시): 현금영수증 게시판.
  // 수강생이 현금·계좌이체로 낸 수강료·컨설팅비(카드사 정산 제외)를 한 화면에 모아 현금영수증 발급 상태를
  // 관리한다. 은행 화면의 "현금영수증 발행" 체크(cashReceiptIssued)와 같은 값을 쓰되, 여기서는 상태를
  // 미발행·발급완료·불필요(미요청)·거부 네 가지(cashReceiptStatus)로 두고 발급일(cashReceiptDate)·
  // 식별번호(cashReceiptNo, 수강생 DB 의 cashReceipt 에서 미리 채움)·구분(cashReceiptType 소득공제/지출증빙)·
  // 비고(cashReceiptMemo)를 거래에 저장한다. 본사 양식 「현금영수증」 탭(입금일·계좌·지점·입금자명·총거래금액·
  // 공급가액·부가세·사유·발급상태·발급일·비고) 순서로 복사할 수 있다. 학원 수강료는 교육용역 면세가 기본이라
  // 공급가액=총액·부가세 0 으로 두고, 과세(10/11 분리)가 필요하면 토글(state.meta.cashReceiptVat="과세").
  var CASH_RECEIPT_STATUS = [["pending", "미발행"], ["issued", "발급완료"], ["notNeeded", "불필요(미요청)"], ["declined", "거부"]];
  var CASH_RECEIPT_STATUS_LABEL = { pending: "미발행", issued: "발급완료", notNeeded: "불필요(미요청)", declined: "거부" };
  var CASH_RECEIPT_STATUS_PILL = { pending: "warn", issued: "good", notNeeded: "neutral", declined: "danger" };
  var cashReceiptFilter = "pending", cashReceiptMonth = "all", cashReceiptQuery = "";
  function cashReceiptStatusOf(t) {
    if (t.cashReceiptStatus) return t.cashReceiptStatus;
    return t.cashReceiptIssued ? "issued" : "pending";
  }
  function isCashReceiptTarget(t) {
    if (!(Number(t.deposit) > 0)) return false;
    if (t.category !== "tuition" && t.category !== "consulting") return false;
    if (t.cardPayment) return false;
    if (CARD_SETTLEMENT_PATTERN.test(String(t.description || "").trim())) return false;
    return true;
  }
  function cashReceiptStudentOf(t) {
    if (!t.studentId) return null;
    return state.students.filter(function (s) { return s.id === t.studentId; })[0] || null;
  }
  function cashReceiptDbOf(t, st) {
    var dbId = st && st.studentDbId;
    var hit = null;
    if (dbId) hit = state.studentDb.filter(function (d) { return d.id === dbId; })[0] || null;
    if (!hit && st) hit = state.studentDb.filter(function (d) { return d.linkedStudentId === st.id; })[0] || null;
    return hit;
  }
  function cashReceiptNoOf(t, st) {
    if (t.cashReceiptNo) return t.cashReceiptNo;
    var db = cashReceiptDbOf(t, st);
    var v = db && db.cashReceipt;
    if (v && v !== "O" && /\d{3}/.test(String(v))) return String(v);
    return "";
  }
  function cashReceiptVatSplit(amount) {
    var taxed = state.meta && state.meta.cashReceiptVat === "과세";
    if (!taxed) return { supply: amount, vat: 0 };
    var supply = Math.round(amount / 1.1);
    return { supply: supply, vat: amount - supply };
  }
  function cashReceiptRows() {
    return state.transactions.filter(isCashReceiptTarget).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function cashReceiptTsv(rows) {
    var account = (state.meta && state.meta.fundAccountName) || FUND_ACCOUNT_DEFAULT;
    return rows.map(function (t) {
      var st = cashReceiptStudentOf(t);
      var amt = Number(t.deposit) || 0, sp = cashReceiptVatSplit(amt);
      var reason = t.category === "consulting" ? "대리입찰 컨설팅비" : "수강료(" + ((st && st.level) || "수강생") + ")";
      return [t.date, account, "에듀", String(t.description || "").trim(), String(amt), String(sp.supply), String(sp.vat), reason, CASH_RECEIPT_STATUS_LABEL[cashReceiptStatusOf(t)], t.cashReceiptDate || "", [t.cashReceiptType || "", cashReceiptNoOf(t, st), t.cashReceiptMemo || ""].filter(Boolean).join(" · ")].join("\t");
    }).join("\n");
  }
  function setCashReceiptStatus(t, status) {
    t.cashReceiptStatus = status;
    t.cashReceiptIssued = status === "issued";
    if (status === "issued" && !t.cashReceiptDate) t.cashReceiptDate = todayStr();
    if (status !== "issued") t.cashReceiptDate = t.cashReceiptDate && status === "pending" ? null : t.cashReceiptDate;
  }
  function renderCashReceipt() {
    var main = document.getElementById("main");
    var all = cashReceiptRows();
    var months = {};
    all.forEach(function (t) { months[t.date.slice(0, 7)] = true; });
    var monthKeys = Object.keys(months).sort().reverse();
    var counts = { all: all.length, pending: 0, issued: 0, notNeeded: 0, declined: 0 }, pendingAmt = 0;
    all.forEach(function (t) { var s = cashReceiptStatusOf(t); counts[s] = (counts[s] || 0) + 1; if (s === "pending") pendingAmt += Number(t.deposit) || 0; });
    var q = cashReceiptQuery.trim().toLowerCase();
    var rows = all.filter(function (t) {
      if (cashReceiptFilter !== "all" && cashReceiptStatusOf(t) !== cashReceiptFilter) return false;
      if (cashReceiptMonth !== "all" && t.date.slice(0, 7) !== cashReceiptMonth) return false;
      if (q) {
        var st = cashReceiptStudentOf(t);
        var hay = (String(t.description || "") + " " + (st ? st.name + " " + (st.level || "") : "") + " " + (t.cashReceiptNo || "") + " " + (t.cashReceiptMemo || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var taxed = state.meta && state.meta.cashReceiptVat === "과세";
    var html = '<style>' +
      '.cr-wrap .cr-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 14px}' +
      '.cr-wrap .cr-tile{border:1px solid var(--border);border-radius:10px;padding:10px 12px;cursor:pointer;background:transparent;text-align:left;color:var(--ink)}' +
      '.cr-wrap .cr-tile.on{border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-soft, rgba(91,62,232,.18)) inset}' +
      '.cr-wrap .cr-tile .n{font-size:22px;font-weight:700}.cr-wrap .cr-tile .l{font-size:12px;color:var(--ink-soft)}' +
      '.cr-wrap .cr-ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}' +
      '.cr-wrap .cr-ctl select,.cr-wrap .cr-ctl input[type=search]{padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--ink);font-size:13px}' +
      '.cr-wrap .cr-table input,.cr-wrap .cr-table select{padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--ink);font-size:12.5px}' +
      '.cr-wrap .cr-table input[type=date]{min-width:130px}.cr-wrap .cr-table input[data-cr-no]{min-width:130px}.cr-wrap .cr-table input[data-cr-memo]{min-width:140px}' +
      '.cr-wrap .cr-table tr.pending td{background:rgba(242,201,76,.12)}' +
      '.cr-wrap .cr-tsv{width:100%;min-height:90px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre;overflow:auto;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--ink);margin-top:8px}' +
      '</style>';
    html += '<div class="cr-wrap">';
    html += '<div class="page-head"><div><h1>현금영수증 게시판</h1><div class="sub">현금·계좌이체로 들어온 수강료·컨설팅비(카드사 정산 제외)의 현금영수증 발급 상태를 관리합니다. 은행 화면의 "현금영수증 발행" 체크와 같은 값이며, 발급일·식별번호·구분을 여기서 적습니다. 식별번호는 수강생 DB 의 현금영수증 번호가 있으면 미리 들어옵니다.</div></div></div>';
    html += '<div class="cr-tiles">';
    [["pending", "⚠ 미발행", counts.pending, won(pendingAmt)], ["issued", "✅ 발급완료", counts.issued, ""], ["notNeeded", "불필요(미요청)", counts.notNeeded, ""], ["declined", "거부", counts.declined, ""], ["all", "전체 대상", counts.all, ""]].forEach(function (x) {
      html += '<button type="button" class="cr-tile' + (cashReceiptFilter === x[0] ? " on" : "") + '" data-cr-filter="' + x[0] + '"><div class="n">' + x[2] + '건</div><div class="l">' + esc(x[1]) + (x[3] ? " · " + esc(x[3]) : "") + '</div></button>';
    });
    html += '</div>';
    html += '<div class="card" style="margin-bottom:16px">';
    html += '<div class="cr-ctl">' +
      '<select id="crMonth"><option value="all">전체 기간</option>' + monthKeys.map(function (mk) { return '<option value="' + mk + '"' + (cashReceiptMonth === mk ? " selected" : "") + '>' + esc(monthLabel(mk)) + '</option>'; }).join("") + '</select>' +
      '<input type="search" id="crQuery" placeholder="입금자·수강생·번호 검색" value="' + esc(cashReceiptQuery) + '">' +
      '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-soft)"><input type="checkbox" id="crVat"' + (taxed ? " checked" : "") + '> 부가세 10/11 분리(과세) — 끄면 면세(공급가액=총액)</label>' +
      '<span style="font-size:13px;color:var(--ink-soft);margin-left:auto">표시 <b style="color:var(--ink)">' + rows.length + '</b>건</span>' +
      '</div>';
    if (!rows.length) {
      html += '<div class="empty-state">조건에 맞는 거래가 없습니다. 수강료 확정(은행 화면)을 한 뒤 여기 나타납니다.</div>';
    } else {
      html += '<div class="table-wrap"><table class="data-table cr-table"><thead><tr><th>입금일</th><th>입금자(적요)</th><th>수강생 · 반</th><th class="num">금액</th><th>상태</th><th>발급일</th><th>구분</th><th>식별번호(휴대폰·사업자)</th><th>비고</th></tr></thead><tbody>';
      rows.forEach(function (t) {
        var st = cashReceiptStudentOf(t);
        var status = cashReceiptStatusOf(t);
        var no = cashReceiptNoOf(t, st);
        html += '<tr class="' + status + '" data-cr-row="' + esc(t.id) + '">' +
          '<td>' + esc(formatShortDate(t.date)) + '<div class="meta" style="font-size:11px;color:var(--ink-soft)">' + esc(t.date) + '</div></td>' +
          '<td>' + esc(String(t.description || "").trim()) + (t.category === "consulting" ? ' ' + pill("컨설팅", "accent") : "") + '</td>' +
          '<td>' + (st ? esc(st.name) + ' <span class="meta">' + esc(st.level || "") + '</span>' : '<span class="meta" style="color:var(--warn)">수강생 미연결</span>') + '</td>' +
          '<td class="num">' + (Number(t.deposit) || 0).toLocaleString("ko-KR") + '</td>' +
          '<td><select data-cr-status="' + esc(t.id) + '">' + CASH_RECEIPT_STATUS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === status ? " selected" : "") + '>' + p[1] + '</option>'; }).join("") + '</select></td>' +
          '<td><input type="date" data-cr-date="' + esc(t.id) + '" value="' + esc(t.cashReceiptDate || "") + '"></td>' +
          '<td><select data-cr-type="' + esc(t.id) + '"><option value="">-</option><option value="소득공제"' + (t.cashReceiptType === "소득공제" ? " selected" : "") + '>소득공제</option><option value="지출증빙"' + (t.cashReceiptType === "지출증빙" ? " selected" : "") + '>지출증빙</option></select></td>' +
          '<td><input type="text" data-cr-no="' + esc(t.id) + '" value="' + esc(no) + '" placeholder="010-… / 사업자번호"' + (!t.cashReceiptNo && no ? ' title="수강생 DB 번호 자동"' : "") + '></td>' +
          '<td><input type="text" data-cr-memo="' + esc(t.id) + '" value="' + esc(t.cashReceiptMemo || "") + '" placeholder="승인번호·메모"></td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      html += '<div class="cr-ctl" style="margin-top:12px">' +
        '<button type="button" class="btn btn-primary" id="crCopy">📋 표시된 행 복사 (현금영수증 탭 양식)</button>' +
        '<button type="button" class="btn btn-ghost" id="crAllIssued">✅ 표시된 미발행 전부 발급완료로</button>' +
        '<span class="hint">열 순서: 입금일 · 계좌 · 지점 · 입금자명 · 총거래금액 · 공급가액 · 부가세 · 사유 · 발급상태 · 발급일 · 비고</span>' +
        '</div>';
      html += '<textarea class="cr-tsv" id="crTsv" readonly spellcheck="false">' + esc(cashReceiptTsv(rows)) + '</textarea>';
    }
    html += '</div></div>';
    main.innerHTML = html;

    function rerender() { renderCashReceipt(); }
    function txById(id) { return state.transactions.filter(function (t) { return t.id === id; })[0]; }
    Array.prototype.forEach.call(main.querySelectorAll("[data-cr-filter]"), function (b) {
      b.addEventListener("click", function () { cashReceiptFilter = b.getAttribute("data-cr-filter"); rerender(); });
    });
    var mSel = document.getElementById("crMonth");
    if (mSel) mSel.addEventListener("change", function () { cashReceiptMonth = mSel.value; rerender(); });
    var qInp = document.getElementById("crQuery");
    if (qInp) {
      var qTimer = null;
      qInp.addEventListener("input", function () { clearTimeout(qTimer); qTimer = setTimeout(function () { cashReceiptQuery = qInp.value; rerender(); var el = document.getElementById("crQuery"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); });
    }
    var vat = document.getElementById("crVat");
    if (vat) vat.addEventListener("change", function () { state.meta.cashReceiptVat = vat.checked ? "과세" : "면세"; persistLocal(); rerender(); });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cr-status]"), function (sel) {
      sel.addEventListener("change", function () { var t = txById(sel.getAttribute("data-cr-status")); if (!t) return; setCashReceiptStatus(t, sel.value); saveState(); rerender(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cr-date]"), function (inp) {
      inp.addEventListener("change", function () { var t = txById(inp.getAttribute("data-cr-date")); if (!t) return; t.cashReceiptDate = inp.value || null; if (inp.value && cashReceiptStatusOf(t) === "pending") setCashReceiptStatus(t, "issued"); saveState(); rerender(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cr-type]"), function (sel) {
      sel.addEventListener("change", function () { var t = txById(sel.getAttribute("data-cr-type")); if (!t) return; t.cashReceiptType = sel.value || null; saveState(); rerender(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cr-no]"), function (inp) {
      inp.addEventListener("change", function () { var t = txById(inp.getAttribute("data-cr-no")); if (!t) return; t.cashReceiptNo = inp.value.trim() || null; saveState(); rerender(); });
    });
    Array.prototype.forEach.call(main.querySelectorAll("[data-cr-memo]"), function (inp) {
      inp.addEventListener("change", function () { var t = txById(inp.getAttribute("data-cr-memo")); if (!t) return; t.cashReceiptMemo = inp.value.trim() || null; saveState(); rerender(); });
    });
    var copyBtn = document.getElementById("crCopy");
    if (copyBtn) copyBtn.addEventListener("click", function () { copyToClipboard(cashReceiptTsv(rows), "현금영수증 " + rows.length + "줄 복사됨 — 양식 「현금영수증」 탭에 붙여넣기"); });
    var allBtn = document.getElementById("crAllIssued");
    if (allBtn) allBtn.addEventListener("click", function () {
      var targets = rows.filter(function (t) { return cashReceiptStatusOf(t) === "pending"; });
      if (!targets.length) { toast("표시된 행에 미발행 건이 없습니다."); return; }
      customConfirm("표시된 미발행 " + targets.length + "건을 모두 발급완료(발급일 오늘)로 바꿀까요?", function () {
        targets.forEach(function (t) { setCashReceiptStatus(t, "issued"); });
        saveState(); rerender();
      });
    });
  }
