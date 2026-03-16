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
  function debounce(fn, delay = 350) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
  function normalizarTexto(value) {
    return String(value || "").trim().toLowerCase();
  }
  function isTokenChar(ch) {
    return /[A-Za-z0-9ÁÉÍÓÚáéíóúÑñÜü]/.test(String(ch || ""));
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
  function renderEstadoSelect(value) {
  const sel = document.createElement("select");
  sel.className = "select-estado " + estadoClassName(value || "Pendiente");

  estados.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;

    // si value es null / "" → Pendiente queda seleccionado
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
      comentario: item.comentarioAP
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
              <input type="checkbox" id="agenda-toggle-numeracion" checked>
              Numeracion
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

            <span id="agenda-reprograma-status" class="agenda-reprograma-status" aria-live="polite"></span>

            <select id="agenda-filter-estado" class="filter-estado">
              <option value="">Todos</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Cancelado">Cancelado</option>
              <option value="Reprogramado">Reprogramado</option>
              <option value="No contesta">No contesta</option>
              <option value="IGS">IGS</option>
            </select>
          </div>
        </div>

        <div class="agenda-table-wrap">
          <table class="agenda-table">
            <thead>
              <tr>
                <th hidden>IdAgendaAP</th>
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
        

      </div>
    `;
    async function cargarAgendaPorFecha(fechaISO) {
    if (!fechaISO) return;
    try {
    const res = await fetch(`/api/agenda?fecha=${fechaISO}`);
    const json = await res.json();

    if (!json.ok) {
      alert(json.message || "Error al cargar agenda");
      return;
    }
    // limpiar datos actuales del dia y cache de busqueda mensual
    agendaData.length = 0;
    agendaMesResultados = null;
    agendaMesBusquedaToken++;

    // normalizar datos backend -> frontend
    json.data.forEach(item => {
      agendaData.push(normalizarAgendaRow(item, fechaISO, true));
    });

    aplicarFiltros();

  } catch (err) {
    console.error(err);
    if (window.notifyConnectionError) {
      window.notifyConnectionError("Opps ocurrio un error de conexion");
    } else {
      alert("Opps ocurrio un error de conexion");
    }
  }
}
    // ===========REFERENCIAS==============
    const tbody = container.querySelector("#agenda-tbody");
    const agendaTable = container.querySelector(".agenda-table");
    const dateInput = container.querySelector("#agenda-date");
    const searchInput = container.querySelector("#agenda-search");
    const estadoFilter = container.querySelector("#agenda-filter-estado");
    const toggleNumeracionAgenda = container.querySelector("#agenda-toggle-numeracion");
    let pasteCitaBtn = container.querySelector("#agenda-paste-cita");
    let clearReprogramaBtn = container.querySelector("#agenda-clear-reprograma");
    const reprogramaStatusEl = container.querySelector("#agenda-reprograma-status");
    let agendaReprogramaBuffer = null;
    let agendaModalDesdeReprogramacion = false;
    let agendaMesResultados = null;
    let agendaMesBusquedaToken = 0;
    if (searchInput) {
      searchInput.setAttribute("name", `agenda-search-${Date.now()}`);
      searchInput.value = "";
      // Evita autofill agresivo del navegador al recargar (F5).
      searchInput.readOnly = true;
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.readOnly = false;
        searchInput.value = "";
      }, 80);
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.value = "";
      }, 350);
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.value = "";
      }, 1200);
    }
    function numeracionAgendaActiva() {
      return !!toggleNumeracionAgenda?.checked;
    }

    function aplicarVisibilidadNumeracionAgenda() {
      if (!agendaTable) return;
      agendaTable.classList.toggle("hide-numeracion", !numeracionAgendaActiva());
    }
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
    // reemplaza el handler actual por este
    btnGuardar.addEventListener("click", async (ev) => {
  // prevenir comportamiento por defecto (por si hay un form)
  if (ev && typeof ev.preventDefault === "function") ev.preventDefault();

  // referencias a campos del modal (recalculadas por seguridad)
    const nombreEl = document.querySelector("#modal-nombre");
    const horaEl = document.querySelector("#modal-hora");
    const fechaEl = document.querySelector("#modal-fecha");
    const contactoEl = document.querySelector("#modal-contacto");
    const estadoEl = document.querySelector("#modal-estado");
    const comentarioEl = modalComentario || document.querySelector("#modal-comentario");

  // Si algún campo no existe: aviso y no cerrar modal
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
    alert("⛔ Debe seleccionar una FECHA.");
    return;
  }
  if (!nombre) {
    alert("⛔ El campo NOMBRE no puede estar vacío.");
    nombreEl.focus();
    return;
  }
  if (!horaRaw) {
    alert("⛔ El campo HORA no puede estar vacío.");
    horaEl.focus();
    return;
  }
  if (!contacto) {
    alert("⛔ El campo CONTACTO no puede estar vacío.");
    contactoEl.focus();
    return;
  }
  if (!comentario) {
    alert("⛔ El campo COMENTARIO no puede estar vacío.");
    comentarioEl.focus();
    return;
  }

  // autoformatear la hora y validar
  const horaForzada = autoFormatearBasico(horaRaw.toLowerCase());
  if (!validarHora(horaForzada)) {
    alert("⛔ Hora inválida.\nEjemplos válidos:\n 8:00 am\n 1:30 pm");
    horaEl.value = horaForzada; // mostrar autoformateado (si aplica) para que el usuario corrija
    horaEl.focus();
    return;
  }
  // convertir a 24h (08:00)
  const hora24 = to24(horaForzada);
  // preparar fecha DD/MM/YYYY
  const fechaDDMM = isoToDDMMYYYY(fechaISO);
  // guardar en agendaData
    try {
  const res = await fetch("/api/agenda", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre,
      hora: hora24,
      fecha: fechaISO,
      contacto,
      estado: estadoValue,
      comentario
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
    comentario
  });

  aplicarFiltros();
  if (agendaModalDesdeReprogramacion) {
    limpiarBufferReprogramacion();
  }
  modal.classList.remove("show");
  resetAgendaModalState();

} catch (err) {
  alert("❌ No se pudo crear la cita");
  console.error(err);
  return;
}


});
    // =============FECHA ACTUAL (FILTRO)===========
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
    // ============FUNCIONES DE EDICIÓN EN TABLA================
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

    async function save() {
    const nuevoValor = input.value.trim();

    // Si no cambió nada, solo restaurar
    if (nuevoValor === valorOriginal) {
      td.textContent = valorOriginal;
      return;
    }

    // Optimistic UI (actualiza primero)
    item[campo] = nuevoValor;
    td.textContent = nuevoValor;

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
      alert("❌ Error al guardar el cambio");
      console.error(err);

      item[campo] = valorOriginal;
      td.textContent = valorOriginal;
    }
  }

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      item[campo] = valorOriginal;
      td.textContent = valorOriginal;
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

      let alreadySaving = false;

      function save() {
        if (alreadySaving) return;
        alreadySaving = true;

        let v = autoFormatearBasico(input.value.trim().toLowerCase());

        if (!validarHora(v)) {
          alert("⛔ Hora inválida.\nEjemplos válidos:\n 8:00 am\n 1:30 pm");
          td.textContent = formatTime12(item.hora);
          aplicarRefuerzoVisualHora(td, item.hora);
          return;
        }

        item.hora = to24(v);
        td.textContent = formatTime12(item.hora);
        aplicarRefuerzoVisualHora(td, item.hora);
      }

      input.addEventListener("keydown", e => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          td.textContent = formatTime12(item.hora);
          aplicarRefuerzoVisualHora(td, item.hora);
        }
      });

      input.addEventListener("blur", save);
    }
    // =========================================
    // DIBUJAR TABLA
    // =========================================
    function drawRows(list) {
      tbody.innerHTML = "";
      aplicarVisibilidadNumeracionAgenda();

      list.forEach((item, index) => {
        const tr = document.createElement("tr");

        // Numeracion
        const tdNum = document.createElement("td");
        tdNum.textContent = String(index + 1);
        tdNum.classList.add("agenda-col-num");
        tr.appendChild(tdNum);

        // Nombre
        const tdNombre = document.createElement("td");
        tdNombre.textContent = item.nombre;
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

          async function save() {
            const nuevoComentario = input.value.trim();

            if (nuevoComentario === valorOriginal) {
              pintarComentarioVisual(span, valorOriginal);
              tdComentario.replaceChild(span, input);
              return;
            }

            item.comentario = nuevoComentario;
            pintarComentarioVisual(span, item.comentario);
            tdComentario.replaceChild(span, input);

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
            }
          }

          input.addEventListener("keydown", e => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              item.comentario = valorOriginal;
              pintarComentarioVisual(span, valorOriginal);
              tdComentario.replaceChild(span, input);
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
        btnEnCola.textContent = "Q";
        btnEnCola.addEventListener("click", async () => {
          const colaApi = window.__colaPacienteAPI;
          if (!colaApi || typeof colaApi.addFromAgenda !== "function") {
            alert("Vista En Cola no disponible");
            return;
          }

          const nombreAgenda = String(item.nombre || "").trim();
          if (!nombreAgenda) {
            alert("La cita no tiene nombre de paciente");
            return;
          }

          let tratamiento = String(item.comentario || "").trim();
          if (!tratamiento) {
            const tratamientoInput = typeof window.showSystemPrompt === "function"
              ? await window.showSystemPrompt("Tratamiento a realizar (opcional):", "")
              : prompt("Tratamiento a realizar (opcional):", "");
            if (tratamientoInput === null) return;
            tratamiento = String(tratamientoInput || "").trim();
          }

          let result = null;
          try {
            result = await colaApi.addFromAgenda({
              agendaId: Number(item.idAgendaAP || 0),
              nombrePaciente: nombreAgenda,
              tratamiento,
              horaAgenda: String(item.hora || ""),
              fechaAgendaISO: String(item._fechaISO || ""),
              contacto: String(item.contacto || "")
            });
          } catch (err) {
            alert(err?.message || "No se pudo enviar a cola");
            return;
          }

          if (!result?.ok) {
            alert(result?.message || "No se pudo enviar a cola");
            return;
          }

          if (result.duplicated) {
            alert("Este paciente ya esta en cola");
            return;
          }

          alert("Paciente agregado a En Cola");
        });

        const btnReprogramar = document.createElement("button");
        btnReprogramar.type = "button";
        btnReprogramar.className = "agenda-action-btn is-reprogramar";
        btnReprogramar.title = "Copiar para reprogramar";
        btnReprogramar.setAttribute("aria-label", "Copiar para reprogramar");
        btnReprogramar.textContent = "++";
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
        btnCobrar.textContent = "$";
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

        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.className = "agenda-action-btn is-eliminar";
        btnEliminar.title = "Eliminar";
        btnEliminar.setAttribute("aria-label", "Eliminar");
        btnEliminar.textContent = "x";
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
        btnCrear.textContent = "+";
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
        actionsWrap.appendChild(btnEliminar);
        actionsWrap.appendChild(btnCrear);
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
    });
    estadoFilter.addEventListener("change", aplicarFiltros);
    toggleNumeracionAgenda?.addEventListener("change", aplicarVisibilidadNumeracionAgenda);
    aplicarVisibilidadNumeracionAgenda();
    drawRows(agendaData);

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
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




