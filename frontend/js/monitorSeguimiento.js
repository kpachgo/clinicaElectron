// js/monitorSeguimiento.js
(function () {
  const PAGE_SIZE_OPTIONS = [10, 25, 50];
  const DEFAULT_PAGE_SIZE = 25;
  const SEARCH_DEBOUNCE_MS = 220;
  const SEGMENT_VALUES = new Set(["all", "retrasado", "m2", "m3"]);
  const ESTADO_VALUES = new Set(["all", "activo", "inactivo"]);
  const TRATAMIENTO_VALUES = new Set(["all", "odontologia", "ortodoncia", "sin_registrar"]);

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
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
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  function formatDateShort(value) {
    const date = parseISODate(value);
    if (!date) return "-";
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  function toInt(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : fallback;
  }

  function toBit(value, fallback = 0) {
    if (value === true || value === 1 || value === "1") return 1;
    if (value === false || value === 0 || value === "0") return 0;
    const txt = String(value || "").trim().toLowerCase();
    if (txt === "true" || txt === "yes" || txt === "on") return 1;
    if (txt === "false" || txt === "no" || txt === "off") return 0;
    return fallback;
  }

  function getSegmentByMonths(months) {
    const safeMonths = toInt(months, 0);
    if (safeMonths >= 3) return "m3";
    if (safeMonths === 2) return "m2";
    if (safeMonths === 1) return "retrasado";
    return "al_dia";
  }

  function getSegmentLabel(segmentKey) {
    if (segmentKey === "retrasado") return "Retrasado";
    if (segmentKey === "m2") return "+2 meses";
    if (segmentKey === "m3") return "+3 meses";
    return "Al dia";
  }

  function getEstadoLabel(estadoKey) {
    return estadoKey === "inactivo" ? "Inactivo" : "Activo";
  }

  function normalizeTratamientoLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Sin registrar";
    const norm = normalizeText(raw);
    if (norm === "odontologia") return "Odontologia";
    if (norm === "ortodoncia") return "Ortodoncia";
    if (norm === "sin registrar") return "Sin registrar";
    return raw;
  }

  function getTratamientoKey(value) {
    const norm = normalizeText(value);
    if (norm === "odontologia") return "odontologia";
    if (norm === "ortodoncia") return "ortodoncia";
    return "sin_registrar";
  }

  function getMonitorIcon(iconName) {
    const base = 'class="ms-contact-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false"';
    if (iconName === "phone") {
      return `<svg ${base}><path d="M2.25 4.5a1.5 1.5 0 0 1 1.5-1.5h2.6a1.5 1.5 0 0 1 1.48 1.26l.41 2.46a1.5 1.5 0 0 1-.43 1.31l-1.2 1.2a13.5 13.5 0 0 0 6.16 6.16l1.2-1.2a1.5 1.5 0 0 1 1.31-.43l2.46.41A1.5 1.5 0 0 1 21 17.65v2.6a1.5 1.5 0 0 1-1.5 1.5h-.75C9.94 21.75 2.25 14.06 2.25 4.5v0Z"></path></svg>`;
    }
    return `<svg ${base}><path d="M2.25 12c0-4.97 4.03-9 9-9h1.5c4.97 0 9 4.03 9 9s-4.03 9-9 9h-3.25l-3.5 2v-2.7A8.95 8.95 0 0 1 2.25 12Z"></path><path d="M8.25 12h.008v.008H8.25V12Zm3.75 0h.008v.008H12V12Zm3.75 0h.008v.008H15.75V12Z"></path></svg>`;
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.message || "Error de comunicacion con el servidor");
    }
    return json;
  }

  function buildMonitorQuery(state) {
    const params = new URLSearchParams();
    params.set("fechaCorte", state.fechaCorte);
    params.set("segmento", state.segmentFilter);
    params.set("estado", state.estadoFilter);
    params.set("tratamiento", state.tratamientoFilter);
    params.set("q", String(state.q || "").trim());
    params.set("page", String(state.page));
    params.set("pageSize", String(state.pageSize));
    return params.toString();
  }

  function normalizeMonitorResponse(payload, state) {
    const rawRows = Array.isArray(payload?.rows) ? payload.rows : [];
    const rawTotales = payload?.totales && typeof payload.totales === "object" ? payload.totales : {};
    const rawPagination = payload?.pagination && typeof payload.pagination === "object" ? payload.pagination : {};

    const rows = rawRows.map((item) => {
      const mesesAusencia = Math.max(0, toInt(item?.mesesAusencia, 0));
      const segmentCandidate = String(item?.segmentoKey || "").trim().toLowerCase();
      const segmentoKey = SEGMENT_VALUES.has(segmentCandidate) ? segmentCandidate : getSegmentByMonths(mesesAusencia);
      const estadoCandidate = String(item?.estadoKey || "").trim().toLowerCase();
      const estadoKey = estadoCandidate === "inactivo" ? "inactivo" : "activo";
      const tratamientoLabel = normalizeTratamientoLabel(item?.tipoTratamientoP || item?.tratamientoLabel);

      return {
        idPaciente: Math.max(0, toInt(item?.idPaciente, 0)),
        NombreP: String(item?.NombreP || "").trim(),
        telefonoP: String(item?.telefonoP || "").trim(),
        ultimaVisitaP: item?.ultimaVisitaP ? String(item.ultimaVisitaP).trim() : null,
        mesesAusencia,
        segmentoKey,
        segmentoLabel: getSegmentLabel(segmentoKey),
        estadoKey,
        estadoLabel: getEstadoLabel(estadoKey),
        tipoTratamientoP: tratamientoLabel,
        tratamientoKey: getTratamientoKey(tratamientoLabel),
        sms: toBit(item?.sms, 0),
        llamada: toBit(item?.llamada, 0)
      };
    });

    const total = Math.max(0, toInt(rawPagination.total, toInt(rawTotales.total, 0)));
    const page = Math.max(1, toInt(rawPagination.page, state.page));
    const pageSizeCandidate = toInt(rawPagination.pageSize, state.pageSize);
    const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeCandidate) ? pageSizeCandidate : state.pageSize;
    const totalPages = Math.max(1, toInt(rawPagination.totalPages, Math.ceil(total / pageSize) || 1));
    const from = total === 0 ? 0 : Math.max(1, toInt(rawPagination.from, (page - 1) * pageSize + 1));
    const to = total === 0 ? 0 : Math.min(total, toInt(rawPagination.to, from + rows.length - 1));

    return {
      rows,
      totales: {
        total: Math.max(0, toInt(rawTotales.total, total)),
        retrasado: Math.max(0, toInt(rawTotales.retrasado, 0)),
        m2: Math.max(0, toInt(rawTotales.m2, 0)),
        m3: Math.max(0, toInt(rawTotales.m3, 0))
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        from,
        to
      }
    };
  }

  function renderMonitorSeguimiento(container) {
    container.innerHTML = `
      <div class="ms-container">
        <div class="ms-header">
          <div class="ms-title-wrap">
            <h2 class="ms-title">Monitor de Seguimiento</h2>
            <p class="ms-subtitle">Vista visual de ausencias por ultima visita (v2 backend)</p>
          </div>

          <div class="ms-controls ui-toolbar">
            <label class="ms-toggle-numeracion" for="ms-toggle-numeracion">
              <input type="checkbox" id="ms-toggle-numeracion">
              Numeracion
            </label>
            <label class="ms-toggle-sms" for="ms-toggle-sms">
              <input type="checkbox" id="ms-toggle-sms">
              SMS
            </label>
            <label class="ms-toggle-llamada" for="ms-toggle-llamada">
              <input type="checkbox" id="ms-toggle-llamada">
              Llamada
            </label>

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
            <label class="ms-control-field" for="ms-tratamiento">
              <span>Tratamiento</span>
              <select id="ms-tratamiento" class="ui-control">
                <option value="all">Todos</option>
                <option value="odontologia">Odontologia</option>
                <option value="ortodoncia">Ortodoncia</option>
                <option value="sin_registrar">Sin registrar</option>
              </select>
            </label>
            <label class="ms-control-field" for="ms-estado">
              <span>Estado</span>
              <select id="ms-estado" class="ui-control">
                <option value="all">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </label>
            <button id="ms-clear" class="ui-toolbar-btn is-neutral" type="button">Limpiar filtros</button>
          </div>
        </div>

        <div id="ms-kpi-grid" class="ms-kpi-grid"></div>

        <div class="ms-active-filters-wrap">
          <div id="ms-kpi-status" class="ms-kpi-status"></div>
          <span id="ms-active-filters-meta" class="ms-active-filters-meta">Sin filtros adicionales</span>
          <div id="ms-active-filters" class="ms-active-filters"></div>
        </div>

        <div class="ms-table-wrap ui-table-wrap-compact">
          <table class="ms-table ui-table-compact">
            <thead>
              <tr>
                <th class="ms-col-contacto">Contactado</th>
                <th class="ms-col-num">#</th>
                <th>Paciente</th>
                <th>Telefono</th>
                <th>Ultima visita</th>
                <th style="text-align:center; width:140px;">Meses ausencia</th>
                <th style="width:150px;">Tratamiento</th>
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
      inputTratamiento: container.querySelector("#ms-tratamiento"),
      inputEstado: container.querySelector("#ms-estado"),
      toggleNumeracion: container.querySelector("#ms-toggle-numeracion"),
      toggleSms: container.querySelector("#ms-toggle-sms"),
      toggleLlamada: container.querySelector("#ms-toggle-llamada"),
      btnClear: container.querySelector("#ms-clear"),
      kpiGrid: container.querySelector("#ms-kpi-grid"),
      kpiStatus: container.querySelector("#ms-kpi-status"),
      activeFiltersMeta: container.querySelector("#ms-active-filters-meta"),
      activeFilters: container.querySelector("#ms-active-filters"),
      table: container.querySelector(".ms-table"),
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
      tratamientoFilter: "all",
      showNumeracion: false,
      showSms: false,
      showLlamada: false,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      rows: [],
      loading: false,
      errorText: "",
      totales: { total: 0, retrasado: 0, m2: 0, m3: 0 },
      pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1, from: 0, to: 0 }
    };

    let isDisposed = false;
    let searchDebounceTimer = null;
    let fetchSeq = 0;
    let fetchController = null;
    const savingContactoSet = new Set();
    const listeners = [];

    function bind(el, eventName, handler, options) {
      if (!el) return;
      el.addEventListener(eventName, handler, options);
      listeners.push(() => el.removeEventListener(eventName, handler, options));
    }

    function isViewActive() {
      return !isDisposed && container?.isConnected && window.currentView === "Monitor de Seguimiento";
    }

    function contactSaveKey(idPaciente) {
      return `${idPaciente}:${state.fechaCorte}`;
    }

    function applyContactColumnVisibility() {
      if (!refs.table) return;
      refs.table.classList.toggle("hide-numeracion", !state.showNumeracion);
      refs.table.classList.toggle("hide-contacto-sms", !state.showSms);
      refs.table.classList.toggle("hide-contacto-llamada", !state.showLlamada);
      refs.table.classList.toggle("hide-contactado", !state.showSms && !state.showLlamada);
    }

    function renderKpis() {
      if (!refs.kpiGrid) return;
      const counts = state.totales;
      const cards = [
        { key: "total", label: "Total", value: counts.total, tone: "total" },
        { key: "retrasado", label: "Retrasado", value: counts.retrasado, tone: "retrasado" },
        { key: "m2", label: "+2 meses", value: counts.m2, tone: "m2" },
        { key: "m3", label: "+3 meses", value: counts.m3, tone: "m3" }
      ];

      refs.kpiGrid.innerHTML = cards.map((card) => {
        const isActive = card.key === "total"
          ? state.segmentFilter === "all"
          : state.segmentFilter === card.key;

        return `
          <button
            class="ms-kpi-card tone-${card.tone}${isActive ? " is-active" : ""}"
            data-kpi-key="${card.key}"
            type="button"
          >
            <span class="ms-kpi-label">${card.label}</span>
            <strong class="ms-kpi-value">${card.value}</strong>
            <span class="ms-kpi-state">${isActive ? "Filtro activo" : "Sin filtro"}</span>
          </button>
        `;
      }).join("");
    }

    function renderKpiStatus() {
      if (!refs.kpiStatus) return;
      if (state.segmentFilter === "all") {
        refs.kpiStatus.innerHTML = `<span class="ms-kpi-status-pill is-neutral">KPI sin filtro de segmento; mostrando Total</span>`;
        return;
      }
      refs.kpiStatus.innerHTML = `<span class="ms-kpi-status-pill is-active">Segmento KPI aplicado: ${escapeHtml(getSegmentLabel(state.segmentFilter))}</span>`;
    }

    function renderActiveFilters() {
      if (!refs.activeFilters) return;
      const queryText = String(state.q || "").trim();
      const pills = [
        { label: "Fecha corte", value: formatDateShort(state.fechaCorte), tone: "neutral" }
      ];

      if (state.segmentFilter !== "all") {
        pills.push({ label: "Segmento", value: getSegmentLabel(state.segmentFilter), tone: "segment" });
      }
      if (state.estadoFilter !== "all") {
        pills.push({ label: "Estado", value: state.estadoFilter === "activo" ? "Activo" : "Inactivo", tone: "estado" });
      }
      if (state.tratamientoFilter !== "all") {
        const tratamientoLabel = normalizeTratamientoLabel(state.tratamientoFilter.replace(/_/g, " "));
        pills.push({ label: "Tratamiento", value: tratamientoLabel, tone: "tratamiento" });
      }
      if (queryText) {
        pills.push({ label: "Busqueda", value: queryText, tone: "search" });
      }

      const extraCount = pills.length - 1;
      if (refs.activeFiltersMeta) {
        if (extraCount <= 0) refs.activeFiltersMeta.textContent = "Sin filtros adicionales (solo fecha de corte)";
        else if (extraCount === 1) refs.activeFiltersMeta.textContent = "1 filtro adicional aplicado";
        else refs.activeFiltersMeta.textContent = `${extraCount} filtros adicionales aplicados`;
      }

      refs.activeFilters.innerHTML = pills.map((pill) => `
        <span class="ms-filter-pill tone-${pill.tone}">
          <span class="ms-filter-pill-label">${escapeHtml(pill.label)}:</span>
          <strong class="ms-filter-pill-value">${escapeHtml(pill.value)}</strong>
        </span>
      `).join("");
    }

    function renderTableRows() {
      if (!refs.tbody) return;

      if (state.loading) {
        refs.tbody.innerHTML = `
          <tr><td colspan="9" class="ms-empty">Cargando monitor de seguimiento...</td></tr>
        `;
        return;
      }

      if (state.errorText) {
        refs.tbody.innerHTML = `
          <tr><td colspan="9" class="ms-empty">${escapeHtml(state.errorText)}</td></tr>
        `;
        return;
      }

      const pageRows = state.rows;
      if (!pageRows.length) {
        refs.tbody.innerHTML = `
          <tr><td colspan="9" class="ms-empty">No hay pacientes para el filtro actual</td></tr>
        `;
        return;
      }

      const offset = state.pagination.from > 0 ? state.pagination.from - 1 : 0;
      refs.tbody.innerHTML = pageRows.map((row, index) => {
        const estadoClass = row.estadoKey === "activo" ? "is-activo" : "is-inactivo";
        const segmentoClass = row.segmentoKey === "retrasado"
          ? "is-retrasado"
          : row.segmentoKey === "m2"
            ? "is-m2"
            : row.segmentoKey === "m3"
              ? "is-m3"
              : "is-al-dia";
        const rowNumber = offset + index + 1;
        const saving = savingContactoSet.has(contactSaveKey(row.idPaciente));

        return `
          <tr>
            <td class="ms-col-contacto">
              <div class="ms-contacto-flags">
                <label class="ms-contacto-flag is-sms" title="SMS">
                  <input
                    type="checkbox"
                    class="ms-contact-input"
                    data-contact-kind="sms"
                    data-id-paciente="${row.idPaciente}"
                    ${row.sms ? "checked" : ""}
                    ${saving ? "disabled" : ""}
                  >
                  <span class="ms-contacto-icon">${getMonitorIcon("chat")}</span>
                </label>
                <label class="ms-contacto-flag is-llamada" title="Llamada">
                  <input
                    type="checkbox"
                    class="ms-contact-input"
                    data-contact-kind="llamada"
                    data-id-paciente="${row.idPaciente}"
                    ${row.llamada ? "checked" : ""}
                    ${saving ? "disabled" : ""}
                  >
                  <span class="ms-contacto-icon">${getMonitorIcon("phone")}</span>
                </label>
              </div>
            </td>
            <td class="ms-col-num">${rowNumber}</td>
            <td>${escapeHtml(row.NombreP || "-")}</td>
            <td>${escapeHtml(row.telefonoP || "-")}</td>
            <td>${escapeHtml(formatDateShort(row.ultimaVisitaP))}</td>
            <td style="text-align:center;">${row.mesesAusencia}</td>
            <td><span class="ms-chip is-tratamiento">${escapeHtml(row.tipoTratamientoP || "Sin registrar")}</span></td>
            <td><span class="ms-chip ${estadoClass}">${row.estadoLabel}</span></td>
            <td><span class="ms-chip ${segmentoClass}">${row.segmentoLabel}</span></td>
          </tr>
        `;
      }).join("");
    }

    function renderPagination() {
      const meta = state.pagination;
      if (refs.pageSummary) refs.pageSummary.textContent = `Mostrando ${meta.from}-${meta.to} de ${meta.total}`;
      if (refs.pageIndicator) refs.pageIndicator.textContent = `Pagina ${meta.page} de ${meta.totalPages}`;
      if (refs.btnPrev) refs.btnPrev.disabled = meta.page <= 1 || state.loading;
      if (refs.btnNext) refs.btnNext.disabled = meta.page >= meta.totalPages || state.loading;
    }

    function renderAll() {
      renderKpis();
      renderKpiStatus();
      renderActiveFilters();
      renderTableRows();
      applyContactColumnVisibility();
      renderPagination();
    }

    async function apiListMonitor(signal) {
      const qs = buildMonitorQuery(state);
      return fetchJson(`/api/paciente/monitor-seguimiento?${qs}`, {
        cache: "no-store",
        signal
      });
    }

    async function apiSaveContacto(payload) {
      return fetchJson("/api/paciente/monitor-seguimiento/contacto", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {})
      });
    }

    async function refreshData() {
      if (!isViewActive()) return;

      if (fetchController) {
        try {
          fetchController.abort();
        } catch {
          // ignore abort errors
        }
      }

      const localSeq = ++fetchSeq;
      fetchController = typeof AbortController !== "undefined" ? new AbortController() : null;
      const signal = fetchController ? fetchController.signal : undefined;

      state.loading = true;
      state.errorText = "";
      renderAll();

      try {
        const payload = await apiListMonitor(signal);
        if (!isViewActive() || localSeq !== fetchSeq) return;

        const normalized = normalizeMonitorResponse(payload, state);
        state.rows = normalized.rows;
        state.totales = normalized.totales;
        state.pagination = normalized.pagination;
        state.page = normalized.pagination.page;
        state.pageSize = normalized.pagination.pageSize;
        state.loading = false;
        state.errorText = "";
        if (refs.pageSize) refs.pageSize.value = String(state.pageSize);
        renderAll();
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!isViewActive() || localSeq !== fetchSeq) return;

        state.rows = [];
        state.totales = { total: 0, retrasado: 0, m2: 0, m3: 0 };
        state.pagination = {
          page: state.page,
          pageSize: state.pageSize,
          total: 0,
          totalPages: 1,
          from: 0,
          to: 0
        };
        state.loading = false;
        state.errorText = String(err?.message || "No se pudo cargar el monitor de seguimiento");
        renderAll();
      } finally {
        if (fetchController && localSeq === fetchSeq) {
          fetchController = null;
        }
      }
    }

    function resetFilters() {
      state.fechaCorte = getTodayLocalISO();
      state.q = "";
      state.segmentFilter = "all";
      state.estadoFilter = "all";
      state.tratamientoFilter = "all";
      state.page = 1;
      state.pageSize = DEFAULT_PAGE_SIZE;

      if (refs.inputFecha) refs.inputFecha.value = state.fechaCorte;
      if (refs.inputSearch) refs.inputSearch.value = "";
      if (refs.inputTratamiento) refs.inputTratamiento.value = state.tratamientoFilter;
      if (refs.inputEstado) refs.inputEstado.value = state.estadoFilter;
      if (refs.pageSize) refs.pageSize.value = String(state.pageSize);

      void refreshData();
    }

    bind(refs.inputFecha, "change", () => {
      if (!isViewActive()) return;
      const next = String(refs.inputFecha?.value || "").trim();
      state.fechaCorte = next || getTodayLocalISO();
      state.page = 1;
      void refreshData();
    });

    bind(refs.inputSearch, "input", (e) => {
      if (!isViewActive()) return;
      state.q = String(e?.target?.value || "");
      state.page = 1;
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        if (!isViewActive()) return;
        void refreshData();
      }, SEARCH_DEBOUNCE_MS);
    });

    bind(refs.inputTratamiento, "change", (e) => {
      if (!isViewActive()) return;
      const next = String(e?.target?.value || "all").trim().toLowerCase();
      state.tratamientoFilter = TRATAMIENTO_VALUES.has(next) ? next : "all";
      state.page = 1;
      void refreshData();
    });

    bind(refs.inputEstado, "change", (e) => {
      if (!isViewActive()) return;
      const next = String(e?.target?.value || "all").trim().toLowerCase();
      state.estadoFilter = ESTADO_VALUES.has(next) ? next : "all";
      state.page = 1;
      void refreshData();
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

      if (key === "total") state.segmentFilter = "all";
      else state.segmentFilter = state.segmentFilter === key ? "all" : key;

      state.page = 1;
      void refreshData();
    });

    bind(refs.pageSize, "change", (e) => {
      if (!isViewActive()) return;
      const nextSize = toInt(e?.target?.value, DEFAULT_PAGE_SIZE);
      state.pageSize = PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : DEFAULT_PAGE_SIZE;
      state.page = 1;
      void refreshData();
    });

    bind(refs.btnPrev, "click", () => {
      if (!isViewActive() || state.loading) return;
      if (state.page <= 1) return;
      state.page -= 1;
      void refreshData();
    });

    bind(refs.btnNext, "click", () => {
      if (!isViewActive() || state.loading) return;
      if (state.page >= state.pagination.totalPages) return;
      state.page += 1;
      void refreshData();
    });

    bind(refs.toggleNumeracion, "change", (e) => {
      if (!isViewActive()) return;
      state.showNumeracion = !!e?.target?.checked;
      applyContactColumnVisibility();
    });

    bind(refs.toggleSms, "change", (e) => {
      if (!isViewActive()) return;
      state.showSms = !!e?.target?.checked;
      applyContactColumnVisibility();
    });

    bind(refs.toggleLlamada, "change", (e) => {
      if (!isViewActive()) return;
      state.showLlamada = !!e?.target?.checked;
      applyContactColumnVisibility();
    });

    bind(refs.tbody, "change", async (e) => {
      if (!isViewActive()) return;
      const input = e?.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (!input.classList.contains("ms-contact-input")) return;

      const idPaciente = toInt(input.dataset.idPaciente, 0);
      const kind = String(input.dataset.contactKind || "").trim().toLowerCase();
      if (!idPaciente || (kind !== "sms" && kind !== "llamada")) return;

      const row = state.rows.find((item) => item.idPaciente === idPaciente);
      if (!row) return;

      const key = contactSaveKey(idPaciente);
      if (savingContactoSet.has(key)) {
        input.checked = kind === "sms" ? !!row.sms : !!row.llamada;
        return;
      }

      const prevSms = row.sms;
      const prevLlamada = row.llamada;
      if (kind === "sms") row.sms = input.checked ? 1 : 0;
      if (kind === "llamada") row.llamada = input.checked ? 1 : 0;
      savingContactoSet.add(key);
      renderTableRows();
      applyContactColumnVisibility();

      try {
        const payload = {
          idPaciente,
          fechaCorte: state.fechaCorte,
          sms: row.sms ? 1 : 0,
          llamada: row.llamada ? 1 : 0
        };
        const json = await apiSaveContacto(payload);
        const saved = json?.data || {};
        row.sms = toBit(saved.sms, row.sms);
        row.llamada = toBit(saved.llamada, row.llamada);
      } catch (err) {
        row.sms = prevSms;
        row.llamada = prevLlamada;
        alert(err?.message || "No se pudo guardar contacto");
      } finally {
        savingContactoSet.delete(key);
        renderTableRows();
        applyContactColumnVisibility();
      }
    });

    state.showNumeracion = false;
    state.showSms = false;
    state.showLlamada = false;

    if (refs.inputFecha) refs.inputFecha.value = state.fechaCorte;
    if (refs.inputSearch) refs.inputSearch.value = "";
    if (refs.inputTratamiento) refs.inputTratamiento.value = state.tratamientoFilter;
    if (refs.inputEstado) refs.inputEstado.value = state.estadoFilter;
    if (refs.pageSize) refs.pageSize.value = String(state.pageSize);
    if (refs.toggleNumeracion) refs.toggleNumeracion.checked = state.showNumeracion;
    if (refs.toggleSms) refs.toggleSms.checked = state.showSms;
    if (refs.toggleLlamada) refs.toggleLlamada.checked = state.showLlamada;

    renderAll();
    void refreshData();

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        isDisposed = true;
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = null;
        }
        if (fetchController) {
          try {
            fetchController.abort();
          } catch {
            // ignore abort errors
          }
          fetchController = null;
        }
        listeners.forEach((off) => {
          try {
            off();
          } catch {
            // ignore cleanup errors
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
