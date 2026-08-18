/* 옆커폰 숙박 예약관리 — 공통 UI (셸/배지/모달/토스트/헬퍼) */
(function (global) {
  'use strict';

  function esc(s){
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function nl2br(s){ return esc(s).replace(/\n/g,'<br>'); }
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function el(html){ var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function on(root, evt, sel, fn){
    root.addEventListener(evt, function(e){
      var t = e.target.closest(sel);
      if (t && root.contains(t)) fn.call(t, e, t);
    });
  }
  function initials(name){ return (name||'?').slice(-2); }

  var WD = ['일','월','화','수','목','금','토'];
  function dateK(s){ if (!s) return '-'; var d = new Date(s.length<=10 ? s+'T00:00:00' : s);
    return (d.getMonth()+1) + '/' + d.getDate() + '(' + WD[d.getDay()] + ')'; }
  function dateFull(s){ if (!s) return '-'; return STAY.ymd(s.length<=10 ? s+'T00:00:00' : s); }
  function dtFull(s){ if (!s) return '-'; return STAY.ymdhm(s); }
  function ago(s){
    if (!s) return '';
    var diff = (Date.now() - new Date(s).getTime())/1000;
    if (diff < 60) return '방금';
    if (diff < 3600) return Math.floor(diff/60) + '분 전';
    if (diff < 86400) return Math.floor(diff/3600) + '시간 전';
    if (diff < 86400*7) return Math.floor(diff/86400) + '일 전';
    return STAY.ymd(s);
  }
  function isToday(ds){ return ds === STAY.ymd(new Date()); }

  function badge(status){
    var s = STAY.STATUS[status];
    if (!s) return '<span class="badge">-</span>';
    return '<span class="badge b-' + status + '"><i class="d"></i>' + esc(s.label) + '</span>';
  }
  function payBadge(p){
    var k = (p && p.status) || 'PAY_NONE';
    return '<span class="badge b-' + k + '"><i class="d"></i>' + esc(STAY.PAY_STATUS[k] || '-') + '</span>';
  }

  /* ---------------- 토스트 ---------------- */
  function toast(msg, kind){
    var box = qs('.toasts');
    if (!box) { box = el('<div class="toasts"></div>'); document.body.appendChild(box); }
    var t = el('<div class="toast ' + (kind||'') + '">' +
               (kind==='ok'?'✔':kind==='bad'?'⚠':'ℹ') + ' <span>' + esc(msg) + '</span></div>');
    box.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transition='.25s'; setTimeout(function(){ t.remove(); }, 260); }, 2600);
  }

  /* ---------------- 모달 ---------------- */
  function modal(opt){
    var m = el(
      '<div class="mask"><div class="modal ' + (opt.wide?'wide':'') + '">' +
        '<div class="modal-h"><h3>' + esc(opt.title||'') + '</h3><button class="x" aria-label="닫기">×</button></div>' +
        '<div class="modal-b"></div>' +
        (opt.footer === false ? '' : '<div class="modal-f"></div>') +
      '</div></div>');
    qs('.modal-b', m).innerHTML = opt.body || '';
    var close = function(){ m.remove(); document.body.style.overflow=''; };
    qs('.x', m).onclick = close;
    m.addEventListener('mousedown', function(e){ if (e.target === m) close(); });
    document.addEventListener('keydown', function esckey(e){
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esckey); }
    });
    if (opt.footer !== false) {
      var f = qs('.modal-f', m);
      (opt.buttons || [{label:'닫기'}]).forEach(function(b){
        var btn = el('<button class="btn ' + (b.cls||'') + '">' + esc(b.label) + '</button>');
        btn.onclick = function(){ if (!b.onClick || b.onClick(m, close) !== false) { if (b.keepOpen !== true) close(); } };
        f.appendChild(btn);
      });
    }
    document.body.appendChild(m);
    document.body.style.overflow='hidden';
    if (opt.onOpen) opt.onOpen(m, close);
    return { root:m, close:close };
  }
  function confirmBox(title, msg, okLabel, danger){
    return new Promise(function(res){
      modal({
        title: title,
        body: '<p style="margin:0;font-size:14px;line-height:1.7">' + nl2br(msg) + '</p>',
        buttons: [
          { label:'취소', onClick:function(){ res(false); } },
          { label: okLabel || '확인', cls: danger ? 'btn-danger' : 'btn-primary', onClick:function(){ res(true); } }
        ]
      });
    });
  }
  function promptBox(title, label, opt){
    opt = opt || {};
    return new Promise(function(res){
      var id = 'pb_' + Math.random().toString(36).slice(2,7);
      modal({
        title: title,
        body: '<div class="field"><label>' + esc(label) + (opt.required?'<span class="req">*</span>':'') + '</label>' +
              '<textarea class="textarea" id="' + id + '" placeholder="' + esc(opt.placeholder||'') + '">' + esc(opt.value||'') + '</textarea>' +
              (opt.hint ? '<div class="hint">' + esc(opt.hint) + '</div>' : '') + '</div>',
        onOpen: function(m){ setTimeout(function(){ qs('#'+id, m).focus(); }, 30); },
        buttons: [
          { label:'취소', onClick:function(){ res(null); } },
          { label: opt.okLabel || '확인', cls: opt.danger ? 'btn-danger' : 'btn-primary', keepOpen:true,
            onClick:function(m, close){
              var v = qs('#'+id, m).value.trim();
              if (opt.required && !v) { toast('내용을 입력해주세요.', 'bad'); return false; }
              close(); res(v);
            } }
        ]
      });
    });
  }

  /* ---------------- 셸 ---------------- */
  function counters(user){
    if (Deploy.isStaff()) return { requests:0, approve:0, settle:0, noti:0, todayIn:0 };
    var list = Store.visibleBookings(user);
    var today = STAY.ymd(new Date());
    return {
      requests: list.filter(function(b){ return ['NEW','RECEIVED','REVIEWING'].indexOf(b.status)>=0; }).length,
      approve:  list.filter(function(b){ return b.status==='APPROVAL_PENDING'; }).length,
      settle:   list.filter(function(b){ return ['SETTLE_WAIT','SETTLING'].indexOf(b.status)>=0; }).length,
      noti:     Notify.unreadCount(user),
      todayIn:  list.filter(function(b){ return b.checkIn===today && ['BOOKED','UPCOMING'].indexOf(b.status)>=0; }).length
    };
  }

  function shell(activeId, title, crumb){
    /* 잠겨 있으면 화면을 그리지 않는다. 호출한 페이지 스크립트도 여기서 중단된다.
     * (번들 라우터는 이보다 먼저 검사하므로 여기까지 오지 않는다) */
    if (global.Gate && Gate.locked()) {
      Gate.render(function(){ location.reload(); });
      throw new Error('STAY_LOCKED');
    }
    var user = Auth.current();
    Store.runDailyJobs();
    var c = counters(user);
    var cntMap = { requests:c.requests, approve:c.approve, settle:c.settle, noti:c.noti };

    var nav = Auth.menus(user).map(function(m){
      var n = cntMap[m.id];
      return '<a href="' + m.href + '" class="' + (m.id===activeId?'on':'') + '">' +
             '<span class="ic">' + m.icon + '</span>' + esc(m.label) +
             (n ? '<span class="cnt">' + (n>99?'99+':n) + '</span>' : '') + '</a>';
    }).join('');

    var sidebar = el(
      '<aside class="sidebar" id="sb">' +
        '<div class="sb-brand">' +
          '<button class="sb-close" id="sbclose" aria-label="메뉴 닫기">✕</button>' +
          '<a href="index.html" class="wm">옆커폰 <em>부동산팀</em></a>' +
          '<div class="sys">숙박 예약' + (Deploy.isStaff() ? ' <em>신청</em>' : '관리 <em>시스템</em>') + '</div>' +
        '</div>' +
        '<nav class="sb-nav"><div class="sb-group">업무</div>' + nav + '</nav>' +
        '<div class="sb-foot">' +
          (Deploy.isStaff()
            ? '호텔·펜션 예약은<br>전화·카카오톡이 아닌<br><b style="color:#c6c8ce">이곳으로만</b> 신청해주세요.<br>' +
              '<a href="notices.html">이용지침 보기</a>'
            : '모든 호텔·펜션 예약은<br>이 시스템으로만 접수됩니다.<br>' +
              '<a href="notices.html">이용지침 보기</a>') +
        '</div>' +
      '</aside>');

    var topbar = el(
      '<header class="topbar">' +
        '<button class="burger" aria-label="메뉴">☰</button>' +
        '<div><h1>' + esc(title) + '</h1>' + (crumb ? '<div class="crumb">' + esc(crumb) + '</div>' : '') + '</div>' +
        '<div class="sp"></div>' +
        (Deploy.isStaff()
          ? '<span class="tag">지점 직원용 신청 창구</span>'
          : '<form class="tb-search" id="gsearch" role="search"><span>🔎</span>' +
              '<input type="search" placeholder="예약번호·신청자·숙소 검색" aria-label="통합검색"></form>' +
            '<button class="tb-icon" id="bell" aria-label="알림">🔔' + (c.noti ? '<span class="dot">' + (c.noti>9?'9+':c.noti) + '</span>' : '') + '</button>' +
            '<button class="userchip" id="uchip">' +
              '<span class="avatar">' + esc(initials(user.name)) + '</span>' +
              '<span style="text-align:left"><span class="nm">' + esc(user.name) + '</span><br>' +
              '<span class="rl">' + esc(STAY.ROLES[user.role].label) + ' · ' + esc(user.branch) + '</span></span>' +
            '</button>') +
      '</header>');

    var app = el('<div class="app"></div>');
    var main = el('<div class="main"></div>');
    var content = el('<div class="content" id="content"></div>');
    main.appendChild(topbar); main.appendChild(content);
    app.appendChild(sidebar); app.appendChild(main);
    document.body.insertBefore(app, document.body.firstChild);

    /* 모바일 사이드바 (오프캔버스) */
    function closeSb(){
      sidebar.classList.remove('open');
      qsa('.backdrop').forEach(function(x){ x.remove(); });
    }
    qs('.burger', topbar).onclick = function(){
      sidebar.classList.add('open');
      var bd = el('<div class="backdrop"></div>');
      bd.onclick = closeSb;
      document.body.appendChild(bd);
    };
    qs('#sbclose', sidebar).onclick = closeSb;
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSb();
    });
    /* 아래 세 가지는 관리용 배포에만 존재한다 */
    var chip = qs('#uchip', topbar);
    if (chip) chip.onclick = function(){ userSwitcher(); };
    var bell = qs('#bell', topbar);
    if (bell) bell.onclick = function(e){ e.stopPropagation(); notifPanel(); };
    var gs = qs('#gsearch', topbar);
    if (gs) gs.onsubmit = function(e){
      e.preventDefault();
      var v = this.querySelector('input').value.trim();
      if (v) location.href = 'requests.html?q=' + encodeURIComponent(v);
    };
    return content;
  }

  function userSwitcher(){
    var cur = Auth.current();
    var body = '<p class="muted" style="margin:0 0 12px;font-size:12.5px">' +
      '데모 환경에서는 계정을 전환해 각 권한의 화면을 확인할 수 있습니다. ' +
      '실제 운영에서는 사내 로그인 계정이 자동으로 적용됩니다.</p>';
    STAY.ROLE_ORDER.forEach(function(role){
      var us = Store.users().filter(function(u){ return u.role === role && u.active !== false; });
      if (!us.length) return;
      body += '<div class="sb-group" style="color:var(--muted);padding:0;margin:14px 0 6px;font-size:11px">' +
              esc(STAY.ROLES[role].label) + ' — ' + esc(STAY.ROLES[role].desc) + '</div>';
      body += '<div class="list" style="border:1px solid var(--line);border-radius:10px;overflow:hidden">' +
        us.map(function(u){
          return '<div class="li' + (u.id===cur.id?' unread':'') + '" data-u="' + u.id + '">' +
            '<span class="avatar">' + esc(initials(u.name)) + '</span>' +
            '<span class="tx"><span class="t1">' + esc(u.name) +
              (u.title ? ' <span class="muted" style="font-weight:600">' + esc(u.title) + '</span>' : '') +
              (u.id===cur.id?' <span class="tag gold">현재</span>':'') +
              (u.sample?' <span class="tag" style="color:var(--orange)">자리표시자</span>':'') + '</span>' +
            '<span class="t2">' + esc(u.branch) + ' · ' + esc(u.dept) + (u.duty ? ' · ' + esc(u.duty) : '') + '</span></span></div>';
        }).join('') + '</div>';
    });
    var m = modal({ title:'사용자 전환 (권한 미리보기)', body:body, buttons:[{label:'닫기'}] });
    on(m.root, 'click', '.li[data-u]', function(){
      Auth.switchTo(this.dataset.u);
      location.reload();
    });
  }

  function notifPanel(){
    var old = qs('.pop#npop'); if (old) { old.remove(); return; }
    var user = Auth.current();
    var list = Notify.listFor(user).slice(0, 30);
    var pop = el('<div class="pop" id="npop">' +
      '<div class="ph"><h4>알림</h4><span class="sp" style="margin-left:auto"></span>' +
        '<button class="btn btn-sm btn-ghost" id="allread">모두 읽음</button></div>' +
      '<div class="pb list"></div>' +
      '<div class="pf"><a class="btn btn-sm" href="notifications.html">알림센터 전체보기</a></div></div>');
    var pb = qs('.pb', pop);
    if (!list.length) pb.innerHTML = '<div class="empty"><span class="em">🔔</span>새 알림이 없습니다.</div>';
    else pb.innerHTML = list.map(function(n){
      var unread = (n.readBy||[]).indexOf(user.id) < 0;
      var meta = STAY.NOTI_TYPE[n.type] || {icon:'🔔'};
      return '<div class="li' + (unread?' unread':'') + '" data-n="' + n.id + '" data-b="' + (n.bookingId||'') + '">' +
        '<span class="ic">' + meta.icon + '</span>' +
        '<span class="tx"><span class="t1">' + esc(n.title) + '</span>' +
        '<span class="t2">' + esc((n.body||'').split('\n')[0]) + '</span></span>' +
        '<span class="rt"><span class="t2">' + ago(n.at) + '</span></span></div>';
    }).join('');
    document.querySelector('.main').appendChild(pop);
    qs('#allread', pop).onclick = function(e){ e.stopPropagation(); Notify.markAllRead(user); location.reload(); };
    on(pop, 'click', '.li[data-n]', function(){
      Notify.markRead(this.dataset.n, user);
      if (this.dataset.b) location.href = 'detail.html?id=' + this.dataset.b;
      else location.reload();
    });
    setTimeout(function(){
      document.addEventListener('click', function cl(e){
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', cl); }
      });
    }, 10);
  }

  /* ---------------- 진행 스텝바 ---------------- */
  function steps(b){
    var path = STAY.MAIN_PATH;
    var closedBad = (b.status==='CANCELED' || b.status==='REJECTED');
    var curNo = STAY.STATUS[b.status].no;
    var groups = [
      { label:'신청',   keys:['NEW'] },
      { label:'접수',   keys:['RECEIVED','REVIEWING'] },
      { label:'승인',   keys:['APPROVAL_PENDING','APPROVED'] },
      { label:'예약',   keys:['BOOKING','BOOKED'] },
      { label:'이용',   keys:['UPCOMING','USED'] },
      { label:'정산',   keys:['SETTLE_WAIT','SETTLING'] },
      { label:'완료',   keys:['SETTLED'] }
    ];
    return '<div class="steps">' + groups.map(function(g){
      var maxNo = Math.max.apply(null, g.keys.map(function(k){ return STAY.STATUS[k].no; }));
      var minNo = Math.min.apply(null, g.keys.map(function(k){ return STAY.STATUS[k].no; }));
      var cls = '';
      if (closedBad) { cls = curNo === 13 ? (minNo <= 6 ? 'done' : '') : (minNo <= 4 ? 'done' : ''); if (!cls) cls=''; }
      if (!closedBad) {
        if (curNo > maxNo) cls = 'done';
        else if (curNo >= minNo) cls = (b.status === 'SETTLED') ? 'done' : 'now';
      }
      return '<div class="step ' + cls + '"><div class="bar"></div>' + g.label + '</div>';
    }).join('') + (closedBad ? '<div class="step bad"><div class="bar"></div>' + STAY.STATUS[b.status].label + '</div>' : '') + '</div>';
  }

  /* ---------------- 기타 헬퍼 ---------------- */
  function empty(msg, icon){
    return '<div class="empty"><span class="em">' + (icon||'🗂') + '</span>' + esc(msg) + '</div>';
  }
  function optionList(obj, sel){
    return Object.keys(obj).map(function(k){
      return '<option value="' + k + '"' + (k===sel?' selected':'') + '>' + esc(obj[k]) + '</option>';
    }).join('');
  }
  /* 파일 저장. 성공/실패 안내까지 여기서 책임진다(호출부가 미리 성공을 알리지 않도록). */
  function download(filename, text, mime){
    var isCsv = /\.csv$/i.test(filename);
    var body = isCsv ? '﻿' + text : text;   /* 엑셀에서 한글이 깨지지 않도록 BOM */
    var a = document.createElement('a');
    a.href = 'data:' + (mime || (isCsv ? 'text/csv' : 'text/plain')) + ';charset=utf-8,' + encodeURIComponent(body);
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    toast(filename + ' 파일을 내려받았습니다.', 'ok');
  }
  function toCsv(rows){
    return rows.map(function(r){
      return r.map(function(c){
        c = (c === null || c === undefined) ? '' : String(c);
        return /[",\n]/.test(c) ? '"' + c.replace(/"/g,'""') + '"' : c;
      }).join(',');
    }).join('\n');
  }
  function param(k){ return new URLSearchParams(location.search).get(k) || ''; }

  global.UI = {
    esc:esc, nl2br:nl2br, qs:qs, qsa:qsa, el:el, on:on, initials:initials,
    dateK:dateK, dateFull:dateFull, dtFull:dtFull, ago:ago, isToday:isToday,
    badge:badge, payBadge:payBadge, toast:toast, modal:modal, confirm:confirmBox, prompt:promptBox,
    shell:shell, userSwitcher:userSwitcher, notifPanel:notifPanel, steps:steps,
    empty:empty, optionList:optionList, download:download, toCsv:toCsv, param:param, counters:counters
  };
})(window);
