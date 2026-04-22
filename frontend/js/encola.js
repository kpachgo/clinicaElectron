// js/encola.js
(function () {
  const ESTADO_ESPERA = "En espera";
  const ESTADO_ATENDIDO = "Atendido";
  const AUTO_REFRESH_MS = 15000;
  const DOCTOR_COLOR_PALETTE = [
    { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
    { bg: "#dcfce7", border: "#86efac", text: "#166534" },
    { bg: "#ffedd5", border: "#fdba74", text: "#9a3412" },
    { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d" },
    { bg: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" },
    { bg: "#cffafe", border: "#67e8f9", text: "#155e75" },
    { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
    { bg: "#e0f2fe", border: "#7dd3fc", text: "#0c4a6e" },
    { bg: "#f3e8ff", border: "#d8b4fe", text: "#6b21a8" },
    { bg: "#fae8ff", border: "#f0abfc", text: "#86198f" }
  ];

  function normalizarTexto(value) {
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
  function renderFechaVisual(fechaTexto) {
    const txt = String(fechaTexto || "-").trim() || "-";
    if (typeof window.__rvRenderFecha === "function") {
      return window.__rvRenderFecha(txt);
    }
    return escapeHtml(txt);
  }
  function renderTratamientoVisual(value) {
    const txt = String(value || "").trim() || "Sin especificar";
    if (typeof window.__rvRenderProcedimiento === "function") {
      return window.__rvRenderProcedimiento(txt);
    }
    return escapeHtml(txt);
  }
  function soloDigitos(value) {
    return String(value || "").replace(/\D/g, "");
  }
  function renderIcon(name, className) {
    const registry = window.__uiIcons;
    if (!registry || typeof registry.get !== "function") return "";
    return registry.get(name, { className: className || "ui-action-icon" });
  }

  function getLocalTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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

  function normalizarItem(raw) {
    const estadoRaw = String(raw?.estado || "");
    const estado = estadoRaw === ESTADO_ATENDIDO ? ESTADO_ATENDIDO : ESTADO_ESPERA;
    const ordenRaw = Number(raw?.ordenCola || 0);
    const ordenCola = Number.isInteger(ordenRaw) && ordenRaw > 0 ? ordenRaw : null;
    return {
      idColaPaciente: Number(raw?.idColaPaciente || 0),
      idPaciente: Number(raw?.idPaciente || 0) || null,
      agendaId: Number(raw?.agendaId || 0) || null,
      doctorId: Number(raw?.doctorId || 0) || null,
      ordenCola,
      nombreDoctor: String(raw?.nombreDoctor || "").trim(),
      nombrePaciente: String(raw?.nombrePaciente || "").trim(),
      tratamiento: String(raw?.tratamiento || "").trim(),
      horaAgenda: String(raw?.horaAgenda || "").trim(),
      fechaAgendaISO: String(raw?.fechaAgendaISO || "").trim(),
      contacto: String(raw?.contacto || "").trim(),
      estado,
      creadoEn: String(raw?.creadoEn || ""),
      actualizadoEn: String(raw?.actualizadoEn || "")
    };
  }

  function getDateTime(value) {
    const ms = new Date(String(value || "")).getTime();
    if (!Number.isFinite(ms)) return Number.MAX_SAFE_INTEGER;
    return ms;
  }

  function compareColaItems(a, b) {
    if (a.estado !== b.estado) {
      return a.estado === ESTADO_ESPERA ? -1 : 1;
    }

    if (a.estado === ESTADO_ESPERA) {
      const ordenA = Number.isInteger(a.ordenCola) && a.ordenCola > 0
        ? a.ordenCola
        : Number.MAX_SAFE_INTEGER;
      const ordenB = Number.isInteger(b.ordenCola) && b.ordenCola > 0
        ? b.ordenCola
        : Number.MAX_SAFE_INTEGER;
      if (ordenA !== ordenB) return ordenA - ordenB;
    }

    const createdA = getDateTime(a.creadoEn);
    const createdB = getDateTime(b.creadoEn);
    if (createdA !== createdB) return createdA - createdB;

    return Number(a.idColaPaciente || 0) - Number(b.idColaPaciente || 0);
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      const message = json?.message || "Error de comunicacion con el servidor";
      throw new Error(message);
    }
    return json;
  }

  async function apiList(fechaISO, options = {}) {
    const fecha = String(fechaISO || "").trim();
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    const json = await fetchJson(`/api/cola${qs}`, {
      cache: "no-store",
      ...(options || {})
    });
    return Array.isArray(json.data) ? json.data.map(normalizarItem) : [];
  }

  function normalizarDoctor(raw) {
    const idDoctor = Number(raw?.idDoctor || 0);
    if (!Number.isInteger(idDoctor) || idDoctor <= 0) return null;
    const nombreD = String(raw?.nombreD || "").trim() || `Doctor ${idDoctor}`;
    return { idDoctor, nombreD };
  }

  async function apiListDoctores(options = {}) {
    const json = await fetchJson("/api/doctor/select", {
      cache: "no-store",
      ...(options || {})
    });
    const data = Array.isArray(json.data) ? json.data : [];
    return data.map(normalizarDoctor).filter(Boolean);
  }

  async function apiAddFromAgenda(payload) {
    const json = await fetchJson("/api/cola", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    return {
      ok: true,
      duplicated: !!json.duplicated,
      item: json.data ? normalizarItem(json.data) : null
    };
  }

  async function apiSetEstado(idColaPaciente, estado) {
    const id = Number(idColaPaciente || 0);
    if (!id) throw new Error("ID de cola invalido");
    const json = await fetchJson(`/api/cola/${id}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado })
    });
    return json.data ? normalizarItem(json.data) : null;
  }

  async function apiSetDoctor(idColaPaciente, doctorId) {
    const id = Number(idColaPaciente || 0);
    if (!id) throw new Error("ID de cola invalido");

    const body = {
      doctorId: doctorId === null || doctorId === undefined || doctorId === ""
        ? null
        : Number(doctorId)
    };

    const json = await fetchJson(`/api/cola/${id}/doctor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return json.data ? normalizarItem(json.data) : null;
  }

  async function apiSetTratamiento(idColaPaciente, tratamiento) {
    const id = Number(idColaPaciente || 0);
    if (!id) throw new Error("ID de cola invalido");

    const json = await fetchJson(`/api/cola/${id}/tratamiento`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tratamiento: String(tratamiento ?? "")
      })
    });
    return json.data ? normalizarItem(json.data) : null;
  }

  async function apiRemove(idColaPaciente) {
    const id = Number(idColaPaciente || 0);
    if (!id) throw new Error("ID de cola invalido");
    await fetchJson(`/api/cola/${id}`, { method: "DELETE" });
  }

  async function apiMover(idColaPaciente, direccion) {
    const id = Number(idColaPaciente || 0);
    if (!id) throw new Error("ID de cola invalido");
    const dir = String(direccion || "").trim().toLowerCase();
    if (dir !== "up" && dir !== "down") {
      throw new Error("Direccion invalida");
    }
    const json = await fetchJson(`/api/cola/${id}/mover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direccion: dir })
    });
    return json.data ? normalizarItem(json.data) : null;
  }

  async function apiClearAtendidos(fechaISO) {
    const fecha = String(fechaISO || "").trim();
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    await fetchJson(`/api/cola/atendidos${qs}`, { method: "DELETE" });
  }

  async function apiClearAll(fechaISO = "") {
    const fecha = String(fechaISO || "").trim();
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    await fetchJson(`/api/cola/todo${qs}`, { method: "DELETE" });
  }
  async function resolverPacienteId(item) {
    const idDirecto = Number(item?.idPaciente || 0);
    if (idDirecto > 0) return idDirecto;

    const nombreCola = String(item?.nombrePaciente || "").trim();
    if (!nombreCola) {
      throw new Error("El registro en cola no tiene nombre de paciente");
    }

    const res = await fetch(`/api/paciente/search?q=${encodeURIComponent(nombreCola)}`, {
      cache: "no-store"
    });
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];

    if (!json?.ok) {
      throw new Error(json?.message || "No se pudo buscar el paciente");
    }

    const exactos = data.filter((p) => {
      const nombrePaciente = String(p?.NombreP || "").trim();
      return normalizarTexto(nombrePaciente) === normalizarTexto(nombreCola);
    });

    if (!exactos.length) {
      throw new Error(`No existe un paciente registrado con nombre exacto: "${nombreCola}"`);
    }

    if (exactos.length === 1) {
      const id = Number(exactos[0]?.idPaciente || 0);
      if (!id) throw new Error("No se pudo resolver el paciente");
      return id;
    }

    const contactoCola = soloDigitos(item?.contacto || "");
    if (contactoCola) {
      const filtradosTelefono = exactos.filter((p) => {
        const tel = soloDigitos(p?.telefonoP || p?.TelefonoP || "");
        return tel && tel === contactoCola;
      });
      if (filtradosTelefono.length === 1) {
        const id = Number(filtradosTelefono[0]?.idPaciente || 0);
        if (!id) throw new Error("No se pudo resolver el paciente");
        return id;
      }
    }

    throw new Error("Hay multiples pacientes con ese nombre. Abra Paciente y seleccionelo manualmente.");
  }
  async function abrirPacienteDesdeCola(item) {
    const idPaciente = await resolverPacienteId(item);
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
      window.loadView("Paciente");
      return;
    }

    throw new Error("No se pudo abrir la vista Paciente");
  }

  function formatHora(hora) {
    const value = String(hora || "").trim();
    if (!value) return "-";
    const m = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return value;
    let hh = Number(m[1]);
    const mm = m[2];
    const period = hh >= 12 ? "pm" : "am";
    hh = hh % 12;
    if (hh === 0) hh = 12;
    return `${hh}:${mm} ${period}`;
  }

  function formatFecha(fechaISO) {
    const raw = String(fechaISO || "").trim();
    if (!raw) return "-";
    const [y, m, d] = raw.split("-");
    if (!y || !m || !d) return raw;
    return `${d}/${m}/${y}`;
  }

  function aplicarColorEstadoSelect(selectEl, estado) {
    if (!selectEl) return;
    selectEl.classList.remove("is-espera", "is-atendido");
    if (estado === ESTADO_ATENDIDO) {
      selectEl.classList.add("is-atendido");
      return;
    }
    selectEl.classList.add("is-espera");
  }

  function getDoctorColorById(doctorId) {
    const id = Number(doctorId || 0);
    if (!Number.isInteger(id) || id <= 0) return null;
    // Hash multiplicativo para evitar colisiones obvias (ej. 1 y 11) con modulo directo.
    const hashed = (id * 2654435761) >>> 0;
    return DOCTOR_COLOR_PALETTE[hashed % DOCTOR_COLOR_PALETTE.length];
  }

  function aplicarColorDoctorSelect(selectEl, selectedValue, includeTodos = false) {
    if (!selectEl) return;

    selectEl.classList.remove("is-doctor", "is-no-doctor", "is-all-doctors");
    selectEl.style.removeProperty("--doctor-bg");
    selectEl.style.removeProperty("--doctor-border");
    selectEl.style.removeProperty("--doctor-text");

    const raw = String(selectedValue ?? "").trim();
    if (includeTodos && raw === "") {
      selectEl.classList.add("is-all-doctors");
      return;
    }

    if (raw === "" || raw === "__none__") {
      selectEl.classList.add("is-no-doctor");
      return;
    }

    const color = getDoctorColorById(Number(raw));
    if (!color) {
      selectEl.classList.add("is-no-doctor");
      return;
    }

    selectEl.style.setProperty("--doctor-bg", color.bg);
    selectEl.style.setProperty("--doctor-border", color.border);
    selectEl.style.setProperty("--doctor-text", color.text);
    selectEl.classList.add("is-doctor");
  }

  function renderEnCola(container) {
    container.innerHTML = `
      <div class="cola-container">
        <div class="cola-header">
          <div class="cola-title-wrap">
            <h2 class="cola-title">En Cola</h2>
            <p class="cola-subtitle">Pacientes en espera y atendidos del dia</p>
          </div>
          <div class="cola-kpis">
            <div class="cola-kpi" id="cola-kpi-total">Total: 0</div>
            <div class="cola-kpi is-waiting" id="cola-kpi-espera">En espera: 0</div>
            <div class="cola-kpi is-done" id="cola-kpi-atendido">Atendidos: 0</div>
          </div>
        </div>

        <div class="cola-toolbar ui-toolbar">
          <label class="cola-toggle-numeracion" for="cola-toggle-numeracion">
            <input type="checkbox" id="cola-toggle-numeracion">
            Numeracion
          </label>
          <input class="ui-control ui-control-search" type="search" id="cola-search" placeholder="Buscar paciente o tratamiento">
          <select class="ui-control" id="cola-filter-estado">
            <option value="">Todos</option>
            <option value="${ESTADO_ESPERA}">${ESTADO_ESPERA}</option>
            <option value="${ESTADO_ATENDIDO}">${ESTADO_ATENDIDO}</option>
          </select>
          <select id="cola-filter-doctor" class="ui-control cola-doctor-select">
            <option value="">Todos los doctores</option>
          </select>
          <button id="cola-clear-atendidos" class="ui-toolbar-btn is-neutral" type="button">
            ${renderIcon("check-circle", "ui-toolbar-icon")}
            <span>Limpiar atendidos</span>
          </button>
          <button id="cola-clear-all" class="ui-toolbar-btn is-danger" type="button">
            ${renderIcon("trash", "ui-toolbar-icon")}
            <span>Borrar todo</span>
          </button>
        </div>

        <div class="cola-table-wrap ui-table-wrap-compact">
          <table class="cola-table ui-table-compact">
            <thead>
              <tr>
                <th class="cola-col-num">#</th>
                <th>Paciente</th>
                <th>Tratamiento</th>
                <th>Hora</th>
                <th>Fecha agenda</th>
                <th>Doctor</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="cola-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    const searchInput = container.querySelector("#cola-search");
    const toggleNumeracion = container.querySelector("#cola-toggle-numeracion");
    const filterEstado = container.querySelector("#cola-filter-estado");
    const filterDoctor = container.querySelector("#cola-filter-doctor");
    const colaTable = container.querySelector(".cola-table");
    const tbody = container.querySelector("#cola-tbody");
    const kpiTotal = container.querySelector("#cola-kpi-total");
    const kpiEspera = container.querySelector("#cola-kpi-espera");
    const kpiAtendido = container.querySelector("#cola-kpi-atendido");
    const btnClearAtendidos = container.querySelector("#cola-clear-atendidos");
    const btnClearAll = container.querySelector("#cola-clear-all");

    let colaData = [];
    let doctoresData = [];
    let refreshTimer = null;
    let visibilityHandlerBound = false;
    const fechaVista = getLocalTodayISO();
    let idsVistos = new Set();
    let cargaInicialCompleta = false;
    let isDisposed = false;
    let colaFetchSeq = 0;
    let colaFetchController = null;
    let doctorFetchSeq = 0;
    let doctorFetchController = null;
    let isClearingAtendidos = false;
    let isClearingAll = false;
    const pendingDoctorIds = new Set();
    const pendingEstadoIds = new Set();
    const colaUiStateKey = `ui_state_encola_${getUiStateUserId()}`;
    const colaUiState = {
      numeracion: false,
      ...loadSessionUiState(colaUiStateKey)
    };

    const persistColaUiState = () => {
      saveSessionUiState(colaUiStateKey, {
        numeracion: !!toggleNumeracion?.checked
      });
    };
    if (toggleNumeracion) {
      toggleNumeracion.checked = !!colaUiState.numeracion;
    }

    function abortControllerSafe(controller) {
      if (!controller) return;
      try {
        controller.abort();
      } catch {
        // ignore abort failures
      }
    }

    function notificarNuevosIngresos(nuevos) {
      if (!cargaInicialCompleta || nuevos <= 0) return;
      if (typeof window.playUiSound === "function") {
        window.playUiSound("bell", { minIntervalMs: 450 });
      }
    }
    function numeracionActiva() {
      return !!toggleNumeracion?.checked;
    }
    function getColaColspan() {
      return numeracionActiva() ? 8 : 7;
    }
    function aplicarVisibilidadNumeracion() {
      if (!colaTable) return;
      colaTable.classList.toggle("hide-numeracion", !numeracionActiva());
    }

    function getDoctorNombreById(doctorId) {
      const id = Number(doctorId || 0);
      if (!Number.isInteger(id) || id <= 0) return "";
      const encontrado = doctoresData.find((d) => Number(d.idDoctor || 0) === id);
      return String(encontrado?.nombreD || `Doctor ${id}`).trim();
    }

    async function cambiarDoctorItem(item, doctorId) {
      const rowId = Number(item?.idColaPaciente || 0);
      if (!rowId || isDisposed || pendingDoctorIds.has(rowId)) return false;

      const prevDoctorId = item.doctorId;
      const prevNombreDoctor = item.nombreDoctor;

      pendingDoctorIds.add(rowId);
      item.doctorId = doctorId;
      item.nombreDoctor = doctorId ? getDoctorNombreById(doctorId) : "";
      draw();

      try {
        const updated = await apiSetDoctor(rowId, doctorId);
        if (updated) Object.assign(item, updated);
        return true;
      } catch (err) {
        item.doctorId = prevDoctorId;
        item.nombreDoctor = prevNombreDoctor;
        throw err;
      } finally {
        pendingDoctorIds.delete(rowId);
        draw();
      }
    }

    async function cambiarEstadoItem(item, estadoObjetivo) {
      const rowId = Number(item?.idColaPaciente || 0);
      if (!rowId || isDisposed || pendingEstadoIds.has(rowId)) return false;

      const nextEstado = estadoObjetivo === ESTADO_ATENDIDO ? ESTADO_ATENDIDO : ESTADO_ESPERA;
      if (item.estado === nextEstado) return true;

      const prevEstado = item.estado;
      const prevOrden = item.ordenCola;
      const prevActualizadoEn = item.actualizadoEn;

      pendingEstadoIds.add(rowId);
      item.estado = nextEstado;
      if (nextEstado === ESTADO_ATENDIDO) {
        item.ordenCola = null;
      }
      draw();

      try {
        const updated = await apiSetEstado(rowId, nextEstado);
        if (updated) Object.assign(item, updated);
        return true;
      } catch (err) {
        item.estado = prevEstado;
        item.ordenCola = prevOrden;
        item.actualizadoEn = prevActualizadoEn;
        throw err;
      } finally {
        pendingEstadoIds.delete(rowId);
        draw();
        void recargar({ silent: true });
      }
    }

    function buildDoctorOptions(selectEl, selectedDoctorId = null, includeTodos = false) {
      if (!selectEl) return;
      const selected = Number(selectedDoctorId || 0) || null;

      selectEl.innerHTML = "";
      if (includeTodos) {
        const optTodos = document.createElement("option");
        optTodos.value = "";
        optTodos.textContent = "Todos los doctores";
        selectEl.appendChild(optTodos);

        const optSinDoctor = document.createElement("option");
        optSinDoctor.value = "__none__";
        optSinDoctor.textContent = "Sin doctor";
        selectEl.appendChild(optSinDoctor);
      } else {
        const optSinDoctor = document.createElement("option");
        optSinDoctor.value = "";
        optSinDoctor.textContent = "Sin doctor";
        selectEl.appendChild(optSinDoctor);
      }

      doctoresData.forEach((doc) => {
        const opt = document.createElement("option");
        opt.value = String(doc.idDoctor);
        opt.textContent = doc.nombreD;
        selectEl.appendChild(opt);
      });

      if (selected && !doctoresData.some((d) => d.idDoctor === selected)) {
        const optFallback = document.createElement("option");
        optFallback.value = String(selected);
        optFallback.textContent = `Doctor ${selected}`;
        selectEl.appendChild(optFallback);
      }

      if (includeTodos) {
        if (selected === null) {
          selectEl.value = "";
        } else {
          selectEl.value = String(selected);
        }
        aplicarColorDoctorSelect(selectEl, selectEl.value, true);
        return;
      }

      selectEl.value = selected ? String(selected) : "";
      aplicarColorDoctorSelect(selectEl, selectEl.value, false);
    }

    function draw() {
      aplicarVisibilidadNumeracion();
      const texto = normalizarTexto(searchInput?.value);
      const estadoSel = String(filterEstado?.value || "");
      const doctorSel = String(filterDoctor?.value || "");

      const ordenada = colaData
        .slice()
        .sort(compareColaItems);

      const esperaIdsOrden = ordenada
        .filter((item) => item.estado === ESTADO_ESPERA)
        .map((item) => Number(item.idColaPaciente || 0))
        .filter((id) => id > 0);
      const posicionEsperaById = new Map();
      esperaIdsOrden.forEach((id, idx) => {
        posicionEsperaById.set(id, idx + 1);
      });
      const totalEnEsperaOrden = esperaIdsOrden.length;

      const filtrada = ordenada.filter((item) => {
        if (estadoSel && item.estado !== estadoSel) return false;
        if (doctorSel === "__none__" && Number(item.doctorId || 0) > 0) return false;
        if (doctorSel !== "" && doctorSel !== "__none__" && Number(item.doctorId || 0) !== Number(doctorSel)) return false;
        if (!texto) return true;
        return (
          normalizarTexto(item.nombrePaciente).includes(texto) ||
          normalizarTexto(item.tratamiento).includes(texto)
        );
      });

      const total = colaData.length;
      const espera = colaData.filter((x) => x.estado === ESTADO_ESPERA).length;
      const atendidos = total - espera;
      if (kpiTotal) kpiTotal.textContent = `Total: ${total}`;
      if (kpiEspera) kpiEspera.textContent = `En espera: ${espera}`;
      if (kpiAtendido) kpiAtendido.textContent = `Atendidos: ${atendidos}`;
      if (btnClearAtendidos) btnClearAtendidos.disabled = atendidos === 0;
      if (btnClearAll) btnClearAll.disabled = total === 0;

      if (!tbody) return;
      tbody.innerHTML = "";

      if (!filtrada.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = getColaColspan();
        td.className = "cola-empty";
        td.textContent = "Sin pacientes en cola";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      filtrada.forEach((item, index) => {
        const tr = document.createElement("tr");
        if (item.estado === ESTADO_ATENDIDO) {
          tr.className = "cola-row cola-row-atendido is-atendido";
        } else {
          tr.className = "cola-row cola-row-espera";
        }

        const tdNum = document.createElement("td");
        tdNum.className = "cola-col-num";
        tdNum.textContent = String(index + 1);
        tr.appendChild(tdNum);

        const tdNombre = document.createElement("td");
        tdNombre.textContent = item.nombrePaciente || "-";
        tr.appendChild(tdNombre);

        const tdTratamiento = document.createElement("td");
        const tratamientoText = document.createElement("div");
        tratamientoText.className = "cola-tratamiento-text";

        const pintarTratamiento = (value) => {
          const txt = String(value || "").trim();
          tratamientoText.innerHTML = renderTratamientoVisual(txt);
          if (txt) {
            tratamientoText.title = txt;
          } else {
            tratamientoText.removeAttribute("title");
          }
        };

        pintarTratamiento(item.tratamiento);
        tratamientoText.addEventListener("dblclick", () => {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "cola-tratamiento-edit";
          input.value = String(item.tratamiento || "");
          const valorOriginal = String(item.tratamiento || "").trim();

          tdTratamiento.replaceChild(input, tratamientoText);
          input.focus();
          input.select();

          let isSavingTratamiento = false;
          let isClosedTratamiento = false;

          function closeTratamientoEditor(value) {
            if (isClosedTratamiento) return;
            isClosedTratamiento = true;
            pintarTratamiento(value);
            if (input.isConnected) {
              tdTratamiento.replaceChild(tratamientoText, input);
            }
          }

          async function saveTratamiento() {
            if (isSavingTratamiento || isClosedTratamiento) return;
            isSavingTratamiento = true;

            const nuevoTratamiento = input.value.trim();
            if (nuevoTratamiento === valorOriginal) {
              closeTratamientoEditor(valorOriginal);
              isSavingTratamiento = false;
              return;
            }

            item.tratamiento = nuevoTratamiento;
            closeTratamientoEditor(nuevoTratamiento);

            try {
              await apiSetTratamiento(item.idColaPaciente, nuevoTratamiento);
              await recargar();
            } catch (err) {
              item.tratamiento = valorOriginal;
              pintarTratamiento(valorOriginal);
              alert(err.message || "No se pudo guardar el tratamiento");
            } finally {
              isSavingTratamiento = false;
            }
          }

          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveTratamiento();
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              if (isClosedTratamiento) return;
              item.tratamiento = valorOriginal;
              closeTratamientoEditor(valorOriginal);
            }
          });

          input.addEventListener("blur", saveTratamiento);
        });

        tdTratamiento.appendChild(tratamientoText);
        tr.appendChild(tdTratamiento);

        const tdHora = document.createElement("td");
        tdHora.textContent = formatHora(item.horaAgenda);
        tr.appendChild(tdHora);

        const tdFechaAgenda = document.createElement("td");
        tdFechaAgenda.innerHTML = renderFechaVisual(formatFecha(item.fechaAgendaISO));
        tr.appendChild(tdFechaAgenda);

        const tdDoctor = document.createElement("td");
        const selDoctor = document.createElement("select");
        selDoctor.className = "cola-doctor-select";
        buildDoctorOptions(selDoctor, item.doctorId);
        if (pendingDoctorIds.has(item.idColaPaciente)) {
          selDoctor.disabled = true;
        }
        selDoctor.addEventListener("change", async () => {
          if (pendingDoctorIds.has(item.idColaPaciente) || isDisposed) return;
          const doctorRaw = String(selDoctor.value || "");
          const doctorId = doctorRaw === "" ? null : Number(doctorRaw);
          if (doctorId !== null && (!Number.isInteger(doctorId) || doctorId <= 0)) {
            alert("Doctor invalido");
            draw();
            return;
          }

          try {
            await cambiarDoctorItem(item, doctorId);
          } catch (err) {
            alert(err.message || "No se pudo asignar doctor");
            draw();
          }
        });
        tdDoctor.appendChild(selDoctor);
        tr.appendChild(tdDoctor);

        const tdEstado = document.createElement("td");
        const selEstado = document.createElement("select");
        selEstado.className = "cola-estado-select";
        [ESTADO_ESPERA, ESTADO_ATENDIDO].forEach((estadoOption) => {
          const opt = document.createElement("option");
          opt.value = estadoOption;
          opt.textContent = estadoOption;
          opt.selected = item.estado === estadoOption;
          selEstado.appendChild(opt);
        });
        aplicarColorEstadoSelect(selEstado, item.estado);
        if (pendingEstadoIds.has(item.idColaPaciente)) {
          selEstado.disabled = true;
        }
        selEstado.addEventListener("change", async () => {
          if (pendingEstadoIds.has(item.idColaPaciente) || isDisposed) return;
          const estadoObjetivo = selEstado.value === ESTADO_ATENDIDO ? ESTADO_ATENDIDO : ESTADO_ESPERA;
          try {
            await cambiarEstadoItem(item, estadoObjetivo);
          } catch (err) {
            alert(err.message || "No se pudo actualizar el estado");
            draw();
          }
        });
        tdEstado.appendChild(selEstado);
        tr.appendChild(tdEstado);

        const tdAcciones = document.createElement("td");
        tdAcciones.className = "cola-col-acciones";
        const actions = document.createElement("div");
        actions.className = "cola-actions ui-action-group";
        const isEnEspera = item.estado === ESTADO_ESPERA;
        const posicionEnEspera = Number(posicionEsperaById.get(item.idColaPaciente) || 0);
        const puedeSubir = isEnEspera && posicionEnEspera > 1;
        const puedeBajar = isEnEspera && posicionEnEspera > 0 && posicionEnEspera < totalEnEsperaOrden;

        let isMovingPosicion = false;
        const btnMoveUp = document.createElement("button");
        const btnMoveDown = document.createElement("button");

        function setMoveButtonsDisabled(disabled) {
          btnMoveUp.disabled = !!disabled || !puedeSubir;
          btnMoveDown.disabled = !!disabled || !puedeBajar;
        }

        if (isEnEspera) {
          btnMoveUp.type = "button";
          btnMoveUp.className = "ui-action-btn is-info cola-btn-move-up";
          btnMoveUp.innerHTML = renderIcon("arrow-up");
          btnMoveUp.title = "Subir en cola";
          btnMoveUp.setAttribute("aria-label", "Subir en cola");

          btnMoveDown.type = "button";
          btnMoveDown.className = "ui-action-btn is-info cola-btn-move-down";
          btnMoveDown.innerHTML = renderIcon("arrow-down");
          btnMoveDown.title = "Bajar en cola";
          btnMoveDown.setAttribute("aria-label", "Bajar en cola");

          setMoveButtonsDisabled(false);

          const moverPosicion = async (direccion) => {
            if (isMovingPosicion || isDisposed) return;
            isMovingPosicion = true;
            setMoveButtonsDisabled(true);
            try {
              await apiMover(item.idColaPaciente, direccion);
              await recargar();
            } catch (err) {
              alert(err.message || "No se pudo mover el paciente en la cola");
            } finally {
              isMovingPosicion = false;
              if (btnMoveUp.isConnected && btnMoveDown.isConnected) {
                setMoveButtonsDisabled(false);
              }
            }
          };

          btnMoveUp.addEventListener("click", () => {
            if (!puedeSubir) return;
            moverPosicion("up");
          });

          btnMoveDown.addEventListener("click", () => {
            if (!puedeBajar) return;
            moverPosicion("down");
          });
        }

        const btnToggle = document.createElement("button");
        btnToggle.type = "button";
        const isAtendido = item.estado === ESTADO_ATENDIDO;
        btnToggle.className = `ui-action-btn ${isAtendido ? "is-info" : "is-success"} cola-btn-toggle`;
        btnToggle.innerHTML = isAtendido
          ? renderIcon("arrow-path")
          : renderIcon("check");
        btnToggle.title = isAtendido ? "Reabrir" : "Atender";
        btnToggle.setAttribute("aria-label", isAtendido ? "Reabrir paciente" : "Marcar como atendido");
        if (pendingEstadoIds.has(item.idColaPaciente)) {
          btnToggle.disabled = true;
        }
        btnToggle.addEventListener("click", async () => {
          if (pendingEstadoIds.has(item.idColaPaciente) || isDisposed) return;
          try {
            const siguienteEstado = item.estado === ESTADO_ATENDIDO ? ESTADO_ESPERA : ESTADO_ATENDIDO;
            await cambiarEstadoItem(item, siguienteEstado);
          } catch (err) {
            alert(err.message || "No se pudo cambiar el estado");
            draw();
          }
        });

        const btnBuscar = document.createElement("button");
        btnBuscar.type = "button";
        btnBuscar.className = "ui-action-btn is-primary cola-btn-open";
        btnBuscar.innerHTML = renderIcon("magnifying-glass");
        btnBuscar.title = "Abrir en Paciente";
        btnBuscar.setAttribute("aria-label", "Buscar paciente");
        btnBuscar.addEventListener("click", async () => {
          btnBuscar.disabled = true;
          try {
            await abrirPacienteDesdeCola(item);
          } catch (err) {
            const message = String(err?.message || "No se pudo abrir el paciente");
            const pacienteApi = window.__pacienteViewAPI;
            if (pacienteApi && typeof pacienteApi.openManualSearch === "function") {
              const ok = await pacienteApi.openManualSearch({
                query: String(item?.nombrePaciente || ""),
                contacto: String(item?.contacto || ""),
                message
              });
              if (!ok) {
                alert(`${message}\nNo se pudo abrir la vista Paciente para buscar manualmente.`);
              }
            } else {
              alert(`${message}\nAbra la vista Paciente y busque manualmente.`);
            }
          } finally {
            btnBuscar.disabled = false;
          }
        });

        const btnRemove = document.createElement("button");
        btnRemove.type = "button";
        btnRemove.className = "ui-action-btn is-danger cola-btn-remove";
        btnRemove.innerHTML = renderIcon("trash");
        btnRemove.title = "Eliminar";
        btnRemove.setAttribute("aria-label", "Eliminar paciente de cola");
        let isRemoving = false;
        btnRemove.addEventListener("click", async () => {
          if (isRemoving || isDisposed) return;
          isRemoving = true;
          btnRemove.disabled = true;
          const ok = typeof window.showSystemConfirm === "function"
            ? await window.showSystemConfirm("Eliminar este paciente de la cola?")
            : confirm("Eliminar este paciente de la cola?");
          if (!ok) {
            isRemoving = false;
            if (btnRemove.isConnected) {
              btnRemove.disabled = false;
            }
            return;
          }
          try {
            await apiRemove(item.idColaPaciente);
            await recargar();
          } catch (err) {
            alert(err.message || "No se pudo eliminar");
          } finally {
            isRemoving = false;
            if (btnRemove.isConnected) {
              btnRemove.disabled = false;
            }
          }
        });

        if (isEnEspera) {
          actions.appendChild(btnMoveUp);
          actions.appendChild(btnMoveDown);
        }
        actions.appendChild(btnBuscar);
        actions.appendChild(btnToggle);
        actions.appendChild(btnRemove);
        tdAcciones.appendChild(actions);
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
      });
    }

    async function recargar(options = {}) {
      if (isDisposed) return;
      const silent = !!options.silent;
      const networkMode = options.background === true ? "background" : "foreground";
      abortControllerSafe(colaFetchController);
      const localSeq = ++colaFetchSeq;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      colaFetchController = controller;
      const requestOptions = controller ? { signal: controller.signal } : {};
      if (networkMode === "background") {
        requestOptions.__networkMode = "background";
      }
      let dataNueva = null;
      try {
        dataNueva = await apiList(
          fechaVista,
          requestOptions
        );
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (isDisposed || localSeq !== colaFetchSeq) return;
        if (!silent) {
          colaData = [];
          draw();
          alert(err.message || "No se pudo cargar la cola");
        }
        return;
      } finally {
        if (colaFetchController === controller) {
          colaFetchController = null;
        }
      }
      if (isDisposed || localSeq !== colaFetchSeq) return;

      const idsNuevos = new Set();
      let ingresosNuevos = 0;
      (Array.isArray(dataNueva) ? dataNueva : []).forEach((item) => {
        const id = Number(item?.idColaPaciente || 0);
        if (id <= 0) return;
        idsNuevos.add(id);
        if (!idsVistos.has(id)) {
          ingresosNuevos += 1;
        }
      });

      colaData = Array.isArray(dataNueva) ? dataNueva : [];
      notificarNuevosIngresos(ingresosNuevos);
      idsVistos = idsNuevos;
      cargaInicialCompleta = true;
      draw();
    }

    function runBackgroundRefresh() {
      if (isDisposed) return;
      if (document.visibilityState === "hidden") return;
      void recargar({ silent: true, background: true });
    }

    async function recargarDoctores() {
      if (isDisposed) return;
      abortControllerSafe(doctorFetchController);
      const localSeq = ++doctorFetchSeq;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      doctorFetchController = controller;
      try {
        doctoresData = await apiListDoctores(
          controller ? { signal: controller.signal } : undefined
        );
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (isDisposed || localSeq !== doctorFetchSeq) return;
        doctoresData = [];
        console.error("No se pudieron cargar doctores para cola", err);
      } finally {
        if (doctorFetchController === controller) {
          doctorFetchController = null;
        }
      }
      if (isDisposed || localSeq !== doctorFetchSeq) return;

      const doctorSelActual = (() => {
        if (!filterDoctor) return "";
        return String(filterDoctor.value || "");
      })();

      buildDoctorOptions(
        filterDoctor,
        doctorSelActual === "__none__" || doctorSelActual === "" ? null : Number(doctorSelActual),
        true
      );

      if (filterDoctor && doctorSelActual === "__none__") {
        filterDoctor.value = "__none__";
        aplicarColorDoctorSelect(filterDoctor, filterDoctor.value, true);
      }
    }

    searchInput?.addEventListener("input", draw);
    toggleNumeracion?.addEventListener("change", () => {
      aplicarVisibilidadNumeracion();
      draw();
      persistColaUiState();
    });
    filterEstado?.addEventListener("change", draw);
    filterDoctor?.addEventListener("change", () => {
      aplicarColorDoctorSelect(filterDoctor, filterDoctor.value, true);
      draw();
    });
    btnClearAtendidos?.addEventListener("click", async () => {
      if (isClearingAtendidos || isDisposed) return;
      isClearingAtendidos = true;
      btnClearAtendidos.disabled = true;
      const ok = typeof window.showSystemConfirm === "function"
        ? await window.showSystemConfirm("Eliminar todos los pacientes atendidos de la cola?")
        : confirm("Eliminar todos los pacientes atendidos de la cola?");
      if (!ok) {
        isClearingAtendidos = false;
        if (btnClearAtendidos.isConnected) {
          btnClearAtendidos.disabled = false;
        }
        return;
      }
      try {
        await apiClearAtendidos(fechaVista);
        await recargar();
      } catch (err) {
        alert(err.message || "No se pudo limpiar atendidos");
      } finally {
        isClearingAtendidos = false;
        if (btnClearAtendidos.isConnected) {
          btnClearAtendidos.disabled = false;
        }
      }
    });
    btnClearAll?.addEventListener("click", async () => {
      if (isClearingAll || isDisposed) return;
      isClearingAll = true;
      btnClearAll.disabled = true;
      const ok = typeof window.showSystemConfirm === "function"
        ? await window.showSystemConfirm("Borrar todo el contenido de la cola del dia de hoy?")
        : confirm("Borrar todo el contenido de la cola del dia de hoy?");
      if (!ok) {
        isClearingAll = false;
        if (btnClearAll.isConnected) {
          btnClearAll.disabled = false;
        }
        return;
      }
      try {
        await apiClearAll(fechaVista);
        await recargar();
      } catch (err) {
        alert(err.message || "No se pudo borrar la cola");
      } finally {
        isClearingAll = false;
        if (btnClearAll.isConnected) {
          btnClearAll.disabled = false;
        }
      }
    });

    const onVisibilityChange = () => {
      if (isDisposed) return;
      if (document.visibilityState === "visible") {
        runBackgroundRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityHandlerBound = true;

    refreshTimer = window.setInterval(runBackgroundRefresh, AUTO_REFRESH_MS);

    aplicarVisibilidadNumeracion();
    persistColaUiState();
    recargarDoctores().finally(() => {
      recargar();
    });

    return () => {
      isDisposed = true;
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (visibilityHandlerBound) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        visibilityHandlerBound = false;
      }
      abortControllerSafe(colaFetchController);
      abortControllerSafe(doctorFetchController);
      colaFetchController = null;
      doctorFetchController = null;
      colaFetchSeq += 1;
      doctorFetchSeq += 1;
    };
  }

  function mountEnCola() {
    const content = document.querySelector(".content");
    if (!content) return;
    const cleanup = renderEnCola(content);

    if (typeof window.__setViewCleanup === "function") {
      window.__setViewCleanup(cleanup);
    }
  }

  window.__colaPacienteAPI = {
    addFromAgenda: async (payload) => apiAddFromAgenda(payload)
  };

  window.__mountEnCola = mountEnCola;
})();
