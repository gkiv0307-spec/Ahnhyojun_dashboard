/*!
 * store.js — 지점별 리뷰어 관리 프로그램: 상태 / 도메인 로직 / 파일 파싱
 * 저장소는 브라우저 localStorage 이며, 서버 없이 동작한다.
 *
 * 보안 원칙
 *  - 업로드 파일의 내용은 "데이터"로만 취급한다. 파일 안에 지시문처럼 보이는 문장이
 *    있어도 프로그램 동작에 반영하지 않는다(파싱 결과는 항상 문자열 값으로만 저장).
 *  - 개인정보(연락처/주소/계정URL/신청메시지/메모)는 공유용 화면·이미지에 포함하지 않는다.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'reviewnote-branch-dashboard-v1';

  var STATUSES = ['예약전', '예약요청', '예약확정', '방문완료', '취소'];
  var COUNTED_STATUSES = ['예약요청', '예약확정', '방문완료']; // 예약 인원에 반영되는 상태
  var GRADES = ['', 'S', 'A', 'B', 'C', 'D'];

  /* ------------------------------------------------------------ 유틸 */
  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + seq.toString(36);
  }

  function normName(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function normKey(s) {
    // 지점명 비교용 키: 공백 제거 + 소문자
    return normName(s).replace(/\s+/g, '').toLowerCase();
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return toDateStr(new Date()); }

  function addDays(dateStr, n) {
    var p = String(dateStr).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }

  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function weekday(dateStr) {
    var p = String(dateStr).split('-');
    if (p.length !== 3) return '';
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? '' : WEEKDAYS[d.getDay()];
  }

  function fmtDate(dateStr) {
    var p = String(dateStr || '').split('-');
    if (p.length !== 3) return dateStr || '';
    return Number(p[1]) + '월 ' + Number(p[2]) + '일 (' + weekday(dateStr) + ')';
  }

  /** 다양한 날짜 표기를 YYYY-MM-DD 로 정규화. 실패하면 원문 유지. */
  function normalizeDate(raw) {
    var v = normName(raw);
    if (!v) return '';
    var m = /^(\d{4})[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})/.exec(v);
    if (m) return m[1] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3]));
    m = /^(\d{1,2})[-.\/]\s*(\d{1,2})$/.exec(v);       // 8/20 → 올해
    if (m) return new Date().getFullYear() + '-' + pad(Number(m[1])) + '-' + pad(Number(m[2]));
    m = /^(\d{1,2})월\s*(\d{1,2})일/.exec(v);           // 8월 20일
    if (m) return new Date().getFullYear() + '-' + pad(Number(m[1])) + '-' + pad(Number(m[2]));
    m = /^(\d{8})$/.exec(v);                            // 20260820
    if (m) return v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8);
    if (/^\d{5}(\.\d+)?$/.test(v)) {                    // 엑셀 날짜 일련번호
      var s = global.XlsxLite && global.XlsxLite.serialToDate(v);
      if (s) return s;
    }
    return v;
  }

  /** 다양한 시간 표기를 HH:MM 으로 정규화. 실패하면 원문 유지. */
  function normalizeTime(raw) {
    var v = normName(raw);
    if (!v) return '';
    var ampm = /오후|pm/i.test(v) ? 'pm' : (/오전|am/i.test(v) ? 'am' : '');
    var m = /(\d{1,2})\s*[:시]\s*(\d{1,2})?/.exec(v);
    if (!m) {
      m = /^(\d{1,2})$/.exec(v);
      if (!m) return v;
      return pad(applyAmPm(Number(m[1]), ampm)) + ':00';
    }
    var h = Number(m[1]);
    var min = m[2] ? Number(m[2]) : 0;
    h = applyAmPm(h, ampm);
    if (h > 23 || min > 59) return v;
    return pad(h) + ':' + pad(min);
  }

  function applyAmPm(h, ampm) {
    if (ampm === 'pm' && h < 12) return h + 12;
    if (ampm === 'am' && h === 12) return 0;
    return h;
  }

  function normalizeStatus(raw) {
    var v = normName(raw).replace(/\s+/g, '');
    if (!v) return '예약전';
    var map = {
      '예약전': '예약전', '미예약': '예약전', '대기': '예약전',
      '예약요청': '예약요청', '요청': '예약요청', '신청': '예약요청',
      '예약확정': '예약확정', '확정': '예약확정',
      '방문완료': '방문완료', '완료': '방문완료', '방문': '방문완료',
      '취소': '취소', '취소됨': '취소', '노쇼': '취소'
    };
    return map[v] || (STATUSES.indexOf(v) >= 0 ? v : '예약전');
  }

  function truthy(raw) {
    var v = normName(raw).toLowerCase();
    return ['y', 'yes', 'o', 'true', '1', '완료', '등록', '등록완료', '작성완료', 'ok'].indexOf(v) >= 0;
  }

  /* ------------------------------------------------------------ 샘플 데이터 */
  function sampleState() {
    var base = todayStr();
    var d = function (n) { return addDays(base, n); };

    var branches = [
      makeBranch('브라운도트 포항죽도점', [d(2), d(3), d(4), d(5), d(6)], ['11:00', '13:00', '15:00', '17:00', '19:00'], 2),
      makeBranch('브라운도트 진주성점', [d(2), d(3), d(4), d(5)], ['12:00', '14:00', '16:00', '18:00'], 2),
      makeBranch('스테이레브소유 거제점', [d(3), d(4), d(5), d(6), d(7)], ['15:00', '17:00', '19:00'], 1)
    ];
    branches[0].slotOverrides[d(2) + '|11:00'] = 3;
    branches[2].slotOverrides[d(4) + '|17:00'] = 2;

    var rows = [
      ['브라운도트 포항죽도점', '리뷰하는곰돌', 'https://blog.naver.com/sample_bear', '010-1234-5678', '경북 포항시 북구 죽도동', 92, 'S', 1800, '주말 방문 희망합니다.', 'VIP 재방문', d(2), '11:00', '예약확정', 'N'],
      ['브라운도트 포항죽도점', '포항맛집러', 'https://www.instagram.com/sample_pohang', '010-2345-6789', '경북 포항시 남구 상도동', 78, 'A', 1200, '평일 오전 가능', '', d(2), '11:00', '방문완료', 'Y'],
      ['브라운도트 포항죽도점', '데일리쭈', 'https://blog.naver.com/sample_daily', '010-3456-7890', '경북 포항시 북구 양덕동', 64, 'B', 640, '', '연락 잘 됨', d(2), '13:00', '예약요청', 'N'],
      ['브라운도트 포항죽도점', '리뷰천사', 'https://blog.naver.com/sample_angel', '010-4567-8901', '경북 포항시 남구 효자동', 55, 'B', 430, '가족과 방문 예정', '', d(3), '15:00', '예약확정', 'N'],
      ['브라운도트 포항죽도점', '동해바다', 'https://blog.naver.com/sample_sea', '010-5678-9012', '경북 포항시 북구 흥해읍', 48, 'C', 300, '', '', '', '', '예약전', 'N'],
      ['브라운도트 포항죽도점', '취소한리뷰어', 'https://blog.naver.com/sample_cancel', '010-6789-0123', '경북 포항시 남구 대잠동', 51, 'C', 280, '일정 변경 요청', '개인사정 취소', d(3), '17:00', '취소', 'N'],

      ['브라운도트 진주성점', '진주에서만', 'https://blog.naver.com/sample_jinju', '010-7890-1234', '경남 진주시 성지동', 85, 'S', 1500, '촬영 장비 지참합니다.', '', d(2), '12:00', '예약확정', 'N'],
      ['브라운도트 진주성점', '남강야경', 'https://www.instagram.com/sample_river', '010-8901-2345', '경남 진주시 칠암동', 70, 'A', 900, '', '사진 퀄리티 좋음', d(2), '14:00', '예약요청', 'N'],
      ['브라운도트 진주성점', '주말러버', 'https://blog.naver.com/sample_weekend', '010-9012-3456', '경남 진주시 신안동', 61, 'B', 520, '주말만 가능', '', d(3), '12:00', '예약전', 'N'],
      ['브라운도트 진주성점', '진주리뷰왕', 'https://blog.naver.com/sample_king', '010-0123-4567', '경남 진주시 평거동', 88, 'S', 1700, '', '재계약 후보', d(3), '14:00', '방문완료', 'Y'],

      ['스테이레브소유 거제점', '거제스테이', 'https://blog.naver.com/sample_geoje', '010-1122-3344', '경남 거제시 고현동', 74, 'A', 980, '1박 2일 예정', '', d(3), '15:00', '예약확정', 'N'],
      ['스테이레브소유 거제점', '바다뷰맛집', 'https://www.instagram.com/sample_view', '010-2233-4455', '경남 거제시 옥포동', 66, 'B', 700, '', '', d(4), '17:00', '예약요청', 'N'],
      ['스테이레브소유 거제점', '숙소탐험대', 'https://blog.naver.com/sample_stay', '010-3344-5566', '경남 거제시 장승포동', 59, 'B', 450, '주차 문의드립니다.', '', d(4), '17:00', '예약요청', 'N'],
      ['스테이레브소유 거제점', '느린여행', 'https://blog.naver.com/sample_slow', '010-4455-6677', '경남 거제시 일운면', 44, 'C', 260, '', '', '', '', '예약전', 'N'],

      // 미매칭 지점 예시 (등록된 지점명과 다름 → 관리자 확인 필요)
      ['브라운도트 포항죽도', '표기다른리뷰어', 'https://blog.naver.com/sample_mismatch', '010-5566-7788', '경북 포항시 북구 죽도동', 57, 'B', 380, '지점명 표기가 다릅니다.', '업로드 원본 그대로', d(4), '13:00', '예약요청', 'N']
    ];

    var reviewers = rows.map(function (r) {
      return makeReviewer({
        branchName: r[0], name: r[1], accountUrl: r[2], phone: r[3], address: r[4],
        exposureScore: r[5], grade: r[6], dailyVisits: r[7], applyMessage: r[8], memo: r[9],
        wishDate: r[10], wishTime: r[11], status: r[12], reviewRegistered: truthy(r[13])
      });
    });

    var state = {
      version: 1,
      branches: branches,
      reviewers: reviewers,
      settings: { maskPII: false, shareNote: '예약은 선착순이며, 마감된 시간대는 선택할 수 없습니다.' },
      isSample: true
    };
    relinkBranches(state);
    return state;
  }

  function makeBranch(name, dates, times, capacity) {
    return {
      id: uid('br'),
      name: normName(name),
      dates: (dates || []).slice(),
      times: (times || []).slice(),
      defaultCapacity: capacity == null ? 2 : Number(capacity),
      slotOverrides: {},
      memo: ''
    };
  }

  function makeReviewer(o) {
    o = o || {};
    return {
      id: uid('rv'),
      branchId: null,
      branchName: normName(o.branchName),
      name: normName(o.name),
      accountUrl: normName(o.accountUrl),
      phone: normName(o.phone),
      address: normName(o.address),
      exposureScore: o.exposureScore === '' || o.exposureScore == null ? '' : String(o.exposureScore),
      grade: normName(o.grade),
      dailyVisits: o.dailyVisits === '' || o.dailyVisits == null ? '' : String(o.dailyVisits),
      applyMessage: String(o.applyMessage == null ? '' : o.applyMessage).trim(),
      memo: String(o.memo == null ? '' : o.memo).trim(),
      wishDate: normalizeDate(o.wishDate),
      wishTime: normalizeTime(o.wishTime),
      status: normalizeStatus(o.status),
      reviewRegistered: !!o.reviewRegistered
    };
  }

  /* ------------------------------------------------------------ 상태 관리 */
  var state = null;
  var listeners = [];

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.branches) && Array.isArray(parsed.reviewers)) {
          state = migrate(parsed);
          relinkBranches(state);
          return state;
        }
      } catch (e) { /* 손상된 저장본은 무시하고 샘플로 시작 */ }
    }
    state = sampleState();
    save();
    return state;
  }

  function migrate(s) {
    s.version = 1;
    s.settings = s.settings || {};
    if (s.settings.maskPII == null) s.settings.maskPII = false;
    if (s.settings.shareNote == null) s.settings.shareNote = '';
    s.branches.forEach(function (b) {
      b.id = b.id || uid('br');
      b.dates = Array.isArray(b.dates) ? b.dates : [];
      b.times = Array.isArray(b.times) ? b.times : [];
      b.slotOverrides = b.slotOverrides || {};
      if (b.defaultCapacity == null) b.defaultCapacity = 2;
    });
    s.reviewers.forEach(function (r) {
      r.id = r.id || uid('rv');
      r.status = normalizeStatus(r.status);
      r.reviewRegistered = !!r.reviewRegistered;
    });
    return s;
  }

  function save() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      global.console && console.warn('저장 실패:', e);
    }
  }

  function get() { return state || load(); }

  function subscribe(fn) { listeners.push(fn); }

  function commit(silent) {
    save();
    if (!silent) listeners.forEach(function (fn) { fn(state); });
  }

  function reset(useSample) {
    state = useSample ? sampleState() : {
      version: 1, branches: [], reviewers: [],
      settings: { maskPII: false, shareNote: '' }, isSample: false
    };
    commit();
  }

  function replaceState(next) {
    if (!next || !Array.isArray(next.branches) || !Array.isArray(next.reviewers)) {
      throw new Error('올바른 백업 파일이 아닙니다.');
    }
    state = migrate(next);
    relinkBranches(state);
    commit();
  }

  /* ------------------------------------------------------------ 지점 매칭 */
  function branchByName(name) {
    var key = normKey(name);
    if (!key) return null;
    var s = get();
    for (var i = 0; i < s.branches.length; i++) {
      if (normKey(s.branches[i].name) === key) return s.branches[i];
    }
    return null;
  }

  function branchById(id) {
    var s = get();
    for (var i = 0; i < s.branches.length; i++) if (s.branches[i].id === id) return s.branches[i];
    return null;
  }

  /** 리뷰어의 branchName 을 기준으로 branchId 를 다시 연결한다. 못 찾으면 null(미매칭). */
  function relinkBranches(s) {
    s = s || get();
    var byKey = {};
    s.branches.forEach(function (b) { byKey[normKey(b.name)] = b.id; });
    s.reviewers.forEach(function (r) {
      var id = byKey[normKey(r.branchName)];
      r.branchId = id || null;
    });
    return s;
  }

  /** 등록된 지점과 매칭되지 않는 지점명 목록 */
  function unmatchedBranchNames() {
    var s = get();
    var map = {};
    s.reviewers.forEach(function (r) {
      if (r.branchId) return;
      var key = normKey(r.branchName) || '(지점명 없음)';
      if (!map[key]) map[key] = { name: r.branchName || '(지점명 없음)', count: 0 };
      map[key].count += 1;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ------------------------------------------------------------ 예약 계산 */
  function slotKey(date, time) { return date + '|' + time; }

  function capacityOf(branch, date, time) {
    if (!branch) return 0;
    var ov = branch.slotOverrides[slotKey(date, time)];
    if (ov === '' || ov == null) return Number(branch.defaultCapacity) || 0;
    return Math.max(0, Number(ov) || 0);
  }

  function isCounted(status) { return COUNTED_STATUSES.indexOf(status) >= 0; }

  function reviewersInSlot(branchId, date, time) {
    return get().reviewers.filter(function (r) {
      return r.branchId === branchId && r.wishDate === date && r.wishTime === time;
    });
  }

  function bookedCount(branchId, date, time) {
    return reviewersInSlot(branchId, date, time).filter(function (r) { return isCounted(r.status); }).length;
  }

  function slotInfo(branch, date, time) {
    var cap = capacityOf(branch, date, time);
    var booked = bookedCount(branch.id, date, time);
    var remain = cap - booked;
    return {
      branchId: branch.id, branchName: branch.name, date: date, time: time,
      capacity: cap, booked: booked,
      remaining: Math.max(0, remain),
      over: remain < 0 ? -remain : 0,
      closed: remain <= 0,
      label: remain <= 0 ? '마감' : ('가능 ' + remain)
    };
  }

  function slotsOfBranch(branch, range) {
    var out = [];
    (branch.dates || []).slice().sort().forEach(function (date) {
      if (range && range.from && date < range.from) return;
      if (range && range.to && date > range.to) return;
      (branch.times || []).slice().sort().forEach(function (time) {
        out.push(slotInfo(branch, date, time));
      });
    });
    return out;
  }

  function statsFor(reviewers, branches, range) {
    var stat = { total: reviewers.length, 예약전: 0, 예약요청: 0, 예약확정: 0, 방문완료: 0, 취소: 0, 리뷰등록: 0, capacity: 0, booked: 0, remaining: 0 };
    reviewers.forEach(function (r) {
      if (stat[r.status] != null) stat[r.status] += 1;
      if (r.reviewRegistered) stat.리뷰등록 += 1;
    });
    (branches || []).forEach(function (b) {
      slotsOfBranch(b, range).forEach(function (s) {
        stat.capacity += s.capacity;
        stat.booked += s.booked;
        stat.remaining += s.remaining;
      });
    });
    return stat;
  }

  /* ------------------------------------------------------------ CSV 파싱 */
  function detectDelimiter(text) {
    var head = text.split(/\r?\n/).slice(0, 5).join('\n');
    var counts = { ',': 0, '\t': 0, ';': 0 };
    var inQ = false;
    for (var i = 0; i < head.length; i++) {
      var ch = head[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && counts[ch] != null) counts[ch] += 1;
    }
    var best = ',', bestN = -1;
    Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
    return best;
  }

  function parseCSV(text, delim) {
    text = String(text).replace(/^﻿/, '');
    delim = delim || detectDelimiter(text);
    var rows = [], row = [], field = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQ = false;
        } else field += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (ch === '\r') {
        // 무시 (\r\n 처리)
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  /* --------------------------------------------------- 헤더 매핑 / 가져오기 */
  var FIELD_ALIASES = [
    { key: 'branchName', label: '지점명', aliases: ['지점명', '지점', '매장', '매장명', '업체', '업체명', 'branch', 'store'] },
    { key: 'name', label: '리뷰어명', aliases: ['리뷰어명', '리뷰어', '이름', '성명', '닉네임', '체험단명', 'name', 'reviewer'] },
    { key: 'accountUrl', label: '계정 URL', aliases: ['계정url', '계정 url', '계정', 'url', '블로그', '블로그주소', '채널', '링크', 'sns', 'accounturl'] },
    { key: 'phone', label: '연락처', aliases: ['연락처', '전화번호', '휴대폰', '핸드폰', '전화', 'phone', 'tel', 'mobile'] },
    { key: 'address', label: '주소', aliases: ['주소', '거주지', 'address'] },
    { key: 'exposureScore', label: '노출점수', aliases: ['노출점수', '노출 점수', '점수', 'score', '노출'] },
    { key: 'grade', label: '등급', aliases: ['등급', '레벨', 'grade', 'level'] },
    { key: 'dailyVisits', label: '일 방문 수', aliases: ['일방문수', '일 방문 수', '일방문자수', '방문수', '일일방문자', 'visits', 'dailyvisits'] },
    { key: 'applyMessage', label: '신청메시지', aliases: ['신청메시지', '신청 메시지', '신청내용', '메시지', 'message', '신청글'] },
    { key: 'memo', label: '메모', aliases: ['메모', '비고', 'note', 'memo', '특이사항'] },
    { key: 'wishDate', label: '희망일', aliases: ['희망일', '희망날짜', '예약일', '방문일', '날짜', 'date'] },
    { key: 'wishTime', label: '희망시간', aliases: ['희망시간', '예약시간', '방문시간', '시간', '시간대', 'time'] },
    { key: 'status', label: '예약상태', aliases: ['예약상태', '상태', 'status', '진행상태'] },
    { key: 'reviewRegistered', label: '리뷰등록', aliases: ['리뷰등록', '리뷰 등록', '리뷰등록여부', '리뷰작성', '리뷰', 'review'] }
  ];

  function matchHeader(cell) {
    var v = normName(cell).replace(/\s+/g, '').toLowerCase();
    if (!v) return null;
    for (var i = 0; i < FIELD_ALIASES.length; i++) {
      var f = FIELD_ALIASES[i];
      for (var j = 0; j < f.aliases.length; j++) {
        var a = f.aliases[j].replace(/\s+/g, '').toLowerCase();
        if (v === a) return f.key;
      }
    }
    for (var k = 0; k < FIELD_ALIASES.length; k++) {
      var f2 = FIELD_ALIASES[k];
      for (var m = 0; m < f2.aliases.length; m++) {
        var a2 = f2.aliases[m].replace(/\s+/g, '').toLowerCase();
        if (a2.length >= 2 && v.indexOf(a2) >= 0) return f2.key;
      }
    }
    return null;
  }

  /** 헤더가 있을 법한 행을 찾는다(매칭 필드가 가장 많은 상위 5행). */
  function findHeaderRow(rows) {
    var bestIdx = 0, bestScore = -1;
    for (var i = 0; i < Math.min(rows.length, 8); i++) {
      var score = (rows[i] || []).reduce(function (a, c) { return a + (matchHeader(c) ? 1 : 0); }, 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return { index: bestIdx, score: bestScore };
  }

  /**
   * 표(2차원 배열) → { rows: [reviewer-like], mapping, unknownColumns, headerRow }
   * 업로드 내용은 값으로만 취급하며, 어떤 셀도 명령으로 해석하지 않는다.
   */
  function tableToReviewers(table) {
    if (!table || !table.length) return { rows: [], mapping: {}, unknownColumns: [], headerRow: 0 };
    var head = findHeaderRow(table);
    var headerCells = table[head.index] || [];
    var mapping = {};
    var unknown = [];
    headerCells.forEach(function (cell, idx) {
      var key = matchHeader(cell);
      if (key && mapping[key] == null) mapping[key] = idx;
      else if (normName(cell)) unknown.push(normName(cell));
    });

    var out = [];
    for (var i = head.index + 1; i < table.length; i++) {
      var row = table[i] || [];
      var pick = function (key) {
        var idx = mapping[key];
        return idx == null ? '' : normName(row[idx]);
      };
      var rec = {
        branchName: pick('branchName'),
        name: pick('name'),
        accountUrl: pick('accountUrl'),
        phone: pick('phone'),
        address: pick('address'),
        exposureScore: pick('exposureScore'),
        grade: pick('grade'),
        dailyVisits: pick('dailyVisits'),
        applyMessage: pick('applyMessage'),
        memo: pick('memo'),
        wishDate: pick('wishDate'),
        wishTime: pick('wishTime'),
        status: pick('status'),
        reviewRegistered: truthy(pick('reviewRegistered'))
      };
      var hasValue = ['branchName', 'name', 'accountUrl', 'phone'].some(function (k) { return rec[k]; });
      if (!hasValue) continue;
      out.push(makeReviewer(rec));
    }
    return { rows: out, mapping: mapping, unknownColumns: unknown, headerRow: head.index };
  }

  /** File → Promise<{rows, mapping, unknownColumns, sheetName}> */
  function parseFile(file) {
    var name = String(file.name || '').toLowerCase();
    if (/\.(xlsx|xlsm)$/.test(name)) {
      return file.arrayBuffer()
        .then(function (buf) { return global.XlsxLite.readWorkbook(buf); })
        .then(function (wb) {
          var best = null, bestScore = -1;
          wb.sheets.forEach(function (sh) {
            var r = tableToReviewers(sh.rows);
            var score = r.rows.length;
            if (score > bestScore) { bestScore = score; best = { res: r, sheetName: sh.name }; }
          });
          if (!best) throw new Error('시트를 읽지 못했습니다.');
          best.res.sheetName = best.sheetName;
          return best.res;
        });
    }
    if (/\.xls$/.test(name)) {
      return Promise.reject(new Error('구형 .xls 형식은 지원하지 않습니다. .xlsx 또는 CSV로 저장해 주세요.'));
    }
    return file.text().then(function (text) {
      var res = tableToReviewers(parseCSV(text));
      res.sheetName = file.name;
      return res;
    });
  }

  /* ------------------------------------------------------------ CSV 출력 */
  /** CSV 수식 인젝션 방지: =, +, -, @ 로 시작하는 값 앞에 ' 를 붙인다. */
  function csvSafe(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s;
  }

  function toCSV(rows) {
    return '﻿' + rows.map(function (row) {
      return row.map(function (cell) {
        var s = csvSafe(cell);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    STATUSES: STATUSES,
    COUNTED_STATUSES: COUNTED_STATUSES,
    GRADES: GRADES,
    FIELD_ALIASES: FIELD_ALIASES,

    uid: uid, normName: normName, normKey: normKey,
    todayStr: todayStr, addDays: addDays, toDateStr: toDateStr, fmtDate: fmtDate, weekday: weekday,
    normalizeDate: normalizeDate, normalizeTime: normalizeTime, normalizeStatus: normalizeStatus,

    load: load, get: get, save: save, commit: commit, subscribe: subscribe,
    reset: reset, replaceState: replaceState, sampleState: sampleState,
    makeBranch: makeBranch, makeReviewer: makeReviewer,

    branchByName: branchByName, branchById: branchById,
    relinkBranches: relinkBranches, unmatchedBranchNames: unmatchedBranchNames,

    slotKey: slotKey, capacityOf: capacityOf, isCounted: isCounted,
    reviewersInSlot: reviewersInSlot, bookedCount: bookedCount,
    slotInfo: slotInfo, slotsOfBranch: slotsOfBranch, statsFor: statsFor,

    parseCSV: parseCSV, parseFile: parseFile, tableToReviewers: tableToReviewers,
    toCSV: toCSV, csvSafe: csvSafe
  };
})(window);
