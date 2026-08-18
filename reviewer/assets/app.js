/*!
 * app.js — 지점별 리뷰어 관리 프로그램 UI
 * 화면: 대시보드 / 리뷰어 명단 / 예약 현황 / 공유용 일정표 / 설정
 *
 * 개인정보 취급
 *  - 공유용 일정표(화면·이미지)에는 지점명·날짜·시간대·가능인원·마감여부만 사용한다.
 *  - 관리자 화면은 "개인정보 가리기" 토글로 마스킹할 수 있다.
 *  - 업로드 파일의 텍스트는 항상 값으로만 다루며 innerHTML 로 주입하지 않는다.
 */
(function (global) {
  'use strict';

  var S = global.Store;
  var X = global.XlsxLite;

  /* ============================================================ DOM 헬퍼 */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;      // 정적 문자열에만 사용
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else el.setAttribute(k, v);
      });
    }
    (Array.isArray(children) ? children : (children == null ? [] : [children])).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return el;
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

  function toast(msg, kind) {
    var wrap = $('#toast-wrap');
    var t = h('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: msg });
    wrap.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
  }

  function openModal(opts) {
    var root = $('#modal-root');
    clear(root);
    var backdrop = h('div', { class: 'modal-backdrop' });
    var modal = h('div', { class: 'modal' });
    modal.appendChild(h('header', null, [h('h3', { text: opts.title || '' })]));
    var body = h('div', { class: 'body' });
    if (opts.body) body.appendChild(opts.body);
    modal.appendChild(body);
    var footer = h('footer', null, (opts.buttons || []).map(function (b) {
      return h('button', {
        class: 'btn ' + (b.class || ''), text: b.label,
        onclick: function () { if (!b.onClick || b.onClick() !== false) closeModal(); }
      });
    }));
    modal.appendChild(footer);
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(); });
    root.appendChild(backdrop);
    return { close: closeModal, body: body };
  }
  function closeModal() { clear($('#modal-root')); }

  function confirmBox(message, onYes, yesLabel) {
    openModal({
      title: '확인',
      body: h('div', { text: message }),
      buttons: [
        { label: '취소' },
        { label: yesLabel || '확인', class: 'btn-danger', onClick: onYes }
      ]
    });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function stamp() {
    var d = new Date();
    return S.toDateStr(d).replace(/-/g, '');
  }
  function safeFileName(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '_').trim() || '무제'; }

  /* ============================================================ 필터 상태 */
  var ui = {
    page: 'dashboard',
    branch: 'all',          // 'all' | branchId | '__unmatched'
    from: '', to: '',
    search: '',
    status: 'all',
    unmatchedOnly: false,
    sortKey: '', sortDir: 1,
    openSlot: null,         // {branchId, date, time}
    shareHideClosed: false,
    shareShowCount: true
  };

  function state() { return S.get(); }

  function defaultRange() {
    var dates = [];
    state().branches.forEach(function (b) { dates = dates.concat(b.dates || []); });
    state().reviewers.forEach(function (r) { if (r.wishDate) dates.push(r.wishDate); });
    dates = dates.filter(Boolean).sort();
    if (!dates.length) return { from: S.todayStr(), to: S.addDays(S.todayStr(), 14) };
    return { from: dates[0], to: dates[dates.length - 1] };
  }

  function range() { return { from: ui.from, to: ui.to }; }
  function inRange(dateStr) {
    if (!dateStr) return true;
    if (ui.from && dateStr < ui.from) return false;
    if (ui.to && dateStr > ui.to) return false;
    return true;
  }

  /** 상단 지점 선택에 해당하는 지점 목록 */
  function scopedBranches() {
    var s = state();
    if (ui.branch === 'all' || ui.branch === '__unmatched') return s.branches.slice();
    return s.branches.filter(function (b) { return b.id === ui.branch; });
  }

  function matchesBranch(r) {
    if (ui.branch === 'all') return true;
    if (ui.branch === '__unmatched') return !r.branchId;
    return r.branchId === ui.branch;
  }

  function searchHit(r, q) {
    if (!q) return true;
    var hay = [r.name, r.branchName, r.phone, r.accountUrl, r.address, r.grade, r.memo, r.applyMessage, r.status, r.wishDate, r.wishTime]
      .join(' ').toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  }

  /** 리뷰어 목록 필터 (희망일이 비어 있으면 기간 필터에서 제외하지 않는다) */
  function filteredReviewers(opts) {
    opts = opts || {};
    var q = ui.search.trim();
    var list = state().reviewers.filter(function (r) {
      if (!matchesBranch(r)) return false;
      if (!inRange(r.wishDate)) return false;
      if (!searchHit(r, q)) return false;
      if (!opts.ignoreStatus && ui.status !== 'all' && r.status !== ui.status) return false;
      if (!opts.ignoreUnmatched && ui.unmatchedOnly && r.branchId) return false;
      return true;
    });
    if (ui.sortKey) {
      var k = ui.sortKey, dir = ui.sortDir;
      list.sort(function (a, b) {
        var va = a[k], vb = b[k];
        if (k === 'exposureScore' || k === 'dailyVisits') {
          va = Number(va) || -1; vb = Number(vb) || -1;
          return (va - vb) * dir;
        }
        if (k === 'reviewRegistered') return ((va ? 1 : 0) - (vb ? 1 : 0)) * dir;
        va = String(va == null ? '' : va); vb = String(vb == null ? '' : vb);
        return va.localeCompare(vb, 'ko') * dir;
      });
    }
    return list;
  }

  /* ============================================================ 마스킹 */
  function masked() { return !!state().settings.maskPII; }

  function maskPhone(v) {
    var s = String(v || '');
    if (!s) return '';
    var digits = s.replace(/\D/g, '');
    if (digits.length < 7) return '***';
    return digits.slice(0, 3) + '-****-' + digits.slice(-4);
  }
  function maskText(v, keep) {
    var s = String(v || '');
    if (!s) return '';
    var n = keep == null ? 2 : keep;
    return s.slice(0, n) + '*'.repeat(Math.max(2, Math.min(8, s.length - n)));
  }

  /* ============================================================ 상단 바 */
  function initTopbar() {
    var r = defaultRange();
    ui.from = r.from; ui.to = r.to;
    $('#f-from').value = ui.from;
    $('#f-to').value = ui.to;
    $('#f-mask').checked = masked();
    $('#share-note').value = state().settings.shareNote || '';

    $('#f-branch').addEventListener('change', function () { ui.branch = this.value; ui.openSlot = null; render(); });
    $('#f-from').addEventListener('change', function () { ui.from = this.value; render(); });
    $('#f-to').addEventListener('change', function () { ui.to = this.value; render(); });
    $('#btn-range-reset').addEventListener('click', function () {
      var d = defaultRange(); ui.from = d.from; ui.to = d.to;
      $('#f-from').value = ui.from; $('#f-to').value = ui.to; render();
    });

    var t = null;
    $('#f-search').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(t);
      t = setTimeout(function () { ui.search = v; render(); }, 180);
    });
    $('#f-mask').addEventListener('change', function () {
      state().settings.maskPII = this.checked; S.commit(true); render();
    });

    $$('.navbtn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ui.page = btn.getAttribute('data-page');
        $$('.navbtn').forEach(function (b) { b.classList.toggle('active', b === btn); });
        $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + ui.page); });
        render();
        global.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function renderBranchSelect() {
    var sel = $('#f-branch');
    var cur = ui.branch;
    clear(sel);
    sel.appendChild(h('option', { value: 'all', text: '전체 지점' }));
    state().branches.forEach(function (b) {
      sel.appendChild(h('option', { value: b.id, text: b.name }));
    });
    var un = S.unmatchedBranchNames();
    if (un.length) {
      var cnt = un.reduce(function (a, u) { return a + u.count; }, 0);
      sel.appendChild(h('option', { value: '__unmatched', text: '⚠ 미매칭 지점 (' + cnt + '명)' }));
    }
    var exists = $$('option', sel).some(function (o) { return o.value === cur; });
    sel.value = exists ? cur : 'all';
    ui.branch = sel.value;
  }

  /* ============================================================ 공통 배너 */
  function renderGlobalNotice() {
    var box = $('#global-notice');
    clear(box);
    var un = S.unmatchedBranchNames();
    if (!un.length) return;

    var total = un.reduce(function (a, u) { return a + u.count; }, 0);
    var notice = h('div', { class: 'notice' });
    notice.appendChild(h('div', null, [
      h('b', { text: '미매칭 지점 ' + un.length + '건 (' + total + '명)' }),
      h('div', {
        text: '업로드된 지점명이 등록된 지점과 일치하지 않습니다: ' +
          un.map(function (u) { return u.name + '(' + u.count + ')'; }).join(', ')
      })
    ]));
    notice.appendChild(h('div', { class: 'actions' }, [
      h('button', { class: 'btn btn-sm', text: '지점 매칭하기', onclick: openMatchModal })
    ]));
    box.appendChild(notice);
  }

  function openMatchModal() {
    var un = S.unmatchedBranchNames();
    var body = h('div');
    body.appendChild(h('p', { class: 'hint', text: '업로드된 지점명을 등록된 지점에 연결하거나, 새 지점으로 추가할 수 있습니다.' }));

    un.forEach(function (u) {
      var row = h('div', { class: 'person-row' });
      row.appendChild(h('span', { class: 'nm', text: u.name }));
      row.appendChild(h('span', { class: 'badge b-unmatched', text: u.count + '명' }));

      var sel = h('select', null, [h('option', { value: '', text: '연결할 지점 선택…' })].concat(
        state().branches.map(function (b) { return h('option', { value: b.id, text: b.name }); })
      ));
      row.appendChild(sel);
      row.appendChild(h('button', {
        class: 'btn btn-sm', text: '연결', onclick: function () {
          var b = S.branchById(sel.value);
          if (!b) { toast('연결할 지점을 선택하세요.', 'err'); return; }
          state().reviewers.forEach(function (r) {
            if (!r.branchId && S.normKey(r.branchName) === S.normKey(u.name)) r.branchName = b.name;
          });
          S.relinkBranches(); S.commit();
          toast('"' + u.name + '" → "' + b.name + '" 으로 연결했습니다.', 'ok');
          closeModal(); render();
        }
      }));
      row.appendChild(h('button', {
        class: 'btn btn-sm btn-primary', text: '새 지점으로 추가', onclick: function () {
          if (!S.normName(u.name) || u.name === '(지점명 없음)') { toast('지점명이 비어 있어 추가할 수 없습니다.', 'err'); return; }
          state().branches.push(S.makeBranch(u.name, [], [], 2));
          S.relinkBranches(); S.commit();
          toast('"' + u.name + '" 지점을 추가했습니다. 설정에서 날짜·시간대를 등록하세요.', 'ok');
          closeModal(); render();
        }
      }));
      body.appendChild(row);
    });

    openModal({ title: '미매칭 지점 확인', body: body, buttons: [{ label: '닫기' }] });
  }

  /* ============================================================ 대시보드 */
  function renderDashboard() {
    var branches = scopedBranches();
    var rvs = filteredReviewers({ ignoreStatus: true, ignoreUnmatched: true });
    var st = S.statsFor(rvs, ui.branch === '__unmatched' ? [] : branches, range());

    $('#dash-scope').textContent =
      (ui.branch === 'all' ? '전체 지점' : ui.branch === '__unmatched' ? '미매칭 지점' : (S.branchById(ui.branch) || {}).name) +
      ' · ' + (ui.from || '전체') + ' ~ ' + (ui.to || '전체');

    var grid = $('#dash-stats');
    clear(grid);
    [
      ['s-total', '전체 명단', st.total, '명'],
      ['s-pre', '예약전', st.예약전, '명'],
      ['s-req', '예약요청', st.예약요청, '명'],
      ['s-cfm', '예약확정', st.예약확정, '명'],
      ['s-done', '방문완료', st.방문완료, '명'],
      ['s-cancel', '취소', st.취소, '명'],
      ['s-remain', '잔여 예약 가능', st.remaining, '자리'],
      ['s-done', '리뷰 등록', st.리뷰등록, '건']
    ].forEach(function (c) {
      grid.appendChild(h('div', { class: 'stat ' + c[0] }, [
        h('div', { class: 'k', text: c[1] }),
        h('div', { class: 'v', text: String(c[2]) }),
        h('div', { class: 'sub', text: c[3] })
      ]));
    });
    grid.appendChild(h('div', { class: 'stat' }, [
      h('div', { class: 'k', text: '예약 정원 / 사용' }),
      h('div', { class: 'v', text: st.booked + ' / ' + st.capacity }),
      h('div', { class: 'sub', text: '기간 내 시간대 합계' })
    ]));

    // 지점별 집계
    var table = $('#dash-branch-table');
    clear(table);
    table.appendChild(h('thead', null, h('tr', null,
      ['지점명', '전체', '예약전', '예약요청', '예약확정', '방문완료', '취소', '리뷰등록', '정원', '예약', '잔여'].map(function (t) {
        return h('th', { class: 'no-sort', text: t });
      })
    )));
    var tbody = h('tbody');
    var list = ui.branch === '__unmatched' ? [] : branches;
    list.forEach(function (b) {
      var rs = rvs.filter(function (r) { return r.branchId === b.id; });
      var bs = S.statsFor(rs, [b], range());
      tbody.appendChild(h('tr', null, [
        h('td', { text: b.name }),
        h('td', { class: 'num', text: String(bs.total) }),
        h('td', { class: 'num', text: String(bs.예약전) }),
        h('td', { class: 'num', text: String(bs.예약요청) }),
        h('td', { class: 'num', text: String(bs.예약확정) }),
        h('td', { class: 'num', text: String(bs.방문완료) }),
        h('td', { class: 'num', text: String(bs.취소) }),
        h('td', { class: 'num', text: String(bs.리뷰등록) }),
        h('td', { class: 'num', text: String(bs.capacity) }),
        h('td', { class: 'num', text: String(bs.booked) }),
        h('td', { class: 'num' }, h('span', { class: 'badge ' + (bs.remaining ? 'b-ok' : 'b-closed'), text: bs.remaining ? '가능 ' + bs.remaining : '마감' }))
      ]));
    });
    var unmatchedRows = rvs.filter(function (r) { return !r.branchId; });
    if (unmatchedRows.length) {
      var us = S.statsFor(unmatchedRows, [], range());
      tbody.appendChild(h('tr', { class: 'row-unmatched' }, [
        h('td', null, [h('span', { class: 'badge b-unmatched', text: '미매칭' }), ' 지점 미등록']),
        h('td', { class: 'num', text: String(us.total) }),
        h('td', { class: 'num', text: String(us.예약전) }),
        h('td', { class: 'num', text: String(us.예약요청) }),
        h('td', { class: 'num', text: String(us.예약확정) }),
        h('td', { class: 'num', text: String(us.방문완료) }),
        h('td', { class: 'num', text: String(us.취소) }),
        h('td', { class: 'num', text: String(us.리뷰등록) }),
        h('td', { class: 'num', text: '-' }), h('td', { class: 'num', text: '-' }), h('td', { class: 'num', text: '-' })
      ]));
    }
    if (!tbody.childNodes.length) tbody.appendChild(h('tr', null, h('td', { colspan: '11', class: 'empty', text: '표시할 지점이 없습니다.' })));
    table.appendChild(tbody);

    // 임박한 예약
    var up = $('#dash-upcoming');
    clear(up);
    up.appendChild(h('thead', null, h('tr', null,
      ['희망일', '시간', '지점', '리뷰어', '상태', '리뷰등록'].map(function (t) { return h('th', { class: 'no-sort', text: t }); })
    )));
    var ub = h('tbody');
    rvs.filter(function (r) { return r.wishDate && (r.status === '예약요청' || r.status === '예약확정'); })
      .sort(function (a, b) { return (a.wishDate + a.wishTime).localeCompare(b.wishDate + b.wishTime); })
      .slice(0, 40)
      .forEach(function (r) {
        ub.appendChild(h('tr', null, [
          h('td', { text: S.fmtDate(r.wishDate) }),
          h('td', { text: r.wishTime || '-' }),
          h('td', { text: r.branchName || '-' }),
          h('td', { text: r.name || '-' }),
          h('td', null, h('span', { class: 'badge b-' + r.status, text: r.status })),
          h('td', { text: r.reviewRegistered ? '완료' : '-' })
        ]));
      });
    if (!ub.childNodes.length) ub.appendChild(h('tr', null, h('td', { colspan: '6', class: 'empty', text: '기간 내 예약요청·예약확정 건이 없습니다.' })));
    up.appendChild(ub);
  }

  /* ============================================================ 리뷰어 명단 */
  var COLS = [
    { key: 'branchName', label: '지점명', cls: 'col-w-branch', type: 'branch' },
    { key: 'name', label: '리뷰어명', cls: 'col-w-md', sticky: true },
    { key: 'accountUrl', label: '계정 URL', cls: 'col-w-lg', pii: true },
    { key: 'phone', label: '연락처', cls: 'col-w-md', pii: true, mask: maskPhone },
    { key: 'address', label: '주소', cls: 'col-w-lg', pii: true, mask: function (v) { return maskText(v, 6); } },
    { key: 'exposureScore', label: '노출점수', cls: 'col-w-sm', num: true },
    { key: 'grade', label: '등급', cls: 'col-w-sm', type: 'grade' },
    { key: 'dailyVisits', label: '일 방문 수', cls: 'col-w-sm', num: true },
    { key: 'wishDate', label: '희망일', cls: 'col-w-md', type: 'date' },
    { key: 'wishTime', label: '희망시간', cls: 'col-w-sm', type: 'time' },
    { key: '_slot', label: '잔여', cls: 'col-w-sm', type: 'slot', noSort: true },
    { key: 'status', label: '예약상태', cls: 'col-w-md', type: 'status' },
    { key: 'reviewRegistered', label: '리뷰등록', cls: 'col-w-sm', type: 'bool' },
    { key: 'applyMessage', label: '신청메시지', cls: 'col-w-lg', pii: true, mask: function (v) { return v ? '(가림)' : ''; } },
    { key: 'memo', label: '메모', cls: 'col-w-lg' }
  ];

  function updateReviewer(r, key, value) {
    r[key] = value;
    if (key === 'branchName') S.relinkBranches();
    if (key === 'wishDate') r.wishDate = S.normalizeDate(value);
    if (key === 'wishTime') r.wishTime = S.normalizeTime(value);
    S.commit();
    render();
  }

  function renderReviewers() {
    var list = filteredReviewers();
    $('#rv-count').textContent = list.length + '명 표시 · 전체 ' + state().reviewers.length + '명';
    $('#nav-count-reviewers').textContent = state().reviewers.length;
    $('#f-status').value = ui.status;
    $('#f-unmatched-only').checked = ui.unmatchedOnly;

    var table = $('#reviewer-table');
    clear(table);

    var headRow = h('tr', null, [h('th', { class: 'rownum no-sort', text: '#' })]);
    COLS.forEach(function (c) {
      var th = h('th', {
        class: (c.cls || '') + (c.noSort ? ' no-sort' : ''),
        onclick: function () {
          if (c.noSort) return;
          if (ui.sortKey === c.key) ui.sortDir = -ui.sortDir;
          else { ui.sortKey = c.key; ui.sortDir = 1; }
          renderReviewers();
        }
      }, [c.label, ui.sortKey === c.key ? h('span', { class: 'arrow', text: ui.sortDir > 0 ? ' ▲' : ' ▼' }) : null]);
      headRow.appendChild(th);
    });
    headRow.appendChild(h('th', { class: 'no-sort', text: '삭제' }));
    table.appendChild(h('thead', null, headRow));

    var branchNames = state().branches.map(function (b) { return b.name; });
    var dl = h('datalist', { id: 'dl-branches' }, branchNames.map(function (n) { return h('option', { value: n }); }));
    table.appendChild(dl);

    var tbody = h('tbody');
    list.forEach(function (r, i) {
      var tr = h('tr', { class: r.branchId ? '' : 'row-unmatched' });
      tr.appendChild(h('td', { class: 'rownum', text: String(i + 1) }));
      COLS.forEach(function (c) { tr.appendChild(cellFor(r, c)); });
      tr.appendChild(h('td', null, h('button', {
        class: 'btn btn-sm btn-danger btn-icon', text: '삭제', title: r.name + ' 삭제',
        onclick: function () {
          confirmBox('"' + (r.name || '이름 없음') + '" 을(를) 명단에서 삭제할까요?', function () {
            var s = state();
            s.reviewers = s.reviewers.filter(function (x) { return x.id !== r.id; });
            S.commit(); render(); toast('삭제했습니다.');
          }, '삭제');
        }
      })));
      tbody.appendChild(tr);
    });
    if (!list.length) {
      tbody.appendChild(h('tr', null, h('td', {
        colspan: String(COLS.length + 2), class: 'empty',
        text: state().reviewers.length ? '조건에 맞는 리뷰어가 없습니다. 필터를 조정해 보세요.' : '명단이 비어 있습니다. CSV/엑셀 파일을 업로드하세요.'
      })));
    }
    table.appendChild(tbody);
  }

  function cellFor(r, c) {
    var td = h('td', { class: (c.cls || '') + (c.sticky ? ' sticky-name' : '') + (c.num ? ' num' : '') });

    if (c.pii && masked()) {
      td.appendChild(h('span', { class: 'pii-mask', text: (c.mask ? c.mask(r[c.key]) : maskText(r[c.key])) || '-' }));
      return td;
    }

    switch (c.type) {
      case 'branch': {
        var wrap = h('div', { class: 'flex', style: 'gap:4px;flex-wrap:nowrap' });
        var inp = h('input', {
          class: 'cell-input', type: 'text', list: 'dl-branches', value: r.branchName,
          onchange: function () { updateReviewer(r, 'branchName', S.normName(this.value)); }
        });
        wrap.appendChild(inp);
        if (!r.branchId) wrap.appendChild(h('span', { class: 'badge b-unmatched', text: '미매칭', title: '등록된 지점명과 일치하지 않습니다.' }));
        td.appendChild(wrap);
        return td;
      }
      case 'grade': {
        var sel = h('select', {
          class: 'cell-input',
          onchange: function () { updateReviewer(r, 'grade', this.value); }
        }, S.GRADES.concat(S.GRADES.indexOf(r.grade) < 0 && r.grade ? [r.grade] : []).map(function (g) {
          return h('option', { value: g, text: g || '-', selected: g === r.grade });
        }));
        sel.value = r.grade || '';
        td.appendChild(sel);
        return td;
      }
      case 'date': {
        td.appendChild(h('input', {
          class: 'cell-input', type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(r.wishDate) ? r.wishDate : '',
          onchange: function () { updateReviewer(r, 'wishDate', this.value); }
        }));
        return td;
      }
      case 'time': {
        var b = S.branchById(r.branchId);
        var times = (b ? b.times.slice() : []).sort();
        if (r.wishTime && times.indexOf(r.wishTime) < 0) times.push(r.wishTime);
        var s2 = h('select', {
          class: 'cell-input',
          onchange: function () { updateReviewer(r, 'wishTime', this.value); }
        }, [h('option', { value: '', text: '-' })].concat(times.map(function (t) {
          return h('option', { value: t, text: t });
        })));
        s2.value = r.wishTime || '';
        td.appendChild(s2);
        return td;
      }
      case 'slot': {
        var br = S.branchById(r.branchId);
        if (!br || !r.wishDate || !r.wishTime) { td.appendChild(h('span', { class: 'hint', text: '-' })); return td; }
        var info = S.slotInfo(br, r.wishDate, r.wishTime);
        var cls = info.over ? 'b-closed' : (info.closed ? 'b-closed' : 'b-ok');
        var label = info.over ? '초과 ' + info.over : info.label;
        td.appendChild(h('span', {
          class: 'badge ' + cls, text: label,
          title: '정원 ' + info.capacity + '명 / 예약 ' + info.booked + '명'
        }));
        return td;
      }
      case 'status': {
        var ss = h('select', {
          class: 'status-select s-' + r.status,
          onchange: function () { updateReviewer(r, 'status', this.value); }
        }, S.STATUSES.map(function (v) { return h('option', { value: v, text: v }); }));
        ss.value = r.status;
        td.appendChild(ss);
        return td;
      }
      case 'bool': {
        td.appendChild(h('input', {
          type: 'checkbox', checked: !!r.reviewRegistered,
          onchange: function () { updateReviewer(r, 'reviewRegistered', this.checked); }
        }));
        return td;
      }
      default: {
        var input = h('input', {
          class: 'cell-input', type: 'text', value: r[c.key] == null ? '' : String(r[c.key]),
          onchange: function () { updateReviewer(r, c.key, this.value.trim()); }
        });
        td.appendChild(input);
        return td;
      }
    }
  }

  /* ============================================================ 파일 업로드 */
  function initUpload() {
    var zone = $('#dropzone');
    var input = $('#file-input');

    $('#btn-pick-file').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (this.files && this.files[0]) handleFile(this.files[0]);
      this.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('drag'); });
    });
    zone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  function handleFile(file) {
    toast('"' + file.name + '" 읽는 중…');
    S.parseFile(file).then(function (res) {
      if (!res.rows.length) { toast('가져올 데이터가 없습니다. 헤더(지점명, 리뷰어명 등)를 확인하세요.', 'err'); return; }
      openImportPreview(file, res);
    }).catch(function (err) {
      toast(err && err.message ? err.message : '파일을 읽지 못했습니다.', 'err');
    });
  }

  function openImportPreview(file, res) {
    var body = h('div');
    var mappedKeys = Object.keys(res.mapping);
    var labelOf = {};
    S.FIELD_ALIASES.forEach(function (f) { labelOf[f.key] = f.label; });

    body.appendChild(h('div', { class: 'notice info' }, h('div', null, [
      h('b', { text: file.name + ' · ' + res.rows.length + '행' }),
      h('div', { text: '인식된 항목: ' + (mappedKeys.map(function (k) { return labelOf[k] || k; }).join(', ') || '없음') }),
      res.unknownColumns.length ? h('div', { text: '무시된 열: ' + res.unknownColumns.join(', ') }) : null
    ])));

    // 미매칭 지점 미리 안내
    var unknownBranches = {};
    res.rows.forEach(function (r) {
      if (!S.branchByName(r.branchName)) {
        var k = S.normKey(r.branchName) || '(없음)';
        unknownBranches[k] = (unknownBranches[k] || 0) + 1;
      }
    });
    var ubKeys = Object.keys(unknownBranches);
    if (ubKeys.length) {
      var names = {};
      res.rows.forEach(function (r) { names[S.normKey(r.branchName) || '(없음)'] = r.branchName || '(지점명 없음)'; });
      body.appendChild(h('div', { class: 'notice' }, h('div', null, [
        h('b', { text: '미매칭 지점 ' + ubKeys.length + '건' }),
        h('div', { text: ubKeys.map(function (k) { return names[k] + '(' + unknownBranches[k] + '행)'; }).join(', ') }),
        h('div', { class: 'hint', text: '가져오기 후 상단 배너에서 기존 지점에 연결하거나 새 지점으로 추가할 수 있습니다.' })
      ])));
    }

    var previewCols = ['branchName', 'name', 'accountUrl', 'phone', 'address', 'exposureScore', 'grade', 'dailyVisits', 'wishDate', 'wishTime', 'status'];
    var tbl = h('table', { class: 'preview-table' });
    tbl.appendChild(h('thead', null, h('tr', null, previewCols.map(function (k) { return h('th', { text: labelOf[k] || k }); }))));
    tbl.appendChild(h('tbody', null, res.rows.slice(0, 8).map(function (r) {
      return h('tr', null, previewCols.map(function (k) { return h('td', { text: String(r[k] == null ? '' : r[k]) }); }));
    })));
    body.appendChild(h('div', { style: 'overflow:auto;max-height:280px' }, tbl));
    body.appendChild(h('p', { class: 'hint mt8', text: '미리보기 최대 8행. 파일 내용은 데이터로만 저장되며, 문장 형태의 내용이 있어도 프로그램 동작에 영향을 주지 않습니다.' }));

    openModal({
      title: '명단 가져오기',
      body: body,
      buttons: [
        { label: '취소' },
        {
          label: '기존 명단에 추가', class: 'btn-primary', onClick: function () {
            var s = state();
            s.reviewers = s.reviewers.concat(res.rows);
            s.isSample = false;
            S.relinkBranches(); S.commit();
            toast(res.rows.length + '명을 추가했습니다.', 'ok');
            ui.page = 'reviewers'; syncNav(); render();
          }
        },
        {
          label: '전체 교체', class: 'btn-danger', onClick: function () {
            var s = state();
            s.reviewers = res.rows.slice();
            s.isSample = false;
            S.relinkBranches(); S.commit();
            toast('명단을 ' + res.rows.length + '명으로 교체했습니다.', 'ok');
            ui.page = 'reviewers'; syncNav(); render();
          }
        }
      ]
    });
  }

  function syncNav() {
    $$('.navbtn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-page') === ui.page); });
    $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + ui.page); });
  }

  /* ============================================================ 예약 현황 */
  function renderBooking() {
    var wrap = $('#booking-boards');
    clear(wrap);

    var branches = ui.branch === '__unmatched' ? [] : scopedBranches();
    if (!branches.length) {
      wrap.appendChild(h('div', { class: 'panel' }, h('div', { class: 'empty', text: '표시할 지점이 없습니다. 설정에서 지점을 추가하세요.' })));
    }

    branches.forEach(function (b) {
      var dates = (b.dates || []).filter(inRange).sort();
      var times = (b.times || []).slice().sort();
      var panel = h('div', { class: 'panel' });
      var stat = S.statsFor(state().reviewers.filter(function (r) { return r.branchId === b.id; }), [b], range());

      panel.appendChild(h('div', { class: 'panel-head' }, [
        h('h2', { text: b.name }),
        h('span', { class: 'sub', text: '정원 ' + stat.capacity + ' · 예약 ' + stat.booked + ' · 잔여 ' + stat.remaining }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-sm', text: '이 지점 명단 엑셀', onclick: function () { exportBranchXlsx(b); } })
      ]));

      var bodyDiv = h('div', { class: 'panel-body tight' });
      if (!dates.length || !times.length) {
        bodyDiv.appendChild(h('div', { class: 'empty', text: '기간 내 설정된 예약 날짜/시간대가 없습니다. 설정 탭에서 등록하세요.' }));
      } else {
        var tw = h('div', { class: 'table-wrap' });
        var tbl = h('table', { class: 'slot-table' });
        tbl.appendChild(h('thead', null, h('tr', null,
          [h('th', { class: 'date-col', text: '날짜' })].concat(times.map(function (t) { return h('th', { text: t }); }))
        )));
        var tb = h('tbody');
        dates.forEach(function (d) {
          var tr = h('tr', null, [h('td', { class: 'date-col', text: S.fmtDate(d) })]);
          times.forEach(function (t) {
            var info = S.slotInfo(b, d, t);
            var cls = info.over ? 'slot-over' : (info.closed ? 'slot-closed' : 'slot-open');
            var td = h('td');
            td.appendChild(h('button', {
              class: 'slot-cell ' + cls,
              onclick: function () { ui.openSlot = { branchId: b.id, date: d, time: t }; renderBooking(); }
            }, [
              h('div', { class: 'big', text: info.over ? '초과 ' + info.over : info.label }),
              h('div', { class: 'small', text: info.booked + '/' + info.capacity })
            ]));
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        tw.appendChild(tbl);
        bodyDiv.appendChild(tw);
      }

      if (ui.openSlot && ui.openSlot.branchId === b.id) {
        bodyDiv.appendChild(h('div', { style: 'padding:12px' }, slotDetail(b, ui.openSlot.date, ui.openSlot.time)));
      }
      panel.appendChild(bodyDiv);
      wrap.appendChild(panel);
    });

    renderBookingList();
  }

  function slotDetail(b, date, time) {
    var info = S.slotInfo(b, date, time);
    var box = h('div', { class: 'slot-detail' });
    box.appendChild(h('h3', null, [
      b.name + ' · ' + S.fmtDate(date) + ' ' + time + '  ',
      h('span', { class: 'badge ' + (info.closed ? 'b-closed' : 'b-ok'), text: info.over ? '초과 ' + info.over : info.label }),
      ' ',
      h('span', { class: 'hint', text: '정원 ' + info.capacity + '명 / 예약 ' + info.booked + '명' })
    ]));

    var people = S.reviewersInSlot(b.id, date, time);
    if (!people.length) box.appendChild(h('div', { class: 'hint', text: '이 시간대에 배정된 리뷰어가 없습니다.' }));
    people.forEach(function (r) {
      var row = h('div', { class: 'person-row' });
      row.appendChild(h('span', { class: 'nm', text: r.name || '(이름 없음)' }));
      if (!masked()) row.appendChild(h('span', { class: 'hint', text: r.phone || '' }));
      var sel = h('select', {
        class: 'status-select s-' + r.status,
        onchange: function () { r.status = this.value; S.commit(); renderBooking(); }
      }, S.STATUSES.map(function (v) { return h('option', { value: v, text: v }); }));
      sel.value = r.status;
      row.appendChild(sel);
      row.appendChild(h('label', { class: 'switch' }, [
        h('input', {
          type: 'checkbox', checked: !!r.reviewRegistered,
          onchange: function () { r.reviewRegistered = this.checked; S.commit(); renderBooking(); }
        }), '리뷰등록'
      ]));
      row.appendChild(h('button', {
        class: 'btn btn-sm btn-ghost', text: '시간 비우기',
        onclick: function () { r.wishDate = ''; r.wishTime = ''; r.status = '예약전'; S.commit(); renderBooking(); }
      }));
      box.appendChild(row);
    });

    // 이 슬롯에 배정 추가
    var candidates = state().reviewers.filter(function (r) {
      return r.branchId === b.id && (!r.wishDate || !r.wishTime);
    });
    var pick = h('select', null, [h('option', { value: '', text: '배정할 리뷰어 선택…' })].concat(
      candidates.map(function (r) { return h('option', { value: r.id, text: (r.name || '(이름 없음)') + ' · ' + (r.grade || '-') + '등급' }); })
    ));
    box.appendChild(h('div', { class: 'inline-form mt8' }, [
      pick,
      h('button', {
        class: 'btn btn-sm btn-primary', text: '이 시간대에 배정',
        onclick: function () {
          var r = state().reviewers.filter(function (x) { return x.id === pick.value; })[0];
          if (!r) { toast('리뷰어를 선택하세요.', 'err'); return; }
          if (info.closed) { toast('이미 마감된 시간대입니다. 정원을 늘린 뒤 배정하세요.', 'err'); return; }
          r.wishDate = date; r.wishTime = time;
          if (r.status === '예약전' || r.status === '취소') r.status = '예약요청';
          S.commit(); renderBooking(); toast('배정했습니다.', 'ok');
        }
      }),
      h('button', { class: 'btn btn-sm btn-ghost', text: '닫기', onclick: function () { ui.openSlot = null; renderBooking(); } })
    ]));
    return box;
  }

  function renderBookingList() {
    var table = $('#booking-list');
    clear(table);
    table.appendChild(h('thead', null, h('tr', null,
      ['지점', '희망일', '시간', '리뷰어', '등급', '연락처', '상태', '리뷰등록', '잔여'].map(function (t) { return h('th', { class: 'no-sort', text: t }); })
    )));
    var rows = filteredReviewers({ ignoreUnmatched: true }).filter(function (r) { return r.wishDate || r.wishTime; });
    rows.sort(function (a, b) { return (a.wishDate + a.wishTime + a.branchName).localeCompare(b.wishDate + b.wishTime + b.branchName); });

    var tb = h('tbody');
    rows.forEach(function (r) {
      var br = S.branchById(r.branchId);
      var info = (br && r.wishDate && r.wishTime) ? S.slotInfo(br, r.wishDate, r.wishTime) : null;
      var sel = h('select', {
        class: 'status-select s-' + r.status,
        onchange: function () { r.status = this.value; S.commit(); render(); }
      }, S.STATUSES.map(function (v) { return h('option', { value: v, text: v }); }));
      sel.value = r.status;
      tb.appendChild(h('tr', { class: r.branchId ? '' : 'row-unmatched' }, [
        h('td', { text: r.branchName || '-' }),
        h('td', { text: r.wishDate ? S.fmtDate(r.wishDate) : '-' }),
        h('td', { text: r.wishTime || '-' }),
        h('td', { text: r.name || '-' }),
        h('td', { text: r.grade || '-' }),
        h('td', { text: masked() ? maskPhone(r.phone) : (r.phone || '-') }),
        h('td', null, sel),
        h('td', null, h('input', {
          type: 'checkbox', checked: !!r.reviewRegistered,
          onchange: function () { r.reviewRegistered = this.checked; S.commit(); }
        })),
        h('td', null, info
          ? h('span', { class: 'badge ' + (info.closed ? 'b-closed' : 'b-ok'), text: info.over ? '초과 ' + info.over : info.label })
          : h('span', { class: 'hint', text: '-' }))
      ]));
    });
    if (!rows.length) tb.appendChild(h('tr', null, h('td', { colspan: '9', class: 'empty', text: '조건에 맞는 예약 건이 없습니다.' })));
    table.appendChild(tb);
  }

  /* ============================================================ 공유용 일정표 */
  function shareData() {
    var branches = ui.branch === '__unmatched' ? [] : scopedBranches();
    return branches.map(function (b) {
      var dates = (b.dates || []).filter(inRange).sort();
      var times = (b.times || []).slice().sort();
      return {
        name: b.name,
        days: dates.map(function (d) {
          var slots = times.map(function (t) {
            var info = S.slotInfo(b, d, t);
            return { time: t, closed: info.closed, remaining: info.remaining };
          }).filter(function (s) { return !(ui.shareHideClosed && s.closed); });
          return { date: d, slots: slots };
        }).filter(function (day) { return day.slots.length; })
      };
    }).filter(function (b) { return b.days.length; });
  }

  function slotText(s) {
    if (s.closed) return '마감';
    return ui.shareShowCount ? '가능 ' + s.remaining + '명' : '예약 가능';
  }

  function renderShare() {
    var wrap = $('#share-preview');
    clear(wrap);
    $('#share-hide-closed').checked = ui.shareHideClosed;
    $('#share-show-count').checked = ui.shareShowCount;

    var data = shareData();
    if (!data.length) {
      wrap.appendChild(h('div', { class: 'empty', text: '표시할 일정이 없습니다. 지점·기간 선택 또는 설정의 예약 날짜/시간대를 확인하세요.' }));
      return;
    }

    var card = h('div', { class: 'share-card' });
    card.appendChild(h('h2', { text: data.length === 1 ? data[0].name : '체험단 예약 가능 일정' }));
    card.appendChild(h('div', { class: 'period', text: (ui.from || '') + ' ~ ' + (ui.to || '') }));
    card.appendChild(h('div', { class: 'share-legend' }, [
      h('span', { class: 'share-slot open', style: 'display:inline-block;padding:3px 12px', text: '가능' }),
      h('span', { class: 'share-slot closed', style: 'display:inline-block;padding:3px 12px', text: '마감' })
    ]));

    data.forEach(function (b) {
      if (data.length > 1) card.appendChild(h('h2', { style: 'font-size:19px;margin:14px 0 8px', text: b.name }));
      b.days.forEach(function (day) {
        var sec = h('div', { class: 'share-day' });
        sec.appendChild(h('div', { class: 'share-day-head', text: S.fmtDate(day.date) }));
        day.slots.forEach(function (s) {
          sec.appendChild(h('div', { class: 'share-slot ' + (s.closed ? 'closed' : 'open') }, [
            h('span', { class: 't', text: s.time }),
            h('span', { class: 's', text: slotText(s) })
          ]));
        });
        card.appendChild(sec);
      });
    });

    var note = state().settings.shareNote;
    card.appendChild(h('div', { class: 'share-foot' }, [
      h('div', { text: note || '' }),
      h('div', { text: '※ 개인정보는 포함되지 않은 공유용 화면입니다.' })
    ]));
    wrap.appendChild(card);
  }

  /* ------------------------------------------------ 일정표 이미지 (canvas) */
  function roundRect(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function buildShareCanvas() {
    var data = shareData();
    if (!data.length) return null;

    var FONT = 'Pretendard, "맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    var PAD = 34, COLW = 384, GAP = 16;
    var dayHeadH = 48, slotH = 52, slotGap = 8, dayGap = 18, branchTitleH = 42;
    var multi = data.length > 1;

    // 날짜 블록이 많으면 여러 열로 나눠 세로로 너무 길어지지 않게 한다
    var totalDays = data.reduce(function (a, b) { return a + b.days.length; }, 0);
    var cols = totalDays <= 4 ? 1 : (totalDays <= 12 ? 2 : 3);
    var W = PAD * 2 + cols * COLW + GAP * (cols - 1);

    function blockH(day) { return dayHeadH + day.slots.length * (slotH + slotGap) + dayGap; }

    // 1) 배치 계산
    var ops = [];
    var y = PAD + 54 + 30 + 42;              // 제목 + 기간 + 범례
    data.forEach(function (b) {
      if (multi) { ops.push({ t: 'branch', x: PAD, y: y, text: b.name }); y += branchTitleH; }
      var colY = [];
      for (var i = 0; i < cols; i++) colY.push(y);
      b.days.forEach(function (day) {
        var ci = 0;
        for (var i = 1; i < cols; i++) if (colY[i] < colY[ci]) ci = i;
        ops.push({ t: 'day', x: PAD + ci * (COLW + GAP), y: colY[ci], day: day });
        colY[ci] += blockH(day);
      });
      y = Math.max.apply(null, colY) + 6;
    });
    var note = state().settings.shareNote || '';
    var height = y + 24 + (note ? 26 : 0) + 26 + PAD;

    // 2) 그리기
    var scale = 2;
    var cv = document.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(height * scale);
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, height);

    var hy = PAD;
    ctx.fillStyle = '#1c2230';
    ctx.font = '800 32px ' + FONT;
    ctx.fillText(multi ? '체험단 예약 가능 일정' : data[0].name, PAD, hy + 16);
    hy += 54;
    ctx.fillStyle = '#6b7385';
    ctx.font = '600 17px ' + FONT;
    ctx.fillText((ui.from || '') + ' ~ ' + (ui.to || ''), PAD, hy);
    hy += 30;

    var lx = PAD;
    [['가능', '#e7f7ec', '#11702f', '#9ed8b1'], ['마감', '#fdecec', '#a51b1b', '#f3b6b6']].forEach(function (lg) {
      var w = 92;
      ctx.fillStyle = lg[1]; roundRect(ctx, lx, hy - 12, w, 30, 15); ctx.fill();
      ctx.strokeStyle = lg[3]; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = lg[2]; ctx.font = '800 16px ' + FONT;
      ctx.textAlign = 'center'; ctx.fillText(lg[0], lx + w / 2, hy + 3); ctx.textAlign = 'left';
      lx += w + 10;
    });

    ops.forEach(function (op) {
      if (op.t === 'branch') {
        ctx.fillStyle = '#1c2230';
        ctx.font = '800 22px ' + FONT;
        ctx.fillText(op.text, op.x, op.y + 12);
        return;
      }
      var yy = op.y;
      ctx.fillStyle = '#23293a';
      roundRect(ctx, op.x, yy, COLW, dayHeadH - 8, 10); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 22px ' + FONT;
      ctx.fillText(S.fmtDate(op.day.date), op.x + 16, yy + (dayHeadH - 8) / 2);
      yy += dayHeadH;

      op.day.slots.forEach(function (sl) {
        var bg = sl.closed ? '#fdecec' : '#e7f7ec';
        var bd = sl.closed ? '#f3b6b6' : '#9ed8b1';
        var fg = sl.closed ? '#a51b1b' : '#11702f';
        ctx.fillStyle = bg;
        roundRect(ctx, op.x, yy, COLW, slotH, 10); ctx.fill();
        ctx.strokeStyle = bd; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = fg;
        ctx.font = '800 24px ' + FONT;
        ctx.fillText(sl.time, op.x + 18, yy + slotH / 2);
        ctx.textAlign = 'right';
        ctx.font = '800 22px ' + FONT;
        ctx.fillText(slotText(sl), op.x + COLW - 18, yy + slotH / 2);
        ctx.textAlign = 'left';
        yy += slotH + slotGap;
      });
    });

    var fy = y + 6;
    ctx.strokeStyle = '#dfe3ea'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, fy); ctx.lineTo(W - PAD, fy); ctx.stroke();
    fy += 22;
    ctx.fillStyle = '#6b7385';
    ctx.font = '600 16px ' + FONT;
    if (note) { ctx.fillText(note.slice(0, 80), PAD, fy); fy += 26; }
    ctx.fillText('※ 개인정보는 포함되지 않은 공유용 일정표입니다.', PAD, fy);

    return cv;
  }

  function exportShareImage(type) {
    var cv = buildShareCanvas();
    if (!cv) { toast('내보낼 일정이 없습니다.', 'err'); return; }
    var mime = type === 'jpg' ? 'image/jpeg' : 'image/png';
    if (type === 'jpg') {
      // JPG 는 투명 배경을 지원하지 않으므로 흰 배경 위에 다시 그린다
      var flat = document.createElement('canvas');
      flat.width = cv.width; flat.height = cv.height;
      var fx = flat.getContext('2d');
      fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, flat.width, flat.height);
      fx.drawImage(cv, 0, 0);
      cv = flat;
    }
    var name = '공유용일정표_' + safeFileName(ui.branch === 'all' ? '전체지점' : (S.branchById(ui.branch) || {}).name || '지점') + '_' + stamp() + '.' + (type === 'jpg' ? 'jpg' : 'png');
    cv.toBlob(function (blob) {
      if (!blob) { toast('이미지 생성에 실패했습니다.', 'err'); return; }
      download(blob, name);
      toast('이미지를 저장했습니다.', 'ok');
    }, mime, type === 'jpg' ? 0.92 : undefined);
  }

  /* ============================================================ 설정 */
  function renderSettings() {
    var box = $('#branch-settings');
    clear(box);
    var s = state();
    if (!s.branches.length) {
      box.appendChild(h('div', { class: 'empty', text: '등록된 지점이 없습니다. 위에서 지점을 추가하세요.' }));
      return;
    }

    s.branches.forEach(function (b) {
      var card = h('div', { class: 'branch-card' });
      var count = s.reviewers.filter(function (r) { return r.branchId === b.id; }).length;

      var nameInput = h('input', {
        class: 'name', type: 'text', value: b.name,
        onchange: function () {
          var newName = S.normName(this.value);
          if (!newName) { toast('지점명을 입력하세요.', 'err'); this.value = b.name; return; }
          var dup = s.branches.some(function (x) { return x !== b && S.normKey(x.name) === S.normKey(newName); });
          if (dup) { toast('같은 이름의 지점이 이미 있습니다.', 'err'); this.value = b.name; return; }
          var old = b.name;
          b.name = newName;
          s.reviewers.forEach(function (r) { if (r.branchId === b.id || S.normKey(r.branchName) === S.normKey(old)) r.branchName = newName; });
          S.relinkBranches(); S.commit(); render();
          toast('지점명을 수정했습니다.', 'ok');
        }
      });

      card.appendChild(h('div', { class: 'bc-head' }, [
        nameInput,
        h('span', { class: 'badge b-예약확정', text: '리뷰어 ' + count + '명' }),
        h('span', { class: 'hint', text: '날짜 ' + (b.dates || []).length + '개 · 시간대 ' + (b.times || []).length + '개' }),
        h('span', { class: 'spacer', style: 'margin-left:auto' }),
        h('button', {
          class: 'btn btn-sm btn-danger', text: '지점 삭제',
          onclick: function () {
            confirmBox('"' + b.name + '" 지점을 삭제할까요? 소속 리뷰어 ' + count + '명은 삭제되지 않고 미매칭 상태가 됩니다.', function () {
              s.branches = s.branches.filter(function (x) { return x.id !== b.id; });
              S.relinkBranches(); S.commit(); render(); toast('지점을 삭제했습니다.');
            }, '삭제');
          }
        })
      ]));

      // 시간당 기본 인원
      card.appendChild(h('div', { class: 'inline-form' }, [
        h('span', { class: 'subhead', text: '시간당 기본 인원' }),
        h('input', {
          type: 'number', min: '0', step: '1', style: 'width:80px', value: String(b.defaultCapacity),
          onchange: function () { b.defaultCapacity = Math.max(0, Number(this.value) || 0); S.commit(); render(); }
        }),
        h('span', { class: 'hint', text: '각 시간대별 인원은 아래 표에서 따로 지정할 수 있습니다.' })
      ]));

      // 날짜
      card.appendChild(h('div', { class: 'subhead', text: '예약 가능 날짜' }));
      var dateChips = h('div', { class: 'chip-list' }, (b.dates || []).slice().sort().map(function (d) {
        return h('span', { class: 'chip' }, [
          S.fmtDate(d),
          h('button', {
            title: '삭제', text: '×',
            onclick: function () {
              b.dates = b.dates.filter(function (x) { return x !== d; });
              Object.keys(b.slotOverrides).forEach(function (k) { if (k.indexOf(d + '|') === 0) delete b.slotOverrides[k]; });
              S.commit(); render();
            }
          })
        ]);
      }));
      if (!(b.dates || []).length) dateChips.appendChild(h('span', { class: 'hint', text: '등록된 날짜가 없습니다.' }));
      card.appendChild(dateChips);

      var dFrom = h('input', { type: 'date', value: ui.from || S.todayStr() });
      var dTo = h('input', { type: 'date', value: ui.from || S.todayStr() });
      var skipWeekend = h('input', { type: 'checkbox' });
      card.appendChild(h('div', { class: 'inline-form' }, [
        dFrom, h('span', { class: 'hint', text: '~' }), dTo,
        h('label', { class: 'switch' }, [skipWeekend, '주말 제외']),
        h('button', {
          class: 'btn btn-sm', text: '날짜 추가',
          onclick: function () {
            var from = dFrom.value, to = dTo.value || dFrom.value;
            if (!from) { toast('시작일을 선택하세요.', 'err'); return; }
            if (to < from) { toast('종료일이 시작일보다 빠릅니다.', 'err'); return; }
            var cur = from, added = 0, guard = 0;
            while (cur <= to && guard++ < 400) {
              var wd = S.weekday(cur);
              if (!(skipWeekend.checked && (wd === '토' || wd === '일'))) {
                if (b.dates.indexOf(cur) < 0) { b.dates.push(cur); added++; }
              }
              cur = S.addDays(cur, 1);
            }
            b.dates.sort();
            S.commit(); render();
            toast(added + '개 날짜를 추가했습니다.', 'ok');
          }
        })
      ]));

      // 시간대
      card.appendChild(h('div', { class: 'subhead', text: '예약 가능 시간대' }));
      var timeChips = h('div', { class: 'chip-list' }, (b.times || []).slice().sort().map(function (t) {
        return h('span', { class: 'chip' }, [
          t,
          h('button', {
            title: '삭제', text: '×',
            onclick: function () {
              b.times = b.times.filter(function (x) { return x !== t; });
              Object.keys(b.slotOverrides).forEach(function (k) { if (k.indexOf('|' + t) === k.length - t.length - 1) delete b.slotOverrides[k]; });
              S.commit(); render();
            }
          })
        ]);
      }));
      if (!(b.times || []).length) timeChips.appendChild(h('span', { class: 'hint', text: '등록된 시간대가 없습니다.' }));
      card.appendChild(timeChips);

      var tStart = h('input', { type: 'time', value: '11:00', step: '900' });
      var tEnd = h('input', { type: 'time', value: '19:00', step: '900' });
      var tStep = h('select', null, [30, 60, 90, 120].map(function (m) {
        return h('option', { value: String(m), text: m + '분 간격', selected: m === 60 });
      }));
      tStep.value = '60';
      card.appendChild(h('div', { class: 'inline-form' }, [
        tStart, h('span', { class: 'hint', text: '~' }), tEnd, tStep,
        h('button', {
          class: 'btn btn-sm', text: '시간대 생성',
          onclick: function () {
            if (!tStart.value || !tEnd.value) { toast('시작/종료 시간을 입력하세요.', 'err'); return; }
            var toMin = function (v) { var p = v.split(':'); return Number(p[0]) * 60 + Number(p[1]); };
            var st = toMin(tStart.value), en = toMin(tEnd.value), step = Number(tStep.value);
            if (en < st) { toast('종료 시간이 시작 시간보다 빠릅니다.', 'err'); return; }
            var added = 0;
            for (var m = st; m <= en; m += step) {
              var v = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
              if (b.times.indexOf(v) < 0) { b.times.push(v); added++; }
            }
            b.times.sort(); S.commit(); render();
            toast(added + '개 시간대를 추가했습니다.', 'ok');
          }
        }),
        (function () {
          var one = h('input', { type: 'time', step: '900' });
          return h('span', { class: 'inline-form' }, [
            one,
            h('button', {
              class: 'btn btn-sm', text: '개별 추가',
              onclick: function () {
                var v = S.normalizeTime(one.value);
                if (!v) { toast('시간을 입력하세요.', 'err'); return; }
                if (b.times.indexOf(v) < 0) b.times.push(v);
                b.times.sort(); S.commit(); render();
              }
            })
          ]);
        })()
      ]));

      // 시간대별 인원 (슬롯 재정의)
      if ((b.dates || []).length && (b.times || []).length) {
        card.appendChild(h('div', { class: 'subhead', text: '시간대별 인원 (비워두면 기본 인원 ' + b.defaultCapacity + '명 적용)' }));
        var dates = b.dates.filter(inRange).sort();
        var times = b.times.slice().sort();
        var tw = h('div', { class: 'table-wrap', style: 'max-height:280px' });
        var tbl = h('table', { class: 'slot-table' });
        tbl.appendChild(h('thead', null, h('tr', null,
          [h('th', { class: 'date-col', text: '날짜' })].concat(times.map(function (t) { return h('th', { text: t }); }))
        )));
        var tb = h('tbody');
        dates.forEach(function (d) {
          var tr = h('tr', null, [h('td', { class: 'date-col', text: S.fmtDate(d) })]);
          times.forEach(function (t) {
            var key = S.slotKey(d, t);
            var val = b.slotOverrides[key];
            tr.appendChild(h('td', null, h('input', {
              type: 'number', min: '0', step: '1', style: 'width:62px',
              value: val == null ? '' : String(val),
              placeholder: String(b.defaultCapacity),
              onchange: function () {
                if (this.value === '') delete b.slotOverrides[key];
                else b.slotOverrides[key] = Math.max(0, Number(this.value) || 0);
                S.commit(); render();
              }
            })));
          });
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        tw.appendChild(tbl);
        card.appendChild(tw);
        if (!dates.length) card.appendChild(h('div', { class: 'hint', text: '선택한 기간에 해당하는 날짜가 없습니다.' }));
      }

      box.appendChild(card);
    });
  }

  function initSettings() {
    $('#btn-add-branch').addEventListener('click', function () {
      var input = $('#new-branch-name');
      var name = S.normName(input.value);
      if (!name) { toast('지점명을 입력하세요.', 'err'); return; }
      if (S.branchByName(name)) { toast('이미 등록된 지점입니다.', 'err'); return; }
      state().branches.push(S.makeBranch(name, [], [], 2));
      S.relinkBranches(); S.commit();
      input.value = '';
      render(); toast('지점을 추가했습니다.', 'ok');
    });
    $('#new-branch-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('#btn-add-branch').click();
    });

    $('#btn-load-sample').addEventListener('click', function () {
      confirmBox('현재 데이터를 모두 지우고 샘플 데이터를 불러올까요?', function () {
        S.reset(true);
        var d = defaultRange(); ui.from = d.from; ui.to = d.to;
        $('#f-from').value = ui.from; $('#f-to').value = ui.to;
        render(); toast('샘플 데이터를 불러왔습니다.', 'ok');
      }, '불러오기');
    });
    $('#btn-clear-reviewers').addEventListener('click', function () {
      confirmBox('리뷰어 명단을 모두 삭제할까요? (지점 설정은 유지됩니다)', function () {
        state().reviewers = []; S.commit(); render(); toast('명단을 비웠습니다.');
      }, '삭제');
    });
    $('#btn-reset-all').addEventListener('click', function () {
      confirmBox('지점 설정과 리뷰어 명단을 모두 삭제할까요? 되돌릴 수 없습니다.', function () {
        S.reset(false); render(); toast('초기화했습니다.');
      }, '전체 삭제');
    });

    $('#btn-restore').addEventListener('click', function () { $('#restore-input').click(); });
    $('#restore-input').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      f.text().then(function (txt) {
        try {
          S.replaceState(JSON.parse(txt));
          var d = defaultRange(); ui.from = d.from; ui.to = d.to;
          $('#f-from').value = ui.from; $('#f-to').value = ui.to;
          render(); toast('백업을 복원했습니다.', 'ok');
        } catch (e) {
          toast(e.message || '백업 파일을 읽지 못했습니다.', 'err');
        }
      });
    });
  }

  /* ============================================================ 내보내기 */
  var EXPORT_HEADERS = ['지점명', '지점매칭', '리뷰어명', '계정 URL', '연락처', '주소', '노출점수', '등급', '일 방문 수',
    '희망일', '희망시간', '예약상태', '리뷰등록', '신청메시지', '메모'];

  function reviewerRow(r) {
    return [
      r.branchName, r.branchId ? '매칭' : '미매칭', r.name, r.accountUrl, r.phone, r.address,
      r.exposureScore === '' ? '' : (isFinite(Number(r.exposureScore)) ? Number(r.exposureScore) : r.exposureScore),
      r.grade,
      r.dailyVisits === '' ? '' : (isFinite(Number(r.dailyVisits)) ? Number(r.dailyVisits) : r.dailyVisits),
      r.wishDate, r.wishTime, r.status, r.reviewRegistered ? 'Y' : 'N', r.applyMessage, r.memo
    ];
  }

  function reviewerSheet(list) {
    return [EXPORT_HEADERS].concat(list.map(reviewerRow));
  }

  function bookingSheet(branches) {
    var rows = [['지점명', '날짜', '요일', '시간', '정원', '예약', '잔여', '상태', '예약 리뷰어']];
    branches.forEach(function (b) {
      S.slotsOfBranch(b, range()).forEach(function (s) {
        var names = S.reviewersInSlot(b.id, s.date, s.time)
          .filter(function (r) { return S.isCounted(r.status); })
          .map(function (r) { return r.name + '(' + r.status + ')'; }).join(', ');
        rows.push([b.name, s.date, S.weekday(s.date), s.time, s.capacity, s.booked, s.remaining,
          s.closed ? '마감' : '가능 ' + s.remaining, names]);
      });
    });
    return rows;
  }

  function settingsSheet(branches) {
    var rows = [['지점명', '시간당 기본 인원', '예약 가능 날짜', '예약 가능 시간대', '개별 인원 지정']];
    branches.forEach(function (b) {
      var ov = Object.keys(b.slotOverrides).sort().map(function (k) { return k.replace('|', ' ') + '=' + b.slotOverrides[k]; }).join(', ');
      rows.push([b.name, b.defaultCapacity, (b.dates || []).slice().sort().join(', '), (b.times || []).slice().sort().join(', '), ov]);
    });
    return rows;
  }

  function summarySheet(branches, reviewers) {
    var rows = [['지점명', '전체 명단', '예약전', '예약요청', '예약확정', '방문완료', '취소', '리뷰등록', '정원', '예약', '잔여 예약 가능']];
    branches.forEach(function (b) {
      var st = S.statsFor(reviewers.filter(function (r) { return r.branchId === b.id; }), [b], range());
      rows.push([b.name, st.total, st.예약전, st.예약요청, st.예약확정, st.방문완료, st.취소, st.리뷰등록, st.capacity, st.booked, st.remaining]);
    });
    var un = reviewers.filter(function (r) { return !r.branchId; });
    if (un.length) {
      var us = S.statsFor(un, [], range());
      rows.push(['(미매칭 지점)', us.total, us.예약전, us.예약요청, us.예약확정, us.방문완료, us.취소, us.리뷰등록, '', '', '']);
    }
    return rows;
  }

  function exportAllXlsx() {
    var s = state();
    var blob = X.buildWorkbook([
      { name: '요약', rows: summarySheet(s.branches, s.reviewers) },
      { name: '리뷰어명단', rows: reviewerSheet(s.reviewers) },
      { name: '예약현황', rows: bookingSheet(s.branches) },
      { name: '지점설정', rows: settingsSheet(s.branches) }
    ]);
    download(blob, '리뷰어관리_전체_' + stamp() + '.xlsx');
    toast('엑셀 파일을 저장했습니다.', 'ok');
  }

  function exportBranchXlsx(b) {
    var list = state().reviewers.filter(function (r) { return r.branchId === b.id; });
    var blob = X.buildWorkbook([
      { name: '리뷰어명단', rows: reviewerSheet(list) },
      { name: '예약현황', rows: bookingSheet([b]) },
      { name: '지점설정', rows: settingsSheet([b]) }
    ]);
    download(blob, safeFileName(b.name) + '_리뷰어명단_' + stamp() + '.xlsx');
    toast('"' + b.name + '" 명단을 저장했습니다.', 'ok');
  }

  function openBranchExportModal() {
    var s = state();
    var body = h('div');
    body.appendChild(h('p', { class: 'hint', text: '지점별로 개별 엑셀 파일을 저장합니다.' }));
    s.branches.forEach(function (b) {
      var cnt = s.reviewers.filter(function (r) { return r.branchId === b.id; }).length;
      body.appendChild(h('div', { class: 'person-row' }, [
        h('span', { class: 'nm', text: b.name }),
        h('span', { class: 'hint', text: cnt + '명' }),
        h('button', { class: 'btn btn-sm', text: '엑셀 저장', onclick: function () { exportBranchXlsx(b); } }),
        h('button', {
          class: 'btn btn-sm', text: 'CSV 저장', onclick: function () {
            var list = s.reviewers.filter(function (r) { return r.branchId === b.id; });
            download(new Blob([S.toCSV(reviewerSheet(list))], { type: 'text/csv;charset=utf-8' }),
              safeFileName(b.name) + '_리뷰어명단_' + stamp() + '.csv');
          }
        })
      ]));
    });
    var un = s.reviewers.filter(function (r) { return !r.branchId; });
    if (un.length) {
      body.appendChild(h('div', { class: 'person-row' }, [
        h('span', { class: 'nm', text: '(미매칭 지점)' }),
        h('span', { class: 'hint', text: un.length + '명' }),
        h('button', {
          class: 'btn btn-sm', text: '엑셀 저장', onclick: function () {
            download(X.buildWorkbook([{ name: '미매칭명단', rows: reviewerSheet(un) }]), '미매칭지점_리뷰어명단_' + stamp() + '.xlsx');
          }
        })
      ]));
    }
    openModal({
      title: '지점별 명단 다운로드',
      body: body,
      buttons: [
        {
          label: '모든 지점 한 파일(시트 분리)', class: 'btn-primary', onClick: function () {
            var sheets = s.branches.map(function (b) {
              return { name: b.name, rows: reviewerSheet(s.reviewers.filter(function (r) { return r.branchId === b.id; })) };
            });
            if (un.length) sheets.push({ name: '미매칭', rows: reviewerSheet(un) });
            if (!sheets.length) { toast('내보낼 지점이 없습니다.', 'err'); return; }
            download(X.buildWorkbook(sheets), '리뷰어명단_지점별_' + stamp() + '.xlsx');
            toast('지점별 시트로 저장했습니다.', 'ok');
          }
        },
        { label: '닫기' }
      ]
    });
  }

  function backupJson() {
    var blob = new Blob([JSON.stringify(state(), null, 2)], { type: 'application/json' });
    download(blob, '리뷰어관리_백업_' + stamp() + '.json');
    toast('백업 파일을 저장했습니다.', 'ok');
  }

  function sampleTemplateCsv() {
    var rows = [
      ['지점명', '리뷰어명', '계정 URL', '연락처', '주소', '노출점수', '등급', '일 방문 수', '신청메시지', '메모', '희망일', '희망시간', '예약상태'],
      ['브라운도트 포항죽도점', '홍길동', 'https://blog.naver.com/example', '010-0000-0000', '경북 포항시 북구', '80', 'A', '1000', '주말 방문 희망', '', S.addDays(S.todayStr(), 3), '13:00', '예약요청']
    ];
    download(new Blob([S.toCSV(rows)], { type: 'text/csv;charset=utf-8' }), '리뷰어명단_업로드양식.csv');
  }

  function initExports() {
    $('#btn-export-all-xlsx').addEventListener('click', exportAllXlsx);
    $('#btn-export-all-csv').addEventListener('click', function () {
      download(new Blob([S.toCSV(reviewerSheet(state().reviewers))], { type: 'text/csv;charset=utf-8' }),
        '리뷰어명단_전체_' + stamp() + '.csv');
      toast('CSV 파일을 저장했습니다.', 'ok');
    });
    $('#btn-backup').addEventListener('click', backupJson);
    $('#btn-backup-2').addEventListener('click', backupJson);
    $('#btn-sample-csv').addEventListener('click', sampleTemplateCsv);
    $('#btn-export-list-xlsx').addEventListener('click', function () {
      var list = filteredReviewers();
      if (!list.length) { toast('내보낼 데이터가 없습니다.', 'err'); return; }
      download(X.buildWorkbook([{ name: '리뷰어명단', rows: reviewerSheet(list) }]), '리뷰어명단_현재목록_' + stamp() + '.xlsx');
      toast(list.length + '행을 저장했습니다.', 'ok');
    });
    $('#btn-export-branch-xlsx').addEventListener('click', openBranchExportModal);
    $('#btn-export-booking').addEventListener('click', function () {
      var branches = ui.branch === '__unmatched' ? state().branches : scopedBranches();
      download(X.buildWorkbook([
        { name: '예약현황', rows: bookingSheet(branches) },
        { name: '예약목록', rows: reviewerSheet(filteredReviewers({ ignoreUnmatched: true }).filter(function (r) { return r.wishDate || r.wishTime; })) }
      ]), '예약현황_' + stamp() + '.xlsx');
      toast('예약 현황을 저장했습니다.', 'ok');
    });
  }

  /* ============================================================ 초기화 */
  function initFilters() {
    $('#f-status').addEventListener('change', function () { ui.status = this.value; renderReviewers(); });
    $('#f-unmatched-only').addEventListener('change', function () { ui.unmatchedOnly = this.checked; renderReviewers(); });
    $('#btn-add-row').addEventListener('click', function () {
      var b = ui.branch !== 'all' && ui.branch !== '__unmatched' ? S.branchById(ui.branch) : state().branches[0];
      var r = S.makeReviewer({ branchName: b ? b.name : '', status: '예약전' });
      state().reviewers.unshift(r);
      S.relinkBranches(); S.commit(); render();
      toast('빈 행을 추가했습니다.');
    });

    $('#share-hide-closed').addEventListener('change', function () { ui.shareHideClosed = this.checked; renderShare(); });
    $('#share-show-count').addEventListener('change', function () { ui.shareShowCount = this.checked; renderShare(); });
    $('#share-note').addEventListener('input', function () {
      state().settings.shareNote = this.value; S.commit(true); renderShare();
    });
    $('#btn-share-png').addEventListener('click', function () { exportShareImage('png'); });
    $('#btn-share-jpg').addEventListener('click', function () { exportShareImage('jpg'); });
  }

  function render() {
    renderBranchSelect();
    renderGlobalNotice();
    $('#nav-count-reviewers').textContent = state().reviewers.length;
    if (ui.page === 'dashboard') renderDashboard();
    else if (ui.page === 'reviewers') renderReviewers();
    else if (ui.page === 'booking') renderBooking();
    else if (ui.page === 'share') renderShare();
    else if (ui.page === 'settings') renderSettings();
  }

  function boot() {
    S.load();
    initTopbar();
    initUpload();
    initFilters();
    initSettings();
    initExports();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.ReviewerApp = { render: render, ui: ui };
})(window);
