(function () {
  'use strict';

  /* Mobile menu */
  const menuToggle = document.querySelector('.mobile-menu-toggle');
  const menuBackdrop = document.querySelector('.mobile-menu-backdrop');
  const mobileMenu = document.querySelector('.mobile-menu');
  const menuClose = mobileMenu ? mobileMenu.querySelector('.mobile-menu-head button') : null;

  function setMenuOpen(open) {
    if (!menuToggle || !menuBackdrop || !mobileMenu) return;
    menuToggle.classList.toggle('open', open);
    menuBackdrop.classList.toggle('open', open);
    mobileMenu.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }

  if (menuToggle) menuToggle.addEventListener('click', () => setMenuOpen(!menuToggle.classList.contains('open')));
  if (menuBackdrop) menuBackdrop.addEventListener('click', () => setMenuOpen(false));
  if (menuClose) menuClose.addEventListener('click', () => setMenuOpen(false));
  if (mobileMenu) {
    mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenuOpen(false)));
  }

  /* Count-up stats */
  const countEls = document.querySelectorAll('.count-up[data-target]');
  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        countObserver.unobserve(el);
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.textContent.replace(/^0+/, '');
        const duration = 1200;
        const start = performance.now();
        el.classList.add('is-counting');
        function tick(now) {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          const value = Math.round(target * eased);
          el.textContent = value + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.6 }
  );
  countEls.forEach((el) => countObserver.observe(el));

  /* Region filter */
  const filterBar = document.querySelector('.filter-bar');
  const propertyGrids = document.querySelectorAll('.property-feed-grid');
  const propertyCards = document.querySelectorAll('.property-feed-grid[data-status-panel="active"] .property-feed-card');
  const filterEmpty = document.querySelector('.filter-empty');

  function applyRegionFilter(region) {
    let visibleCount = 0;
    propertyGrids.forEach((grid) => {
      const gridVisible = !grid.hidden;
      grid.querySelectorAll('.property-feed-card').forEach((card) => {
        const show = region === '전체' || card.dataset.region === region;
        card.style.display = show ? '' : 'none';
        if (show && gridVisible) visibleCount += 1;
      });
    });
    if (filterEmpty) filterEmpty.hidden = visibleCount > 0;
  }

  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      filterBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyRegionFilter(btn.textContent.trim());
    });
  }

  /* Property status tabs (진행중 / 낙찰완료) */
  const statusTabs = document.querySelectorAll('.status-tabs button[data-status-tab]');
  statusTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      statusTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = tab.dataset.statusTab;
      propertyGrids.forEach((grid) => {
        grid.hidden = grid.dataset.statusPanel !== target;
      });
      const activeRegionBtn = filterBar ? filterBar.querySelector('button.active') : null;
      applyRegionFilter(activeRegionBtn ? activeRegionBtn.textContent.trim() : '전체');
    });
  });

  /* Hero property carousel (built from the property grid cards) */
  const heroWindow = document.querySelector('.hero-feature-window');
  const heroDotsWrap = document.querySelector('.hero-feature-controls div[aria-label="물건 슬라이드 선택"]');
  const heroNextBtn = document.querySelector('.hero-feature-controls > button');
  const heroCounter = document.querySelector('.hero-feature-controls > span');
  const heroProgress = document.querySelector('.hero-rotation-progress span');

  if (heroWindow && propertyCards.length) {
    const slides = Array.from(propertyCards)
      .slice(0, 3)
      .map((card) => ({
        region: card.querySelector('.property-feed-price small')?.textContent || '',
        type: card.querySelector('.property-feed-badges span')?.textContent || '',
        price: card.querySelector('.property-feed-price strong')?.textContent || '',
        title: card.querySelector('.property-feed-overlay h3')?.textContent || '',
        desc: (card.querySelector('.property-feed-cta')?.textContent || '').replace('↗', '').trim(),
        img: card.querySelector('.property-feed-visual img')?.getAttribute('src') || '',
        href: card.querySelector('.property-feed-link')?.getAttribute('href') || '#',
      }));

    let heroIndex = 0;
    let heroTimer = null;

    function renderHero(i) {
      const s = slides[i];
      heroWindow.innerHTML =
        '<a class="hero-feature-card" href="' +
        s.href +
        '" target="_blank" rel="noreferrer"><div class="hero-feature-image"><img src="' +
        s.img +
        '" alt="' +
        s.title +
        '"/><span>' +
        s.region +
        '</span><time>' +
        s.type.split('·').pop().trim() +
        '</time></div><div class="hero-feature-copy"><small>대표 분석 물건</small><h3>' +
        s.title +
        '</h3><p>' +
        s.desc +
        '</p><div><strong>' +
        s.price +
        '</strong><b>상세 분석 보기 ↗</b></div></div></a>';
      if (heroDotsWrap) {
        const dots = heroDotsWrap.querySelectorAll('button');
        dots.forEach((d, di) => d.classList.toggle('active', di === i));
      }
      if (heroCounter) heroCounter.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
      if (heroProgress) {
        heroProgress.style.animation = 'none';
        void heroProgress.offsetWidth;
        heroProgress.style.animation = '';
      }
    }

    function goTo(i) {
      heroIndex = (i + slides.length) % slides.length;
      renderHero(heroIndex);
    }

    function restartTimer() {
      if (heroTimer) clearInterval(heroTimer);
      heroTimer = setInterval(() => goTo(heroIndex + 1), 3200);
    }

    if (heroDotsWrap) {
      heroDotsWrap.querySelectorAll('button').forEach((dot, i) => {
        dot.addEventListener('click', () => {
          goTo(i);
          restartTimer();
        });
      });
    }
    if (heroNextBtn) {
      heroNextBtn.addEventListener('click', () => {
        goTo(heroIndex + 1);
        restartTimer();
      });
    }

    renderHero(0);
    restartTimer();
  }

  /* Course finder quiz (3 questions -> recommended course) */
  const quiz = document.querySelector('.course-quiz');
  const RESULTS = {
    beginner: {
      badge: 'RECOMMENDED',
      title: '초급반',
      tagline: '경매가 처음이라면 여기서 시작하세요.',
      desc: '용어와 절차, 권리분석 기초부터 모의입찰까지 5주 동안 기본기를 완성합니다.',
      href: '#course-beginner',
      cta: '초급반 자세히 보기',
    },
    intermediate: {
      badge: 'RECOMMENDED',
      title: '중급반',
      tagline: '기초는 아는데 수익 계산이 막막하다면.',
      desc: '배당표 분석, 세금, 특수물건까지 다루며 실전 투자 전략을 익히는 과정입니다.',
      href: '#course-intermediate',
      cta: '중급반 자세히 보기',
    },
    coaching: {
      badge: 'RECOMMENDED',
      title: '낙찰반',
      tagline: '입찰 경험이 있고 실제 낙찰이 목표라면.',
      desc: '대표 추천 물건과 본인 물건 분석, 물건 브리핑과 개별 상담으로 낙찰 성공률을 높입니다.',
      href: '#course-coaching',
      cta: '낙찰반 자세히 보기',
    },
    consulting: {
      badge: 'RECOMMENDED',
      title: '1:1 컨설팅',
      tagline: '시간이 부족하다면 대표와 1:1로.',
      desc: '물건 선정부터 권리분석, 입찰가 산정, 낙찰 후 관리까지 맞춤으로 진행합니다.',
      href: '#course-consulting',
      cta: '1:1 컨설팅 알아보기',
    },
  };

  const QUESTIONS = [
    {
      label: 'QUESTION 01',
      title: '현재 경매 경험은 어느 정도인가요?',
      subtitle: '지금 상태와 가장 가까운 답을 선택해 주세요.',
      options: [
        { title: '경매가 완전히 처음이에요', detail: '용어와 절차부터 차근차근 배우고 싶어요.', result: 'beginner' },
        { title: '기본 용어와 권리분석은 알아요', detail: '좋은 물건을 고르고 수익을 계산하는 게 어려워요.', result: 'intermediate' },
        { title: '입찰 경험이 있고 실제 낙찰을 원해요', detail: '입찰할 물건을 찾고 낙찰까지 집중하고 싶어요.', result: 'coaching' },
        { title: '시간이 부족해 전문가 도움이 필요해요', detail: '대표와 1:1로 빠르게 진행하고 싶어요.', result: 'consulting' },
      ],
    },
    {
      label: 'QUESTION 02',
      title: '지금 가장 필요한 도움은 무엇인가요?',
      subtitle: '가장 아쉬운 부분에 가까운 답을 선택해 주세요.',
      options: [
        { title: '용어·절차 같은 기초 지식', detail: '등기부, 권리분석 같은 기본기가 아직 부족해요.', result: 'beginner' },
        { title: '수익 계산과 권리분석 실력', detail: '물건은 보이는데 확신을 갖고 판단하기 어려워요.', result: 'intermediate' },
        { title: '매주 추천 물건과 낙찰 전략', detail: '좋은 물건을 꾸준히 추천받고 싶어요.', result: 'coaching' },
        { title: '물건 선정부터 낙찰까지 전담 관리', detail: '처음부터 끝까지 전문가가 맡아줬으면 해요.', result: 'consulting' },
      ],
    },
    {
      label: 'QUESTION 03',
      title: '어떤 방식으로 진행하고 싶으신가요?',
      subtitle: '편하게 느껴지는 학습·진행 방식을 선택해 주세요.',
      options: [
        { title: '처음부터 차근차근, 정해진 커리큘럼', detail: '순서대로 배우면서 기본기를 쌓고 싶어요.', result: 'beginner' },
        { title: '실전 사례 중심으로 감각 키우기', detail: '실제 사례를 보며 판단력을 키우고 싶어요.', result: 'intermediate' },
        { title: '매주 브리핑 받으며 낙찰에 집중', detail: '꾸준한 물건 브리핑과 피드백이 필요해요.', result: 'coaching' },
        { title: '대표와 1:1로 빠르게', detail: '혼자 고민하지 않고 바로 진행하고 싶어요.', result: 'consulting' },
      ],
    },
  ];

  let quizStep = 0;
  const quizAnswers = [];

  function renderQuizProgress() {
    const pct = (((quizStep >= QUESTIONS.length ? QUESTIONS.length : quizStep + 1) / QUESTIONS.length) * 100).toFixed(6);
    return (
      '<div class="quiz-progress"><div><span>나에게 맞는 과정 진단</span><strong>' +
      Math.min(quizStep + 1, QUESTIONS.length) +
      ' / ' +
      QUESTIONS.length +
      '</strong></div><i aria-hidden="true"><b style="width:' +
      pct +
      '%"></b></i></div>'
    );
  }

  function renderQuizQuestion() {
    if (!quiz) return;
    const q = QUESTIONS[quizStep];
    const optionsHtml = q.options
      .map(
        (opt, i) =>
          '<button type="button" data-result="' +
          opt.result +
          '"><span>' +
          String(i + 1).padStart(2, '0') +
          '</span><div><strong>' +
          opt.title +
          '</strong><small>' +
          opt.detail +
          '</small></div><b aria-hidden="true">→</b></button>'
      )
      .join('');
    quiz.innerHTML =
      renderQuizProgress() +
      '<div class="quiz-question"><small>' +
      q.label +
      '</small><h3>' +
      q.title +
      '</h3><p>' +
      q.subtitle +
      '</p><div class="quiz-options">' +
      optionsHtml +
      '</div></div>';
    quiz.querySelectorAll('.quiz-options button').forEach((btn) => {
      btn.addEventListener('click', () => {
        quizAnswers.push(btn.dataset.result);
        quizStep += 1;
        if (quizStep >= QUESTIONS.length) {
          showQuizResult(computeQuizResult(quizAnswers));
        } else {
          renderQuizQuestion();
        }
      });
    });
  }

  function computeQuizResult(answers) {
    const counts = {};
    answers.forEach((key) => {
      counts[key] = (counts[key] || 0) + 1;
    });
    let best = answers[0];
    let bestCount = 0;
    answers.forEach((key) => {
      if (counts[key] > bestCount) {
        best = key;
        bestCount = counts[key];
      }
    });
    return best;
  }

  function showQuizResult(resultKey) {
    if (!quiz) return;
    const r = RESULTS[resultKey];
    quiz.innerHTML =
      renderQuizProgress() +
      '<div class="quiz-result"><small>진단 결과</small><span class="quiz-result-badge">' +
      r.badge +
      '</span><h3>' +
      r.title +
      '</h3><strong>' +
      r.tagline +
      '</strong><div>' +
      r.desc +
      '</div><a href="' +
      r.href +
      '">' +
      r.cta +
      ' <span>→</span></a><button type="button">다시 진단하기</button></div>';
    quiz.querySelector('.quiz-result > button').addEventListener('click', () => {
      quizStep = 0;
      quizAnswers.length = 0;
      renderQuizQuestion();
    });
  }

  if (quiz) renderQuizQuestion();

  /* Review tabs */
  const reviewTabs = document.querySelectorAll('.review-tabs button[role="tab"]');
  const reviewTrack = document.querySelector('.review-track');
  const reviewPlaceholder = document.querySelector('.review-placeholder');
  reviewTabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      reviewTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const showTrack = i === 0;
      if (reviewTrack) reviewTrack.style.display = showTrack ? '' : 'none';
      if (reviewPlaceholder) reviewPlaceholder.classList.toggle('show', !showTrack);
    });
  });

  /* Review image lightbox */
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML =
    '<button type="button" class="lightbox-close" aria-label="닫기">×</button><div class="lightbox-inner"><img alt=""/><div class="lightbox-caption"></div></div>';
  document.body.appendChild(lightbox);
  const lightboxImg = lightbox.querySelector('img');
  const lightboxCaption = lightbox.querySelector('.lightbox-caption');

  function openLightbox(src, caption) {
    lightboxImg.src = src;
    lightboxImg.alt = caption || '';
    lightboxCaption.textContent = caption || '';
    lightbox.classList.add('open');
  }
  function closeLightbox() {
    lightbox.classList.remove('open');
    lightboxImg.src = '';
  }
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox-close')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  document.querySelectorAll('.review-card').forEach((card) => {
    if (card.hasAttribute('tabindex') && card.getAttribute('tabindex') === '-1') return;
    card.addEventListener('click', () => {
      const img = card.querySelector('img');
      const caption = card.querySelector('.review-card-copy strong');
      if (img) openLightbox(img.src, caption ? caption.textContent : '');
    });
  });
})();
