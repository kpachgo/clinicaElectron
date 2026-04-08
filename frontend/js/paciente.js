// js/paciente.js
(function () { 
  // CREAR FILAS DE DIENTES
  //  JSON de doctores
  window.citasPaciente = [];
  window.fotosPaciente = [];
  window.__fotoModalIndex = -1;
  window.pacienteFotoPrincipalId = null;
  const PACIENTE_EDITABLE_IDS = [
    "NombreP", "direccionP", "telefonoP", "fechaRegistroP", "estadoP", "fechaNacimientoP",
    "recomendadoP", "encargadoP", "motivoConsultaP", "ultimaVisitaP", "duiP",
    "tipoMordidaP", "tipoTratamientoP", "historiaMedicaP", "historiaOdontologicaP",
    "examenClinicoP", "examenRadiologicoP", "examenComplementarioP", "endodonciaP",
    "dienteP", "vitalidadP", "percusionP", "medProvisional", "medTrabajoP",
    "tratamientoP", "notasObservacionP"
  ];
  let pacienteTieneCambiosPendientes = false;
  let pacienteDirtySuspendido = false;
  let pacienteOdontogramaSnapshotBase = "";
  const PACIENTE_REQUEST_KEYS = [
    "buscarPaciente",
    "detallePaciente",
    "fotosPaciente",
    "citasPaciente",
    "historialOdontograma",
    "odontogramaVersion",
    "odontogramaUltimo",
    "doctoresSelect",
    "doctorInfo"
  ];
  const pacienteRequestState = PACIENTE_REQUEST_KEYS.reduce((acc, key) => {
    acc[key] = { seq: 0, controller: null };
    return acc;
  }, {});
  let pacienteViewDisposed = false;
  let isSavingPaciente = false;
  let isSavingCitaPaciente = false;
  let isSavingFirmaPaciente = false;
  let isSavingOdontogramaPaciente = false;
  let isUploadingFotoPaciente = false;
  let isDeletingFotosPaciente = false;
  let isSettingFotoPrincipalPaciente = false;
  let isAuthorizingCitaPaciente = false;
  const MAX_PROCEDIMIENTO_CITA = 500;

function isAbortError(err) {
  return String(err?.name || "") === "AbortError";
}
function abortControllerSafe(controller) {
  if (!controller) return;
  try {
    controller.abort();
  } catch {
    // ignore abort failures
  }
}
function isPacienteViewActive() {
  return (
    !pacienteViewDisposed &&
    window.currentView === "Paciente" &&
    !!document.querySelector(".paciente-container")
  );
}
function abortRequest(key) {
  const state = pacienteRequestState[key];
  if (!state) return;
  abortControllerSafe(state.controller);
  state.controller = null;
}
function invalidateRequest(key) {
  const state = pacienteRequestState[key];
  if (!state) return;
  state.seq += 1;
  abortRequest(key);
}
function beginRequest(key) {
  const state = pacienteRequestState[key];
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
  const state = pacienteRequestState[key];
  if (!state) return;
  if (state.controller === controller) {
    state.controller = null;
  }
}
function isStaleRequest(key, seq) {
  return !isPacienteViewActive() || !pacienteRequestState[key] || seq !== pacienteRequestState[key].seq;
}
function abortAllPacienteRequests() {
  Object.keys(pacienteRequestState).forEach((key) => invalidateRequest(key));
}
// UTILIDADES
function toInputDate(fechaISO) {
  if (!fechaISO) return "";
  return fechaISO.split("T")[0]; // yyyy-MM-dd
}
function hoyInputDateLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function fechaLegible(fechaISO) {
  if (!fechaISO) return "";
  const d = new Date(fechaISO);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}-${mes}-${anio}`;
}
function actualizarEstadoFirmaPaciente(rutaFirma) {
  const estadoEl = document.getElementById("firmaEstadoP");
  if (!estadoEl) return;

  const tieneFirma = String(rutaFirma || "").trim().length > 0;
  estadoEl.textContent = tieneFirma ? "Firma" : "Sin Firma";
  estadoEl.classList.toggle("firma-status-ok", tieneFirma);
  estadoEl.classList.toggle("firma-status-empty", !tieneFirma);
}
function normalizarTextoSimple(value) {
  return String(value ?? "").trim().toLowerCase();
}
function esDoctorRegistroFisicoCita(cita) {
  if (Number(cita?.esRegistroFisico || 0) === 1) return true;
  return normalizarTextoSimple(cita?.nombreDoctor) === "registro fisico";
}
function citaEstaAutorizada(cita) {
  const estado = normalizarTextoSimple(cita?.estadoAutorizacionCP);
  return estado === "autorizada" || esDoctorRegistroFisicoCita(cita);
}
function citaPuedeVerFirmaSello(cita) {
  if (Number(cita?.puedeVerDoctor || 0) === 1) return true;
  return citaEstaAutorizada(cita);
}
function renderAccionCita(cita, idCita) {
  if (!Number(cita?.idDoctor || 0)) {
    return `<span class="cita-estado-chip cita-estado-autorizada">Sin doctor</span>`;
  }
  if (esDoctorRegistroFisicoCita(cita)) {
    return `<span class="cita-estado-chip cita-estado-fisico">Autorizado en fisico</span>`;
  }
  if (citaEstaAutorizada(cita)) {
    return `<span class="cita-estado-chip cita-estado-autorizada">Autorizado</span>`;
  }
  return `
    <span class="cita-accion-wrap">
      <span class="cita-estado-chip cita-estado-pendiente">Pendiente</span>
      <button class="btn-autorizar-cita" data-cita-id="${idCita}" type="button">Autorizar</button>
    </span>
  `;
}
function getPacienteFotoDefaultSvg() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect x="4" y="4" width="112" height="112" rx="18" fill="#b7c3d5" stroke="#0c1738" stroke-width="6"/>
  <circle cx="60" cy="48" r="14" fill="#f3f4f6" stroke="#0c1738" stroke-width="6"/>
  <path d="M30 96c2-18 15-30 30-30s28 12 30 30" fill="#f3f4f6" stroke="#0c1738" stroke-width="6" stroke-linecap="round"/>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function sincronizarFotoPrincipalPaciente() {
  const fotos = Array.isArray(window.fotosPaciente) ? window.fotosPaciente : [];
  if (fotos.length === 0) {
    window.pacienteFotoPrincipalId = null;
    return;
  }

  const actual = Number(
    window.pacienteFotoPrincipalId ||
    window.pacienteActual?.fotoPrincipalId ||
    0
  );
  if (actual && fotos.some(f => Number(f.id) === actual)) {
    window.pacienteFotoPrincipalId = actual;
    return;
  }
  window.pacienteFotoPrincipalId = null;
}
async function setFotoPrincipalPaciente(fotoId) {
  const id = Number(fotoId || 0);
  if (!id) return;
  if (isSettingFotoPrincipalPaciente) return;
  const idPaciente = Number(window.pacienteActual?.idPaciente || 0);
  if (!idPaciente) return;
  if (!Array.isArray(window.fotosPaciente) || !window.fotosPaciente.some(f => Number(f.id) === id)) {
    return;
  }

  isSettingFotoPrincipalPaciente = true;
  try {
    const res = await fetch("/api/foto-paciente/principal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pacienteId: idPaciente, idFotoPaciente: id })
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      alert(json.message || "No se pudo guardar la foto principal");
      return;
    }

    window.pacienteFotoPrincipalId = id;
    if (window.pacienteActual) {
      window.pacienteActual.fotoPrincipalId = id;
    }
    renderFotosPaciente();
  } catch (err) {
    console.error("Error guardando foto principal", err);
    alert("Error al guardar la foto principal");
  } finally {
    isSettingFotoPrincipalPaciente = false;
  }
}
function renderFotoPrincipalPaciente() {
  const img = document.getElementById("paciente-foto-principal-img");
  const nombre = document.getElementById("paciente-foto-principal-nombre");
  const estado = document.getElementById("paciente-foto-principal-estado");
  const ayuda = document.getElementById("paciente-foto-principal-ayuda");
  if (!img || !nombre || !estado || !ayuda) return;

  const nombrePaciente = String(window.pacienteActual?.NombreP || "Paciente");
  nombre.textContent = nombrePaciente;

  const fotos = Array.isArray(window.fotosPaciente) ? window.fotosPaciente : [];
  if (fotos.length === 0) {
    img.src = getPacienteFotoDefaultSvg();
    img.dataset.index = "";
    img.classList.remove("is-clickable");
    img.removeAttribute("title");
    estado.textContent = "Sin foto principal";
    ayuda.textContent = "Seleccione una foto del registro para marcarla como principal.";
    return;
  }

  sincronizarFotoPrincipalPaciente();
  const principalId = Number(window.pacienteFotoPrincipalId || 0);
  const fotoPrincipal = fotos.find(f => Number(f.id) === principalId);

  if (!fotoPrincipal) {
    img.src = getPacienteFotoDefaultSvg();
    img.dataset.index = "";
    img.classList.remove("is-clickable");
    img.removeAttribute("title");
    estado.textContent = "Sin foto principal";
    ayuda.textContent = "Seleccione una foto del registro para marcarla como principal.";
    return;
  }

  const idxPrincipal = fotos.findIndex(f => Number(f.id) === Number(fotoPrincipal.id));
  img.dataset.index = idxPrincipal >= 0 ? String(idxPrincipal) : "";
  img.classList.add("is-clickable");
  img.title = "Click para ampliar";
  img.src = fotoPrincipal?.ruta || getPacienteFotoDefaultSvg();
  estado.textContent = "Foto principal";
  ayuda.textContent = "Vista previa del paciente. Puede cambiarse desde Registro de Fotografias.";
}
// CREAR FILAS DE DIENTES
function crearFila(lista) {
    return lista.map(num => `
        <div class="tooth" data-pieza="${num}">
            <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" data-pieza="${num}">
                
                <!-- Contorno -->
                <circle cx="50" cy="50" r="44" stroke="#444" fill="none"></circle>

                <!-- MESIAL -->
                <path id="pieza-${num}-mesial" class="surface" data-surface="mesial" data-pieza="${num}" 
                    stroke="#444" fill="transparent" d="
                        M 24.544155877284282 24.54415587728429
                        A 36 36 0 0 1 75.45584412271572 24.54415587728429
                        L 62.72792206135786 37.27207793864214
                        A 18 18 0 0 0 37.27207793864214 37.27207793864214
                        Z
                "></path>

                <!-- VESTIBULAR -->
                <path id="pieza-${num}-vestibular" class="surface" data-surface="vestibular" data-pieza="${num}" 
                    stroke="#444" fill="transparent" d="
                        M 75.45584412271572 24.54415587728429
                        A 36 36 0 0 1 75.45584412271572 75.45584412271572
                        L 62.72792206135786 62.72792206135786
                        A 18 18 0 0 0 62.72792206135786 37.27207793864214
                        Z
                "></path>

                <!-- DISTAL -->
                <path id="pieza-${num}-distal" class="surface" data-surface="distal" data-pieza="${num}" 
                    stroke="#444" fill="transparent" d="
                        M 75.45584412271572 75.45584412271572
                        A 36 36 0 0 1 24.54415587728429 75.45584412271572
                        L 37.27207793864214 62.72792206135786
                        A 18 18 0 0 0 62.72792206135786 62.72792206135786
                        Z
                "></path>

                <!-- PALATINA / LINGUAL -->
                <path id="pieza-${num}-palatina" class="surface" data-surface="palatina" data-pieza="${num}" 
                    stroke="#444" fill="transparent" d="
                        M 24.54415587728429 75.45584412271572
                        A 36 36 0 0 1 24.544155877284282 24.54415587728429
                        L 37.27207793864214 37.27207793864214
                        A 18 18 0 0 0 37.27207793864214 62.72792206135786
                        Z
                "></path>

                <!-- OCLUSAL -->
                <circle id="pieza-${num}-oclusal" class="surface" data-surface="oclusal" data-pieza="${num}"
                    cx="50" cy="50" r="14" stroke="#444" fill="transparent">
                </circle>

            </svg>

            <div class="tooth-label">${num}</div>
            <input type="text" class="tooth-note" data-pieza="${num}">
        </div>
    `).join("");
}
function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
function blindarInputContraAutofill(input, namePrefix) {
  if (!input) return;
  input.setAttribute("name", `${namePrefix}-${Date.now()}`);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  input.value = "";
  // Evita autofill agresivo del navegador al montar/recargar.
  input.readOnly = true;
  setTimeout(() => {
    if (!input.isConnected) return;
    input.readOnly = false;
    input.value = "";
  }, 80);
  setTimeout(() => {
    if (!input.isConnected) return;
    input.value = "";
  }, 350);
  setTimeout(() => {
    if (!input.isConnected) return;
    input.value = "";
  }, 1200);
}
async function runPacienteLoadingFlow(_initialText, runner) {
  if (window.__pacienteLoading) return false;
  window.__pacienteLoading = true;
  try {
    return await runner();
  } finally {
    window.__pacienteLoading = false;
  }
}
async function cargarPacienteCompleto(idPaciente) {
  return runPacienteLoadingFlow("Cargando paciente...", async () => {
    const okPaciente = await cargarPaciente(idPaciente);
    if (!okPaciente) return false;
    limpiarOdontogramaActivoEnVista({ clearHistorial: false });
    await cargarHistorialOdontogramas(idPaciente);
    await cargarUltimoOdontogramaPaciente({
      silentNoData: true,
      silentSuccess: true
    });
    return true;
  });
}
async function abrirPacientePendienteSiExiste() {
  const idPaciente = Number(window.__pacienteAbrirPendienteId || 0);
  if (!idPaciente) return false;
  window.__pacienteAbrirPendienteId = 0;
  const ok = await cargarPacienteCompleto(idPaciente);
  if (!ok) {
    alert("No se pudo cargar el paciente seleccionado");
  }
  return ok;
}
function aplicarBusquedaManualPendienteSiExiste() {
  const pendiente = window.__pacienteBusquedaManualPendiente;
  if (!pendiente) return false;

  window.__pacienteBusquedaManualPendiente = null;

  const input = document.getElementById("buscar-paciente-p");
  if (!input) return false;

  const query = String(pendiente.query || "").trim();
  if (query) {
    input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    input.value = "";
  }

  input.focus();

  const msg = String(pendiente.message || "").trim();
  if (msg) {
    alert(`${msg}\nUse el buscador para seleccionar manualmente el paciente.`);
  }
  return true;
}
function fechaOdontogramaLabel(fechaISO) {
  if (!fechaISO) return "Sin fecha";
  const soloFecha = String(fechaISO).split("T")[0];
  const [y, m, d] = soloFecha.split("-");
  if (!y || !m || !d) return soloFecha;
  return `${d}-${m}-${y}`;
}
function llenarSelectFechasOdontograma(historial, selectedId = null) {
  const select = document.getElementById("fechaO");
  if (!select) return;

  select.innerHTML = "";

  if (!Array.isArray(historial) || historial.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Sin registros";
    select.appendChild(option);
    return;
  }

  historial.forEach(item => {
    const idOdontograma = Number(item.idOdontograma || item.IdOdontograma || 0);
    const option = document.createElement("option");
    option.value = String(idOdontograma);
    option.textContent = fechaOdontogramaLabel(item.fechaO || item.FechaO);
    select.appendChild(option);
  });

  if (selectedId) {
    select.value = String(selectedId);
  } else {
    select.selectedIndex = 0;
  }
}
async function cargarHistorialOdontogramas(idPaciente, selectedId = null) {
  const select = document.getElementById("fechaO");
  if (!select) return [];

  const idPacienteNum = Number(idPaciente || 0);
  if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0) {
    invalidateRequest("historialOdontograma");
    llenarSelectFechasOdontograma([]);
    return [];
  }

  const req = beginRequest("historialOdontograma");
  const localSeq = req.seq;

  try {
    const res = await fetch(`/api/odontograma/historial/${idPacienteNum}`, {
      signal: req.signal
    });
    const json = await res.json();

    if (isStaleRequest("historialOdontograma", localSeq)) return [];

    if (!json.ok || !Array.isArray(json.data)) {
      llenarSelectFechasOdontograma([]);
      return [];
    }

    llenarSelectFechasOdontograma(json.data, selectedId);
    return json.data;
  } catch (err) {
    if (isAbortError(err)) return [];
    console.error("Error cargando historial de odontogramas", err);
    llenarSelectFechasOdontograma([]);
    return [];
  } finally {
    endRequest("historialOdontograma", req.controller);
  }
}
function actualizarColorEstadoPaciente() {
  const estado = document.getElementById("estadoP");
  if (!estado) return;

  estado.classList.remove("estado-activo", "estado-inactivo");
  if (estado.value === "1") estado.classList.add("estado-activo");
  if (estado.value === "0") estado.classList.add("estado-inactivo");
}
function actualizarColorTipoTratamiento() {
  const tratamiento = document.getElementById("tipoTratamientoP");
  if (!tratamiento) return;

  tratamiento.classList.remove("tratamiento-ortodoncia", "tratamiento-odontologia");
  if (tratamiento.value === "Ortodoncia") tratamiento.classList.add("tratamiento-ortodoncia");
  if (tratamiento.value === "Odontologia") tratamiento.classList.add("tratamiento-odontologia");
}
function actualizarColorTipoMordida() {
  const mordida = document.getElementById("tipoMordidaP");
  if (!mordida) return;

  mordida.classList.remove("mordida-clase");
  const valor = String(mordida.value || "").trim().toLowerCase();
  if (valor.startsWith("clase")) {
    mordida.classList.add("mordida-clase");
  }
}
function setPacienteCambiosPendientes(valor) {
  pacienteTieneCambiosPendientes = Boolean(valor);
}
function onPacienteInputEditable() {
  if (pacienteDirtySuspendido) return;
  setPacienteCambiosPendientes(true);
}
function bindPacienteDirtyTracking() {
  PACIENTE_EDITABLE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.pacienteDirtyBound === "true") return;
    el.dataset.pacienteDirtyBound = "true";
    el.addEventListener("input", onPacienteInputEditable);
    el.addEventListener("change", onPacienteInputEditable);
  });
}
function withPacienteDirtySuspend(runner) {
  pacienteDirtySuspendido = true;
  try {
    return runner();
  } finally {
    pacienteDirtySuspendido = false;
  }
}
function normalizarOdontogramaParaComparacion(data) {
  const cloned = JSON.parse(JSON.stringify(data || {}));
  if (!cloned.meta || typeof cloned.meta !== "object") {
    cloned.meta = {};
    return cloned;
  }
  delete cloned.meta.fecha_guardado;
  delete cloned.meta.fecha_cargado;
  return cloned;
}
function capturarSnapshotOdontogramaActual() {
  if (!window.odontogramaAPI) return "";
  if (typeof window.odontogramaAPI.guardar !== "function") return "";
  if (typeof window.odontogramaAPI.getData !== "function") return "";
  try {
    window.odontogramaAPI.guardar({
      silent: true,
      skipMetaTimestamp: true
    });
    const actual = window.odontogramaAPI.getData();
    return JSON.stringify(normalizarOdontogramaParaComparacion(actual));
  } catch (err) {
    console.error("No se pudo capturar snapshot del odontograma", err);
    return pacienteOdontogramaSnapshotBase || "";
  }
}
function sincronizarSnapshotOdontogramaBase() {
  pacienteOdontogramaSnapshotBase = capturarSnapshotOdontogramaActual();
}
function odontogramaTieneCambiosPendientes() {
  return capturarSnapshotOdontogramaActual() !== pacienteOdontogramaSnapshotBase;
}
function getContextoCambiosPendientesPaciente() {
  const cambiosPaciente = pacienteTieneCambiosPendientes;
  const cambiosOdontograma = odontogramaTieneCambiosPendientes();
  if (!cambiosPaciente && !cambiosOdontograma) return "";

  if (cambiosPaciente && cambiosOdontograma) {
    return "Paciente y Odontograma";
  }
  if (cambiosOdontograma) {
    return "Odontograma";
  }
  return "Paciente";
}
function confirmarCambioPacienteSinGuardar(accion = "salir sin guardar?") {
  const contexto = getContextoCambiosPendientesPaciente();
  if (!contexto) return true;

  const mensaje = `Hay cambios sin guardar en ${contexto}. Desea ${accion}`;
  if (typeof window.showSystemConfirm === "function") {
    return window.showSystemConfirm(mensaje);
  }
  return confirm(mensaje);
}
function registrarGuardCambiosPaciente() {
  if (!window.__setViewLeaveGuard) return;
  window.__setViewLeaveGuard(() => {
    return confirmarCambioPacienteSinGuardar("salir sin guardar?");
  });
}
function setPacienteEdicionHabilitada(habilitada) {
  PACIENTE_EDITABLE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !habilitada;
  });

  const btnGuardarPaciente = document.getElementById("btn-guardar-paciente");
  if (btnGuardarPaciente) btnGuardarPaciente.disabled = !habilitada;
}
function actualizarAccionesPaciente() {
  const tienePacienteConId = !!window.pacienteActual?.idPaciente;
  const pacienteContainer = document.querySelector(".paciente-container");
  if (pacienteContainer) {
    pacienteContainer.classList.toggle("paciente-sin-seleccion", !tienePacienteConId);
  }

  const btnAgregarCita = document.getElementById("citas-add");
  if (btnAgregarCita) btnAgregarCita.disabled = !tienePacienteConId;

  const btnAddFoto = document.getElementById("add-foto");
  const btnDeleteFoto = document.getElementById("delete-foto");
  const inputFoto = document.getElementById("input-foto");
  if (btnAddFoto) btnAddFoto.disabled = !tienePacienteConId;
  if (btnDeleteFoto) btnDeleteFoto.disabled = !tienePacienteConId;
  if (inputFoto) inputFoto.disabled = !tienePacienteConId;

  const cardFotos = document.getElementById("fotos-paciente-card");
  if (cardFotos) cardFotos.classList.toggle("is-disabled-block", !tienePacienteConId);

  const toggleBloqueo = document.getElementById("toggle-bloqueo");
  if (toggleBloqueo) {
    toggleBloqueo.disabled = !tienePacienteConId;
    toggleBloqueo.title = tienePacienteConId
      ? "Bloquear o desbloquear odontograma"
      : "Cargue un paciente para desbloquear odontograma";

    if (!tienePacienteConId && !toggleBloqueo.checked) {
      toggleBloqueo.checked = true;
      toggleBloqueo.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}
function aplicarPrefillDesdeAgendaEnPaciente() {
  const prefill = window.__agendaPacientePrefill;
  if (!prefill) return;

  window.__agendaPacientePrefill = null;
  limpiarVistaPaciente();
  setPacienteEdicionHabilitada(true);
  actualizarAccionesPaciente();

  const fechaRegistro = document.getElementById("fechaRegistroP");
  const nombreEl = document.getElementById("NombreP");
  const telefonoEl = document.getElementById("telefonoP");
  const estadoEl = document.getElementById("estadoP");
  const motivoConsultaEl = document.getElementById("motivoConsultaP");
  const buscarEl = document.getElementById("buscar-paciente-p");

  withPacienteDirtySuspend(() => {
    if (fechaRegistro) fechaRegistro.value = hoyInputDateLocal();
    if (nombreEl) nombreEl.value = String(prefill.NombreP || "").trim();
    if (telefonoEl) telefonoEl.value = String(prefill.telefonoP || "").trim();
    if (estadoEl) estadoEl.value = "1";
    if (motivoConsultaEl) motivoConsultaEl.value = String(prefill.motivoConsultaP || prefill.comentario || "").trim();
    if (buscarEl) buscarEl.value = "";
  });

  actualizarColorEstadoPaciente();
  actualizarColorTipoTratamiento();
  actualizarColorTipoMordida();
  setPacienteCambiosPendientes(true);

  if (nombreEl) nombreEl.focus();
}
// ========================================================
  // RENDER DE LA VISTA PACIENTE
function renderPaciente(container) {
  container.innerHTML = `
    <div class="paciente-container">

      <!--  Buscador -->
    <div class="paciente-busqueda card">
    <h5 class="paciente-titulo">Buscador</h5>
    <div class="p-row">
    <div class="p-col p-60">
    <label class="form-label">Nombre  </label>
      <input
        type="text"
        id="buscar-paciente-p"
        class="form-control"
      >
      <div id="lista-paciente" class="autocomplete-list"></div>
    </div>
    <button class="btn btn-primary btn-firma p-col p-15 btn-action-clear" id="btn-limpiar-vistapaciente">Limpiar Paciente</button>
    <button class="btn btn-primary btn-firma p-col p-15 btn-action-new" id="btn-nuevo-paciente">Nuevo Paciente</button>
    </div>
    </div>

      <!--  Foto principal -->
      <div class="paciente-card card paciente-foto-resumen">
        <div class="paciente-foto-main">
          <img id="paciente-foto-principal-img" class="paciente-foto-avatar" alt="Foto principal del paciente">
          <div class="paciente-foto-data">
            <h6 id="paciente-foto-principal-nombre">Paciente</h6>
            <span id="paciente-foto-principal-estado">Sin foto principal</span>
            <small id="paciente-foto-principal-ayuda">Seleccione una foto del registro para marcarla como principal.</small>
          </div>
        </div>
      </div>


      <!--  Datos Personales -->
      <div class="paciente-card card">
        <h5 class="paciente-titulo">Datos Personales</h5>

        <!-- Fila 1 -->
        <div class="p-row p-row-datos-top">
          <div class="p-col p-col-nombre">
            <label class="form-label">Nombre</label>
            <input type="text" class="form-control" id="NombreP">
          </div>
          <div class="p-col p-col-fecha">
            <label class="form-label">Fecha</label>
            <input type="date" class="form-control" id="fechaRegistroP">
          </div>
          <div class="p-col p-col-estado">
            <label class="form-label">Estado</label>
            <select class="form-control" id="estadoP">
              <option value=""></option>
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </div>
        </div>

        <!-- Fila 2 -->
        <div class="p-row">
          <div class="p-col p-35">
            <label class="form-label">Direccion</label>
            <input type="text" class="form-control" id="direccionP">
          </div>
          <div class="p-col p-20">
            <label class="form-label">Tel</label>
            <input type="text" class="form-control" id="telefonoP">
          </div>
          <div class="p-col p-15">
            <label class="form-label">Edad</label>
            <input type="text" class="form-control" id="edadP" disabled>
          </div>
          <div class="p-col p-20">
            <label class="form-label">Recomendado por</label>
            <select class="form-control" id="recomendadoP">
              <option>Redes</option>
              <option>Paciente</option>
              <option>De camino</option>
            </select>
          </div>
        </div>

        <!-- Fila 3 -->
        <div class="p-row">
          <div class="p-col p-40">
            <label class="form-label">Nombre encargado</label>
            <input type="text" class="form-control" id="encargadoP">
          </div>
          <div class="p-col p-30">
            <label class="form-label">Motivo de consulta</label>
            <input type="text" class="form-control" id="motivoConsultaP">
          </div>
          <div class="p-col p-20">
            <label class="form-label">Ultima visita dentista</label>
            <input type="date" class="form-control" id="ultimaVisitaP">
          </div>
        </div>

        <!-- Fila 4 -->
        <div class="p-row">
          <div class="p-col p-15">
            <label class="form-label">Fecha nacimiento</label>
            <input type="date" class="form-control" id="fechaNacimientoP">
          </div>
          <div class="p-col p-15">
            <label class="form-label">Firma Paciente / Encargado</label>
            <input type="hidden" id="firmaP">
            <div id="firmaEstadoP" class="form-control firma-status firma-status-empty">Sin Firma</div>
          </div>
          <div class="p-col p-10 d-flex-center">
            <button class="btn btn-primary btn-firma" id="btn-ver-firma-paciente">Ver Firma</button>
          </div>
          <div class="p-col p-20">
            <label class="form-label">Dui</label>
            <input type="text" class="form-control" id="duiP">
          </div>
           <div class="p-col p-20">
            <label class="form-label" >Tipo de Tratamiento</label>
            <select class="form-control" id="tipoTratamientoP">
              <option>Sin registrar</option>
              <option>Odontologia</option>
              <option>Ortodoncia</option>
            </select>
          </div>
        </div>
      </div>


      <!--  Datos Clinicos -->
      <div class="paciente-card card">
        <h5 class="paciente-titulo">Datos Clinicos</h5>

        <div class="p-row">
          <div class="p-col p-50">
            <label class="form-label">Historia Medica</label>
            <textarea class="p-textarea" id="historiaMedicaP"></textarea>
          </div>
          <div class="p-col p-45">
            <label class="form-label">Historia Odontologica</label>
            <textarea class="p-textarea" id="historiaOdontologicaP"></textarea>
          </div>
        </div>

        <div class="p-row">
          <div class="p-col p-30">
            <label class="form-label">Examen Clinico</label>
            <input type="text" class="form-control" id="examenClinicoP">
          </div>
          <div class="p-col p-20">
            <label class="form-label">Examen Radiologico</label>
            <input type="text" class="form-control"  id="examenRadiologicoP">
          </div>
          <div class="p-col p-30">
            <label class="form-label">Examen Complementarios</label>
            <input type="text" class="form-control" id="examenComplementarioP">
          </div>
          <div class="p-col p-20">
            <label class="form-label" >Tipo de Mordida</label>
            <select class="form-control" id="tipoMordidaP">
              <option>Sin registrar</option>
              <option>Clase 1</option>
              <option>Clase 2</option>
              <option>Clase 3</option>
            </select>
      </div>
        </div>
      </div>
      


      <!--  Endodoncia-Cirugia -->
      <div class="paciente-card card">
        <h5 class="paciente-titulo">Endodoncia Cirugia</h5>

        <div class="p-row">
          <div class="p-col p-30">
            <label class="form-label">Endodoncia</label>
            <input type="text" class="form-control" id="endodonciaP">
          </div>
          <div class="p-col p-20">
            <label class="form-label">Diente</label>
            <input type="text" class="form-control" id="dienteP">
          </div>
          <div class="p-col p-20">
            <label class="form-label">Vitalidad</label>
            <input type="text" class="form-control" id="vitalidadP">
          </div>
          <div class="p-col p-20">
            <label class="form-label">Percusion</label>
            <input type="text" class="form-control" id="percusionP">
          </div>
        </div>

        <div class="p-row">
          <div class="p-col p-50">
            <label class="form-label">Med. Provisional</label>
            <textarea class="p-textarea" id="medProvisional"></textarea>
          </div>
          <div class="p-col p-45">
            <label class="form-label">Med. de Trabajo</label>
            <textarea class="p-textarea" id="medTrabajoP"></textarea>
          </div>
        </div>
      </div>


      <!--  Odontograma -->
      <div class="paciente-card card">
        <h5 class="paciente-titulo">Odontograma</h5>

        <div class="toolbar">
          <button id="btn-clean">Limpiar</button>
          <button id="btn-clean-one">Limpiar pieza</button>
          <button id="btn-piece-editor">Seleccion por pieza</button>
          <label class="toggle-ios">
            <input type="checkbox" id="toggle-bloqueo">
            <span class="slider"></span>
            <span class="label-text">Bloquear odontograma</span>
          </label>
          <label id="odontogramaActualP">Sin odontograma</label>
          <select class="form-control" id="fechaO">
              <option value="">Sin registros</option>
          </select>
        </div>

        <div class="odontograma-scale-container">
          <div id="odontograma-wrapper">
            <div class="odont-row odont-top">
              ${crearFila([18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28])}
            </div>
            <div class="odont-row odont-mid-top">
              ${crearFila([55,54,53,52,51,61,62,63,64,65])}
            </div>
            <div class="odont-row odont-mid-bottom">
              ${crearFila([85,84,83,82,81,71,72,73,74,75])}
            </div>
            <div class="odont-row odont-bottom">
              ${crearFila([48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38])}
            </div>
          </div>
        </div>

        <button id="btn-guardarOdontograma">Guardar ODT</button>
        <button id="btn-cargarOdontograma">Cargar ODT</button>

        <div id="clean-message" class="menu-hidden">Seleccione una pieza...</div>
        <div id="ppf-message" class="menu-hidden">Seleccione la primera pieza del puente...</div>
        <div id="ppr-message" class="menu-hidden aviso-puente">Seleccione la ultima pieza del PPR...</div>
        <div id="alerta-bloqueo" class="hidden">El odontograma esta bloqueado</div>

        <div id="odonto-piece-modal" class="odonto-piece-modal">
          <div class="odonto-piece-modal-card">
            <div class="odonto-piece-modal-header">
              <h6>Edicion por pieza</h6>
              <button id="odonto-piece-close" type="button" class="odonto-piece-close" aria-label="Cerrar">x</button>
            </div>

            <div class="odonto-piece-top-controls">
              <button id="odonto-piece-prev" type="button" class="odonto-piece-nav" aria-label="Pieza anterior">&#10094;</button>
              <select id="odonto-piece-arcada" class="form-control"></select>
              <select id="odonto-piece-select" class="form-control"></select>
              <button id="odonto-piece-clear" type="button" class="btn-cita-paciente">Borrar pieza</button>
              <button id="odonto-piece-next" type="button" class="odonto-piece-nav" aria-label="Pieza siguiente">&#10095;</button>
            </div>

            <div class="odonto-piece-body">
              <div class="odonto-piece-left">
                <div id="odonto-piece-label" class="odonto-piece-label">Editando pieza</div>
                <div id="odonto-piece-touch-zone" class="odonto-piece-touch-zone">
                  <div id="odonto-piece-tooth-wrap" class="odonto-piece-tooth-wrap"></div>
                </div>
                <input id="odonto-piece-input" type="text" class="form-control odonto-piece-input" placeholder="Nota de pieza">
              </div>
              <div class="odonto-piece-right">
                <div class="odonto-piece-menu-title">Seleccione tratamiento</div>
                <div id="odonto-piece-treatments" class="odonto-piece-treatments"></div>
              </div>
            </div>
          </div>
        </div>

         


      <!--  Diagnostico Final -->
      <div class="paciente-card card">
        <h5 class="paciente-titulo">Diagnostico Final</h5>

        <div class="p-row">
          <div class="p-col p-50">
            <label class="form-label">Diagnostico Final</label>
            <textarea class="p-textarea" id="tratamientoP"></textarea>
          </div>
          <div class="p-col p-45">
            <label class="form-label">Notas Observaciones</label>
            <textarea class="p-textarea" id="notasObservacionP"></textarea>
          </div>
        </div>
         <div class="p-row">
           <button id="btn-guardar-paciente" class="btn-cita-paciente">Guardar Paciente</button>
         </div>
      </div>


      <!-- Y Registro de Fotografias -->
      <div class="paciente-card card" id="fotos-paciente-card">
        <h5 class="paciente-titulo">Registro de Fotografias</h5>

        <div class="fotos-header">
          <button id="add-foto" class="btn-cita-paciente btn-with-icon"><span class="btn-icon">+</span><span>Agregar Fotografia</span></button>
          <button id="delete-foto" class="btn-cita-paciente btn-with-icon"><span class="btn-icon">x</span><span>Eliminar Seleccionadas</span></button>
          <input type="file" id="input-foto" accept="image/*" style="display:none">
        </div>

        <div class="fotos-grid" id="fotos-grid"></div>
      </div>

      <div id="foto-modal" class="foto-modal">
        <span id="modal-close" class="foto-modal-close">&times;</span>
        <button id="foto-prev" class="foto-modal-nav foto-modal-prev" type="button" aria-label="Foto anterior">&#10094;</button>
        <img id="modal-img" class="foto-modal-img">
        <button id="foto-next" class="foto-modal-nav foto-modal-next" type="button" aria-label="Foto siguiente">&#10095;</button>
        <div id="foto-modal-indicador" class="foto-modal-indicador"></div>
      </div>


      <!--  Registro de Citas -->
      <div class="paciente-card card" id="citas-paciente-card">
        <h5 class="paciente-titulo">Registro de Citas</h5>

        <div class="citas-header">
          <input
            class="autofill-trap"
            type="text"
            name="username"
            autocomplete="username"
            tabindex="-1"
            aria-hidden="true"
            style="position:absolute;left:-9999px;opacity:0;pointer-events:none;width:1px;height:1px;"
          >
          <input
            class="autofill-trap"
            type="password"
            name="password"
            autocomplete="current-password"
            tabindex="-1"
            aria-hidden="true"
            style="position:absolute;left:-9999px;opacity:0;pointer-events:none;width:1px;height:1px;"
          >
          <input
            type="search"
            id="citas-search"
            name="citas-search-paciente"
            class="form-control"
            placeholder="Buscar procedimiento..."
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          >
          <button id="citas-add" class="btn-cita-paciente btn-with-icon"><span class="btn-icon">+</span><span>Registrar Cita Paciente</span></button>
        </div>

        <div class="citas-table-wrap">
          <table class="citas-table" id="citaspaciente">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Procedimiento</th>
                <th>Valor</th>
                <th>Abono</th>
                <th>Saldo</th>
                <th>Doctor</th>
                <th>Accion</th>
              </tr>
            </thead>
            <tbody id="citas-tbody"></tbody>
          </table>
        </div>
      </div>

</div> <!-- /.paciente-container -->`;

// ======FIN RENDER PACIENTE  
}
// ======Renderizar tabla de citas del paciente==================
// ========Cargar doctores en el modal=======================
async function cargarDoctoresEnSelect() {
  const select = document.getElementById("cita-doctor");
  if (!select) return;

  const currentUser = typeof window.getCurrentUser === "function"
    ? window.getCurrentUser()
    : null;
  const esDoctorLogueado = currentUser?.rol === "Doctor";

  select.disabled = false;
  select.innerHTML = `<option value="">Seleccione doctor</option>`;

  const req = beginRequest("doctoresSelect");
  const localSeq = req.seq;

  try {
    const res = await fetch("/api/doctor/select?soloActivos=1", {
      signal: req.signal
    });
    const json = await res.json();

    if (isStaleRequest("doctoresSelect", localSeq)) return;
    if (!json.ok || !Array.isArray(json.data)) return;

    if (json.data.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Sin doctores";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }

    json.data.forEach(doc => {
      const opt = document.createElement("option");
      opt.value = doc.idDoctor;
      opt.textContent = doc.nombreD;
      select.appendChild(opt);
    });

    if (esDoctorLogueado && json.doctorVinculado === true && json.data.length === 1) {
      select.value = String(json.data[0].idDoctor);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    if (esDoctorLogueado && json.doctorVinculado === false) {
      select.value = "";
    }

  } catch (err) {
    if (isAbortError(err)) return;
    console.error("Error cargando doctores", err);
  } finally {
    endRequest("doctoresSelect", req.controller);
  }
}
// Renderizar album
function renderFotosPaciente() {
    const grid = document.getElementById("fotos-grid");
    if (!grid) {
      renderFotoPrincipalPaciente();
      return;
    }

    // ordenar fotos por fecha ASC
    window.fotosPaciente.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    sincronizarFotoPrincipalPaciente();
    const principalId = Number(window.pacienteFotoPrincipalId || 0);

    grid.innerHTML = "";

    window.fotosPaciente.forEach((f, idx) => {
        const div = document.createElement("div");
        div.className = "foto-item";
        const esPrincipal = Number(f.id) === principalId;
        div.innerHTML = `
            <div class="foto-media">
              <input type="checkbox" class="foto-select" data-id="${f.id}">
              <img src="${f.ruta}" data-full="${f.ruta}" data-index="${idx}">
              ${esPrincipal ? '<span class="foto-principal-badge">Principal</span>' : ""}
            </div>
            <div class="foto-item-meta">
              <div class="foto-fecha">${f.fecha}</div>
              <div class="foto-item-actions">
                <button type="button" class="foto-principal-btn ${esPrincipal ? "is-active" : ""}" data-id="${f.id}">
                  ${esPrincipal ? "Principal" : "Hacer principal"}
                </button>
              </div>
            </div>
        `;
        grid.appendChild(div);
    });

    renderFotoPrincipalPaciente();
}
async function cargarFotosPaciente(idPaciente) {
  const idPacienteNum = Number(idPaciente || 0);
  if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0) {
    invalidateRequest("fotosPaciente");
    window.fotosPaciente = [];
    renderFotosPaciente();
    return;
  }

  const req = beginRequest("fotosPaciente");
  const localSeq = req.seq;

  try {
    const res = await fetch(`/api/foto-paciente/${idPacienteNum}`, {
      signal: req.signal
    });
    const json = await res.json();

    if (isStaleRequest("fotosPaciente", localSeq)) return;
    if (Number(window.pacienteActual?.idPaciente || 0) !== idPacienteNum) return;

    if (!json.ok) {
      window.fotosPaciente = [];
      renderFotosPaciente();
      return;
    }

    window.fotosPaciente = json.data.map(f => ({
      id: f.idFotoPaciente,
      pacienteId: f.pacienteId,
      fecha: f.fechaFP ? f.fechaFP.split("T")[0] : "",
      ruta: f.rutaFP
    }));

    renderFotosPaciente();

  } catch (err) {
    if (isAbortError(err)) return;
    console.error("Error cargando fotos del paciente", err);
    if (Number(window.pacienteActual?.idPaciente || 0) === idPacienteNum) {
      window.fotosPaciente = [];
      renderFotosPaciente();
    }
  } finally {
    endRequest("fotosPaciente", req.controller);
  }
}
async function subirFotografia(file) {
  if (!window.pacienteActual?.idPaciente) {
    alert("Debe seleccionar un paciente");
    return;
  }
  if (!file) return;
  if (isUploadingFotoPaciente) return;

  isUploadingFotoPaciente = true;
  const formData = new FormData();
  // En multipart el orden importa para multer.filename:
  // enviar campos antes del archivo evita nombres con "undefined".
  formData.append("pacienteId", String(window.pacienteActual.idPaciente));
  formData.append("fecha", new Date().toISOString().split("T")[0]);
  formData.append("foto", file);

  try {
    const res = await fetch("/api/foto-paciente", {
      method: "POST",
      body: formData
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    // Y recargar fotos desde BD
    await cargarFotosPaciente(window.pacienteActual.idPaciente);

  } catch (err) {
    console.error(err);
    alert("Error al subir fotografia");
  } finally {
    isUploadingFotoPaciente = false;
  }
}
async function eliminarFotosSeleccionadas() {
  if (!window.pacienteActual?.idPaciente) {
    alert("Debe cargar un paciente");
    return;
  }
  if (isDeletingFotosPaciente) return;

  const seleccionados = [...document.querySelectorAll(".foto-select:checked")];

  if (seleccionados.length === 0) {
    alert("Seleccione al menos una fotografia");
    return;
  }

  const okEliminar = typeof window.showSystemConfirm === "function"
    ? await window.showSystemConfirm(`Eliminar ${seleccionados.length} fotografia(s)?`)
    : confirm(`Eliminar ${seleccionados.length} fotografia(s)?`);
  if (!okEliminar) {
    return;
  }

  isDeletingFotosPaciente = true;
  try {
    const idsEliminados = new Set();

    for (let sel of seleccionados) {
      const fotoId = Number(sel.dataset.id);
      if (fotoId) idsEliminados.add(fotoId);

      const res = await fetch(`/api/foto-paciente/${fotoId}`, {
        method: "DELETE"
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok || !json?.ok) {
        if (res.status === 403) {
          throw new Error("No tiene acceso para borrar la fotografia");
        }
        throw new Error(json?.message || "No se pudo eliminar una fotografia");
      }
    }

    if (idsEliminados.has(Number(window.pacienteFotoPrincipalId || 0))) {
      window.pacienteFotoPrincipalId = null;
      if (window.pacienteActual) {
        window.pacienteActual.fotoPrincipalId = null;
      }
    }

    // Y recargar
    await cargarFotosPaciente(window.pacienteActual.idPaciente);

    //  mensaje final
    alert("Fotografia(s) eliminada(s) correctamente");

  } catch (err) {
    console.error("Error eliminando fotografias", err);
    const msg = String(err?.message || "").trim();
    alert(msg || "Error al eliminar una o mas fotografias");
  } finally {
    isDeletingFotosPaciente = false;
  }
}
// Modal de foto
function initFotoModal() {
    const modal = document.getElementById("foto-modal");
    const modalImg = document.getElementById("modal-img");
    const btnPrev = document.getElementById("foto-prev");
    const btnNext = document.getElementById("foto-next");
    const btnClose = document.getElementById("modal-close");
    const indicador = document.getElementById("foto-modal-indicador");
    if (!modal || !modalImg || !btnPrev || !btnNext || !btnClose || !indicador) return;

    const getFotos = () => Array.isArray(window.fotosPaciente) ? window.fotosPaciente : [];

    let swipeStartX = null;
    let swipeStartY = null;
    let swipePointerId = null;
    let swipeActive = false;
    let pinchInProgress = false;
    let suppressBackdropClickUntil = 0;

    function resetSwipeState() {
      swipeStartX = null;
      swipeStartY = null;
      swipePointerId = null;
      swipeActive = false;
      pinchInProgress = false;
    }

    function isModalVisible() {
      return modal.style.display === "flex";
    }

    function shouldIgnoreSwipeTarget(target) {
      return Boolean(
        target?.closest?.(".foto-modal-nav") ||
        target?.closest?.(".foto-modal-close")
      );
    }

    function cerrarModalFoto() {
      modal.style.display = "none";
      modalImg.src = "";
      indicador.textContent = "";
      window.__fotoModalIndex = -1;
      resetSwipeState();
      suppressBackdropClickUntil = 0;
    }

    function mostrarFotoModal(index) {
      const fotos = getFotos();
      if (!fotos.length) {
        cerrarModalFoto();
        return;
      }

      let nextIndex = Number(index);
      if (!Number.isInteger(nextIndex)) nextIndex = 0;
      if (nextIndex < 0) nextIndex = fotos.length - 1;
      if (nextIndex >= fotos.length) nextIndex = 0;

      window.__fotoModalIndex = nextIndex;
      const foto = fotos[nextIndex];
      modalImg.src = foto.ruta;
      modalImg.alt = `Fotografia ${nextIndex + 1}`;
      indicador.textContent = `${nextIndex + 1} / ${fotos.length}`;

      const disableNav = fotos.length <= 1;
      btnPrev.disabled = disableNav;
      btnNext.disabled = disableNav;

      modal.style.display = "flex";
    }

    if (window.__pacienteFotoModalHandler) {
      document.removeEventListener("click", window.__pacienteFotoModalHandler);
    }
    window.__pacienteFotoModalHandler = e => {
      if (e.target.closest(".foto-principal-btn")) {
        return;
      }
      if (e.target.id === "paciente-foto-principal-img") {
        const idx = Number(e.target.dataset.index ?? -1);
        if (idx >= 0) {
          mostrarFotoModal(idx);
        }
        return;
      }
      if (e.target.matches(".foto-item img")) {
        const idx = Number(e.target.dataset.index ?? -1);
        mostrarFotoModal(idx >= 0 ? idx : 0);
        return;
      }
      if (e.target === modal) {
        if (Date.now() < suppressBackdropClickUntil) return;
        cerrarModalFoto();
      }
    };
    document.addEventListener("click", window.__pacienteFotoModalHandler);

    if (window.__pacienteFotoModalKeyHandler) {
      document.removeEventListener("keydown", window.__pacienteFotoModalKeyHandler);
    }
    window.__pacienteFotoModalKeyHandler = e => {
      if (modal.style.display !== "flex") return;
      if (e.key === "Escape") {
        e.preventDefault();
        cerrarModalFoto();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        mostrarFotoModal((window.__fotoModalIndex ?? 0) - 1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        mostrarFotoModal((window.__fotoModalIndex ?? 0) + 1);
      }
    };
    document.addEventListener("keydown", window.__pacienteFotoModalKeyHandler);

    function resolverSwipe(deltaX) {
      if (Math.abs(deltaX) < 40) return;
      if (deltaX > 0) {
        mostrarFotoModal((window.__fotoModalIndex ?? 0) - 1);
      } else {
        mostrarFotoModal((window.__fotoModalIndex ?? 0) + 1);
      }
    }

    // Swipe sobre todo el modal para tablets: no depende de tocar exactamente la imagen.
    if ("PointerEvent" in window) {
      modal.onpointerdown = e => {
        if (!isModalVisible()) return;
        if (e.pointerType === "touch") return;
        if (shouldIgnoreSwipeTarget(e.target)) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
        swipePointerId = e.pointerId;
        swipeActive = true;
      };
      modal.onpointerup = e => {
        if (!isModalVisible()) return;
        if (e.pointerType === "touch") return;
        if (!swipeActive) return;
        if (swipePointerId !== null && e.pointerId !== swipePointerId) return;
        if (swipeStartX === null || swipeStartY === null) return;
        const deltaX = e.clientX - swipeStartX;
        const deltaY = e.clientY - swipeStartY;
        if (Math.abs(deltaX) > Math.abs(deltaY) + 8 && Math.abs(deltaX) >= 50) {
          resolverSwipe(deltaX);
          suppressBackdropClickUntil = Date.now() + 260;
        }
        resetSwipeState();
      };
      modal.onpointercancel = () => {
        resetSwipeState();
      };
    } else {
      modal.onpointerdown = null;
      modal.onpointerup = null;
      modal.onpointercancel = null;
    }

    modal.ontouchstart = e => {
      if (!isModalVisible()) return;
      if (shouldIgnoreSwipeTarget(e.target)) {
        resetSwipeState();
        return;
      }
      if (!e.touches || e.touches.length !== 1) {
        pinchInProgress = true;
        swipeActive = false;
        swipeStartX = null;
        swipeStartY = null;
        return;
      }
      pinchInProgress = false;
      swipeActive = true;
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
    };
    modal.ontouchmove = e => {
      if (!isModalVisible() || !swipeActive) return;
      if (!e.touches || e.touches.length !== 1) {
        pinchInProgress = true;
        swipeActive = false;
        return;
      }
      if (swipeStartX === null || swipeStartY === null) return;
      const dx = e.touches[0].clientX - swipeStartX;
      const dy = e.touches[0].clientY - swipeStartY;
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) + 4) {
        e.preventDefault();
      }
    };
    modal.ontouchend = e => {
      if (!isModalVisible()) {
        resetSwipeState();
        return;
      }
      if (pinchInProgress) {
        if (!e.touches || e.touches.length === 0) {
          pinchInProgress = false;
        }
        resetSwipeState();
        return;
      }
      if (!swipeActive || swipeStartX === null || swipeStartY === null) {
        resetSwipeState();
        return;
      }
      if (!e.changedTouches || !e.changedTouches.length) {
        resetSwipeState();
        return;
      }
      const deltaX = e.changedTouches[0].clientX - swipeStartX;
      const deltaY = e.changedTouches[0].clientY - swipeStartY;
      if (Math.abs(deltaX) > Math.abs(deltaY) + 8 && Math.abs(deltaX) >= 50) {
        resolverSwipe(deltaX);
        suppressBackdropClickUntil = Date.now() + 260;
      }
      resetSwipeState();
    };
    modal.ontouchcancel = () => {
      resetSwipeState();
    };

    btnPrev.onclick = () => mostrarFotoModal((window.__fotoModalIndex ?? 0) - 1);
    btnNext.onclick = () => mostrarFotoModal((window.__fotoModalIndex ?? 0) + 1);
    btnClose.onclick = cerrarModalFoto;
}
function initFotoPrincipalSelector() {
    if (window.__pacienteFotoPrincipalHandler) {
      document.removeEventListener("click", window.__pacienteFotoPrincipalHandler);
    }

    window.__pacienteFotoPrincipalHandler = e => {
      const btn = e.target.closest(".foto-principal-btn");
      if (!btn) return;
      e.preventDefault();

      const fotoId = Number(btn.dataset.id || 0);
      if (!fotoId) return;
      setFotoPrincipalPaciente(fotoId);
    };

    document.addEventListener("click", window.__pacienteFotoPrincipalHandler);
}
// Inicializar en mountPaciente
function initFotosPaciente() {
    document.getElementById("add-foto").onclick = () => {
        document.getElementById("input-foto").click();
    };

    document.getElementById("input-foto").onchange = e => {
        subirFotografia(e.target.files[0]);
    };

    document.getElementById("delete-foto").onclick = eliminarFotosSeleccionadas;

    initFotoPrincipalSelector();
    initFotoModal();
    renderFotosPaciente();
}
// =============MODAL: Abrir / Cerrar / Guardar===========================
async function abrirModalCita() {
    if (!window.pacienteActual?.idPaciente) {
      alert("Debe cargar un paciente para registrar cita");
      return;
    }
    editingCitaId = null;

    //  LIMPIAR CAMPOS
    document.getElementById("cita-fecha").value = hoyInputDateLocal();
    const citaProcedimientoInput = document.getElementById("cita-procedimiento");
    if (citaProcedimientoInput) {
      citaProcedimientoInput.value = "";
      citaProcedimientoInput.maxLength = MAX_PROCEDIMIENTO_CITA;
    }
    document.getElementById("cita-valor").value = "";
    document.getElementById("cita-abono").value = "";
    document.getElementById("cita-doctor").value = "";
    await cargarDoctoresEnSelect();

    document
      .getElementById("modal-cita-paciente")
      .classList.add("show");
}
function cerrarModalCita() {
    document.getElementById("modal-cita-paciente").classList.remove("show");
}
async function guardarCitaPaciente() {
  if (isSavingCitaPaciente) return;
  const fecha = document.getElementById("cita-fecha").value;
  const procedimiento = String(document.getElementById("cita-procedimiento").value || "").trim();
  const valorRaw = document.getElementById("cita-valor").value;
  const abonoRaw = document.getElementById("cita-abono").value;
  const doctorRaw = document.getElementById("cita-doctor").value;

  const valor = valorRaw === "" ? 0 : Number(valorRaw);
  const abono = abonoRaw === "" ? 0 : Number(abonoRaw);
  const doctorId = doctorRaw === "" ? null : Number(doctorRaw);

  if (!window.pacienteActual?.idPaciente) {
    alert("Paciente no valido");
    return;
  }

  if (!fecha || !procedimiento) {
    alert("Fecha y procedimiento son obligatorios");
    return;
  }
  if (procedimiento.length > MAX_PROCEDIMIENTO_CITA) {
    alert(`El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres (actual: ${procedimiento.length}).`);
    return;
  }

  if (
    !Number.isFinite(valor) ||
    !Number.isFinite(abono) ||
    valor < 0 ||
    abono < 0 ||
    (doctorId !== null && (!Number.isInteger(doctorId) || doctorId <= 0))
  ) {
    alert("Revise valor, abono o doctor");
    return;
  }

  isSavingCitaPaciente = true;
  try {
    const res = await fetch("/api/paciente/cita", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idPaciente: window.pacienteActual.idPaciente,
        fecha,
        procedimiento,
        valor,
        abono,
        doctorId
      })
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    cerrarModalCita();
    await cargarCitasPaciente(window.pacienteActual.idPaciente);

  } catch (err) {
    console.error(err);
    alert(err?.message || "Error al guardar cita");
  } finally {
    isSavingCitaPaciente = false;
  }
}
async function actualizarCitaPacienteEnBD(cita) {
  const idCita = Number(
    cita.idCitasPaciente ??
    cita.idcitasPaciente ??
    cita.idCitaPaciente ??
    cita.IdCitasPaciente ??
    cita.IdcitasPaciente ??
    cita.id ??
    cita.ID
  );
  if (!idCita) throw new Error("ID de cita invalido");

  const payload = {
    fecha: toInputDate(cita.fechaCP),
    procedimiento: String(cita.ProcedimientoCP || "").trim(),
    valor: Number(cita.valorCP || 0),
    abono: Number(cita.abonoCP || 0)
  };
  if (payload.procedimiento.length > MAX_PROCEDIMIENTO_CITA) {
    throw new Error(
      `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres (actual: ${payload.procedimiento.length}).`
    );
  }

  const res = await fetch(`/api/paciente/cita/${idCita}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.message || "No se pudo actualizar la cita");
}
// ============= Edicion en linea (inline edit) de la tabla de citas========================================
function activarEdicionCitas() {
        if (window.__pacienteEdicionCitasHandler) {
          document.removeEventListener("dblclick", window.__pacienteEdicionCitasHandler);
        }

        window.__pacienteEdicionCitasHandler = function (e) {
        const tbody = document.getElementById("citas-tbody");
        if (!tbody || !tbody.contains(e.target)) return;

        const td = e.target.closest("td");
        if (!td) return;

        const tr = td.parentElement;
        const rowIndex = Number(tr.dataset.rowIndex);
        if (!Number.isInteger(rowIndex) || rowIndex < 0) return;

        const vista = Array.isArray(window.citasPacienteView)
          ? window.citasPacienteView
          : window.citasPaciente;
        const cita = vista[rowIndex];
        if (!cita) return;

        // Evitar editar doctor o accion
        const colIndex = [...td.parentNode.children].indexOf(td);
        if (colIndex >= 5) return; // columnas Doctor y Accion no editables

        let field = "";
        switch (colIndex) {
            case 0: field = "fechaCP"; break;
            case 1: field = "ProcedimientoCP"; break;
            case 2: field = "valorCP"; break;
            case 3: field = "abonoCP"; break;
            default: return;
        }

        const oldValue = cita[field];
        const oldSaldo = cita.saldoCP;

        // Crear input
        const input = document.createElement("input");
        if (field === "fechaCP") {
          input.type = "date";
          input.value = toInputDate(oldValue);
        } else if (field === "valorCP" || field === "abonoCP") {
          input.type = "number";
          input.step = "0.01";
          input.min = "0";
          input.value = oldValue ?? 0;
        } else {
          input.type = "text";
          input.value = oldValue ?? "";
          input.maxLength = MAX_PROCEDIMIENTO_CITA;
        }
        input.className = "cita-inline-editor";
        const tdStyle = window.getComputedStyle(td);
        input.style.width = "100%";
        input.style.padding = "6px";
        input.style.fontSize = tdStyle.fontSize;
        input.style.fontWeight = tdStyle.fontWeight;
        input.style.fontFamily = tdStyle.fontFamily;
        input.style.lineHeight = tdStyle.lineHeight;
        input.style.color = tdStyle.color;

        td.innerHTML = "";
        td.appendChild(input);
        input.focus();

        // Guardar cambios
        let saved = false;
        const outsideDownEvent = ("PointerEvent" in window) ? "pointerdown" : "touchstart";
        const onPointerDownOutside = ev => {
          if (saved) return;
          const target = ev.target;
          if (!(target instanceof Node)) return;
          if (td.contains(target)) return;
          input.blur();
          save();
        };
        document.addEventListener(outsideDownEvent, onPointerDownOutside, true);

        function cleanupInlineListeners() {
          document.removeEventListener(outsideDownEvent, onPointerDownOutside, true);
        }
        async function save() {
            if (saved) return;
            saved = true;
            cleanupInlineListeners();
            let newValue = input.value;

            if (field === "ProcedimientoCP") {
              newValue = String(newValue || "").trim();
              if (!newValue) {
                cita[field] = oldValue;
                cita.saldoCP = oldSaldo;
                renderCitasPaciente();
                alert("El procedimiento no puede quedar vacio");
                return;
              }
              if (newValue.length > MAX_PROCEDIMIENTO_CITA) {
                cita[field] = oldValue;
                cita.saldoCP = oldSaldo;
                renderCitasPaciente();
                alert(
                  `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres (actual: ${newValue.length}).`
                );
                return;
              }
            }

            if (field === "valorCP" || field === "abonoCP") {
                newValue = Number(newValue);
                if (isNaN(newValue)) {
                  cita[field] = oldValue;
                  cita.saldoCP = oldSaldo;
                  renderCitasPaciente();
                  alert("Ingrese un numero valido");
                  return;
                }
            }

            cita[field] = newValue;

            // Recalcular saldo
            cita.saldoCP = Number(cita.valorCP || 0) - Number(cita.abonoCP || 0);

            try {
              await actualizarCitaPacienteEnBD(cita);
              renderCitasPaciente();
            } catch (err) {
              console.error(err);
              cita[field] = oldValue;
              cita.saldoCP = oldSaldo;
              renderCitasPaciente();
              alert(err?.message || "No se pudo guardar el cambio.");
            }

        }

        input.addEventListener("blur", () => { save(); });
        input.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") input.blur();
            if (ev.key === "Escape") {
              saved = true;
              cleanupInlineListeners();
              cita[field] = oldValue;
              cita.saldoCP = oldSaldo;
              renderCitasPaciente();
            }
        });
    };

    document.addEventListener("dblclick", window.__pacienteEdicionCitasHandler);
}
function initAutocompletePaciente() {
  const input = document.getElementById("buscar-paciente-p");
  const lista = document.getElementById("lista-paciente");

  if (!input || !lista) return;
  blindarInputContraAutofill(input, "paciente-search");

  const buscar = debounce(async (texto) => {
    lista.innerHTML = "";
    lista.style.display = "none";

    if (texto.length < 3) {
      invalidateRequest("buscarPaciente");
      return;
    }

    const req = beginRequest("buscarPaciente");
    const localSeq = req.seq;

    try {
      const res = await fetch(
        `/api/paciente/search?q=${encodeURIComponent(texto)}`,
        { signal: req.signal }
      );
      const json = await res.json();
      if (isStaleRequest("buscarPaciente", localSeq)) return;
      if (!json.ok) return;

      json.data.forEach(p => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.textContent = p.NombreP;

        div.onclick = async () => {
          const puedeCambiar = await Promise.resolve(
            confirmarCambioPacienteSinGuardar("cargar otro paciente sin guardar?")
          );
          if (!puedeCambiar) return;

          const inputLocal = document.getElementById("buscar-paciente-p");
          const listaLocal = document.getElementById("lista-paciente");

          if (inputLocal) {
            inputLocal.value = p.NombreP;
          }

          if (listaLocal) {
            listaLocal.style.display = "none";
          }

          const cargado = await cargarPacienteCompleto(p.idPaciente);
          if (cargado && inputLocal) {
            inputLocal.value = "";
          }
        };

        lista.appendChild(div);
      });

      if (json.data.length) {
        lista.style.display = "block";
      }

    } catch (err) {
      if (isAbortError(err)) return;
      console.error("Autocomplete paciente error:", err);
    } finally {
      endRequest("buscarPaciente", req.controller);
    }
  }, 350);

  input.addEventListener("input", e => {
    buscar(e.target.value.trim());
  });
}
async function cargarPaciente(idPaciente) {
  const idPacienteNum = Number(idPaciente || 0);
  if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0) {
    alert("Paciente invalido");
    return false;
  }

  const req = beginRequest("detallePaciente");
  const localSeq = req.seq;

  try {
    const res = await fetch(`/api/paciente/${idPacienteNum}`, {
      cache: "no-store",
      signal: req.signal
    });

    const json = await res.json();
    if (isStaleRequest("detallePaciente", localSeq)) return false;
    if (!json.ok) {
      alert(json.message || "Error al cargar paciente");
      return false;
    }
    
    const p = json.data;
    const idPacienteCargado = Number(p.idPaciente || idPacienteNum);
    window.pacienteActual = p; // estado global del paciente
    window.pacienteFotoPrincipalId = Number(p.fotoPrincipalId || 0) || null;
    renderFotoPrincipalPaciente();

    withPacienteDirtySuspend(() => {
      // ================= DATOS PERSONALES =================
      NombreP.value          = p.NombreP || "";
      direccionP.value       = p.direccionP || "";
      telefonoP.value        = p.telefonoP || "";
      fechaRegistroP.value   = toInputDate(p.fechaRegistroP) || "";
      const estadoRaw = p.estadoP ?? p.EstadoP ?? p.estado ?? "";
      let estadoNormalizado = "";
      if (estadoRaw === 1 || estadoRaw === "1") {
        estadoNormalizado = "1";
      } else if (estadoRaw === 0 || estadoRaw === "0") {
        estadoNormalizado = "0";
      } else if (typeof estadoRaw === "string") {
        const estadoTexto = estadoRaw.trim().toLowerCase();
        if (estadoTexto === "activo") estadoNormalizado = "1";
        if (estadoTexto === "inactivo") estadoNormalizado = "0";
      }
      estadoP.value = estadoNormalizado;
      actualizarColorEstadoPaciente();
      fechaNacimientoP.value = toInputDate(p.fechaNacimientoP) || "";
      recomendadoP.value     = p.recomendadoP || "";
      encargadoP.value       = p.encargadoP || "";
      motivoConsultaP.value  = p.motivoConsultaP || "";
      ultimaVisitaP.value    = toInputDate(p.ultimaVisitaP) || "";
      const rutaFirma = String(p.firmaP || "").trim();
      firmaP.value           = rutaFirma;
      actualizarEstadoFirmaPaciente(rutaFirma);
      duiP.value             = p.duiP   || "";

      tipoTratamientoP.value = p.tipoTratamientoP || "Sin registrar";
      actualizarColorTipoTratamiento();
      setPacienteEdicionHabilitada(true);
      actualizarAccionesPaciente();

      // ================= EDAD (CALCULADA) =================
      edadP.value = calcularEdad(p.fechaNacimientoP);

      // ================= HISTORIAS =================
      historiaMedicaP.value         = p.historiaMedicaP || "";
      historiaOdontologicaP.value   = p.historiaOdontologicaP || "";
      tipoMordidaP.value = p.tipomordidaP || "Sin registrar";
      actualizarColorTipoMordida();

      // ================= EXAMENES =================
      examenClinicoP.value          = p.examenClinicoP || "";
      examenRadiologicoP.value      = p.examenRadiologicoP || "";
      examenComplementarioP.value   = p.examenComplementarioP || "";

      // ================= ENDODONCIA / CIRUGIA =================
      endodonciaP.value             = p.endodonciaP || "";
      dienteP.value                 = p.dienteP || "";
      vitalidadP.value              = p.vitalidadP || "";
      percusionP.value              = p.percusionP || "";
      medProvisional.value          = p.medProvisional || "";
      medTrabajoP.value             = p.medTrabajoP || "";

      // ================= DIAGNOSTICO FINAL =================
      tratamientoP.value            = p.tratamientoP || "";
      notasObservacionP.value       = p.notasObservacionP || "";
    });
    // ================= ODONTOGRAMA ACTUAL =================
    const lblOdo = document.getElementById("odontogramaActualP");
    if (lblOdo) {
      lblOdo.textContent = "Sin odontograma";
    }
    await Promise.all([
      cargarFotosPaciente(p.idPaciente),
      cargarCitasPaciente(p.idPaciente)
    ]);
    if (isStaleRequest("detallePaciente", localSeq)) return false;
    if (Number(window.pacienteActual?.idPaciente || 0) !== idPacienteCargado) return false;
    setPacienteCambiosPendientes(false);
    return true;
    
  } catch (err) {
    if (isAbortError(err)) return false;
    console.error("Error cargando paciente:", err);
    if (window.notifyConnectionError) {
      window.notifyConnectionError("Opps ocurrio un error de conexion");
    } else {
      alert("Opps ocurrio un error de conexion");
    }
    return false;
  } finally {
    endRequest("detallePaciente", req.controller);
  }
}
async function cargarCitasPaciente(idPaciente) {
  const idPacienteNum = Number(idPaciente || 0);
  if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0) {
    invalidateRequest("citasPaciente");
    window.citasPaciente = [];
    renderCitasPaciente();
    return;
  }

  const req = beginRequest("citasPaciente");
  const localSeq = req.seq;

  try {
    const res = await fetch(`/api/paciente/${idPacienteNum}/citas`, {
      cache: "no-store",
      signal: req.signal
    });

    const json = await res.json();
    if (isStaleRequest("citasPaciente", localSeq)) return;
    if (Number(window.pacienteActual?.idPaciente || 0) !== idPacienteNum) return;
    if (!json.ok) return;

    // guardar estado real
    window.citasPaciente = json.data;

    // renderizar tabla
    renderCitasPaciente();

  } catch (err) {
    if (isAbortError(err)) return;
    console.error("Error cargando citas del paciente", err);
  } finally {
    endRequest("citasPaciente", req.controller);
  }
}
function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const hoy = new Date();
  const nac = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}
