(function () {
  const TITLE_DEFAULT = "Sistema Clinica dice...";
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
    if (isOpen || queue.length === 0) return;
    ensureUi();

    const item = queue.shift();
    const title = String(item?.title || TITLE_DEFAULT);
    const message = String(item?.message || "");
    const type = String(item?.type || inferType(message));
    const mode = String(item?.mode || "alert");

    TYPE_CLASSES.forEach((cls) => modalEl.classList.remove(cls));
    modalEl.classList.add(`sys-alert--${type}`);

    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.innerHTML = iconSvgByType(type);

    if (typeof window.playUiSound === "function") {
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
    isOpen = false;

    resolveByMode(action);
    activeItem = null;

    window.setTimeout(openNext, 0);
  }

  function enqueueDialog(mode, message, options = {}) {
    return new Promise((resolve) => {
      queue.push({
        mode,
        title: options.title || TITLE_DEFAULT,
        message: String(message || ""),
        type: options.type || null,
        defaultValue: options.defaultValue ?? "",
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

  window.__nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.alert = function patchedAlert(message) {
    enqueueDialog("alert", message);
  };
})();
