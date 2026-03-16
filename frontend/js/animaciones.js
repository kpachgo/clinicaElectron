(function () {
  const OUT_MS = 220;
  const IN_MS = 320;
  const QUEUE_GAP_MS = 14;
  let chain = Promise.resolve();

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function reducedMotion() {
    return !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  async function runTransition(renderFn, host) {
    const el = host || document.querySelector(".content");
    if (!el || typeof renderFn !== "function" || reducedMotion()) {
      await Promise.resolve(renderFn && renderFn());
      return;
    }

    el.classList.remove("spa-view-in", "spa-view-out");
    el.classList.add("spa-animating", "spa-view-out");
    await wait(OUT_MS);

    await Promise.resolve(renderFn());
    await nextFrame();

    el.classList.remove("spa-view-out");
    el.classList.add("spa-view-in");
    await wait(IN_MS);

    el.classList.remove("spa-view-in", "spa-animating");
    await wait(QUEUE_GAP_MS);
  }

  window.__animateSpaTransition = function animateSpaTransition(renderFn, options = {}) {
    const host = options.host || null;
    chain = chain.then(() => runTransition(renderFn, host)).catch((err) => {
      console.error("Error en transicion SPA:", err);
      return Promise.resolve(renderFn && renderFn());
    });
    return chain;
  };
})();
