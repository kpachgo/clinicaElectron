(function () {
  // Aviso de error de conexion / servidor: diente animado delante del icono de InciSoft (opcion E de prueba4.html).
  const DEFAULT_NETWORK_MESSAGE = "No pudimos comunicarnos con el servidor de la clínica. Revisa que el equipo principal esté encendido y conectado a la red.";
  const NETWORK_SPEC = {
    code: "SIN CONEXIÓN",
    title: "¡Ups! Se nos desconectó el servidor",
    message: DEFAULT_NETWORK_MESSAGE
  };
  const HTTP_ERROR_MAP = {
    404: {
      code: "ERROR 404",
      title: "Este diente no está en el consultorio",
      message: "El servidor respondió, pero esa ruta no existe. Si acabas de actualizar, recarga la aplicación."
    },
    500: {
      code: "ERROR 500",
      title: "Al servidor le dolió una muela",
      message: "Algo falló al procesar la solicitud. Intenta de nuevo; si se repite, avisa al administrador."
    },
    502: {
      code: "ERROR 502",
      title: "Puerta de enlace inválida",
      message: "El servidor intermedio no pudo completar la solicitud."
    },
    503: {
      code: "ERROR 503",
      title: "El servidor está en su cita de limpieza",
      message: "Puede estar reiniciándose o en mantenimiento. Espera unos segundos y vuelve a intentar."
    },
    504: {
      code: "ERROR 504",
      title: "El servidor se quedó en la sala de espera",
      message: "El servidor no respondió a tiempo. Intenta de nuevo en unos segundos."
    }
  };

  const IGNORE_HTTP_STATUS = new Set([400, 401, 403, 409, 422]);
  const TOOTH_PATH = "M60 20 C 40 20, 28 38, 30 60 C 32 82, 40 95, 44 120 C 47 140, 52 164, 62 164 C 72 164, 72 132, 80 120 C 88 132, 88 164, 98 164 C 108 164, 113 140, 116 120 C 120 95, 128 82, 130 60 C 132 38, 120 20, 100 20 C 90 20, 86 26, 80 26 C 74 26, 70 20, 60 20 Z";
  let overlayEl = null;
  let msgEl = null;
  let codeEl = null;
  let titleEl = null;
  let detailEl = null;
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
    if (overlayEl || !document.body) return;

    const node = document.createElement("div");
    node.id = "server-error-overlay";
    node.className = "server-error-overlay";
    node.setAttribute("aria-hidden", "true");
    node.innerHTML = `
      <section class="server-error-card" role="alertdialog" aria-modal="true" aria-labelledby="server-error-title">
        <div class="server-error-scene" aria-hidden="true">
          <span class="server-error-halo"></span><span class="server-error-halo h2"></span>
          <div class="server-error-logo"><img src="img/icon-512.png" alt=""></div>
          <span class="server-error-badge">!</span>
          <svg class="server-error-tooth" viewBox="0 0 160 195" xmlns="http://www.w3.org/2000/svg">
            <ellipse class="server-error-shadow" cx="80" cy="186" rx="44" ry="6" />
            <g class="server-error-tooth-group">
              <path class="server-error-tooth-body" d="${TOOTH_PATH}" />
              <path class="server-error-shine" d="M46 50 C 46 40, 52 34, 60 33" />
              <ellipse class="server-error-eye" cx="64" cy="72" rx="5" ry="6" />
              <ellipse class="server-error-eye" cx="96" cy="72" rx="5" ry="6" />
              <ellipse class="server-error-cheek" cx="54" cy="88" rx="7" ry="4" />
              <ellipse class="server-error-cheek" cx="106" cy="88" rx="7" ry="4" />
              <ellipse class="server-error-mouth" cx="80" cy="96" rx="6" ry="5" />
              <path class="server-error-sweat" d="M122 44 C 118 52, 118 56, 122 58 C 126 56, 126 52, 122 44 Z" />
            </g>
          </svg>
        </div>
        <p id="server-error-code" class="server-error-code">${NETWORK_SPEC.code}</p>
        <h2 id="server-error-title" class="server-error-title">${NETWORK_SPEC.title}</h2>
        <p id="server-error-message" class="server-error-message">${DEFAULT_NETWORK_MESSAGE}</p>
        <p id="server-error-detail" class="server-error-detail" hidden></p>
        <div class="server-error-actions">
          <button type="button" class="server-error-btn secondary" id="server-error-close">Cerrar</button>
          <button type="button" class="server-error-btn primary" id="server-error-retry">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>
            Reintentar
          </button>
        </div>
      </section>
    `;

    document.body.appendChild(node);
    overlayEl = node;
    msgEl = node.querySelector("#server-error-message");
    codeEl = node.querySelector("#server-error-code");
    titleEl = node.querySelector("#server-error-title");
    detailEl = node.querySelector("#server-error-detail");

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

    const code = String(options.code || NETWORK_SPEC.code);
    const title = String(options.title || NETWORK_SPEC.title);
    const message = String(options.message || DEFAULT_NETWORK_MESSAGE);
    const detail = String(options.detail || "");
    const autoCloseMs = Number(options.autoCloseMs || 0);

    if (codeEl) codeEl.textContent = code;
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (detailEl) {
      detailEl.textContent = detail;
      detailEl.hidden = !detail;
    }

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
      code: `ERROR ${status || 500}`,
      title: "Respuesta inesperada del servidor",
      message: "El servidor devolvió un error al procesar la solicitud."
    };

    show({
      code: spec.code,
      title: spec.title,
      message: spec.message,
      detail: requestUrl ? `Ruta: ${requestUrl}` : ""
    });
  }

  // Los llamadores pasan textos genericos ("Opps ocurrio un error de conexion"); se muestra siempre
  // el mensaje que explica que revisar.
  function notifyNetworkError(_message) {
    show(NETWORK_SPEC);
  }

  // Se arma al cargar (oculto) para que el icono ya este descargado: si el servidor se cae despues,
  // en la tablet/navegador ya no se podria pedir la imagen.
  createOverlayIfNeeded();

  window.showServerErrorOverlay = show;
  window.hideServerErrorOverlay = hide;
  window.notifyServerHttpError = notifyHttpError;
  window.notifyConnectionError = notifyNetworkError;
})();
