/* sg-page-forge 모션 프리셋 런타임 — 의존성 0, 바닐라. wiki/systems/motion.md 참조.
   appear(IO 1회) · scroll-progress(--p 발행) · reveal-mask(IO 1회) · layout-morph(View Transitions 래퍼).
   hover/press는 CSS만. reduced-motion이면 아무것도 움직이지 않고 전부 보인다. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('js');

  /* appear · reveal-mask — 보이면 한 번 켜고 관찰 해제(재은닉 없음) */
  var targets = doc.querySelectorAll('[data-appear], [data-reveal-mask]');
  if (REDUCED || !('IntersectionObserver' in window)) {
    for (var i = 0; i < targets.length; i++) targets[i].classList.add('is-in');
  } else {
    var io = new IntersectionObserver(function (entries) {
      for (var j = 0; j < entries.length; j++) {
        if (!entries[j].isIntersecting) continue;
        var el = entries[j].target;
        var delay = el.getAttribute('data-appear-delay') || el.getAttribute('data-reveal-delay');
        if (delay) el.style.setProperty('--m-delay', delay + 'ms');
        el.classList.add('is-in');
        io.unobserve(el);
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    for (var k = 0; k < targets.length; k++) io.observe(targets[k]);
  }

  /* scroll-progress — 요소가 뷰포트 아래 끝에 닿을 때 0, 위 끝을 지날 때 1. rAF 1개로 묶는다 */
  var scrollers = doc.querySelectorAll('[data-scroll-progress]');
  if (scrollers.length && !REDUCED) {
    var ticking = false;
    var update = function () {
      ticking = false;
      var vh = window.innerHeight || root.clientHeight;
      for (var s = 0; s < scrollers.length; s++) {
        var r = scrollers[s].getBoundingClientRect();
        var p = (vh - r.top) / (vh + r.height);
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        scrollers[s].style.setProperty('--p', p.toFixed(3));
      }
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* layout-morph — 같은 view-transition-name 요소를 자동 모핑. 미지원이면 즉시 실행 */
  function morph(mutate) {
    if (REDUCED || typeof doc.startViewTransition !== 'function') { mutate(); return Promise.resolve(); }
    return doc.startViewTransition(mutate).finished;
  }

  window.SG = window.SG || {};
  window.SG.motion = { morph: morph, reduced: REDUCED };
})();
