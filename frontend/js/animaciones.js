(function () {
  const IN_MS = 320;
  let transitionSeq = 0;

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function reducedMotion() {
    return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearTransitionClasses(host) {
    const el = host || document.querySelector(".content");
    if (!el) return;
    el.classList.remove("spa-view-in", "spa-view-out", "spa-animating");
  }

  window.__cancelSpaTransition = function cancelSpaTransition(options = {}) {
    transitionSeq++;
    clearTransitionClasses(options.host || null);
  };

  window.__animateSpaTransition = async function animateSpaTransition(renderFn, options = {}) {
    if (typeof renderFn !== "function") return;

    const host = options.host || null;
    const el = host || document.querySelector(".content");
    const localSeq = ++transitionSeq;
    clearTransitionClasses(el);

    await Promise.resolve(renderFn());

    if (!el || localSeq !== transitionSeq || reducedMotion()) {
      clearTransitionClasses(el);
      return;
    }

    try {
      await nextFrame();
      if (localSeq !== transitionSeq) return;
      el.classList.add("spa-animating", "spa-view-in");
      await wait(IN_MS);
    } finally {
      if (localSeq === transitionSeq) {
        clearTransitionClasses(el);
      }
    }
  };
})();
