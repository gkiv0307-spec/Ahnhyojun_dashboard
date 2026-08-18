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
      { to:'APPROVED',  roles:['approver','admin'], action:'승인' },
      { to:'REJECTED',  roles:['approver','admin'], action:'반려' }
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
    APPROVAL_REQUESTED:{ label:'승인 요청',      icon:'⏳', roles:['approver','admin'] },
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
  var db = null;

  function emptyDb(){
    return { version:1, branches:[], users:[], lodgings:[], bookings:[], logs:[],
             notifications:[], notices:[], settings:{}, seq:{}, session:null };
  }
  function _read(){
    if (db) return db;
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) { db = JSON.parse(raw); }
    } catch (e) { db = null; }
    if (!db || !db.bookings) { db = emptyDb(); seed(db); _write(); }
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

    d.branches = [
      { id:'br_hq',   name:'본사',       region:'대구' },
      { id:'br_dg',   name:'대구점',     region:'대구' },
      { id:'br_ss',   name:'수성점',     region:'대구' },
      { id:'br_bs',   name:'부산점',     region:'부산' },
      { id:'br_sl',   name:'서울강남점', region:'서울' },
      { id:'br_gj',   name:'광주점',     region:'광주' },
      { id:'br_dj',   name:'대전점',     region:'대전' }
    ];

    d.users = [
      { id:'u_admin', name:'안효준', role:'admin',     branch:'본사',   dept:'경영지원팀',  phone:'010-1000-0001', email:'admin@ykphone.co.kr', active:true },
      { id:'u_bk1',   name:'박서연', role:'booker',    branch:'본사',   dept:'예약관리팀',  phone:'010-2000-0001', email:'booking1@ykphone.co.kr', active:true },
      { id:'u_bk2',   name:'정민호', role:'booker',    branch:'본사',   dept:'예약관리팀',  phone:'010-2000-0002', email:'booking2@ykphone.co.kr', active:true },
      { id:'u_ap1',   name:'이재훈', role:'approver',  branch:'본사',   dept:'경영지원팀',  phone:'010-3000-0001', email:'approve@ykphone.co.kr', active:true },
      { id:'u_fi1',   name:'최유진', role:'finance',   branch:'본사',   dept:'회계팀',      phone:'010-4000-0001', email:'finance@ykphone.co.kr', active:true },
      { id:'u_ap2',   name:'김도현', role:'applicant', branch:'대구점', dept:'영업',        phone:'010-5000-0001', email:'dg@ykphone.co.kr', active:true },
      { id:'u_ap3',   name:'한지수', role:'applicant', branch:'부산점', dept:'영업',        phone:'010-5000-0002', email:'bs@ykphone.co.kr', active:true },
      { id:'u_ap4',   name:'오세훈', role:'applicant', branch:'서울강남점', dept:'영업',    phone:'010-5000-0003', email:'sl@ykphone.co.kr', active:true },
      { id:'u_ap5',   name:'배수민', role:'applicant', branch:'광주점', dept:'영업',        phone:'010-5000-0004', email:'gj@ykphone.co.kr', active:true },
      { id:'u_ap6',   name:'신동욱', role:'applicant', branch:'대전점', dept:'교육',        phone:'010-5000-0005', email:'dj@ykphone.co.kr', active:true },
      { id:'u_ap7',   name:'류하늘', role:'applicant', branch:'수성점', dept:'영업',        phone:'010-5000-0006', email:'ss@ykphone.co.kr', active:true }
    ];

    d.lodgings = [
      { id:'lo_1', name:'옆커폰 수성 게스트하우스', type:'PENSION', ownership:'DIRECT', region:'대구',
        address:'대구광역시 수성구 두산동 207-5', managerName:'김관리', managerPhone:'053-281-0759',
        homepage:'', rackRate:120000, partnerRate:0, discountRate:100,
        roomInfo:'2인실 4실 / 4인실 2실 (총 6실, 최대 20인)', usage:'본사 예약관리팀에 신청 → 배정 후 도어락 번호 발송',
        cancelPolicy:'이용 1일 전까지 무료 취소. 당일 취소 시 청소비 3만원 부과', checkInTime:'15:00', checkOutTime:'11:00',
        caution:'회사 직영 숙소로 숙박비는 무료이며 청소비만 지점 부담', note:'주차 6대 가능', active:true },
      { id:'lo_2', name:'인터불고 호텔 대구', type:'HOTEL', ownership:'PARTNER', region:'대구',
        address:'대구광역시 수성구 만촌동 300', managerName:'영업팀 이과장', managerPhone:'053-602-7114',
        homepage:'https://www.hotelinterburgo.com', rackRate:180000, partnerRate:126000, discountRate:30,
        roomInfo:'스탠다드 트윈 / 디럭스 더블', usage:'전화 예약 시 "옆커폰 법인" 언급, 월말 일괄 세금계산서',
        cancelPolicy:'3일 전 무료, 2일 전 30%, 당일 100%', checkInTime:'15:00', checkOutTime:'12:00',
        caution:'조식 별도(1인 22,000원)', note:'법인 계약번호 IB-YKP-2024', active:true },
      { id:'lo_3', name:'해운대 그랜드 호텔', type:'HOTEL', ownership:'PARTNER', region:'부산',
        address:'부산광역시 해운대구 우동 217', managerName:'예약팀', managerPhone:'051-740-0114',
        homepage:'', rackRate:220000, partnerRate:165000, discountRate:25,
        roomInfo:'시티뷰 트윈 / 오션뷰 트윈(+3만)', usage:'홈페이지 법인코드 입력 예약',
        cancelPolicy:'2일 전까지 무료, 이후 1박 요금 부과', checkInTime:'15:00', checkOutTime:'11:00',
        caution:'성수기(7~8월) 제휴가 미적용', note:'', active:true },
      { id:'lo_4', name:'가평 라온 펜션', type:'PENSION', ownership:'PARTNER', region:'경기',
        address:'경기도 가평군 청평면 상천리 415', managerName:'사장님', managerPhone:'031-585-1234',
        homepage:'', rackRate:250000, partnerRate:200000, discountRate:20,
        roomInfo:'복층 8인실 3동 / 4인실 2동', usage:'워크숍용. 계좌이체 선입금 후 확정',
        cancelPolicy:'7일 전 100% 환불, 3일 전 50%, 당일 환불 불가', checkInTime:'16:00', checkOutTime:'11:00',
        caution:'바비큐장 별도 3만원, 취사 가능', note:'단체 워크숍 시 세미나실 무료', active:true },
      { id:'lo_5', name:'신라스테이 서초', type:'HOTEL', ownership:'PARTNER', region:'서울',
        address:'서울특별시 서초구 서초동 1338-25', managerName:'법인영업 박대리', managerPhone:'02-2223-9000',
        homepage:'https://www.shillastay.com', rackRate:190000, partnerRate:142000, discountRate:25,
        roomInfo:'스탠다드 더블 / 트윈', usage:'법인 코퍼레이트 코드로 온라인 예약',
        cancelPolicy:'당일 18시 이전 무료 취소', checkInTime:'15:00', checkOutTime:'12:00',
        caution:'조식 포함', note:'서울 출장 기본 숙소', active:true },
      { id:'lo_6', name:'옆커폰 남해 연수원', type:'PENSION', ownership:'DIRECT', region:'경남',
        address:'경상남도 남해군 삼동면 물건리 1-1', managerName:'연수원 관리인', managerPhone:'055-867-0000',
        homepage:'', rackRate:0, partnerRate:0, discountRate:100,
        roomInfo:'8인 도미토리 2실 / 가족실 3실 / 대강당', usage:'교육·워크숍 목적 우선 배정. 2주 전 신청',
        cancelPolicy:'무료(단, 3일 전 미통보 노쇼 시 지점 평가 반영)', checkInTime:'14:00', checkOutTime:'11:00',
        caution:'식사 미제공, 인근 식당 이용', note:'회사 직영', active:true },
      { id:'lo_7', name:'유성 리베라 호텔', type:'HOTEL', ownership:'PARTNER', region:'대전',
        address:'대전광역시 유성구 봉명동 444-5', managerName:'예약실', managerPhone:'042-823-2111',
        homepage:'', rackRate:150000, partnerRate:112000, discountRate:25,
        roomInfo:'스탠다드 트윈', usage:'전화 예약', cancelPolicy:'1일 전 무료',
        checkInTime:'15:00', checkOutTime:'11:00', caution:'온천 이용 무료', note:'', active:true }
    ];

    /* ---- 예약 시드 ---- */
    var seq = { };
    function code(dt){
      var y = new Date(dt).getFullYear();
      seq[y] = (seq[y]||0) + 1;
      return 'STAY-' + y + '-' + ('000' + seq[y]).slice(-4);
    }
    var rows = [
      /* 과거 완료건 (정산완료) — 월별 비용 그래프용. 최근 12개월을 고르게 덮도록 배치 */
      { off:-330, ci:-326, n:2, st:'SETTLED', u:'u_ap3', lo:'lo_3', rm:2, ad:4, ch:0, cost:330000, purpose:'부산 지역 경매 임장', bearer:'BRANCH' },
      { off:-318, ci:-312, n:1, st:'SETTLED', u:'u_ap4', lo:'lo_5', rm:1, ad:2, ch:0, cost:142000, purpose:'서울 본사 정기회의', bearer:'COMPANY' },
      { off:-300, ci:-295, n:2, st:'SETTLED', u:'u_ap2', lo:'lo_2', rm:1, ad:2, ch:0, cost:252000, purpose:'대구 세미나 강사 숙박', bearer:'COMPANY' },
      { off:-286, ci:-280, n:3, st:'SETTLED', u:'u_ap5', lo:'lo_4', rm:3, ad:12, ch:0, cost:600000, purpose:'광주점 동계 워크숍', bearer:'COMPANY' },
      { off:-268, ci:-262, n:1, st:'SETTLED', u:'u_ap7', lo:'lo_1', rm:2, ad:4, ch:0, cost:0, purpose:'수성점 신입 교육', bearer:'COMPANY' },
      { off:-252, ci:-246, n:2, st:'SETTLED', u:'u_ap6', lo:'lo_7', rm:2, ad:3, ch:0, cost:224000, purpose:'대전 지역 임장 교육', bearer:'BRANCH' },
      { off:-238, ci:-232, n:1, st:'SETTLED', u:'u_ap4', lo:'lo_5', rm:2, ad:3, ch:0, cost:284000, purpose:'서울 부동산 박람회 참가', bearer:'COMPANY' },
      { off:-220, ci:-214, n:2, st:'SETTLED', u:'u_ap3', lo:'lo_3', rm:1, ad:2, ch:0, cost:330000, purpose:'부산점 매물 브리핑', bearer:'BRANCH' },
      { off:-205, ci:-198, n:2, st:'SETTLED', u:'u_ap6', lo:'lo_6', rm:2, ad:9, ch:0, cost:0, purpose:'대전점 직원 연수', bearer:'COMPANY' },
      { off:-190, ci:-184, n:1, st:'SETTLED', u:'u_ap2', lo:'lo_2', rm:1, ad:2, ch:1, cost:126000, purpose:'대구 고객 상담 지원', bearer:'COMPANY' },
      { off:-172, ci:-166, n:2, st:'SETTLED', u:'u_ap5', lo:'lo_4', rm:2, ad:8, ch:2, cost:400000, purpose:'광주점 가족 초청 행사', bearer:'BRANCH' },
      { off:-158, ci:-150, n:1, st:'SETTLED', u:'u_ap4', lo:'lo_5', rm:1, ad:1, ch:0, cost:142000, purpose:'서울 출장', bearer:'COMPANY' },
      { off:-140, ci:-134, n:2, st:'SETTLED', u:'u_ap3', lo:'lo_3', rm:2, ad:4, ch:0, cost:330000, purpose:'부산 고객 초청 세미나', bearer:'COMPANY' },
      { off:-126, ci:-120, n:1, st:'SETTLED', u:'u_ap7', lo:'lo_1', rm:1, ad:2, ch:0, cost:0, purpose:'수성점 야간 근무 숙박', bearer:'COMPANY' },
      { off:-112, ci:-106, n:2, st:'SETTLED', u:'u_ap6', lo:'lo_7', rm:1, ad:2, ch:0, cost:224000, purpose:'대전 지사 업무 협의', bearer:'COMPANY' },
      { off:-96, ci:-92, n:2, st:'SETTLED', u:'u_ap2', lo:'lo_2', rm:2, ad:3, ch:0, cost:252000, purpose:'대구 지점 신규 직원 교육 참석', bearer:'COMPANY' },
      { off:-88, ci:-84, n:1, st:'SETTLED', u:'u_ap4', lo:'lo_5', rm:1, ad:2, ch:0, cost:142000, purpose:'본사 월간 회의 참석', bearer:'COMPANY' },
      { off:-70, ci:-66, n:2, st:'SETTLED', u:'u_ap3', lo:'lo_3', rm:2, ad:4, ch:0, cost:330000, purpose:'부산 지역 경매 물건 임장', bearer:'BRANCH' },
      { off:-64, ci:-60, n:1, st:'SETTLED', u:'u_ap6', lo:'lo_7', rm:1, ad:1, ch:0, cost:112000, purpose:'대전 세미나 진행', bearer:'COMPANY' },
      { off:-58, ci:-54, n:3, st:'SETTLED', u:'u_ap5', lo:'lo_4', rm:3, ad:12, ch:0, cost:600000, purpose:'광주점 하계 워크숍', bearer:'COMPANY' },
      { off:-44, ci:-40, n:1, st:'SETTLED', u:'u_ap7', lo:'lo_1', rm:1, ad:2, ch:0, cost:0, purpose:'본사 출장 숙박', bearer:'COMPANY' },
      { off:-38, ci:-34, n:2, st:'SETTLED', u:'u_ap2', lo:'lo_2', rm:1, ad:2, ch:1, cost:252000, purpose:'고객 초청 세미나 지원', bearer:'COMPANY' },
      { off:-33, ci:-29, n:1, st:'SETTLED', u:'u_ap4', lo:'lo_5', rm:2, ad:3, ch:0, cost:284000, purpose:'서울 부동산 박람회 참가', bearer:'COMPANY' },
      { off:-26, ci:-20, n:2, st:'SETTLED', u:'u_ap3', lo:'lo_3', rm:1, ad:2, ch:0, cost:330000, purpose:'부산점 신규 매물 브리핑', bearer:'BRANCH' },
      /* 최근 진행건 */
      { off:-21, ci:-14, n:2, st:'SETTLED', u:'u_ap6', lo:'lo_6', rm:2, ad:8, ch:0, cost:0, purpose:'대전점 직원 연수', bearer:'COMPANY' },
      { off:-16, ci:-8,  n:1, st:'SETTLED', u:'u_ap5', lo:'lo_7', rm:1, ad:1, ch:0, cost:112000, purpose:'대전 지사 업무 협의', bearer:'COMPANY' },
      { off:-13, ci:-6,  n:2, st:'SETTLING', u:'u_ap2', lo:'lo_2', rm:2, ad:4, ch:0, cost:252000, purpose:'대구 지역 경매 임장 및 상담', bearer:'BRANCH' },
      { off:-12, ci:-5,  n:1, st:'SETTLE_WAIT', u:'u_ap4', lo:'lo_5', rm:1, ad:2, ch:0, cost:142000, purpose:'서울 본사 전략회의 참석', bearer:'COMPANY' },
      { off:-11, ci:-4,  n:1, st:'SETTLE_WAIT', u:'u_ap7', lo:'lo_1', rm:2, ad:4, ch:0, cost:0, purpose:'수성점 신입 교육', bearer:'COMPANY' },
      { off:-10, ci:-2,  n:2, st:'SETTLE_WAIT', u:'u_ap3', lo:'lo_3', rm:2, ad:4, ch:1, cost:363000, purpose:'부산 고객 초청 행사', bearer:'COMPANY' },
      { off:-9,  ci:-1,  n:1, st:'USED', u:'u_ap5', lo:'lo_4', rm:1, ad:4, ch:2, cost:200000, purpose:'광주점 가족 워크숍', bearer:'BRANCH' },
      /* 오늘 체크인/체크아웃 */
      { off:-8,  ci:0,   n:2, st:'UPCOMING', u:'u_ap2', lo:'lo_2', rm:1, ad:2, ch:0, cost:252000, purpose:'대구 세미나 강사 숙박 지원', bearer:'COMPANY' },
      { off:-7,  ci:0,   n:1, st:'UPCOMING', u:'u_ap6', lo:'lo_7', rm:2, ad:3, ch:0, cost:224000, purpose:'대전 지역 임장 교육', bearer:'BRANCH' },
      { off:-9,  ci:-1,  n:1, st:'UPCOMING', u:'u_ap4', lo:'lo_5', rm:1, ad:1, ch:0, cost:142000, purpose:'서울 출장(오늘 체크아웃)', bearer:'COMPANY' },
      /* 내일 체크인 */
      { off:-6,  ci:1,   n:2, st:'BOOKED', u:'u_ap3', lo:'lo_3', rm:2, ad:4, ch:0, cost:330000, purpose:'부산 경매 물건 현장 확인', bearer:'BRANCH' },
      { off:-5,  ci:3,   n:1, st:'BOOKED', u:'u_ap7', lo:'lo_1', rm:1, ad:2, ch:0, cost:0, purpose:'수성점 야간 교육 후 숙박', bearer:'COMPANY' },
      { off:-4,  ci:8,   n:3, st:'BOOKING', u:'u_ap5', lo:'lo_4', rm:3, ad:14, ch:0, cost:600000, purpose:'광주점 3분기 워크숍', bearer:'COMPANY' },
      { off:-3,  ci:12,  n:2, st:'APPROVED', u:'u_ap2', lo:'lo_2', rm:2, ad:4, ch:0, cost:252000, purpose:'대구 고객 초청 강연 지원', bearer:'COMPANY' },
      { off:-2,  ci:14,  n:1, st:'APPROVAL_PENDING', u:'u_ap4', lo:'lo_5', rm:2, ad:3, ch:0, cost:284000, purpose:'서울 본사 워크숍 참석', bearer:'COMPANY' },
      { off:-2,  ci:16,  n:2, st:'APPROVAL_PENDING', u:'u_ap3', lo:'lo_3', rm:3, ad:6, ch:0, cost:495000, purpose:'부산 지역 대형 물건 합동 임장', bearer:'COMPANY' },
      { off:-1,  ci:20,  n:2, st:'REVIEWING', u:'u_ap6', lo:'lo_6', rm:2, ad:10, ch:0, cost:0, purpose:'대전점 신규 입사자 연수', bearer:'COMPANY' },
      { off:-1,  ci:10,  n:1, st:'RECEIVED', u:'u_ap7', lo:'lo_1', rm:1, ad:2, ch:1, cost:0, purpose:'수성점 주말 근무 숙박', bearer:'BRANCH' },
      { off:0,   ci:18,  n:2, st:'NEW', u:'u_ap2', lo:'lo_2', rm:2, ad:4, ch:0, cost:252000, purpose:'대구 지점 분기 실적회의 및 회식 후 숙박', bearer:'COMPANY' },
      { off:0,   ci:25,  n:1, st:'NEW', u:'u_ap5', lo:'lo_4', rm:2, ad:6, ch:2, cost:400000, purpose:'광주점 우수사원 포상 숙박', bearer:'COMPANY' },
      /* 취소/반려 */
      { off:-15, ci:-3,  n:1, st:'CANCELED', u:'u_ap4', lo:'lo_5', rm:1, ad:1, ch:0, cost:142000, purpose:'서울 출장 (일정 변경으로 취소)', bearer:'COMPANY' },
      { off:-18, ci:-9,  n:2, st:'REJECTED', u:'u_ap3', lo:'lo_3', rm:4, ad:8, ch:0, cost:1320000, purpose:'부산 팀 단합 목적 숙박', bearer:'COMPANY' }
    ];

    var byId = {}; d.users.forEach(function(u){ byId[u.id]=u; });
    var loById = {}; d.lodgings.forEach(function(l){ loById[l.id]=l; });
    var bookers = ['u_bk1','u_bk2'];

    d.bookings = rows.map(function(r, i){
      var reqAt = addDays(today, r.off); reqAt.setHours(9 + (i%8), (i*7)%60, 0, 0);
      var u = byId[r.u], lo = loById[r.lo];
      var ci = ymd(addDays(today, r.ci)), co = ymd(addDays(today, r.ci + r.n));
      var assignee = byId[bookers[i % 2]];
      var st = r.st;
      var b = {
        id: uid('bk'), code: code(reqAt),
        requestedAt: reqAt.toISOString(),
        applicantId: u.id, applicantName: u.name, branch: u.branch, dept: u.dept, phone: u.phone,
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
                    role:user.role, branch:user.branch, action:action, from:from||null, to:to||null, memo:memo||'' });
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
        b.approval.result = 'REJECTED'; b.approval.approverId='u_ap1'; b.approval.approverName='이재훈';
        b.approval.opinion = '동일 기간 타 지점 예약과 중복되며 인원 대비 객실 수가 과다합니다. 객실 수 조정 후 재신청 바랍니다.';
        b.approval.decidedAt = step(180);
        log(b.approval.decidedAt, byId['u_ap1'], '반려', b.approval.opinion, 'APPROVAL_PENDING', 'REJECTED');
      } else if (reach >= 5) {
        b.approval.result = 'APPROVED'; b.approval.approverId='u_ap1'; b.approval.approverName='이재훈';
        b.approval.opinion = '업무 목적 확인. 승인합니다.'; b.approval.decidedAt = step(120);
        log(b.approval.decidedAt, byId['u_ap1'], '승인', b.approval.opinion, 'APPROVAL_PENDING', 'APPROVED');
      }
      if (reach >= 6 && st !== 'REJECTED') log(step(40), assignee, '숙소 예약 진행', lo.name + ' 예약 문의', 'APPROVED', 'BOOKING');
      if (st === 'CANCELED') {
        b.cancelRequest = { at: step(60), reason:'출장 일정이 변경되어 취소 요청드립니다.', by:u.name, handled:true };
        log(b.cancelRequest.at, u, '예약 취소 요청', b.cancelRequest.reason, null, null);
        log(step(30), assignee, '예약 취소', '신청자 요청으로 취소 처리 (위약금 없음)', 'BOOKING', 'CANCELED');
      }
      if (reach >= 7 && !terminal) {
        b.reservation.confirmNo = (lo.ownership==='DIRECT' ? 'YKP-' : lo.name.slice(0,2)) + ymd(reqAt).replace(/-/g,'').slice(2) + '-' + ('00'+(i+1)).slice(-3);
        b.reservation.roomInfo = lo.roomInfo.split('/')[0].trim() + ' ' + r.rm + '실 / ' + r.n + '박';
        b.reservation.amount = r.cost;
        b.reservation.reservedAt = step(90);
        b.reservation.note = lo.ownership==='DIRECT' ? '직영 숙소 배정 완료' : '제휴가 적용';
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
        b.payment.method = (lo.ownership==='DIRECT') ? '기타' : (i%3===0 ? '계좌이체' : '법인카드');
        b.payment.paidAmount = r.cost;
        b.payment.paidAt = ymd(addDays(today, r.ci + r.n));
        b.payment.status = r.cost ? 'PAY_DONE' : 'PAY_NONE';
        b.payment.financeId='u_fi1'; b.payment.financeName='최유진';
        log(step(120), byId['u_fi1'], '정산 시작',
            '결제방법 ' + b.payment.method + ' / 결제금액 ' + won(r.cost), 'SETTLE_WAIT', 'SETTLING');
      }
      if (reach >= 12 && !terminal) {
        b.payment.taxInvoice = lo.ownership === 'PARTNER';
        b.payment.receipt = true;
        b.payment.settledAt = step(24*60);
        log(b.payment.settledAt, byId['u_fi1'], '정산 완료',
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

    /* 공지 시드 */
    var nowIso = new Date().toISOString();
    d.notices = [
      { id:uid('nc'), category:'예약 신청방법', pinned:true, author:'안효준', createdAt:nowIso, updatedAt:nowIso,
        title:'[필독] 호텔·펜션 예약은 전화·카카오톡이 아닌 이 시스템으로만 신청해주세요',
        body:'그동안 지점별로 회계팀이나 개인에게 전화·카카오톡으로 숙박 예약을 요청하면서 누락·중복 예약이 반복되었습니다.\n\n' +
             '2026년부터 모든 호텔·펜션 예약은 [예약 신청] 메뉴에서만 접수합니다.\n\n' +
             '1) 좌측 메뉴 [예약 신청] 클릭\n' +
             '2) 신청서 작성 후 제출 (체크인/체크아웃만 넣으면 숙박일수는 자동 계산됩니다)\n' +
             '3) 제출 즉시 예약번호(STAY-연도-일련번호)가 발급되고 예약관리팀에 알림이 갑니다\n' +
             '4) 진행 상황은 [예약 관리]에서 실시간으로 확인할 수 있습니다\n\n' +
             '※ 부득이하게 전화로 요청하신 경우에도 예약 담당자가 시스템에 대신 등록합니다. 등록되지 않은 요청은 처리되지 않습니다.' },
      { id:uid('nc'), category:'담당부서', pinned:true, author:'안효준', createdAt:nowIso, updatedAt:nowIso,
        title:'숙박 예약 담당부서 안내 (회계팀은 예약 접수 부서가 아닙니다)',
        body:'· 예약 접수·진행 : 본사 예약관리팀 (박서연 과장 / 정민호 대리)\n' +
             '· 승인 : 경영지원팀 이재훈 팀장\n' +
             '· 결제·정산·증빙 : 회계팀 최유진 차장\n\n' +
             '회계팀은 "이미 이용이 끝난 건의 결제·세금계산서·정산"만 담당합니다.\n' +
             '예약을 새로 잡거나 변경·취소하는 요청을 회계팀에 하시면 처리가 지연됩니다. 반드시 시스템으로 신청해주세요.' },
      { id:uid('nc'), category:'이용규정', pinned:false, author:'안효준', createdAt:nowIso, updatedAt:nowIso,
        title:'숙박 이용 기준 및 객실 배정 규정',
        body:'· 1객실 2인 기준 배정이 원칙입니다. 1인 1객실은 팀장급 이상 또는 야간 업무 시에만 승인됩니다.\n' +
             '· 회사 직영 숙소(수성 게스트하우스, 남해 연수원)가 있는 지역은 직영 숙소를 우선 이용합니다.\n' +
             '· 성수기(7~8월, 연말)는 최소 2주 전 신청해주세요. 제휴가 적용이 어려울 수 있습니다.\n' +
             '· 가족 동반 숙박은 개인 부담을 원칙으로 하며, 포상 숙박은 별도 승인이 필요합니다.' },
      { id:uid('nc'), category:'취소규정', pinned:false, author:'안효준', createdAt:nowIso, updatedAt:nowIso,
        title:'예약 취소·변경 시 반드시 확인할 것',
        body:'취소·변경은 [예약 상세] 화면의 "수정 요청 / 취소 요청" 버튼으로 접수해주세요.\n\n' +
             '숙소별 취소 규정이 다르며 위약금이 발생할 수 있습니다.\n' +
             '· 인터불고 호텔 대구 : 3일 전 무료 / 2일 전 30% / 당일 100%\n' +
             '· 해운대 그랜드 호텔 : 2일 전까지 무료, 이후 1박 요금\n' +
             '· 가평 라온 펜션 : 7일 전 100% 환불 / 3일 전 50% / 당일 환불 불가\n' +
             '· 직영 숙소 : 무료 (당일 취소 시 청소비 3만원)\n\n' +
             '위약금이 발생하면 해당 지점 부담으로 처리됩니다.' },
      { id:uid('nc'), category:'비용처리 기준', pinned:false, author:'최유진', createdAt:nowIso, updatedAt:nowIso,
        title:'숙박비 비용처리·증빙 기준',
        body:'· 회사 부담 : 법인카드 결제 또는 숙소 월정산. 세금계산서는 회계팀이 직접 수취합니다.\n' +
             '· 지점 부담 : 지점 법인카드로 결제 후 [정산 관리]에 카드전표/영수증을 첨부해주세요.\n' +
             '· 개인 부담(선결제 후 정산) : 영수증 원본 이미지를 반드시 첨부해야 지급됩니다.\n' +
             '· 증빙 미첨부 건은 정산완료 처리되지 않습니다.\n' +
             '· 정산 마감은 매월 5일이며, 전월 이용분은 그때까지 증빙이 등록되어야 합니다.' },
      { id:uid('nc'), category:'회사 숙소 이용방법', pinned:false, author:'박서연', createdAt:nowIso, updatedAt:nowIso,
        title:'직영 숙소(수성 게스트하우스 / 남해 연수원) 이용 안내',
        body:'회사가 직접 운영하는 숙소는 숙박비가 무료입니다(청소비만 발생).\n\n' +
             '· 옆커폰 수성 게스트하우스 : 2인실 4실, 4인실 2실 (최대 20인), 주차 6대\n' +
             '· 옆커폰 남해 연수원 : 8인 도미토리 2실, 가족실 3실, 대강당 보유. 교육·워크숍 우선 배정, 2주 전 신청\n\n' +
             '배정 확정 후 도어락 번호를 신청자 연락처로 발송합니다. 퇴실 시 분리수거와 정리 부탁드립니다.' },
      { id:uid('nc'), category:'제휴숙소 안내', pinned:false, author:'박서연', createdAt:nowIso, updatedAt:nowIso,
        title:'2026년 제휴 숙소 및 할인율',
        body:'· 인터불고 호텔 대구 : 정상가 180,000 → 제휴가 126,000 (30%)\n' +
             '· 해운대 그랜드 호텔 : 220,000 → 165,000 (25%) ※ 7~8월 제휴가 미적용\n' +
             '· 신라스테이 서초 : 190,000 → 142,000 (25%, 조식포함)\n' +
             '· 유성 리베라 호텔 : 150,000 → 112,000 (25%, 온천 무료)\n' +
             '· 가평 라온 펜션 : 250,000 → 200,000 (20%, 워크숍용)\n\n' +
             '제휴가는 예약관리팀이 법인 코드로 예약할 때만 적용됩니다. 개인이 직접 예약하면 정상가로 결제되니 주의해주세요.' },
      { id:uid('nc'), category:'FAQ', pinned:false, author:'안효준', createdAt:nowIso, updatedAt:nowIso,
        title:'자주 묻는 질문 (FAQ)',
        body:'Q. 급해서 전화로 요청했는데 시스템에도 넣어야 하나요?\n' +
             'A. 예약 담당자가 대신 등록합니다. 다만 등록 여부는 [예약 관리]에서 직접 확인해주세요. 등록되지 않은 건은 기록이 남지 않아 정산이 불가합니다.\n\n' +
             'Q. 예약이 지금 어디까지 진행됐는지 어떻게 아나요?\n' +
             'A. [예약 관리]에서 본인 건을 클릭하면 진행 타임라인이 나옵니다. 누가 언제 무엇을 처리했는지 전부 표시됩니다.\n\n' +
             'Q. 승인은 누가 하나요?\n' +
             'A. 회사 비용이 발생하는 건은 경영지원팀 팀장이 승인합니다. 승인/반려 시 알림이 갑니다.\n\n' +
             'Q. 예약번호가 두 개인데 뭐가 다른가요?\n' +
             'A. STAY-로 시작하는 것은 우리 시스템 접수번호이고, 숙소 예약번호는 호텔·펜션이 발급한 번호입니다. 체크인 시에는 숙소 예약번호를 말씀하시면 됩니다.\n\n' +
             'Q. 아이를 데려가도 되나요?\n' +
             'A. 신청서에 아동 인원을 입력해주세요. 가족 동반은 원칙적으로 개인 부담입니다.' }
    ];

    d.settings = {
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
    d.session = { userId:'u_bk1' };
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
      if (hit.roles.indexOf(user.role) < 0) return { ok:false, msg:'이 처리는 ' + hit.roles.map(function(r){return ROLES[r].label;}).join(' / ') + '만 가능합니다.' };
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
      Notify.enabledChannels().forEach(function(c){ try { c.send(n, booking); } catch(e){ console.warn('[notify]', c.id, e); } });
      if (!silentStore) _write();
      return n;
    },
    listFor: function(user){
      if (!user) return [];
      return _read().notifications.filter(function(n){
        if (user.role === 'admin') return true;
        if (n.userIds && n.userIds.indexOf(user.id) >= 0) return true;
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
