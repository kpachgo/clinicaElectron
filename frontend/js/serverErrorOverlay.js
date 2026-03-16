(function () {
  const DEFAULT_NETWORK_MESSAGE = "Conexion con el servidor interrumpida.";
  const HTTP_ERROR_MAP = {
    404: {
      code: "404",
      title: "Recurso no encontrado",
      message: "El servidor respondio, pero la ruta solicitada no existe."
    },
    500: {
      code: "500",
      title: "Error interno del servidor",
      message: "El servidor tuvo un problema al procesar la solicitud."
    },
    502: {
      code: "502",
      title: "Puerta de enlace invalida",
      message: "El servidor intermedio no pudo completar la solicitud."
    },
    503: {
      code: "503",
      title: "Servicio no disponible",
      message: "El servidor esta temporalmente fuera de servicio."
    },
    504: {
      code: "504",
      title: "Tiempo de espera agotado",
      message: "El servidor no respondio a tiempo."
    }
  };

  const IGNORE_HTTP_STATUS = new Set([400, 401, 403, 409, 422]);
  let overlayEl = null;
  let msgEl = null;
  let codeEl = null;
  let titleEl = null;
  let hideTimer = null;

  function clearHideTimer() {
    if (!hideTimer) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function hide() {
    clearHideTimer();
    if (!overlayEl) return;
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function hardReload() {
    clearHideTimer();
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("_refresh", Date.now().toString());
      window.location.replace(url.toString());
    } catch (_err) {
      window.location.reload();
    }
  }

  function createOverlayIfNeeded() {
    if (overlayEl) return;

    const node = document.createElement("div");
    node.id = "server-error-overlay";
    node.className = "server-error-overlay";
    node.setAttribute("aria-hidden", "true");
    node.innerHTML = `
      <section class="server-error-card" role="alertdialog" aria-modal="true" aria-label="Error del servidor">
        <p id="server-error-code" class="server-error-code">404</p>
        <h2 id="server-error-title" class="server-error-title">Error del servidor</h2>
        <div class="server-error-svg-wrap" aria-hidden="true">
          <svg class="server-error-svg" viewBox="0 0 520 240" xmlns="http://www.w3.org/2000/svg">
            <rect class="server-error-screen" x="116" y="34" width="288" height="150" rx="14" />
            <rect class="server-error-glow" x="126" y="44" width="268" height="130" rx="10" />
            <circle class="server-error-dot dot-1" cx="155" cy="64" r="6" />
            <circle class="server-error-dot dot-2" cx="176" cy="64" r="6" />
            <circle class="server-error-dot dot-3" cx="197" cy="64" r="6" />
            <line class="server-error-line" x1="155" y1="90" x2="370" y2="90" />
            <line class="server-error-line line-2" x1="155" y1="108" x2="344" y2="108" />
            <line class="server-error-line line-3" x1="155" y1="126" x2="328" y2="126" />
            <text class="server-error-digit d-left" x="190" y="172">4</text>
            <text class="server-error-digit d-center" x="252" y="172">0</text>
            <text class="server-error-digit d-right" x="314" y="172">4</text>
            <circle class="server-error-pulse pulse-1" cx="252" cy="194" r="5" />
            <circle class="server-error-pulse pulse-2" cx="274" cy="194" r="5" />
            <circle class="server-error-pulse pulse-3" cx="296" cy="194" r="5" />
          </svg>
        </div>
        <p id="server-error-message" class="server-error-message">${DEFAULT_NETWORK_MESSAGE}</p>
        <div class="server-error-actions">
          <button type="button" class="server-error-btn secondary" id="server-error-close">Cerrar</button>
          <button type="button" class="server-error-btn primary" id="server-error-retry">Reintentar</button>
        </div>
      </section>
    `;

    document.body.appendChild(node);
    overlayEl = node;
    msgEl = node.querySelector("#server-error-message");
    codeEl = node.querySelector("#server-error-code");
    titleEl = node.querySelector("#server-error-title");

    const closeBtn = node.querySelector("#server-error-close");
    const retryBtn = node.querySelector("#server-error-retry");

    closeBtn?.addEventListener("click", hide);
    retryBtn?.addEventListener("click", hardReload);
    node.addEventListener("click", (event) => {
      if (event.target === node) hide();
    });
  }

  function show(options = {}) {
    createOverlayIfNeeded();
    if (!overlayEl) return;

    const code = String(options.code || "404");
    const title = String(options.title || "Error del servidor");
    const message = String(options.message || DEFAULT_NETWORK_MESSAGE);
    const autoCloseMs = Number(options.autoCloseMs || 0);

    if (codeEl) codeEl.textContent = code;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    overlayEl.classList.add("is-open");
    overlayEl.setAttribute("aria-hidden", "false");

    if (typeof window.playUiSound === "function") {
      window.playUiSound("error", { minIntervalMs: 350 });
    }

    clearHideTimer();
    if (autoCloseMs > 0) {
      hideTimer = setTimeout(hide, autoCloseMs);
    }
  }

  function notifyHttpError(statusCode, requestUrl) {
    const status = Number(statusCode);
    if (!Number.isFinite(status) || IGNORE_HTTP_STATUS.has(status)) return;

    if (status < 500 && status !== 404) return;

    const spec = HTTP_ERROR_MAP[status] || {
      code: String(status || 500),
      title: "Respuesta inesperada del servidor",
      message: "El servidor devolvio un error al procesar la solicitud."
    };

    const requestInfo = requestUrl ? ` Ruta: ${requestUrl}` : "";
    show({
      code: spec.code,
      title: spec.title,
      message: `${spec.message}${requestInfo}`
    });
  }

  function notifyNetworkError(message) {
    show({
      code: "404",
      title: "Conexion perdida con el servidor",
      message: message || DEFAULT_NETWORK_MESSAGE
    });
  }

  window.showServerErrorOverlay = show;
  window.hideServerErrorOverlay = hide;
  window.notifyServerHttpError = notifyHttpError;
  window.notifyConnectionError = notifyNetworkError;
})();
