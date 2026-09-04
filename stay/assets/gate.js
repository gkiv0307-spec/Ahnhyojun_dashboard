/* 옆커폰 숙박 예약관리 — 공유 링크 접근 잠금
 *
 * 링크를 사내에 뿌렸을 때 무관한 사람이 실수로 들어오는 것을 막는 문턱이다.
 * 코드가 브라우저에서 실행되므로 개발자도구를 아는 사람은 우회할 수 있다.
 * 진짜 보안이 필요하면 서버 인증(사내 SSO)을 붙여야 한다.
 *
 * 비밀번호는 배포 시점 상수다. 바꾸려면 window.STAY_PASSCODE 를 지정하거나
 * 아래 기본값을 고친 뒤 다시 배포한다.
 */
(function (global) {
  'use strict';

  var KEY = 'ykp_stay_gate';

  function passcode(){ return String(global.STAY_PASSCODE || '0000'); }
  function label(){ return global.STAY_MODE === 'staff' ? '숙박 예약 신청' : '숙박 예약관리 시스템'; }

  /* 한 번 풀면 이 기기에서는 다시 묻지 않는다(직원들이 매번 입력하지 않도록).
   * 비밀번호가 바뀌면 저장값이 달라 자동으로 다시 묻는다. */
  function unlocked(){
    try { return global.localStorage.getItem(KEY) === passcode(); }
    catch (e) { return unlockedMemory; }
  }
  var unlockedMemory = false;

  function remember(){
    unlockedMemory = true;
    try { global.localStorage.setItem(KEY, passcode()); } catch (e) {}
  }

  var Gate = {
    locked: function(){ return !unlocked(); },

    /** 잠금 화면을 그린다. 풀리면 onUnlock() 을 호출한다. */
    render: function (onUnlock) {
      if (document.getElementById('stay-gate')) return;

      var wrap = document.createElement('div');
      wrap.id = 'stay-gate';
      wrap.className = 'gate';
      wrap.innerHTML =
        '<form class="gate-card" autocomplete="off">' +
          '<div class="gate-brand">옆커폰</div>' +
          '<h1>' + label() + '</h1>' +
          '<p>사내 공용 링크입니다. 안내받은 비밀번호를 입력해주세요.</p>' +
          '<input class="gate-input" id="gate-pw" type="password" inputmode="numeric" ' +
                 'autocomplete="off" placeholder="••••" aria-label="비밀번호">' +
          '<div class="gate-err" id="gate-err" role="alert"></div>' +
          '<button class="gate-btn" type="submit">들어가기</button>' +
          '<div class="gate-foot">비밀번호를 모르시면 부동산팀 010-8347-2699 로 문의해주세요.</div>' +
        '</form>';
      document.body.appendChild(wrap);

      var input = wrap.querySelector('#gate-pw');
      var err = wrap.querySelector('#gate-err');
      setTimeout(function(){ input.focus(); }, 50);

      wrap.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (input.value.trim() === passcode()) {
          remember();
          wrap.remove();
          if (onUnlock) onUnlock();
          return;
        }
        err.textContent = '비밀번호가 맞지 않습니다.';
        wrap.querySelector('.gate-card').classList.remove('shake');
        void wrap.offsetWidth;                     /* 애니메이션 재시작 */
        wrap.querySelector('.gate-card').classList.add('shake');
        input.value = '';
        input.focus();
      });
    }
  };

  global.Gate = Gate;
})(window);
