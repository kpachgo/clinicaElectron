// js/monitorSeguimiento.js
(function () {
  const PAGE_SIZE_OPTIONS = [10, 25, 50];
  const DEFAULT_PAGE_SIZE = 25;
  const SEARCH_DEBOUNCE_MS = 220;
  const MAX_COMENTARIO = 500;
  // Clic en el encabezado "Proxima cita": Todos -> Con cita -> Sin cita -> Todos.
  const PROXIMA_FILTRO_VALUES = ["all", "con", "sin"];
  const SEGMENT_VALUES = new Set(["all", "retrasado", "m2", "m3", "cancelados"]);
  const ESTADO_VALUES = new Set(["all", "activo", "inactivo"]);
  const TRATAMIENTO_VALUES = new Set(["all", "odontologia", "ortodoncia", "sin_registrar"]);

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

  function isEditingTextControl(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    const type = String(el.getAttribute("type") || "text").toLowerCase();
    return !["button", "checkbox", "radio", "submit", "reset"].includes(type);
  }

  function getSegmentByMonths(months) {
    const safeMonths = toInt(months, 0);
    if (safeMonths >= 3) return "m3";
    if (safeMonths === 2) return "m2";
    if (safeMonths === 1) return "retrasado";
    return "al_dia";
  }

  function getSegmentLabel(segmentKey) {
    if (segmentKey === "cancelados") return "Cancelados sin reprogramar";
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
    if (iconName === "magnifying-glass") {
      return `<svg ${base}><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg>`;
    }
    if (iconName === "calendar-days") {
      return `<svg ${base}><rect x="3" y="4.75" width="18" height="16" rx="2.5"></rect><path d="M8 3v3.5M16 3v3.5M3 9.5h18"></path><path d="M8 13h3M13 13h3M8 16.5h3"></path></svg>`;
    }
    if (iconName === "comment") {
      return `<svg ${base}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-8Z"></path><path d="M8 8h8M8 11.5h5"></path></svg>`;
    }
    if (iconName === "check") {
      return `<svg ${base}><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`;
    }
    if (iconName === "funnel") {
      return `<svg ${base}><path d="M4 5h16l-6.2 7.4v5.1L10.2 19v-6.6L4 5Z"></path></svg>`;
    }
    if (iconName === "x-mark") {
      return `<svg ${base}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"></path></svg>`;
    }
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

  async function resolverPacienteIdDesdeMonitor(row) {
    const idDirecto = Math.max(0, toInt(row?.idPaciente, 0));
    if (idDirecto > 0) return idDirecto;

    const nombreMonitor = String(row?.NombreP || "").trim();
    if (!nombreMonitor) {
      throw new Error("La fila no tiene nombre de paciente");
    }

    const json = await fetchJson(`/api/paciente/search?q=${encodeURIComponent(nombreMonitor)}`, {
      cache: "no-store"
    });
    const data = Array.isArray(json?.data) ? json.data : [];

    const exactos = data.filter((p) => {
      const nombrePaciente = String(p?.NombreP || "").trim();
      return normalizeText(nombrePaciente) === normalizeText(nombreMonitor);
    });

    if (!exactos.length) {
      throw new Error(`No existe un paciente registrado con nombre exacto: "${nombreMonitor}"`);
    }

    if (exactos.length === 1) {
      const id = Number(exactos[0]?.idPaciente || 0);
      if (!id) throw new Error("No se pudo resolver el paciente");
      return id;
    }

    const contactoMonitor = onlyDigits(row?.telefonoP || "");
    if (contactoMonitor) {
      const filtradosTelefono = exactos.filter((p) => {
        const tel = onlyDigits(p?.telefonoP || p?.TelefonoP || "");
        return tel && tel === contactoMonitor;
      });
      if (filtradosTelefono.length === 1) {
        const id = Number(filtradosTelefono[0]?.idPaciente || 0);
        if (!id) throw new Error("No se pudo resolver el paciente");
        return id;
      }
    }

    throw new Error("Hay multiples pacientes con ese nombre. Abra Paciente y seleccionelo manualmente.");
  }

  async function abrirPacienteDesdeMonitor(row) {
    const idPaciente = await resolverPacienteIdDesdeMonitor(row);
    if (!idPaciente) {
      throw new Error("No se pudo identificar el paciente");
    }

    const pacienteApi = window.__pacienteViewAPI;
    if (pacienteApi && typeof pacienteApi.openById === "function") {
      const ok = await pacienteApi.openById(idPaciente);
      if (ok === false) {
        throw new Error("No se pudo abrir la vista Paciente");
      }
      return;
    }

    window.__pacienteAbrirPendienteId = idPaciente;
    if (typeof window.loadView === "function") {
      await Promise.resolve(window.loadView("Paciente"));
      return;
    }

    throw new Error("No se pudo abrir la vista Paciente");
  }

  async function abrirBusquedaManualPacienteDesdeMonitor(row, message) {
    const pacienteApi = window.__pacienteViewAPI;
    if (!pacienteApi || typeof pacienteApi.openManualSearch !== "function") {
      return false;
    }

    const ok = await pacienteApi.openManualSearch({
      query: String(row?.NombreP || ""),
      contacto: String(row?.telefonoP || ""),
      message: String(message || "")
    });
    return !!ok;
  }

  function notifyMonitor(message, options = {}) {
    if (typeof window.showSystemMessage === "function") {
      window.showSystemMessage(message, options);
      return;
    }
    alert(message);
  }

  function buildProximaCitaText(row, cita) {
    const nombre = String(row?.NombreP || "Paciente").trim();
    if (!cita) {
      return `${nombre}: no tiene una proxima cita agendada.`;
    }

    const fecha = formatDateShort(cita.fechaAP);
    const hora = String(cita.horaAP || cita.hora24 || "-").trim() || "-";
    const estado = String(cita.estadoAP || "-").trim() || "-";
    const contacto = String(cita.contactoAP || row?.telefonoP || "-").trim() || "-";
    return `${nombre}: proxima cita ${fecha} ${hora} | Estado: ${estado} | Contacto: ${contacto}`;
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
    if (state.showProximaCita) params.set("proximaCita", "1");
    if (state.showProximaCita && state.proximaFiltro !== "all") params.set("proximaFiltro", state.proximaFiltro);
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
        llamada: toBit(item?.llamada, 0),
        comentario: String(item?.comentario || "").trim(),
        fechaContacto: item?.fechaContacto ? String(item.fechaContacto).trim() : null,
        contactoPor: String(item?.contactoPor || "").trim(),
        contactoEn: item?.contactoEn ? String(item.contactoEn).trim() : null,
        // undefined = no consultado (columna oculta); null = sin cita; "YYYY-MM-DD" = agendada.
        proximaCita: item?.proximaCita === undefined ? undefined : (item.proximaCita ? String(item.proximaCita).trim() : null),
        fechaCancelacion: item?.fechaCancelacion ? String(item.fechaCancelacion).trim() : null
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
        m3: Math.max(0, toInt(rawTotales.m3, 0)),
        cancelados: Math.max(0, toInt(rawTotales.cancelados, 0))
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
            <p class="ms-subtitle">Ausencias por ultima visita y seguimiento de contacto</p>
          </div>
        </div>

        <div class="ms-controls">
          <div class="ms-control-row ms-control-row-primary">
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
            <label class="ms-control-field" for="ms-segmento">
              <span>Seguimiento</span>
              <select id="ms-segmento" class="ui-control">
                <option value="all">Todos</option>
                <option value="retrasado">Retrasados</option>
                <option value="m2">+2 meses</option>
                <option value="m3">+3 meses</option>
                <option value="cancelados">Cancelados sin reprogramar</option>
              </select>
            </label>
            <button id="ms-clear" class="ui-toolbar-btn is-neutral" type="button">Limpiar filtros</button>
          </div>
          <div class="ms-control-row ms-control-row-flags">
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
            <label class="ms-toggle-proxima" for="ms-toggle-proxima">
              <input type="checkbox" id="ms-toggle-proxima">
              Proxima cita
            </label>
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
                <th class="ms-col-proxima">
                  <button type="button" id="ms-proxima-filter" class="ms-th-filter-btn" title="Filtrar por proxima cita">
                    Proxima cita <span class="ms-th-filter-state" id="ms-proxima-filter-state"></span>
                  </button>
                </th>
                <th class="ms-col-num">#</th>
                <th>Paciente</th>
                <th class="ms-col-accion">Accion</th>
                <th>Telefono</th>
                <th>Ultima visita / cancelacion</th>
                <th>Meses ausencia</th>
                <th>Tratamiento</th>
                <th>Estado</th>
                <th>Segmento</th>
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
      inputSegmento: container.querySelector("#ms-segmento"),
      toggleNumeracion: container.querySelector("#ms-toggle-numeracion"),
      toggleSms: container.querySelector("#ms-toggle-sms"),
      toggleLlamada: container.querySelector("#ms-toggle-llamada"),
      toggleProximaCita: container.querySelector("#ms-toggle-proxima"),
      proximaFilterBtn: container.querySelector("#ms-proxima-filter"),
      proximaFilterState: container.querySelector("#ms-proxima-filter-state"),
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

    const monitorUiStateKey = `ui_state_monitor_seguimiento_${getUiStateUserId()}`;
    const persistedUiState = loadSessionUiState(monitorUiStateKey);
    const persistedFechaCorte = String(persistedUiState?.fechaCorte || "").trim();
    const persistedSegmentFilter = String(persistedUiState?.segmentFilter || "all").trim().toLowerCase();
    const persistedEstadoFilter = String(persistedUiState?.estadoFilter || "all").trim().toLowerCase();
    const persistedTratamientoFilter = String(persistedUiState?.tratamientoFilter || "all").trim().toLowerCase();
    const persistedPageSize = toInt(persistedUiState?.pageSize, DEFAULT_PAGE_SIZE);

    const state = {
      fechaCorte: parseISODate(persistedFechaCorte) ? persistedFechaCorte : getTodayLocalISO(),
      q: String(persistedUiState?.q || ""),
      segmentFilter: SEGMENT_VALUES.has(persistedSegmentFilter) ? persistedSegmentFilter : "all",
      estadoFilter: ESTADO_VALUES.has(persistedEstadoFilter) ? persistedEstadoFilter : "all",
      tratamientoFilter: TRATAMIENTO_VALUES.has(persistedTratamientoFilter) ? persistedTratamientoFilter : "all",
      showNumeracion: !!toBit(persistedUiState?.showNumeracion, 0),
      showSms: !!toBit(persistedUiState?.showSms, 0),
      showLlamada: !!toBit(persistedUiState?.showLlamada, 0),
      showProximaCita: !!toBit(persistedUiState?.showProximaCita, 0),
      proximaFiltro: PROXIMA_FILTRO_VALUES.includes(persistedUiState?.proximaFiltro)
        && toBit(persistedUiState?.showProximaCita, 0)
        ? persistedUiState.proximaFiltro
        : "all",
      // Se retoma la pagina donde iba; el backend la ajusta si ya no existe.
      page: Math.max(1, toInt(persistedUiState?.page, 1)),
      pageSize: PAGE_SIZE_OPTIONS.includes(persistedPageSize) ? persistedPageSize : DEFAULT_PAGE_SIZE,
      rows: [],
      loading: false,
      errorText: "",
      totales: { total: 0, retrasado: 0, m2: 0, m3: 0, cancelados: 0 },
      pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 1, from: 0, to: 0 }
    };

    let isDisposed = false;
    let searchDebounceTimer = null;
    let fetchSeq = 0;
    let fetchController = null;
    const savingContactoSet = new Set();
    let commentTooltipEl = null;
    let commentTooltipAnchor = null;
    const proximaCitaCache = new Map();
    const listeners = [];

    function getMonitorUiStateSnapshot() {
      return {
        fechaCorte: state.fechaCorte,
        q: state.q,
        segmentFilter: state.segmentFilter,
        estadoFilter: state.estadoFilter,
        tratamientoFilter: state.tratamientoFilter,
        showNumeracion: state.showNumeracion ? 1 : 0,
        showSms: state.showSms ? 1 : 0,
        showLlamada: state.showLlamada ? 1 : 0,
        showProximaCita: state.showProximaCita ? 1 : 0,
        proximaFiltro: state.proximaFiltro,
        page: state.page,
        pageSize: state.pageSize
      };
    }

    function persistMonitorUiState() {
      saveSessionUiState(monitorUiStateKey, getMonitorUiStateSnapshot());
    }

    function bind(el, eventName, handler, options) {
      if (!el) return;
      el.addEventListener(eventName, handler, options);
      listeners.push(() => el.removeEventListener(eventName, handler, options));
    }

    function isViewActive() {
      return !isDisposed && container?.isConnected && window.currentView === "Monitor de Seguimiento";
    }

    function contactSaveKey(idPaciente) {
      return String(idPaciente);
    }

    function applyContactColumnVisibility() {
      if (!refs.table) return;
      refs.table.classList.toggle("hide-numeracion", !state.showNumeracion);
      refs.table.classList.toggle("hide-contacto-sms", !state.showSms);
      refs.table.classList.toggle("hide-contacto-llamada", !state.showLlamada);
      refs.table.classList.toggle("hide-contactado", !state.showSms && !state.showLlamada);
      refs.table.classList.toggle("hide-proxima-cita", !state.showProximaCita);
      renderProximaFilterHeader();
    }

    // Checkboxes de columnas: entran/salen con el patron de tableFx (salen, se deslizan, caen).
    function animarColumnasMonitor() {
      if (typeof window.tableFx?.toggle === "function" && refs.table) {
        window.tableFx.toggle(refs.table, applyContactColumnVisibility, {
          selector: ".ms-col-num, .ms-col-contacto, .ms-contacto-flag, .ms-col-proxima"
        });
        return;
      }
      applyContactColumnVisibility();
    }

    // Guarda SMS/Llamada/Comentario juntos: el backend fecha la marca con el dia real
    // y la sigue mostrando mientras sea posterior a la ultima visita del paciente.
    async function saveContactoRow(row, patch) {
      const key = contactSaveKey(row.idPaciente);
      if (savingContactoSet.has(key)) return;

      const prev = {
        sms: row.sms,
        llamada: row.llamada,
        comentario: row.comentario,
        fechaContacto: row.fechaContacto,
        contactoPor: row.contactoPor,
        contactoEn: row.contactoEn
      };
      Object.assign(row, patch);
      savingContactoSet.add(key);
      renderTableRows();
      applyContactColumnVisibility();

      try {
        const json = await apiSaveContacto({
          idPaciente: row.idPaciente,
          sms: row.sms ? 1 : 0,
          llamada: row.llamada ? 1 : 0,
          comentario: row.comentario || ""
        });
        const saved = json?.data || {};
        row.sms = toBit(saved.sms, row.sms);
        row.llamada = toBit(saved.llamada, row.llamada);
        row.comentario = String(saved.comentario ?? row.comentario ?? "").trim();
        row.fechaContacto = saved.fechaContacto || null;
        row.contactoPor = String(saved.contactoPor || "").trim();
        row.contactoEn = saved.contactoEn || null;
      } catch (err) {
        Object.assign(row, prev);
        alert(err?.message || "No se pudo guardar contacto");
      } finally {
        savingContactoSet.delete(key);
        if (isViewActive()) {
          renderTableRows();
          applyContactColumnVisibility();
        }
      }
    }

    function ensureCommentTooltip() {
      if (commentTooltipEl) return commentTooltipEl;
      commentTooltipEl = document.createElement("div");
      commentTooltipEl.className = "ms-comment-tooltip";
      commentTooltipEl.setAttribute("role", "tooltip");
      document.body.appendChild(commentTooltipEl);
      return commentTooltipEl;
    }

    function showCommentTooltip(anchor, row) {
      const el = ensureCommentTooltip();
      const flags = [row.sms ? "SMS" : "", row.llamada ? "Llamada" : ""].filter(Boolean).join(" + ");
      const contactoEn = String(row.contactoEn || "");
      const metaParts = [
        contactoEn ? `${formatDateShort(contactoEn.slice(0, 10))}${contactoEn.slice(10)}` : "",
        row.contactoPor,
        flags ? `Contactado: ${flags}` : ""
      ].filter(Boolean);
      el.innerHTML = `
        <div class="ms-comment-tooltip-title">${escapeHtml(row.NombreP || "Paciente")}</div>
        <div class="ms-comment-tooltip-text">${escapeHtml(row.comentario)}</div>
        ${metaParts.length ? `<div class="ms-comment-tooltip-meta">${escapeHtml(metaParts.join(" · "))}</div>` : ""}
      `;
      commentTooltipAnchor = anchor;
      el.classList.add("is-open");

      const rect = anchor.getBoundingClientRect();
      const tipRect = el.getBoundingClientRect();
      const margin = 8;
      let left = rect.left + (rect.width - tipRect.width) / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
      let top = rect.bottom + 6;
      if (top + tipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - tipRect.height - 6);
      }
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
    }

    function hideCommentTooltip() {
      commentTooltipAnchor = null;
      if (commentTooltipEl) commentTooltipEl.classList.remove("is-open");
    }

    function renderKpis() {
      if (!refs.kpiGrid) return;
      const counts = state.totales;
      const cards = [
        { key: "total", label: "Total", value: counts.total, tone: "total" },
        { key: "retrasado", label: "Retrasado", value: counts.retrasado, tone: "retrasado" },
        { key: "m2", label: "+2 meses", value: counts.m2, tone: "m2" },
        { key: "m3", label: "+3 meses", value: counts.m3, tone: "m3" },
        { key: "cancelados", label: "Cancelados sin reprogramar", value: counts.cancelados, tone: "cancelados" }
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
      if (state.showProximaCita && state.proximaFiltro !== "all") {
        pills.push({
          label: "Proxima cita",
          value: state.proximaFiltro === "con" ? "Con cita" : "Sin cita",
          tone: "estado"
        });
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

    function renderProximaFilterHeader() {
      if (!refs.proximaFilterBtn) return;
      const filtro = state.proximaFiltro;
      refs.proximaFilterBtn.classList.toggle("is-con", filtro === "con");
      refs.proximaFilterBtn.classList.toggle("is-sin", filtro === "sin");
      refs.proximaFilterBtn.title = filtro === "con"
        ? "Mostrando solo con proxima cita (clic: solo sin cita)"
        : filtro === "sin"
          ? "Mostrando solo sin proxima cita (clic: todos)"
          : "Filtrar por proxima cita (clic: solo con cita)";
      if (refs.proximaFilterState) {
        refs.proximaFilterState.innerHTML = filtro === "con"
          ? getMonitorIcon("check")
          : filtro === "sin"
            ? getMonitorIcon("x-mark")
            : getMonitorIcon("funnel");
      }
    }

    function renderProximaCitaCell(row) {
      if (row.proximaCita === undefined) return "";
      if (row.proximaCita) {
        const label = `Proxima cita: ${formatDateShort(row.proximaCita)}`;
        return `<span class="ms-proxima-flag is-si" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${getMonitorIcon("check")}</span>`;
      }
      return `<span class="ms-proxima-flag is-no" title="Sin proxima cita agendada" aria-label="Sin proxima cita agendada">${getMonitorIcon("x-mark")}</span>`;
    }

    // Diente flotando sobre las filas atenuadas mientras se recarga (filtros, paginas, etc.).
    // Asi el aviso de carga sale siempre, tambien cuando la tabla ya tenia filas.
    function syncRefreshSpinner(visible) {
      const wrap = refs.table?.closest(".ms-table-wrap");
      if (!wrap) return;
      let overlay = wrap.querySelector(":scope > .ms-refresh-ld");
      if (!visible) {
        overlay?.classList.remove("is-visible");
        return;
      }
      if (typeof window.toothSpinner?.html !== "function") return;
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "ms-refresh-ld";
        wrap.appendChild(overlay);
      }
      if (!overlay.classList.contains("is-visible")) {
        overlay.innerHTML = window.toothSpinner.html({ label: "Actualizando...", size: 44 });
        overlay.classList.add("is-visible");
      }
    }

    function renderTableRows() {
      if (!refs.tbody) return;
      hideCommentTooltip();

      // En recargas se mantienen las filas actuales (atenuadas) para evitar el parpadeo;
      // el aviso "Cargando" solo sale cuando todavia no hay nada que mostrar.
      const refreshing = state.loading && state.rows.length > 0;
      refs.table?.classList.toggle("is-refreshing", refreshing);
      syncRefreshSpinner(refreshing);
      // Llenado animado (tableFx.js): caen al cargar; al filtrar/paginar/actualizar se reacomodan.
      const fx = window.tableFx?.begin(refs.tbody);
      if (state.loading && !state.rows.length) {
        refs.tbody.innerHTML = typeof window.toothSpinner?.tableRowHtml === "function"
          ? window.toothSpinner.tableRowHtml(refs.tbody, "Cargando monitor de seguimiento...")
          : `
          <tr><td colspan="11" class="ms-empty">Cargando monitor de seguimiento...</td></tr>
        `;
        fx?.end();
        return;
      }

      if (state.errorText) {
        refs.tbody.innerHTML = `
          <tr><td colspan="11" class="ms-empty">${escapeHtml(state.errorText)}</td></tr>
        `;
        fx?.end();
        return;
      }

      const pageRows = state.rows;
      if (!pageRows.length) {
        refs.tbody.innerHTML = `
          <tr><td colspan="11" class="ms-empty">No hay pacientes para el filtro actual</td></tr>
        `;
        fx?.end();
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
        const hasComment = !!row.comentario;
        const fxSig = [
          row.sms, row.llamada, row.comentario, row.NombreP, row.telefonoP, row.ultimaVisitaP,
          row.fechaCancelacion, row.mesesAusencia, row.tipoTratamientoP, row.estadoKey, row.segmentoKey,
          row.proximaCita
        ].map((v) => String(v ?? "")).join("|");

        return `
          <tr data-fx-key="${escapeHtml(row.idPaciente)}" data-fx-sig="${escapeHtml(fxSig)}">
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
            <td class="ms-col-proxima">${renderProximaCitaCell(row)}</td>
            <td class="ms-col-num">${rowNumber}</td>
            <td class="ms-col-paciente${hasComment ? " has-comment" : ""}" data-comment-row-index="${index}">
              ${escapeHtml(row.NombreP || "-")}${hasComment ? `<span class="ms-comment-mark" aria-hidden="true">${getMonitorIcon("comment")}</span>` : ""}
            </td>
            <td class="ms-col-accion">
              <div class="ms-row-actions">
                <button
                  type="button"
                  class="ms-open-paciente-btn"
                  data-open-row-index="${index}"
                  data-id-paciente="${row.idPaciente}"
                  data-nombre="${escapeHtml(row.NombreP || "")}"
                  data-telefono="${escapeHtml(row.telefonoP || "")}"
                  title="Abrir paciente"
                  aria-label="Abrir paciente"
                >
                  ${getMonitorIcon("magnifying-glass")}
                </button>
                <button
                  type="button"
                  class="ms-open-paciente-btn ms-next-cita-btn"
                  data-open-row-index="${index}"
                  data-id-paciente="${row.idPaciente}"
                  title="Ver proxima cita"
                  aria-label="Ver proxima cita"
                >
                  ${getMonitorIcon("calendar-days")}
                </button>
                <button
                  type="button"
                  class="ms-open-paciente-btn ms-comment-btn${hasComment ? " is-active" : ""}"
                  data-id-paciente="${row.idPaciente}"
                  title="${hasComment ? "Editar comentario" : "Agregar comentario"}"
                  aria-label="${hasComment ? "Editar comentario" : "Agregar comentario"}"
                  ${saving ? "disabled" : ""}
                >
                  ${getMonitorIcon("comment")}
                </button>
              </div>
            </td>
            <td class="ms-col-telefono">${escapeHtml(row.telefonoP || "-")}</td>
            <td class="ms-col-ultima">${escapeHtml(formatDateShort(row.segmentoKey === "cancelados" ? row.fechaCancelacion : row.ultimaVisitaP))}</td>
            <td class="ms-col-meses">${row.mesesAusencia}</td>
            <td class="ms-col-tratamiento"><span class="ms-chip is-tratamiento">${escapeHtml(row.tipoTratamientoP || "Sin registrar")}</span></td>
            <td class="ms-col-estado"><span class="ms-chip ${estadoClass}">${row.estadoLabel}</span></td>
            <td class="ms-col-segmento"><span class="ms-chip ${segmentoClass}">${row.segmentoLabel}</span></td>
          </tr>
        `;
      }).join("");
      fx?.end();
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

    async function apiGetProximaCita(idPaciente) {
      const id = Math.max(0, toInt(idPaciente, 0));
      if (!id) {
        throw new Error("Paciente invalido para consultar proxima cita");
      }
      return fetchJson(`/api/paciente/monitor-seguimiento/proxima-cita?idPaciente=${id}`, {
        cache: "no-store"
      });
    }

    async function loadProximasCitasVisibles() {
      const pendientes = state.rows.filter((row) => row.proximaCita === undefined && row.idPaciente > 0);
      if (!pendientes.length) return;
      const seq = fetchSeq;
      try {
        const ids = pendientes.map((row) => row.idPaciente).join(",");
        const json = await fetchJson(`/api/paciente/monitor-seguimiento/proximas-citas?ids=${ids}`, {
          cache: "no-store"
        });
        // Si mientras tanto se recargo el listado, esas filas ya no son las visibles.
        if (!isViewActive() || seq !== fetchSeq) return;
        const data = json?.data || {};
        pendientes.forEach((row) => {
          const fecha = data[row.idPaciente];
          row.proximaCita = fecha ? String(fecha).trim() : null;
        });
        renderTableRows();
        applyContactColumnVisibility();
      } catch (err) {
        notifyMonitor(err?.message || "No se pudo consultar las proximas citas", {
          title: "Monitor de Seguimiento",
          type: "error"
        });
      }
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
        persistMonitorUiState();
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
      state.proximaFiltro = "all";
      state.page = 1;
      state.pageSize = DEFAULT_PAGE_SIZE;

      if (refs.inputFecha) refs.inputFecha.value = state.fechaCorte;
      if (refs.inputSearch) refs.inputSearch.value = state.q;
      if (refs.inputTratamiento) refs.inputTratamiento.value = state.tratamientoFilter;
      if (refs.inputEstado) refs.inputEstado.value = state.estadoFilter;
      if (refs.inputSegmento) refs.inputSegmento.value = state.segmentFilter;
      if (refs.pageSize) refs.pageSize.value = String(state.pageSize);

      persistMonitorUiState();
      void refreshData();
    }

    bind(refs.inputFecha, "change", () => {
      if (!isViewActive()) return;
      const next = String(refs.inputFecha?.value || "").trim();
      state.fechaCorte = next || getTodayLocalISO();
      state.page = 1;
      persistMonitorUiState();
      void refreshData();
    });

    bind(refs.inputSearch, "input", (e) => {
      if (!isViewActive()) return;
      state.q = String(e?.target?.value || "");
      state.page = 1;
      persistMonitorUiState();
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
      persistMonitorUiState();
      void refreshData();
    });

    bind(refs.inputEstado, "change", (e) => {
      if (!isViewActive()) return;
      const next = String(e?.target?.value || "all").trim().toLowerCase();
      state.estadoFilter = ESTADO_VALUES.has(next) ? next : "all";
      state.page = 1;
      persistMonitorUiState();
      void refreshData();
    });

    bind(refs.inputSegmento, "change", (e) => {
      if (!isViewActive()) return;
      const next = String(e?.target?.value || "all").trim().toLowerCase();
      state.segmentFilter = SEGMENT_VALUES.has(next) ? next : "all";
      state.page = 1;
      persistMonitorUiState();
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

      if (refs.inputSegmento) refs.inputSegmento.value = state.segmentFilter;

      state.page = 1;
      persistMonitorUiState();
      void refreshData();
    });

    bind(refs.pageSize, "change", (e) => {
      if (!isViewActive()) return;
      const nextSize = toInt(e?.target?.value, DEFAULT_PAGE_SIZE);
      state.pageSize = PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : DEFAULT_PAGE_SIZE;
      state.page = 1;
      persistMonitorUiState();
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
      persistMonitorUiState();
      animarColumnasMonitor();
    });

    bind(refs.toggleSms, "change", (e) => {
      if (!isViewActive()) return;
      state.showSms = !!e?.target?.checked;
      persistMonitorUiState();
      animarColumnasMonitor();
    });

    bind(refs.toggleLlamada, "change", (e) => {
      if (!isViewActive()) return;
      state.showLlamada = !!e?.target?.checked;
      persistMonitorUiState();
      animarColumnasMonitor();
    });

    bind(refs.proximaFilterBtn, "click", (e) => {
      if (!isViewActive()) return;
      e.preventDefault();
      const idx = PROXIMA_FILTRO_VALUES.indexOf(state.proximaFiltro);
      state.proximaFiltro = PROXIMA_FILTRO_VALUES[(idx + 1) % PROXIMA_FILTRO_VALUES.length];
      state.page = 1;
      persistMonitorUiState();
      void refreshData();
    });

    // Atajos como en Agenda: Alt+1..4 alterna Numeracion / SMS / Llamada / Proxima cita.
    const toggleShortcutByKey = {
      "1": refs.toggleNumeracion,
      "2": refs.toggleSms,
      "3": refs.toggleLlamada,
      "4": refs.toggleProximaCita
    };
    bind(document, "keydown", (e) => {
      if (!isViewActive()) return;
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (document.querySelector(".sys-alert-overlay.is-open")) return;
      if (isEditingTextControl(document.activeElement)) return;

      const input = toggleShortcutByKey[String(e.key || "")];
      if (!(input instanceof HTMLInputElement) || input.disabled) return;
      e.preventDefault();
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    bind(refs.toggleProximaCita, "change", (e) => {
      if (!isViewActive()) return;
      state.showProximaCita = !!e?.target?.checked;
      // Al ocultar la columna tambien se quita su filtro (si no, filtraria "a ciegas").
      if (!state.showProximaCita && state.proximaFiltro !== "all") {
        state.proximaFiltro = "all";
        state.page = 1;
        persistMonitorUiState();
        renderActiveFilters();
        applyContactColumnVisibility();
        void refreshData();
        return;
      }
      persistMonitorUiState();
      animarColumnasMonitor();
      // La agenda solo se consulta con la columna visible: al activarla se piden solo
      // las filas en pantalla, sin recargar el listado.
      if (state.showProximaCita) void loadProximasCitasVisibles();
    });

    bind(refs.tbody, "click", async (e) => {
      if (!isViewActive()) return;
      const btn = e?.target?.closest?.(".ms-open-paciente-btn");
      if (!btn) return;
      if (btn.classList.contains("ms-next-cita-btn") || btn.classList.contains("ms-comment-btn")) return;

      e.preventDefault();
      if (btn.disabled) return;

      const rowIndex = toInt(btn.dataset.openRowIndex, -1);
      const rowFromState = rowIndex >= 0 ? state.rows[rowIndex] : null;
      const row = rowFromState || {
        idPaciente: Math.max(0, toInt(btn.dataset.idPaciente, 0)),
        NombreP: String(btn.dataset.nombre || "").trim(),
        telefonoP: String(btn.dataset.telefono || "").trim()
      };

      btn.disabled = true;
      try {
        await abrirPacienteDesdeMonitor(row);
      } catch (err) {
        const message = String(err?.message || "No se pudo abrir el paciente");
        const okManual = await abrirBusquedaManualPacienteDesdeMonitor(row, message);
        if (!okManual) {
          alert(message);
        }
      } finally {
        if (isViewActive() && btn.isConnected) {
          btn.disabled = false;
        }
      }
    });

    bind(refs.tbody, "click", async (e) => {
      if (!isViewActive()) return;
      const btn = e?.target?.closest?.(".ms-next-cita-btn");
      if (!btn) return;

      e.preventDefault();
      if (btn.disabled) return;

      const rowIndex = toInt(btn.dataset.openRowIndex, -1);
      const rowFromState = rowIndex >= 0 ? state.rows[rowIndex] : null;
      const row = rowFromState || {
        idPaciente: Math.max(0, toInt(btn.dataset.idPaciente, 0)),
        NombreP: "",
        telefonoP: ""
      };

      if (!row.idPaciente) {
        notifyMonitor("No se pudo identificar el paciente para consultar proxima cita.", {
          title: "Monitor de Seguimiento",
          type: "warning"
        });
        return;
      }

      const cacheKey = String(row.idPaciente);
      if (proximaCitaCache.has(cacheKey)) {
        const cached = proximaCitaCache.get(cacheKey) || null;
        notifyMonitor(buildProximaCitaText(row, cached), {
          title: "Proxima cita",
          type: cached ? "info" : "warning"
        });
        return;
      }

      btn.disabled = true;
      try {
        const response = await apiGetProximaCita(row.idPaciente);
        const cita = response?.data || null;
        proximaCitaCache.set(cacheKey, cita);
        notifyMonitor(buildProximaCitaText(row, cita), {
          title: "Proxima cita",
          type: cita ? "info" : "warning"
        });
      } catch (err) {
        notifyMonitor(err?.message || "No se pudo consultar la proxima cita", {
          title: "Monitor de Seguimiento",
          type: "error"
        });
      } finally {
        if (isViewActive() && btn.isConnected) {
          btn.disabled = false;
        }
      }
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

      await saveContactoRow(row, { [kind]: input.checked ? 1 : 0 });
    });

    bind(refs.tbody, "click", async (e) => {
      if (!isViewActive()) return;
      const btn = e?.target?.closest?.(".ms-comment-btn");
      if (!btn) return;

      e.preventDefault();
      if (btn.disabled) return;

      const idPaciente = toInt(btn.dataset.idPaciente, 0);
      const row = state.rows.find((item) => item.idPaciente === idPaciente);
      if (!row || savingContactoSet.has(contactSaveKey(idPaciente))) return;

      hideCommentTooltip();
      const message = "Motivo / comentario de seguimiento (dejar vacio para borrarlo):";
      const value = typeof window.showSystemPrompt === "function"
        ? await window.showSystemPrompt(message, row.comentario || "", {
          title: `Comentario - ${row.NombreP || "Paciente"}`,
          type: "info"
        })
        : prompt(message, row.comentario || "");
      if (value === null || !isViewActive()) return;

      const comentario = String(value || "").trim();
      if (comentario.length > MAX_COMENTARIO) {
        alert(`El comentario no puede superar ${MAX_COMENTARIO} caracteres`);
        return;
      }
      if (comentario === row.comentario) return;
      await saveContactoRow(row, { comentario });
    });

    bind(refs.tbody, "mouseover", (e) => {
      if (!isViewActive()) return;
      const cell = e?.target?.closest?.(".ms-col-paciente.has-comment");
      if (!cell || cell === commentTooltipAnchor) return;
      const row = state.rows[toInt(cell.dataset.commentRowIndex, -1)];
      if (!row?.comentario) return;
      showCommentTooltip(cell, row);
    });

    bind(refs.tbody, "mouseout", (e) => {
      if (!commentTooltipAnchor) return;
      const next = e?.relatedTarget;
      if (next && commentTooltipAnchor.contains(next)) return;
      hideCommentTooltip();
    });

    bind(window, "scroll", hideCommentTooltip, { passive: true, capture: true });

    if (refs.inputFecha) refs.inputFecha.value = state.fechaCorte;
    if (refs.inputSearch) refs.inputSearch.value = state.q;
    if (refs.inputSegmento) refs.inputSegmento.value = state.segmentFilter;
    if (refs.inputTratamiento) refs.inputTratamiento.value = state.tratamientoFilter;
    if (refs.inputEstado) refs.inputEstado.value = state.estadoFilter;
    if (refs.pageSize) refs.pageSize.value = String(state.pageSize);
    if (refs.toggleNumeracion) refs.toggleNumeracion.checked = state.showNumeracion;
    if (refs.toggleSms) refs.toggleSms.checked = state.showSms;
    if (refs.toggleLlamada) refs.toggleLlamada.checked = state.showLlamada;
    if (refs.toggleProximaCita) refs.toggleProximaCita.checked = state.showProximaCita;

    persistMonitorUiState();
    renderAll();
    void refreshData();

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        isDisposed = true;
        if (commentTooltipEl) {
          commentTooltipEl.remove();
          commentTooltipEl = null;
          commentTooltipAnchor = null;
        }
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
