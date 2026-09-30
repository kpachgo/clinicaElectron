// topbarNav.js - Topbar: menu y botones de la derecha con iconos que crecen al acercar el mouse (tipo dock) y atajos de teclado.
//
// Estilos en style.css ("TOPBAR NAV — ICONOS + DOCK"). Diseño elegido en prueba2.html (variante 8).
// Atajos (van por el mismo clic del menu: sonido, permisos y loadView con su cancelacion):
//   Ctrl + ← / →   vista anterior / siguiente (no mientras se escribe: ahi Ctrl+flecha salta palabras)
//   Ctrl + 1..9    vista por posicion entre las visibles segun permisos
// Alt + ← / → queda para cambiar la fecha en Agenda y Cobros.
// Tambien se oculta solo al bajar el scroll de cualquier vista (ver bindAutoHide).
(function () {
  const BASE_PX = 18;
  const GROW = 0.8;   // el icono bajo el cursor llega a ~32px
  const REACH = 110;  // px alrededor del cursor que tambien crecen

  const nav = () => document.querySelector(".topbar .sidebar-menu");
  const visibleButtons = () => Array.from(nav()?.querySelectorAll(".accordion") || [])
    .filter((b) => b.style.display !== "none" && b.offsetParent !== null);

  // ---------- Dock ----------
  // Se usa en el menu y en los botones de la derecha (tema, campana, cerrar sesion).
  const RIGHT_BUTTONS = ".theme-btn, .top-icon-btn, .btn-logout";

  function bindDock(menu, selector) {
    let frame = 0;
    let lastX = 0;
    const apply = () => {
      frame = 0;
      menu.querySelectorAll(selector).forEach((b) => {
        const r = b.getBoundingClientRect();
        const d = Math.abs(lastX - (r.left + r.width / 2));
        const s = 1 + GROW * Math.max(0, 1 - d / REACH);
        // Pixeles enteros: sin medio pixel no se ve borroso.
        b.style.setProperty("--nav-icon-px", `${Math.round(BASE_PX * s)}px`);
      });
    };
    menu.addEventListener("mousemove", (e) => {
      lastX = e.clientX;
      if (!frame) frame = requestAnimationFrame(apply);
    });
    menu.addEventListener("mouseleave", () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      menu.querySelectorAll(selector).forEach((b) => b.style.removeProperty("--nav-icon-px"));
    });
  }

  // ---------- Atajos ----------
  const isEditing = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ""));

  // Si un modal u overlay tapa el menu, tampoco se puede hacer clic en el: el atajo no hace nada.
  function menuReachable(btn) {
    const r = btn.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    // Topbar auto-oculto: se mira lo que hay en su lugar; si es la vista (no un overlay), se puede.
    if (window.topbarAutoHide?.isHidden()) {
      const under = document.elementFromPoint(r.left + r.width / 2, 40);
      return !!under && !!under.closest(".content");
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && !!hit.closest(".topbar");
  }

  function go(btn) {
    if (!btn || btn.classList.contains("active")) return;
    btn.click();
    btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function onKeydown(e) {
    if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    if (e.repeat) return; // mantener presionado no dispara una vista por cada repeticion
    const arrow = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || "");
    if (!arrow && !digit) return;
    if (arrow && isEditing(document.activeElement)) return;

    const btns = visibleButtons();
    if (!btns.length || !menuReachable(btns[0])) return;

    let target = null;
    if (digit) {
      target = btns[Number(digit[1]) - 1] || null;
    } else {
      const current = btns.findIndex((b) => b.classList.contains("active"));
      const from = current === -1 ? (arrow > 0 ? -1 : 0) : current;
      target = btns[(from + arrow + btns.length) % btns.length];
    }
    if (!target) return;
    e.preventDefault();
    go(target);
  }

  // ---------- Auto-ocultar al hacer scroll ----------
  // Bajar oculta el topbar y .content gana su alto; subir, volver arriba, cambiar de vista,
  // llevar el mouse al borde superior o enfocarlo con teclado lo muestran de nuevo.
  // Escucha en captura para cubrir tambien listas con scroll propio dentro de la vista (ej. .pe-evo).
  const HIDE_AFTER = 28;    // px seguidos hacia abajo para ocultar
  const SHOW_AFTER = 20;    // px seguidos hacia arriba para mostrar
  const TOP_ZONE = 48;      // cerca del inicio del scroll siempre visible
  const MIN_SCROLLER = 180; // listas mas pequeñas (dropdowns, chips) no mueven el topbar
  const SETTLE_MS = 320;    // durante la animacion el alto de .content cambia: se ignora ese scroll

  function bindAutoHide(topbar, content) {
    let hidden = false;
    let lastTarget = null;
    let lastTop = 0;
    let travel = 0;
    let settleUntil = 0;

    const setHidden = (value) => {
      if (hidden === value) return;
      if (value) topbar.style.setProperty("--topbar-hide-offset", `${topbar.offsetHeight}px`);
      hidden = value;
      travel = 0;
      settleUntil = performance.now() + SETTLE_MS;
      topbar.classList.toggle("is-autohidden", value);
      document.body.classList.toggle("topbar-autohidden", value);
    };
    const show = () => setHidden(false);

    const bellOpen = () => {
      const panel = document.getElementById("license-bell-panel");
      return !!panel && !panel.hidden;
    };

    const scrollerOf = (target) => {
      const el = target === document ? document.scrollingElement : target;
      if (!(el instanceof Element) || !content.contains(el)) return null;
      return el.clientHeight >= MIN_SCROLLER ? el : null;
    };

    document.addEventListener("scroll", (e) => {
      const el = scrollerOf(e.target);
      if (!el) return;
      const top = el.scrollTop;
      if (el !== lastTarget) {
        lastTarget = el;
        lastTop = top;
        travel = 0;
        return;
      }
      const delta = top - lastTop;
      lastTop = top;
      if (!delta || performance.now() < settleUntil) return;

      if (top <= TOP_ZONE) { show(); return; }
      // Cambio de direccion: se reinicia el recorrido acumulado.
      travel = Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;

      if (!hidden && travel >= HIDE_AFTER) {
        // Si al ganar el alto del topbar ya no queda scroll, se volveria a mostrar en bucle.
        const room = el.scrollHeight - el.clientHeight;
        if (room > topbar.offsetHeight + TOP_ZONE * 2 && !bellOpen()) setHidden(true);
      } else if (hidden && travel <= -SHOW_AFTER) {
        show();
      }
    }, { capture: true, passive: true });

    // Mouse en el borde superior (escritorio): aparece sin tener que subir el scroll.
    document.addEventListener("mousemove", (e) => {
      if (hidden && e.clientY <= 14) show();
    }, { passive: true });

    topbar.addEventListener("focusin", show);

    // Cambio de vista: la nueva arranca con el topbar visible.
    new MutationObserver(() => {
      lastTarget = null;
      show();
    }).observe(content, { childList: true });

    window.topbarAutoHide = { show, hide: () => setHidden(true), isHidden: () => hidden };
  }

  function init() {
    const menu = nav();
    if (!menu || menu.dataset.topbarNavBound) return;
    menu.dataset.topbarNavBound = "true";
    bindDock(menu, ".accordion");
    const right = document.querySelector(".topbar .top-right");
    if (right) bindDock(right, RIGHT_BUTTONS);
    document.addEventListener("keydown", onKeydown);
    const topbar = document.querySelector(".topbar");
    const content = document.querySelector(".content");
    if (topbar && content) bindAutoHide(topbar, content);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