// ============= PARTE DE ODONTOGRAMA ==============================
function actualizarOdontogramaActual(idOdontograma) {
  const lbl = document.getElementById("odontogramaActualP");
  const idActivo = Number(idOdontograma || 0) || null;
  window.ultimoOdontogramaId = idActivo;
  if (!lbl) return;

  lbl.textContent = idActivo
    ? `Odontograma activo (ID ${idActivo})`
    : "Sin odontograma";
}
function limpiarOdontogramaActivoEnVista(options = {}) {
  const { clearHistorial = true } = options;

  if (window.odontogramaAPI && typeof window.odontogramaAPI.reset === "function") {
    window.odontogramaAPI.reset();
    if (typeof window.odontogramaAPI.cargar === "function") {
      window.odontogramaAPI.cargar();
    }
  }

  window.ultimoOdontogramaId = null;
  actualizarOdontogramaActual(null);

  if (clearHistorial) {
    llenarSelectFechasOdontograma([]);
  } else {
    const select = document.getElementById("fechaO");
    if (select) {
      select.value = "";
    }
  }
  sincronizarSnapshotOdontogramaBase();
}
async function guardarOdontogramaEnBD() {
  if (isSavingOdontogramaPaciente) return;
  isSavingOdontogramaPaciente = true;

  try {
    if (!pacienteActual?.idPaciente) {
      alert("Debe cargar un paciente");
      return;
    }

    // 1a Construir JSON (usa tu funcion real)
    window.odontogramaAPI.guardar();

    // 2a Obtener el objeto completo
    const data = window.odontogramaAPI.getData();

    const payload = {
      idPaciente: pacienteActual.idPaciente,
      fechaO: new Date().toISOString().split("T")[0],
      odontograma: JSON.stringify(data)
    };

    if (!data.piezas || Object.keys(data.piezas).length === 0) {
      alert("Odontograma vacio, no se puede guardar");
      console.error(data);
      return;
    }
    const res = await fetch("/api/odontograma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    await cargarHistorialOdontogramas(window.pacienteActual?.idPaciente);
    await cargarUltimoOdontogramaPaciente({
      silentNoData: true,
      silentSuccess: true
    });
    sincronizarSnapshotOdontogramaBase();
    alert("Odontograma guardado");

  } catch (err) {
    console.error(err);
    alert("Error al guardar odontograma");
  } finally {
    isSavingOdontogramaPaciente = false;
  }
}
async function cargarOdontogramaPorId(idOdontograma, options = {}) {
  const {
    silentNoData = false,
    silentSuccess = false
  } = options;

  if (!idOdontograma) {
    if (!silentNoData) {
      alert("Seleccione una fecha de odontograma");
    }
    return false;
  }

  const req = beginRequest("odontogramaVersion");
  const localSeq = req.seq;

  try {
    const res = await fetch(`/api/odontograma/version/${idOdontograma}`, {
      signal: req.signal
    });
    const json = await res.json();
    if (isStaleRequest("odontogramaVersion", localSeq)) return false;

    if (!json.ok || !json.data?.Odontograma) {
      if (!silentNoData) {
        alert("No se encontro esa version de odontograma");
      }
      return false;
    }

    const data = JSON.parse(json.data.Odontograma);
    window.odontogramaAPI.setData(data);

    await new Promise(resolve => requestAnimationFrame(resolve));
    if (isStaleRequest("odontogramaVersion", localSeq)) return false;
    window.odontogramaAPI.cargar();
    actualizarOdontogramaActual(json.data.idOdontograma);
    sincronizarSnapshotOdontogramaBase();

    const select = document.getElementById("fechaO");
    if (select) {
      select.value = String(json.data.idOdontograma);
    }

    if (!silentSuccess) {
      alert("Odontograma cargado correctamente");
    }
    return true;
  } catch (err) {
    if (isAbortError(err)) return false;
    console.error(err);
    alert("Error al cargar odontograma");
    return false;
  } finally {
    endRequest("odontogramaVersion", req.controller);
  }
}
async function cargarUltimoOdontogramaPaciente(options = {}) {
  const {
    silentNoData = false,
    silentSuccess = false
  } = options;

  if (!window.pacienteActual?.idPaciente) {
    invalidateRequest("odontogramaUltimo");
    limpiarOdontogramaActivoEnVista();
    alert("Seleccione un paciente");
    return false;
  }

  const req = beginRequest("odontogramaUltimo");
  const localSeq = req.seq;

  try {
    const res = await fetch(
      `/api/odontograma/ultimo/${window.pacienteActual.idPaciente}`,
      { signal: req.signal }
    );

    const json = await res.json();
    if (isStaleRequest("odontogramaUltimo", localSeq)) return false;

    if (!json.ok || !json.data?.Odontograma) {
      limpiarOdontogramaActivoEnVista({ clearHistorial: false });
      if (!silentNoData) {
        alert("No hay odontograma guardado");
      }
      return false;
    }

    const data = JSON.parse(json.data.Odontograma);

    //  sincronizar odontograma
    window.odontogramaAPI.setData(data);

    await new Promise(resolve => requestAnimationFrame(resolve));
    if (isStaleRequest("odontogramaUltimo", localSeq)) return false;
    window.odontogramaAPI.cargar();
    actualizarOdontogramaActual(json.data.idOdontograma);
    sincronizarSnapshotOdontogramaBase();
    await cargarHistorialOdontogramas(window.pacienteActual.idPaciente, json.data.idOdontograma);
    if (!silentSuccess) {
      alert("Odontograma cargado correctamente");
    }
    return true;

  } catch (err) {
    if (isAbortError(err)) return false;
    console.error(err);
    limpiarOdontogramaActivoEnVista({ clearHistorial: false });
    alert("Error al cargar odontograma");
    return false;
  } finally {
    endRequest("odontogramaUltimo", req.controller);
  }
}
// ============= FIRMA PACIENTE====
let canvasFirma, ctxFirma;
let dibujando = false;
function ajustarCanvasFirma() {
  if (!canvasFirma || !ctxFirma) return;

  const rect = canvasFirma.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  const nextWidth = Math.round(rect.width * dpr);
  const nextHeight = Math.round(rect.height * dpr);

  if (canvasFirma.width === nextWidth && canvasFirma.height === nextHeight) return;

  canvasFirma.width = nextWidth;
  canvasFirma.height = nextHeight;
  ctxFirma.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctxFirma.lineWidth = 2;
  ctxFirma.lineCap = "round";
  ctxFirma.strokeStyle = "#000";
}
function initFirmaPaciente() {
  canvasFirma = document.getElementById("canvas-firma");
  if (!canvasFirma) return;

  ctxFirma = canvasFirma.getContext("2d");
  canvasFirma.style.touchAction = "none";
  ajustarCanvasFirma();

  const iniciarTrazo = e => {
    dibujando = true;
    const pos = getMousePos(canvasFirma, e);
    ctxFirma.beginPath();
    ctxFirma.moveTo(pos.x, pos.y);
    e.preventDefault();
  };

  const moverTrazo = e => {
    if (!dibujando) return;
    const pos = getMousePos(canvasFirma, e);
    ctxFirma.lineTo(pos.x, pos.y);
    ctxFirma.stroke();
    e.preventDefault();
  };

  const terminarTrazo = () => {
    dibujando = false;
    ctxFirma.beginPath();
  };

  canvasFirma.onpointerdown = e => {
    canvasFirma.setPointerCapture(e.pointerId);
    iniciarTrazo(e);
  };
  canvasFirma.onpointermove = moverTrazo;
  canvasFirma.onpointerup = terminarTrazo;
  canvasFirma.onpointercancel = terminarTrazo;
  canvasFirma.onpointerleave = terminarTrazo;

  if (!window.__firmaResizeBound) {
    window.__firmaResizeBound = true;
    window.addEventListener("resize", ajustarCanvasFirma);
    window.addEventListener("orientationchange", ajustarCanvasFirma);
  }

  document.getElementById("btn-limpiar-firma").onclick = limpiarFirma;
  document.getElementById("btn-guardar-firma").onclick = guardarFirmaPaciente;
}
function getMousePos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}
function limpiarFirma() {
  ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height);
  ctxFirma.beginPath();
}
function onVerFirmaPaciente() {
  if (!window.pacienteActual) {
    alert("Seleccione un paciente");
    return;
  }

  const rutaFirmaInput = String(document.getElementById("firmaP")?.value || "").trim();
  const rutaFirma = rutaFirmaInput || String(pacienteActual.firmaP || "").trim();

  //  SI EXISTE FIRMA -> mostrar imagen
  if (rutaFirma) {
    const modal = document.getElementById("modal-ver-firma");
    const img = document.getElementById("firma-img");

    img.src = rutaFirma;
    modal.style.display = "flex";
    return;
  }

  //  NO EXISTE -> abrir canvas para crear
  abrirModalFirmaPaciente();
}
function abrirModalFirmaPaciente() {
  const modal = document.getElementById("modal-paciente-firma");
  modal.style.display = "flex";
  requestAnimationFrame(() => {
    ajustarCanvasFirma();
    limpiarFirma();
  });
}
function cerrarModalFirmaPaciente() {
  const modal = document.getElementById("modal-paciente-firma");
  if (modal) modal.style.display = "none";
}
function cerrarModalVerFirma() {
  const modal = document.getElementById("modal-ver-firma");
  if (modal) modal.style.display = "none";
}
async function guardarFirmaPaciente() {
  if (isSavingFirmaPaciente) return;

  if (!window.pacienteActual?.idPaciente) {
    alert("Paciente no valido");
    return;
  }

  const imagenBase64 = canvasFirma.toDataURL("image/png");

  isSavingFirmaPaciente = true;
  try {
    const res = await fetch("/api/paciente/firma", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idPaciente: window.pacienteActual.idPaciente,
        imagenBase64
      })
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    // Y actualizar UI
    document.getElementById("firmaP").value = json.ruta;
    actualizarEstadoFirmaPaciente(json.ruta);
    window.pacienteActual.firmaP = json.ruta;

    cerrarModalFirmaPaciente();
    alert(" Firma guardada correctamente");

  } catch (err) {
    console.error(err);
    alert(" Error al guardar firma");
  } finally {
    isSavingFirmaPaciente = false;
  }
}
async function guardarPaciente() {
  if (isSavingPaciente) return;
  const debeGuardarOdontograma = odontogramaTieneCambiosPendientes();
    
  const payload = {
    idPaciente: window.pacienteActual?.idPaciente || null,

    NombreP: NombreP.value,
    direccionP: direccionP.value,
    telefonoP: telefonoP.value,
    fechaRegistroP: fechaRegistroP.value,
    estadoP: estadoP.value === "" ? null : Number(estadoP.value),
    fechaNacimientoP: fechaNacimientoP.value || null,
    recomendadoP: recomendadoP.value,
    encargadoP: encargadoP.value,
    motivoConsultaP: motivoConsultaP.value,
    ultimaVisitaP: ultimaVisitaP.value || null,
    firmaP: firmaP.value || null,
    duiP: duiP.value,
    tipoMordidaP: document.getElementById("tipoMordidaP").value, // AQUI
    tipoTratamientoP: document.getElementById("tipoTratamientoP").value, // AQUI

    historiaMedicaP: historiaMedicaP.value,
    historiaOdontologicaP: historiaOdontologicaP.value,
    examenClinicoP: examenClinicoP.value,
    examenRadiologicoP: examenRadiologicoP.value,
    examenComplementarioP: examenComplementarioP.value,

    endodonciaP: endodonciaP.value,
    dienteP: dienteP.value,
    vitalidadP: vitalidadP.value,
    percusionP: percusionP.value,
    medProvisional: medProvisional.value,
    medTrabajoP: medTrabajoP.value,

    tratamientoP: tratamientoP.value,
    notasObservacionP: notasObservacionP.value
  };

  isSavingPaciente = true;
  try {
    const res = await fetch("/api/paciente/guardar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    window.pacienteActual = {
      ...(window.pacienteActual || {}),
      ...payload,
      idPaciente: json.idPaciente
    };
    actualizarAccionesPaciente();
    setPacienteCambiosPendientes(false);

    alert(" Paciente guardado correctamente");
    if (debeGuardarOdontograma) {
      await guardarOdontogramaEnBD();
    }

  } catch (err) {
    console.error(err);
    alert(" Error al guardar paciente");
  } finally {
    isSavingPaciente = false;
  }
}
function renderCitasPaciente() {
  const tbody = document.getElementById("citas-tbody");
  const search = document.getElementById("citas-search")?.value.toLowerCase() || "";

  if (!tbody) return;
  tbody.innerHTML = "";

  const vista = window.citasPaciente
    .sort((a, b) => new Date(a.fechaCP) - new Date(b.fechaCP)) //  ORDEN
    .filter(c => 
    String(c.ProcedimientoCP || "").toLowerCase().includes(search) ||
    String(c.fechaCP || "").includes(search)
    );

  window.citasPacienteView = vista;

  vista.forEach((c, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.rowIndex = String(idx);
      const idCita = String(
        c.idCitasPaciente ??
        c.idcitasPaciente ??
        c.idCitaPaciente ??
        c.IdCitasPaciente ??
        c.IdcitasPaciente ??
        c.id ??
        c.ID ??
        ""
      );
      tr.dataset.idCita = idCita;
      const fechaTxt = fechaLegible(c.fechaCP);
      const procedimientoTxt = String(c.ProcedimientoCP || "");
      const tieneDoctor = Number(c.idDoctor || 0) > 0;
      const puedeVer = tieneDoctor && citaPuedeVerFirmaSello(c);
      const accionHtml = renderAccionCita(c, idCita);
      const fechaHtml = typeof window.__rvRenderFecha === "function"
        ? window.__rvRenderFecha(fechaTxt)
        : fechaTxt;
      const procedimientoHtml = typeof window.__rvRenderProcedimiento === "function"
        ? window.__rvRenderProcedimiento(procedimientoTxt)
        : procedimientoTxt;
      tr.innerHTML = `
        <td>${fechaHtml}</td>
        <td>${procedimientoHtml}</td>
        <td>$${c.valorCP}</td>
        <td>$${c.abonoCP}</td>
        <td>$${c.saldoCP}</td>
        <td>
        <div class="doctor-cell">
        <span class="doctor-nombre">${c.nombreDoctor || "-"}</span>
        <button
        class="btn-ver-doctor"
        data-doctor-id="${c.idDoctor}"
        ${puedeVer ? "" : "disabled"}>
        Ver
        </button>
        </div>
        </td>
        <td>${accionHtml}</td>
      `;
      tbody.appendChild(tr);
    });
}
function registrarEventoVerDoctor() {
  if (window.__pacienteVerDoctorHandler) {
    document.removeEventListener("click", window.__pacienteVerDoctorHandler);
  }

  window.__pacienteVerDoctorHandler = async (e) => {
    if (!e.target.classList.contains("btn-ver-doctor")) return;

    const doctorId = Number(e.target.dataset.doctorId);
    if (!doctorId) return;

    const req = beginRequest("doctorInfo");
    const localSeq = req.seq;

    try {
      const res = await fetch(`/api/doctor/${doctorId}`, {
        signal: req.signal
      });
      const json = await res.json();
      if (isStaleRequest("doctorInfo", localSeq)) return;

      if (!json.ok) {
        alert("No se pudo cargar el doctor");
        return;
      }

      const d = json.data;

      const body = document.getElementById("doctor-info-body");
      const modal = document.getElementById("modal-doctor-info");

      body.innerHTML = `
        <p><strong>Nombre:</strong> ${d.nombreD}</p>
        <p><strong>Telefono:</strong> ${d.TelefonoD || "-"}</p>

        <hr>

        <strong>Firma:</strong><br>
        ${
          d.FirmaD
            ? `<img src="${d.FirmaD}" style="max-width:100%; border:1px solid #ddd;">`
            : "<em>No registrada</em>"
        }

        <br><br>

        <strong>Sello:</strong><br>
        ${
          d.SelloD
            ? `<img src="${d.SelloD}" style="max-width:100%; border:1px solid #ddd;">`
            : "<em>No registrado</em>"
        }
      `;

      modal.classList.add("show");

    } catch (err) {
      if (isAbortError(err)) return;
      console.error(err);
      alert("Error cargando doctor");
    } finally {
      endRequest("doctorInfo", req.controller);
    }
  };

  document.addEventListener("click", window.__pacienteVerDoctorHandler);

  const closeDoctorModalBtn = document.getElementById("modal-doctor-info-close");
  if (closeDoctorModalBtn) {
    closeDoctorModalBtn.onclick = () => {
      document
        .getElementById("modal-doctor-info")
        .classList.remove("show");
    };
  }
}
function abrirModalAutorizarCita(idCita, nombreDoctor) {
  const modal = document.getElementById("modal-autorizar-cita");
  if (!modal) return;

  window.__citaAutorizarId = Number(idCita || 0);
  const subtitulo = document.getElementById("autorizar-cita-doctor");
  if (subtitulo) {
    const nombre = String(nombreDoctor || "").trim();
    subtitulo.textContent = nombre
      ? `Doctor asignado: ${nombre}`
      : "Ingrese credenciales del doctor";
  }

  const inputPass = document.getElementById("autorizar-cita-password");
  if (inputPass) inputPass.value = "";

  modal.classList.add("show");
  inputPass?.focus();
}
function cerrarModalAutorizarCita() {
  const modal = document.getElementById("modal-autorizar-cita");
  if (modal) modal.classList.remove("show");
  const inputPass = document.getElementById("autorizar-cita-password");
  if (inputPass) inputPass.value = "";
  window.__citaAutorizarId = null;
}
async function ejecutarAutorizacionCita(idCita, credenciales = null) {
  if (!idCita) return { ok: false, message: "ID de cita invalido" };
  if (isAuthorizingCitaPaciente) {
    return { ok: false, message: "Ya hay una autorizacion en proceso" };
  }

  isAuthorizingCitaPaciente = true;
  try {
    const res = await fetch(`/api/paciente/cita/${idCita}/autorizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credenciales || {})
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        status: res.status,
        message: json.message || "No se pudo autorizar la cita"
      };
    }
    return { ok: true, data: json };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Error de red al autorizar cita" };
  } finally {
    isAuthorizingCitaPaciente = false;
  }
}
function registrarEventoAutorizarCita() {
  if (window.__pacienteAutorizarCitaHandler) {
    document.removeEventListener("click", window.__pacienteAutorizarCitaHandler);
  }

  window.__pacienteAutorizarCitaHandler = async (e) => {
    if (!e.target.classList.contains("btn-autorizar-cita")) return;

    const idCita = Number(e.target.dataset.citaId || 0);
    if (!idCita) return;

    const tr = e.target.closest("tr");
    const doctorNombre = tr?.querySelector(".doctor-nombre")?.textContent || "";

    const user = typeof window.getCurrentUser === "function"
      ? window.getCurrentUser()
      : null;
    const esDoctor = user?.rol === "Doctor";

    if (esDoctor) {
      const result = await ejecutarAutorizacionCita(idCita);
      if (result.ok) {
        await cargarCitasPaciente(window.pacienteActual?.idPaciente);
        return;
      }
      if (result.status === 400 && /credencial|contrasena|correo/i.test(result.message || "")) {
        abrirModalAutorizarCita(idCita, doctorNombre);
        return;
      }
      alert(result.message || "No se pudo autorizar la cita");
      return;
    }

    abrirModalAutorizarCita(idCita, doctorNombre);
  };

  document.addEventListener("click", window.__pacienteAutorizarCitaHandler);

  const btnCancel = document.getElementById("modal-autorizar-cancel");
  const btnSave = document.getElementById("modal-autorizar-save");

  if (btnCancel) btnCancel.onclick = cerrarModalAutorizarCita;
  if (btnSave) {
    btnSave.onclick = async () => {
      const idCita = Number(window.__citaAutorizarId || 0);
      if (!idCita) return;

      const password = String(document.getElementById("autorizar-cita-password")?.value || "");

      if (!password) {
        alert("Ingrese la contrasena del doctor");
        return;
      }

      const result = await ejecutarAutorizacionCita(idCita, { password });
      if (!result.ok) {
        alert(result.message || "No se pudo autorizar la cita");
        return;
      }

      cerrarModalAutorizarCita();
      await cargarCitasPaciente(window.pacienteActual?.idPaciente);
    };
  }
}
// ============= FUNCION PARA LIMPIAR TODO LO DE LA VISTA PACIENTE ====
function limpiarVistaPaciente() {
  abortAllPacienteRequests();
  isSavingPaciente = false;
  isSavingCitaPaciente = false;
  isSavingFirmaPaciente = false;
  isSavingOdontogramaPaciente = false;
  isUploadingFotoPaciente = false;
  isDeletingFotosPaciente = false;
  isSettingFotoPrincipalPaciente = false;
  isAuthorizingCitaPaciente = false;

  /* =====================================================
     1a ESTADO GLOBAL / MEMORIA
  ===================================================== */
  window.pacienteActual = null;
  window.citasPaciente = [];
  window.citasPacienteView = [];
  window.fotosPaciente = [];
  window.odontogramaData = null;
  window._odontogramaCargado = false;
  window.editingCitaId = null;
  window.ultimoOdontogramaId = null;
  window.pacienteFotoPrincipalId = null;
  window.__pacienteLoading = false;
  setPacienteCambiosPendientes(false);

  if (window.odontogramaAPI && typeof window.odontogramaAPI.reset === "function") {
    window.odontogramaAPI.reset();
    if (typeof window.odontogramaAPI.cargar === "function") {
      window.odontogramaAPI.cargar();
    }
  }
  actualizarOdontogramaActual(null);
  llenarSelectFechasOdontograma([]);
  const toggleBloqueo = document.getElementById("toggle-bloqueo");
  if (toggleBloqueo) {
    toggleBloqueo.checked = true;
    window.odontogramaBloqueado = true;
  }
  sincronizarSnapshotOdontogramaBase();

  /* =====================================================
     2a BANDERAS (dataset)
  ===================================================== */
  // No borrar banderas globales de binding: eso duplica listeners en montajes futuros.
/* =====================================================
   3a ODONTOGRAMA (LIMPIEZA SIN DESTRUIR)
===================================================== */


  /* =====================================================
     4a FOTOS
  ===================================================== */
  const fotosGrid = document.getElementById("fotos-grid");
  if (fotosGrid) fotosGrid.innerHTML = "";

  const fotoModal = document.getElementById("foto-modal");
  if (fotoModal) fotoModal.style.display = "none";

  const modalImg = document.getElementById("modal-img");
  if (modalImg) modalImg.src = "";
  const modalIndicador = document.getElementById("foto-modal-indicador");
  if (modalIndicador) modalIndicador.textContent = "";
  window.__fotoModalIndex = -1;

  const inputFoto = document.getElementById("input-foto");
  if (inputFoto) inputFoto.value = "";
  renderFotoPrincipalPaciente();

  /* =====================================================
     5a CITAS
  ===================================================== */
  const citasBody = document.getElementById("citas-tbody");
  if (citasBody) citasBody.innerHTML = "";

  const citasSearch = document.getElementById("citas-search");
  if (citasSearch) citasSearch.value = "";

  /* =====================================================
     6a MODAL CITA
  ===================================================== */
  const modalCita = document.getElementById("modal-cita-paciente");
  if (modalCita) modalCita.classList.remove("show");
  cerrarModalAutorizarCita();

  ["cita-fecha", "cita-procedimiento", "cita-valor", "cita-abono", "cita-doctor"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  const selectDoctor = document.getElementById("cita-doctor");
  if (selectDoctor) selectDoctor.disabled = false;

  /* =====================================================
     7a FIRMA (CANVAS)
  ===================================================== */
  try {
    if (window.ctxFirma && window.canvasFirma) {
      ctxFirma.clearRect(0, 0, canvasFirma.width, canvasFirma.height);
      ctxFirma.beginPath();
    }
  } catch (e) {}

  window.canvasFirma = null;
  window.ctxFirma = null;
  window.dibujando = false;

  const modalFirma = document.getElementById("modal-paciente-firma");
  if (modalFirma) modalFirma.style.display = "none";

  const modalVerFirma = document.getElementById("modal-ver-firma");
  if (modalVerFirma) modalVerFirma.style.display = "none";

  const odontoPieceModal = document.getElementById("odonto-piece-modal");
  if (odontoPieceModal) odontoPieceModal.classList.remove("is-open");
  document.body.classList.remove("odonto-piece-modal-open");

  const imgFirma = document.getElementById("firma-img");
  if (imgFirma) imgFirma.src = "";

  /* =====================================================
     8a BUSCADOR / AUTOCOMPLETE
  ===================================================== */
  const buscar = document.getElementById("buscar-paciente-p");
  if (buscar) buscar.value = "";

  const lista = document.getElementById("lista-paciente");
  if (lista) {
    lista.innerHTML = "";
    lista.style.display = "none";
  }

  /* =====================================================
     9a INPUTS GENERALES
  ===================================================== */
  document
    .querySelectorAll(".paciente-container input, .paciente-container textarea, .paciente-container select")
    .forEach(el => {
      if (!el.disabled) el.value = "";
    });
  const edadInput = document.getElementById("edadP");
  if (edadInput) edadInput.value = "";
  actualizarEstadoFirmaPaciente("");
  actualizarColorEstadoPaciente();
  actualizarColorTipoTratamiento();
  actualizarColorTipoMordida();
  setPacienteEdicionHabilitada(false);
  actualizarAccionesPaciente();

  /* =====================================================
      MODAL DOCTOR
  ===================================================== */
  const modalDoctor = document.getElementById("modal-doctor-info");
  if (modalDoctor) modalDoctor.classList.remove("show");

  const bodyDoctor = document.getElementById("doctor-info-body");
  if (bodyDoctor) bodyDoctor.innerHTML = "";

}
function initBotonLimpiarPaciente() {
  const btn = document.getElementById("btn-limpiar-vistapaciente");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const ok = typeof window.showSystemConfirm === "function"
      ? await window.showSystemConfirm("Desea limpiar completamente la vista del paciente?")
      : confirm("Desea limpiar completamente la vista del paciente?");
    if (!ok) {
      return;
    }

    limpiarVistaPaciente();

  });
}
function initBotonNuevoPaciente() {
  const btn = document.getElementById("btn-nuevo-paciente");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const ok = typeof window.showSystemConfirm === "function"
      ? await window.showSystemConfirm("Desea iniciar un nuevo paciente?")
      : confirm("Desea iniciar un nuevo paciente?");
    if (!ok) {
      return;
    }

    limpiarVistaPaciente();
    setPacienteEdicionHabilitada(true);
    actualizarAccionesPaciente();

    const fechaRegistro = document.getElementById("fechaRegistroP");
    if (fechaRegistro) {
      fechaRegistro.value = new Date().toISOString().split("T")[0];
    }

    const nombreEl = document.getElementById("NombreP");
    if (nombreEl) {
      setTimeout(() => {
        if (!nombreEl.isConnected) return;
        nombreEl.focus();
      }, 0);
    }

  });
}

window.__mountPaciente = function () {


    const content = document.querySelector(".content");
    if (!content) return;
    pacienteViewDisposed = false;
    abortAllPacienteRequests();
    isSavingPaciente = false;
    isSavingCitaPaciente = false;
    isSavingFirmaPaciente = false;
    isSavingOdontogramaPaciente = false;
    isUploadingFotoPaciente = false;
    isDeletingFotosPaciente = false;
    isSettingFotoPrincipalPaciente = false;
    isAuthorizingCitaPaciente = false;

    // 1a Renderizar TODA la vista paciente
    renderPaciente(content);
    window.__pacienteLoading = false;
    setPacienteCambiosPendientes(false);
    llenarSelectFechasOdontograma([]);
    initAutocompletePaciente();
    initBotonNuevoPaciente();
    initBotonLimpiarPaciente();
    bindPacienteDirtyTracking();
    registrarGuardCambiosPaciente();
    setPacienteEdicionHabilitada(false);

    // 2a Inicializar odontograma (ya existe en la vista)
    if (typeof initOdontograma === "function") {
        initOdontograma();
    }
    const toggleBloqueo = document.getElementById("toggle-bloqueo");
    if (toggleBloqueo) {
    toggleBloqueo.checked = true;
    window.odontogramaBloqueado = true;
}
    sincronizarSnapshotOdontogramaBase();


    // 5a Activar edicion en linea (se aplica sobre la tabla ya renderizada)
    activarEdicionCitas();

    // 6a Inicializar sistema de fotografias
    initFotosPaciente();

    // 7a Listeners de citas
    const citasSearch = document.getElementById("citas-search");
    if (citasSearch) {
    blindarInputContraAutofill(citasSearch, "paciente-citas-search");
    citasSearch.addEventListener("input", renderCitasPaciente);
    }
    // 7a Listeners de citas
    document.getElementById("citas-add")
        ?.addEventListener("click", abrirModalCita);

    document.getElementById("modal-cita-cancel").onclick = cerrarModalCita;

    document.getElementById("modal-cita-save").onclick = guardarCitaPaciente;

    initFirmaPaciente();

    document.getElementById("btn-ver-firma-paciente")
        ?.addEventListener("click", onVerFirmaPaciente);
    document.getElementById("btn-cerrar-firma").onclick = cerrarModalFirmaPaciente;
    document.getElementById("modal-ver-cerrar").onclick = cerrarModalVerFirma;
     // 8a Listener de "guardar paciente
     document.getElementById("btn-guardar-paciente")
     .addEventListener("click", guardarPaciente);
    document.getElementById("estadoP")
      ?.addEventListener("change", actualizarColorEstadoPaciente);
    document.getElementById("tipoTratamientoP")
      ?.addEventListener("change", actualizarColorTipoTratamiento);
    document.getElementById("tipoMordidaP")
      ?.addEventListener("change", actualizarColorTipoMordida);
    actualizarEstadoFirmaPaciente("");
    actualizarColorEstadoPaciente();
    actualizarColorTipoTratamiento();
    actualizarColorTipoMordida();
    actualizarAccionesPaciente();
    // 8a Listener de "Ver doctor" y "Autorizar cita"
    registrarEventoVerDoctor();
    registrarEventoAutorizarCita();
    
    if (!document.querySelector(".tooth")) {
    alert("Odontograma no inicializado");
    return;
}
    const btnGuardarOdt = document.getElementById("btn-guardarOdontograma");
    const btnCargarOdt  = document.getElementById("btn-cargarOdontograma");
    const selectFechaOdt = document.getElementById("fechaO");

    if (btnGuardarOdt) {
    btnGuardarOdt.addEventListener("click", guardarOdontogramaEnBD);
    }

    if (btnCargarOdt) {
    btnCargarOdt.hidden = true;
    btnCargarOdt.style.display = "none";
    btnCargarOdt.addEventListener("click", async () => {
      const selectFecha = document.getElementById("fechaO");
      const idSeleccionado = Number(selectFecha?.value || 0);
      if (idSeleccionado > 0) {
        await cargarOdontogramaPorId(idSeleccionado, {
          silentNoData: false,
          silentSuccess: false
        });
        return;
      }
      await cargarUltimoOdontogramaPaciente({
        silentNoData: false,
        silentSuccess: false
      });
    });
    }

    if (selectFechaOdt) {
      selectFechaOdt.addEventListener("change", async () => {
        const idSeleccionado = Number(selectFechaOdt.value || 0);
        if (idSeleccionado <= 0) return;

        if (odontogramaTieneCambiosPendientes()) {
          const okCambio = await Promise.resolve(
            confirmarCambioPacienteSinGuardar("cargar otra fecha de odontograma sin guardar?")
          );
          if (!okCambio) {
            selectFechaOdt.value = window.ultimoOdontogramaId
              ? String(window.ultimoOdontogramaId)
              : "";
            return;
          }
        }

        await cargarOdontogramaPorId(idSeleccionado, {
          silentNoData: false,
          silentSuccess: false
        });
      });
    }

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        pacienteViewDisposed = true;
        limpiarVistaPaciente();
      });
    }
    aplicarPrefillDesdeAgendaEnPaciente();
    abrirPacientePendienteSiExiste();
    aplicarBusquedaManualPendienteSiExiste();
};

window.__pacienteViewAPI = window.__pacienteViewAPI || {};
window.__pacienteViewAPI.openById = async function (idPaciente) {
  const id = Number(idPaciente || 0);
  if (!id) return false;

  if (window.currentView !== "Paciente") {
    window.__pacienteAbrirPendienteId = id;
    if (typeof window.loadView === "function") {
      await Promise.resolve(window.loadView("Paciente"));
      return window.currentView === "Paciente";
    }
    return false;
  }

  const puedeCambiar = await Promise.resolve(
    confirmarCambioPacienteSinGuardar("cargar otro paciente sin guardar?")
  );
  if (!puedeCambiar) return false;

  window.__pacienteAbrirPendienteId = id;
  return abrirPacientePendienteSiExiste();
};
window.__pacienteViewAPI.openManualSearch = async function (options = {}) {
  const query = String(options?.query || "").trim();
  const contacto = String(options?.contacto || "").trim();
  const message = String(options?.message || "").trim();
  const queryFinal = query || contacto;

  window.__pacienteBusquedaManualPendiente = {
    query: queryFinal,
    message
  };

  if (window.currentView !== "Paciente") {
    if (typeof window.loadView === "function") {
      await Promise.resolve(window.loadView("Paciente"));
      return window.currentView === "Paciente";
    }
    return false;
  }

  return aplicarBusquedaManualPendienteSiExiste();
};
})();

