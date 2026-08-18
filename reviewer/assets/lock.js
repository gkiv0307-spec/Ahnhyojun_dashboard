/*!
 * lock.js — 대시보드 비밀번호 잠금
 *
 * 비밀번호 원문은 이 파일에 들어 있지 않다. PBKDF2-HMAC-SHA256 으로 늘린
 * 해시와 솔트만 심어두고, 입력값을 같은 방식으로 늘려 비교한다.
 * 따라서 소스를 열어봐도 비밀번호를 알아낼 수는 없다.
 *
 * 다만 이것은 "링크를 아는 사람의 우연한 열람"을 막는 잠금이지,
 * 서버가 지키는 접근 제어가 아니다. 페이지 코드는 보는 사람 브라우저에서
 * 돌아가므로, 링크를 가진 사람이 작정하면 화면 자체는 열 수 있다.
 * 진짜 접근 제어는 아티팩트 공유 범위(비공개/지정 공유)로 해야 한다.
 * 비밀번호 변경은 set-password.py 를 쓴다.
 */
(function (global) {
  'use strict';

  /* 웹폰트는 비동기로 붙인다.
     <link rel=stylesheet> 를 문서에 그대로 두면 폰트 서버가 느리거나 막힌 망에서
     스타일시트를 기다리느라 화면이 빈 채로 멈춘다. 폰트가 안 와도 CSS 의
     대체 서체 목록으로 그대로 읽히므로, 렌더링을 막지 않는 쪽이 맞다. */
  (function loadFonts() {
    var href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700' +
               '&family=IBM+Plex+Mono:wght@500;600&display=swap';
    try {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      (document.head || document.documentElement).appendChild(link);
    } catch (e) { /* 폰트는 없어도 그만 */ }
  })();

  var GATE = {
    salt: 'sn0Ex8bdQc1fWObFdXCMsA==',
    iter: 210000,
    hash: '4D9cuevDI22VrsEcTUARFu9D6+bQXO1sf3ZGybhXypQ='
  };

  var REMEMBER_HOURS = 12;
  var STORE_KEY = 'reviewnote-dashboard-unlock';
  var MAX_TRIES = 5;
  var COOLDOWN_MS = 30000;

  var ready = [];
  var unlocked = false;
  var tries = 0;
  var blockedUntil = 0;

  /* ----------------------------------------------------------- 유틸 */
  function b64ToBytes(s) {
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function bytesToB64(u) {
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  function sameHash(a, b) {                   // 길이가 같을 때 조기 종료하지 않는 비교
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  function derive(password) {
    var subtle = global.crypto && global.crypto.subtle;
    if (!subtle) return Promise.reject(new Error('no-subtle'));
    return subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return subtle.deriveBits(
          { name: 'PBKDF2', salt: b64ToBytes(GATE.salt), iterations: GATE.iter, hash: 'SHA-256' },
          key, 256);
      })
      .then(function (bits) { return bytesToB64(new Uint8Array(bits)); });
  }

  /* --------------------------------------------------- 기억하기 (선택) */
  function readRemembered() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      var v = JSON.parse(raw);
      return v && v.until > Date.now() && v.tag === GATE.hash.slice(0, 12);
    } catch (e) { return false; }
  }
  function remember() {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify({
        until: Date.now() + REMEMBER_HOURS * 3600 * 1000,
        tag: GATE.hash.slice(0, 12)
      }));
    } catch (e) { /* 저장이 막힌 환경에서는 이번 방문에만 열린다 */ }
  }
  function forget() {
    try { global.localStorage.removeItem(STORE_KEY); } catch (e) { /* 무시 */ }
  }

  /* ----------------------------------------------------------- 화면 */
  function el(id) { return document.getElementById(id); }

  function setError(msg) {
    var box = el('lock-error');
    if (!box) return;
    box.textContent = msg || '';
    box.style.visibility = msg ? 'visible' : 'hidden';
  }

  function open() {
    unlocked = true;
    document.body.classList.add('unlocked');
    var lock = el('lock');
    if (lock) lock.hidden = true;
    ready.forEach(function (fn) { fn(); });
    ready = [];
  }

  function submit() {
    var input = el('lock-input');
    var btn = el('lock-submit');
    if (!input || !btn) return;

    var left = blockedUntil - Date.now();
    if (left > 0) {
      setError(Math.ceil(left / 1000) + '초 후에 다시 시도할 수 있습니다.');
      return;
    }
    var pw = input.value;
    if (!pw) { setError('비밀번호를 입력하세요.'); input.focus(); return; }

    btn.disabled = true;
    btn.textContent = '확인 중…';
    setError('');

    derive(pw).then(function (hash) {
      if (sameHash(hash, GATE.hash)) {
        if (el('lock-remember') && el('lock-remember').checked) remember();
        open();
        return;
      }
      tries += 1;
      input.value = '';
      if (tries >= MAX_TRIES) {
        blockedUntil = Date.now() + COOLDOWN_MS;
        tries = 0;
        setError('비밀번호가 여러 번 틀렸습니다. 30초 후에 다시 시도하세요.');
      } else {
        setError('비밀번호가 맞지 않습니다. (' + (MAX_TRIES - tries) + '회 남음)');
      }
      input.focus();
    }).catch(function () {
      setError('이 브라우저에서는 비밀번호 확인 기능을 쓸 수 없습니다. 최신 브라우저에서 열어 주세요.');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = '열기';
    });
  }

  function init() {
    var lock = el('lock');
    if (!lock) { open(); return; }          // 잠금 화면이 없으면 그대로 진행

    if (readRemembered()) { open(); return; }

    lock.hidden = false;
    var input = el('lock-input');
    var btn = el('lock-submit');
    setError('');
    if (btn) btn.addEventListener('click', submit);
    if (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      setTimeout(function () { input.focus(); }, 60);
    }
  }

  global.Lock = {
    /** 잠금이 풀린 뒤에 실행할 콜백 등록 */
    ready: function (fn) { unlocked ? fn() : ready.push(fn); },
    isUnlocked: function () { return unlocked; },
    lockAgain: function () { forget(); global.location.reload(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
