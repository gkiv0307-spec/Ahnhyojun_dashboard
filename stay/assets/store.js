/* 옆커폰 숙박 예약관리 — 데이터 계층
 * localStorage 기반. 서버 연동 시 Store._read/_write 만 fetch 로 교체하면 된다.
 * 전역: STAY (상수), Store (데이터), Notify (알림)
 */
(function (global) {
  'use strict';

  /* =====================================================================
   * 1. 도메인 상수
   * ===================================================================== */
  var ROLES = {
    applicant: { key: 'applicant', label: '일반 신청자', short: '신청자', desc: '지점 점장·관계자. 신청/조회/수정·취소 요청' },
    booker:    { key: 'booker',    label: '예약 담당자', short: '예약담당', desc: '접수·검토·예약진행·예약완료 처리' },
    approver:  { key: 'approver',  label: '승인 담당자', short: '승인담당', desc: '비용 발생 건 승인/반려' },
    finance:   { key: 'finance',   label: '회계팀',      short: '회계',    desc: '결제확인·증빙·비용처리·정산완료' },
    admin:     { key: 'admin',     label: '관리자',      short: '관리자',  desc: '전체 시스템 관리' }
  };
  var ROLE_ORDER = ['applicant', 'booker', 'approver', 'finance', 'admin'];

  /* 14개 예약 상태 */
  var STATUS = {
    NEW:              { key:'NEW',              no:1,  label:'신규신청',   owner:'applicant', phase:'신청', icon:'📝' },
    RECEIVED:         { key:'RECEIVED',         no:2,  label:'접수완료',   owner:'booker',    phase:'접수', icon:'📥' },
    REVIEWING:        { key:'REVIEWING',        no:3,  label:'확인중',     owner:'booker',    phase:'접수', icon:'🔍' },
    APPROVAL_PENDING: { key:'APPROVAL_PENDING', no:4,  label:'승인대기',   owner:'approver',  phase:'승인', icon:'⏳' },
    APPROVED:         { key:'APPROVED',         no:5,  label:'승인완료',   owner:'booker',    phase:'승인', icon:'✅' },
    BOOKING:          { key:'BOOKING',          no:6,  label:'예약진행중', owner:'booker',    phase:'예약', icon:'📞' },
    BOOKED:           { key:'BOOKED',           no:7,  label:'예약완료',   owner:'booker',    phase:'예약', icon:'🏨' },
    UPCOMING:         { key:'UPCOMING',         no:8,  label:'이용예정',   owner:'booker',    phase:'이용', icon:'🧳' },
    USED:             { key:'USED',             no:9,  label:'이용완료',   owner:'booker',    phase:'이용', icon:'🛏' },
    SETTLE_WAIT:      { key:'SETTLE_WAIT',      no:10, label:'정산대기',   owner:'finance',   phase:'정산', icon:'💳' },
    SETTLING:         { key:'SETTLING',         no:11, label:'정산중',     owner:'finance',   phase:'정산', icon:'🧾' },
    SETTLED:          { key:'SETTLED',          no:12, label:'정산완료',   owner:'finance',   phase:'완료', icon:'🎉' },
    CANCELED:         { key:'CANCELED',         no:13, label:'취소',       owner:'-',         phase:'종료', icon:'⛔' },
    REJECTED:         { key:'REJECTED',         no:14, label:'반려',       owner:'-',         phase:'종료', icon:'🚫' }
  };
  var STATUS_ORDER = ['NEW','RECEIVED','REVIEWING','APPROVAL_PENDING','APPROVED','BOOKING','BOOKED',
                      'UPCOMING','USED','SETTLE_WAIT','SETTLING','SETTLED','CANCELED','REJECTED'];
  /* 진행 스텝바에 쓰는 정상 경로 */
  var MAIN_PATH = ['NEW','RECEIVED','REVIEWING','APPROVAL_PENDING','APPROVED','BOOKING','BOOKED',
                   'UPCOMING','USED','SETTLE_WAIT','SETTLING','SETTLED'];
  var CLOSED = ['SETTLED','CANCELED','REJECTED'];

  /* 상태 전이 정의: to -> {roles, action, need(booking)=>errorMsg|null} */
  var FLOW = {
    NEW: [
      { to:'RECEIVED',  roles:['booker','admin'],   action:'예약 접수' },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    RECEIVED: [
      { to:'REVIEWING', roles:['booker','admin'],   action:'내용 확인 시작' },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    REVIEWING: [
      { to:'APPROVAL_PENDING', roles:['booker','admin'], action:'승인 요청', need:function(b){
          if (!b.estimatedCost && !(b.reservation && b.reservation.amount)) return '예상 비용을 먼저 입력해주세요.';
          if (!b.assigneeId) return '예약 담당자를 먼저 지정해주세요.';
          return null; } },
      { to:'REJECTED',  roles:['booker','admin'],   action:'반려' },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    APPROVAL_PENDING: [
      /* grant: 역할과 별개로 이 플래그를 가진 사용자에게도 허용한다.
       * 부동산팀은 팀원 전체가 승인할 수 있어 각 계정에 canApprove 를 준다. */
      { to:'APPROVED',  roles:['approver','admin'], grant:'canApprove', action:'승인' },
      { to:'REJECTED',  roles:['approver','admin'], grant:'canApprove', action:'반려' }
    ],
    APPROVED: [
      { to:'BOOKING',   roles:['booker','admin'],   action:'숙소 예약 진행' },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    BOOKING: [
      { to:'BOOKED',    roles:['booker','admin'],   action:'예약 완료', need:function(b){
          var r = b.reservation || {};
          if (!r.confirmNo) return '숙소 예약번호를 입력해주세요.';
          if (!r.roomInfo)  return '객실정보를 입력해주세요.';
          if (!r.amount)    return '확정 예약금액을 입력해주세요.';
          return null; } },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    BOOKED: [
      { to:'UPCOMING',  roles:['booker','admin'],   action:'이용예정 전환' },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    UPCOMING: [
      { to:'USED',      roles:['booker','admin'],   action:'이용완료 처리' },
      { to:'CANCELED',  roles:['booker','admin'],   action:'예약 취소' }
    ],
    USED: [
      { to:'SETTLE_WAIT', roles:['booker','finance','admin'], action:'정산 요청' }
    ],
    SETTLE_WAIT: [
      { to:'SETTLING',  roles:['finance','admin'],  action:'정산 시작', need:function(b){
          var p = b.payment || {};
          if (!p.method)     return '결제방법을 입력해주세요.';
          if (!p.paidAmount) return '실제 결제금액을 입력해주세요.';
          if (!p.paidAt)     return '결제일을 입력해주세요.';
          return null; } }
    ],
    SETTLING: [
      { to:'SETTLED',   roles:['finance','admin'],  action:'정산 완료', need:function(b){
          var p = b.payment || {};
          if (!p.taxInvoice && !p.receipt) return '세금계산서 또는 영수증 확인이 필요합니다.';
          if (!p.financeName) return '회계 담당자를 입력해주세요.';
          return null; } }
    ],
    SETTLED: [], CANCELED: [], REJECTED: []
  };

  var LODGING_TYPE = { HOTEL:'호텔', PENSION:'펜션', ETC:'기타' };
  var OWNERSHIP    = { DIRECT:'직영(회사운영)', PARTNER:'제휴숙소' };
  var COST_BEARER  = { COMPANY:'회사 부담', BRANCH:'지점 부담', PERSONAL:'개인 부담', ETC:'기타' };
  var PAY_STATUS   = { PAY_NONE:'미정산', PAY_WAIT:'결제대기', PAY_PARTIAL:'부분결제', PAY_DONE:'결제완료' };
  var PAY_METHOD   = ['법인카드','계좌이체','현금','개인카드(후정산)','제휴숙소 월정산','기타'];
  var NOTICE_CAT   = ['예약 신청방법','담당부서','이용규정','취소규정','비용처리 기준','회사 숙소 이용방법','제휴숙소 안내','FAQ'];

  var NOTI_TYPE = {
    BOOKING_CREATED:   { label:'신규 예약 신청', icon:'📝', roles:['booker','admin'] },
    APPROVAL_REQUESTED:{ label:'승인 요청',      icon:'⏳', roles:['approver','admin'], grant:'canApprove' },
    APPROVED:          { label:'승인 완료',      icon:'✅', roles:['booker','admin'] },
    REJECTED:          { label:'반려',           icon:'🚫', roles:['booker','admin'] },
    BOOKING_CONFIRMED: { label:'예약 완료',      icon:'🏨', roles:['booker','admin'] },
    BOOKING_CHANGED:   { label:'예약 변경',      icon:'✏️', roles:['booker','admin'] },
    BOOKING_CANCELED:  { label:'예약 취소',      icon:'⛔', roles:['booker','admin'] },
    CHECKIN_TOMORROW:  { label:'체크인 전날',    icon:'🔔', roles:['booker','admin'] },
    SETTLE_WAITING:    { label:'정산대기 발생',  icon:'💳', roles:['finance','admin'] },
    INFO_REQUESTED:    { label:'추가정보 요청',  icon:'❓', roles:[] }
  };

  var STAY = {
    ROLES:ROLES, ROLE_ORDER:ROLE_ORDER, STATUS:STATUS, STATUS_ORDER:STATUS_ORDER,
    MAIN_PATH:MAIN_PATH, CLOSED:CLOSED, FLOW:FLOW,
    LODGING_TYPE:LODGING_TYPE, OWNERSHIP:OWNERSHIP, COST_BEARER:COST_BEARER,
    PAY_STATUS:PAY_STATUS, PAY_METHOD:PAY_METHOD, NOTICE_CAT:NOTICE_CAT, NOTI_TYPE:NOTI_TYPE
  };

  /* =====================================================================
   * 2. 유틸
   * ===================================================================== */
  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function ymd(d){ d = (d instanceof Date) ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function ymdhm(d){ d = (d instanceof Date) ? d : new Date(d);
    return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function addDays(d, n){ var x = new Date(d instanceof Date ? d.getTime() : new Date(d).getTime());
    x.setDate(x.getDate()+n); return x; }
  function nights(ci, co){
    if (!ci || !co) return 0;
    var a = new Date(ci+'T00:00:00'), b = new Date(co+'T00:00:00');
    var n = Math.round((b-a)/86400000);
    return n > 0 ? n : 0;
  }
  function uid(p){ return (p||'id') + '_' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
  function won(n){ if (n === null || n === undefined || n === '') return '-';
    return Number(n).toLocaleString('ko-KR') + '원'; }
  function wonShort(n){
    n = Number(n)||0;
    if (n >= 100000000) return (n/100000000).toFixed(n%100000000===0?0:1) + '억';
    if (n >= 10000) return Math.round(n/10000).toLocaleString('ko-KR') + '만';
    return n.toLocaleString('ko-KR');
  }
  STAY.ymd=ymd; STAY.ymdhm=ymdhm; STAY.addDays=addDays; STAY.nights=nights;
  STAY.uid=uid; STAY.won=won; STAY.wonShort=wonShort; STAY.pad=pad;

  /* =====================================================================
   * 3. 저장소
   * ===================================================================== */
  var KEY = 'ykp_stay_v1';
  /* 시드(숙소·구성원·공지)가 바뀌면 이 값을 올린다. 저장된 값과 다르면 다시 시드한다.
   * 미리보기에서 이미 열어본 브라우저가 옛 숙소·옛 담당자를 계속 보는 것을 막기 위함이다.
   * 서버 저장소로 옮기면 이 장치는 필요 없다. */
  var SEED_VERSION = 5;
  var db = null;

  function emptyDb(){
    return { version:1, seedVersion:SEED_VERSION, branches:[], users:[], lodgings:[], bookings:[], logs:[],
             notifications:[], notices:[], settings:{}, seq:{}, session:null };
  }
  function _read(){
    if (db) return db;
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) { db = JSON.parse(raw); }
    } catch (e) { db = null; }
    var stale = db && db.seedVersion !== SEED_VERSION;
    if (stale) console.info('[stay] 기준 정보가 갱신되어 초기 데이터를 다시 불러옵니다.');
    if (!db || !db.bookings || stale) { db = emptyDb(); seed(db); _write(); }
    return db;
  }
  function _write(){
    try { global.localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { console.warn('[stay] 저장 실패(용량 초과 가능):', e); }
    if (global.dispatchEvent) global.dispatchEvent(new CustomEvent('stay:changed'));
  }

  /* =====================================================================
   * 4. 시드 데이터 (오늘 기준 상대 날짜로 생성)
   * ===================================================================== */
  function seed(d){
    var today = new Date(); today.setHours(0,0,0,0);
    var Y = today.getFullYear();

    /* 지점 목록 — 본사(부동산팀)만 확정. 나머지는 실제 지점명 확인 전까지 샘플이다. */
    /* 확정된 지점은 본사뿐이다. 지점 명단을 받기 전까지 신청서에서는 직접 입력받고,
     * 실제로 쓰인 지점명이 다음 신청자에게 자동완성으로 제안된다. */
    d.branches = [
      { id:'br_hq', name:'본사', region:'대구' }
    ];

    /* 부동산팀 실제 구성원. 권한은 담당 업무 기준으로 배정했다.
     *   admin     고호정(대표·총괄), 문소진(부동산팀 총괄·숙박 플랫폼 관리)
     *   finance   안효준(회계 업무 전반)
     *   booker    이동현(호텔운영관리·OTA 세팅 및 관리)
     *   approver  나머지 팀원 — 전체 조회·승인은 하되 관리/정산 기능은 없다
     *   applicant 지점 담당자 — 본인·소속 지점 건만 보인다 (부동산팀 아님)
     * sample:true 인 계정은 실제 지점 담당자 정보를 받으면 교체할 자리표시자다. */
    d.users = [
      { id:'u_kho', name:'고호정', title:'실장',      role:'admin',     branch:'본사', dept:'부동산팀', phone:'010-6419-0759', email:'', active:true, canApprove:true,
        duty:'부동산에듀 대표 · 부동산팀 총괄' },
      { id:'u_msj', name:'문소진', title:'대리/팀장', role:'admin',     branch:'본사', dept:'부동산팀', phone:'010-8592-2699', email:'', active:true, canApprove:true,
        duty:'부동산팀 총괄 · 숙박 플랫폼 등록/관리 · 문의 응대 · SNS 마케팅' },
      { id:'u_ahj', name:'안효준', title:'대리',      role:'finance',   branch:'본사', dept:'부동산팀', phone:'010-8550-2699', email:'', active:true, canApprove:true,
        duty:'부동산팀 회계 업무 전반' },
      { id:'u_ldh', name:'이동현', title:'사원',      role:'booker',    branch:'본사', dept:'부동산팀', phone:'010-8347-2699', email:'', active:true, canApprove:true,
        duty:'호텔운영관리 · OTA 세팅 및 관리 · 매출 관리 · 주택 관리' },
      { id:'u_lhc', name:'이현철', title:'소장',      role:'approver', branch:'본사', dept:'부동산팀', phone:'010-7777-1976', email:'', active:true, canApprove:true,
        duty:'각 지역 가맹점 계약' },
      { id:'u_yhr', name:'유현록', title:'주임',      role:'approver', branch:'본사', dept:'부동산팀', phone:'010-8554-2699', email:'', active:true, canApprove:true,
        duty:'직영·가맹 매장 계약 관리 · 상가 매물 탐색 및 상권 분석 · 지사/점주 상담' },
      { id:'u_ljh', name:'이재환', title:'주임',      role:'approver', branch:'본사', dept:'부동산팀', phone:'010-3101-2699', email:'', active:true, canApprove:true,
        duty:'시공 현장관리 및 감리 · 자재 구매/운반 · 인테리어 디자인 · 실측' },
      { id:'u_ygh', name:'여가현', title:'사원',      role:'approver', branch:'본사', dept:'부동산팀', phone:'010-6271-2699', email:'', active:true, canApprove:true,
        duty:'부동산 인테리어 모델링 · 인테리어 견적 · 2D/3D 및 견적 관리' }
    ];

    /* 회사가 실제 운영 중인 숙소 5곳 (네이버 플레이스에서 이름·주소·전화 확인).
     * 가격·객실수·이용방법·취소규정 등 운영 정보는 담당자 확인 후 채운다. */
    d.lodgings = [
      { id:'lo_1', name:'군위 펜션 독채 스테이레브소유', type:'PENSION', ownership:'DIRECT', region:'대구',
        address:'대구 군위군 군위읍 장수길 47 (수서리 1218-1)', managerName:'', managerPhone:'',
        homepage:'https://naver.me/5bC7VCgI', rackRate:0, partnerRate:0, discountRate:0,
        roomInfo:'독채 (가족실)', usage:'', cancelPolicy:'', checkInTime:'', checkOutTime:'',
        caution:'주차 숙소 내 2대 / 외부 1대', note:'대구 도심에서 약 30분. 운영 정보 확인 필요', active:true },

      { id:'lo_2', name:'거제 펜션 풀빌라 스테이레브소유', type:'PENSION', ownership:'DIRECT', region:'경남',
        address:'경남 거제시 장목면 흥남길 36-1 (시방리 296), 1·2·3·4동', managerName:'', managerPhone:'',
        homepage:'https://naver.me/5T0y40DT', rackRate:0, partnerRate:0, discountRate:0,
        roomInfo:'풀빌라 4개동 (1·2·3·4동)', usage:'', cancelPolicy:'', checkInTime:'', checkOutTime:'',
        caution:'', note:'단체·워크숍 활용 가능. 운영 정보 확인 필요', active:true },

      { id:'lo_3', name:'스테이레브소유 김해점', type:'HOTEL', ownership:'DIRECT', region:'경남',
        address:'경남 김해시 분성로511번길 8 (어방동 1092-3)', managerName:'', managerPhone:'055-313-7979',
        homepage:'https://naver.me/5Neb8tGx', rackRate:0, partnerRate:0, discountRate:0,
        roomInfo:'', usage:'', cancelPolicy:'', checkInTime:'', checkOutTime:'',
        caution:'', note:'', active:true },

      { id:'lo_4', name:'브라운도트 포항죽도점', type:'HOTEL', ownership:'DIRECT', region:'경북',
        address:'경북 포항시 북구 죽도로40번길 51 (죽도동 95-39)', managerName:'', managerPhone:'',
        homepage:'https://naver.me/5fItzQbq', rackRate:0, partnerRate:0, discountRate:0,
        roomInfo:'', usage:'', cancelPolicy:'', checkInTime:'', checkOutTime:'',
        caution:'', note:'운영 정보 확인 필요', active:true },

      { id:'lo_5', name:'브라운도트 호텔 진주성점', type:'HOTEL', ownership:'DIRECT', region:'경남',
        address:'경남 진주시 진주대로 1136 (봉곡동 7-6), 1~6층', managerName:'', managerPhone:'0507-1305-1806',
        homepage:'https://naver.me/5MvDs47e', rackRate:0, partnerRate:0, discountRate:0,
        roomInfo:'', usage:'', cancelPolicy:'', checkInTime:'', checkOutTime:'',
        caution:'', note:'운영 정보 확인 필요', active:true }
    ];

    /* 예약 데이터는 기본적으로 비어 있다. 필요하면 관리자 화면에서 샘플을 넣는다. */
    d.bookings = [];
    d.logs = [];
    d.notifications = [];
    d.seq = {};

    /* 공지 시드 */
    var nowIso = new Date().toISOString();
    d.notices = [
      { id:uid('nc'), category:'예약 신청방법', pinned:true, author:'문소진', createdAt:nowIso, updatedAt:nowIso,
        title:'[필독] 호텔·펜션 예약은 전화·카카오톡이 아닌 이 시스템으로만 신청해주세요',
        body:'그동안 개인에게 전화·카카오톡으로 숙박 예약을 요청하면서 누락·중복 예약이 반복되었습니다.\n\n' +
             '2026년부터 모든 호텔·펜션 예약은 [예약 신청] 메뉴에서만 접수합니다.\n\n' +
             '1) 좌측 메뉴 [예약 신청] 클릭\n' +
             '2) 신청서 작성 후 제출 (체크인/체크아웃만 넣으면 숙박일수는 자동 계산됩니다)\n' +
             '3) 제출 즉시 예약번호(STAY-연도-일련번호)가 발급되고 부동산팀에 알림이 갑니다\n' +
             '4) 진행 상황은 [내 예약 조회]에서 예약번호와 신청자명으로 확인할 수 있습니다\n\n' +
             '※ 부득이하게 전화로 요청하신 경우에도 부동산팀이 시스템에 대신 등록합니다. 등록되지 않은 요청은 처리되지 않습니다.\n' +
             '   문의는 부동산팀 이동현 사원 010-8347-2699 한 곳으로 주시면 됩니다.' },
      { id:uid('nc'), category:'담당부서', pinned:true, author:'문소진', createdAt:nowIso, updatedAt:nowIso,
        title:'숙박 예약 문의는 부동산팀 한 곳으로 주세요',
        body:'숙박 예약 관련 모든 문의는 부동산팀에서 받습니다.\n\n' +
             '📞 부동산팀 대표 연락처 : 이동현 사원 010-8347-2699\n\n' +
             '접수·승인·예약·정산은 부동산팀 안에서 나눠 처리하므로,\n' +
             '어느 단계인지 몰라도 위 번호 한 곳으로 문의하시면 됩니다.\n' +
             '팀원 개개인에게 따로 연락하실 필요가 없습니다.\n\n' +
             '· 승인은 부동산팀원 누구나 할 수 있어 담당자 부재로 지연되지 않습니다.\n' +
             '· 다만 예약 신청 자체는 전화가 아니라 [예약 신청] 메뉴로 넣어주세요.\n' +
             '  전화로 주신 요청도 부동산팀이 시스템에 대신 등록하지만, 등록되지 않으면 처리·정산이 되지 않습니다.' },
      { id:uid('nc'), category:'이용규정', pinned:false, author:'고호정', createdAt:nowIso, updatedAt:nowIso,
        title:'숙박 이용 기준 및 객실 배정 규정',
        body:'· 1객실 2인 기준 배정이 원칙입니다. 1인 1객실은 팀장급 이상 또는 야간 업무 시에만 승인됩니다.\n' +
             '· 회사가 직접 운영하는 숙소를 우선 이용합니다. 지역별 운영 숙소는 [숙소 안내]에서 확인하세요.\n' +
             '· 성수기(7~8월, 연말)와 주말은 일반 예약이 많으므로 최소 2주 전에 신청해주세요.\n' +
             '· 가족 동반 숙박은 개인 부담을 원칙으로 하며, 포상 숙박은 별도 승인이 필요합니다.' },
      { id:uid('nc'), category:'취소규정', pinned:false, author:'이동현', createdAt:nowIso, updatedAt:nowIso,
        title:'예약 취소·변경 시 반드시 확인할 것',
        body:'취소·변경은 [예약 상세] 화면의 "수정 요청 / 취소 요청" 버튼으로 접수해주세요.\n\n' +
             '숙소별 취소 규정이 다르며 위약금이 발생할 수 있습니다.\n' +
             '펜션(군위·거제)은 일반 예약 손실이 커서 호텔보다 취소 조건이 엄격합니다.\n\n' +
             '※ 숙소별 정확한 취소 규정은 확인되는 대로 [숙소 안내]와 이 공지에 반영합니다.\n' +
             '   등록 전까지는 예약 담당자에게 확인 후 취소해주세요.\n\n' +
             '위약금이 발생하면 해당 지점 부담으로 처리됩니다.' },
      { id:uid('nc'), category:'비용처리 기준', pinned:false, author:'안효준', createdAt:nowIso, updatedAt:nowIso,
        title:'숙박비 비용처리·증빙 기준',
        body:'· 회사 부담 : 법인카드 결제 또는 숙소 월정산. 세금계산서는 회계팀이 직접 수취합니다.\n' +
             '· 지점 부담 : 지점 법인카드로 결제 후 [정산 관리]에 카드전표/영수증을 첨부해주세요.\n' +
             '· 개인 부담(선결제 후 정산) : 영수증 원본 이미지를 반드시 첨부해야 지급됩니다.\n' +
             '· 증빙 미첨부 건은 정산완료 처리되지 않습니다.\n' +
             '· 정산 마감은 매월 5일이며, 전월 이용분은 그때까지 증빙이 등록되어야 합니다.' },
      { id:uid('nc'), category:'회사 숙소 이용방법', pinned:false, author:'이동현', createdAt:nowIso, updatedAt:nowIso,
        title:'회사 운영 숙소 5곳 안내',
        body:'회사가 직접 운영하는 숙소입니다. 업무 목적 숙박은 이 중에서 우선 배정합니다.\n\n' +
             '· 군위 펜션 독채 스테이레브소유 — 대구 군위군 군위읍 장수길 47\n' +
             '  독채(가족실). 대구 도심에서 약 30분. 주차 숙소 내 2대 / 외부 1대\n\n' +
             '· 거제 펜션 풀빌라 스테이레브소유 — 경남 거제시 장목면 흥남길 36-1\n' +
             '  풀빌라 4개동(1·2·3·4동). 단체·워크숍 활용 가능\n\n' +
             '· 스테이레브소유 김해점 — 경남 김해시 분성로511번길 8 (055-313-7979)\n\n' +
             '· 브라운도트 포항죽도점 — 경북 포항시 북구 죽도로40번길 51\n\n' +
             '· 브라운도트 호텔 진주성점 — 경남 진주시 진주대로 1136 (0507-1305-1806)\n\n' +
             '※ 객실 수·요금·입퇴실 시간·취소 규정은 확인되는 대로 [숙소 안내]에 등록합니다.\n' +
             '   그 전까지는 예약 담당자가 숙소에 확인 후 안내드립니다.' },
      { id:uid('nc'), category:'제휴숙소 안내', pinned:false, author:'문소진', createdAt:nowIso, updatedAt:nowIso,
        title:'운영 숙소가 없는 지역 출장은 어떻게 하나요',
        body:'현재 회사 운영 숙소는 대구(군위)·경남(거제·김해·진주)·경북(포항) 5곳입니다.\n\n' +
             '이 지역 출장은 운영 숙소를 우선 이용해주세요.\n' +
             '운영 숙소가 없는 지역은 예약 신청서의 숙박 유형에서 “기타”를 고르고\n' +
             '희망 숙소를 직접 입력해주시면 예약 담당자가 확인 후 진행합니다.\n\n' +
             '※ 외부 제휴 숙소가 생기면 이 공지와 [숙소 안내]에 추가합니다.' },
      { id:uid('nc'), category:'FAQ', pinned:false, author:'문소진', createdAt:nowIso, updatedAt:nowIso,
        title:'자주 묻는 질문 (FAQ)',
        body:'Q. 급해서 전화로 요청했는데 시스템에도 넣어야 하나요?\n' +
             'A. 부동산팀이 대신 등록합니다. 다만 등록 여부는 [예약 관리]에서 직접 확인해주세요. 등록되지 않은 건은 기록이 남지 않아 정산이 불가합니다.\n\n' +
             'Q. 예약이 지금 어디까지 진행됐는지 어떻게 아나요?\n' +
             'A. [내 예약 조회]에 예약번호와 신청자명을 넣으면 진행 타임라인이 나옵니다. 누가 언제 무엇을 처리했는지 전부 표시됩니다.\n\n' +
             'Q. 승인은 누가 하나요?\n' +
             'A. 부동산팀원 누구나 승인할 수 있습니다. 담당자 부재로 승인이 밀리지 않도록 팀 전체에 권한이 있습니다.\n\n' +
             'Q. 예약번호가 두 개인데 뭐가 다른가요?\n' +
             'A. STAY-로 시작하는 것은 우리 시스템 접수번호이고, 숙소 예약번호는 호텔·펜션이 발급한 번호입니다. 체크인 시에는 숙소 예약번호를 말씀하시면 됩니다.\n\n' +
             'Q. 아이를 데려가도 되나요?\n' +
             'A. 신청서에 아동 인원을 입력해주세요. 가족 동반은 원칙적으로 개인 부담입니다.' }
    ];

    d.settings = {
      /* 모든 문의를 받는 단일 창구. 개인에게 전화가 몰리지 않도록 한 곳으로 통일한다. */
      contact: { team:'부동산팀', name:'이동현', title:'사원', phone:'010-8347-2699' },
      codePrefix: 'STAY',
      autoUpcomingDays: 7,
      approvalThreshold: 100000,
      channels: [
        { id:'inapp', label:'시스템 내부 알림', enabled:true,  builtin:true },
        { id:'kakao', label:'카카오톡 알림톡',  enabled:false, builtin:false },
        { id:'sms',   label:'문자(SMS)',        enabled:false, builtin:false },
        { id:'email', label:'이메일',           enabled:false, builtin:false },
        { id:'slack', label:'Slack',            enabled:false, builtin:false }
      ]
    };
    d.session = { userId:'u_ldh' };
  }


  /* =====================================================================
   * 4-1. 샘플 예약 데이터 (선택)
   * 실제 운영 데이터가 아니라 화면 확인·교육용이다.
   * 기본값은 '넣지 않음'이며 관리자 > 시스템 설정에서 넣고 뺄 수 있다.
   * ===================================================================== */
  function seedDemoBookings(d){
    var today = new Date(); today.setHours(0,0,0,0);
    var byId = {}; d.users.forEach(function(u){ byId[u.id]=u; });
    var loById = {}; d.lodgings.forEach(function(l){ loById[l.id]=l; });
    d.bookings = []; d.logs = []; d.notifications = []; d.seq = {};
    var seq = { };
    function code(dt){
      var y = new Date(dt).getFullYear();
      seq[y] = (seq[y]||0) + 1;
      return 'STAY-' + y + '-' + ('000' + seq[y]).slice(-4);
    }
    var rows = [
      /* 과거 완료건 (정산완료) — 월별 비용 그래프용. 최근 12개월을 고르게 덮도록 배치 */
      { off:-330, ci:-326, n:2, st:'SETTLED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:2, ad:4, ch:0, cost:330000, purpose:'거제 풀빌라 단체 워크숍', bearer:'BRANCH' },
      { off:-318, ci:-312, n:1, st:'SETTLED', u:'u_lhc', lo:'lo_3', rm:1, ad:2, ch:0, cost:142000, purpose:'김해 지역 출장 숙박', bearer:'COMPANY' },
      { off:-300, ci:-295, n:2, st:'SETTLED', u:'u_yhr', br:'대구점', lo:'lo_1', rm:1, ad:2, ch:0, cost:252000, purpose:'대구 근교 워크숍', bearer:'COMPANY' },
      { off:-286, ci:-280, n:3, st:'SETTLED', u:'u_yhr', lo:'lo_2', rm:3, ad:12, ch:0, cost:600000, purpose:'하계 포상 휴양', bearer:'COMPANY' },
      { off:-268, ci:-262, n:1, st:'SETTLED', u:'u_ygh', lo:'lo_1', rm:2, ad:4, ch:0, cost:0, purpose:'군위 독채 연수', bearer:'COMPANY' },
      { off:-252, ci:-246, n:2, st:'SETTLED', u:'u_ljh', lo:'lo_4', rm:2, ad:3, ch:0, cost:224000, purpose:'포항 지역 출장 숙박', bearer:'BRANCH' },
      { off:-238, ci:-232, n:1, st:'SETTLED', u:'u_lhc', lo:'lo_3', rm:2, ad:3, ch:0, cost:284000, purpose:'김해·부산권 고객 상담', bearer:'COMPANY' },
      { off:-220, ci:-214, n:2, st:'SETTLED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:1, ad:2, ch:0, cost:330000, purpose:'경남 지역 합동 워크숍', bearer:'BRANCH' },
      { off:-205, ci:-198, n:2, st:'SETTLED', u:'u_ljh', lo:'lo_5', rm:2, ad:9, ch:0, cost:0, purpose:'진주 지역 출장 숙박', bearer:'COMPANY' },
      { off:-190, ci:-184, n:1, st:'SETTLED', u:'u_yhr', br:'대구점', lo:'lo_1', rm:1, ad:2, ch:1, cost:126000, purpose:'대구 지점 교육 후 숙박', bearer:'COMPANY' },
      { off:-172, ci:-166, n:2, st:'SETTLED', u:'u_yhr', lo:'lo_2', rm:2, ad:8, ch:2, cost:400000, purpose:'우수사원 포상 숙박', bearer:'BRANCH' },
      { off:-158, ci:-150, n:1, st:'SETTLED', u:'u_lhc', lo:'lo_3', rm:1, ad:1, ch:0, cost:142000, purpose:'김해 물건 임장', bearer:'COMPANY' },
      { off:-140, ci:-134, n:2, st:'SETTLED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:2, ad:4, ch:0, cost:330000, purpose:'거제 단체 연수', bearer:'COMPANY' },
      { off:-126, ci:-120, n:1, st:'SETTLED', u:'u_ygh', lo:'lo_1', rm:1, ad:2, ch:0, cost:0, purpose:'신입사원 연수', bearer:'COMPANY' },
      { off:-112, ci:-106, n:2, st:'SETTLED', u:'u_ljh', lo:'lo_4', rm:1, ad:2, ch:0, cost:224000, purpose:'포항 물건 임장', bearer:'COMPANY' },
      { off:-96, ci:-92, n:2, st:'SETTLED', u:'u_yhr', br:'대구점', lo:'lo_1', rm:2, ad:3, ch:0, cost:252000, purpose:'대구 인근 임장 후 숙박', bearer:'COMPANY' },
      { off:-88, ci:-84, n:1, st:'SETTLED', u:'u_lhc', lo:'lo_3', rm:1, ad:2, ch:0, cost:142000, purpose:'부산권 업무 협의', bearer:'COMPANY' },
      { off:-70, ci:-66, n:2, st:'SETTLED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:2, ad:4, ch:0, cost:330000, purpose:'거제 풀빌라 단체 워크숍', bearer:'BRANCH' },
      { off:-64, ci:-60, n:1, st:'SETTLED', u:'u_ljh', lo:'lo_4', rm:1, ad:1, ch:0, cost:112000, purpose:'포항 고객 상담', bearer:'COMPANY' },
      { off:-58, ci:-54, n:3, st:'SETTLED', u:'u_yhr', lo:'lo_2', rm:3, ad:12, ch:0, cost:600000, purpose:'하계 포상 휴양', bearer:'COMPANY' },
      { off:-44, ci:-40, n:1, st:'SETTLED', u:'u_ygh', lo:'lo_1', rm:1, ad:2, ch:0, cost:0, purpose:'대구 근교 워크숍', bearer:'COMPANY' },
      { off:-38, ci:-34, n:2, st:'SETTLED', u:'u_yhr', br:'대구점', lo:'lo_1', rm:1, ad:2, ch:1, cost:252000, purpose:'군위 독채 연수', bearer:'COMPANY' },
      { off:-33, ci:-29, n:1, st:'SETTLED', u:'u_lhc', lo:'lo_3', rm:2, ad:3, ch:0, cost:284000, purpose:'김해 지역 출장 숙박', bearer:'COMPANY' },
      { off:-26, ci:-20, n:2, st:'SETTLED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:1, ad:2, ch:0, cost:330000, purpose:'경남 지역 합동 워크숍', bearer:'BRANCH' },
      /* 최근 진행건 */
      { off:-21, ci:-14, n:2, st:'SETTLED', u:'u_ljh', lo:'lo_5', rm:2, ad:8, ch:0, cost:0, purpose:'서부경남 임장 교육', bearer:'COMPANY' },
      { off:-16, ci:-8,  n:1, st:'SETTLED', u:'u_yhr', lo:'lo_4', rm:1, ad:1, ch:0, cost:112000, purpose:'경북 동해안 지역 출장', bearer:'COMPANY' },
      { off:-13, ci:-6,  n:2, st:'SETTLING', u:'u_yhr', br:'대구점', lo:'lo_1', rm:2, ad:4, ch:0, cost:252000, purpose:'대구 지점 교육 후 숙박', bearer:'BRANCH' },
      { off:-12, ci:-5,  n:1, st:'SETTLE_WAIT', u:'u_lhc', lo:'lo_3', rm:1, ad:2, ch:0, cost:142000, purpose:'김해·부산권 고객 상담', bearer:'COMPANY' },
      { off:-11, ci:-4,  n:1, st:'SETTLE_WAIT', u:'u_ygh', lo:'lo_1', rm:2, ad:4, ch:0, cost:0, purpose:'신입사원 연수', bearer:'COMPANY' },
      { off:-10, ci:-2,  n:2, st:'SETTLE_WAIT', u:'u_lhc', br:'부산점', lo:'lo_2', rm:2, ad:4, ch:1, cost:363000, purpose:'우수사원 포상 숙박', bearer:'COMPANY' },
      { off:-9,  ci:-1,  n:1, st:'USED', u:'u_yhr', lo:'lo_2', rm:1, ad:4, ch:2, cost:200000, purpose:'거제 단체 연수', bearer:'BRANCH' },
      /* 오늘 체크인/체크아웃 */
      { off:-8,  ci:0,   n:2, st:'UPCOMING', u:'u_yhr', br:'대구점', lo:'lo_1', rm:1, ad:2, ch:0, cost:252000, purpose:'대구 인근 임장 후 숙박', bearer:'COMPANY' },
      { off:-7,  ci:0,   n:1, st:'UPCOMING', u:'u_ljh', lo:'lo_4', rm:2, ad:3, ch:0, cost:224000, purpose:'포항 지역 출장 숙박', bearer:'BRANCH' },
      { off:-9,  ci:-1,  n:1, st:'UPCOMING', u:'u_lhc', lo:'lo_3', rm:1, ad:1, ch:0, cost:142000, purpose:'김해 물건 임장', bearer:'COMPANY' },
      /* 내일 체크인 */
      { off:-6,  ci:1,   n:2, st:'BOOKED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:2, ad:4, ch:0, cost:330000, purpose:'거제 풀빌라 단체 워크숍', bearer:'BRANCH' },
      { off:-5,  ci:3,   n:1, st:'BOOKED', u:'u_ygh', lo:'lo_1', rm:1, ad:2, ch:0, cost:0, purpose:'대구 근교 워크숍', bearer:'COMPANY' },
      { off:-4,  ci:8,   n:3, st:'BOOKING', u:'u_yhr', lo:'lo_2', rm:3, ad:14, ch:0, cost:600000, purpose:'하계 포상 휴양', bearer:'COMPANY' },
      { off:-3,  ci:12,  n:2, st:'APPROVED', u:'u_yhr', br:'대구점', lo:'lo_1', rm:2, ad:4, ch:0, cost:252000, purpose:'군위 독채 연수', bearer:'COMPANY' },
      { off:-2,  ci:14,  n:1, st:'APPROVAL_PENDING', u:'u_lhc', lo:'lo_3', rm:2, ad:3, ch:0, cost:284000, purpose:'부산권 업무 협의', bearer:'COMPANY' },
      { off:-2,  ci:16,  n:2, st:'APPROVAL_PENDING', u:'u_lhc', br:'부산점', lo:'lo_2', rm:3, ad:6, ch:0, cost:495000, purpose:'경남 지역 합동 워크숍', bearer:'COMPANY' },
      { off:-1,  ci:20,  n:2, st:'REVIEWING', u:'u_ljh', lo:'lo_5', rm:2, ad:10, ch:0, cost:0, purpose:'진주 세미나 진행', bearer:'COMPANY' },
      { off:-1,  ci:10,  n:1, st:'RECEIVED', u:'u_ygh', lo:'lo_1', rm:1, ad:2, ch:1, cost:0, purpose:'대구 지점 교육 후 숙박', bearer:'BRANCH' },
      { off:0,   ci:18,  n:2, st:'NEW', u:'u_yhr', br:'대구점', lo:'lo_1', rm:2, ad:4, ch:0, cost:252000, purpose:'신입사원 연수', bearer:'COMPANY' },
      { off:0,   ci:25,  n:1, st:'NEW', u:'u_yhr', lo:'lo_2', rm:2, ad:6, ch:2, cost:400000, purpose:'우수사원 포상 숙박', bearer:'COMPANY' },
      /* 취소/반려 */
      { off:-15, ci:-3,  n:1, st:'CANCELED', u:'u_lhc', lo:'lo_3', rm:1, ad:1, ch:0, cost:142000, purpose:'김해 지역 출장 숙박', bearer:'COMPANY' },
      { off:-18, ci:-9,  n:2, st:'REJECTED', u:'u_lhc', br:'부산점', lo:'lo_2', rm:4, ad:8, ch:0, cost:1320000, purpose:'거제 단체 연수', bearer:'COMPANY' }
    ];

    var bookers = ['u_ldh','u_msj'];

    d.bookings = rows.map(function(r, i){
      var reqAt = addDays(today, r.off); reqAt.setHours(9 + (i%8), (i*7)%60, 0, 0);
      var u = byId[r.u], lo = loById[r.lo];
      var ci = ymd(addDays(today, r.ci)), co = ymd(addDays(today, r.ci + r.n));
      var assignee = byId[bookers[i % 2]];
      var st = r.st;
      var b = {
        id: uid('bk'), code: code(reqAt),
        requestedAt: reqAt.toISOString(),
        applicantId: u.id, applicantName: u.name, branch: r.br || u.branch, dept: u.dept, phone: u.phone,
        purpose: r.purpose,
        lodgingType: lo.type, lodgingId: lo.id, lodgingName: lo.name,
        checkIn: ci, checkOut: co, nights: r.n,
        adults: r.ad, children: r.ch, guests: r.ad + r.ch, rooms: r.rm,
        guestName: u.name, guestPhone: u.phone,
        estimatedCost: r.cost, costBearer: r.bearer,
        specialRequest: i % 4 === 0 ? '가능하면 고층 금연 객실로 부탁드립니다.' : '',
        attachments: [],
        status: st,
        assigneeId: null, assigneeName: null,
        approval: { requestedAt:null, approverId:null, approverName:null, result:null, opinion:'', decidedAt:null },
        reservation: { confirmNo:'', roomInfo:'', amount:0, reservedAt:null, note:'' },
        payment: { status:'PAY_NONE', method:'', paidAmount:0, paidAt:null, taxInvoice:false, receipt:false,
                   evidence:[], financeId:null, financeName:'', settledAt:null, note:'' },
        changeRequest:null, cancelRequest:null,
        memos: [], updatedAt: reqAt.toISOString()
      };
      var order = STATUS[st].no;
      var t = new Date(reqAt);
      function step(min){ t = new Date(t.getTime() + min*60000); return t.toISOString(); }
      var logs = [];
      function log(at, user, action, memo, from, to){
        logs.push({ id:uid('lg'), at:at, bookingId:b.id, bookingCode:b.code, userId:user.id, userName:user.name,
                    role:user.role, branch:(user.id === u.id ? b.branch : user.branch),
                    action:action, from:from||null, to:to||null, memo:memo||'' });
      }
      log(reqAt.toISOString(), u, '신규 예약 신청', r.purpose, null, 'NEW');

      var terminal = (st === 'CANCELED' || st === 'REJECTED');
      var reach = terminal ? (st === 'REJECTED' ? 4 : 6) : order;

      if (reach >= 2) { b.assigneeId = assignee.id; b.assigneeName = assignee.name;
        log(step(15), assignee, '예약 접수', '담당자 배정: ' + assignee.name, 'NEW', 'RECEIVED'); }
      if (reach >= 3) log(step(25), assignee, '내용 확인 시작', '신청내용 검토', 'RECEIVED', 'REVIEWING');
      if (reach >= 4) { b.approval.requestedAt = step(30);
        log(b.approval.requestedAt, assignee, '승인 요청', '예상비용 ' + won(r.cost), 'REVIEWING', 'APPROVAL_PENDING'); }
      if (st === 'REJECTED') {
        b.approval.result = 'REJECTED'; b.approval.approverId='u_kho'; b.approval.approverName='고호정';
        b.approval.opinion = '동일 기간 타 지점 예약과 중복되며 인원 대비 객실 수가 과다합니다. 객실 수 조정 후 재신청 바랍니다.';
        b.approval.decidedAt = step(180);
        log(b.approval.decidedAt, byId['u_kho'], '반려', b.approval.opinion, 'APPROVAL_PENDING', 'REJECTED');
      } else if (reach >= 5) {
        b.approval.result = 'APPROVED'; b.approval.approverId='u_kho'; b.approval.approverName='고호정';
        b.approval.opinion = '업무 목적 확인. 승인합니다.'; b.approval.decidedAt = step(120);
        log(b.approval.decidedAt, byId['u_kho'], '승인', b.approval.opinion, 'APPROVAL_PENDING', 'APPROVED');
      }
      if (reach >= 6 && st !== 'REJECTED') log(step(40), assignee, '숙소 예약 진행', lo.name + ' 예약 문의', 'APPROVED', 'BOOKING');
      if (st === 'CANCELED') {
        b.cancelRequest = { at: step(60), reason:'출장 일정이 변경되어 취소 요청드립니다.', by:u.name, handled:true };
        log(b.cancelRequest.at, u, '예약 취소 요청', b.cancelRequest.reason, null, null);
        log(step(30), assignee, '예약 취소', '신청자 요청으로 취소 처리 (위약금 없음)', 'BOOKING', 'CANCELED');
      }
      if (reach >= 7 && !terminal) {
        b.reservation.confirmNo = (lo.ownership==='DIRECT' ? 'YKP-' : lo.name.slice(0,2)) + ymd(reqAt).replace(/-/g,'').slice(2) + '-' + ('00'+(i+1)).slice(-3);
        b.reservation.roomInfo = (((lo.roomInfo || '').split('/')[0].trim() + ' ').trimStart()) + r.rm + '실 / ' + r.n + '박';
        b.reservation.amount = r.cost;
        b.reservation.reservedAt = step(90);
        b.reservation.note = '회사 운영 숙소 배정 완료';
        log(b.reservation.reservedAt, assignee, '예약 완료',
            '예약번호 ' + b.reservation.confirmNo + ' / ' + b.reservation.roomInfo + ' / ' + won(r.cost),
            'BOOKING', 'BOOKED');
        log(step(5), assignee, '예약정보 신청자 전달', b.applicantName + '님께 예약 확정 안내 발송', null, null);
      }
      if (reach >= 8 && !terminal) log(step(60), assignee, '이용예정 전환', '체크인 ' + ci, 'BOOKED', 'UPCOMING');
      if (reach >= 9 && !terminal) {
        var usedAt = addDays(today, r.ci + r.n); usedAt.setHours(11,30,0,0);
        log(usedAt.toISOString(), assignee, '이용완료 처리', '숙박 이용 종료', 'UPCOMING', 'USED');
        t = usedAt;
      }
      if (reach >= 10 && !terminal) {
        b.payment.status = 'PAY_WAIT';
        log(step(60), assignee, '정산 요청', '회계팀 정산 요청', 'USED', 'SETTLE_WAIT');
      }
      if (reach >= 11 && !terminal) {
        b.payment.method = (i % 3 === 0) ? '계좌이체' : '법인카드';
        b.payment.paidAmount = r.cost;
        b.payment.paidAt = ymd(addDays(today, r.ci + r.n));
        b.payment.status = r.cost ? 'PAY_DONE' : 'PAY_NONE';
        b.payment.financeId='u_ahj'; b.payment.financeName='안효준';
        log(step(120), byId['u_ahj'], '정산 시작',
            '결제방법 ' + b.payment.method + ' / 결제금액 ' + won(r.cost), 'SETTLE_WAIT', 'SETTLING');
      }
      if (reach >= 12 && !terminal) {
        b.payment.taxInvoice = (i % 2 === 0);
        b.payment.receipt = true;
        b.payment.settledAt = step(24*60);
        log(b.payment.settledAt, byId['u_ahj'], '정산 완료',
            (b.payment.taxInvoice ? '세금계산서 수취 완료' : '영수증 확인 완료') + ' / 비용처리 완료', 'SETTLING', 'SETTLED');
      }
      if (i % 5 === 2) {
        b.memos.push({ at: step(10), userId:assignee.id, userName:assignee.name, role:'booker',
                       text:'숙소에 조식 포함 여부 확인 완료. 추가 비용 없음.' });
      }
      b.updatedAt = logs[logs.length-1].at;
      d.logs = d.logs.concat(logs);
      return b;
    });

    d.seq = seq;
    d.logs.sort(function(a,b){ return a.at < b.at ? 1 : -1; });

    /* 알림 시드 */
    d.notifications = [];
    var recent = d.bookings.filter(function(b){ return ['NEW','RECEIVED','APPROVAL_PENDING','SETTLE_WAIT','BOOKED'].indexOf(b.status) >= 0; });
    recent.slice(0, 9).forEach(function(b, i){
      var type = b.status === 'NEW' ? 'BOOKING_CREATED'
               : b.status === 'APPROVAL_PENDING' ? 'APPROVAL_REQUESTED'
               : b.status === 'SETTLE_WAIT' ? 'SETTLE_WAITING'
               : b.status === 'BOOKED' ? 'BOOKING_CONFIRMED' : 'BOOKING_CREATED';
      d.notifications.push({
        id: uid('nt'), at: b.updatedAt, type: type,
        title: NOTI_TYPE[type].label + ' · ' + b.code,
        body: b.branch + ' ' + b.applicantName + ' / ' + b.lodgingName + ' / ' + b.checkIn + '~' + b.checkOut,
        bookingId: b.id, roles: NOTI_TYPE[type].roles.slice(), userIds: [b.applicantId], readBy: []
      });
    });
    d.notifications.sort(function(a,b){ return a.at < b.at ? 1 : -1; });

  }

  /* =====================================================================
   * 5. Store API
   * ===================================================================== */
  var Store = {
    _read:_read, _write:_write,
    reset: function(){ try{ global.localStorage.removeItem(KEY); }catch(e){} db = null; _read(); },
    raw: function(){ return _read(); },

    /* -- 마스터 -- */
    users:    function(){ return _read().users.slice(); },
    user:     function(id){ var f = _read().users.filter(function(u){return u.id===id;}); return f[0]||null; },
    branches: function(){ return _read().branches.slice(); },
    lodgings: function(){ return _read().lodgings.slice(); },
    lodging:  function(id){ var f = _read().lodgings.filter(function(l){return l.id===id;}); return f[0]||null; },
    notices:  function(){ return _read().notices.slice().sort(function(a,b){
                  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                  return a.createdAt < b.createdAt ? 1 : -1; }); },
    settings: function(){ return _read().settings; },
    logs:     function(){ return _read().logs.slice(); },

    saveUser: function(u){
      var d = _read();
      if (u.id) { d.users = d.users.map(function(x){ return x.id===u.id ? Object.assign({}, x, u) : x; }); }
      else { u.id = uid('u'); u.active = u.active !== false; d.users.push(u); }
      _write(); return u;
    },
    removeUser: function(id){ var d=_read(); d.users = d.users.filter(function(u){return u.id!==id;}); _write(); },
    saveLodging: function(l){
      var d = _read();
      if (l.id) { d.lodgings = d.lodgings.map(function(x){ return x.id===l.id ? Object.assign({}, x, l) : x; }); }
      else { l.id = uid('lo'); l.active = l.active !== false; d.lodgings.push(l); }
      _write(); return l;
    },
    removeLodging: function(id){ var d=_read(); d.lodgings = d.lodgings.filter(function(l){return l.id!==id;}); _write(); },
    saveNotice: function(n){
      var d = _read(); var now = new Date().toISOString();
      if (n.id) { d.notices = d.notices.map(function(x){ return x.id===n.id ? Object.assign({}, x, n, {updatedAt:now}) : x; }); }
      else { n.id = uid('nc'); n.createdAt = now; n.updatedAt = now; d.notices.push(n); }
      _write(); return n;
    },
    removeNotice: function(id){ var d=_read(); d.notices = d.notices.filter(function(n){return n.id!==id;}); _write(); },
    saveSettings: function(s){ var d=_read(); d.settings = Object.assign({}, d.settings, s); _write(); },

    /* -- 예약 -- */
    bookings: function(){ return _read().bookings.slice(); },
    booking:  function(id){ var f = _read().bookings.filter(function(b){return b.id===id;}); return f[0]||null; },
    byCode:   function(code){ var f = _read().bookings.filter(function(b){return b.code===code;}); return f[0]||null; },

    /** 로그인 사용자가 볼 수 있는 예약만 (applicant = 본인 + 소속지점) */
    visibleBookings: function(user){
      var all = _read().bookings.slice();
      if (!user) return [];
      if (user.role === 'applicant') {
        return all.filter(function(b){ return b.applicantId === user.id || b.branch === user.branch; });
      }
      return all;
    },

    nextCode: function(dt){
      var d = _read(), y = new Date(dt||Date.now()).getFullYear();
      d.seq = d.seq || {};
      d.seq[y] = (d.seq[y]||0) + 1;
      return (d.settings.codePrefix||'STAY') + '-' + y + '-' + ('000'+d.seq[y]).slice(-4);
    },

    createBooking: function(input, actor){
      var d = _read();
      var now = new Date().toISOString();
      var lo = input.lodgingId ? Store.lodging(input.lodgingId) : null;
      var b = {
        id: uid('bk'), code: Store.nextCode(now), requestedAt: input.requestedAt || now,
        applicantId: input.applicantId || actor.id, applicantName: input.applicantName || actor.name,
        branch: input.branch || actor.branch, dept: input.dept || actor.dept, phone: input.phone || actor.phone,
        purpose: input.purpose || '',
        lodgingType: input.lodgingType || 'HOTEL',
        lodgingId: input.lodgingId || null,
        lodgingName: input.lodgingName || (lo ? lo.name : ''),
        checkIn: input.checkIn, checkOut: input.checkOut,
        nights: nights(input.checkIn, input.checkOut),
        adults: Number(input.adults)||0, children: Number(input.children)||0,
        guests: (Number(input.adults)||0) + (Number(input.children)||0),
        rooms: Number(input.rooms)||1,
        guestName: input.guestName || '', guestPhone: input.guestPhone || '',
        estimatedCost: Number(input.estimatedCost)||0,
        costBearer: input.costBearer || 'COMPANY',
        specialRequest: input.specialRequest || '',
        attachments: input.attachments || [],
        status: 'NEW',
        assigneeId: null, assigneeName: null,
        approval: { requestedAt:null, approverId:null, approverName:null, result:null, opinion:'', decidedAt:null },
        reservation: { confirmNo:'', roomInfo:'', amount:0, reservedAt:null, note:'' },
        payment: { status:'PAY_NONE', method:'', paidAmount:0, paidAt:null, taxInvoice:false, receipt:false,
                   evidence:[], financeId:null, financeName:'', settledAt:null, note:'' },
        changeRequest:null, cancelRequest:null, memos:[], updatedAt: now,
        proxyBy: input.proxyBy || null   /* 전화/카톡 요청을 담당자가 대신 등록한 경우 */
      };
      d.bookings.push(b);
      Store.log(b, actor, '신규 예약 신청', (b.proxyBy ? '['+b.proxyBy+' 접수 대행] ' : '') + (b.purpose||''), null, 'NEW');
      _write();
      Notify.send('BOOKING_CREATED', b, actor);
      return b;
    },

    /** 필드 부분 수정 + 변경 내역 로그 */
    updateBooking: function(id, patch, actor, action, memo){
      var d = _read();
      var idx = -1; d.bookings.forEach(function(b,i){ if (b.id===id) idx = i; });
      if (idx < 0) return null;
      var b = d.bookings[idx];
      var before = JSON.parse(JSON.stringify(b));
      deepAssign(b, patch);
      if (b.checkIn && b.checkOut) b.nights = nights(b.checkIn, b.checkOut);
      b.guests = (Number(b.adults)||0) + (Number(b.children)||0);
      b.updatedAt = new Date().toISOString();
      var diff = diffFields(before, b);
      Store.log(b, actor, action || '정보 수정', memo || diff, null, null);
      _write();
      return b;
    },

    /** 상태 전이 — 권한/필수값 검증 + 로그 + 알림 */
    canTransition: function(b, to, user){
      if (!b || !user) return { ok:false, msg:'대상이 없습니다.' };
      var opts = FLOW[b.status] || [];
      var hit = null; opts.forEach(function(o){ if (o.to === to) hit = o; });
      if (!hit) return { ok:false, msg:STATUS[b.status].label + ' → ' + STATUS[to].label + ' 로는 변경할 수 없습니다.' };
      var byRole  = hit.roles.indexOf(user.role) >= 0;
      var byGrant = !!(hit.grant && user[hit.grant]);
      if (!byRole && !byGrant) {
        return { ok:false, msg:'이 처리는 ' + hit.roles.map(function(r){ return ROLES[r].label; }).join(' / ') +
                 (hit.grant === 'canApprove' ? ' 또는 승인 권한을 가진 부동산팀원' : '') + '만 가능합니다.' };
      }
      if (hit.need) { var e = hit.need(b); if (e) return { ok:false, msg:e }; }
      return { ok:true, opt:hit };
    },

    transition: function(id, to, user, memo, extraPatch){
      var b = Store.booking(id);
      var chk = Store.canTransition(b, to, user);
      if (!chk.ok) return chk;
      var d = _read();
      d.bookings.forEach(function(x){
        if (x.id !== id) return;
        if (extraPatch) deepAssign(x, extraPatch);
        var from = x.status;
        x.status = to;
        x.updatedAt = new Date().toISOString();
        if (to === 'APPROVAL_PENDING') x.approval.requestedAt = x.updatedAt;
        if (to === 'APPROVED')  { x.approval.result='APPROVED'; x.approval.approverId=user.id;
                                  x.approval.approverName=user.name; x.approval.decidedAt=x.updatedAt;
                                  if (memo) x.approval.opinion = memo; }
        if (to === 'REJECTED')  { x.approval.result='REJECTED'; x.approval.approverId=user.id;
                                  x.approval.approverName=user.name; x.approval.decidedAt=x.updatedAt;
                                  if (memo) x.approval.opinion = memo; }
        if (to === 'BOOKED' && !x.reservation.reservedAt) x.reservation.reservedAt = x.updatedAt;
        if (to === 'SETTLE_WAIT' && x.payment.status === 'PAY_NONE') x.payment.status = 'PAY_WAIT';
        if (to === 'SETTLED') { x.payment.settledAt = x.updatedAt; if (x.payment.paidAmount) x.payment.status = 'PAY_DONE'; }
        if (to === 'CANCELED' && x.cancelRequest) x.cancelRequest.handled = true;
        Store.log(x, user, chk.opt.action, memo || '', from, to);
        b = x;
      });
      _write();
      var evt = { APPROVAL_PENDING:'APPROVAL_REQUESTED', APPROVED:'APPROVED', REJECTED:'REJECTED',
                  BOOKED:'BOOKING_CONFIRMED', CANCELED:'BOOKING_CANCELED', SETTLE_WAIT:'SETTLE_WAITING' }[to];
      if (evt) Notify.send(evt, b, user, memo);
      return { ok:true, booking:b };
    },

    addMemo: function(id, text, user){
      var d = _read(), hit = null;
      d.bookings.forEach(function(b){
        if (b.id !== id) return;
        b.memos.push({ at:new Date().toISOString(), userId:user.id, userName:user.name, role:user.role, text:text });
        b.updatedAt = new Date().toISOString();
        Store.log(b, user, '메모 작성', text, null, null);
        hit = b;
      });
      _write(); return hit;
    },

    requestChange: function(id, kind, reason, user){
      var d = _read(), hit=null;
      d.bookings.forEach(function(b){
        if (b.id !== id) return;
        var rec = { at:new Date().toISOString(), reason:reason, by:user.name, handled:false };
        if (kind === 'cancel') b.cancelRequest = rec; else b.changeRequest = rec;
        b.updatedAt = rec.at;
        Store.log(b, user, kind==='cancel' ? '예약 취소 요청' : '예약 수정 요청', reason, null, null);
        hit = b;
      });
      _write();
      if (hit) Notify.send(kind==='cancel' ? 'BOOKING_CANCELED' : 'BOOKING_CHANGED', hit, user, reason, true);
      return hit;
    },

    log: function(b, user, action, memo, from, to){
      var d = _read();
      d.logs.unshift({ id:uid('lg'), at:new Date().toISOString(), bookingId:b.id, bookingCode:b.code,
                       userId:user.id, userName:user.name, role:user.role, branch:user.branch,
                       action:action, from:from||null, to:to||null, memo:memo||'' });
      if (d.logs.length > 3000) d.logs.length = 3000;
    },
    bookingLogs: function(bookingId){
      return _read().logs.filter(function(l){ return l.bookingId === bookingId; })
                   .sort(function(a,b){ return a.at < b.at ? -1 : 1; });
    },

    /** 샘플 예약 데이터를 채운다 (화면 확인·교육용). 기존 예약은 모두 대체된다. */
    loadDemoBookings: function(){
      var d = _read();
      seedDemoBookings(d);
      _write();
      return d.bookings.length;
    },
    /** 예약·처리로그·알림을 전부 비운다. 숙소·구성원·공지·설정은 유지된다. */
    clearBookings: function(){
      var d = _read();
      d.bookings = []; d.logs = []; d.notifications = []; d.seq = {};
      _write();
    },

    /* -- 체크인 전날 알림 자동 생성 (진입 시 1회) -- */
    runDailyJobs: function(){
      var d = _read(), tomorrow = ymd(addDays(new Date(), 1)), made = 0;
      d.bookings.forEach(function(b){
        if (['BOOKED','UPCOMING'].indexOf(b.status) < 0) return;
        if (b.checkIn !== tomorrow) return;
        var dup = d.notifications.some(function(n){ return n.type==='CHECKIN_TOMORROW' && n.bookingId===b.id; });
        if (dup) return;
        Notify.send('CHECKIN_TOMORROW', b, null, '내일 체크인 예정입니다.');
        made++;
      });
      if (made) _write();
      return made;
    }
  };

  function deepAssign(target, patch){
    Object.keys(patch).forEach(function(k){
      var v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
        deepAssign(target[k], v);
      } else { target[k] = v; }
    });
    return target;
  }
  var FIELD_LABEL = {
    checkIn:'체크인', checkOut:'체크아웃', rooms:'객실 수', adults:'성인', children:'아동',
    estimatedCost:'예상비용', lodgingName:'숙소', purpose:'이용목적', assigneeName:'담당자',
    guestName:'예약자명', guestPhone:'예약자 연락처', specialRequest:'특별요청', costBearer:'비용구분',
    'reservation.confirmNo':'숙소 예약번호', 'reservation.roomInfo':'객실정보', 'reservation.amount':'예약금액',
    'payment.method':'결제방법', 'payment.paidAmount':'실결제금액', 'payment.paidAt':'결제일',
    'payment.taxInvoice':'세금계산서', 'payment.receipt':'영수증', 'payment.financeName':'회계담당자'
  };
  function diffFields(a, b){
    var out = [];
    Object.keys(FIELD_LABEL).forEach(function(path){
      var av = path.split('.').reduce(function(o,k){ return o ? o[k] : undefined; }, a);
      var bv = path.split('.').reduce(function(o,k){ return o ? o[k] : undefined; }, b);
      if (av === undefined && bv === undefined) return;
      if (String(av) !== String(bv)) out.push(FIELD_LABEL[path] + ': ' + fmtVal(av) + ' → ' + fmtVal(bv));
    });
    return out.join(' / ');
  }
  function fmtVal(v){
    if (v === true) return '확인';
    if (v === false) return '미확인';
    if (v === null || v === undefined || v === '') return '(없음)';
    return String(v);
  }
  Store.diffFields = diffFields;

  /* =====================================================================
   * 6. 알림 (확장 가능 어댑터 구조)
   * ===================================================================== */
  var Notify = {
    /** 채널 어댑터. 새 채널은 여기에 push 만 하면 된다.
     *  { id, label, send(notification, booking) } */
    channels: [
      { id:'inapp', label:'시스템 내부 알림', send:function(n){
          var d = _read(); d.notifications.unshift(n);
          if (d.notifications.length > 500) d.notifications.length = 500;
        } }
      /* 예) { id:'kakao', label:'카카오톡', send:function(n,b){ fetch('/api/stay/notify/kakao',{method:'POST',body:JSON.stringify(n)}); } } */
    ],
    enabledChannels: function(){
      var conf = _read().settings.channels || [];
      return Notify.channels.filter(function(c){
        var f = conf.filter(function(x){ return x.id === c.id; })[0];
        return !f || f.enabled;
      });
    },
    send: function(type, booking, actor, memo, silentStore){
      var meta = NOTI_TYPE[type] || { label:type, icon:'🔔', roles:[] };
      var n = {
        id: uid('nt'), at: new Date().toISOString(), type: type,
        title: meta.label + ' · ' + booking.code,
        body: booking.branch + ' ' + booking.applicantName + ' / ' + booking.lodgingName +
              ' / ' + booking.checkIn + '~' + booking.checkOut + (memo ? '\n' + memo : ''),
        bookingId: booking.id,
        roles: meta.roles.slice(),
        userIds: [booking.applicantId].concat(booking.assigneeId ? [booking.assigneeId] : []),
        readBy: actor ? [actor.id] : []
      };
      /* 신청자에게도 결과를 알려야 하는 이벤트 */
      if (['APPROVED','REJECTED','BOOKING_CONFIRMED','BOOKING_CANCELED','CHECKIN_TOMORROW'].indexOf(type) >= 0) {
        n.roles = n.roles.concat(['applicant']);
      }
      if (meta.grant) n.grant = meta.grant;
      Notify.enabledChannels().forEach(function(c){ try { c.send(n, booking); } catch(e){ console.warn('[notify]', c.id, e); } });
      if (!silentStore) _write();
      return n;
    },
    listFor: function(user){
      if (!user) return [];
      return _read().notifications.filter(function(n){
        if (user.role === 'admin') return true;
        if (n.userIds && n.userIds.indexOf(user.id) >= 0) return true;
        if (n.grant && user[n.grant]) return true;
        return (n.roles || []).indexOf(user.role) >= 0;
      });
    },
    unreadCount: function(user){
      return Notify.listFor(user).filter(function(n){ return (n.readBy||[]).indexOf(user.id) < 0; }).length;
    },
    markRead: function(id, user){
      var d = _read();
      d.notifications.forEach(function(n){
        if (n.id !== id) return;
        n.readBy = n.readBy || [];
        if (n.readBy.indexOf(user.id) < 0) n.readBy.push(user.id);
      });
      _write();
    },
    markAllRead: function(user){
      var d = _read();
      Notify.listFor(user).forEach(function(n){
        n.readBy = n.readBy || [];
        if (n.readBy.indexOf(user.id) < 0) n.readBy.push(user.id);
      });
      _write();
    }
  };

  global.STAY = STAY;
  global.Store = Store;
  global.Notify = Notify;
})(window);
