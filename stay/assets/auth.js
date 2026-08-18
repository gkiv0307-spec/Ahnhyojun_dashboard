/* 옆커폰 숙박 예약관리 — 세션 / 권한
 * 실제 배포 시 Auth.current() 만 사내 SSO 세션으로 교체하면 나머지 로직은 그대로 동작한다. */
(function (global) {
  'use strict';

  var MENUS = [
    { id:'dash',     href:'index.html',         icon:'📊', label:'대시보드',        roles:'*' },
    { id:'new',      href:'new.html',           icon:'➕', label:'예약 신청',       roles:'*' },
    { id:'requests', href:'requests.html',      icon:'📋', label:'예약 관리',       roles:'*' },
    { id:'approve',  href:'approvals.html',     icon:'✅', label:'승인 관리',       roles:['approver','admin','booker'] },
    { id:'settle',   href:'settlement.html',    icon:'💳', label:'정산 관리',       roles:['finance','admin','booker'] },
    { id:'lodging',  href:'lodgings.html',      icon:'🏨', label:'숙소 관리',       roles:'*' },
    { id:'noti',     href:'notifications.html', icon:'🔔', label:'알림센터',        roles:'*' },
    { id:'notice',   href:'notices.html',       icon:'📢', label:'공지·이용지침',   roles:'*' },
    { id:'admin',    href:'admin.html',         icon:'⚙️', label:'관리자',          roles:['admin'] }
  ];

  /* 행위 권한 매트릭스 */
  var CAN = {
    createBooking:   '*',
    receive:         ['booker','admin'],
    requestInfo:     ['booker','admin'],
    requestApproval: ['booker','admin'],
    decideApproval:  ['approver','admin'],
    doReservation:   ['booker','admin'],
    editReservation: ['booker','admin'],
    cancelBooking:   ['booker','admin'],
    markUsed:        ['booker','admin'],
    settle:          ['finance','admin'],
    assign:          ['booker','admin'],
    memo:            '*',
    manageLodging:   ['booker','admin'],
    manageNotice:    ['admin'],
    manageUser:      ['admin'],
    viewAllLogs:     ['admin'],
    settings:        ['admin']
  };

  var Auth = {
    MENUS: MENUS,
    current: function () {
      var d = Store.raw();
      var id = (d.session && d.session.userId) || 'u_bk1';
      return Store.user(id) || Store.users()[0];
    },
    switchTo: function (userId) {
      var d = Store.raw();
      d.session = { userId: userId };
      Store._write();
    },
    role: function () { var u = Auth.current(); return u ? u.role : null; },
    roleLabel: function (r) { return (STAY.ROLES[r || Auth.role()] || {}).label || '-'; },
    is: function (r) { return Auth.role() === r; },
    can: function (action, user) {
      user = user || Auth.current();
      var rule = CAN[action];
      if (!rule) return false;
      if (rule === '*') return true;
      return rule.indexOf(user.role) >= 0;
    },
    /** 예약 1건에 대한 접근 가능 여부 */
    canSee: function (b, user) {
      user = user || Auth.current();
      if (!b) return false;
      if (user.role !== 'applicant') return true;
      return b.applicantId === user.id || b.branch === user.branch;
    },
    /** 신청자가 본인 건에 대해 요청(수정/취소)을 낼 수 있는지 */
    canRequestChange: function (b, user) {
      user = user || Auth.current();
      if (!b) return false;
      if (STAY.CLOSED.indexOf(b.status) >= 0) return false;
      if (user.role === 'applicant') return b.applicantId === user.id || b.branch === user.branch;
      return true;
    },
    menus: function (user) {
      user = user || Auth.current();
      return MENUS.filter(function (m) { return m.roles === '*' || m.roles.indexOf(user.role) >= 0; });
    }
  };

  global.Auth = Auth;
})(window);
