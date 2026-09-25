// tableFx.js - animaciones de llenado de tablas (diseño aprobado en prueba.html, "Tabla combinada").
//   - Primera carga (la tabla no tenia filas con clave): las filas caen en 3D, escalonadas (T8).
//   - Repintados (filtros, busqueda, guardar): las filas que siguen se deslizan a su nuevo lugar,
//     las que salen se van por la derecha y las que entran caen (T9). Si el contenido de una fila
//     cambio (data-fx-sig distinto), destella.
// Uso: cada <tr> lleva data-fx-key (id estable) y opcionalmente data-fx-sig (resumen del contenido).
//   window.tableFx.render(tbody, () => { ...repintado sincronico que ya existia... });
//   o en dos pasos: const fx = window.tableFx?.begin(tbody); ...repintado...; fx?.end();
// Las filas sin data-fx-key (vacio, cargando) no se animan. CSS en animaciones.css.
(function () {
  const STAGGER_MS = 35;
  const STAGGER_MIN_MS = 12;
  const STAGGER_TOTAL_MS = 600;
  const GHOST_MAX = 40;
  const EXIT_MS = 200;
  const MOVE_MS = 420;
  const ENTER_MS = 560; // duracion de la caida (fxRowDrop 0.55s en animaciones.css)

  function reduceMotion() {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  // Area visible de la tabla: la ventana recortada por cada contenedor con scroll/overflow
  // y sin pasar por encima del encabezado (suele ser sticky). Se mide antes Y despues de
  // repintar: el tamano del contenedor cambia (ej. de la fila del diente a todas las citas).
  function visibleClip(table) {
    let left = 0;
    let top = 0;
    let right = window.innerWidth;
    let bottom = window.innerHeight;
    for (let node = table.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowY === "visible" && style.overflowX === "visible") continue;
      const r = node.getBoundingClientRect();
      left = Math.max(left, r.left);
      top = Math.max(top, r.top);
      right = Math.min(right, r.right);
      bottom = Math.min(bottom, r.bottom);
    }
    const headBottom = table.tHead?.getBoundingClientRect().bottom || 0;
    if (headBottom > top && headBottom < bottom) top = headBottom;
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  const isVisible = (rect, clip) =>
    rect.bottom > clip.top && rect.top < clip.top + clip.height && rect.height > 0;

  function snapshot(tbody, clip) {
    const map = new Map();
    tbody.querySelectorAll(":scope > tr[data-fx-key]").forEach((tr) => {
      const rect = tr.getBoundingClientRect();
      const visible = isVisible(rect, clip);
      map.set(tr.dataset.fxKey, {
        tr,
        rect,
        visible,
        sig: tr.dataset.fxSig || "",
        widths: visible ? Array.from(tr.cells, (td) => td.getBoundingClientRect().width) : null,
        enter: tr.dataset.fxEnter || "",
        enterT0: Number(tr.dataset.fxT0 || 0)
      });
    });
    return map;
  }

  // Las filas que salieron ya no estan en el tbody: se reusan sus nodos en una capa fija
  // (misma clase de tabla para conservar estilos) y se van por la derecha.
  function ghostOut(entries, table, clip) {
    if (!entries.length || !clip.width || !clip.height) return;
    const layer = document.createElement("div");
    layer.className = "fx-ghost-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = `left:${clip.left}px;top:${clip.top}px;width:${clip.width}px;height:${clip.height}px;`;
    entries.slice(0, GHOST_MAX).forEach(({ tr, rect, widths }) => {
      const ghost = document.createElement("table");
      ghost.className = `${table.className} fx-ghost`;
      ghost.style.cssText = `left:${rect.left - clip.left}px;top:${rect.top - clip.top}px;width:${rect.width}px;`;
      tr.style.removeProperty("transform");
      tr.style.removeProperty("transition");
      tr.classList.remove("fx-in-load", "fx-in-drop", "fx-changed");
      Array.from(tr.cells).forEach((td, i) => { td.style.width = `${widths[i]}px`; });
      const ghostBody = document.createElement("tbody");
      ghostBody.appendChild(tr);
      ghost.appendChild(ghostBody);
      layer.appendChild(ghost);
    });
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 320);
  }

  function render(tbody, paint) {
    if (typeof paint !== "function") return undefined;
    const fx = begin(tbody);
    const result = paint();
    fx.end();
    return result;
  }

  // Igual que render() pero en dos pasos, para repintados con varios "return" intermedios:
  //   const fx = window.tableFx?.begin(tbody);   // antes de vaciar el tbody
  //   ...repintado...
  //   fx?.end();                                  // al terminar (tambien antes de cada return)
  const NOOP = { end() {} };
  function begin(tbody) {
    const table = tbody?.closest?.("table");
    if (!table || reduceMotion() || !tbody.isConnected || !table.getClientRects().length) return NOOP;
    const box = table.parentElement;
    const boxHeight = box.getBoundingClientRect().height;
    const clipBefore = visibleClip(table);
    const before = snapshot(tbody, clipBefore);
    let ended = false;
    return {
      end() {
        if (ended) return;
        ended = true;
        if (tbody.isConnected) animateAfterPaint(tbody, table, box, boxHeight, clipBefore, before);
      }
    };
  }

  function animateAfterPaint(tbody, table, box, boxHeight, clipBefore, before) {
    const rows = Array.from(tbody.querySelectorAll(":scope > tr[data-fx-key]"));
    if (!rows.length && !before.size) return;

    const firstLoad = before.size === 0;
    const keys = new Set(rows.map((tr) => tr.dataset.fxKey));
    const leaving = Array.from(before.entries())
      .filter(([key, prev]) => !keys.has(key) && prev.visible)
      .map(([, prev]) => prev);
    // Como en la prueba: primero salen las filas y despues se reacomodan/entran las demas.
    const wait = !firstLoad && leaving.length ? EXIT_MS : 0;
    // La tabla sostiene su altura mientras tanto (si se encoge de golpe, el contenedor
    // recorta las filas que suben desde abajo y la salida queda fuera de la tabla).
    if (!firstLoad) holdHeight(box, boxHeight, wait + MOVE_MS);
    const clip = visibleClip(table);

    const entering = [];
    const changed = [];
    const shifts = [];
    const resumed = [];
    const offscreen = [];
    const now = performance.now();
    // Las filas anteriores ya no estan: dejar de observarlas (si esperaban aparecer).
    before.forEach((prev) => revealObserver?.unobserve(prev.tr));

    // Primero todas las lecturas y despues todas las escrituras (evita recalcular por fila).
    rows.forEach((tr) => {
      const prev = before.get(tr.dataset.fxKey);
      const rect = tr.getBoundingClientRect();
      const visible = isVisible(rect, clip);
      if (!prev || prev.tr.classList.contains("fx-pending")) {
        // Nueva (o seguia esperando): cae ya si se ve; si no, cuando aparezca con el scroll.
        (visible ? entering : offscreen).push(tr);
        return;
      }
      // La fila anterior seguia cayendo (varias vistas repintan 2 veces seguidas al cargar):
      // la nueva continua la animacion desde el mismo punto en vez de aparecer de golpe.
      if (prev.enter && now - prev.enterT0 < ENTER_MS) {
        resumed.push([tr, prev]);
        return;
      }
      if (prev.sig !== (tr.dataset.fxSig || "")) changed.push(tr);
      const dy = prev.rect.top - rect.top;
      if (Math.abs(dy) < 0.5) return;
      if (!prev.visible && !isVisible(rect, clip)) return;
      shifts.push([tr, dy]);
    });
    changed.forEach((tr) => tr.classList.add("fx-changed"));
    const moved = shifts.map(([tr, dy]) => {
      tr.style.transition = "none";
      tr.style.transform = `translateY(${dy}px)`;
      return tr;
    });

    // Cascada completa en ~STAGGER_TOTAL_MS sin importar cuantas filas se vean.
    const step = entering.length > 1
      ? Math.max(STAGGER_MIN_MS, Math.min(STAGGER_MS, STAGGER_TOTAL_MS / (entering.length - 1)))
      : 0;
    entering.forEach((tr, i) => {
      const delay = wait + Math.round(i * step);
      markEntering(tr, firstLoad ? "fx-in-load" : "fx-in-drop", delay, now + delay);
    });
    resumed.forEach(([tr, prev]) => markEntering(tr, prev.enter, Math.round(prev.enterT0 - now), prev.enterT0));
    revealLater(offscreen);

    if (moved.length) {
      void tbody.offsetHeight; // aplica la posicion invertida antes de animar
      moved.forEach((tr) => {
        tr.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${wait}ms`;
        tr.style.transform = "";
      });
      window.setTimeout(() => moved.forEach((tr) => tr.style.removeProperty("transition")), wait + MOVE_MS + 60);
    }

    ghostOut(leaving, table, clipBefore);
  }

  // Marca una fila que entra; guarda cuando empieza su caida para poder continuarla
  // si la fila se vuelve a pintar a mitad (delay negativo = arranca ya avanzada).
  function markEntering(tr, cls, delayMs, t0) {
    tr.style.setProperty("--fx-delay", `${delayMs}ms`);
    tr.dataset.fxEnter = cls;
    tr.dataset.fxT0 = String(t0);
    tr.classList.add(cls);
  }

  // Filas que entran fuera de pantalla (tabla debajo del borde, o abajo en su scroll):
  // esperan ocultas y caen en cascada cuando aparecen. IntersectionObserver ya considera
  // el recorte de los contenedores con scroll.
  let revealObserver = null;
  function revealLater(rows) {
    if (!rows.length || typeof IntersectionObserver !== "function") return;
    if (!revealObserver) revealObserver = new IntersectionObserver(onReveal, { threshold: 0 });
    rows.forEach((tr) => {
      tr.classList.add("fx-pending");
      revealObserver.observe(tr);
    });
  }
  function onReveal(entries) {
    const shown = entries
      .filter((entry) => entry.isIntersecting && entry.target.classList.contains("fx-pending"))
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      .map((entry) => entry.target);
    const now = performance.now();
    const step = shown.length > 1
      ? Math.max(STAGGER_MIN_MS, Math.min(STAGGER_MS, STAGGER_TOTAL_MS / (shown.length - 1)))
      : 0;
    shown.forEach((tr, i) => {
      revealObserver.unobserve(tr);
      tr.classList.remove("fx-pending");
      const delay = Math.round(i * step);
      markEntering(tr, "fx-in-load", delay, now + delay);
    });
  }

  // Mantiene la altura previa del contenedor y luego la baja suave a la nueva.
  // Si llega otro repintado a mitad (escribir rapido en el buscador), se reprograma.
  const holds = new WeakMap();
  function holdHeight(box, fromHeight, releaseAfter) {
    const prev = holds.get(box);
    const state = prev || { minHeight: box.style.minHeight, transition: box.style.transition };
    if (prev) {
      window.clearTimeout(prev.releaseTimer);
      window.clearTimeout(prev.cleanupTimer);
    }
    holds.set(box, state);

    box.style.transition = state.transition;
    box.style.minHeight = state.minHeight;
    const natural = box.getBoundingClientRect().height;
    if (natural >= fromHeight - 0.5) {
      holds.delete(box);
      return;
    }
    box.style.minHeight = `${fromHeight}px`;

    state.releaseTimer = window.setTimeout(() => {
      box.style.minHeight = state.minHeight;
      const target = box.getBoundingClientRect().height;
      box.style.minHeight = `${fromHeight}px`;
      void box.offsetHeight;
      box.style.transition = "min-height 0.3s ease";
      box.style.minHeight = `${target}px`;
      state.cleanupTimer = window.setTimeout(() => {
        box.style.minHeight = state.minHeight;
        box.style.transition = state.transition;
        holds.delete(box);
      }, 320);
    }, releaseAfter);
  }

  // ---------- Columnas / elementos opcionales (checkboxes que muestran u ocultan) ----------
  // tableFx.toggle(table, () => { ...cambia las clases que ocultan... }, { selector })
  // Mismo patron: lo que se oculta sale primero, las demas columnas se deslizan a su lugar
  // y lo que aparece cae en cascada por fila. Solo filas visibles.
  const pendingToggles = new WeakMap();

  function visibleRowsOf(table, clip) {
    const head = table.tHead ? Array.from(table.tHead.rows) : [];
    const body = Array.from(table.tBodies).flatMap((tb) => Array.from(tb.rows))
      .filter((tr) => isVisible(tr.getBoundingClientRect(), clip));
    return head.concat(body);
  }

  function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  function toggle(table, apply, options = {}) {
    const selector = options.selector || "";
    pendingToggles.get(table)?.();
    if (!table || !selector || reduceMotion() || !table.getClientRects().length) return apply();

    const rows = visibleRowsOf(table, visibleClip(table));
    const collect = () => new Set(
      rows.flatMap((tr) => Array.from(tr.querySelectorAll(selector))).filter((el) => el.getClientRects().length)
    );
    const cellLefts = (tr) => Array.from(tr.cells, (td) => (td.getClientRects().length ? td.getBoundingClientRect().left : null));

    const before = collect();
    const lefts = new Map(rows.map((tr) => [tr, cellLefts(tr)]));
    const classBefore = table.className;
    const result = apply();
    const classAfter = table.className;
    const after = collect();
    // Si la celda entera entra o sale, sus hijos no se animan aparte.
    const outermost = (list) => list.filter((el) => !list.some((other) => other !== el && other.contains(el)));
    const hidden = outermost(Array.from(before).filter((el) => !after.has(el)));
    const shown = outermost(Array.from(after).filter((el) => !before.has(el)));
    if (!hidden.length && !shown.length) return result;

    const finish = () => {
      pendingToggles.delete(table);
      // Las columnas que siguen se deslizan desde donde estaban.
      // Primero todas las lecturas y despues todas las escrituras (evita recalcular por celda).
      const shifts = [];
      rows.forEach((tr) => {
        const old = lefts.get(tr);
        Array.from(tr.cells).forEach((td, i) => {
          if (old?.[i] == null || !td.getClientRects().length) return;
          const dx = old[i] - td.getBoundingClientRect().left;
          if (Math.abs(dx) >= 0.5) shifts.push([td, dx]);
        });
      });
      const moved = shifts.map(([td, dx]) => {
        td.style.transition = "none";
        td.style.transform = `translateX(${dx}px)`;
        return td;
      });
      if (moved.length) {
        void table.offsetWidth;
        moved.forEach((td) => {
          td.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
          td.style.transform = "";
        });
        window.setTimeout(() => moved.forEach((td) => td.style.removeProperty("transition")), MOVE_MS + 60);
      }
      // Lo que aparece cae en cascada, fila por fila.
      const rowIndex = new Map(rows.map((tr, i) => [tr, i]));
      const step = rows.length > 1
        ? Math.max(STAGGER_MIN_MS, Math.min(STAGGER_MS, STAGGER_TOTAL_MS / (rows.length - 1)))
        : 0;
      shown.forEach((el) => {
        const idx = rowIndex.get(el.closest("tr")) || 0;
        el.style.setProperty("--fx-delay", `${Math.round(idx * step)}ms`);
        restartClass(el, "fx-cell-in");
      });
    };

    if (!hidden.length) {
      finish();
      return result;
    }
    // Mientras sale, la tabla vuelve COMPLETA a su estado anterior (clases de la tabla:
    // columnas visibles y anchos). Si solo se re-mostraban las celdas que salen, las demas
    // columnas saltaban a los anchos nuevos y al deslizarse parecian retroceder.
    // Requiere que apply() solo cambie clases de la tabla.
    table.className = classBefore;
    hidden.forEach((el) => el.classList.add("fx-cell-out"));
    const timer = window.setTimeout(done, EXIT_MS);
    function done() {
      window.clearTimeout(timer);
      hidden.forEach((el) => el.classList.remove("fx-cell-out"));
      table.className = classAfter;
      finish();
    }
    pendingToggles.set(table, done);
    return result;
  }

  window.tableFx = { render, begin, toggle };
})();
