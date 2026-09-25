// toothSpinner.js - spinner de carga con forma de diente; cada vez se elige una animacion al azar.
// Uso:
//   el.innerHTML = window.toothSpinner.html({ label: "Cargando paciente...", size: 64 });
// Variantes (elegidas en prueba.html): brillo, se llena, se dibuja, balanceo, salta, gira 3D, se colorea.
// Color: --tooth-ld-color (por defecto --app-primary del tema). CSS en animaciones.css.
(function () {
  const TOOTH =
    "M7 3c-2.5 0-4 2-4 4.5 0 2 .8 3.5 1.5 5 .6 1.4.8 3.2 1.1 5.1.3 1.8.9 3.4 2 3.4 1.3 0 1.6-2 1.9-3.6.2-1.2.6-2.4 1.5-2.4s1.3 1.2 1.5 2.4c.3 1.6.6 3.6 1.9 3.6 1.1 0 1.7-1.6 2-3.4.3-1.9.5-3.7 1.1-5.1.7-1.5 1.5-3 1.5-5C21 5 19.5 3 17 3c-1.8 0-3 1-5 1S8.8 3 7 3z";
  let uid = 0;

  const tooth = (cls, extra = "") => `<path class="${cls}" d="${TOOTH}" ${extra}/>`;
  // Cada instancia necesita su propio id de clipPath.
  const clipped = (base, inner) => {
    const id = `tooth-ld-clip-${++uid}`;
    return `<defs><clipPath id="${id}">${tooth("")}</clipPath></defs>${base}<g clip-path="url(#${id})">${inner}</g>`;
  };

  const VARIANTS = {
    brillo: () => clipped(tooth("tl-fill"), '<rect class="tl-shine" x="4" y="0" width="5" height="24"/>'),
    llena: () => clipped(tooth("tl-line"), '<rect class="tl-level" x="0" y="0" width="24" height="24"/>'),
    dibuja: () => `${tooth("tl-fill")}${tooth("tl-line", 'pathLength="100"')}`,
    balanceo: () => tooth("tl-fill"),
    salta: () => `<ellipse class="tl-shadow" cx="12" cy="23.4" rx="6" ry="1"/>${tooth("tl-fill")}`,
    gira: () => tooth("tl-fill"),
    colorea: () => clipped(tooth("tl-line"), '<rect class="tl-half" x="0" y="0" width="24" height="24"/>')
  };
  const NAMES = Object.keys(VARIANTS);

  function randomVariant() {
    return NAMES[Math.floor(Math.random() * NAMES.length)];
  }

  function escapeText(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function html(options = {}) {
    const variant = VARIANTS[options.variant] ? options.variant : randomVariant();
    const size = Math.max(16, Number(options.size) || 56);
    const label = String(options.label || "").trim();
    return `
      <div class="tooth-ld" role="status" aria-live="polite" style="--tooth-ld-size:${size}px">
        <svg class="tooth-ld-svg tooth-ld--${variant}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          ${VARIANTS[variant]()}
        </svg>
        ${label ? `<span class="tooth-ld-label">${escapeText(label)}</span>` : '<span class="tooth-ld-sr">Cargando...</span>'}
      </div>`;
  }

  // ---------- Tablas ----------
  // Contenido para una celda de "cargando" (en tablas que ya pintan su propia fila de carga).
  function cellHtml(label = "Cargando...") {
    return `<div class="tooth-ld-cell">${html({ label, size: 40 })}</div>`;
  }

  function columnCount(tbody) {
    const table = tbody?.closest?.("table");
    const headRow = table?.tHead?.rows?.[0];
    if (headRow) {
      return Array.from(headRow.cells).reduce((acc, cell) => acc + (cell.colSpan || 1), 0) || 1;
    }
    const firstRow = tbody?.rows?.[0];
    return firstRow ? Array.from(firstRow.cells).reduce((acc, cell) => acc + (cell.colSpan || 1), 0) || 1 : 1;
  }

  // Fila completa (ocupa todas las columnas de la tabla).
  function tableRowHtml(tbody, label = "Cargando...", token = "") {
    return `<tr class="tooth-ld-row"${token ? ` data-ld="${token}"` : ""}><td colspan="${columnCount(tbody)}">${cellHtml(label)}</td></tr>`;
  }

  // Para tablas sin estado de carga propio:
  //   const stop = window.toothSpinner.tableLoading(tbody, { label: "Cargando cuentas..." });
  //   try { ...fetch y render... } finally { stop(); }
  // Aparece tras un breve retraso (evita parpadeo en cargas instantaneas) y NO si la tabla
  // se vuelve a pintar antes. Sin tiempo minimo: stop() la quita apenas termina la carga.
  function tableLoading(tbody, options = {}) {
    if (!tbody) return () => {};
    const delay = Number.isFinite(options.delay) ? options.delay : 150;
    const label = options.label || "Cargando...";
    let shown = false;
    let finished = false;
    const token = String(++uid);

    const observer = typeof MutationObserver === "function"
      ? new MutationObserver(() => { if (!shown) cancel(); })
      : null;
    observer?.observe(tbody, { childList: true });

    const timer = window.setTimeout(() => {
      observer?.disconnect();
      if (finished || !tbody.isConnected) return;
      shown = true;
      tbody.innerHTML = tableRowHtml(tbody, label, token);
    }, delay);

    function cancel() {
      window.clearTimeout(timer);
      observer?.disconnect();
    }

    return function stop() {
      if (finished) return;
      finished = true;
      cancel();
      // Solo quita SU fila (si nadie repinto la tabla); no la de una carga posterior.
      tbody.querySelectorAll(`:scope > tr.tooth-ld-row[data-ld="${token}"]`).forEach((tr) => tr.remove());
    };
  }

  window.toothSpinner = { html, cellHtml, tableRowHtml, tableLoading, variants: NAMES.slice() };
})();
