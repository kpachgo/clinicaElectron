// saveFeedback.js - animacion de botones de guardar (spinner -> check / error).
// Uso en un handler:
//   window.saveFx?.start(btn);            // justo antes del fetch
//   await window.saveFx?.success(btn);    // al confirmar el guardado (espera a que se vea el check)
//   window.saveFx?.error(btn);            // en el catch
//   window.saveFx?.stop(btn);             // en el finally (solo limpia si quedo en "guardando")
// Los colores salen del tema activo (--success / --danger) y el spinner usa el color del texto del boton.
(function () {
  const SAVED_MS = 1500;
  const ERROR_MS = 1600;
  const SUCCESS_WAIT_MS = 650;
  const CHECK_SVG =
    '<svg class="save-fx-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

  const state = new WeakMap();

  function clearTimer(btn) {
    const s = state.get(btn);
    if (s?.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
  }

  function setContent(btn, iconHtml, text) {
    btn.innerHTML = `${iconHtml}<span class="save-fx-label">${text}</span>`;
  }

  function start(btn, text = "Guardando...") {
    if (!btn) return;
    clearTimer(btn);
    if (!state.has(btn)) {
      state.set(btn, {
        html: btn.innerHTML,
        minWidth: btn.style.minWidth,
        timer: null
      });
      // Fija el ancho para que el boton no "salte" al cambiar el texto.
      btn.style.minWidth = `${btn.offsetWidth}px`;
    }
    btn.classList.remove("is-saved", "is-save-error");
    btn.classList.add("save-fx", "is-saving");
    btn.setAttribute("aria-busy", "true");
    setContent(btn, '<span class="save-fx-spin" aria-hidden="true"></span>', text);
  }

  function reset(btn) {
    if (!btn) return;
    const s = state.get(btn);
    if (!s) return;
    clearTimer(btn);
    btn.innerHTML = s.html;
    btn.style.minWidth = s.minWidth;
    btn.classList.remove("save-fx", "is-saving", "is-saved", "is-save-error");
    btn.removeAttribute("aria-busy");
    state.delete(btn);
  }

  function finish(btn, cls, iconHtml, text, holdMs) {
    if (!btn || !state.has(btn)) return;
    clearTimer(btn);
    btn.classList.remove("is-saving", "is-saved", "is-save-error");
    // Reinicia la animacion aunque la clase ya estuviera puesta.
    void btn.offsetWidth;
    btn.classList.add(cls);
    btn.removeAttribute("aria-busy");
    setContent(btn, iconHtml, text);
    state.get(btn).timer = setTimeout(() => reset(btn), holdMs);
  }

  // Devuelve una promesa que resuelve cuando el check ya se vio, para cerrar el modal / mostrar alertas despues.
  function success(btn, text = "Guardado") {
    if (!btn || !state.has(btn)) return Promise.resolve();
    finish(btn, "is-saved", CHECK_SVG, text, SAVED_MS);
    return new Promise((resolve) => setTimeout(resolve, SUCCESS_WAIT_MS));
  }

  function error(btn, text = "Error") {
    finish(btn, "is-save-error", "", text, ERROR_MS);
  }

  // Para el finally: si el flujo salio sin success/error (return temprano), vuelve al estado normal.
  function stop(btn) {
    if (btn?.classList.contains("is-saving")) reset(btn);
  }

  window.saveFx = { start, success, error, stop, reset };
})();
