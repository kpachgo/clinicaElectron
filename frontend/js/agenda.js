// js/agenda.js
(function () {
  // ============ DATOS DE EJEMPLO=====================
  const agendaData = [];
  const estados = ["Pendiente", "Confirmado", "Cancelado", "Reprogramado", "No contesta", "IGS"];
  // ============UTILS===========================
  function formatTime12(hm) {
    const [hh, mm] = hm.split(":").map(Number);
    const period = hh >= 12 ? "pm" : "am";
    let hour = hh % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${mm.toString().padStart(2, "0")} ${period}`;
  }
  function ddmmyyyyToISO(ddmmyyyy) {
    const [d, m, y] = ddmmyyyy.split("/");
    return `${y}-${m}-${d}`;
  }
  function isoToDDMMYYYY(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  function getLocalTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
  function normalizarTexto(value) {
    return String(value || "").trim().toLowerCase();
  }
  function normalizarTextoCruce(value) {
    const raw = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!raw) return "";
    return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function normalizarBanderaContacto(value) {
    if (value === true) return true;
    if (value === false) return false;
    const num = Number(value);
    if (num === 1) return true;
    if (num === 0) return false;
    const raw = String(value || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "si" || raw === "sí";
  }
  function isTokenChar(ch) {
    return /[A-Za-z0-9\u00C1\u00C9\u00CD\u00D3\u00DA\u00E1\u00E9\u00ED\u00F3\u00FA\u00D1\u00F1\u00DC\u00FC]/.test(String(ch || ""));
  }
  function getTokenInfoFromCaret(inputEl) {
    if (!inputEl) {
      return { query: "", start: 0, end: 0 };
    }

    const value = String(inputEl.value || "");
    const rawStart = Number(inputEl.selectionStart);
    const rawEnd = Number(inputEl.selectionEnd);
    const selStart = Number.isInteger(rawStart) ? rawStart : value.length;
    const selEnd = Number.isInteger(rawEnd) ? rawEnd : selStart;

    if (selEnd > selStart) {
      return {
        query: value.slice(selStart, selEnd).trim(),
        start: selStart,
        end: selEnd
      };
    }

    let start = selStart;
    let end = selStart;
    while (start > 0 && isTokenChar(value[start - 1])) start--;
    while (end < value.length && isTokenChar(value[end])) end++;

    return {
      query: value.slice(start, end).trim(),
      start,
      end
    };
  }
  function soloDigitos(value) {
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
  function getAgendaHeroIcon(iconName) {
    const base = 'class="agenda-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false"';
    switch (iconName) {
      case "queue-list":
        return `<svg ${base}><path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12"></path><path d="M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z"></path></svg>`;
      case "document-duplicate":
        return `<svg ${base}><path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125H6.375a1.125 1.125 0 0 1-1.125-1.125V8.25c0-.621.504-1.125 1.125-1.125H9.75"></path><path d="M15 3.75H9.75a1.5 1.5 0 0 0-1.5 1.5v8.25c0 .828.672 1.5 1.5 1.5H15a1.5 1.5 0 0 0 1.5-1.5V5.25A1.5 1.5 0 0 0 15 3.75Z"></path></svg>`;
      case "currency-dollar":
        return `<svg ${base}><path d="M12 3v18m0-18c-2.25 0-3.75 1.5-3.75 3.375S9.75 9.75 12 9.75s3.75 1.5 3.75 3.375S14.25 16.5 12 16.5m0-13.5c2.25 0 3.75 1.5 3.75 3.375M12 16.5c-2.25 0-3.75-1.5-3.75-3.375"></path></svg>`;
      case "magnifying-glass":
        return `<svg ${base}><path d="m21 21-4.35-4.35"></path><circle cx="11" cy="11" r="6.5"></circle></svg>`;
      case "trash":
        return `<svg ${base}><path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0V4.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201V5.393m7.5 0a48.667 48.667 0 0 0-7.5 0"></path></svg>`;
      case "plus":
        return `<svg ${base}><path d="M12 4.5v15m7.5-7.5h-15"></path></svg>`;
      case "chat-bubble-left-right":
        return `<svg ${base}><path d="M2.25 12c0-4.97 4.03-9 9-9h1.5c4.97 0 9 4.03 9 9s-4.03 9-9 9h-3.25l-3.5 2v-2.7A8.95 8.95 0 0 1 2.25 12Z"></path><path d="M8.25 12h.008v.008H8.25V12Zm3.75 0h.008v.008H12V12Zm3.75 0h.008v.008H15.75V12Z"></path></svg>`;
      case "phone":
        return `<svg ${base}><path d="M2.25 4.5a1.5 1.5 0 0 1 1.5-1.5h2.6a1.5 1.5 0 0 1 1.48 1.26l.41 2.46a1.5 1.5 0 0 1-.43 1.31l-1.2 1.2a13.5 13.5 0 0 0 6.16 6.16l1.2-1.2a1.5 1.5 0 0 1 1.31-.43l2.46.41A1.5 1.5 0 0 1 21 17.65v2.6a1.5 1.5 0 0 1-1.5 1.5h-.75C9.94 21.75 2.25 14.06 2.25 4.5v0Z"></path></svg>`;
      case "building-office":
        return `<svg ${base}><path d="M3.75 21h16.5M6 21V6.75A1.5 1.5 0 0 1 7.5 5.25h9A1.5 1.5 0 0 1 18 6.75V21"></path><path d="M9 9h.008v.008H9V9Zm0 3h.008v.008H9V12Zm0 3h.008v.008H9V15Zm3-6h.008v.008H12V9Zm0 3h.008v.008H12V12Zm0 3h.008v.008H12V15Zm3-6h.008v.008H15V9Zm0 3h.008v.008H15V12Zm0 3h.008v.008H15V15Z"></path></svg>`;
      default:
        return `<svg ${base}><path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12"></path></svg>`;
    }
  }
  function renderAgendaNombreCell(td, nombre) {
    if (!td) return;
    td.textContent = String(nombre || "").trim();
  }
  function renderFechaVisual(fechaTexto) {
    const txt = String(fechaTexto || "-").trim() || "-";
    if (typeof window.__rvRenderFecha === "function") {
      return window.__rvRenderFecha(txt);
    }
    return escapeHtml(txt);
  }
  function renderComentarioVisual(comentario) {
    const txt = String(comentario || "").trim();
    if (!txt) return "";
    if (typeof window.__rvRenderProcedimiento === "function") {
      return window.__rvRenderProcedimiento(txt);
    }
    return escapeHtml(txt);
  }
  function pintarComentarioVisual(el, comentario) {
    if (!el) return;
    const txt = String(comentario || "").trim();
    if (!txt) {
      el.textContent = "";
      el.removeAttribute("title");
      return;
    }
    el.innerHTML = renderComentarioVisual(txt);
    el.title = txt;
  }
  function formatearTelefonoParaPaciente(raw) {
    const original = String(raw || "").trim();
    if (!original) return "";
    if (/[a-zA-Z]/.test(original)) return original;

    const digitos = soloDigitos(original);
    if (digitos.length === 8) {
      return `${digitos.slice(0, 4)} ${digitos.slice(4)}`;
    }
    return original;
  }
  async function resolverPacienteIdDesdeAgenda(item) {
    const nombreAgenda = String(item?.nombre || "").trim();
    if (!nombreAgenda) {
      throw new Error("La cita no tiene nombre de paciente");
    }

    const res = await fetch(`/api/paciente/search?q=${encodeURIComponent(nombreAgenda)}`, {
      cache: "no-store"
    });
    const json = await res.json();
    const data = Array.isArray(json?.data) ? json.data : [];

    if (!json?.ok) {
      throw new Error(json?.message || "No se pudo buscar el paciente");
    }

    const exactos = data.filter((p) => {
      const nombrePaciente = String(p?.NombreP || "").trim();
      return normalizarTexto(nombrePaciente) === normalizarTexto(nombreAgenda);
    });

    if (!exactos.length) {
      throw new Error(`No existe un paciente registrado con nombre exacto: "${nombreAgenda}"`);
    }

    if (exactos.length === 1) {
      const id = Number(exactos[0]?.idPaciente || 0);
      if (!id) throw new Error("No se pudo resolver el paciente");
      return id;
    }

    const contactoAgenda = soloDigitos(item?.contacto || "");
    if (contactoAgenda) {
      const filtradosTelefono = exactos.filter((p) => {
        const tel = soloDigitos(p?.telefonoP || p?.TelefonoP || "");
        return tel && tel === contactoAgenda;
      });
      if (filtradosTelefono.length === 1) {
        const id = Number(filtradosTelefono[0]?.idPaciente || 0);
        if (!id) throw new Error("No se pudo resolver el paciente");
        return id;
      }
    }

    throw new Error("Hay multiples pacientes con ese nombre. Abra Paciente y seleccionelo manualmente.");
  }
  async function abrirPacienteDesdeAgenda(item) {
    const idPaciente = await resolverPacienteIdDesdeAgenda(item);
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
  async function abrirBusquedaManualPacienteDesdeAgenda(item, message) {
    const pacienteApi = window.__pacienteViewAPI;
    if (!pacienteApi || typeof pacienteApi.openManualSearch !== "function") {
      return false;
    }

    const ok = await pacienteApi.openManualSearch({
      query: String(item?.nombre || ""),
      contacto: String(item?.contacto || ""),
      message: String(message || "")
    });
    return !!ok;
  }
  function estadoClassName(estado) {
  if (!estado || estado === "Pendiente") return "estado-pendiente";

    switch (estado.toLowerCase()) {
    case "confirmado": return "estado-confirmado";
    case "cancelado": return "estado-cancelado";
    case "reprogramado": return "estado-reprogramado";
    case "no contesta": return "estado-no-contesta";
    case "igs": return "estado-igs";
    default: return "";
  }
}
  const NOMBRE_ESTADO_CLASSNAMES = [
    "agenda-nombre-estado-pendiente",
    "agenda-nombre-estado-confirmado",
    "agenda-nombre-estado-cancelado",
    "agenda-nombre-estado-reprogramado",
    "agenda-nombre-estado-no-contesta",
    "agenda-nombre-estado-igs"
  ];
  const FILA_ESTADO_CLASSNAMES = [
    "agenda-row-estado-pendiente",
    "agenda-row-estado-confirmado",
    "agenda-row-estado-cancelado",
    "agenda-row-estado-reprogramado",
    "agenda-row-estado-no-contesta",
    "agenda-row-estado-igs"
  ];
  function nombreEstadoClassName(estado) {
    const raw = String(estado || "Pendiente").trim().toLowerCase();
    switch (raw) {
      case "confirmado": return "agenda-nombre-estado-confirmado";
      case "cancelado": return "agenda-nombre-estado-cancelado";
      case "reprogramado": return "agenda-nombre-estado-reprogramado";
      case "no contesta": return "agenda-nombre-estado-no-contesta";
      case "igs": return "agenda-nombre-estado-igs";
      default: return "agenda-nombre-estado-pendiente";
    }
  }
  function aplicarRefuerzoVisualNombre(cell, estado) {
    if (!cell) return;
    cell.classList.add("agenda-nombre-cell");
    NOMBRE_ESTADO_CLASSNAMES.forEach((cls) => cell.classList.remove(cls));
    cell.classList.add(nombreEstadoClassName(estado));
  }
  function filaEstadoClassName(estado) {
    const raw = String(estado || "Pendiente").trim().toLowerCase();
    switch (raw) {
      case "confirmado": return "agenda-row-estado-confirmado";
      case "cancelado": return "agenda-row-estado-cancelado";
      case "reprogramado": return "agenda-row-estado-reprogramado";
      case "no contesta": return "agenda-row-estado-no-contesta";
      case "igs": return "agenda-row-estado-igs";
      default: return "agenda-row-estado-pendiente";
    }
  }
  function aplicarRefuerzoVisualFila(row, estado) {
    if (!row) return;
    row.classList.add("agenda-row");
    FILA_ESTADO_CLASSNAMES.forEach((cls) => row.classList.remove(cls));
    row.classList.add(filaEstadoClassName(estado));
  }
  function renderEstadoSelect(value) {
  const sel = document.createElement("select");
  sel.className = "select-estado " + estadoClassName(value || "Pendiente");

  estados.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;

    // si value es null / "" -> Pendiente queda seleccionado
    if ((value || "Pendiente") === opt.value) opt.selected = true;

    sel.appendChild(opt);
  });

  return sel;
}
  // ----- AUTOFORMATEO DE HORA -----
  function autoFormatearBasico(v) {

    if (!v) return "";

    v = v.trim().toLowerCase().replace(/\s+/g, "");

    if (/^\d{1,2}:\d{2}(am|pm)$/.test(v)) {
      let hr = v.split(":")[0];
      let mn = v.split(":")[1].substring(0, 2);
      let mer = v.endsWith("am") ? "am" : "pm";
      return `${hr}:${mn} ${mer}`;
    }

    if (/^\d{1,2}(am|pm)$/.test(v)) {
      let hr = v.replace(/(am|pm)/, "");
      let mer = v.endsWith("am") ? "am" : "pm";
      return `${hr}:00 ${mer}`;
    }

    if (/^\d{1,4}[ap]$/.test(v)) {
      let mer = v.endsWith("a") ? "am" : "pm";
      let num = v.slice(0, -1);

      if (num.length === 1) return `${num}:00 ${mer}`;
      if (num.length === 3) return `${num[0]}:${num.slice(1)} ${mer}`;
      if (num.length === 4) return `${num.slice(0, 2)}:${num.slice(2)} ${mer}`;
    }

    if (/^\d{1,2}:\d{2}$/.test(v)) {
      let [hr, mn] = v.split(":").map(Number);
      let mer = (hr === 12) ? "pm" : (hr <= 6 ? "pm" : "am");
      return `${hr}:${mn.toString().padStart(2, "0")} ${mer}`;
    }

    if (/^\d{1,2}$/.test(v)) {
      let hr = Number(v);
      let mn = "00";
      let mer = (hr === 12) ? "pm" : (hr <= 6 ? "pm" : "am");
      return `${hr}:${mn} ${mer}`;
    }

    if (/^\d{3,4}$/.test(v)) {
      let hr, mn;
      if (v.length === 3) { hr = Number(v[0]); mn = v.slice(1); }
      else { hr = Number(v.slice(0, 2)); mn = v.slice(2); }

      let mer = (hr === 12) ? "pm" : (hr <= 6 ? "pm" : "am");
      return `${hr}:${mn} ${mer}`;
    }

    return v;
  }
  function validarHora(texto) {
    const regex = /^(\d{1,2}):(\d{2}) (am|pm)$/i;
    const m = texto.trim().toLowerCase().match(regex);
    if (!m) return false;

    let hr = Number(m[1]);
    let mn = Number(m[2]);

    return hr >= 1 && hr <= 12 && mn >= 0 && mn <= 59;
  }
  function to24(h) {
    let [time, mer] = h.split(" ");
    let [hr, mn] = time.split(":").map(Number);
    if (mer === "pm" && hr !== 12) hr += 12;
    if (mer === "am" && hr === 12) hr = 0;
    return `${String(hr).padStart(2,"0")}:${String(mn).padStart(2,"0")}`;
  }
  const HORA_VISUAL_SLOT_COUNT = 8;
  function getHoraVisualSlotIndex(hm) {
    const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;

    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

    const slot = (hh * 2) + Math.floor(mm / 30);
    return slot % HORA_VISUAL_SLOT_COUNT;
  }
  function aplicarRefuerzoVisualHora(cell, hm) {
    if (!cell) return;
    cell.classList.add("agenda-hora-cell");
    cell.classList.remove("agenda-hora-slot-default");
    for (let i = 0; i < HORA_VISUAL_SLOT_COUNT; i++) {
      cell.classList.remove(`agenda-hora-slot-${i}`);
    }

    const slot = getHoraVisualSlotIndex(hm);
    if (slot === null) {
      cell.classList.add("agenda-hora-slot-default");
      return;
    }
    cell.classList.add(`agenda-hora-slot-${slot}`);
  }
  function normalizarAgendaRow(item, fechaFallbackISO, anclarFechaSeleccionada = false) {
    const fechaRaw = String(item?.fechaAP || "");
    const fechaItemISO = fechaRaw ? fechaRaw.split("T")[0] : String(fechaFallbackISO || "");
    const fechaRenderISO = fechaItemISO || String(fechaFallbackISO || "");

    return {
      idAgendaAP: item.idAgendaAP,
      nombre: item.nombreAP,
      hora: to24(autoFormatearBasico(item.horaAP)),
      fecha: isoToDDMMYYYY(fechaRenderISO),
      _fechaISO: anclarFechaSeleccionada ? String(fechaFallbackISO || "") : fechaRenderISO,
      contacto: item.contactoAP,
      estado: item.estadoAP || "Pendiente",
      comentario: item.comentarioAP,
      sms: normalizarBanderaContacto(item.smsAP),
      llamada: normalizarBanderaContacto(item.llamadaAP),
      presente: normalizarBanderaContacto(item.presenteAP)
    };
  }
  // =======CARGAR AGENDA DESDE BACKEND (FASE 1)================
  // ============== NORMALIZAR FECHAS INICIALES============================
  agendaData.forEach(item => {
    if (item.fecha.includes("/")) item._fechaISO = ddmmyyyyToISO(item.fecha);
    else item._fechaISO = item.fecha;
  });
  // ==============RENDER PRINCIPAL==============================
  function renderAgenda(container) {
    container.innerHTML = `
      <div class="agenda-container">

        <div class="agenda-header">
          <div class="agenda-title">Agenda</div>

          <div class="agenda-controls">
            <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
            <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">

            <label class="agenda-toggle-numeracion" for="agenda-toggle-numeracion">
              <input type="checkbox" id="agenda-toggle-numeracion">
              Numeracion
            </label>

            <label class="agenda-toggle-sms" for="agenda-toggle-sms">
              <input type="checkbox" id="agenda-toggle-sms">
              SMS
            </label>

            <label class="agenda-toggle-llamada" for="agenda-toggle-llamada">
              <input type="checkbox" id="agenda-toggle-llamada">
              Llamada
            </label>

            <label class="agenda-toggle-presente" for="agenda-toggle-presente">
              <input type="checkbox" id="agenda-toggle-presente">
              Presente
            </label>

            <input type="date" id="agenda-date">

            <input type="search" id="agenda-search" name="agenda-search-paciente" placeholder="Buscar Paciente" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">

            <button id="agenda-register" class="btn-cobrar" style="background:#1eab3a">
              Registrar Cita
            </button>

            <button id="agenda-paste-cita" class="btn-cobrar agenda-btn-reprogramar-pegar" disabled>
              Pegar Cita
            </button>

            <button id="agenda-clear-reprograma" class="btn-cobrar agenda-btn-reprogramar-cancelar" disabled>
              Cancelar
            </button>
            <button
              id="agenda-review-ina"
              class="btn-cobrar agenda-btn-inasistencia"
              type="button"
              title="Revisar inasistencias"
              aria-label="Revisar inasistencias"
            >
              ${getAgendaHeroIcon("queue-list")}
            </button>

            <span id="agenda-reprograma-status" class="agenda-reprograma-status" aria-live="polite"></span>

            <select id="agenda-filter-estado" class="filter-estado">
              <option value="">Todos</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Cancelado">Cancelado</option>
              <option value="Reprogramado">Reprogramado</option>
              <option value="No contesta">No contesta</option>
              <option value="IGS">IGS</option>
            </select>

            <select id="agenda-filter-contacto" class="filter-estado">
              <option value="">Contacto: Todos</option>
              <option value="none">Sin contacto</option>
              <option value="sms">Con SMS</option>
              <option value="llamada">Con Llamada</option>
              <option value="both">Con ambos</option>
            </select>
          </div>
        </div>

        <div class="agenda-table-wrap">
          <table class="agenda-table">
            <thead>
              <tr>
                <th hidden>IdAgendaAP</th>
                <th class="agenda-col-contacto">Contactado</th>
                <th class="agenda-col-num">#</th>
                <th>Nombre</th>
                <th>Hora</th>
                <th>Fecha</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th class="agenda-col-comentario">Comentario</th>
                <th style="text-align:center">Acciones</th>
              </tr>
            </thead>
            <tbody id="agenda-tbody"></tbody>
          </table>
        </div>

        <div id="agenda-ina-modal" class="agenda-ina-modal" hidden>
          <div class="agenda-ina-backdrop" data-ina-close="1"></div>
          <div class="agenda-ina-dialog" role="dialog" aria-modal="true" aria-labelledby="agenda-ina-title">
            <div class="agenda-ina-header">
              <h3 id="agenda-ina-title">Posibles inasistencias</h3>
              <button id="agenda-ina-close" class="btn-cobrar agenda-ina-close-btn" type="button">Cerrar</button>
            </div>
            <div class="agenda-ina-meta">
              <span id="agenda-ina-fecha">Fecha: -</span>
            </div>
            <div class="agenda-ina-kpis">
              <article class="agenda-ina-kpi">
                <span>Candidatos</span>
                <strong id="agenda-ina-kpi-candidatos">0</strong>
              </article>
              <article class="agenda-ina-kpi">
                <span>Seleccionados</span>
                <strong id="agenda-ina-kpi-seleccionados">0</strong>
              </article>
              <article class="agenda-ina-kpi is-muted">
                <span>Excluidos</span>
                <strong id="agenda-ina-kpi-excluidos">0</strong>
              </article>
            </div>
            <div id="agenda-ina-status" class="agenda-ina-status" aria-live="polite"></div>
            <div class="agenda-ina-toolbar">
              <button id="agenda-ina-select-all" class="btn-cobrar agenda-ina-select-all" type="button">Seleccionar todo</button>
              <button id="agenda-ina-clear-all" class="btn-cobrar agenda-ina-clear-all" type="button">Deseleccionar todo</button>
              <button id="agenda-ina-apply" class="btn-cobrar agenda-ina-apply" type="button">Aplicar cancelacion</button>
            </div>
            <div class="agenda-ina-table-wrap">
              <table class="agenda-ina-table">
                <thead>
                  <tr>
                    <th style="width:50px; text-align:center">OK</th>
                    <th>Paciente</th>
                    <th style="width:140px">Hora</th>
                    <th style="width:180px">Contacto</th>
                    <th style="width:140px">Estado actual</th>
                  </tr>
                </thead>
                <tbody id="agenda-ina-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    `;
    let agendaFetchSeq = 0;
    let agendaFetchController = null;
    let agendaFetchDate = "";
    let isCreatingAgenda = false;

    async function cargarAgendaPorFecha(fechaISO) {
      const fechaObjetivo = String(fechaISO || "").trim();
      if (!fechaObjetivo) return;

      if (agendaFetchController) {
        try {
          agendaFetchController.abort();
        } catch {
          // ignore abort failures
        }
      }

      const localSeq = ++agendaFetchSeq;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      agendaFetchController = controller;
      agendaFetchDate = fechaObjetivo;

      try {
        const fetchOptions = controller ? { signal: controller.signal } : undefined;
        const res = await fetch(
          `/api/agenda?fecha=${encodeURIComponent(fechaObjetivo)}`,
          fetchOptions
        );
        const json = await res.json();

        const isLatestRequest = localSeq === agendaFetchSeq;
        const currentDateValue = String(dateInput?.value || "").trim();
        const isTargetDateStillSelected = currentDateValue === fechaObjetivo;
        if (!isLatestRequest || !isTargetDateStillSelected) return;

        if (!res.ok || !json?.ok) {
          alert(json?.message || "Error al cargar agenda");
          return;
        }

        // limpiar datos actuales del dia y cache de busqueda mensual
        agendaData.length = 0;
        agendaMesResultados = null;
        agendaMesBusquedaToken++;

        // normalizar datos backend -> frontend
        const rows = Array.isArray(json.data) ? json.data : [];
        rows.forEach(item => {
          agendaData.push(normalizarAgendaRow(item, fechaObjetivo, true));
        });

        aplicarFiltros();
      } catch (err) {
        if (err?.name === "AbortError") return;

        const isLatestRequest = localSeq === agendaFetchSeq;
        const currentDateValue = String(dateInput?.value || "").trim();
        const isTargetDateStillSelected = currentDateValue === fechaObjetivo;
        if (!isLatestRequest || !isTargetDateStillSelected) return;

        console.error(err);
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
          alert("Opps ocurrio un error de conexion");
        }
      } finally {
        if (agendaFetchController === controller) {
          agendaFetchController = null;
          agendaFetchDate = "";
        }
      }
    }
    // ===========REFERENCIAS==============
    const tbody = container.querySelector("#agenda-tbody");
    const agendaTable = container.querySelector(".agenda-table");
    const dateInput = container.querySelector("#agenda-date");
    const searchInput = container.querySelector("#agenda-search");
    const estadoFilter = container.querySelector("#agenda-filter-estado");
    const contactoFilter = container.querySelector("#agenda-filter-contacto");
    const toggleNumeracionAgenda = container.querySelector("#agenda-toggle-numeracion");
    const toggleSmsAgenda = container.querySelector("#agenda-toggle-sms");
    const toggleLlamadaAgenda = container.querySelector("#agenda-toggle-llamada");
    const togglePresenteAgenda = container.querySelector("#agenda-toggle-presente");
    let pasteCitaBtn = container.querySelector("#agenda-paste-cita");
    let clearReprogramaBtn = container.querySelector("#agenda-clear-reprograma");
    const reviewInasistenciaBtn = container.querySelector("#agenda-review-ina");
    const reprogramaStatusEl = container.querySelector("#agenda-reprograma-status");
    const inasistenciaModal = container.querySelector("#agenda-ina-modal");
    const inasistenciaCloseBtn = container.querySelector("#agenda-ina-close");
    const inasistenciaFechaEl = container.querySelector("#agenda-ina-fecha");
    const inasistenciaKpiCandidatos = container.querySelector("#agenda-ina-kpi-candidatos");
    const inasistenciaKpiSeleccionados = container.querySelector("#agenda-ina-kpi-seleccionados");
    const inasistenciaKpiExcluidos = container.querySelector("#agenda-ina-kpi-excluidos");
    const inasistenciaStatusEl = container.querySelector("#agenda-ina-status");
    const inasistenciaSelectAllBtn = container.querySelector("#agenda-ina-select-all");
    const inasistenciaClearAllBtn = container.querySelector("#agenda-ina-clear-all");
    const inasistenciaApplyBtn = container.querySelector("#agenda-ina-apply");
    const inasistenciaTbody = container.querySelector("#agenda-ina-tbody");
    let agendaReprogramaBuffer = null;
    let agendaModalDesdeReprogramacion = false;
    let agendaMesResultados = null;
    let agendaMesBusquedaToken = 0;
    let inasistenciaRows = [];
    let inasistenciaSelectedIds = new Set();
    let inasistenciaLoading = false;
    let inasistenciaApplying = false;
    let inasistenciaFetchSeq = 0;
    let inasistenciaFetchController = null;
    const agendaContactoSaveInFlight = new Set();
    const agendaUiStateKey = `ui_state_agenda_${getUiStateUserId()}`;
    const agendaUiState = {
      numeracion: false,
      sms: false,
      llamada: false,
      presente: false,
      search: "",
      estado: "",
      contacto: "",
      ...loadSessionUiState(agendaUiStateKey)
    };
    const getSelectSafeValue = (selectEl, value) => {
      if (!selectEl) return "";
      const target = String(value || "").trim();
      const exists = Array.from(selectEl.options || []).some((opt) => opt.value === target);
      return exists ? target : "";
    };
    const getAgendaUiStateSnapshot = () => ({
      numeracion: !!toggleNumeracionAgenda?.checked,
      sms: !!toggleSmsAgenda?.checked,
      llamada: !!toggleLlamadaAgenda?.checked,
      presente: !!togglePresenteAgenda?.checked,
      search: String(searchInput?.value || ""),
      estado: String(estadoFilter?.value || ""),
      contacto: String(contactoFilter?.value || "")
    });
    const persistAgendaUiState = () => {
      saveSessionUiState(agendaUiStateKey, getAgendaUiStateSnapshot());
    };
    if (toggleNumeracionAgenda) {
      toggleNumeracionAgenda.checked = !!agendaUiState.numeracion;
    }
    if (toggleSmsAgenda) {
      toggleSmsAgenda.checked = !!agendaUiState.sms;
    }
    if (toggleLlamadaAgenda) {
      toggleLlamadaAgenda.checked = !!agendaUiState.llamada;
    }
    if (togglePresenteAgenda) {
      togglePresenteAgenda.checked = !!agendaUiState.presente;
    }
    if (searchInput) {
      searchInput.value = String(agendaUiState.search || "");
    }
    if (estadoFilter) {
      estadoFilter.value = getSelectSafeValue(estadoFilter, agendaUiState.estado);
    }
    if (contactoFilter) {
      contactoFilter.value = getSelectSafeValue(contactoFilter, agendaUiState.contacto);
    }
    const shouldPreserveAgendaSearch = String(searchInput?.value || "").trim() !== "";
    if (searchInput) {
      searchInput.setAttribute("name", `agenda-search-${Date.now()}`);
      if (!shouldPreserveAgendaSearch) {
        searchInput.value = "";
      }
      // Evita autofill agresivo del navegador al recargar (F5).
      searchInput.readOnly = true;
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.readOnly = false;
        if (!shouldPreserveAgendaSearch) {
          searchInput.value = "";
        }
      }, 80);
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        if (!shouldPreserveAgendaSearch) {
          searchInput.value = "";
        }
      }, 350);
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        if (!shouldPreserveAgendaSearch) {
          searchInput.value = "";
        }
      }, 1200);
    }
    function numeracionAgendaActiva() {
      return !!toggleNumeracionAgenda?.checked;
    }

    function aplicarVisibilidadNumeracionAgenda() {
      if (!agendaTable) return;
      agendaTable.classList.toggle("hide-numeracion", !numeracionAgendaActiva());
    }

    function smsAgendaActivo() {
      return !!toggleSmsAgenda?.checked;
    }

    function llamadaAgendaActiva() {
      return !!toggleLlamadaAgenda?.checked;
    }
    function presenteAgendaActivo() {
      return !!togglePresenteAgenda?.checked;
    }

    function aplicarVisibilidadContactadoAgenda() {
      if (!agendaTable) return;
      const smsVisible = smsAgendaActivo();
      const llamadaVisible = llamadaAgendaActiva();
      const presenteVisible = presenteAgendaActivo();
      agendaTable.classList.toggle("hide-contacto-sms", !smsVisible);
      agendaTable.classList.toggle("hide-contacto-llamada", !llamadaVisible);
      agendaTable.classList.toggle("hide-contacto-presente", !presenteVisible);
      agendaTable.classList.toggle("hide-contactado", !smsVisible && !llamadaVisible && !presenteVisible);
    }
    function formatearHoraInasistencia(value) {
      const raw = String(value || "").trim();
      if (!raw) return "-";
      if (/^\d{1,2}:\d{2}$/.test(raw)) {
        return formatTime12(raw);
      }
      return raw;
    }
    function setInasistenciaStatus(message, tone = "info") {
      if (!inasistenciaStatusEl) return;
      inasistenciaStatusEl.textContent = String(message || "").trim();
      inasistenciaStatusEl.classList.remove("is-info", "is-success", "is-error", "is-muted");
      if (tone) {
        inasistenciaStatusEl.classList.add(`is-${tone}`);
      }
    }
    function renderInasistenciaRows() {
      if (inasistenciaFechaEl) {
        const fechaISO = String(dateInput?.value || "").trim();
        inasistenciaFechaEl.textContent = fechaISO
          ? `Fecha: ${isoToDDMMYYYY(fechaISO)}`
          : "Fecha: -";
      }

      const total = inasistenciaRows.length;
      const selected = inasistenciaRows.reduce(
        (acc, row) => acc + (inasistenciaSelectedIds.has(Number(row?.idAgendaAP || 0)) ? 1 : 0),
        0
      );
      const excluded = Math.max(0, total - selected);

      if (inasistenciaKpiCandidatos) inasistenciaKpiCandidatos.textContent = String(total);
      if (inasistenciaKpiSeleccionados) inasistenciaKpiSeleccionados.textContent = String(selected);
      if (inasistenciaKpiExcluidos) inasistenciaKpiExcluidos.textContent = String(excluded);

      if (inasistenciaSelectAllBtn) {
        inasistenciaSelectAllBtn.disabled = inasistenciaLoading || inasistenciaApplying || total === 0;
      }
      if (inasistenciaClearAllBtn) {
        inasistenciaClearAllBtn.disabled = inasistenciaLoading || inasistenciaApplying || total === 0;
      }
      if (inasistenciaApplyBtn) {
        inasistenciaApplyBtn.disabled = inasistenciaLoading || inasistenciaApplying || selected === 0;
      }
      if (!inasistenciaTbody) return;

      if (inasistenciaLoading) {
        inasistenciaTbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; color:#64748b">Cargando posibles inasistencias...</td>
          </tr>
        `;
        return;
      }

      if (!total) {
        inasistenciaTbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; color:#64748b">No hay posibles inasistencias para esta fecha</td>
          </tr>
        `;
        return;
      }

      inasistenciaTbody.innerHTML = "";
      inasistenciaRows.forEach((row) => {
        const idAgenda = Number(row?.idAgendaAP || 0);
        if (!idAgenda) return;
        const tr = document.createElement("tr");
        const checked = inasistenciaSelectedIds.has(idAgenda) ? "checked" : "";
        tr.innerHTML = `
          <td style="text-align:center">
            <input type="checkbox" class="agenda-ina-check" data-id="${idAgenda}" ${checked}>
          </td>
          <td>${escapeHtml(String(row?.nombre || "-"))}</td>
          <td>${escapeHtml(formatearHoraInasistencia(row?.hora))}</td>
          <td>${escapeHtml(String(row?.contacto || "-"))}</td>
          <td>${escapeHtml(String(row?.estado || "-"))}</td>
        `;
        inasistenciaTbody.appendChild(tr);
      });
    }
    function abortInasistenciaFetch() {
      if (!inasistenciaFetchController) return;
      try {
        inasistenciaFetchController.abort();
      } catch {
        // ignore abort failures
      }
      inasistenciaFetchController = null;
    }
    function abrirInasistenciaModal() {
      if (!inasistenciaModal) return;
      inasistenciaModal.hidden = false;
      document.body.classList.add("agenda-ina-open");
      void cargarPosiblesInasistencias();
    }
    function cerrarInasistenciaModal() {
      if (!inasistenciaModal) return;
      inasistenciaModal.hidden = true;
      document.body.classList.remove("agenda-ina-open");
      inasistenciaLoading = false;
      inasistenciaFetchSeq++;
      abortInasistenciaFetch();
    }
    window.__agendaCloseInasistenciaModal = cerrarInasistenciaModal;
    async function cargarPosiblesInasistencias(opts = {}) {
      const fechaISO = String(dateInput?.value || "").trim();
      const statusAfter = String(opts?.statusAfter || "").trim();
      const statusTone = String(opts?.statusTone || "").trim() || "success";

      if (!fechaISO) {
        inasistenciaRows = [];
        inasistenciaSelectedIds = new Set();
        setInasistenciaStatus("Seleccione una fecha valida en Agenda.", "error");
        renderInasistenciaRows();
        return;
      }

      inasistenciaFetchSeq += 1;
      const localSeq = inasistenciaFetchSeq;
      abortInasistenciaFetch();
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      inasistenciaFetchController = controller;

      inasistenciaLoading = true;
      setInasistenciaStatus("Cargando posibles inasistencias...", "muted");
      renderInasistenciaRows();

      try {
        const options = controller
          ? { cache: "no-store", signal: controller.signal }
          : { cache: "no-store" };
        const [agendaRes, colaRes] = await Promise.all([
          fetch(`/api/agenda?fecha=${encodeURIComponent(fechaISO)}`, options),
          fetch(`/api/cola?fecha=${encodeURIComponent(fechaISO)}`, options)
        ]);
        const [agendaJson, colaJson] = await Promise.all([
          agendaRes.json(),
          colaRes.json()
        ]);

        if (localSeq !== inasistenciaFetchSeq) return;

        if (!agendaRes.ok || !agendaJson?.ok) {
          throw new Error(agendaJson?.message || "No se pudo cargar agenda para cruce");
        }
        if (!colaRes.ok || !colaJson?.ok) {
          throw new Error(colaJson?.message || "No se pudo cargar En Cola para cruce");
        }

        const agendaRowsRaw = Array.isArray(agendaJson?.data) ? agendaJson.data : [];
        const agendaRows = agendaRowsRaw.map((item) => normalizarAgendaRow(item, fechaISO, true));
        const candidatos = agendaRows.filter((item) => {
          const estado = normalizarTexto(item?.estado);
          return estado === "confirmado" || estado === "pendiente";
        });

        const atendidosPorAgendaId = new Set();
        const atendidosPorNombre = new Set();
        const colaRows = Array.isArray(colaJson?.data) ? colaJson.data : [];
        colaRows.forEach((item) => {
          const estado = normalizarTexto(item?.estado);
          if (estado !== "atendido") return;

          const agendaId = Number(item?.agendaId || 0);
          if (agendaId > 0) atendidosPorAgendaId.add(agendaId);

          const keyNombre = normalizarTextoCruce(item?.nombrePaciente);
          if (keyNombre) atendidosPorNombre.add(keyNombre);
        });

        inasistenciaRows = candidatos
          .filter((item) => {
            const agendaId = Number(item?.idAgendaAP || 0);
            if (agendaId > 0 && atendidosPorAgendaId.has(agendaId)) return false;

            const keyNombreAgenda = normalizarTextoCruce(item?.nombre);
            if (keyNombreAgenda && atendidosPorNombre.has(keyNombreAgenda)) return false;
            return true;
          })
          .sort((a, b) => {
            const horaCmp = String(a?.hora || "").localeCompare(String(b?.hora || ""));
            if (horaCmp !== 0) return horaCmp;
            return String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" });
          });

        inasistenciaSelectedIds = new Set(
          inasistenciaRows
            .map((item) => Number(item?.idAgendaAP || 0))
            .filter((id) => Number.isInteger(id) && id > 0)
        );

        if (statusAfter) {
          setInasistenciaStatus(statusAfter, statusTone);
        } else if (!inasistenciaRows.length) {
          setInasistenciaStatus("No hay posibles inasistencias para esta fecha.", "muted");
        } else {
          setInasistenciaStatus(
            `Revise la lista y excluya manualmente los pacientes que no desea cancelar (${inasistenciaRows.length}).`,
            "info"
          );
        }
      } catch (err) {
        if (err?.name === "AbortError" || localSeq !== inasistenciaFetchSeq) return;
        console.error("Error calculando inasistencias desde Agenda", err);
        inasistenciaRows = [];
        inasistenciaSelectedIds = new Set();
        setInasistenciaStatus(err?.message || "No se pudo calcular posibles inasistencias", "error");
      } finally {
        if (inasistenciaFetchController === controller) {
          inasistenciaFetchController = null;
          inasistenciaLoading = false;
        }
        renderInasistenciaRows();
      }
    }
    async function aplicarCancelacionMasivaInasistencias() {
      if (inasistenciaApplying || inasistenciaLoading) return;

      const seleccionados = inasistenciaRows
        .map((row) => Number(row?.idAgendaAP || 0))
        .filter((id) => inasistenciaSelectedIds.has(id));

      if (!seleccionados.length) {
        setInasistenciaStatus("Seleccione al menos un registro para cancelar.", "error");
        renderInasistenciaRows();
        return;
      }

      const mensajeConfirm = `Cambiar a Cancelado ${seleccionados.length} cita(s) seleccionada(s)?`;
      const okConfirmar = typeof window.showSystemConfirm === "function"
        ? await window.showSystemConfirm(mensajeConfirm)
        : confirm(mensajeConfirm);
      if (!okConfirmar) return;

      inasistenciaApplying = true;
      setInasistenciaStatus("Aplicando cancelaciones...", "muted");
      renderInasistenciaRows();

      let actualizados = 0;
      const fallidos = [];

      try {
        for (const idAgenda of seleccionados) {
          try {
            const res = await fetch(`/api/agenda/${idAgenda}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ estado: "Cancelado" })
            });
            const json = await res.json();
            if (!res.ok || !json?.ok) {
              throw new Error(json?.message || "No se pudo actualizar estado");
            }
            actualizados += 1;
          } catch (err) {
            fallidos.push({
              idAgenda,
              message: String(err?.message || "Error actualizando estado")
            });
          }
        }

        const fechaObjetivo = String(dateInput?.value || "").trim();
        if (fechaObjetivo) {
          await cargarAgendaPorFecha(fechaObjetivo);
          aplicarFiltros();
        }

        const resumen = `Actualizados: ${actualizados}. Fallidos: ${fallidos.length}.`;
        await cargarPosiblesInasistencias({
          statusAfter: resumen,
          statusTone: fallidos.length ? "error" : "success"
        });

        if (fallidos.length) {
          console.error("Fallos en cancelacion masiva de agenda", fallidos);
        }
      } catch (err) {
        console.error("Error en aplicacion masiva de inasistencias", err);
        setInasistenciaStatus(
          err?.message || "No se pudo completar la aplicacion de cancelaciones",
          "error"
        );
      } finally {
        inasistenciaApplying = false;
        renderInasistenciaRows();
      }
    }
    reviewInasistenciaBtn?.addEventListener("click", () => {
      abrirInasistenciaModal();
    });
    inasistenciaCloseBtn?.addEventListener("click", () => {
      cerrarInasistenciaModal();
    });
    inasistenciaModal?.addEventListener("click", (e) => {
      if (e.target?.closest?.("[data-ina-close]")) {
        cerrarInasistenciaModal();
      }
    });
    inasistenciaSelectAllBtn?.addEventListener("click", () => {
      inasistenciaSelectedIds = new Set(
        inasistenciaRows
          .map((row) => Number(row?.idAgendaAP || 0))
          .filter((id) => Number.isInteger(id) && id > 0)
      );
      setInasistenciaStatus("Todos los candidatos fueron seleccionados.", "info");
      renderInasistenciaRows();
    });
    inasistenciaClearAllBtn?.addEventListener("click", () => {
      inasistenciaSelectedIds = new Set();
      setInasistenciaStatus("Todos los candidatos fueron excluidos temporalmente.", "info");
      renderInasistenciaRows();
    });
    inasistenciaApplyBtn?.addEventListener("click", async () => {
      await aplicarCancelacionMasivaInasistencias();
    });
    inasistenciaTbody?.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains("agenda-ina-check")) return;

      const idAgenda = Number(target.dataset?.id || 0);
      if (!Number.isInteger(idAgenda) || idAgenda <= 0) return;

      if (target.checked) {
        inasistenciaSelectedIds.add(idAgenda);
      } else {
        inasistenciaSelectedIds.delete(idAgenda);
      }
      renderInasistenciaRows();
    });
    renderInasistenciaRows();
    let regBtn = container.querySelector("#agenda-register");
    const regBtnSafe = regBtn.cloneNode(true);
    regBtn.replaceWith(regBtnSafe);
    regBtn = regBtnSafe;
    if (pasteCitaBtn) {
      const pasteCitaBtnSafe = pasteCitaBtn.cloneNode(true);
      pasteCitaBtn.replaceWith(pasteCitaBtnSafe);
      pasteCitaBtn = pasteCitaBtnSafe;
    }
    if (clearReprogramaBtn) {
      const clearReprogramaBtnSafe = clearReprogramaBtn.cloneNode(true);
      clearReprogramaBtn.replaceWith(clearReprogramaBtnSafe);
      clearReprogramaBtn = clearReprogramaBtnSafe;
    }

    // ----- MODAL -----
    const modal = document.querySelector("#modal-agenda");
    let btnCancelar = document.querySelector("#modal-cancelar");
    const btnCancelarSafe = btnCancelar.cloneNode(true);
    btnCancelar.replaceWith(btnCancelarSafe);
    btnCancelar = btnCancelarSafe;
    let btnGuardar = document.querySelector("#modal-guardar");
    const btnGuardarSafe = btnGuardar.cloneNode(true);
    btnGuardar.replaceWith(btnGuardarSafe);
    btnGuardar = btnGuardarSafe;

    const modalHora = document.querySelector("#modal-hora");
    const modalFecha = document.querySelector("#modal-fecha");
    let modalNombre = document.querySelector("#modal-nombre");
    if (modalNombre) {
      const modalNombreSafe = modalNombre.cloneNode(true);
      modalNombre.replaceWith(modalNombreSafe);
      modalNombre = modalNombreSafe;
    }
    let modalComentario = document.querySelector("#modal-comentario");
    if (modalComentario) {
      const modalComentarioSafe = modalComentario.cloneNode(true);
      modalComentario.replaceWith(modalComentarioSafe);
      modalComentario = modalComentarioSafe;
    }
    const modalListaPacientes = document.querySelector("#modal-lista-pacientes-agenda");
    const modalContacto = document.querySelector("#modal-contacto");
    let modalListaServiciosAgenda = null;
    let pacienteSeleccionadoAgenda = null;
    let pacienteSeleccionAgendaToken = 0;
    let agendaModalPacienteSearchToken = 0;
    let agendaModalServicioSearchToken = 0;
    let agendaComentarioTokenInfo = null;

    const ensureComentarioAutocompleteUI = () => {
      if (!modalComentario) return null;

      let wrap = modalComentario.parentElement;
      if (!wrap || !wrap.classList.contains("agenda-modal-comentario-wrap")) {
        const nuevoWrap = document.createElement("div");
        nuevoWrap.className = "agenda-modal-comentario-wrap";
        modalComentario.parentNode.insertBefore(nuevoWrap, modalComentario);
        nuevoWrap.appendChild(modalComentario);
        wrap = nuevoWrap;
      }

      let lista = wrap.querySelector("#modal-lista-servicios-agenda");
      if (!lista) {
        lista = document.createElement("div");
        lista.id = "modal-lista-servicios-agenda";
        lista.className = "autocomplete-list";
        wrap.appendChild(lista);
      }

      return lista;
    };
    modalListaServiciosAgenda = ensureComentarioAutocompleteUI();

    const limpiarBusquedaPacienteModal = () => {
      if (modalListaPacientes) {
        modalListaPacientes.innerHTML = "";
        modalListaPacientes.style.display = "none";
      }
    };
    const limpiarBusquedaServicioComentario = () => {
      if (modalListaServiciosAgenda) {
        modalListaServiciosAgenda.innerHTML = "";
        modalListaServiciosAgenda.style.display = "none";
      }
    };
    const insertarServicioEnComentario = (nombreServicio, tokenInfoOverride = null) => {
      if (!modalComentario) return;
      const value = String(modalComentario.value || "");
      const info = tokenInfoOverride
        || agendaComentarioTokenInfo
        || getTokenInfoFromCaret(modalComentario);
      const start = Number.isInteger(info?.start) ? info.start : value.length;
      const end = Number.isInteger(info?.end) ? info.end : start;

      const nextValue = value.slice(0, start) + nombreServicio + value.slice(end);
      const nextPos = start + nombreServicio.length;

      modalComentario.value = nextValue;
      modalComentario.focus();
      modalComentario.setSelectionRange(nextPos, nextPos);
      agendaComentarioTokenInfo = {
        query: nombreServicio,
        start,
        end: nextPos
      };
      limpiarBusquedaServicioComentario();
    };
    const buscarServicioEnComentario = debounce(async () => {
      if (!modalComentario || !modalListaServiciosAgenda) return;

      const info = getTokenInfoFromCaret(modalComentario);
      agendaComentarioTokenInfo = info;
      const texto = String(info.query || "").trim();

      modalListaServiciosAgenda.innerHTML = "";
      modalListaServiciosAgenda.style.display = "none";
      if (texto.length < 2) return;

      const token = ++agendaModalServicioSearchToken;
      try {
        const res = await fetch(`/api/servicio/search?q=${encodeURIComponent(texto)}`);
        const json = await res.json();
        if (token !== agendaModalServicioSearchToken) return;
        if (!json?.ok || !Array.isArray(json.data)) return;

        const usados = new Set();
        const tokenInfoSnapshot = { ...info };
        json.data.forEach((s) => {
          const nombreS = String(s?.nombreS || "").trim();
          if (!nombreS || usados.has(normalizarTexto(nombreS))) return;
          usados.add(normalizarTexto(nombreS));

          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = nombreS;
          div.addEventListener("mousedown", (e) => e.preventDefault());
          div.addEventListener("click", () => insertarServicioEnComentario(nombreS, tokenInfoSnapshot));
          modalListaServiciosAgenda.appendChild(div);
        });

        if (modalListaServiciosAgenda.children.length) {
          modalListaServiciosAgenda.style.display = "block";
        }
      } catch (err) {
        console.error("Error buscando servicios para comentario de agenda", err);
      }
    }, 250);

    const resetAgendaModalState = () => {
      pacienteSeleccionadoAgenda = null;
      pacienteSeleccionAgendaToken++;
      agendaModalPacienteSearchToken++;
      agendaModalServicioSearchToken++;
      agendaComentarioTokenInfo = null;
      agendaModalDesdeReprogramacion = false;
      if (modalNombre) modalNombre.value = "";
      if (modalHora) modalHora.value = "";
      if (modalFecha) modalFecha.value = "";
      if (modalContacto) modalContacto.value = "";
      const estadoEl = document.querySelector("#modal-estado");
      if (estadoEl) estadoEl.value = "";
      if (modalComentario) modalComentario.value = "";
      limpiarBusquedaPacienteModal();
      limpiarBusquedaServicioComentario();
    };
    const actualizarUiReprogramacion = () => {
      const hayBuffer = !!agendaReprogramaBuffer;
      if (pasteCitaBtn) pasteCitaBtn.disabled = !hayBuffer;
      if (clearReprogramaBtn) clearReprogramaBtn.disabled = !hayBuffer;
      if (!reprogramaStatusEl) return;

      if (!hayBuffer) {
        reprogramaStatusEl.textContent = "";
        return;
      }

      const nombre = String(agendaReprogramaBuffer.nombre || "").trim() || "Paciente";
      const fechaDestinoIso = String(dateInput?.value || "").trim();
      const fechaDestino = fechaDestinoIso ? isoToDDMMYYYY(fechaDestinoIso) : "sin fecha";
      reprogramaStatusEl.textContent = `Reprogramando: ${nombre} -> ${fechaDestino}`;
    };
    const limpiarBufferReprogramacion = () => {
      agendaReprogramaBuffer = null;
      actualizarUiReprogramacion();
    };
    const setBufferReprogramacion = (item) => {
      agendaReprogramaBuffer = {
        idAgendaAP: Number(item?.idAgendaAP || 0),
        nombre: String(item?.nombre || "").trim(),
        contacto: String(item?.contacto || "").trim(),
        comentario: String(item?.comentario || "").trim(),
        hora: String(item?.hora || "").trim(),
        fechaOrigenISO: String(item?._fechaISO || "")
      };
      actualizarUiReprogramacion();
    };
    const openAgendaModal = (prefill = null) => {
      resetAgendaModalState();
      agendaModalDesdeReprogramacion = !!prefill;
      if (modalFecha && dateInput?.value) {
        modalFecha.value = dateInput.value;
      }

      if (prefill) {
        if (modalNombre) modalNombre.value = String(prefill.nombre || "").trim();
        if (modalContacto) modalContacto.value = String(prefill.contacto || "").trim();
        if (modalComentario) modalComentario.value = String(prefill.comentario || "").trim();
        if (modalHora) {
          const horaRaw = String(prefill.hora || "").trim();
          modalHora.value = /^\d{1,2}:\d{2}$/.test(horaRaw)
            ? formatTime12(horaRaw)
            : horaRaw;
        }
      }

      if (modal) modal.classList.add("show");
      if (prefill && modalHora) {
        modalHora.focus();
      } else if (modalNombre) {
        modalNombre.focus();
      }
    };
    const closeAgendaModal = () => {
      if (modal) modal.classList.remove("show");
    };
    window.__agendaResetModalState = resetAgendaModalState;
    window.__agendaCloseModal = closeAgendaModal;

    const buscarPacienteModal = debounce(async texto => {
      if (!modalListaPacientes || !modalNombre) return;

      modalListaPacientes.innerHTML = "";
      modalListaPacientes.style.display = "none";

      if (texto.length < 3) return;
      const token = ++agendaModalPacienteSearchToken;

      try {
        const res = await fetch(`/api/paciente/search?q=${encodeURIComponent(texto)}`);
        const json = await res.json();
        if (token !== agendaModalPacienteSearchToken) return;
        if (!json.ok || !Array.isArray(json.data)) return;

        json.data.forEach(p => {
          const nombrePaciente = String(p?.NombreP || "").trim();
          if (!nombrePaciente) return;
          const idPaciente = Number(p?.idPaciente || 0);

          const div = document.createElement("div");
          div.className = "autocomplete-item";
          div.textContent = nombrePaciente;
          div.addEventListener("click", async () => {
            modalNombre.value = nombrePaciente;
            limpiarBusquedaPacienteModal();

            let telefono = String(p?.telefonoP || p?.TelefonoP || "").trim();
            if (!telefono && idPaciente) {
              const tokenSeleccion = ++pacienteSeleccionAgendaToken;
              try {
                const resDetalle = await fetch(`/api/paciente/${idPaciente}`, {
                  cache: "no-store"
                });
                const jsonDetalle = await resDetalle.json();
                if (tokenSeleccion !== pacienteSeleccionAgendaToken) return;
                if (jsonDetalle?.ok && jsonDetalle?.data) {
                  telefono = String(jsonDetalle.data.telefonoP || "").trim();
                }
              } catch (err) {
                console.error("Error cargando telefono del paciente en agenda", err);
              }
            }

            pacienteSeleccionadoAgenda = {
              idPaciente,
              nombre: nombrePaciente,
              telefono
            };

            if (modalContacto) {
              modalContacto.value = telefono || "";
              modalContacto.focus();
            }
          });

          modalListaPacientes.appendChild(div);
        });

        if (modalListaPacientes.children.length) {
          modalListaPacientes.style.display = "block";
        }
      } catch (err) {
        console.error("Error buscando pacientes para agenda", err);
      }
    }, 350);

    if (modalNombre) {
      modalNombre.addEventListener("input", e => {
        const texto = e.target.value.trim();

        if (pacienteSeleccionadoAgenda) {
          const esMismoNombre =
            normalizarTexto(texto) === normalizarTexto(pacienteSeleccionadoAgenda.nombre);

          if (!esMismoNombre) {
            if (modalContacto) modalContacto.value = "";
            pacienteSeleccionadoAgenda = null;
            pacienteSeleccionAgendaToken++;
          }
        }

        buscarPacienteModal(texto);
      });
    }
    if (modalComentario) {
      modalComentario.addEventListener("input", () => buscarServicioEnComentario());
      modalComentario.addEventListener("click", () => buscarServicioEnComentario());
      modalComentario.addEventListener("keyup", (e) => {
        if (e.key === "Escape") {
          limpiarBusquedaServicioComentario();
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") return;
        buscarServicioEnComentario();
      });
      modalComentario.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          limpiarBusquedaServicioComentario();
          return;
        }
        if (e.key === "Enter" && modalListaServiciosAgenda?.style.display === "block") {
          const primerItem = modalListaServiciosAgenda.querySelector(".autocomplete-item");
          if (primerItem) {
            e.preventDefault();
            primerItem.click();
          }
        }
      });
    }

    if (!window.__agendaModalPacienteOutsideHandler) {
      window.__agendaModalPacienteOutsideHandler = e => {
        if (e.target.closest(".agenda-modal-buscador")) return;
        const lista = document.querySelector("#modal-lista-pacientes-agenda");
        if (!lista) return;
        lista.innerHTML = "";
        lista.style.display = "none";
      };
      document.addEventListener("click", window.__agendaModalPacienteOutsideHandler);
    }
    if (!window.__agendaModalServicioOutsideHandler) {
      window.__agendaModalServicioOutsideHandler = e => {
        const wrap = document.querySelector(".agenda-modal-comentario-wrap");
        if (wrap && wrap.contains(e.target)) return;
        const lista = document.querySelector("#modal-lista-servicios-agenda");
        if (!lista) return;
        lista.innerHTML = "";
        lista.style.display = "none";
      };
      document.addEventListener("click", window.__agendaModalServicioOutsideHandler);
    }
    // ==========================
    // EVENTOS DEL MODAL (MOVIDOS)
    // ==========================
    // ---- Abrir modal ----
    regBtn.addEventListener("click", () => {
    openAgendaModal();
    });
    pasteCitaBtn?.addEventListener("click", () => {
      if (!agendaReprogramaBuffer) {
        alert("Primero copie una cita con el boton ++");
        return;
      }
      openAgendaModal(agendaReprogramaBuffer);
    });
    clearReprogramaBtn?.addEventListener("click", () => {
      limpiarBufferReprogramacion();
    });
    // ---- Cerrar modal ----
    btnCancelar.addEventListener("click", () => {
      resetAgendaModalState();
      closeAgendaModal();
    });
    if (!window.__agendaEscListener) {
     window.__agendaEscListener = true;

     document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (typeof window.__agendaCloseInasistenciaModal === "function") {
        window.__agendaCloseInasistenciaModal();
      }
      const modalAgenda = document.querySelector("#modal-agenda");
      if (modalAgenda?.classList.contains("show")) {
        if (typeof window.__agendaResetModalState === "function") {
          window.__agendaResetModalState();
        }
        if (typeof window.__agendaCloseModal === "function") {
          window.__agendaCloseModal();
        } else {
          modalAgenda.classList.remove("show");
        }
      }
    }
    });
}
    // ---- Autoformato hora (modal registrar cita) ----
    if (modalHora && !modalHora.dataset.autoHoraBound) {
      modalHora.dataset.autoHoraBound = "1";

      const formatearHoraModal = () => {
        modalHora.value = autoFormatearBasico(modalHora.value);
      };

      modalHora.addEventListener("blur", formatearHoraModal);
      modalHora.addEventListener("change", formatearHoraModal);
      modalHora.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === "Tab") formatearHoraModal();
      });
    }

    // ==========================
    // GUARDAR CITA
    // ==========================
    btnGuardar.addEventListener("click", async (ev) => {
      // prevenir comportamiento por defecto (por si hay un form)
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      if (isCreatingAgenda) return;

      isCreatingAgenda = true;
      btnGuardar.disabled = true;

      try {
        // referencias a campos del modal (recalculadas por seguridad)
        const nombreEl = document.querySelector("#modal-nombre");
        const horaEl = document.querySelector("#modal-hora");
        const fechaEl = document.querySelector("#modal-fecha");
        const contactoEl = document.querySelector("#modal-contacto");
        const estadoEl = document.querySelector("#modal-estado");
        const comentarioEl = modalComentario || document.querySelector("#modal-comentario");

        // Si algun campo no existe: aviso y no cerrar modal
        if (!nombreEl || !horaEl || !fechaEl || !contactoEl || !estadoEl || !comentarioEl) {
          console.error("Faltan campos del modal. Verifica que existan los inputs con los ids esperados.");
          alert("Error interno: faltan campos del modal. Revisa la consola.");
          return;
        }

        // valores
        const nombre = nombreEl.value.trim();
        const horaRaw = horaEl.value.trim();
        const fechaISO = fechaEl.value; // YYYY-MM-DD
        const contacto = contactoEl.value.trim();
        const estadoValue = estadoEl.value.trim();
        const comentario = comentarioEl.value.trim();

        // VALIDACIONES (si falla => mostrar y NO cerrar modal)
        if (!fechaISO) {
          alert("Debe seleccionar una FECHA.");
          return;
        }
        if (!nombre) {
          alert("El campo NOMBRE no puede estar vacio.");
          nombreEl.focus();
          return;
        }
        if (!horaRaw) {
          alert("El campo HORA no puede estar vacio.");
          horaEl.focus();
          return;
        }
        if (!contacto) {
          alert("El campo CONTACTO no puede estar vacio.");
          contactoEl.focus();
          return;
        }
        if (!comentario) {
          alert("El campo COMENTARIO no puede estar vacio.");
          comentarioEl.focus();
          return;
        }

        // autoformatear la hora y validar
        const horaForzada = autoFormatearBasico(horaRaw.toLowerCase());
        if (!validarHora(horaForzada)) {
          alert("Hora invalida.\nEjemplos validos:\n 8:00 am\n 1:30 pm");
          horaEl.value = horaForzada; // mostrar autoformateado (si aplica) para que el usuario corrija
          horaEl.focus();
          return;
        }
        // convertir a 24h (08:00)
        const hora24 = to24(horaForzada);
        // preparar fecha DD/MM/YYYY
        const fechaDDMM = isoToDDMMYYYY(fechaISO);

        const res = await fetch("/api/agenda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre,
            hora: hora24,
            fecha: fechaISO,
            contacto,
            estado: estadoValue,
            comentario,
            sms: 0,
            llamada: 0,
            presente: 0
          })
        });

        const json = await res.json();

        if (!json.ok) {
          throw new Error(json.message || "Error al crear cita");
        }

        // usar ID REAL de BD
        agendaData.unshift({
          idAgendaAP: json.idAgendaAP,
          nombre,
          hora: hora24,
          fecha: fechaDDMM,
          _fechaISO: fechaISO,
          contacto,
          estado: estadoValue,
          comentario,
          sms: false,
          llamada: false,
          presente: false
        });

        aplicarFiltros();
        if (agendaModalDesdeReprogramacion) {
          limpiarBufferReprogramacion();
        }
        modal.classList.remove("show");
        resetAgendaModalState();
      } catch (err) {
        alert("No se pudo crear la cita");
        console.error(err);
      } finally {
        isCreatingAgenda = false;
        if (btnGuardar && btnGuardar.isConnected) {
          btnGuardar.disabled = false;
        }
      }
    });
    // =============FECHA ACTUAL (FILTRO)===========
    const isAgendaViewActive = () => !!container?.isConnected && window.currentView === "Agenda";
    const isAgendaModalOpen = () => !!modal?.classList.contains("show");
    const moverFechaAgenda = (deltaDays) => {
      if (!isAgendaViewActive()) return;
      const fechaActual = String(dateInput?.value || "").trim() || getLocalTodayISO();
      const fechaNueva = shiftISODateByDays(fechaActual, deltaDays);
      if (!fechaNueva || fechaNueva === fechaActual) return;
      dateInput.value = fechaNueva;
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const onAgendaDateShortcut = (e) => {
      if (!isAgendaViewActive()) return;
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (isAgendaModalOpen()) return;

      const activeEl = document.activeElement;
      if (activeEl && activeEl !== dateInput && isEditingFocusableControl(activeEl)) return;

      e.preventDefault();
      moverFechaAgenda(e.key === "ArrowLeft" ? -1 : 1);
    };
    if (window.__agendaDateNavKeydownHandler) {
      document.removeEventListener("keydown", window.__agendaDateNavKeydownHandler);
    }
    window.__agendaDateNavKeydownHandler = onAgendaDateShortcut;
    document.addEventListener("keydown", onAgendaDateShortcut);

    dateInput.value = getLocalTodayISO();
    actualizarUiReprogramacion();
    cargarAgendaPorFecha(dateInput.value);
    dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;
    agendaMesResultados = null;
    agendaMesBusquedaToken++;
    actualizarUiReprogramacion();
    cargarAgendaPorFecha(dateInput.value);
    });
    // ============FUNCIONES DE EDICION EN TABLA================
    function editarFecha(td, item) {
      const input = document.createElement("input");
      input.type = "date";

      const [d, m, y] = item.fecha.split("/");
      input.value = `${y}-${m}-${d}`;

      td.textContent = "";
      td.appendChild(input);
      input.focus();

      function save() {
        const iso = input.value;
        if (!iso) return;

        const [yy, mm, dd] = iso.split("-");
        item.fecha = `${dd}/${mm}/${yy}`;
        item._fechaISO = iso;

        td.innerHTML = renderFechaVisual(item.fecha);
        aplicarFiltros();
      }

      input.addEventListener("change", save);
      input.addEventListener("blur", save);
    }
    function editarTexto(td, item, campo) {
    const valorOriginal = item[campo];

    const input = document.createElement("input");
    input.type = "text";
    input.value = valorOriginal;
    input.className = "comment-edit";

    td.textContent = "";
    td.appendChild(input);
    input.focus();

    let isSaving = false;
    let isClosed = false;

    function renderCellValue(value) {
      if (campo === "nombre") {
        renderAgendaNombreCell(td, value);
      } else {
        td.textContent = value;
      }
    }

    function closeEditor(value) {
      if (isClosed) return;
      isClosed = true;
      renderCellValue(value);
    }

    async function save() {
      if (isSaving || isClosed) return;
      isSaving = true;

      const nuevoValor = input.value.trim();

      // Si no cambio nada, solo restaurar
      if (nuevoValor === valorOriginal) {
        closeEditor(valorOriginal);
        isSaving = false;
        return;
      }

      // Optimistic UI (actualiza primero)
      item[campo] = nuevoValor;
      closeEditor(nuevoValor);

      try {
        const res = await fetch(`/api/agenda/${item.idAgendaAP}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [campo]: nuevoValor })
        });

        const json = await res.json();
        if (!json.ok) throw new Error(json.message);
      } catch (err) {
        // rollback si falla
        alert("Error al guardar el cambio");
        console.error(err);

        item[campo] = valorOriginal;
        renderCellValue(valorOriginal);
      } finally {
        isSaving = false;
      }
    }

    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (isClosed) return;
        item[campo] = valorOriginal;
        closeEditor(valorOriginal);
      }
    });

    input.addEventListener("blur", save);
    }
    function editarHora(td, item) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = td.textContent;
      input.className = "comment-edit";

      td.textContent = "";
      td.appendChild(input);
      input.focus();

      const valorOriginal = String(item.hora || "").trim();
      let isSaving = false;
      let isClosed = false;

      function closeEditor(hora24) {
        if (isClosed) return;
        isClosed = true;
        td.textContent = formatTime12(hora24);
        aplicarRefuerzoVisualHora(td, hora24);
      }

      async function save() {
        if (isSaving || isClosed) return;
        isSaving = true;

        const v = autoFormatearBasico(input.value.trim().toLowerCase());
        if (!validarHora(v)) {
          alert("Hora invalida.\nEjemplos validos:\n 8:00 am\n 1:30 pm");
          closeEditor(valorOriginal);
          isSaving = false;
          return;
        }

        const nuevaHora24 = to24(v);
        if (nuevaHora24 === valorOriginal) {
          closeEditor(valorOriginal);
          isSaving = false;
          return;
        }

        item.hora = nuevaHora24;
        closeEditor(nuevaHora24);

        try {
          const res = await fetch(`/api/agenda/${item.idAgendaAP}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hora: nuevaHora24 })
          });

          const json = await res.json();
          if (!res.ok || !json?.ok) {
            throw new Error(json?.message || "Error al actualizar hora");
          }
        } catch (err) {
          item.hora = valorOriginal;
          td.textContent = formatTime12(valorOriginal);
          aplicarRefuerzoVisualHora(td, valorOriginal);
          alert("No se pudo guardar el cambio de hora");
          console.error(err);
        } finally {
          isSaving = false;
        }
      }

      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (isClosed) return;
          item.hora = valorOriginal;
          closeEditor(valorOriginal);
        }
      });

      input.addEventListener("blur", save);
    }

    async function guardarMarcasContacto(item, patch = {}) {
      const idAgenda = Number(item?.idAgendaAP || 0);
      if (!Number.isInteger(idAgenda) || idAgenda <= 0) {
        alert("No se pudo identificar la cita para guardar contacto");
        aplicarFiltros({ dispararFallback: false });
        return;
      }
      if (agendaContactoSaveInFlight.has(idAgenda)) {
        aplicarFiltros({ dispararFallback: false });
        return;
      }

      const prevSms = !!item.sms;
      const prevLlamada = !!item.llamada;
      const prevPresente = !!item.presente;
      const nextSms = patch.sms === undefined ? prevSms : !!patch.sms;
      const nextLlamada = patch.llamada === undefined ? prevLlamada : !!patch.llamada;
      const nextPresente = patch.presente === undefined ? prevPresente : !!patch.presente;

      item.sms = nextSms;
      item.llamada = nextLlamada;
      item.presente = nextPresente;
      agendaContactoSaveInFlight.add(idAgenda);
      aplicarFiltros({ dispararFallback: false });

      try {
        const res = await fetch(`/api/agenda/${idAgenda}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sms: nextSms ? 1 : 0,
            llamada: nextLlamada ? 1 : 0,
            presente: nextPresente ? 1 : 0
          })
        });

        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo guardar el contacto");
        }
      } catch (err) {
        item.sms = prevSms;
        item.llamada = prevLlamada;
        item.presente = prevPresente;
        alert(err?.message || "No se pudo guardar el contacto");
      } finally {
        agendaContactoSaveInFlight.delete(idAgenda);
        aplicarFiltros({ dispararFallback: false });
      }
    }
    // =========================================
    // DIBUJAR TABLA
    // =========================================
    function drawRows(list) {
      tbody.innerHTML = "";
      aplicarVisibilidadNumeracionAgenda();
      aplicarVisibilidadContactadoAgenda();

      list.forEach((item, index) => {
        const tr = document.createElement("tr");
        aplicarRefuerzoVisualFila(tr, item.estado);

        // Contacto (SMS / Llamada / Presente)
        const tdContactoMarcadores = document.createElement("td");
        tdContactoMarcadores.className = "agenda-col-contacto";

        const contactoWrap = document.createElement("div");
        contactoWrap.className = "agenda-contacto-flags";

        const flagSms = document.createElement("label");
        flagSms.className = "agenda-contacto-flag is-sms";
        flagSms.title = "SMS";

        const smsInput = document.createElement("input");
        smsInput.type = "checkbox";
        smsInput.checked = !!item.sms;
        smsInput.setAttribute("aria-label", "Marcar SMS enviado");

        const smsIcon = document.createElement("span");
        smsIcon.className = "agenda-contacto-icon";
        smsIcon.innerHTML = getAgendaHeroIcon("chat-bubble-left-right");

        flagSms.appendChild(smsInput);
        flagSms.appendChild(smsIcon);

        const flagLlamada = document.createElement("label");
        flagLlamada.className = "agenda-contacto-flag is-llamada";
        flagLlamada.title = "Llamada";

        const llamadaInput = document.createElement("input");
        llamadaInput.type = "checkbox";
        llamadaInput.checked = !!item.llamada;
        llamadaInput.setAttribute("aria-label", "Marcar llamada realizada");

        const llamadaIcon = document.createElement("span");
        llamadaIcon.className = "agenda-contacto-icon";
        llamadaIcon.innerHTML = getAgendaHeroIcon("phone");

        flagLlamada.appendChild(llamadaInput);
        flagLlamada.appendChild(llamadaIcon);

        const flagPresente = document.createElement("label");
        flagPresente.className = "agenda-contacto-flag is-presente";
        flagPresente.title = "Presente";

        const presenteInput = document.createElement("input");
        presenteInput.type = "checkbox";
        presenteInput.checked = !!item.presente;
        presenteInput.setAttribute("aria-label", "Marcar paciente presente");

        const presenteIcon = document.createElement("span");
        presenteIcon.className = "agenda-contacto-icon";
        presenteIcon.innerHTML = getAgendaHeroIcon("building-office");

        flagPresente.appendChild(presenteInput);
        flagPresente.appendChild(presenteIcon);

        const savingContacto = agendaContactoSaveInFlight.has(Number(item.idAgendaAP || 0));
        smsInput.disabled = savingContacto;
        llamadaInput.disabled = savingContacto;
        presenteInput.disabled = savingContacto;

        smsInput.addEventListener("change", () => {
          guardarMarcasContacto(item, { sms: smsInput.checked });
        });
        llamadaInput.addEventListener("change", () => {
          guardarMarcasContacto(item, { llamada: llamadaInput.checked });
        });
        presenteInput.addEventListener("change", () => {
          guardarMarcasContacto(item, { presente: presenteInput.checked });
        });

        contactoWrap.appendChild(flagSms);
        contactoWrap.appendChild(flagLlamada);
        contactoWrap.appendChild(flagPresente);
        tdContactoMarcadores.appendChild(contactoWrap);
        tr.appendChild(tdContactoMarcadores);

        // Numeracion
        const tdNum = document.createElement("td");
        tdNum.textContent = String(index + 1);
        tdNum.classList.add("agenda-col-num");
        tr.appendChild(tdNum);

        // Nombre
        const tdNombre = document.createElement("td");
        renderAgendaNombreCell(tdNombre, item.nombre);
        tdNombre.classList.add("editable");
        aplicarRefuerzoVisualNombre(tdNombre, item.estado);
        tdNombre.addEventListener("dblclick", () => editarTexto(tdNombre, item, "nombre"));
        tr.appendChild(tdNombre);
        // Hora
        const tdHora = document.createElement("td");
        tdHora.textContent = formatTime12(item.hora);
        tdHora.classList.add("editable");
        aplicarRefuerzoVisualHora(tdHora, item.hora);
        tdHora.addEventListener("dblclick", () => editarHora(tdHora, item));
        tr.appendChild(tdHora);

        // Fecha
        const tdFecha = document.createElement("td");
        tdFecha.innerHTML = renderFechaVisual(item.fecha);
        tdFecha.classList.add("editable");
        tdFecha.addEventListener("dblclick", () => editarFecha(tdFecha, item));
        tr.appendChild(tdFecha);

        // Contacto
        const tdContacto = document.createElement("td");
        tdContacto.textContent = item.contacto;
        tdContacto.classList.add("editable");
        tdContacto.addEventListener("dblclick", () => editarTexto(tdContacto, item, "contacto"));
        tr.appendChild(tdContacto);

        // Estado
        const tdEstado = document.createElement("td");
        const sel = renderEstadoSelect(item.estado);
        sel.addEventListener("change", async () => {
        const nuevoEstado = sel.value || "Pendiente";

        try {
        const res = await fetch(`/api/agenda/${item.idAgendaAP}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado })
        });

        const json = await res.json();

        if (!json.ok) {
        throw new Error(json.message || "Error al actualizar estado");
        }

        item.estado = nuevoEstado;
        sel.className = "select-estado " + estadoClassName(item.estado);
        aplicarRefuerzoVisualFila(tr, item.estado);
        aplicarRefuerzoVisualNombre(tdNombre, item.estado);
        aplicarFiltros();

        } catch (err) {
        alert("No se pudo guardar el cambio de estado");
        console.error(err);
        }
        });

        tdEstado.appendChild(sel);
        // forzar clase de color al render
        requestAnimationFrame(() => {
        sel.className = "select-estado " + estadoClassName(item.estado);
        });
        tr.appendChild(tdEstado);

        // Comentario
        const tdComentario = document.createElement("td");
        tdComentario.classList.add("agenda-col-comentario");
        const span = document.createElement("div");
        span.className = "comment-text";
        pintarComentarioVisual(span, item.comentario);
        span.addEventListener("dblclick", () => {
          const input = document.createElement("input");
          input.className = "comment-edit";
          input.value = String(item.comentario || "");
          const valorOriginal = item.comentario || "";

          tdComentario.replaceChild(input, span);
          input.focus();

          let isSavingComentario = false;
          let isClosedComentario = false;

          function closeComentarioEditor(value) {
            if (isClosedComentario) return;
            isClosedComentario = true;
            pintarComentarioVisual(span, value);
            tdComentario.replaceChild(span, input);
          }

          async function save() {
            if (isSavingComentario || isClosedComentario) return;
            isSavingComentario = true;

            const nuevoComentario = input.value.trim();

            if (nuevoComentario === valorOriginal) {
              closeComentarioEditor(valorOriginal);
              isSavingComentario = false;
              return;
            }

            item.comentario = nuevoComentario;
            closeComentarioEditor(item.comentario);

            try {
              const res = await fetch(`/api/agenda/${item.idAgendaAP}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comentario: nuevoComentario })
              });

              const json = await res.json();
              if (!json.ok) throw new Error(json.message || "Error al actualizar comentario");
            } catch (err) {
              item.comentario = valorOriginal;
              pintarComentarioVisual(span, valorOriginal);
              alert("No se pudo guardar el comentario");
              console.error(err);
            } finally {
              isSavingComentario = false;
            }
          }

          input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              if (isClosedComentario) return;
              item.comentario = valorOriginal;
              closeComentarioEditor(valorOriginal);
            }
          });

          input.addEventListener("blur", save);
        });
        tdComentario.appendChild(span);
        tr.appendChild(tdComentario);

        // Acciones (iconos compactos)
        const tdAcciones = document.createElement("td");
        tdAcciones.style.textAlign = "center";
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "agenda-actions";

        const btnEnCola = document.createElement("button");
        btnEnCola.type = "button";
        btnEnCola.className = "agenda-action-btn is-cola";
        btnEnCola.title = "Enviar a cola";
        btnEnCola.setAttribute("aria-label", "Enviar a cola");
        btnEnCola.innerHTML = getAgendaHeroIcon("queue-list");
        btnEnCola.addEventListener("click", async () => {
          if (btnEnCola.disabled) return;
          btnEnCola.disabled = true;

          const colaApi = window.__colaPacienteAPI;
          if (!colaApi || typeof colaApi.addFromAgenda !== "function") {
            alert("Vista En Cola no disponible");
            btnEnCola.disabled = false;
            return;
          }

          const nombreAgenda = String(item.nombre || "").trim();
          if (!nombreAgenda) {
            alert("La cita no tiene nombre de paciente");
            btnEnCola.disabled = false;
            return;
          }

          try {
            const fechaHoyISO = getLocalTodayISO();
            const fechaItemISO = String(item._fechaISO || dateInput?.value || "").trim();
            const citaFueraDeHoy = fechaItemISO !== fechaHoyISO;
            const estadoAgenda = String(item.estado || "Pendiente").trim() || "Pendiente";
            const comentarioAgenda = String(item.comentario || "").trim();
            const horaAgenda = String(item.hora || "").trim();
            const contactoAgenda = String(item.contacto || "").trim();

            let agendaIdParaCola = Number(item.idAgendaAP || 0);
            let fechaAgendaParaCola = fechaItemISO || fechaHoyISO;

            if (citaFueraDeHoy) {
              const confirmarMoverAHoy = typeof window.showSystemConfirm === "function"
                ? await window.showSystemConfirm("Paciente estaba agendado en otra fecha. Agregar a la agenda de hoy?")
                : confirm("Paciente estaba agendado en otra fecha. Agregar a la agenda de hoy?");
              if (!confirmarMoverAHoy) {
                return;
              }

              const resCrearAgendaHoy = await fetch("/api/agenda", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  nombre: nombreAgenda,
                  hora: horaAgenda,
                  fecha: fechaHoyISO,
                  contacto: contactoAgenda,
                  estado: estadoAgenda,
                  comentario: comentarioAgenda,
                  sms: item.sms ? 1 : 0,
                  llamada: item.llamada ? 1 : 0,
                  presente: 0
                })
              });
              const jsonCrearAgendaHoy = await resCrearAgendaHoy.json();
              if (!resCrearAgendaHoy.ok || !jsonCrearAgendaHoy?.ok) {
                throw new Error(jsonCrearAgendaHoy?.message || "No se pudo crear la cita en agenda de hoy");
              }

              const idAgendaNueva = Number(jsonCrearAgendaHoy?.idAgendaAP || 0);
              if (!idAgendaNueva) {
                throw new Error("No se pudo obtener el ID de la nueva cita de hoy");
              }

              agendaIdParaCola = idAgendaNueva;
              fechaAgendaParaCola = fechaHoyISO;

              agendaMesResultados = null;
              agendaMesBusquedaToken++;

              const fechaSeleccionadaISO = String(dateInput?.value || "").trim();
              if (fechaSeleccionadaISO === fechaHoyISO) {
                agendaData.unshift({
                  idAgendaAP: idAgendaNueva,
                  nombre: nombreAgenda,
                  hora: horaAgenda,
                  fecha: isoToDDMMYYYY(fechaHoyISO),
                  _fechaISO: fechaHoyISO,
                  contacto: contactoAgenda,
                  estado: estadoAgenda,
                  comentario: comentarioAgenda,
                  sms: !!item.sms,
                  llamada: !!item.llamada,
                  presente: false
                });
              }
              aplicarFiltros();
            }

            let tratamiento = comentarioAgenda;
            if (!tratamiento) {
              const tratamientoInput = typeof window.showSystemPrompt === "function"
                ? await window.showSystemPrompt("Tratamiento a realizar (opcional):", "")
                : prompt("Tratamiento a realizar (opcional):", "");
              if (tratamientoInput === null) return;
              tratamiento = String(tratamientoInput || "").trim();
            }

            const result = await colaApi.addFromAgenda({
              agendaId: agendaIdParaCola,
              nombrePaciente: nombreAgenda,
              tratamiento,
              horaAgenda,
              fechaAgendaISO: fechaAgendaParaCola,
              contacto: contactoAgenda
            });

            if (!result?.ok) {
              alert(result?.message || "No se pudo enviar a cola");
              return;
            }

            if (result.duplicated) {
              alert("Este paciente ya esta en cola");
              return;
            }

            alert("Paciente agregado a En Cola");
          } catch (err) {
            alert(err?.message || "No se pudo enviar a cola");
          } finally {
            if (btnEnCola.isConnected) {
              btnEnCola.disabled = false;
            }
          }
        });

        const btnReprogramar = document.createElement("button");
        btnReprogramar.type = "button";
        btnReprogramar.className = "agenda-action-btn is-reprogramar";
        btnReprogramar.title = "Copiar para reprogramar";
        btnReprogramar.setAttribute("aria-label", "Copiar para reprogramar");
        btnReprogramar.innerHTML = getAgendaHeroIcon("document-duplicate");
        btnReprogramar.addEventListener("click", () => {
          const nombreAgenda = String(item.nombre || "").trim();
          if (!nombreAgenda) {
            alert("La cita no tiene nombre para reprogramar");
            return;
          }

          setBufferReprogramacion(item);
        });

        const btnCobrar = document.createElement("button");
        btnCobrar.type = "button";
        btnCobrar.className = "agenda-action-btn is-cobrar";
        btnCobrar.title = "Cobrar";
        btnCobrar.setAttribute("aria-label", "Cobrar");
        btnCobrar.innerHTML = getAgendaHeroIcon("currency-dollar");
        btnCobrar.addEventListener("click", async () => {
          const nombreAgenda = String(item.nombre || "").trim();
          if (!nombreAgenda) {
            alert("La cita no tiene nombre de paciente");
            return;
          }

          try {
            const res = await fetch(`/api/paciente/search?q=${encodeURIComponent(nombreAgenda)}`);
            const json = await res.json();
            const data = Array.isArray(json?.data) ? json.data : [];

            if (!json?.ok) {
              alert(json?.message || "No se pudo validar el paciente para cobrar");
              return;
            }

            const exactos = data.filter((p) => {
              const nombrePaciente = String(p?.NombreP || "").trim();
              return normalizarTexto(nombrePaciente) === normalizarTexto(nombreAgenda);
            });

            if (!exactos.length) {
              alert(`No existe un paciente registrado con nombre exacto: "${nombreAgenda}"`);
              return;
            }

            let pacienteMatch = null;

            if (exactos.length === 1) {
              pacienteMatch = exactos[0];
            } else {
              const contactoAgenda = soloDigitos(item.contacto);
              if (contactoAgenda) {
                const filtradosPorTelefono = exactos.filter((p) => {
                  const telPaciente = soloDigitos(p?.telefonoP || p?.TelefonoP || "");
                  if (!telPaciente) return false;
                  return telPaciente === contactoAgenda;
                });
                if (filtradosPorTelefono.length === 1) {
                  pacienteMatch = filtradosPorTelefono[0];
                }
              }
            }

            if (!pacienteMatch) {
              alert("Hay multiples pacientes con ese nombre. Abra Cobro y seleccione el paciente manualmente.");
              return;
            }

            const idPaciente = Number(pacienteMatch?.idPaciente || 0);
            if (!idPaciente) {
              alert("No se pudo resolver el paciente para cobrar");
              return;
            }

            window.__agendaCobroPrefillPatient = {
              idPaciente,
              NombreP: String(pacienteMatch?.NombreP || nombreAgenda).trim(),
              telefonoP: String(pacienteMatch?.telefonoP || pacienteMatch?.TelefonoP || "").trim()
            };

            if (typeof window.loadView === "function") {
              window.loadView("Cobro");
            } else {
              alert("No se pudo abrir la vista Cobro");
            }
          } catch (err) {
            console.error("Error validando paciente desde agenda", err);
            if (window.notifyConnectionError) {
              window.notifyConnectionError("Opps ocurrio un error de conexion");
            } else {
              alert("Opps ocurrio un error de conexion");
            }
          }
        });

        const btnAbrirPaciente = document.createElement("button");
        btnAbrirPaciente.type = "button";
        btnAbrirPaciente.className = "agenda-action-btn is-open";
        btnAbrirPaciente.title = "Abrir en Paciente";
        btnAbrirPaciente.setAttribute("aria-label", "Buscar paciente");
        btnAbrirPaciente.innerHTML = getAgendaHeroIcon("magnifying-glass");
        btnAbrirPaciente.addEventListener("click", async () => {
          if (btnAbrirPaciente.disabled) return;
          btnAbrirPaciente.disabled = true;

          try {
            await abrirPacienteDesdeAgenda(item);
          } catch (err) {
            const message = String(err?.message || "No se pudo abrir el paciente");
            try {
              const okManual = await abrirBusquedaManualPacienteDesdeAgenda(item, message);
              if (!okManual) {
                alert(`${message}\nAbra la vista Paciente y busque manualmente.`);
              }
            } catch {
              alert(`${message}\nAbra la vista Paciente y busque manualmente.`);
            }
          } finally {
            if (btnAbrirPaciente.isConnected) {
              btnAbrirPaciente.disabled = false;
            }
          }
        });

        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.className = "agenda-action-btn is-eliminar";
        btnEliminar.title = "Eliminar";
        btnEliminar.setAttribute("aria-label", "Eliminar");
        btnEliminar.innerHTML = getAgendaHeroIcon("trash");
        btnEliminar.addEventListener("click", async () => {
          const idAgenda = Number(item.idAgendaAP || 0);
          if (!idAgenda) {
            alert("No se pudo identificar la cita a eliminar");
            return;
          }

          const okEliminar = typeof window.showSystemConfirm === "function"
            ? await window.showSystemConfirm("Eliminar esta cita de agenda?")
            : confirm("Eliminar esta cita de agenda?");
          if (!okEliminar) return;

          try {
            const res = await fetch(`/api/agenda/${idAgenda}`, {
              method: "DELETE"
            });
            const json = await res.json();
            if (!json?.ok) {
              throw new Error(json?.message || "No se pudo eliminar la cita");
            }

            const idxDia = agendaData.findIndex(x => Number(x.idAgendaAP) === idAgenda);
            if (idxDia >= 0) agendaData.splice(idxDia, 1);

            if (Array.isArray(agendaMesResultados)) {
              agendaMesResultados = agendaMesResultados.filter(
                x => Number(x.idAgendaAP) !== idAgenda
              );
            }

            aplicarFiltros();
          } catch (err) {
            console.error("Error eliminando cita de agenda", err);
            alert("No se pudo eliminar la cita");
          }
        });

        const btnCrear = document.createElement("button");
        btnCrear.type = "button";
        btnCrear.className = "agenda-action-btn is-crear";
        btnCrear.title = "Crear";
        btnCrear.setAttribute("aria-label", "Crear");
        btnCrear.innerHTML = getAgendaHeroIcon("plus");
        btnCrear.addEventListener("click", async () => {
          const nombreAgenda = String(item.nombre || "").trim();
          const contactoAgenda = String(item.contacto || "").trim();

          if (!nombreAgenda) {
            alert("La cita no tiene nombre para crear paciente");
            return;
          }

          try {
            const res = await fetch(
              `/api/paciente/existe?nombre=${encodeURIComponent(nombreAgenda)}&telefono=${encodeURIComponent(contactoAgenda)}`
            );
            const json = await res.json();

            if (!json?.ok) {
              alert(json?.message || "No se pudo validar paciente existente");
              return;
            }

            if (json.exists) {
              alert("Paciente ya existe. No se creara duplicado.");
              return;
            }

            window.__agendaPacientePrefill = {
              NombreP: nombreAgenda,
              telefonoP: formatearTelefonoParaPaciente(contactoAgenda),
              motivoConsultaP: String(item.comentario || "").trim()
            };

            if (typeof window.loadView === "function") {
              window.loadView("Paciente");
            } else {
              alert("No se pudo abrir la vista Paciente");
            }
          } catch (err) {
            console.error("Error validando paciente para crear", err);
            if (window.notifyConnectionError) {
              window.notifyConnectionError("Opps ocurrio un error de conexion");
            } else {
              alert("Opps ocurrio un error de conexion");
            }
          }
        });

        actionsWrap.appendChild(btnEnCola);
        actionsWrap.appendChild(btnReprogramar);
        actionsWrap.appendChild(btnCobrar);
        actionsWrap.appendChild(btnAbrirPaciente);
        actionsWrap.appendChild(btnCrear);
        actionsWrap.appendChild(btnEliminar);
        tdAcciones.appendChild(actionsWrap);
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
      });
    }
    // =========================================
    // FILTROS
    // =========================================
    function filtrarYOrdenar(listaBase, usarFechaExacta) {
      let lista = listaBase.slice();
      const texto = (searchInput.value || "").trim().toLowerCase();
      const estadoSel = estadoFilter.value;
      const contactoSel = String(contactoFilter?.value || "").trim().toLowerCase();
      const fechaISO = dateInput.value;

      if (usarFechaExacta && fechaISO !== "") {
        lista = lista.filter(item => item._fechaISO === fechaISO);
      }

      if (texto !== "") {
        lista = lista.filter(item => {
          const nombre = String(item.nombre || "").toLowerCase();
          const contacto = String(item.contacto || "").toLowerCase();
          return nombre.includes(texto) || contacto.includes(texto);
        });
      }

      if (estadoSel !== "") {
        lista = lista.filter(item =>
          String(item.estado || "").toLowerCase() === estadoSel.toLowerCase()
        );
      }

      if (contactoSel !== "") {
        lista = lista.filter((item) => {
          const hasSms = !!item.sms;
          const hasLlamada = !!item.llamada;

          if (contactoSel === "none") return !hasSms && !hasLlamada;
          if (contactoSel === "sms") return hasSms && !hasLlamada;
          if (contactoSel === "llamada") return hasLlamada && !hasSms;
          if (contactoSel === "both") return hasSms && hasLlamada;
          return true;
        });
      }

      lista.sort((a, b) => {
        if (!a.hora) return 1;
        if (!b.hora) return -1;
        return a.hora.localeCompare(b.hora);
      });

      return lista;
    }

    async function buscarAgendaMesEnBackend() {
      const textoRaw = (searchInput.value || "").trim();
      const fechaISO = dateInput.value;

      if (!textoRaw || !fechaISO) return;

      const token = ++agendaMesBusquedaToken;
      try {
        const res = await fetch(
          `/api/agenda/buscar-mes?q=${encodeURIComponent(textoRaw)}&fecha=${encodeURIComponent(fechaISO)}`
        );
        const json = await res.json();
        if (token !== agendaMesBusquedaToken) return;

        if (!json?.ok) {
          agendaMesResultados = [];
          aplicarFiltros({ dispararFallback: false });
          return;
        }

        const data = Array.isArray(json.data) ? json.data : [];
        agendaMesResultados = data.map(item => normalizarAgendaRow(item, fechaISO, false));
        aplicarFiltros({ dispararFallback: false });
      } catch (err) {
        if (token !== agendaMesBusquedaToken) return;
        console.error("Error buscando agenda por mes", err);
      }
    }

    const buscarAgendaMesDebounced = debounce(() => {
      buscarAgendaMesEnBackend();
    }, 320);

    function aplicarFiltros(opts = {}) {
      const { dispararFallback = true } = opts;
      const texto = (searchInput.value || "").trim();
      const listaLocal = filtrarYOrdenar(agendaData, true);

      if (texto !== "" && Array.isArray(agendaMesResultados)) {
        const listaMes = filtrarYOrdenar(agendaMesResultados, false);
        drawRows(listaMes);
      } else {
        drawRows(listaLocal);
      }

      if (!dispararFallback) return;

      if (!texto) {
        agendaMesResultados = null;
        agendaMesBusquedaToken++;
        return;
      }

      if (listaLocal.length > 0) {
        agendaMesResultados = null;
        agendaMesBusquedaToken++;
        return;
      }

      if (!Array.isArray(agendaMesResultados)) {
        buscarAgendaMesDebounced();
      }
    }

    searchInput.addEventListener("input", () => {
      agendaMesResultados = null;
      agendaMesBusquedaToken++;
      aplicarFiltros();
      persistAgendaUiState();
    });
    estadoFilter.addEventListener("change", () => {
      aplicarFiltros();
      persistAgendaUiState();
    });
    contactoFilter?.addEventListener("change", () => {
      aplicarFiltros();
      persistAgendaUiState();
    });
    toggleNumeracionAgenda?.addEventListener("change", () => {
      aplicarVisibilidadNumeracionAgenda();
      persistAgendaUiState();
    });
    toggleSmsAgenda?.addEventListener("change", () => {
      aplicarVisibilidadContactadoAgenda();
      persistAgendaUiState();
    });
    toggleLlamadaAgenda?.addEventListener("change", () => {
      aplicarVisibilidadContactadoAgenda();
      persistAgendaUiState();
    });
    togglePresenteAgenda?.addEventListener("change", () => {
      aplicarVisibilidadContactadoAgenda();
      persistAgendaUiState();
    });
    aplicarVisibilidadNumeracionAgenda();
    aplicarVisibilidadContactadoAgenda();
    persistAgendaUiState();
    drawRows(agendaData);

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        if (window.__agendaDateNavKeydownHandler) {
          document.removeEventListener("keydown", window.__agendaDateNavKeydownHandler);
          window.__agendaDateNavKeydownHandler = null;
        }

        if (agendaFetchController) {
          try {
            agendaFetchController.abort();
          } catch {
            // ignore abort failures
          }
        }
        agendaFetchController = null;
        agendaFetchDate = "";
        agendaFetchSeq++;
        inasistenciaApplying = false;
        cerrarInasistenciaModal();
        window.__agendaCloseInasistenciaModal = null;

        limpiarBufferReprogramacion();
        resetAgendaModalState();
        closeAgendaModal();
      });
    }
  }
  // =========MONTAR SPA=============================
  function mountAgenda() {
    const content = document.querySelector(".content");
    if (content) renderAgenda(content);
  }
  window.__mountAgenda = mountAgenda;
})();





