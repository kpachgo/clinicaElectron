// js/monitorSeguimiento.js
(function () {
  const PAGE_SIZE_OPTIONS = [10, 25, 50];
  const DEFAULT_PAGE_SIZE = 25;

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTodayLocalISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseISODate(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const date = new Date(y, m - 1, d);

    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return null;
    }

    return date;
  }

  function toISODate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function buildDateMonthsAgo(monthsAgo, dayOffset = 0) {
    const now = new Date();
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - Number(monthsAgo || 0),
      now.getDate() - Number(dayOffset || 0)
    );
    return toISODate(date);
  }

  function formatDateShort(value) {
    const date = parseISODate(value);
    if (!date) return "-";
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Similar a TIMESTAMPDIFF(MONTH, fechaInicio, fechaFin)
  function diffMonthsCalendar(fromISO, toISO) {
    const fromDate = parseISODate(fromISO);
    const toDate = parseISODate(toISO);
    if (!fromDate || !toDate) return null;

    if (toDate < fromDate) return 0;

    let months = (toDate.getFullYear() - fromDate.getFullYear()) * 12;
    months += toDate.getMonth() - fromDate.getMonth();

    if (toDate.getDate() < fromDate.getDate()) {
      months -= 1;
    }

    return months < 0 ? 0 : months;
  }

  function getSegmentFromMonths(months) {
    const safeMonths = Number(months || 0);
    if (safeMonths >= 3) {
      return { key: "m3", label: "+3 meses" };
    }
    if (safeMonths === 2) {
      return { key: "m2", label: "+2 meses" };
    }
    if (safeMonths === 1) {
      return { key: "retrasado", label: "Retrasado" };
    }
    return { key: "al_dia", label: "Al dia" };
  }

  function buildMockRows() {
    const nombres = [
      "Ana Lopez", "Carlos Perez", "Marta Ramirez", "Jorge Castillo", "Daniela Ruiz",
      "Luis Herrera", "Sofia Marroquin", "Pedro Mendez", "Camila Orellana", "Jose Linares",
      "Rosa Cifuentes", "Mario Aguilar", "Elena Gomez", "Andres Chacon", "Patricia Ochoa",
      "Hector Alvarado", "Valeria Molina", "Oscar Menendez", "Brenda Figueroa", "Eduardo Flores"
    ];

    const rows = [];
    const total = 72;

    for (let i = 0; i < total; i += 1) {
      const index = i + 1;
      const baseName = nombres[i % nombres.length];
      const suffix = String(100 + index);
      const phone = `55${String(100000 + index).slice(-6)}`;
      const estadoP = index % 5 === 0 ? 0 : 1;

      // Introducimos varios NULL para validar exclusion.
      const hasNullVisit = index % 14 === 0;

      // Distribucion para segmentos excluyentes por mes calendario.
      const monthBucket = index % 8;
      let monthsAgo = 0;
      let dayOffset = 0;

      if (monthBucket === 1 || monthBucket === 2) {
        monthsAgo = 1;
        dayOffset = monthBucket === 1 ? 2 : 8;
      } else if (monthBucket === 3 || monthBucket === 4) {
        monthsAgo = 2;
        dayOffset = monthBucket === 3 ? 1 : 11;
      } else if (monthBucket === 5 || monthBucket === 6 || monthBucket === 7) {
        monthsAgo = 3 + (index % 3);
        dayOffset = 3;
      }

      rows.push({
        idPaciente: index,
        NombreP: `${baseName} ${suffix}`,
        telefonoP: phone,
        ultimaVisitaP: hasNullVisit ? null : buildDateMonthsAgo(monthsAgo, dayOffset),
        estadoP
      });
    }

    return rows;
  }

  const MOCK_ROWS = buildMockRows();

  function renderMonitorSeguimiento(container) {
    container.innerHTML = `
      <div class="ms-container">
        <div class="ms-header">
          <div class="ms-title-wrap">
            <h2 class="ms-title">Monitor de Seguimiento</h2>
            <p class="ms-subtitle">Vista visual de ausencias por ultima visita (mock v1)</p>
          </div>

          <div class="ms-controls ui-toolbar">
            <label class="ms-control-field" for="ms-fecha-corte">
              <span>Fecha de corte</span>
              <input id="ms-fecha-corte" class="ui-control" type="date">
            </label>
            <input
              id="ms-search"
              class="ui-control ui-control-search"
              type="search"
              placeholder="Buscar por nombre o telefono"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
            >
            <button id="ms-clear" class="ui-toolbar-btn is-neutral" type="button">Limpiar filtros</button>
          </div>
        </div>

        <div id="ms-kpi-grid" class="ms-kpi-grid"></div>

        <div class="ms-active-filters-wrap">
          <span id="ms-active-filters" class="ms-active-filters">Filtros activos: ninguno</span>
        </div>

        <div class="ms-table-wrap ui-table-wrap-compact">
          <table class="ms-table ui-table-compact">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Telefono</th>
                <th>Ultima visita</th>
                <th style="text-align:center; width:140px;">Meses ausencia</th>
                <th style="width:130px;">Estado</th>
                <th style="width:150px;">Segmento</th>
              </tr>
            </thead>
            <tbody id="ms-tbody"></tbody>
          </table>
        </div>

        <div class="ms-pagination">
          <div id="ms-page-summary" class="ms-page-summary">Mostrando 0-0 de 0</div>

          <div class="ms-page-actions ui-toolbar">
            <label class="ms-page-size" for="ms-page-size">
              <span>Tamano</span>
              <select id="ms-page-size" class="ui-control">
                ${PAGE_SIZE_OPTIONS.map((size) => `<option value="${size}">${size}</option>`).join("")}
              </select>
            </label>

            <button id="ms-prev" class="ui-toolbar-btn is-neutral" type="button">Anterior</button>
            <span id="ms-page-indicator" class="ms-page-indicator">Pagina 1 de 1</span>
            <button id="ms-next" class="ui-toolbar-btn is-neutral" type="button">Siguiente</button>
          </div>
        </div>
      </div>
    `;

    const refs = {
      inputFecha: container.querySelector("#ms-fecha-corte"),
      inputSearch: container.querySelector("#ms-search"),
      btnClear: container.querySelector("#ms-clear"),
      kpiGrid: container.querySelector("#ms-kpi-grid"),
      activeFilters: container.querySelector("#ms-active-filters"),
      tbody: container.querySelector("#ms-tbody"),
      pageSummary: container.querySelector("#ms-page-summary"),
      pageSize: container.querySelector("#ms-page-size"),
      pageIndicator: container.querySelector("#ms-page-indicator"),
      btnPrev: container.querySelector("#ms-prev"),
      btnNext: container.querySelector("#ms-next")
    };

    const state = {
      fechaCorte: getTodayLocalISO(),
      q: "",
      segmentFilter: "all",
      estadoFilter: "all",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE
    };

    let isDisposed = false;
    const listeners = [];

    function bind(el, eventName, handler, options) {
      if (!el) return;
      el.addEventListener(eventName, handler, options);
      listeners.push(() => el.removeEventListener(eventName, handler, options));
    }

    function isViewActive() {
      return !isDisposed && container?.isConnected && window.currentView === "Monitor de Seguimiento";
    }

    function getBaseRows() {
      const fechaCorte = state.fechaCorte || getTodayLocalISO();

      return MOCK_ROWS
        .filter((row) => String(row?.ultimaVisitaP || "").trim() !== "")
        .map((row) => {
          const months = diffMonthsCalendar(row.ultimaVisitaP, fechaCorte);
          const safeMonths = Number.isInteger(months) ? months : 0;
          const segment = getSegmentFromMonths(safeMonths);
          const estadoKey = Number(row.estadoP) === 1 ? "activo" : "inactivo";

          return {
            ...row,
            mesesAusencia: safeMonths,
            segmentoKey: segment.key,
            segmentoLabel: segment.label,
            estadoKey,
            estadoLabel: estadoKey === "activo" ? "Activo" : "Inactivo"
          };
        })
        .sort((a, b) => {
          if (a.mesesAusencia !== b.mesesAusencia) {
            return b.mesesAusencia - a.mesesAusencia;
          }
          return String(a.NombreP || "").localeCompare(String(b.NombreP || ""), "es", { sensitivity: "base" });
        });
    }

    function applySearch(rows) {
      const qRaw = String(state.q || "").trim();
      if (!qRaw) return rows;

      const qNorm = normalizeText(qRaw);
      const qDigits = onlyDigits(qRaw);

      return rows.filter((row) => {
        const matchName = normalizeText(row.NombreP).includes(qNorm);
        if (matchName) return true;

        if (!qDigits) return false;
        const telDigits = onlyDigits(row.telefonoP);
        return telDigits.includes(qDigits);
      });
    }

    function buildKpiCounts(rows) {
      const retrasado = rows.filter((r) => r.segmentoKey === "retrasado").length;
      const m2 = rows.filter((r) => r.segmentoKey === "m2").length;
      const m3 = rows.filter((r) => r.segmentoKey === "m3").length;
      const activos = rows.filter((r) => r.estadoKey === "activo").length;
      const inactivos = rows.filter((r) => r.estadoKey === "inactivo").length;

      return {
        total: rows.length,
        retrasado,
        m2,
        m3,
        activos,
        inactivos
      };
    }

    function applyCardFilters(rows) {
      return rows.filter((row) => {
        const matchSegment = state.segmentFilter === "all" || row.segmentoKey === state.segmentFilter;
        if (!matchSegment) return false;

        const matchEstado = state.estadoFilter === "all" || row.estadoKey === state.estadoFilter;
        if (!matchEstado) return false;

        return true;
      });
    }

    function getPagedRows(rows) {
      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      if (state.page > totalPages) {
        state.page = totalPages;
      }

      const startIndex = (state.page - 1) * state.pageSize;
      const endIndexExclusive = startIndex + state.pageSize;
      const pageRows = rows.slice(startIndex, endIndexExclusive);
      const from = total === 0 ? 0 : startIndex + 1;
      const to = total === 0 ? 0 : Math.min(endIndexExclusive, total);

      return {
        total,
        totalPages,
        from,
        to,
        pageRows
      };
    }

    function renderKpis(counts) {
      if (!refs.kpiGrid) return;

      const cards = [
        { key: "total", label: "Total", value: counts.total, tone: "total" },
        { key: "retrasado", label: "Retrasado", value: counts.retrasado, tone: "retrasado" },
        { key: "m2", label: "+2 meses", value: counts.m2, tone: "m2" },
        { key: "m3", label: "+3 meses", value: counts.m3, tone: "m3" },
        { key: "activos", label: "Activos", value: counts.activos, tone: "activo" },
        { key: "inactivos", label: "Inactivos", value: counts.inactivos, tone: "inactivo" }
      ];

      refs.kpiGrid.innerHTML = cards.map((card) => {
        let isActive = false;

        if (card.key === "total") {
          isActive = state.segmentFilter === "all" && state.estadoFilter === "all";
        } else if (card.key === "activos") {
          isActive = state.estadoFilter === "activo";
        } else if (card.key === "inactivos") {
          isActive = state.estadoFilter === "inactivo";
        } else {
          isActive = state.segmentFilter === card.key;
        }

        return `
          <button
            class="ms-kpi-card tone-${card.tone}${isActive ? " is-active" : ""}"
            data-kpi-key="${card.key}"
            type="button"
          >
            <span class="ms-kpi-label">${card.label}</span>
            <strong class="ms-kpi-value">${card.value}</strong>
          </button>
        `;
      }).join("");
    }

    function renderActiveFilters() {
      if (!refs.activeFilters) return;

      const chunks = [`Fecha corte: ${formatDateShort(state.fechaCorte)}`];

      if (state.segmentFilter === "retrasado") chunks.push("Segmento: Retrasado");
      if (state.segmentFilter === "m2") chunks.push("Segmento: +2 meses");
      if (state.segmentFilter === "m3") chunks.push("Segmento: +3 meses");

      if (state.estadoFilter === "activo") chunks.push("Estado: Activo");
      if (state.estadoFilter === "inactivo") chunks.push("Estado: Inactivo");

      if (String(state.q || "").trim()) {
        chunks.push(`Busqueda: ${String(state.q).trim()}`);
      }

      refs.activeFilters.textContent = `Filtros activos: ${chunks.join(" | ")}`;
    }

    function renderTableRows(pageRows) {
      if (!refs.tbody) return;

      if (!pageRows.length) {
        refs.tbody.innerHTML = `
          <tr>
            <td colspan="6" class="ms-empty">No hay pacientes para el filtro actual</td>
          </tr>
        `;
        return;
      }

      refs.tbody.innerHTML = pageRows.map((row) => {
        const estadoClass = row.estadoKey === "activo" ? "is-activo" : "is-inactivo";
        let segmentClass = "is-al-dia";
        if (row.segmentoKey === "retrasado") segmentClass = "is-retrasado";
        if (row.segmentoKey === "m2") segmentClass = "is-m2";
        if (row.segmentoKey === "m3") segmentClass = "is-m3";

        return `
          <tr>
            <td>${escapeHtml(row.NombreP)}</td>
            <td>${escapeHtml(row.telefonoP || "-")}</td>
            <td>${escapeHtml(formatDateShort(row.ultimaVisitaP))}</td>
            <td style="text-align:center;">${row.mesesAusencia}</td>
            <td><span class="ms-chip ${estadoClass}">${row.estadoLabel}</span></td>
            <td><span class="ms-chip ${segmentClass}">${row.segmentoLabel}</span></td>
          </tr>
        `;
      }).join("");
    }

    function renderPagination(meta) {
      if (refs.pageSummary) {
        refs.pageSummary.textContent = `Mostrando ${meta.from}-${meta.to} de ${meta.total}`;
      }
      if (refs.pageIndicator) {
        refs.pageIndicator.textContent = `Pagina ${state.page} de ${meta.totalPages}`;
      }
      if (refs.btnPrev) {
        refs.btnPrev.disabled = state.page <= 1;
      }
      if (refs.btnNext) {
        refs.btnNext.disabled = state.page >= meta.totalPages;
      }
    }

    function renderAll() {
      if (!isViewActive()) return;

      const baseRows = getBaseRows();
      const searchedRows = applySearch(baseRows);
      const counts = buildKpiCounts(searchedRows);
      const filteredRows = applyCardFilters(searchedRows);
      const pagination = getPagedRows(filteredRows);

      renderKpis(counts);
      renderActiveFilters();
      renderTableRows(pagination.pageRows);
      renderPagination(pagination);
    }

    function resetFilters() {
      state.fechaCorte = getTodayLocalISO();
      state.q = "";
      state.segmentFilter = "all";
      state.estadoFilter = "all";
      state.page = 1;
      state.pageSize = DEFAULT_PAGE_SIZE;

      if (refs.inputFecha) refs.inputFecha.value = state.fechaCorte;
      if (refs.inputSearch) refs.inputSearch.value = "";
      if (refs.pageSize) refs.pageSize.value = String(state.pageSize);

      renderAll();
    }

    bind(refs.inputFecha, "change", () => {
      if (!isViewActive()) return;
      const value = String(refs.inputFecha?.value || "").trim();
      state.fechaCorte = value || getTodayLocalISO();
      state.page = 1;
      renderAll();
    });

    bind(refs.inputSearch, "input", (e) => {
      if (!isViewActive()) return;
      state.q = String(e?.target?.value || "");
      state.page = 1;
      renderAll();
    });

    bind(refs.btnClear, "click", () => {
      if (!isViewActive()) return;
      resetFilters();
    });

    bind(refs.kpiGrid, "click", (e) => {
      if (!isViewActive()) return;
      const card = e.target?.closest?.(".ms-kpi-card");
      if (!card) return;

      const key = String(card.dataset.kpiKey || "").trim();
      if (!key) return;

      if (key === "total") {
        state.segmentFilter = "all";
        state.estadoFilter = "all";
      } else if (key === "activos") {
        state.estadoFilter = state.estadoFilter === "activo" ? "all" : "activo";
      } else if (key === "inactivos") {
        state.estadoFilter = state.estadoFilter === "inactivo" ? "all" : "inactivo";
      } else {
        state.segmentFilter = state.segmentFilter === key ? "all" : key;
      }

      state.page = 1;
      renderAll();
    });

    bind(refs.pageSize, "change", (e) => {
      if (!isViewActive()) return;
      const nextSize = Number(e?.target?.value || DEFAULT_PAGE_SIZE);
      state.pageSize = PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : DEFAULT_PAGE_SIZE;
      state.page = 1;
      renderAll();
    });

    bind(refs.btnPrev, "click", () => {
      if (!isViewActive()) return;
      if (state.page <= 1) return;
      state.page -= 1;
      renderAll();
    });

    bind(refs.btnNext, "click", () => {
      if (!isViewActive()) return;
      state.page += 1;
      renderAll();
    });

    resetFilters();

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        isDisposed = true;
        listeners.forEach((off) => {
          try {
            off();
          } catch {
            // ignore listener cleanup errors
          }
        });
      });
    }
  }

  function mountMonitorSeguimiento() {
    const content = document.querySelector(".content");
    if (!content) return;
    renderMonitorSeguimiento(content);
  }

  window.__mountMonitorSeguimiento = mountMonitorSeguimiento;
})();
