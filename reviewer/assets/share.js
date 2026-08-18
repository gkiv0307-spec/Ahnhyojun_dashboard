/*!
 * share.js — 팀 공유 저장
 *
 * 링크를 가진 사람들이 "같은 데이터"를 보게 하는 부분이다.
 * 저장 버튼을 누르면 현재 상태를 페이지 자체에 심어 새 버전으로 발행하고,
 * 이후 링크를 여는 모든 사람이 그 데이터를 받는다.
 *
 * 개인정보 보호
 *  - 공유 데이터는 비밀번호에서 유도한 키로 AES-GCM 암호화해서 심는다.
 *    따라서 링크만 있고 비밀번호를 모르면 소스를 열어도 명단을 읽을 수 없다.
 *  - 키는 페이지에 저장하지 않는다. 비밀번호를 넣어야 그때 만들어진다.
 *
 * 페이지 재구성
 *  - 발행에는 완전한 HTML 문서가 필요하다. 살아 있는 DOM 을 그대로 직렬화하면
 *    실행 중 상태와 런타임이 끼어들므로, 페이지의 원본 조각(스타일·스크립트·
 *    최초 마크업)을 부팅 시점에 붙잡아 두고 거기에 데이터만 갈아 끼워 다시 만든다.
 */
(function (global) {
  'use strict';

  var SEED_ID = 'seed-data';
  var ROOT_ID = 'app-root';

  var pristine = null;      // 부팅 직후의 원본 조각
  var seedMeta = null;      // 지금 보고 있는 공유본 정보
  var readOnly = false;     // 쓰기 거부를 한 번이라도 받으면 true

  /* ------------------------------------------------------------ 원본 확보 */
  /**
   * 페이지의 원본 조각을 붙잡는다.
   *
   * 반드시 "아무것도 실행되기 전"에 찍어야 한다. 화면이 조금이라도 움직인 뒤에
   * 찍으면 그 순간의 실행 상태가 그대로 발행본에 굳는다.
   * (실제로 잠금 해제 직후에 찍었더니 "확인 중…" 상태의 비활성 버튼이 박혀서
   *  다음 사람이 비밀번호를 넣을 수 없게 되는 문제가 있었다.)
   * 그래서 이 파일이 로드되는 시점에 바로 한 번 찍어 둔다.
   */
  function capture() {
    if (pristine) return pristine;
    var root = document.getElementById(ROOT_ID);
    var style = document.querySelector('style');
    var script = document.getElementById('app-script');
    pristine = {
      title: (document.querySelector('title') || {}).textContent || '리뷰노트 체험단 관리',
      markup: root ? root.innerHTML : '',
      style: style ? style.textContent : '',
      script: script ? script.textContent : ''
    };
    return pristine;
  }

  /* ------------------------------------------------------------ 암복호화 */
  function bytesToB64(u) {
    var s = '', CHUNK = 0x8000;
    for (var i = 0; i < u.length; i += CHUNK) s += String.fromCharCode.apply(null, u.subarray(i, i + CHUNK));
    return btoa(s);
  }
  function b64ToBytes(b) {
    var bin = atob(b), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function encrypt(text) {
    if (!global.Lock || !global.Lock.hasKey()) return Promise.reject(new Error('no-key'));
    var iv = global.crypto.getRandomValues(new Uint8Array(12));
    return global.Lock.key().then(function (key) {
      if (!key) throw new Error('no-key');
      return global.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text));
    }).then(function (buf) {
      return { iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(buf)) };
    });
  }

  function decrypt(payload) {
    if (!global.Lock || !global.Lock.hasKey()) return Promise.reject(new Error('no-key'));
    return global.Lock.key().then(function (key) {
      if (!key) throw new Error('no-key');
      return global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.data));
    }).then(function (buf) { return new TextDecoder().decode(buf); });
  }

  /* --------------------------------------------------------- 공유본 읽기 */
  function rawSeed() {
    var el = document.getElementById(SEED_ID);
    if (!el) return null;
    var txt = (el.textContent || '').trim();
    if (!txt || txt === 'null') return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  function hasSeed() { return !!rawSeed(); }

  /**
   * 공유본을 풀어서 돌려준다.
   * 반환: Promise<{state, version} | null>  — 비밀번호가 안 맞으면 reject
   */
  function loadSeed() {
    var seed = rawSeed();
    if (!seed) return Promise.resolve(null);
    seedMeta = { version: seed.version, savedAt: seed.savedAt, savedBy: seed.savedBy };
    return decrypt(seed.payload).then(function (json) {
      return { state: JSON.parse(json), version: seed.version, savedAt: seed.savedAt };
    });
  }

  function seedInfo() { return seedMeta; }
  function isReadOnly() { return readOnly; }

  /* --------------------------------------------------------- 페이지 만들기 */
  function escapeForScript(json) {
    // </script> 로 스크립트가 끊기지 않도록 여는 꺾쇠를 이스케이프한다
    return json.replace(/</g, '\\u003c');
  }

  function buildPage(seedObj) {
    var p = capture();
    return '<!doctype html>\n<html lang="ko">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<meta name="robots" content="noindex, nofollow">\n' +
      '<title>' + p.title + '</title>\n' +
      '<style>\n' + p.style + '\n</style>\n' +
      '</head>\n<body>\n' +
      '<div id="' + ROOT_ID + '">' + p.markup + '</div>\n' +
      '<script id="' + SEED_ID + '" type="application/json">' +
      escapeForScript(JSON.stringify(seedObj)) + '<\/script>\n' +
      '<script id="app-script">\n' + p.script + '\n<\/script>\n' +
      '</body>\n</html>\n';
  }

  /* ------------------------------------------------------------ 발행 */
  var MESSAGES = {
    not_writer: '이 대시보드를 수정할 권한이 없습니다. 보기 전용으로 이용하세요.',
    not_granted: '이 대시보드를 수정할 권한이 없습니다. 보기 전용으로 이용하세요.',
    consent_required: '이 대시보드를 수정할 권한이 없습니다. 보기 전용으로 이용하세요.',
    capability_disabled: '이 화면에서는 공유 저장을 쓸 수 없습니다.',
    capability_removed: '이 화면에서는 공유 저장을 쓸 수 없습니다.',
    not_declared: '이 화면에서는 공유 저장을 쓸 수 없습니다.',
    too_large: '데이터가 너무 커서 공유 저장에 실패했습니다. 지난 기간 자료를 정리한 뒤 다시 시도하세요.',
    rate_limited: '저장이 너무 잦습니다. 잠시 후 한 번에 저장하세요.',
    invalid_content: '페이지를 만들지 못했습니다. 새로고침 후 다시 시도하세요.',
    transform_error: '페이지를 만들지 못했습니다. 새로고침 후 다시 시도하세요.'
  };

  var READ_ONLY_CODES = ['not_writer', 'not_granted', 'consent_required', 'not_declared',
    'capability_disabled', 'capability_removed'];

  /**
   * 현재 상태를 새 버전으로 발행한다.
   * 성공하면 이 화면을 포함해 열려 있는 모든 화면이 새 버전으로 다시 불린다.
   * 반환: Promise<{ok:true} | {ok:false, code, message}>
   */
  function publish(state, meta) {
    if (!global.claude || typeof global.claude.use !== 'function') {
      return Promise.resolve({ ok: false, code: 'unsupported',
        message: '발행된 링크에서만 팀 공유 저장을 쓸 수 있습니다.' });
    }
    if (!global.Lock || !global.Lock.hasKey()) {
      return Promise.resolve({ ok: false, code: 'no-key',
        message: '비밀번호를 다시 입력한 뒤 저장하세요.' });
    }

    var p = capture();
    if (!p.script || !p.markup) {
      return Promise.resolve({ ok: false, code: 'no-source',
        message: '페이지 원본을 읽지 못해 저장할 수 없습니다. 새로고침 후 다시 시도하세요.' });
    }

    return global.claude.use('artifact').then(function (artifact) {
      if (!artifact) {
        readOnly = true;
        return { ok: false, code: 'not_granted', message: MESSAGES.not_granted };
      }
      return encrypt(JSON.stringify(state)).then(function (payload) {
        var seedObj = {
          version: String(Date.now()),
          savedAt: new Date().toISOString(),
          savedBy: (meta && meta.by) || '',
          payload: payload
        };
        return artifact.publish(buildPage(seedObj));
      }).then(function () {
        return { ok: true };
      }).catch(function (err) {
        var code = (err && err.code) || 'upstream_error';
        if (READ_ONLY_CODES.indexOf(code) >= 0) readOnly = true;
        if (code === 'conflict') {
          // 다른 사람이 먼저 저장했다. 화면은 이미 최신본으로 다시 불리는 중이라 할 일이 없다.
          return { ok: false, code: 'conflict',
            message: '다른 사람이 먼저 저장했습니다. 최신 내용을 불러옵니다.' };
        }
        return { ok: false, code: code,
          message: MESSAGES[code] || '공유 저장에 실패했습니다. 잠시 후 다시 시도하세요.' };
      });
    });
  }

  // 스크립트가 읽히는 시점에 원본을 확보한다 (아직 아무 핸들러도 돌지 않은 상태)
  try { capture(); } catch (e) { /* 원본을 못 찍으면 공유 저장만 막힌다 */ }

  global.Share = {
    capture: capture,
    hasSeed: hasSeed,
    loadSeed: loadSeed,
    seedInfo: seedInfo,
    isReadOnly: isReadOnly,
    publish: publish,
    buildPage: buildPage
  };
})(window);
