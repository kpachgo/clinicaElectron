// js/cobro.js
(function () {
  let cobroItems = [];
  let pacienteActual = null;
  let cuentasActuales = [];
  let totalDescuentoActual = 0;
  let reporteMensualActual = [];
  let reporteMensualTotalesActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
  let reporteMensualTotalesGlobalActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
  let reporteMensualFiltroActual = null;
  let reporteMensualFormaPagoActual = "";
  let faltantesCobroActual = [];
  let faltantesCobroResumenActual = { atendidosCola: 0, cobrados: 0, faltantes: 0, fecha: "" };
  let doctoresCuentaData = [];
  let cargarDoctoresCuentaPromise = null;

  function precioUSD(num) {
    return `$${Number(num || 0).toFixed(2)}`;
  }
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function renderProcedimientoVisual(texto) {
    const raw = String(texto || "").trim();
    if (!raw) return "-";
    if (typeof window.__rvRenderProcedimiento === "function") {
      return window.__rvRenderProcedimiento(raw);
    }
    return escapeHtml(raw);
  }

  function formatearFecha(fechaISO) {
    if (!fechaISO) return "";
    const d = new Date(fechaISO);
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const anio = d.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  function formatearFechaCorta(valor) {
    const raw = String(valor || "").trim();
    if (!raw) return "";
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      return `${m[3]}/${m[2]}/${m[1]}`;
    }
    return formatearFecha(raw);
  }

  function formatearMesCorto(valor) {
    const raw = String(valor || "").trim();
    const m = raw.match(/^(\d{4})-(\d{2})$/);
    if (!m) return raw;
    return `${m[2]}/${m[1]}`;
  }

  function obtenerHoyLocalISO() {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, "0");
    const dd = String(ahora.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function shiftISODateByDays(iso, deltaDays) {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const yyyy = Number(match[1]);
    const mm = Number(match[2]) - 1;
    const dd = Number(match[3]);
    const movedDate = new Date(Date.UTC(yyyy, mm, dd + Number(deltaDays || 0)));
    const nextY = movedDate.getUTCFullYear();
    const nextM = String(movedDate.getUTCMonth() + 1).padStart(2, "0");
    const nextD = String(movedDate.getUTCDate()).padStart(2, "0");
    return `${nextY}-${nextM}-${nextD}`;
  }
  function isEditingFocusableControl(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;

    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;

    const type = String(el.getAttribute("type") || "text").toLowerCase();
    const nonTextTypes = new Set([
      "button",
      "checkbox",
      "radio",
      "submit",
      "reset",
      "range",
      "file",
      "color"
    ]);
    return !nonTextTypes.has(type);
  }

  function calcularMetricasDia(cuentas, totalDescuento) {
    const acumulados = {
      efectivo: 0,
      tarjeta: 0,
      igs: 0,
      transferencia: 0
    };

    (cuentas || []).forEach((c) => {
      const total = Number(c.totalC || 0);
      if (!Number.isFinite(total) || total < 0) return;

      const formaPago = String(c.FormaPagoC || "").trim().toLowerCase();
      if (formaPago === "efectivo") acumulados.efectivo += total;
      if (formaPago === "tarjeta") acumulados.tarjeta += total;
      if (formaPago === "igs") acumulados.igs += total;
      if (formaPago === "transferencia") acumulados.transferencia += total;
    });

    const brutoDia =
      acumulados.efectivo +
      acumulados.tarjeta +
      acumulados.igs +
      acumulados.transferencia;
    const descuentoDia = Number(totalDescuento) || 0;
    const netoDia = brutoDia - descuentoDia;
    const efectivoCajaDia = acumulados.efectivo - descuentoDia;
    const pct = (val) => (brutoDia > 0 ? (val * 100) / brutoDia : 0);

    return {
      acumulados,
      brutoDia,
      netoDia,
      efectivoCajaDia,
      porcentajes: {
        efectivo: pct(acumulados.efectivo),
        tarjeta: pct(acumulados.tarjeta),
        igs: pct(acumulados.igs),
        transferencia: pct(acumulados.transferencia)
      }
    };
  }

  function debounce(fn, delay = 350) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
  function getUiStateUserId() {
    try {
      const raw = sessionStorage.getItem("user");
      if (!raw) return "anon";
      const user = JSON.parse(raw);
      const candidates = [
        user?.idUsuario,
        user?.idusuario,
        user?.IDUsuario,
        user?.IdUsuario,
        user?.idUser,
        user?.id
      ];
      for (const candidate of candidates) {
        const num = Number(candidate);
        if (Number.isInteger(num) && num > 0) return String(num);
        const text = String(candidate ?? "").trim();
        if (text) return text;
      }
    } catch {
      // ignore invalid session payload
    }
    return "anon";
  }
  function loadSessionUiState(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function saveSessionUiState(key, state) {
    try {
      sessionStorage.setItem(key, JSON.stringify(state || {}));
    } catch {
      // ignore storage write errors
    }
  }

  function claseFormaPago(formaPago) {
    const f = String(formaPago || "").trim().toLowerCase();
    if (f === "efectivo") return "fp-efectivo";
    if (f === "tarjeta") return "fp-tarjeta";
    if (f === "igs") return "fp-igs";
    if (f === "transferencia") return "fp-transferencia";
    return "";
  }

  function normalizarPrecio(raw, fallback = 0) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.round(n * 100) / 100;
  }

  function kpiIcon(tipo) {
    const base = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    if (tipo === "total") {
      return `<svg class="kpi-icon icon-total" ${base}><path d="M3 3v18h18"/><path d="M7 14l3-3 3 2 4-5"/></svg>`;
    }
    if (tipo === "bruto") {
      return `<svg class="kpi-icon icon-bruto" ${base}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`;
    }
    if (tipo === "efectivo") {
      return `<svg class="kpi-icon icon-efectivo" ${base}><rect x="2" y="7" width="20" height="10" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`;
    }
    if (tipo === "caja") {
      return `<svg class="kpi-icon icon-caja" ${base}><rect x="2" y="7" width="20" height="12" rx="2"/><path d="M2 11h20"/><path d="M15 15h4"/></svg>`;
    }
    if (tipo === "tarjeta") {
      return `<svg class="kpi-icon icon-tarjeta" ${base}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>`;
    }
    if (tipo === "igs") {
      return `<svg class="kpi-icon icon-igs" ${base}><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"/><path d="M12 9v6"/><path d="M9 12h6"/></svg>`;
    }
    if (tipo === "transferencia") {
      return `<svg class="kpi-icon icon-transferencia" ${base}><path d="M7 7h10"/><path d="M13 3l4 4-4 4"/><path d="M17 17H7"/><path d="M11 13l-4 4 4 4"/></svg>`;
    }
    if (tipo === "descuento") {
      return `<svg class="kpi-icon icon-descuento" ${base}><path d="M20.6 13.4L11 3H4v7l9.6 10.4a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>`;
    }
    if (tipo === "chart") {
      return `<svg class="kpi-icon icon-chart" ${base}><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v9h-9"/><path d="M21 3l-7 7"/></svg>`;
    }
    return "";
  }

  function actionControlIcon(tipo) {
    const fromUi = (name) => {
      if (typeof window.__uiIcons?.get !== "function") return "";
      return window.__uiIcons.get(name, { className: "cobro-action-icon" }) || "";
    };
    if (tipo === "pdf") {
      return fromUi("document-text")
        || '<svg class="cobro-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
    }
    if (tipo === "mensual") {
      return '<svg class="cobro-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/><path d="m8 14 2 2 4-4"/></svg>';
    }
    if (tipo === "faltantes") {
      return '<svg class="cobro-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3 4 7v6c0 4.8 3.2 7.8 8 8.9 4.8-1.1 8-4.1 8-8.9V7l-8-4Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1"/></svg>';
    }
    return "";
  }

  function renderCobro(container) {
    container.innerHTML = `
  <div class="cobro-view">
    <section class="cobro-dashboard-unified">
      <article class="cobro-chart-card cobro-unified-card">
        <div class="cobro-unified-layout">
          <section class="cobro-unified-chart">
            <div class="cobro-chart-title">${kpiIcon("chart")}Distribucion de ingresos del dia</div>
            <div id="cobro-chart-ring" class="cobro-chart-ring">
              <div class="cobro-chart-center">
                <span>Bruto</span>
                <strong id="chart-centro-total">$0.00</strong>
              </div>
            </div>
          </section>

          <section class="cobro-unified-totales">
            <div class="cobro-chart-title">${kpiIcon("total")}Totales del dia</div>
            <div class="cobro-totales-grid">
              <article class="cobro-kpi kpi-total-dia">
                <span class="kpi-label">${kpiIcon("total")}Total del dia</span>
                <strong id="kpi-total-dia">$0.00</strong>
              </article>

              <article class="cobro-kpi">
                <span class="kpi-label">${kpiIcon("bruto")}Bruto del dia</span>
                <strong id="kpi-bruto-dia">$0.00</strong>
              </article>

              <article class="cobro-kpi">
                <span class="kpi-label">${kpiIcon("efectivo")}Efectivo</span>
                <strong id="kpi-efectivo">$0.00</strong>
              </article>

              <article class="cobro-kpi kpi-efectivo-caja">
                <span class="kpi-label">${kpiIcon("caja")}Efectivo en caja</span>
                <strong id="kpi-efectivo-caja">$0.00</strong>
              </article>

              <article class="cobro-kpi">
                <span class="kpi-label">${kpiIcon("tarjeta")}Tarjeta</span>
                <strong id="kpi-tarjeta">$0.00</strong>
              </article>

              <article class="cobro-kpi">
                <span class="kpi-label">${kpiIcon("igs")}IGS</span>
                <strong id="kpi-igs">$0.00</strong>
              </article>

              <article class="cobro-kpi">
                <span class="kpi-label">${kpiIcon("transferencia")}Transferencia</span>
                <strong id="kpi-transferencia">$0.00</strong>
              </article>

              <article class="cobro-kpi kpi-descuento">
                <span class="kpi-label">${kpiIcon("descuento")}Descuentos</span>
                <strong id="kpi-descuentos">$0.00</strong>
              </article>
            </div>
          </section>

          <section class="cobro-unified-cash">
            <div class="cobro-chart-title">${kpiIcon("caja")}Conteo de billetes</div>
            <div class="cobro-cash-counter">
              <table class="cobro-cash-table">
                <thead>
                  <tr>
                    <th>Billete</th>
                    <th>Cantidad</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td><input class="cobro-cash-input" type="number" min="0" step="0.01" data-bill="1"></td>
                    <td id="cash-total-1">$0.00</td>
                  </tr>
                  <tr>
                    <td>5</td>
                    <td><input class="cobro-cash-input" type="number" min="0" step="1" data-bill="5"></td>
                    <td id="cash-total-5">$0.00</td>
                  </tr>
                  <tr>
                    <td>10</td>
                    <td><input class="cobro-cash-input" type="number" min="0" step="1" data-bill="10"></td>
                    <td id="cash-total-10">$0.00</td>
                  </tr>
                  <tr>
                    <td>20</td>
                    <td><input class="cobro-cash-input" type="number" min="0" step="1" data-bill="20"></td>
                    <td id="cash-total-20">$0.00</td>
                  </tr>
                  <tr>
                    <td>50</td>
                    <td><input class="cobro-cash-input" type="number" min="0" step="1" data-bill="50"></td>
                    <td id="cash-total-50">$0.00</td>
                  </tr>
                  <tr>
                    <td>100</td>
                    <td><input class="cobro-cash-input" type="number" min="0" step="1" data-bill="100"></td>
                    <td id="cash-total-100">$0.00</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="cobro-cash-total-row">
                    <td colspan="2">TOTAL</td>
                    <td id="cash-grand-total">$0.00</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      </article>
    </section>

    <section class="cobro-container cobro-pos">
      <div class="cobro-pos-main">
        <div class="cuenta-title">Cobrar a paciente</div>

        <div class="cobro-steps">
          <div id="step-paciente" class="cobro-step is-active">1. Seleccionar paciente</div>
          <div id="step-servicio" class="cobro-step">2. Agregar servicios</div>
          <div id="step-pago" class="cobro-step">3. Confirmar pago</div>
        </div>

        <div class="cobro-section">
          <label class="form-label">Paciente</label>
          <div class="cobro-buscador">
            <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
            <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
            <input type="search" id="buscar-paciente" name="buscar-paciente-cobro" placeholder="Escriba al menos 2 letras para buscar paciente" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
            <div id="lista-pacientes" class="autocomplete-list"></div>
          </div>
          <div class="cobro-selected-row">
            <div id="paciente-seleccionado" class="paciente-seleccionado">Sin paciente seleccionado</div>
            <button id="btn-limpiar-paciente-cobro" class="btn-cobro-secondary" type="button">Limpiar</button>
          </div>
        </div>

        <div id="cobro-step-servicio-block" class="cobro-section is-disabled">
          <label class="form-label">Servicios</label>
          <div class="cobro-buscador">
            <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
            <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
            <input type="search" id="buscar-servicio" name="buscar-servicio-cobro" placeholder="Escriba al menos 2 letras para buscar servicio" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" disabled>
            <div id="lista-servicios" class="autocomplete-list"></div>
          </div>
        </div>

        <div class="cobro-table-wrap">
          <table class="cobro-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th style="width:140px;">Cantidad</th>
                <th style="width:130px;">Precio Unit.</th>
                <th style="width:130px;">Subtotal</th>
                <th style="width:80px; text-align:center;">Quitar</th>
              </tr>
            </thead>
            <tbody id="cobro-tbody"></tbody>
          </table>
          <div id="cobro-empty-state" class="cobro-empty-state">Carrito vacio. Agregue un servicio para iniciar el cobro.</div>
        </div>
      </div>

      <aside class="cobro-pos-summary">
        <div class="cobro-summary-title">Resumen</div>

        <div class="cobro-summary-patient">
          <span>Paciente</span>
          <strong id="resumen-paciente">Sin seleccionar</strong>
        </div>

        <div class="cobro-summary-line">
          <span>Servicios</span>
          <strong id="cobro-items-count">0</strong>
        </div>

        <div class="cobro-summary-line">
          <span>Subtotal</span>
          <strong id="cobro-subtotal">${precioUSD(0)}</strong>
        </div>

        <div class="cobro-summary-line cobro-summary-total-line">
          <span>Total a cobrar</span>
          <strong id="cobro-total">${precioUSD(0)}</strong>
        </div>

        <div class="cobro-summary-actions">
          <label class="form-label" for="forma-pago">Forma de pago</label>
          <select id="forma-pago" class="cobro-forma-pago">
            <option value="">Seleccione forma de pago</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Tarjeta">Tarjeta</option>
            <option value="IGS">IGS</option>
            <option value="Transferencia">Transferencia</option>
          </select>

          <button id="btn-guardar-cuenta" class="btn-cobrar" disabled>Guardar cobro</button>
        </div>
      </aside>
    </section>

      <div class="cuenta-container">
        <div class="cuenta-header">
          <div class="cuenta-title">Cuentas del dia</div>
          <div class="cuenta-controls">
            <div class="cuenta-controls-main">
              <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
              <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
              <label class="cuenta-toggle-numeracion" for="toggle-numeracion-cuentas">
                <input type="checkbox" id="toggle-numeracion-cuentas">
                Numeracion
              </label>
              <label class="cuenta-toggle-doctor" for="toggle-doctor-cuentas">
                <input type="checkbox" id="toggle-doctor-cuentas">
                Doctor
              </label>
              <input type="date" id="cuenta-date">
              <input type="search" id="cuenta-search" name="cuenta-search-cobro" placeholder="Buscar paciente o tratamiento" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
              <select id="cuenta-doctor-filter" class="cobro-forma-pago" aria-label="Filtrar por doctor">
                <option value="">Todos los doctores</option>
                <option value="__none__">Sin doctor</option>
              </select>
              <select id="cuenta-forma-pago-filter" class="cobro-forma-pago" aria-label="Filtrar por tipo de pago">
                <option value="">Todos los tipos</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="igs">IGS</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <div class="cuenta-controls-actions">
              <button id="btn-reporte-cobro" class="btn-cobro-secondary btn-cobro-icon-btn" type="button" title="Reporte PDF" aria-label="Reporte PDF">${actionControlIcon("pdf")}</button>
              <button id="btn-abrir-reporte-mensual" class="btn-cobro-secondary btn-cobro-icon-btn" type="button" title="Reporte mensual" aria-label="Reporte mensual">${actionControlIcon("mensual")}</button>
              <button id="btn-abrir-faltantes-cobro" class="btn-cobro-secondary btn-cobro-icon-btn" type="button" title="Faltantes cobro" aria-label="Faltantes cobro">${actionControlIcon("faltantes")}</button>
            </div>
          </div>
        </div>

      <div class="cuenta-table-wrap">
        <table class="cuenta-table">
          <thead>
            <tr>
              <th hidden>IdCuenta</th>
              <th hidden>IdDetalleCuenta</th>
              <th class="cuenta-col-num">#</th>
              <th>Nombre</th>
              <th>Total</th>
              <th>Forma de Pago</th>
              <th>Cantidad</th>
              <th>Tratamiento</th>
              <th class="cuenta-col-doctor">Doctor</th>
              <th hidden>Fecha</th>
              <th>Quitar</th>
            </tr>
          </thead>
          <tbody id="cuenta-tbody"></tbody>
        </table>

        <div class="cuenta-totales">
          <div id="cuenta-subtotal" class="cuenta-total-line">
            <span>SUB TOTAL:</span>
            <strong>$0.00</strong>
          </div>
          <div id="cuenta-total" class="cuenta-total-line total-final">
            <span>TOTAL:</span>
            <strong>$0.00</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="descuento-container">
      <div class="descuento-header">
        <div class="descuento-title">Compras y descuentos</div>
      </div>

      <div class="descuento-form">
        <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
        <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
        <input type="text" id="descuento-nombre" name="descuento-nombre-cobro" placeholder="Concepto del egreso" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <input type="number" id="descuento-cantidad" placeholder="Cantidad" step="0.01" min="0">
        <button id="btn-agregar-descuento" class="btn-cancelar">Agregar</button>
      </div>

      <div class="descuento-table-wrap">
        <table class="descuento-table" id="descuento-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th style="width:160px;">Fecha</th>
              <th style="width:160px;">Cantidad</th>
              <th style="width:80px; text-align:center;">Quitar</th>
            </tr>
          </thead>
          <tbody id="descuento-tbody"></tbody>
        </table>
      </div>

      <div class="descuento-totales">
        <div id="descuento-total" class="descuento-total-line">
          <span>TOTAL DESCUENTO:</span>
          <strong>$0.00</strong>
        </div>
      </div>
    </div>

    <div id="reporte-mensual-modal" class="cobro-modal" hidden>
      <div class="cobro-modal-backdrop" data-cobro-modal-close="1"></div>
      <div class="cobro-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="reporte-mensual-modal-title">
        <div class="cobro-modal-header">
          <h3 id="reporte-mensual-modal-title">Reporte mensual por pacientes</h3>
          <button id="btn-cerrar-reporte-mensual" class="btn-cobro-secondary" type="button">Cerrar</button>
        </div>

        <div class="cuenta-controls cobro-modal-controls">
          <input type="month" id="reporte-mensual-mes">
          <select id="reporte-mensual-servicio" class="cobro-forma-pago">
            <option value="">Todos los tratamientos</option>
          </select>
          <select id="reporte-mensual-forma-pago" class="cobro-forma-pago" aria-label="Filtrar por metodo de pago mensual">
            <option value="">Todos los metodos de pago</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="igs">IGS</option>
            <option value="transferencia">Transferencia</option>
          </select>
          <button id="btn-reporte-mensual-pdf" class="btn-cobro-secondary" type="button">Generar reporte mensual PDF</button>
        </div>

        <div class="cuenta-table-wrap">
          <table class="cuenta-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th style="width:160px;">Cantidad</th>
                <th style="width:180px;">Monto</th>
              </tr>
            </thead>
            <tbody id="reporte-mensual-tbody"></tbody>
          </table>

          <div class="cuenta-totales">
            <div id="reporte-mensual-pacientes" class="cuenta-total-line">
              <span>PACIENTES UNICOS:</span>
              <strong>0</strong>
            </div>
            <div id="reporte-mensual-cantidad" class="cuenta-total-line">
              <span>CANTIDAD TOTAL MES:</span>
              <strong>0</strong>
            </div>
            <div id="reporte-mensual-total" class="cuenta-total-line total-final">
              <span>MONTO TOTAL MES:</span>
              <strong>$0.00</strong>
            </div>
            <div id="reporte-mensual-total-global" class="cuenta-total-line total-final">
              <span>MONTO GLOBAL MES (SIN FILTROS):</span>
              <strong>$0.00</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="faltantes-cobro-modal" class="cobro-modal" hidden>
      <div class="cobro-modal-backdrop" data-cobro-modal-close="1"></div>
      <div class="cobro-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="faltantes-cobro-modal-title">
        <div class="cobro-modal-header">
          <h3 id="faltantes-cobro-modal-title">Faltantes de cobro (En Cola)</h3>
          <button id="btn-cerrar-faltantes-cobro" class="btn-cobro-secondary" type="button">Cerrar</button>
        </div>

        <div class="faltantes-cobro-meta">
          <span id="faltantes-cobro-fecha">Fecha: -</span>
        </div>

        <div class="faltantes-cobro-resumen">
          <article class="faltantes-cobro-kpi">
            <span>Atendidos en cola</span>
            <strong id="faltantes-cobro-atendidos">0</strong>
          </article>
          <article class="faltantes-cobro-kpi">
            <span>Cobrados</span>
            <strong id="faltantes-cobro-cobrados">0</strong>
          </article>
          <article class="faltantes-cobro-kpi is-danger">
            <span>Faltantes</span>
            <strong id="faltantes-cobro-total">0</strong>
          </article>
        </div>

        <div class="cuenta-table-wrap">
          <table class="cuenta-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th style="width:180px;">Hora</th>
                <th style="width:180px;">Contacto</th>
              </tr>
            </thead>
            <tbody id="faltantes-cobro-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
`;

    const inputPaciente = document.getElementById("buscar-paciente");
    const listaPacientes = document.getElementById("lista-pacientes");
    const inputServicio = document.getElementById("buscar-servicio");
    const listaServicios = document.getElementById("lista-servicios");
    const pacienteTitulo = document.getElementById("paciente-seleccionado");
    const resumenPaciente = document.getElementById("resumen-paciente");
    const stepPaciente = document.getElementById("step-paciente");
    const stepServicio = document.getElementById("step-servicio");
    const stepPago = document.getElementById("step-pago");
    const servicioBlock = document.getElementById("cobro-step-servicio-block");
    const btnLimpiarPaciente = document.getElementById("btn-limpiar-paciente-cobro");
    const tbody = document.getElementById("cobro-tbody");
    const emptyState = document.getElementById("cobro-empty-state");
    const subtotalBox = document.getElementById("cobro-subtotal");
    const itemsCountBox = document.getElementById("cobro-items-count");
    const totalBox = document.getElementById("cobro-total");
    const btnGuardar = document.getElementById("btn-guardar-cuenta");
    const formaPagoSelect = document.getElementById("forma-pago");
    const inputFecha = document.getElementById("cuenta-date");
    const cuentaSearch = document.getElementById("cuenta-search");
    const cuentaDoctorFilter = document.getElementById("cuenta-doctor-filter");
    const cuentaFormaPagoFilter = document.getElementById("cuenta-forma-pago-filter");
    const btnReporteCobro = document.getElementById("btn-reporte-cobro");
    const btnAbrirReporteMensual = document.getElementById("btn-abrir-reporte-mensual");
    const btnAbrirFaltantesCobro = document.getElementById("btn-abrir-faltantes-cobro");
    const toggleNumeracionCuentas = document.getElementById("toggle-numeracion-cuentas");
    const toggleDoctorCuentas = document.getElementById("toggle-doctor-cuentas");
    const cuentaTable = document.querySelector(".cuenta-table");
    const descuentoTbody = document.getElementById("descuento-tbody");
    const descuentoTotalBox = document.getElementById("descuento-total");
    const btnAgregarDescuento = document.getElementById("btn-agregar-descuento");
    const inputDescuentoNombre = document.getElementById("descuento-nombre");
    const reporteMensualModal = document.getElementById("reporte-mensual-modal");
    const btnCerrarReporteMensual = document.getElementById("btn-cerrar-reporte-mensual");
    const inputReporteMensualMes = document.getElementById("reporte-mensual-mes");
    const selectReporteMensualServicio = document.getElementById("reporte-mensual-servicio");
    const selectReporteMensualFormaPago = document.getElementById("reporte-mensual-forma-pago");
    const btnReporteMensualPdf = document.getElementById("btn-reporte-mensual-pdf");
    const tbodyReporteMensual = document.getElementById("reporte-mensual-tbody");
    const reporteMensualPacientesBox = document.getElementById("reporte-mensual-pacientes");
    const reporteMensualCantidadBox = document.getElementById("reporte-mensual-cantidad");
    const reporteMensualTotalBox = document.getElementById("reporte-mensual-total");
    const reporteMensualTotalGlobalBox = document.getElementById("reporte-mensual-total-global");
    const faltantesCobroModal = document.getElementById("faltantes-cobro-modal");
    const btnCerrarFaltantesCobro = document.getElementById("btn-cerrar-faltantes-cobro");
    const faltantesCobroFecha = document.getElementById("faltantes-cobro-fecha");
    const faltantesCobroAtendidos = document.getElementById("faltantes-cobro-atendidos");
    const faltantesCobroCobrados = document.getElementById("faltantes-cobro-cobrados");
    const faltantesCobroTotal = document.getElementById("faltantes-cobro-total");
    const tbodyFaltantesCobro = document.getElementById("faltantes-cobro-tbody");
    const kpiTotalDia = document.getElementById("kpi-total-dia");
    const kpiBrutoDia = document.getElementById("kpi-bruto-dia");
    const kpiEfectivo = document.getElementById("kpi-efectivo");
    const kpiEfectivoCaja = document.getElementById("kpi-efectivo-caja");
    const kpiTarjeta = document.getElementById("kpi-tarjeta");
    const kpiIgs = document.getElementById("kpi-igs");
    const kpiTransferencia = document.getElementById("kpi-transferencia");
    const kpiDescuentos = document.getElementById("kpi-descuentos");
    const chartRing = document.getElementById("cobro-chart-ring");
    const chartCentroTotal = document.getElementById("chart-centro-total");
    const kpiTotalesGrid = document.querySelector(".cobro-totales-grid");
    const kpiTotalesCards = kpiTotalesGrid
      ? Array.from(kpiTotalesGrid.querySelectorAll(".cobro-kpi"))
      : [];
    const kpiTotalDiaCard = kpiTotalesGrid?.querySelector(".cobro-kpi.kpi-total-dia") || null;
    const cashInputs = Array.from(document.querySelectorAll(".cobro-cash-input"));
    const cashGrandTotal = document.getElementById("cash-grand-total");
    let isDisposed = false;
    let isSavingCuenta = false;
    let isCreatingDescuento = false;

    const requestState = {
      paciente: { seq: 0, controller: null },
      servicio: { seq: 0, controller: null },
      cuentas: { seq: 0, controller: null },
      descuentos: { seq: 0, controller: null },
      doctores: { seq: 0, controller: null },
      serviciosMensual: { seq: 0, controller: null },
      reporteMensual: { seq: 0, controller: null },
      faltantes: { seq: 0, controller: null }
    };
    const cobroUiStateKey = `ui_state_cobro_${getUiStateUserId()}`;
    const cobroUiState = {
      numeracion: false,
      doctor: false,
      search: "",
      doctorFilter: "",
      formaPagoFilter: "",
      ...loadSessionUiState(cobroUiStateKey)
    };
    const getSelectSafeValue = (selectEl, value) => {
      if (!selectEl) return "";
      const target = String(value || "").trim();
      const exists = Array.from(selectEl.options || []).some((opt) => opt.value === target);
      return exists ? target : "";
    };
    const getCobroUiStateSnapshot = () => ({
      numeracion: !!toggleNumeracionCuentas?.checked,
      doctor: !!toggleDoctorCuentas?.checked,
      search: String(cuentaSearch?.value || ""),
      doctorFilter: String(cuentaDoctorFilter?.dataset?.persistedValue || cuentaDoctorFilter?.value || ""),
      formaPagoFilter: String(cuentaFormaPagoFilter?.value || "")
    });
    const persistCobroUiState = () => {
      saveSessionUiState(cobroUiStateKey, getCobroUiStateSnapshot());
    };
    if (toggleNumeracionCuentas) {
      toggleNumeracionCuentas.checked = !!cobroUiState.numeracion;
    }
    if (toggleDoctorCuentas) {
      toggleDoctorCuentas.checked = !!cobroUiState.doctor;
    }
    if (cuentaSearch) {
      cuentaSearch.value = String(cobroUiState.search || "");
    }
    if (cuentaFormaPagoFilter) {
      cuentaFormaPagoFilter.value = getSelectSafeValue(cuentaFormaPagoFilter, cobroUiState.formaPagoFilter);
    }
    if (cuentaDoctorFilter) {
      const doctorFilterSaved = String(cobroUiState.doctorFilter || "").trim();
      const doctorFilterNow = getSelectSafeValue(cuentaDoctorFilter, doctorFilterSaved);
      cuentaDoctorFilter.value = doctorFilterNow;
      if (doctorFilterSaved && !doctorFilterNow) {
        cuentaDoctorFilter.dataset.persistedValue = doctorFilterSaved;
      }
    }
    const shouldPreserveCuentaSearch = String(cuentaSearch?.value || "").trim() !== "";

    function isAbortError(err) {
      return String(err?.name || "") === "AbortError";
    }

    function isCobroViewActive() {
      return !isDisposed && !!container?.isConnected && window.currentView === "Cobro";
    }

    function abortControllerSafe(controller) {
      if (!controller) return;
      try {
        controller.abort();
      } catch {
        // ignore abort failures
      }
    }

    function abortRequest(key) {
      const state = requestState[key];
      if (!state) return;
      abortControllerSafe(state.controller);
      state.controller = null;
    }

    function invalidateRequest(key) {
      const state = requestState[key];
      if (!state) return;
      state.seq += 1;
      abortRequest(key);
    }

    function beginRequest(key) {
      const state = requestState[key];
      if (!state) return { seq: 0, controller: null, signal: undefined };
      abortRequest(key);
      state.seq += 1;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      state.controller = controller;
      return {
        seq: state.seq,
        controller,
        signal: controller ? controller.signal : undefined
      };
    }

    function endRequest(key, controller) {
      const state = requestState[key];
      if (!state) return;
      if (state.controller === controller) {
        state.controller = null;
      }
    }

    function isStaleRequest(key, seq) {
      return !isCobroViewActive() || !requestState[key] || seq !== requestState[key].seq;
    }

    function abrirCobroModal(modalEl) {
      if (!modalEl) return;
      modalEl.hidden = false;
      document.body.classList.add("cobro-modal-open");
    }

    function cerrarCobroModal(modalEl) {
      if (!modalEl) return;
      modalEl.hidden = true;
      const hayModalVisible = !!document.querySelector(".cobro-modal:not([hidden])");
      if (!hayModalVisible) {
        document.body.classList.remove("cobro-modal-open");
      }
    }

    function abrirReporteMensualModal() {
      abrirCobroModal(reporteMensualModal);
    }

    function cerrarReporteMensualModal() {
      cerrarCobroModal(reporteMensualModal);
    }

    function abrirFaltantesCobroModal() {
      abrirCobroModal(faltantesCobroModal);
    }

    function cerrarFaltantesCobroModal() {
      cerrarCobroModal(faltantesCobroModal);
    }

    function restaurarHoverTotalesKpi() {
      if (!kpiTotalesCards.length) return;
      kpiTotalesCards.forEach((card) => card.classList.remove("is-kpi-active"));
      if (kpiTotalDiaCard) {
        kpiTotalDiaCard.classList.remove("kpi-total-dia-suspended");
      }
    }

    function aplicarHoverTotalesKpi(card) {
      if (!card || !kpiTotalesGrid || !kpiTotalesGrid.contains(card)) return;
      if (card === kpiTotalDiaCard) {
        restaurarHoverTotalesKpi();
        return;
      }
      kpiTotalesCards.forEach((item) => item.classList.remove("is-kpi-active"));
      card.classList.add("is-kpi-active");
      if (kpiTotalDiaCard) {
        kpiTotalDiaCard.classList.add("kpi-total-dia-suspended");
      }
    }

    function configurarHoverTotalesKpi() {
      if (!kpiTotalesGrid || !kpiTotalesCards.length) return;

      kpiTotalesCards.forEach((card) => {
        if (!card.hasAttribute("tabindex")) {
          card.setAttribute("tabindex", "0");
        }
        card.addEventListener("mouseenter", () => aplicarHoverTotalesKpi(card));
      });

      kpiTotalesGrid.addEventListener("mouseleave", restaurarHoverTotalesKpi);
      kpiTotalesGrid.addEventListener("focusin", (e) => {
        const card = e.target?.closest?.(".cobro-kpi");
        if (card) aplicarHoverTotalesKpi(card);
      });
      kpiTotalesGrid.addEventListener("focusout", () => {
        window.requestAnimationFrame(() => {
          if (!kpiTotalesGrid.matches(":focus-within")) {
            restaurarHoverTotalesKpi();
          }
        });
      });
    }

    function normalizarTextoCruce(value) {
      const raw = String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (!raw) return "";
      return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function formatearHoraCola(value) {
      const raw = String(value || "").trim();
      if (!raw) return "-";
      const m = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return raw;
      let hh = Number(m[1]);
      const mm = m[2];
      const period = hh >= 12 ? "pm" : "am";
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${hh}:${mm} ${period}`;
    }

    function renderFaltantesCobro(lista, resumen, fecha) {
      if (!tbodyFaltantesCobro) return;

      const rows = Array.isArray(lista) ? lista : [];
      const safeResumen = {
        atendidosCola: Number(resumen?.atendidosCola || 0),
        cobrados: Number(resumen?.cobrados || 0),
        faltantes: Number(resumen?.faltantes || rows.length || 0)
      };

      if (faltantesCobroFecha) {
        faltantesCobroFecha.textContent = `Fecha: ${formatearFechaCorta(fecha) || "-"}`;
      }
      if (faltantesCobroAtendidos) faltantesCobroAtendidos.textContent = String(safeResumen.atendidosCola);
      if (faltantesCobroCobrados) faltantesCobroCobrados.textContent = String(safeResumen.cobrados);
      if (faltantesCobroTotal) faltantesCobroTotal.textContent = String(safeResumen.faltantes);

      tbodyFaltantesCobro.innerHTML = "";
      if (!rows.length) {
        tbodyFaltantesCobro.innerHTML = `
          <tr>
            <td colspan="3" style="text-align:center;color:#64748b">No hay faltantes por cobrar</td>
          </tr>
        `;
        return;
      }

      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(row.nombrePaciente || "-")}</td>
          <td style="text-align:center">${escapeHtml(formatearHoraCola(row.horaAgenda))}</td>
          <td style="text-align:center">${escapeHtml(row.contacto || "-")}</td>
        `;
        tbodyFaltantesCobro.appendChild(tr);
      });
    }

    async function cargarFaltantesCobro() {
      if (!isCobroViewActive()) return;
      const fecha = String(inputFecha?.value || "").trim();
      if (!fecha) {
        faltantesCobroActual = [];
        faltantesCobroResumenActual = { atendidosCola: 0, cobrados: 0, faltantes: 0, fecha: "" };
        renderFaltantesCobro(faltantesCobroActual, faltantesCobroResumenActual, "");
        return;
      }
      const req = beginRequest("faltantes");
      const localSeq = req.seq;

      renderFaltantesCobro(
        [],
        { atendidosCola: 0, cobrados: 0, faltantes: 0 },
        fecha
      );
      if (tbodyFaltantesCobro) {
        tbodyFaltantesCobro.innerHTML = `
          <tr>
            <td colspan="3" style="text-align:center;color:#64748b">Cargando faltantes...</td>
          </tr>
        `;
      }

      try {
        const res = await fetch(
          `/api/cola?fecha=${encodeURIComponent(fecha)}`,
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("faltantes", localSeq)) return;
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo cargar En Cola");
        }

        const colaDia = Array.isArray(json.data) ? json.data : [];
        const atendidosMap = new Map();
        colaDia.forEach((item) => {
          const estado = String(item?.estado || "").trim().toLowerCase();
          if (estado !== "atendido") return;

          const key = normalizarTextoCruce(item?.nombrePaciente);
          if (!key) return;

          const existente = atendidosMap.get(key);
          if (!existente) {
            atendidosMap.set(key, {
              key,
              nombrePaciente: String(item?.nombrePaciente || "").trim() || "-",
              horaAgenda: String(item?.horaAgenda || "").trim(),
              contacto: String(item?.contacto || "").trim()
            });
            return;
          }

          if (!existente.horaAgenda && item?.horaAgenda) {
            existente.horaAgenda = String(item.horaAgenda || "").trim();
          }
          if (!existente.contacto && item?.contacto) {
            existente.contacto = String(item.contacto || "").trim();
          }
        });

        const cobradosSet = new Set();
        (cuentasActuales || []).forEach((item) => {
          const key = normalizarTextoCruce(item?.nombrePaciente);
          if (key) cobradosSet.add(key);
        });

        const faltantes = Array.from(atendidosMap.values())
          .filter((item) => !cobradosSet.has(item.key))
          .map(({ key, ...row }) => row)
          .sort((a, b) => String(a.nombrePaciente || "").localeCompare(String(b.nombrePaciente || ""), "es", { sensitivity: "base" }));

        faltantesCobroActual = faltantes;
        faltantesCobroResumenActual = {
          atendidosCola: atendidosMap.size,
          cobrados: cobradosSet.size,
          faltantes: faltantes.length,
          fecha
        };
        if (isStaleRequest("faltantes", localSeq)) return;
        renderFaltantesCobro(faltantesCobroActual, faltantesCobroResumenActual, fecha);
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("faltantes", localSeq)) return;
        console.error(err);
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
          alert("Opps ocurrio un error de conexion");
        }

        if (tbodyFaltantesCobro) {
          tbodyFaltantesCobro.innerHTML = `
            <tr>
              <td colspan="3" style="text-align:center;color:#64748b">No se pudieron cargar los faltantes</td>
            </tr>
          `;
        }
      } finally {
        endRequest("faltantes", req.controller);
      }
    }

    function blindarInputAutofill(inputEl, nameBase, options = {}) {
      if (!inputEl) return;
      const preserveValue = options?.preserveValue === true;
      inputEl.setAttribute("name", `${nameBase}-${Date.now()}`);
      if (!preserveValue) {
        inputEl.value = "";
      }
      // Evita autofill agresivo del navegador al recargar (F5).
      inputEl.readOnly = true;
      setTimeout(() => {
        if (!inputEl.isConnected) return;
        inputEl.readOnly = false;
        if (!preserveValue) {
          inputEl.value = "";
        }
      }, 80);
      setTimeout(() => {
        if (!inputEl.isConnected) return;
        if (!preserveValue) {
          inputEl.value = "";
        }
      }, 350);
      setTimeout(() => {
        if (!inputEl.isConnected) return;
        if (!preserveValue) {
          inputEl.value = "";
        }
      }, 1200);
    }

    blindarInputAutofill(inputPaciente, "cobro-paciente-search");
    blindarInputAutofill(inputServicio, "cobro-servicio-search");
    blindarInputAutofill(cuentaSearch, "cobro-cuenta-search", { preserveValue: shouldPreserveCuentaSearch });
    blindarInputAutofill(inputDescuentoNombre, "cobro-descuento-nombre");

    function normalizarCantidadConteo(input, { aplicar = false } = {}) {
      const denominacion = Number(input?.dataset?.bill || 0);
      const textoRaw = String(input?.value ?? "").trim().replace(",", ".");
      if (!textoRaw) return 0;

      const cantidadRaw = Number(textoRaw);
      if (!Number.isFinite(cantidadRaw) || cantidadRaw < 0) {
        if (aplicar) input.value = "";
        return 0;
      }

      let cantidad = cantidadRaw;
      if (denominacion > 1) {
        cantidad = Math.trunc(cantidadRaw);
      } else {
        cantidad = Math.round(cantidadRaw * 100) / 100;
      }

      if (aplicar) {
        if (cantidad <= 0) {
          input.value = "";
        } else if (denominacion > 1) {
          input.value = String(cantidad);
        } else {
          input.value = String(cantidad);
        }
      }

      return cantidad;
    }

    function actualizarConteoBilletes() {
      let totalConteo = 0;

      cashInputs.forEach((input) => {
        const denominacion = Number(input.dataset.bill || 0);
        const cantidad = normalizarCantidadConteo(input);
        const subtotal = denominacion * cantidad;
        totalConteo += subtotal;

        const subtotalCell = document.getElementById(`cash-total-${denominacion}`);
        if (subtotalCell) subtotalCell.textContent = precioUSD(subtotal);
      });

      if (cashGrandTotal) cashGrandTotal.textContent = precioUSD(totalConteo);
    }

    cashInputs.forEach((input) => {
      const denominacion = Number(input.dataset.bill || 0);
      input.step = denominacion === 1 ? "0.01" : "1";
      input.addEventListener("input", () => {
        if (denominacion > 1) {
          normalizarCantidadConteo(input, { aplicar: true });
        }
        actualizarConteoBilletes();
      });
      input.addEventListener("blur", () => {
        normalizarCantidadConteo(input, { aplicar: true });
        actualizarConteoBilletes();
      });
    });

    if (!window.__cobroAutocompleteOutsideHandler) {
      window.__cobroAutocompleteOutsideHandler = (e) => {
        if (!e.target.closest(".cobro-buscador")) {
          const lp = document.getElementById("lista-pacientes");
          const ls = document.getElementById("lista-servicios");
          if (lp) lp.style.display = "none";
          if (ls) ls.style.display = "none";
        }
      };
      document.addEventListener("click", window.__cobroAutocompleteOutsideHandler);
    }

    function actualizarResumenPaciente() {
      const nombre = pacienteActual?.NombreP || "Sin seleccionar";
      pacienteTitulo.textContent = pacienteActual ? `Paciente: ${nombre}` : "Sin paciente seleccionado";
      resumenPaciente.textContent = nombre;
    }

    function actualizarEstadoFlujo() {
      const hayPaciente = !!pacienteActual;
      const hayItems = cobroItems.length > 0;
      const hayFormaPago = !!formaPagoSelect.value;

      stepPaciente.classList.toggle("is-active", !hayPaciente);
      stepPaciente.classList.toggle("is-done", hayPaciente);

      stepServicio.classList.toggle("is-active", hayPaciente && !hayItems);
      stepServicio.classList.toggle("is-done", hayItems);

      stepPago.classList.toggle("is-active", hayItems && !hayFormaPago);
      stepPago.classList.toggle("is-done", hayItems && hayFormaPago);

      servicioBlock.classList.toggle("is-disabled", !hayPaciente);
      inputServicio.disabled = !hayPaciente;
      btnGuardar.disabled = !(hayPaciente && hayItems && hayFormaPago);
    }

    function actualizarColorFormaPago() {
      formaPagoSelect.classList.remove(
        "fp-efectivo",
        "fp-tarjeta",
        "fp-igs",
        "fp-transferencia"
      );

      if (formaPagoSelect.value === "Efectivo") formaPagoSelect.classList.add("fp-efectivo");
      if (formaPagoSelect.value === "Tarjeta") formaPagoSelect.classList.add("fp-tarjeta");
      if (formaPagoSelect.value === "IGS") formaPagoSelect.classList.add("fp-igs");
      if (formaPagoSelect.value === "Transferencia") formaPagoSelect.classList.add("fp-transferencia");
    }

    function actualizarTotal() {
      const total = cobroItems.reduce((acc, cur) => {
        const cantidad = Math.max(1, Number(cur.cantidad) || 1);
        const precio = normalizarPrecio(cur.precio, 0);
        return acc + (cantidad * precio);
      }, 0);
      subtotalBox.textContent = precioUSD(total);
      totalBox.textContent = precioUSD(total);
      itemsCountBox.textContent = String(cobroItems.reduce((acc, cur) => acc + (Number(cur.cantidad) || 0), 0));
      emptyState.style.display = cobroItems.length ? "none" : "block";
      actualizarEstadoFlujo();
    }

    function refrescarTabla() {
      tbody.innerHTML = "";

      cobroItems.forEach((item) => {
        const tr = document.createElement("tr");

        const tdServ = document.createElement("td");
        tdServ.textContent = item.nombre;
        tr.appendChild(tdServ);

        const tdCant = document.createElement("td");
        const qtyWrap = document.createElement("div");
        qtyWrap.className = "cobro-qty-wrap";

        const btnMenos = document.createElement("button");
        btnMenos.type = "button";
        btnMenos.className = "cobro-qty-btn";
        btnMenos.textContent = "-";
        btnMenos.addEventListener("click", () => {
          item.cantidad = Math.max(1, Number(item.cantidad) - 1);
          refrescarTabla();
        });

        const input = document.createElement("input");
        input.type = "number";
        input.min = "1";
        input.value = item.cantidad;
        input.className = "cobro-cantidad-input";
        input.addEventListener("change", () => {
          item.cantidad = Math.max(1, Number(input.value) || 1);
          refrescarTabla();
        });

        const btnMas = document.createElement("button");
        btnMas.type = "button";
        btnMas.className = "cobro-qty-btn";
        btnMas.textContent = "+";
        btnMas.addEventListener("click", () => {
          item.cantidad = Number(item.cantidad) + 1;
          refrescarTabla();
        });

        qtyWrap.appendChild(btnMenos);
        qtyWrap.appendChild(input);
        qtyWrap.appendChild(btnMas);
        tdCant.appendChild(qtyWrap);
        tr.appendChild(tdCant);

        const tdPrecio = document.createElement("td");
        tdPrecio.style.textAlign = "right";
        const inputPrecio = document.createElement("input");
        inputPrecio.type = "number";
        inputPrecio.min = "0";
        inputPrecio.step = "0.01";
        inputPrecio.value = normalizarPrecio(item.precio, 0).toFixed(2);
        inputPrecio.className = "cobro-precio-input";
        inputPrecio.title = "Precio unitario editable";
        inputPrecio.addEventListener("change", () => {
          item.precio = normalizarPrecio(inputPrecio.value, normalizarPrecio(item.precio, 0));
          refrescarTabla();
        });
        tdPrecio.appendChild(inputPrecio);
        tr.appendChild(tdPrecio);

        const tdTotal = document.createElement("td");
        tdTotal.style.textAlign = "right";
        tdTotal.textContent = precioUSD((Number(item.cantidad) || 0) * normalizarPrecio(item.precio, 0));
        tr.appendChild(tdTotal);

        const tdQuit = document.createElement("td");
        tdQuit.style.textAlign = "center";
        const btnRemove = document.createElement("button");
        btnRemove.className = "cobro-btn-remove";
        btnRemove.textContent = "x";
        btnRemove.addEventListener("click", () => {
          cobroItems = cobroItems.filter((x) => x.id !== item.id);
          refrescarTabla();
        });
        tdQuit.appendChild(btnRemove);
        tr.appendChild(tdQuit);

        tbody.appendChild(tr);
      });

      actualizarTotal();
    }

    function agregarServicio(serv) {
      if (!pacienteActual) {
        alert("Primero seleccione un paciente");
        return;
      }

      const existe = cobroItems.find((x) => x.id === serv.id);
      if (existe) {
        existe.cantidad += 1;
        refrescarTabla();
        return;
      }

      cobroItems.push({
        id: serv.id,
        nombre: serv.nombre,
        precio: normalizarPrecio(serv.precio, 0),
        cantidad: 1
      });
      refrescarTabla();
    }

    btnLimpiarPaciente.addEventListener("click", () => {
      pacienteActual = null;
      cobroItems = [];
      inputPaciente.value = "";
      inputServicio.value = "";
      listaPacientes.style.display = "none";
      listaServicios.style.display = "none";
      actualizarResumenPaciente();
      refrescarTabla();
    });

    const buscarPaciente = debounce(async (texto) => {
      listaPacientes.innerHTML = "";
      listaPacientes.style.display = "none";
      if (texto.length < 2 || !isCobroViewActive()) {
        invalidateRequest("paciente");
        return;
      }
      const req = beginRequest("paciente");
      const localSeq = req.seq;

      try {
        const res = await fetch(
          `/api/paciente/search?q=${encodeURIComponent(texto)}`,
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("paciente", localSeq)) return;
        if (!json.ok) return;

        json.data.forEach((p) => {
          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = p.NombreP;
          div.onclick = () => {
            pacienteActual = p;
            cobroItems = [];
            inputPaciente.value = "";
            listaPacientes.style.display = "none";
            actualizarResumenPaciente();
            refrescarTabla();
          };
          listaPacientes.appendChild(div);
        });

        if (json.data.length) listaPacientes.style.display = "block";
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("paciente", localSeq)) return;
        console.error(err);
      } finally {
        endRequest("paciente", req.controller);
      }
    }, 350);

    const buscarServicio = debounce(async (texto) => {
      listaServicios.innerHTML = "";
      listaServicios.style.display = "none";
      if (texto.length < 2 || !isCobroViewActive()) {
        invalidateRequest("servicio");
        return;
      }
      const req = beginRequest("servicio");
      const localSeq = req.seq;

      try {
        const res = await fetch(
          `/api/servicio/search?q=${encodeURIComponent(texto)}`,
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("servicio", localSeq)) return;
        if (!json.ok) return;

        json.data.forEach((s) => {
          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = `${s.nombreS} - $${Number(s.precioS).toFixed(2)}`;
          div.onclick = () => {
            agregarServicio({ id: s.idServicio, nombre: s.nombreS, precio: Number(s.precioS) });
            inputServicio.value = "";
            listaServicios.style.display = "none";
          };
          listaServicios.appendChild(div);
        });

        if (json.data.length) listaServicios.style.display = "block";
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("servicio", localSeq)) return;
        console.error(err);
      } finally {
        endRequest("servicio", req.controller);
      }
    }, 350);

    inputPaciente.addEventListener("input", (e) => buscarPaciente(e.target.value.trim()));
    inputServicio.addEventListener("input", (e) => buscarServicio(e.target.value.trim()));
    formaPagoSelect.addEventListener("change", () => {
      actualizarEstadoFlujo();
      actualizarColorFormaPago();
    });

    btnGuardar.addEventListener("click", async () => {
      if (isSavingCuenta || !isCobroViewActive()) return;
      if (!pacienteActual) {
        alert("Seleccione un paciente");
        return;
      }
      if (!cobroItems.length) {
        alert("Agregue al menos un servicio");
        return;
      }

      const formaPago = formaPagoSelect.value;
      if (!formaPago) {
        alert("Seleccione forma de pago");
        return;
      }

      const fechaCuenta = String(inputFecha?.value || "").trim();
      if (!fechaCuenta) {
        alert("Seleccione una fecha");
        return;
      }

      const itemsPayload = cobroItems.map((i) => ({
        idServicio: i.id,
        cantidad: Math.max(1, Number(i.cantidad) || 1),
        precio: normalizarPrecio(i.precio, 0)
      }));

      const hayPrecioInvalido = itemsPayload.some(i => !Number.isFinite(i.precio) || i.precio < 0);
      if (hayPrecioInvalido) {
        alert("Revise precios unitarios. No se permiten valores negativos.");
        return;
      }

      const payload = {
        idPaciente: pacienteActual.idPaciente,
        formaPago,
        fecha: fechaCuenta,
        items: itemsPayload
      };

      isSavingCuenta = true;
      btnGuardar.disabled = true;
      try {
        const res = await fetch("/api/cuenta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (!json.ok) throw new Error(json.message);
        if (!isCobroViewActive()) return;

        alert("Cuenta guardada correctamente");
        cobroItems = [];
        pacienteActual = null;
        renderCobro(container);
        const nextInputFecha = document.getElementById("cuenta-date");
        if (nextInputFecha) {
          nextInputFecha.value = fechaCuenta;
          nextInputFecha.dispatchEvent(new Event("change"));
        }
      } catch (err) {
        if (!isCobroViewActive()) return;
        console.error(err);
        alert("Error al guardar la cuenta");
      } finally {
        isSavingCuenta = false;
        if (isCobroViewActive()) {
          actualizarEstadoFlujo();
        }
      }
    });

    async function cargarCuentasPorFecha(fecha) {
      if (!isCobroViewActive()) return;
      const fechaObjetivo = String(fecha || "").trim();
      if (!fechaObjetivo) return;
      const req = beginRequest("cuentas");
      const localSeq = req.seq;
      try {
        const res = await fetch(
          `/api/cuenta?fecha=${encodeURIComponent(fechaObjetivo)}`,
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("cuentas", localSeq)) return;
        if (!json.ok) {
          alert(json.message || "Error al cargar cuentas");
          return;
        }
        if (String(inputFecha?.value || "").trim() !== fechaObjetivo) return;
        drawCuentaRows(json.data);
        aplicarFiltroCuenta();
        if (faltantesCobroModal && !faltantesCobroModal.hidden) {
          await cargarFaltantesCobro();
        }
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("cuentas", localSeq)) return;
        console.error(err);
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
          alert("Opps ocurrio un error de conexion");
        }
      } finally {
        endRequest("cuentas", req.controller);
      }
    }

    async function cargarDescuentosPorFecha(fecha) {
      if (!isCobroViewActive()) return;
      const fechaObjetivo = String(fecha || "").trim();
      if (!fechaObjetivo) return;
      const req = beginRequest("descuentos");
      const localSeq = req.seq;
      try {
        const res = await fetch(
          `/api/cuenta/descuento?fecha=${encodeURIComponent(fechaObjetivo)}`,
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("descuentos", localSeq)) return;
        if (!json.ok) return;
        if (String(inputFecha?.value || "").trim() !== fechaObjetivo) return;
        renderDescuento(json.data);
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("descuentos", localSeq)) return;
        console.error(err);
      } finally {
        endRequest("descuentos", req.controller);
      }
    }

    function obtenerPrimerNombreDoctor(nombreCompleto) {
      const nombre = String(nombreCompleto || "").trim();
      if (!nombre) return "";
      const partes = nombre.split(/\s+/).filter(Boolean);
      return partes[0] || "";
    }

    function normalizarDoctorCuenta(raw) {
      const idDoctor = Number(raw?.idDoctor || 0);
      if (!Number.isInteger(idDoctor) || idDoctor <= 0) return null;
      const nombreDCompleto = String(raw?.nombreD || "").trim();
      const nombreD = obtenerPrimerNombreDoctor(nombreDCompleto) || `Doctor ${idDoctor}`;
      return { idDoctor, nombreD };
    }

    function aplicarColorDoctorCuentaSelect(selectEl, selectedValue) {
      if (!selectEl) return;
      selectEl.classList.remove("is-doctor", "is-no-doctor");
      const raw = String(selectedValue ?? "").trim();
      if (!raw) {
        selectEl.classList.add("is-no-doctor");
        return;
      }
      selectEl.classList.add("is-doctor");
    }

    function construirOpcionesDoctorCuenta(selectEl, selectedDoctorId = null) {
      if (!selectEl) return;
      const selected = Number(selectedDoctorId || 0) || null;
      selectEl.innerHTML = "";

      const optSinDoctor = document.createElement("option");
      optSinDoctor.value = "";
      optSinDoctor.textContent = "Sin doctor";
      selectEl.appendChild(optSinDoctor);

      doctoresCuentaData.forEach((doc) => {
        const opt = document.createElement("option");
        opt.value = String(doc.idDoctor);
        opt.textContent = doc.nombreD;
        selectEl.appendChild(opt);
      });

      if (selected && !doctoresCuentaData.some((d) => d.idDoctor === selected)) {
        const optFallback = document.createElement("option");
        optFallback.value = String(selected);
        optFallback.textContent = `Doctor ${selected}`;
        selectEl.appendChild(optFallback);
      }

      selectEl.value = selected ? String(selected) : "";
      selectEl.dataset.prevValue = selectEl.value;
      aplicarColorDoctorCuentaSelect(selectEl, selectEl.value);
    }

    function construirOpcionesFiltroDoctorCuenta() {
      if (!cuentaDoctorFilter) return;
      const selectedRaw = String(cuentaDoctorFilter.value || "");
      const persistedRaw = String(cuentaDoctorFilter.dataset.persistedValue || "");
      cuentaDoctorFilter.innerHTML = "";

      const optTodos = document.createElement("option");
      optTodos.value = "";
      optTodos.textContent = "Todos los doctores";
      cuentaDoctorFilter.appendChild(optTodos);

      const optSinDoctor = document.createElement("option");
      optSinDoctor.value = "__none__";
      optSinDoctor.textContent = "Sin doctor";
      cuentaDoctorFilter.appendChild(optSinDoctor);

      doctoresCuentaData.forEach((doc) => {
        const opt = document.createElement("option");
        opt.value = String(doc.idDoctor);
        opt.textContent = doc.nombreD;
        cuentaDoctorFilter.appendChild(opt);
      });

      const targetValue = persistedRaw || selectedRaw;
      const optionExists = Array.from(cuentaDoctorFilter.options).some((o) => o.value === targetValue);
      cuentaDoctorFilter.value = optionExists ? targetValue : "";

      if (optionExists && persistedRaw) {
        delete cuentaDoctorFilter.dataset.persistedValue;
        persistCobroUiState();
      }
    }

    async function cargarDoctoresCuenta(force = false) {
      if (!isCobroViewActive()) return null;
      if (!force && cargarDoctoresCuentaPromise) return cargarDoctoresCuentaPromise;

      cargarDoctoresCuentaPromise = (async () => {
        const req = beginRequest("doctores");
        const localSeq = req.seq;
        try {
          const options = req.signal
            ? { cache: "no-store", signal: req.signal }
            : { cache: "no-store" };
          const res = await fetch("/api/doctor/select", options);
          const json = await res.json();
          if (isStaleRequest("doctores", localSeq)) return;
          if (!res.ok || !json.ok || !Array.isArray(json.data)) {
            doctoresCuentaData = [];
            construirOpcionesFiltroDoctorCuenta();
            return;
          }
          doctoresCuentaData = json.data
            .map(normalizarDoctorCuenta)
            .filter(Boolean);
          construirOpcionesFiltroDoctorCuenta();

          if (Array.isArray(cuentasActuales) && cuentasActuales.length > 0) {
            aplicarFiltroCuenta();
          }
        } catch (err) {
          if (isAbortError(err) || isStaleRequest("doctores", localSeq)) return;
          console.error(err);
          doctoresCuentaData = [];
          construirOpcionesFiltroDoctorCuenta();
        } finally {
          endRequest("doctores", req.controller);
          cargarDoctoresCuentaPromise = null;
        }
      })();

      return cargarDoctoresCuentaPromise;
    }

    async function cargarServiciosReporteMensual() {
      if (!isCobroViewActive()) return;
      const req = beginRequest("serviciosMensual");
      const localSeq = req.seq;
      try {
        const actual = String(selectReporteMensualServicio?.value || "");
        const res = await fetch(
          "/api/servicio",
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("serviciosMensual", localSeq)) return;
        if (!json.ok || !Array.isArray(json.data)) return;

        selectReporteMensualServicio.innerHTML = "";
        const optTodos = document.createElement("option");
        optTodos.value = "";
        optTodos.textContent = "Todos los tratamientos";
        selectReporteMensualServicio.appendChild(optTodos);

        json.data.forEach((s) => {
          const idServicio = Number(s.idServicio);
          if (!Number.isInteger(idServicio) || idServicio <= 0) return;
          const nombre = String(s.nombreS || "").trim();
          if (!nombre) return;

          const opt = document.createElement("option");
          opt.value = String(idServicio);
          opt.textContent = nombre;
          selectReporteMensualServicio.appendChild(opt);
        });

        if (actual && Array.from(selectReporteMensualServicio.options).some((o) => o.value === actual)) {
          selectReporteMensualServicio.value = actual;
        } else {
          selectReporteMensualServicio.value = "";
        }
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("serviciosMensual", localSeq)) return;
        console.error(err);
      } finally {
        endRequest("serviciosMensual", req.controller);
      }
    }

    function renderReporteMensual(lista, totales, totalesGlobalMes) {
      tbodyReporteMensual.innerHTML = "";
      const rows = Array.isArray(lista) ? lista : [];
      const safeTotales = {
        pacientesUnicos: Number(totales?.pacientesUnicos || 0),
        cantidadTotalMes: Number(totales?.cantidadTotalMes || 0),
        montoTotalMes: Number(totales?.montoTotalMes || 0)
      };
      const safeTotalesGlobal = {
        pacientesUnicos: Number(totalesGlobalMes?.pacientesUnicos || 0),
        cantidadTotalMes: Number(totalesGlobalMes?.cantidadTotalMes || 0),
        montoTotalMes: Number(totalesGlobalMes?.montoTotalMes || 0)
      };

      if (rows.length === 0) {
        tbodyReporteMensual.innerHTML = `
          <tr>
            <td colspan="3" style="text-align:center;color:#64748b">No hay pacientes para el filtro y mes seleccionado</td>
          </tr>
        `;
      } else {
        rows.forEach((item) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${escapeHtml(item.nombrePaciente || "-")}</td>
            <td style="text-align:center">${Number(item.cantidadPaciente || 0)}</td>
            <td style="text-align:right">${precioUSD(Number(item.montoPaciente || 0))}</td>
          `;
          tbodyReporteMensual.appendChild(tr);
        });
      }

      const strongPacientes = reporteMensualPacientesBox?.querySelector("strong");
      const strongCantidad = reporteMensualCantidadBox?.querySelector("strong");
      const strongTotal = reporteMensualTotalBox?.querySelector("strong");
      if (strongPacientes) {
        strongPacientes.textContent = String(safeTotales.pacientesUnicos);
      }
      if (strongCantidad) {
        strongCantidad.textContent = String(safeTotales.cantidadTotalMes);
      }
      if (strongTotal) {
        strongTotal.textContent = precioUSD(safeTotales.montoTotalMes);
      }
      const strongTotalGlobal = reporteMensualTotalGlobalBox?.querySelector("strong");
      if (strongTotalGlobal) {
        strongTotalGlobal.textContent = precioUSD(safeTotalesGlobal.montoTotalMes);
      }
    }

    async function cargarReporteMensual() {
      if (!isCobroViewActive()) return;
      const mes = String(inputReporteMensualMes?.value || "").trim();
      const idServicio = String(selectReporteMensualServicio?.value || "").trim();
      const formaPago = String(selectReporteMensualFormaPago?.value || "").trim();

      if (!mes) {
        invalidateRequest("reporteMensual");
        reporteMensualActual = [];
        reporteMensualTotalesActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
        reporteMensualTotalesGlobalActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
        reporteMensualFiltroActual = null;
        reporteMensualFormaPagoActual = "";
        renderReporteMensual(
          reporteMensualActual,
          reporteMensualTotalesActual,
          reporteMensualTotalesGlobalActual
        );
        return;
      }
      const req = beginRequest("reporteMensual");
      const localSeq = req.seq;

      try {
        const query = new URLSearchParams({ mes });
        if (idServicio) query.set("idServicio", idServicio);
        if (formaPago) query.set("formaPago", formaPago);

        const res = await fetch(
          `/api/cuenta/reporte-mensual-pacientes?${query.toString()}`,
          req.signal ? { signal: req.signal, cache: "no-store" } : { cache: "no-store" }
        );
        const json = await res.json();
        if (isStaleRequest("reporteMensual", localSeq)) return;
        if (!json.ok) {
          alert(json.message || "Error al cargar reporte mensual");
          return;
        }

        reporteMensualActual = Array.isArray(json.data) ? json.data : [];
        reporteMensualFiltroActual = json.filtroServicio || null;
        reporteMensualFormaPagoActual = String(json.filtroFormaPago?.valor || "").trim();
        reporteMensualTotalesActual = {
          pacientesUnicos: Number(json.totales?.pacientesUnicos || 0),
          cantidadTotalMes: Number(json.totales?.cantidadTotalMes || 0),
          montoTotalMes: Number(json.totales?.montoTotalMes || 0)
        };
        reporteMensualTotalesGlobalActual = {
          pacientesUnicos: Number(json.totalesGlobalMes?.pacientesUnicos || 0),
          cantidadTotalMes: Number(json.totalesGlobalMes?.cantidadTotalMes || 0),
          montoTotalMes: Number(json.totalesGlobalMes?.montoTotalMes || 0)
        };

        if (
          String(inputReporteMensualMes?.value || "").trim() !== mes ||
          String(selectReporteMensualServicio?.value || "").trim() !== idServicio ||
          String(selectReporteMensualFormaPago?.value || "").trim() !== formaPago
        ) {
          return;
        }
        renderReporteMensual(
          reporteMensualActual,
          reporteMensualTotalesActual,
          reporteMensualTotalesGlobalActual
        );
      } catch (err) {
        if (isAbortError(err) || isStaleRequest("reporteMensual", localSeq)) return;
        console.error(err);
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
          alert("Opps ocurrio un error de conexion");
        }
      } finally {
        endRequest("reporteMensual", req.controller);
      }
    }

    function recalcularTotalFinal() {
      const subTotalText = document.getElementById("cuenta-subtotal").querySelector("strong").textContent.replace("$", "");
      const subTotal = Number(subTotalText) || 0;
      const totalFinal = subTotal - totalDescuentoActual;
      document.getElementById("cuenta-total").querySelector("strong").textContent = `$${totalFinal.toFixed(2)}`;
    }

    function actualizarDashboardDia() {
      const metricas = calcularMetricasDia(cuentasActuales, totalDescuentoActual);
      const { acumulados, brutoDia, netoDia, efectivoCajaDia, porcentajes } = metricas;
      const pctText = (val) => `${Number(val || 0).toFixed(1)}%`;
      const degEfectivo = porcentajes.efectivo * 3.6;
      const degTarjeta = porcentajes.tarjeta * 3.6;
      const degIgs = porcentajes.igs * 3.6;
      const degTransferencia = porcentajes.transferencia * 3.6;

      if (chartRing) {
        if (brutoDia <= 0) {
          chartRing.style.setProperty("--ring-gradient", "conic-gradient(var(--cobro-ring-empty, #e2e8f0) 0deg 360deg)");
        } else {
          const d1 = degEfectivo;
          const d2 = d1 + degTarjeta;
          const d3 = d2 + degIgs;
          const d4 = d3 + degTransferencia;
          const gradient = `conic-gradient(
            #22c55e 0deg ${d1}deg,
            #ef4444 ${d1}deg ${d2}deg,
            #f97316 ${d2}deg ${d3}deg,
            #0ea5e9 ${d3}deg ${d4}deg
          )`;
          chartRing.style.setProperty("--ring-gradient", gradient);
        }
      }

      if (kpiEfectivo) kpiEfectivo.textContent = precioUSD(acumulados.efectivo);
      if (kpiEfectivoCaja) kpiEfectivoCaja.textContent = precioUSD(efectivoCajaDia);
      if (kpiTarjeta) kpiTarjeta.textContent = precioUSD(acumulados.tarjeta);
      if (kpiIgs) kpiIgs.textContent = precioUSD(acumulados.igs);
      if (kpiTransferencia) kpiTransferencia.textContent = precioUSD(acumulados.transferencia);
      if (kpiDescuentos) kpiDescuentos.textContent = precioUSD(totalDescuentoActual);
      if (kpiTotalDia) kpiTotalDia.textContent = precioUSD(netoDia);
      if (kpiBrutoDia) kpiBrutoDia.textContent = precioUSD(brutoDia);
      if (chartCentroTotal) chartCentroTotal.textContent = precioUSD(brutoDia);
    }

    function textoSeguro(value) {
      return String(value ?? "").replace(/\s+/g, " ").trim();
    }

    function generarReporteCobroPdf() {
      const fecha = String(inputFecha?.value || "").trim();
      if (!fecha) {
        alert("Seleccione una fecha");
        return;
      }

      if (!Array.isArray(cuentasActuales) || cuentasActuales.length === 0) {
        alert("No hay cuentas para esta fecha");
        return;
      }

      const jsPdfCtor = window.jspdf?.jsPDF;
      if (typeof jsPdfCtor !== "function") {
        alert("No se encontro el motor PDF");
        return;
      }
      if (typeof jsPdfCtor.API?.autoTable !== "function") {
        alert("No se encontro el plugin de tablas PDF");
        return;
      }

      const iconHtmlOriginal = btnReporteCobro?.innerHTML || actionControlIcon("pdf");
      const titleOriginal = btnReporteCobro?.getAttribute("title") || "Reporte PDF";
      if (btnReporteCobro) {
        btnReporteCobro.disabled = true;
        if (btnReporteCobro.classList.contains("btn-cobro-icon-btn")) {
          btnReporteCobro.classList.add("is-busy");
          btnReporteCobro.setAttribute("title", "Generando reporte...");
          btnReporteCobro.setAttribute("aria-label", "Generando reporte...");
        } else {
          btnReporteCobro.textContent = "Generando...";
        }
      }

      try {
        const metricas = calcularMetricasDia(cuentasActuales, totalDescuentoActual);
        const { brutoDia, netoDia } = metricas;
        const fechaTexto = formatearFechaCorta(fecha);
        const usuario = textoSeguro(document.getElementById("top-user-name")?.textContent) || "Usuario";

        const doc = new jsPdfCtor({
          orientation: "portrait",
          unit: "pt",
          format: "a4"
        });

        const marginX = 32;
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 38;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("Sistema Clinica", marginX, y);

        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Reporte de cobro diario", marginX, y);
        doc.text(`Fecha: ${fechaTexto}`, marginX, y + 13);
        doc.text(`Generado por: ${usuario}`, marginX, y + 26);
        doc.text(
          `Generado: ${new Date().toLocaleString("es-SV", { hour12: true })}`,
          pageWidth - marginX,
          y + 26,
          { align: "right" }
        );

        y += 38;

        doc.autoTable({
          startY: y,
          margin: { left: marginX, right: marginX },
          theme: "grid",
          head: [["Resumen del dia", "Valor"]],
          body: [
            ["Total del dia (neto)", precioUSD(netoDia)],
            ["Bruto del dia", precioUSD(brutoDia)],
            ["Descuentos", precioUSD(totalDescuentoActual)]
          ],
          styles: { fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, overflow: "linebreak" },
          headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold", fontSize: 8.2 }
        });

        y = (doc.lastAutoTable?.finalY || y) + 8;

        const filasCuenta = cuentasActuales.map((c) => ([
          textoSeguro(c.nombrePaciente) || "-",
          precioUSD(Number(c.totalC || 0)),
          textoSeguro(c.FormaPagoC) || "-",
          Number.isFinite(Number(c.cantidadTotal)) ? String(Number(c.cantidadTotal)) : "-",
          textoSeguro(c.procedimientos) || "-"
        ]));

        doc.autoTable({
          startY: y,
          margin: { left: marginX, right: marginX },
          theme: "striped",
          head: [["Cuenta del dia", "Total", "Forma de pago", "Cantidad", "Tratamiento"]],
          body: filasCuenta,
          styles: { fontSize: 7.6, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, overflow: "linebreak" },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 7.8 },
          columnStyles: {
            0: { cellWidth: 142 },
            1: { cellWidth: 64, halign: "right" },
            2: { cellWidth: 86 },
            3: { cellWidth: 58, halign: "center" },
            4: { cellWidth: 181 }
          }
        });

        doc.save(`reporte-cobro-${fecha}.pdf`);
      } catch (err) {
        console.error(err);
        alert("No se pudo generar el reporte PDF");
      } finally {
        if (btnReporteCobro) {
          btnReporteCobro.disabled = false;
          if (btnReporteCobro.classList.contains("btn-cobro-icon-btn")) {
            btnReporteCobro.classList.remove("is-busy");
            btnReporteCobro.innerHTML = iconHtmlOriginal;
            btnReporteCobro.setAttribute("title", titleOriginal);
            btnReporteCobro.setAttribute("aria-label", titleOriginal);
          } else {
            btnReporteCobro.textContent = titleOriginal;
          }
        }
      }
    }

    function generarReporteMensualPdf() {
      const mes = String(inputReporteMensualMes?.value || "").trim();
      if (!mes) {
        alert("Seleccione un mes");
        return;
      }

      if (!Array.isArray(reporteMensualActual) || reporteMensualActual.length === 0) {
        alert("No hay datos para generar el reporte mensual");
        return;
      }

      const jsPdfCtor = window.jspdf?.jsPDF;
      if (typeof jsPdfCtor !== "function") {
        alert("No se encontro el motor PDF");
        return;
      }
      if (typeof jsPdfCtor.API?.autoTable !== "function") {
        alert("No se encontro el plugin de tablas PDF");
        return;
      }

      const labelOriginal = btnReporteMensualPdf?.textContent || "Generar reporte mensual PDF";
      if (btnReporteMensualPdf) {
        btnReporteMensualPdf.disabled = true;
        btnReporteMensualPdf.textContent = "Generando...";
      }

      try {
        const usuario = textoSeguro(document.getElementById("top-user-name")?.textContent) || "Usuario";
        const tratamientoFiltro = reporteMensualFiltroActual?.nombre
          || (selectReporteMensualServicio?.value
            ? (selectReporteMensualServicio?.selectedOptions?.[0]?.textContent || "")
            : "Todos los tratamientos")
          || "Todos los tratamientos";
        const metodoPagoFiltro = reporteMensualFormaPagoActual
          || (selectReporteMensualFormaPago?.value
            ? (selectReporteMensualFormaPago?.selectedOptions?.[0]?.textContent || "")
            : "Todos");

        const doc = new jsPdfCtor({
          orientation: "portrait",
          unit: "pt",
          format: "a4"
        });

        const marginX = 32;
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 38;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("Sistema Clinica", marginX, y);

        y += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Reporte mensual por pacientes", marginX, y);
        doc.text(`Mes: ${formatearMesCorto(mes)}`, marginX, y + 13);
        doc.text(`Tratamiento: ${textoSeguro(tratamientoFiltro)}`, marginX, y + 26);
        doc.text(`Metodo de pago: ${textoSeguro(metodoPagoFiltro || "Todos")}`, marginX, y + 39);
        doc.text(`Generado por: ${usuario}`, marginX, y + 52);
        doc.text(
          `Generado: ${new Date().toLocaleString("es-SV", { hour12: true })}`,
          pageWidth - marginX,
          y + 52,
          { align: "right" }
        );

        y += 66;

        doc.autoTable({
          startY: y,
          margin: { left: marginX, right: marginX },
          theme: "grid",
          head: [["Resumen mensual", "Valor"]],
          body: [
            ["Pacientes unicos", String(Number(reporteMensualTotalesActual.pacientesUnicos || 0))],
            ["Cantidad total", String(Number(reporteMensualTotalesActual.cantidadTotalMes || 0))],
            ["Monto total", precioUSD(Number(reporteMensualTotalesActual.montoTotalMes || 0))],
            ["Monto global mes (sin filtros)", precioUSD(Number(reporteMensualTotalesGlobalActual.montoTotalMes || 0))]
          ],
          styles: { fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, overflow: "linebreak" },
          headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold", fontSize: 8.2 }
        });

        y = (doc.lastAutoTable?.finalY || y) + 8;

        const filasMensuales = reporteMensualActual.map((r) => ([
          textoSeguro(r.nombrePaciente) || "-",
          String(Number(r.cantidadPaciente || 0)),
          precioUSD(Number(r.montoPaciente || 0))
        ]));

        doc.autoTable({
          startY: y,
          margin: { left: marginX, right: marginX },
          theme: "striped",
          head: [["Paciente", "Cantidad", "Monto"]],
          body: filasMensuales,
          styles: { fontSize: 7.8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, overflow: "linebreak" },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 280 },
            1: { cellWidth: 120, halign: "center" },
            2: { cellWidth: 140, halign: "right" }
          }
        });

        const suffix = selectReporteMensualServicio?.value ? `-servicio-${selectReporteMensualServicio.value}` : "";
        doc.save(`reporte-cobro-mensual-${mes}${suffix}.pdf`);
      } catch (err) {
        console.error(err);
        alert("No se pudo generar el reporte mensual PDF");
      } finally {
        if (btnReporteMensualPdf) {
          btnReporteMensualPdf.disabled = false;
          btnReporteMensualPdf.textContent = labelOriginal;
        }
      }
    }

    function calcularTotalesCuentas(lista) {
      const subTotal = lista.reduce((acc, c) => acc + Number(c.totalC || 0), 0);
      document.getElementById("cuenta-subtotal").querySelector("strong").textContent = `$${subTotal.toFixed(2)}`;
      recalcularTotalFinal();
    }

    function numeracionActiva() {
      return !!toggleNumeracionCuentas?.checked;
    }

    function doctorColumnaActiva() {
      return !!toggleDoctorCuentas?.checked;
    }

    function getCuentaColspan() {
      let total = 8;
      if (!numeracionActiva()) total -= 1;
      if (!doctorColumnaActiva()) total -= 1;
      return total;
    }

    function aplicarVisibilidadColumnasCuenta() {
      if (!cuentaTable) return;
      cuentaTable.classList.toggle("hide-numeracion", !numeracionActiva());
      cuentaTable.classList.toggle("hide-doctor", !doctorColumnaActiva());
    }

    function drawCuentaRows(list, syncSource = true) {
      if (syncSource) cuentasActuales = list;
      actualizarDashboardDia();
      aplicarVisibilidadColumnasCuenta();
      const tbodyCuenta = document.getElementById("cuenta-tbody");
      tbodyCuenta.innerHTML = "";

      if (!list.length) {
        tbodyCuenta.innerHTML = `
          <tr>
            <td colspan="${getCuentaColspan()}" style="text-align:center; color:#64748b">No hay cuentas para esta fecha</td>
          </tr>
        `;
        calcularTotalesCuentas([]);
        return;
      }

      list.forEach((c, index) => {
        const tr = document.createElement("tr");
        tr.dataset.idCuenta = c.idCuenta;
        const formaPago = String(c.FormaPagoC || "").trim();
        const formaPagoClass = claseFormaPago(formaPago);
        const formaPagoHtml = formaPago
          ? `<span class="forma-pago-chip ${formaPagoClass}">${formaPago}</span>`
          : "-";
        const cantidadRaw = Number(c.cantidadTotal);
        const cantidadText = Number.isFinite(cantidadRaw) ? String(cantidadRaw) : "-";
        const tratamientoHtml = renderProcedimientoVisual(c.procedimientos);
        const idDoctorCuenta = Number(c.idDoctorCuenta || 0) || null;
        tr.innerHTML = `
          <td class="cuenta-col-num">${index + 1}</td>
          <td>${c.nombrePaciente}</td>
          <td>$${Number(c.totalC).toFixed(2)}</td>
          <td>${formaPagoHtml}</td>
          <td style="text-align:center">${cantidadText}</td>
          <td>${tratamientoHtml}</td>
          <td class="cuenta-doctor-cell cuenta-col-doctor"></td>
          <td hidden>${formatearFecha(c.fechaC)}</td>
          <td style="text-align:center"><button class="cobro-btn-remove" title="Eliminar cuenta">x</button></td>
        `;

        const tdDoctor = tr.querySelector(".cuenta-doctor-cell");
        const selectDoctor = document.createElement("select");
        selectDoctor.className = "cuenta-doctor-select cobro-forma-pago";
        construirOpcionesDoctorCuenta(selectDoctor, idDoctorCuenta);
        let isSavingDoctorCuenta = false;
        selectDoctor.addEventListener("change", async () => {
          if (isSavingDoctorCuenta || !isCobroViewActive()) return;
          isSavingDoctorCuenta = true;
          const previo = String(selectDoctor.dataset.prevValue || "");
          const seleccionado = String(selectDoctor.value || "");

          const idDoctor = seleccionado === "" ? null : Number(seleccionado);
          if (idDoctor !== null && (!Number.isInteger(idDoctor) || idDoctor <= 0)) {
            alert("Doctor invalido");
            selectDoctor.value = previo;
            aplicarColorDoctorCuentaSelect(selectDoctor, selectDoctor.value);
            isSavingDoctorCuenta = false;
            return;
          }

          aplicarColorDoctorCuentaSelect(selectDoctor, seleccionado);
          selectDoctor.disabled = true;
          try {
            const res = await fetch(`/api/cuenta/${c.idCuenta}/doctor`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idDoctor })
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
              throw new Error(json.message || "No se pudo actualizar doctor");
            }

            c.idDoctorCuenta = idDoctor;
            if (idDoctor === null) {
              c.nombreDoctorCuenta = "";
            } else {
              const doc = doctoresCuentaData.find((d) => Number(d.idDoctor) === Number(idDoctor));
              c.nombreDoctorCuenta = String(doc?.nombreD || "");
            }
            selectDoctor.dataset.prevValue = seleccionado;
            aplicarFiltroCuenta();
          } catch (err) {
            alert(err.message || "Error al asignar doctor");
            selectDoctor.value = previo;
            aplicarColorDoctorCuentaSelect(selectDoctor, selectDoctor.value);
          } finally {
            isSavingDoctorCuenta = false;
            if (selectDoctor.isConnected) {
              selectDoctor.disabled = false;
            }
          }
        });
        if (tdDoctor) tdDoctor.appendChild(selectDoctor);

        const btnEliminarCuenta = tr.querySelector("button");
        let isDeletingCuenta = false;
        btnEliminarCuenta?.addEventListener("click", async () => {
          if (isDeletingCuenta || !isCobroViewActive()) return;
          isDeletingCuenta = true;
          if (btnEliminarCuenta) btnEliminarCuenta.disabled = true;
          const ok = typeof window.showSystemConfirm === "function"
            ? await window.showSystemConfirm("Eliminar esta cuenta?")
            : confirm("Eliminar esta cuenta?");
          if (!ok) {
            isDeletingCuenta = false;
            if (btnEliminarCuenta?.isConnected) btnEliminarCuenta.disabled = false;
            return;
          }
          try {
            const res = await fetch(`/api/cuenta/${c.idCuenta}`, { method: "DELETE" });
            const json = await res.json();
            if (!json.ok) throw new Error(json.message);
            const fecha = document.getElementById("cuenta-date").value;
            if (fecha) cargarCuentasPorFecha(fecha);
          } catch (err) {
            alert("Error al eliminar la cuenta");
            console.error(err);
          } finally {
            isDeletingCuenta = false;
            if (btnEliminarCuenta?.isConnected) btnEliminarCuenta.disabled = false;
          }
        });

        tbodyCuenta.appendChild(tr);
      });

      calcularTotalesCuentas(list);
    }

    function aplicarFiltroCuenta() {
      const q = (cuentaSearch.value || "").trim().toLowerCase();
      const doctorFiltro = String(cuentaDoctorFilter?.value || "").trim();
      const formaPagoFiltro = String(cuentaFormaPagoFilter?.value || "").trim().toLowerCase();
      if (!q && !doctorFiltro && !formaPagoFiltro) {
        drawCuentaRows(cuentasActuales, false);
        return;
      }

      const filtradas = cuentasActuales.filter((c) => {
        const matchTexto = !q ||
          String(c.nombrePaciente || "").toLowerCase().includes(q) ||
          String(c.procedimientos || "").toLowerCase().includes(q) ||
          String(c.nombreDoctorCuenta || "").toLowerCase().includes(q);

        if (!matchTexto) return false;

        const idDoctorCuenta = Number(c.idDoctorCuenta || 0);
        const tieneDoctorValido = Number.isInteger(idDoctorCuenta) && idDoctorCuenta > 0;

        const matchDoctor = (() => {
          if (!doctorFiltro) return true;
          if (doctorFiltro === "__none__") return !tieneDoctorValido;
          return tieneDoctorValido && String(idDoctorCuenta) === doctorFiltro;
        })();
        if (!matchDoctor) return false;

        const formaPagoCuenta = String(c.FormaPagoC || "").trim().toLowerCase();
        const matchFormaPago = !formaPagoFiltro || formaPagoCuenta === formaPagoFiltro;
        if (!matchFormaPago) return false;
        return true;
      });

      drawCuentaRows(filtradas, false);
    }

    function actualizarTotalDescuento(lista) {
      totalDescuentoActual = lista.reduce((acc, d) => acc + Number(d.cantidadD), 0);
      descuentoTotalBox.querySelector("strong").textContent = `$${totalDescuentoActual.toFixed(2)}`;
      recalcularTotalFinal();
      actualizarDashboardDia();
    }

    function renderDescuento(lista) {
      descuentoTbody.innerHTML = "";

      if (!lista.length) {
        descuentoTbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align:center;color:#64748b">No hay descuentos</td>
          </tr>
        `;
        actualizarTotalDescuento([]);
        return;
      }

      lista.forEach((d) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d.nombreD}</td>
          <td>${formatearFecha(d.fechaD)}</td>
          <td>$${Number(d.cantidadD).toFixed(2)}</td>
          <td style="text-align:center"><button class="cobro-btn-remove">x</button></td>
        `;

        const btnEliminarDescuento = tr.querySelector("button");
        let isDeletingDescuento = false;
        btnEliminarDescuento?.addEventListener("click", async () => {
          if (isDeletingDescuento || !isCobroViewActive()) return;
          isDeletingDescuento = true;
          if (btnEliminarDescuento) btnEliminarDescuento.disabled = true;
          try {
            const res = await fetch(`/api/cuenta/descuento/${d.idDescuento}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok || !json?.ok) {
              throw new Error(json?.message || "No se pudo eliminar descuento");
            }
            const fecha = document.getElementById("cuenta-date").value;
            if (fecha) await cargarDescuentosPorFecha(fecha);
          } catch (err) {
            alert(err?.message || "Error al eliminar descuento");
          } finally {
            isDeletingDescuento = false;
            if (btnEliminarDescuento?.isConnected) btnEliminarDescuento.disabled = false;
          }
        });

        descuentoTbody.appendChild(tr);
      });

      actualizarTotalDescuento(lista);
    }

    btnAgregarDescuento.addEventListener("click", async () => {
      if (isCreatingDescuento || !isCobroViewActive()) return;
      const nombre = document.getElementById("descuento-nombre").value.trim();
      const cantidad = Number(document.getElementById("descuento-cantidad").value);
      const fecha = document.getElementById("cuenta-date").value;

      if (!fecha) {
        alert("Seleccione una fecha");
        return;
      }
      if (!nombre || cantidad <= 0) {
        alert("Datos invalidos");
        return;
      }

      isCreatingDescuento = true;
      btnAgregarDescuento.disabled = true;
      try {
        const res = await fetch("/api/cuenta/descuento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, cantidad, fecha })
        });

        const json = await res.json();
        if (!json.ok) throw new Error(json.message);

        document.getElementById("descuento-nombre").value = "";
        document.getElementById("descuento-cantidad").value = "";
        await cargarDescuentosPorFecha(fecha);
      } catch (err) {
        alert("Error al guardar descuento");
      } finally {
        isCreatingDescuento = false;
        if (btnAgregarDescuento?.isConnected) {
          btnAgregarDescuento.disabled = false;
        }
      }
    });

    const hayModalCobroAbierto = () => {
      const hayMensualAbierto = !!(reporteMensualModal && !reporteMensualModal.hidden);
      const hayFaltantesAbierto = !!(faltantesCobroModal && !faltantesCobroModal.hidden);
      return hayMensualAbierto || hayFaltantesAbierto;
    };
    const moverFechaCobro = (deltaDays) => {
      if (!isCobroViewActive()) return;
      const fechaActual = String(inputFecha?.value || "").trim() || obtenerHoyLocalISO();
      const fechaNueva = shiftISODateByDays(fechaActual, deltaDays);
      if (!fechaNueva || fechaNueva === fechaActual) return;
      inputFecha.value = fechaNueva;
      inputFecha.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const onCobroDateShortcut = (e) => {
      if (!isCobroViewActive()) return;
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (hayModalCobroAbierto()) return;

      const activeEl = document.activeElement;
      if (activeEl && activeEl !== inputFecha && isEditingFocusableControl(activeEl)) return;

      e.preventDefault();
      moverFechaCobro(e.key === "ArrowLeft" ? -1 : 1);
    };
    if (window.__cobroDateNavKeydownHandler) {
      document.removeEventListener("keydown", window.__cobroDateNavKeydownHandler);
    }
    window.__cobroDateNavKeydownHandler = onCobroDateShortcut;
    document.addEventListener("keydown", onCobroDateShortcut);

    inputFecha.addEventListener("change", () => {
      if (!inputFecha.value) return;
      cargarCuentasPorFecha(inputFecha.value);
      cargarDescuentosPorFecha(inputFecha.value);
    });
    btnAbrirReporteMensual?.addEventListener("click", () => {
      abrirReporteMensualModal();
      cargarServiciosReporteMensual().then(cargarReporteMensual);
    });
    btnCerrarReporteMensual?.addEventListener("click", cerrarReporteMensualModal);
    reporteMensualModal?.addEventListener("click", (e) => {
      if (e.target?.closest?.("[data-cobro-modal-close]")) {
        cerrarReporteMensualModal();
      }
    });
    btnAbrirFaltantesCobro?.addEventListener("click", () => {
      abrirFaltantesCobroModal();
      cargarFaltantesCobro();
    });
    btnCerrarFaltantesCobro?.addEventListener("click", cerrarFaltantesCobroModal);
    faltantesCobroModal?.addEventListener("click", (e) => {
      if (e.target?.closest?.("[data-cobro-modal-close]")) {
        cerrarFaltantesCobroModal();
      }
    });
    if (!window.__cobroModalEscHandler) {
      window.__cobroModalEscHandler = (e) => {
        if (e.key !== "Escape") return;
        const modalMensual = document.getElementById("reporte-mensual-modal");
        const modalFaltantes = document.getElementById("faltantes-cobro-modal");
        const hayMensualAbierto = modalMensual && !modalMensual.hidden;
        const hayFaltantesAbierto = modalFaltantes && !modalFaltantes.hidden;
        if (!hayMensualAbierto && !hayFaltantesAbierto) return;
        if (hayFaltantesAbierto) {
          modalFaltantes.hidden = true;
        }
        if (hayMensualAbierto) {
          modalMensual.hidden = true;
        }
        document.body.classList.remove("cobro-modal-open");
      };
      document.addEventListener("keydown", window.__cobroModalEscHandler);
    }
    inputReporteMensualMes?.addEventListener("change", cargarReporteMensual);
    selectReporteMensualServicio?.addEventListener("change", cargarReporteMensual);
    selectReporteMensualFormaPago?.addEventListener("change", cargarReporteMensual);

    cuentaSearch.addEventListener("input", () => {
      aplicarFiltroCuenta();
      persistCobroUiState();
    });
    cuentaDoctorFilter?.addEventListener("change", () => {
      if (cuentaDoctorFilter?.dataset) {
        delete cuentaDoctorFilter.dataset.persistedValue;
      }
      aplicarFiltroCuenta();
      persistCobroUiState();
    });
    cuentaFormaPagoFilter?.addEventListener("change", () => {
      aplicarFiltroCuenta();
      persistCobroUiState();
    });
    toggleNumeracionCuentas?.addEventListener("change", () => {
      aplicarVisibilidadColumnasCuenta();
      aplicarFiltroCuenta();
      persistCobroUiState();
    });
    toggleDoctorCuentas?.addEventListener("change", () => {
      aplicarVisibilidadColumnasCuenta();
      aplicarFiltroCuenta();
      persistCobroUiState();
    });
    btnReporteCobro?.addEventListener("click", generarReporteCobroPdf);
    btnReporteMensualPdf?.addEventListener("click", generarReporteMensualPdf);
    aplicarVisibilidadColumnasCuenta();
    construirOpcionesFiltroDoctorCuenta();
    persistCobroUiState();
    configurarHoverTotalesKpi();

    const hoy = obtenerHoyLocalISO();
    const mesActual = hoy.slice(0, 7);
    inputFecha.value = hoy;
    if (inputReporteMensualMes) {
      inputReporteMensualMes.value = mesActual;
    }
    cargarDoctoresCuenta().finally(() => cargarCuentasPorFecha(hoy));
    cargarDescuentosPorFecha(hoy);
    cargarServiciosReporteMensual();

    const prefillFromAgenda = window.__agendaCobroPrefillPatient;
    window.__agendaCobroPrefillPatient = null;
    if (prefillFromAgenda && Number(prefillFromAgenda.idPaciente || 0) > 0) {
      pacienteActual = {
        idPaciente: Number(prefillFromAgenda.idPaciente),
        NombreP: String(prefillFromAgenda.NombreP || "").trim(),
        telefonoP: String(prefillFromAgenda.telefonoP || "").trim()
      };
      inputPaciente.value = "";
      listaPacientes.innerHTML = "";
      listaPacientes.style.display = "none";
    }

    actualizarResumenPaciente();
    refrescarTabla();
    actualizarEstadoFlujo();
    actualizarColorFormaPago();
    actualizarDashboardDia();
    actualizarConteoBilletes();
  }

  function mountCobro() {
    const content = document.querySelector(".content");
    if (!content) return;

    cobroItems = [];
    pacienteActual = null;
    cuentasActuales = [];
    totalDescuentoActual = 0;
    reporteMensualActual = [];
    reporteMensualTotalesActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
    reporteMensualTotalesGlobalActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
    reporteMensualFiltroActual = null;
    reporteMensualFormaPagoActual = "";
    faltantesCobroActual = [];
    faltantesCobroResumenActual = { atendidosCola: 0, cobrados: 0, faltantes: 0, fecha: "" };
    doctoresCuentaData = [];
    cargarDoctoresCuentaPromise = null;

    renderCobro(content);

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        if (window.__cobroDateNavKeydownHandler) {
          document.removeEventListener("keydown", window.__cobroDateNavKeydownHandler);
          window.__cobroDateNavKeydownHandler = null;
        }

        isDisposed = true;
        Object.keys(requestState).forEach((key) => invalidateRequest(key));
        isSavingCuenta = false;
        isCreatingDescuento = false;
        cobroItems = [];
        pacienteActual = null;
        cuentasActuales = [];
        totalDescuentoActual = 0;
        reporteMensualActual = [];
        reporteMensualTotalesActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
        reporteMensualTotalesGlobalActual = { pacientesUnicos: 0, cantidadTotalMes: 0, montoTotalMes: 0 };
        reporteMensualFiltroActual = null;
        reporteMensualFormaPagoActual = "";
        faltantesCobroActual = [];
        faltantesCobroResumenActual = { atendidosCola: 0, cobrados: 0, faltantes: 0, fecha: "" };
        doctoresCuentaData = [];
        cargarDoctoresCuentaPromise = null;

        const inputPaciente = document.getElementById("buscar-paciente");
        const inputServicio = document.getElementById("buscar-servicio");
        const formaPago = document.getElementById("forma-pago");
        const inputFecha = document.getElementById("cuenta-date");
        const inputCuentaSearch = document.getElementById("cuenta-search");
        const inputCuentaDoctorFilter = document.getElementById("cuenta-doctor-filter");
        const inputCuentaFormaPagoFilter = document.getElementById("cuenta-forma-pago-filter");
        const inputReporteMes = document.getElementById("reporte-mensual-mes");
        const selectReporteServicio = document.getElementById("reporte-mensual-servicio");
        const selectReporteFormaPago = document.getElementById("reporte-mensual-forma-pago");
        const faltantesCobroModal = document.getElementById("faltantes-cobro-modal");
        const inputDescuentoNombre = document.getElementById("descuento-nombre");
        const inputDescuentoCantidad = document.getElementById("descuento-cantidad");

        const lp = document.getElementById("lista-pacientes");
        const ls = document.getElementById("lista-servicios");
        if (lp) {
          lp.innerHTML = "";
          lp.style.display = "none";
        }
        if (ls) {
          ls.innerHTML = "";
          ls.style.display = "none";
        }

        if (inputPaciente) inputPaciente.value = "";
        if (inputServicio) inputServicio.value = "";
        if (inputCuentaSearch) inputCuentaSearch.value = "";
        if (inputCuentaDoctorFilter) inputCuentaDoctorFilter.value = "";
        if (inputCuentaFormaPagoFilter) inputCuentaFormaPagoFilter.value = "";
        if (inputFecha) inputFecha.value = "";
        if (inputReporteMes) inputReporteMes.value = "";
        if (selectReporteServicio) selectReporteServicio.value = "";
        if (selectReporteFormaPago) selectReporteFormaPago.value = "";
        if (inputDescuentoNombre) inputDescuentoNombre.value = "";
        if (inputDescuentoCantidad) inputDescuentoCantidad.value = "";

        if (formaPago) {
          formaPago.value = "";
          formaPago.classList.remove("fp-efectivo", "fp-tarjeta", "fp-igs", "fp-transferencia");
        }

        const pacienteSeleccionado = document.getElementById("paciente-seleccionado");
        const resumenPaciente = document.getElementById("resumen-paciente");
        const itemsCount = document.getElementById("cobro-items-count");
        const subtotal = document.getElementById("cobro-subtotal");
        const total = document.getElementById("cobro-total");
        const btnGuardar = document.getElementById("btn-guardar-cuenta");
        const emptyState = document.getElementById("cobro-empty-state");
        const tbodyCobro = document.getElementById("cobro-tbody");
        const tbodyCuenta = document.getElementById("cuenta-tbody");
        const tbodyReporteMensual = document.getElementById("reporte-mensual-tbody");
        const tbodyFaltantesCobro = document.getElementById("faltantes-cobro-tbody");
        const tbodyDescuento = document.getElementById("descuento-tbody");
        const totalDescuento = document.getElementById("descuento-total");
        const cuentaSubtotal = document.getElementById("cuenta-subtotal");
        const cuentaTotal = document.getElementById("cuenta-total");
        const reporteMensualModal = document.getElementById("reporte-mensual-modal");
        const reporteMensualPacientes = document.getElementById("reporte-mensual-pacientes");
        const reporteMensualCantidad = document.getElementById("reporte-mensual-cantidad");
        const reporteMensualTotal = document.getElementById("reporte-mensual-total");
        const reporteMensualTotalGlobal = document.getElementById("reporte-mensual-total-global");
        const faltantesCobroAtendidos = document.getElementById("faltantes-cobro-atendidos");
        const faltantesCobroCobrados = document.getElementById("faltantes-cobro-cobrados");
        const faltantesCobroTotal = document.getElementById("faltantes-cobro-total");
        const faltantesCobroFecha = document.getElementById("faltantes-cobro-fecha");

        if (pacienteSeleccionado) pacienteSeleccionado.textContent = "Sin paciente seleccionado";
        if (resumenPaciente) resumenPaciente.textContent = "Sin seleccionar";
        if (itemsCount) itemsCount.textContent = "0";
        if (subtotal) subtotal.textContent = "$0.00";
        if (total) total.textContent = "$0.00";
        if (btnGuardar) btnGuardar.disabled = true;
        if (emptyState) emptyState.style.display = "block";
        if (tbodyCobro) tbodyCobro.innerHTML = "";
        if (tbodyCuenta) tbodyCuenta.innerHTML = "";
        if (tbodyReporteMensual) tbodyReporteMensual.innerHTML = "";
        if (tbodyFaltantesCobro) tbodyFaltantesCobro.innerHTML = "";
        if (tbodyDescuento) tbodyDescuento.innerHTML = "";
        if (totalDescuento) {
          const strong = totalDescuento.querySelector("strong");
          if (strong) strong.textContent = "$0.00";
        }
        if (cuentaSubtotal) {
          const strong = cuentaSubtotal.querySelector("strong");
          if (strong) strong.textContent = "$0.00";
        }
        if (cuentaTotal) {
          const strong = cuentaTotal.querySelector("strong");
          if (strong) strong.textContent = "$0.00";
        }
        if (reporteMensualModal) reporteMensualModal.hidden = true;
        if (faltantesCobroModal) faltantesCobroModal.hidden = true;
        document.body.classList.remove("cobro-modal-open");
        if (reporteMensualPacientes) {
          const strong = reporteMensualPacientes.querySelector("strong");
          if (strong) strong.textContent = "0";
        }
        if (reporteMensualCantidad) {
          const strong = reporteMensualCantidad.querySelector("strong");
          if (strong) strong.textContent = "0";
        }
        if (reporteMensualTotal) {
          const strong = reporteMensualTotal.querySelector("strong");
          if (strong) strong.textContent = "$0.00";
        }
        if (reporteMensualTotalGlobal) {
          const strong = reporteMensualTotalGlobal.querySelector("strong");
          if (strong) strong.textContent = "$0.00";
        }
        if (faltantesCobroAtendidos) faltantesCobroAtendidos.textContent = "0";
        if (faltantesCobroCobrados) faltantesCobroCobrados.textContent = "0";
        if (faltantesCobroTotal) faltantesCobroTotal.textContent = "0";
        if (faltantesCobroFecha) faltantesCobroFecha.textContent = "Fecha: -";

        const stepPaciente = document.getElementById("step-paciente");
        const stepServicio = document.getElementById("step-servicio");
        const stepPago = document.getElementById("step-pago");
        const servicioBlock = document.getElementById("cobro-step-servicio-block");
        if (stepPaciente) {
          stepPaciente.classList.add("is-active");
          stepPaciente.classList.remove("is-done");
        }
        if (stepServicio) {
          stepServicio.classList.remove("is-active", "is-done");
        }
        if (stepPago) {
          stepPago.classList.remove("is-active", "is-done");
        }
        if (servicioBlock) servicioBlock.classList.add("is-disabled");
        if (inputServicio) inputServicio.disabled = true;
      });
    }
  }

  window.__mountCobro = mountCobro;
})();
