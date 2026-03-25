// js/error404.js
(function () {
  const DEFAULT_MESSAGE = "Opps ocurrio un error de conexion";
  let root = null;
  let messageEl = null;
  let hideTimer = null;
  let lastShownAt = 0;

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function close() {
    clearHideTimer();
    if (!root) return;
    root.classList.remove("show");
    root.setAttribute("aria-hidden", "true");
  }
  function hintUseButtons() {
    if (!root) return;
    const card = root.querySelector(".error404-card");
    if (!card) return;
    card.classList.remove("nudge");
    void card.offsetWidth;
    card.classList.add("nudge");
  }
  function hardReload() {
    clearHideTimer();

    // fuerza recarga inmediata con cache-busting
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_refresh", Date.now().toString());
      window.location.replace(url.toString());
    } catch (_err) {
      window.location.reload();
    }
  }

  function ensureNode() {
    if (root) return;

    const node = document.createElement("div");
    node.id = "error404-overlay";
    node.className = "error404-overlay";
    node.setAttribute("aria-hidden", "true");
    node.innerHTML = `
      <div class="error404-card" role="alertdialog" aria-modal="true" aria-label="Error 404">
        <h2 class="error404-title">404</h2>
        <p class="error404-subtitle">Conexion con el servidor interrumpida</p>

        <div class="error404-svg-wrap">
          <svg class="error404-svg" viewBox="0 0 520 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse class="error404-bubble orange" cx="170" cy="90" rx="70" ry="44"/>
            <ellipse class="error404-bubble red" cx="260" cy="78" rx="92" ry="52"/>
            <ellipse class="error404-bubble yellow" cx="352" cy="92" rx="80" ry="50"/>
            <ellipse class="error404-bubble" cx="132" cy="128" rx="82" ry="50"/>
            <ellipse class="error404-bubble" cx="260" cy="130" rx="132" ry="62"/>
            <ellipse class="error404-bubble" cx="388" cy="128" rx="80" ry="50"/>

            <text class="error404-digit d4l" x="165" y="145" text-anchor="middle">4</text>
            <text class="error404-digit d0" x="258" y="146" text-anchor="middle">0</text>
            <text class="error404-digit d4r" x="350" y="145" text-anchor="middle">4</text>

            <circle class="error404-spark s1" cx="230" cy="192" r="4"/>
            <circle class="error404-spark s2" cx="248" cy="198" r="5"/>
            <circle class="error404-spark s3" cx="266" cy="194" r="4"/>
            <circle class="error404-spark s4" cx="285" cy="201" r="5"/>
            <circle class="error404-spark s5" cx="304" cy="193" r="4"/>
            <circle class="error404-spark s6" cx="322" cy="197" r="5"/>
          </svg>
        </div>

        <p id="error404-message" class="error404-message">${DEFAULT_MESSAGE}</p>
        <div class="error404-actions">
          <button type="button" class="error404-btn close" id="error404-close">Cerrar</button>
          <button type="button" class="error404-btn retry" id="error404-retry">Reintentar</button>
        </div>
      </div>
    `;

    document.body.appendChild(node);
    root = node;
    messageEl = node.querySelector("#error404-message");

    const btnClose = node.querySelector("#error404-close");
    const btnRetry = node.querySelector("#error404-retry");

    if (btnClose) btnClose.addEventListener("click", close);
    if (btnRetry) btnRetry.addEventListener("click", hardReload);

    node.addEventListener("click", e => {
      if (e.target === node) hintUseButtons();
    });
  }

  function show(options = {}) {
    const now = Date.now();
    if (now - lastShownAt < 350) return;
    lastShownAt = now;

    ensureNode();
    if (!root) return;

    const message = String(options.message || DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE;
    if (messageEl) messageEl.textContent = message;

    root.classList.add("show");
    root.setAttribute("aria-hidden", "false");

    clearHideTimer();
    const autoCloseMs = Number(options.autoCloseMs || 0);
    if (autoCloseMs > 0) {
      hideTimer = setTimeout(close, autoCloseMs);
    }
  }

  window.showServerError404 = show;
  window.hideServerError404 = close;
  window.notifyConnectionError = function notifyConnectionError(message) {
    show({
      message: message || DEFAULT_MESSAGE
    });
  };
})();
