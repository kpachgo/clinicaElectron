(function () {
  const TITLE_DEFAULT = "Sistema Clinica dice...";
  // Titulo por defecto segun tipo (el icono grande centrado ya indica que es un aviso del sistema).
  const TITLE_BY_TYPE = {
    info: "Información",
    success: "Listo",
    warning: "Atención",
    error: "Ocurrió un error"
  };
  const TITLE_BY_MODE = { confirm: "Confirmar", prompt: "Ingrese un dato" };
  const CLOSE_ANIMATION_MS = 420;
  let isClosing = false;
  const TYPE_CLASSES = ["sys-alert--info", "sys-alert--success", "sys-alert--warning", "sys-alert--error"];
  const queue = [];

  let overlayEl = null;
  let modalEl = null;
  let iconEl = null;
  let titleEl = null;
  let messageEl = null;
  let inputWrapEl = null;
  let inputEl = null;
  let cancelBtnEl = null;
  let primaryBtnEl = null;
  let isOpen = false;
  let activeItem = null;

  function inferType(rawMessage) {
    const msg = String(rawMessage || "").toLowerCase();
    if (/(error|fall|inval|deneg|no se pudo|no permitido|falta|bloquead)/.test(msg)) return "error";
    if (/(correctamente|guardad|agregad|cargad|autorizad|eliminad)/.test(msg)) return "success";
    if (/(debe|seleccione|aviso|advert|atencion|vacio|duplicado)/.test(msg)) return "warning";
    return "info";
  }

  function iconSvgByType(type) {
    if (type === "success") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    }
    if (type === "warning") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>';
    }
    if (type === "error") {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v4h1"/></svg>';
  }

  function ensureUi() {
    if (overlayEl) return;

    overlayEl = document.createElement("div");
    overlayEl.className = "sys-alert-overlay";
    overlayEl.id = "sys-alert-overlay";

    overlayEl.innerHTML = `
      <div class="sys-alert-modal sys-alert--info" role="alertdialog" aria-modal="true" aria-labelledby="sys-alert-title" aria-describedby="sys-alert-message">
        <div class="sys-alert-head">
          <div class="sys-alert-icon" id="sys-alert-icon"></div>
          <h3 class="sys-alert-title" id="sys-alert-title"></h3>
        </div>
        <div class="sys-alert-body">
          <p class="sys-alert-message" id="sys-alert-message"></p>
          <div class="sys-alert-input-wrap" id="sys-alert-input-wrap">
            <input type="text" class="sys-alert-input" id="sys-alert-input" autocomplete="off">
          </div>
        </div>
        <div class="sys-alert-actions">
          <button type="button" class="sys-alert-btn is-cancel" id="sys-alert-cancel">Cancelar</button>
          <button type="button" class="sys-alert-btn is-primary" id="sys-alert-primary">Aceptar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlayEl);

    modalEl = overlayEl.querySelector(".sys-alert-modal");
    iconEl = overlayEl.querySelector("#sys-alert-icon");
    titleEl = overlayEl.querySelector("#sys-alert-title");
    messageEl = overlayEl.querySelector("#sys-alert-message");
    inputWrapEl = overlayEl.querySelector("#sys-alert-input-wrap");
    inputEl = overlayEl.querySelector("#sys-alert-input");
    cancelBtnEl = overlayEl.querySelector("#sys-alert-cancel");
    primaryBtnEl = overlayEl.querySelector("#sys-alert-primary");

    cancelBtnEl.addEventListener("click", () => closeActive("cancel"));
    primaryBtnEl.addEventListener("click", () => closeActive("primary"));
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) closeActive("cancel");
    });
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeActive("cancel");
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        closeActive("primary");
      }
    });
  }

  function openNext() {
    if (isOpen || isClosing || queue.length === 0) return;
    ensureUi();

    const item = queue.shift();
    const message = String(item?.message || "");
    const type = String(item?.type || inferType(message));
    const mode = String(item?.mode || "alert");
    const title = String(item?.title || TITLE_BY_MODE[mode] || TITLE_BY_TYPE[type] || TITLE_DEFAULT);

    TYPE_CLASSES.forEach((cls) => modalEl.classList.remove(cls));
    modalEl.classList.add(`sys-alert--${type}`);

    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.innerHTML = iconSvgByType(type);

    if (item?.silent !== true && typeof window.playUiSound === "function") {
      let soundKey = type;
      if (mode === "confirm" || mode === "prompt") soundKey = "question";
      window.playUiSound(soundKey, { minIntervalMs: 120 });
    }

    inputEl.value = String(item?.defaultValue ?? "");
    inputWrapEl.classList.toggle("is-open", mode === "prompt");
    cancelBtnEl.style.display = mode === "alert" ? "none" : "inline-flex";
    primaryBtnEl.textContent = mode === "prompt" ? "Aceptar" : "Aceptar";

    activeItem = item;
    isOpen = true;
    overlayEl.classList.remove("is-closing");
    // Reinicia las animaciones de entrada aunque se abra un aviso tras otro.
    void overlayEl.offsetWidth;
    overlayEl.classList.add("is-open");
    if (mode === "prompt") {
      inputEl.focus();
      inputEl.select();
    } else {
      primaryBtnEl.focus();
    }
  }

  function resolveByMode(action) {
    if (!activeItem || typeof activeItem.resolve !== "function") return;

    const mode = String(activeItem.mode || "alert");
    if (mode === "confirm") {
      activeItem.resolve(action === "primary");
      return;
    }
    if (mode === "prompt") {
      if (action === "primary") {
        activeItem.resolve(String(inputEl.value || ""));
      } else {
        activeItem.resolve(null);
      }
      return;
    }
    activeItem.resolve(true);
  }

  function closeActive(action = "primary") {
    if (!overlayEl || !isOpen) return;

    overlayEl.classList.remove("is-open");
    overlayEl.classList.add("is-closing");
    isOpen = false;
    isClosing = true;

    // Se resuelve de inmediato; el modal termina su animacion de salida antes de abrir el siguiente.
    resolveByMode(action);
    activeItem = null;

    window.setTimeout(() => {
      isClosing = false;
      overlayEl.classList.remove("is-closing");
      openNext();
    }, CLOSE_ANIMATION_MS);
  }

  function enqueueDialog(mode, message, options = {}) {
    return new Promise((resolve) => {
      queue.push({
        mode,
        title: options.title || "",
        message: String(message || ""),
        type: options.type || null,
        defaultValue: options.defaultValue ?? "",
        // silent: sin sonido (ej. exito tras un guardado, donde el fetch global ya sono).
        silent: options.silent === true,
        resolve
      });
      openNext();
    });
  }

  window.showSystemMessage = function showSystemMessage(message, options = {}) {
    return enqueueDialog("alert", message, options);
  };

  window.showSystemConfirm = function showSystemConfirm(message, options = {}) {
    return enqueueDialog("confirm", message, options);
  };

  window.showSystemPrompt = function showSystemPrompt(message, defaultValue = "", options = {}) {
    return enqueueDialog("prompt", message, {
      ...options,
      defaultValue
    });
  };

  // ================= TOASTS (avisos no bloqueantes) =================
  // window.showToast(mensaje, { type, title, duration })
  // - type: info | success | warning | error (si no se pasa, se infiere del texto como en alert).
  // - Se cierra solo (pausa con el mouse encima) o con clic. Mensajes iguales no se apilan: se reinicia el existente.
  // - success no suena: el fetch global de web.js ya suena al guardar.
  const TOAST_MAX = 4;
  const TOAST_DURATION = { info: 4000, success: 3000, warning: 4500, error: 6000 };
  let toastContainerEl = null;

  function ensureToastContainer() {
    if (toastContainerEl?.isConnected) return toastContainerEl;
    toastContainerEl = document.createElement("div");
    toastContainerEl.className = "sys-toasts";
    toastContainerEl.setAttribute("aria-live", "polite");
    document.body.appendChild(toastContainerEl);
    return toastContainerEl;
  }

  function closeToast(toastEl) {
    if (!toastEl || toastEl.classList.contains("is-leaving")) return;
    toastEl.classList.add("is-leaving");
    window.setTimeout(() => toastEl.remove(), 280);
  }

  function restartToastBar(toastEl, duration) {
    const bar = toastEl.querySelector(".sys-toast-bar");
    if (!bar) return;
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
    bar.style.animationDuration = `${duration}ms`;
  }

  window.showToast = function showToast(message, options = {}) {
    const text = String(message || "").trim();
    if (!text) return null;
    const type = String(options.type || inferType(text));
    const title = String(options.title || "").trim();
    const duration = Math.max(1500, Number(options.duration) || TOAST_DURATION[type] || 4000);
    const container = ensureToastContainer();

    if (type !== "success" && typeof window.playUiSound === "function") {
      window.playUiSound(type, { minIntervalMs: 120 });
    }

    const existing = Array.from(container.children).find(
      (el) => !el.classList.contains("is-leaving") && el.dataset.message === `${type}|${title}|${text}`
    );
    if (existing) {
      existing.classList.remove("is-bump");
      void existing.offsetWidth;
      existing.classList.add("is-bump");
      restartToastBar(existing, duration);
      return existing;
    }

    const toastEl = document.createElement("div");
    toastEl.className = `sys-toast sys-toast--${type}`;
    toastEl.dataset.message = `${type}|${title}|${text}`;
    toastEl.setAttribute("role", type === "error" ? "alert" : "status");
    toastEl.innerHTML = `
      <div class="sys-toast-icon">${iconSvgByType(type)}</div>
      <div class="sys-toast-body">
        ${title ? '<div class="sys-toast-title"></div>' : ""}
        <div class="sys-toast-message"></div>
      </div>
      <div class="sys-toast-bar"></div>
    `;
    if (title) toastEl.querySelector(".sys-toast-title").textContent = title;
    toastEl.querySelector(".sys-toast-message").textContent = text;
    toastEl.querySelector(".sys-toast-bar").style.animationDuration = `${duration}ms`;
    toastEl.querySelector(".sys-toast-bar").addEventListener("animationend", () => closeToast(toastEl));
    toastEl.addEventListener("click", () => closeToast(toastEl));

    container.appendChild(toastEl);
    const activos = Array.from(container.children).filter((el) => !el.classList.contains("is-leaving"));
    activos.slice(0, Math.max(0, activos.length - TOAST_MAX)).forEach(closeToast);
    return toastEl;
  };

  window.__nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.alert = function patchedAlert(message) {
    enqueueDialog("alert", message);
  };
})();
