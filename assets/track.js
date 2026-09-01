/* 방문자 유입 수집 스크립트 (부동산경매.store)
 * - 개인정보(IP, 이름, 연락처)는 저장하지 않는다. 익명 난수 ID + 유입 경로만 남긴다.
 * - 실패해도 사이트 동작에 영향이 없도록 전부 try/catch로 감싼다.
 */
(function () {
  "use strict";

  var ENDPOINT = "/api/track";
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30분 무활동이면 새 방문(세션)으로 계산
  var VKEY = "ykp_visitor";
  var SKEY = "ykp_session";

  function store(kind) {
    try {
      var s = kind === "local" ? window.localStorage : window.sessionStorage;
      s.setItem("__t", "1");
      s.removeItem("__t");
      return s;
    } catch (e) {
      return null; // 시크릿 모드/쿠키 차단 환경
    }
  }

  function rid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    } catch (e) {}
    return String(Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  }

  function readJson(s, key) {
    if (!s) return null;
    try { return JSON.parse(s.getItem(key) || "null"); } catch (e) { return null; }
  }

  function writeJson(s, key, val) {
    if (!s) return;
    try { s.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var ls = store("local");
  var now = Date.now();

  // ── 방문자 식별 (브라우저 단위, 익명)
  var visitor = readJson(ls, VKEY);
  var isNewVisitor = 0;
  if (!visitor || !visitor.id) {
    visitor = { id: rid(), first: now };
    isNewVisitor = 1;
    writeJson(ls, VKEY, visitor);
  }

  // ── UTM 파라미터
  var q = new URLSearchParams(location.search);
  function utm(name) { return (q.get(name) || "").slice(0, 120); }
  var utmNow = {
    source: utm("utm_source"),
    medium: utm("utm_medium"),
    campaign: utm("utm_campaign"),
    term: utm("utm_term"),
    content: utm("utm_content")
  };
  var hasUtm = !!(utmNow.source || utmNow.medium || utmNow.campaign);

  // ── 세션 식별 (30분 무활동 기준). 유입 경로는 "세션 첫 진입" 값을 계속 물고 간다.
  var sess = readJson(ls, SKEY);
  var fresh = !sess || !sess.id || (now - (sess.last || 0)) > SESSION_TIMEOUT;

  // 세션 도중에 UTM이 새로 붙어 들어오면 새 유입으로 본다(광고 클릭 등).
  if (!fresh && hasUtm && sess.utmKey !== JSON.stringify(utmNow)) fresh = true;

  if (fresh) {
    sess = {
      id: rid(),
      seq: 0,
      start: now,
      isNew: isNewVisitor,
      landing: location.pathname + location.search,
      ref: (document.referrer || "").slice(0, 500),
      utm: utmNow,
      utmKey: JSON.stringify(utmNow)
    };
  }

  function send(type, extra) {
    try {
      sess.last = Date.now();
      if (type === "pageview") sess.seq = (sess.seq || 0) + 1;
      writeJson(ls, SKEY, sess);

      var body = {
        v: 1,
        type: type,
        sid: sess.id,
        vid: visitor.id,
        seq: sess.seq || 1,
        isNew: sess.isNew ? 1 : 0,
        path: location.pathname + location.search,
        title: (document.title || "").slice(0, 160),
        landing: sess.landing,
        ref: sess.ref,
        utm: sess.utm,
        sw: window.screen ? window.screen.width : 0,
        tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || "",
        label: (extra && extra.label) || ""
      };

      var payload = JSON.stringify(body);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
      } else {
        fetch(ENDPOINT, { method: "POST", body: payload, keepalive: true, headers: { "content-type": "application/json" } });
      }
    } catch (e) { /* 수집 실패는 무시 */ }
  }

  // 대시보드 자기 자신은 집계하지 않는다.
  if (/\/dashboard(\.html)?$/.test(location.pathname)) return;

  send("pageview");

  // ── 주요 전환 클릭(전화상담 / 블로그 / 신청·결제)도 같이 남긴다.
  document.addEventListener("click", function (ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest("a,button") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      var text = (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      var label = "";

      if (/^tel:/i.test(href)) label = "전화상담";
      else if (/blog\.naver\.com/.test(href)) label = "블로그 이동";
      else if (/liveklass\.com/.test(href)) label = "강의 신청";
      else if (/checkout\.html/.test(href)) label = "결제 페이지";
      else if (/^https?:/i.test(href) && href.indexOf(location.host) === -1) label = "외부링크: " + text;

      if (label) send("click", { label: label });
    } catch (e) {}
  }, true);
})();
