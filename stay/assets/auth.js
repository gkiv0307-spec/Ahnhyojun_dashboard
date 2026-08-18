/* 옆커폰 숙박 예약관리 — 세션 / 권한
 * 실제 배포 시 Auth.current() 만 사내 SSO 세션으로 교체하면 나머지 로직은 그대로 동작한다. */
(function (global) {
  'use strict';

  var MENUS = [
    { id:'dash',     href:'index.html',         icon:'📊', label:'대시보드',        roles:'*' },
    { id:'new',      href:'new.html',           icon:'➕', label:'예약 신청',       roles:'*' },
    { id:'mystay',   href:'mystay.html',        icon:'🔎', label:'내 예약 조회',    roles:'*', staffOnly:true },
    { id:'requests', href:'requests.html',      icon:'📋', label:'예약 관리',       roles:'*' },
    { id:'approve',  href:'approvals.html',     icon:'✅', label:'승인 관리',       roles:['approver','admin','booker'], grant:'canApprove' },
    { id:'settle',   href:'settlement.html',    icon:'💳', label:'정산 관리',       roles:['finance','admin','booker'] },
    { id:'lodging',  href:'lodgings.html',      icon:'🏨', label:'숙소 관리',       roles:'*', staffLabel:'숙소 안내' },
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
    decideApproval:  ['approver','admin'],   /* + canApprove 플래그 보유자 (아래 Auth.can 참고) */
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

  /* ------------------------------------------------------------------
   * 배포 모드
   *  admin : 부동산팀이 쓰는 전체 관리 시스템 (기본값)
   *  staff : 지점 직원에게 배포하는 신청 창구 — 신청 / 내 예약 조회 /
   *          숙소 안내 / 이용지침만 열려 있고 로그인이 없다.
   * 배포할 때 STAY_MODE 전역을 지정한다 (staff 로 두면 직원용):
   *   window.STAY_MODE = 'staff';
   * ------------------------------------------------------------------ */
  var STAFF_MENUS  = ['new', 'mystay', 'lodging', 'notice'];
  var STAFF_ROUTES = ['new', 'mystay', 'lodgings', 'notices'];

  var Deploy = {
    get mode(){ return global.STAY_MODE === 'staff' ? 'staff' : 'admin'; },
    isStaff: function(){ return Deploy.mode === 'staff'; },
    /** 직원용 배포에서 열려 있는 메뉴인지 */
    allowsMenu: function(id){ return !Deploy.isStaff() || STAFF_MENUS.indexOf(id) >= 0; },
    /** 직원용 배포에서 열려 있는 화면인지 (주소를 직접 쳐서 들어오는 경우 차단) */
    allowsRoute: function(page){ return !Deploy.isStaff() || STAFF_ROUTES.indexOf(page) >= 0; },
    /** 배포 모드별 첫 화면 */
    home: function(){ return Deploy.isStaff() ? 'new' : 'index'; }
  };

  /* 직원용 배포에는 로그인이 없다. 신청자가 이름·지점을 직접 입력한다. */
  var GUEST = { id:'guest', name:'', role:'applicant', branch:'', dept:'', phone:'', email:'', guest:true };

  var Auth = {
    MENUS: MENUS,
    Deploy: Deploy,
    GUEST: GUEST,
    current: function () {
      if (Deploy.isStaff()) return GUEST;
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
    /* 역할과 별개로 계정에 부여된 권한 플래그 */
    GRANTS: { decideApproval: 'canApprove' },
    can: function (action, user) {
      user = user || Auth.current();
      var rule = CAN[action];
      if (!rule) return false;
      if (rule === '*') return true;
      if (rule.indexOf(user.role) >= 0) return true;
      var g = Auth.GRANTS[action];
      return !!(g && user[g]);
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
      return MENUS.filter(function (m) {
        if (!Deploy.allowsMenu(m.id)) return false;
        if (m.staffOnly && !Deploy.isStaff()) return false;   /* '내 예약 조회'는 직원용 전용 */
        if (m.roles === '*' || m.roles.indexOf(user.role) >= 0) return true;
        return !!(m.grant && user[m.grant]);
      }).map(function (m) {
        /* 같은 화면이라도 직원용에서는 '관리'가 아니라 '안내'로 보여야 한다 */
        return (Deploy.isStaff() && m.staffLabel) ? Object.assign({}, m, { label: m.staffLabel }) : m;
      });
    }
  };

  global.Auth = Auth;
  global.Deploy = Deploy;
})(window);
