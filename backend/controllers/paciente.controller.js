const pool = require("../config/db");
const authService = require("../services/auth.service");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { parsePngBase64, writeBufferFile } = require("../utils/file");
const { firmasDir } = require("../config/storagePaths");

const ESTADO_AUTORIZACION_PENDIENTE = "PENDIENTE";
const ESTADO_AUTORIZACION_OK = "AUTORIZADA";
const METODO_AUTORIZACION_FISICO = "FISICO_ESCANEADO";
const METODO_AUTORIZACION_AUTO_DOCTOR = "AUTO_DOCTOR";
const METODO_AUTORIZACION_VALIDACION = "VALIDACION_CREDENCIAL";
const METODO_AUTORIZACION_SIN_DOCTOR = "SIN_DOCTOR";
const DOCTOR_REGISTRO_FISICO = "registro fisico";
const MAX_PROCEDIMIENTO_CITA = 500;
const MONITOR_SEGMENT_VALUES = new Set(["all", "retrasado", "m2", "m3"]);
const MONITOR_ESTADO_VALUES = new Set(["all", "activo", "inactivo"]);
const MONITOR_TRATAMIENTO_VALUES = new Set(["all", "odontologia", "ortodoncia", "sin_registrar"]);
const MONITOR_PAGE_SIZE_VALUES = new Set([10, 25, 50]);

function isTransientDbError(err) {
  const code = String(err?.code || "").toUpperCase();
  if (!code) return false;
  return (
    code.includes("ETIMEDOUT") ||
    code.includes("ECONNRESET") ||
    code.includes("ECONNREFUSED") ||
    code.includes("PROTOCOL_CONNECTION_LOST")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryReadWithRetry(sql, params = [], options = {}) {
  const attempts = Number.isInteger(Number(options.attempts)) && Number(options.attempts) > 0
    ? Number(options.attempts)
    : 2;
  const baseDelayMs = Number.isInteger(Number(options.baseDelayMs)) && Number(options.baseDelayMs) >= 0
    ? Number(options.baseDelayMs)
    : 120;

  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      lastError = err;
      const hasNextAttempt = i < attempts - 1;
      if (!hasNextAttempt || !isTransientDbError(err)) {
        throw err;
      }
      await sleep(baseDelayMs * (i + 1));
    }
  }

  throw lastError || new Error("Error desconocido en consulta de lectura");
}

function handlePacienteError(res, err, fallbackMessage) {
  if (isTransientDbError(err)) {
    return res.status(503).json({
      ok: false,
      message: "Base de datos temporalmente no disponible. Intente de nuevo."
    });
  }
  return serverError(res, err, fallbackMessage);
}

function esFechaISOValida(fecha) {
  if (typeof fecha !== "string") return false;
  const valor = fecha.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const [anio, mes, dia] = valor.split("-").map(Number);
  const date = new Date(anio, mes - 1, dia);
  return (
    date.getFullYear() === anio &&
    date.getMonth() === mes - 1 &&
    date.getDate() === dia
  );
}

function getTodayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getResultSet(rows, index = 0) {
  if (!Array.isArray(rows)) return [];
  const resultSet = rows[index];
  return Array.isArray(resultSet) ? resultSet : [];
}

function normalizeMonitorEnum(rawValue, allowedValues, fallback) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return fallback;
  return allowedValues.has(value) ? value : "__INVALID__";
}

function normalizeMonitorPage(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
}

function normalizeMonitorPageSize(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) return 25;
  return MONITOR_PAGE_SIZE_VALUES.has(parsed) ? parsed : 25;
}

function normalizeMonitorQuery(rawValue) {
  return String(rawValue || "").trim();
}

function normalizeBitValue(rawValue, fallback = "__INVALID__") {
  if (rawValue === undefined || rawValue === null || rawValue === "") return fallback;
  if (rawValue === true || rawValue === 1 || rawValue === "1") return 1;
  if (rawValue === false || rawValue === 0 || rawValue === "0") return 0;
  const txt = String(rawValue).trim().toLowerCase();
  if (txt === "true" || txt === "yes" || txt === "on") return 1;
  if (txt === "false" || txt === "no" || txt === "off") return 0;
  return fallback;
}

function getMonitorSegmentLabel(segmentKey) {
  if (segmentKey === "retrasado") return "Retrasado";
  if (segmentKey === "m2") return "+2 meses";
  if (segmentKey === "m3") return "+3 meses";
  return "Al dia";
}

function inferSegmentKeyByMonths(months) {
  const safeMonths = Number(months || 0);
  if (safeMonths >= 3) return "m3";
  if (safeMonths === 2) return "m2";
  if (safeMonths === 1) return "retrasado";
  return "al_dia";
}

function normalizeTratamientoLabel(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "Sin registrar";

  const normalized = raw.toLowerCase();
  if (normalized === "odontologia") return "Odontologia";
  if (normalized === "ortodoncia") return "Ortodoncia";
  if (normalized === "sin registrar") return "Sin registrar";
  return raw;
}

function getTratamientoKeyFromLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "odontologia") return "odontologia";
  if (normalized === "ortodoncia") return "ortodoncia";
  return "sin_registrar";
}

function validarLongitudProcedimientoCita(procedimientoTxt) {
  const length = String(procedimientoTxt || "").length;
  if (length > MAX_PROCEDIMIENTO_CITA) {
    return `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres (actual: ${length}).`;
  }
  return "";
}

function textoNormalizado(value) {
  return String(value ?? "").trim().toLowerCase();
}

function esRegistroFisico(nombreDoctor) {
  return textoNormalizado(nombreDoctor) === DOCTOR_REGISTRO_FISICO;
}

function normalizarEstadoDoctor(value) {
  const txt = String(value ?? "").trim().toLowerCase();
  if (txt === "0" || txt === "inactivo" || txt === "inactive" || txt === "false") return 0;
  if (txt === "1" || txt === "activo" || txt === "active" || txt === "true") return 1;
  return Number(value) === 0 ? 0 : 1;
}

async function existeColumnaEstadoDoctor() {
  const [rows] = await queryReadWithRetry(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'doctor'
        AND COLUMN_NAME = 'estadoD'
      LIMIT 1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function obtenerVinculoDoctorPorUsuario(idUsuario) {
  const [rows] = await queryReadWithRetry(
    "SELECT idDoctor FROM usuario WHERE idUsuario = ? LIMIT 1",
    [idUsuario]
  );
  return Number(rows?.[0]?.idDoctor || 0);
}

async function obtenerMetaCita(idCitaPaciente) {
  const [rows] = await queryReadWithRetry(
    `SELECT c.idcitasPaciente, c.doctorId, c.estadoAutorizacionCP, d.nombreD AS nombreDoctor
     FROM citaspaciente c
     LEFT JOIN doctor d ON d.idDoctor = c.doctorId
     WHERE c.idcitasPaciente = ?
     LIMIT 1`,
    [idCitaPaciente]
  );
  return rows?.[0] || null;
}

async function obtenerMetaDoctor(idDoctor) {
  const tieneColumnaEstado = await existeColumnaEstadoDoctor();
  const [rows] = await queryReadWithRetry(
    tieneColumnaEstado
      ? "SELECT idDoctor, nombreD, estadoD FROM doctor WHERE idDoctor = ? LIMIT 1"
      : "SELECT idDoctor, nombreD FROM doctor WHERE idDoctor = ? LIMIT 1",
    [idDoctor]
  );
  const doctor = rows?.[0] || null;
  if (!doctor) return null;
  if (tieneColumnaEstado) {
    doctor.estadoD = normalizarEstadoDoctor(doctor.estadoD);
  }
  return doctor;
}
async function obtenerCorreoUsuarioDoctorPorIdDoctor(idDoctor) {
  const [rows] = await queryReadWithRetry(
    `SELECT correoU
     FROM usuario
     WHERE idDoctor = ?
     ORDER BY idUsuario ASC
     LIMIT 1`,
    [idDoctor]
  );
  return String(rows?.[0]?.correoU || "").trim();
}
// ============================
// 🔍 BUSCAR PACIENTES (AUTOCOMPLETE)
// ============================
function esBusquedaTelefono(texto) {
  const q = String(texto || "").trim();
  if (!q) return false;

  const soloCaracteresTelefono = q.replace(/[0-9\s()+\-./]/g, "") === "";
  if (!soloCaracteresTelefono) return false;

  const digitos = q.replace(/\D+/g, "");
  return digitos.length >= 3;
}

const buscar = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();

    if (q.length < 3) {
      return badRequest(res, "Minimo 3 caracteres");
    }

    let data = [];
    if (esBusquedaTelefono(q)) {
      const qDigitos = q.replace(/\D+/g, "");
      const [rows] = await queryReadWithRetry(
        `SELECT idPaciente, NombreP, telefonoP
         FROM paciente
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') LIKE ?
         ORDER BY NombreP ASC
         LIMIT 25`,
        [`%${qDigitos}%`]
      );
      data = Array.isArray(rows) ? rows : [];
    } else {
      const [rows] = await queryReadWithRetry(
        "CALL sp_paciente_buscar_ligero(?)",
        [q]
      );
      data = firstResultSet(rows);
    }

    res.json({
      ok: true,
      data
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al buscar pacientes");
  }
};

// ============================
// 🧍 OBTENER PACIENTE COMPLETO
// ============================
const obtenerPorId = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de paciente invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_paciente_get_by_id(?)",
      [id]
    );

    const paciente = firstRow(rows);
    if (!paciente) {
      return notFound(res, "Paciente no encontrado");
    }

    res.json({
      ok: true,
      data: paciente
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al obtener paciente");
  }
};

async function consultarMonitorSeguimientoListado({
  fechaCorte,
  segmento,
  estado,
  tratamiento,
  q,
  page,
  pageSize
}) {
  const [rows] = await queryReadWithRetry(
    "CALL sp_paciente_monitor_seguimiento_listar(?,?,?,?,?,?,?)",
    [fechaCorte, segmento, estado, tratamiento, q, page, pageSize]
  );

  const dataRows = getResultSet(rows, 0);
  const countRow = getResultSet(rows, 1)[0] || {};
  const totalRows = Number(countRow.totalRows || 0);

  return {
    dataRows: Array.isArray(dataRows) ? dataRows : [],
    totalRows: Number.isFinite(totalRows) && totalRows >= 0 ? totalRows : 0
  };
}

const monitorSeguimiento = async (req, res) => {
  try {
    const fechaCorteRaw = String(req.query?.fechaCorte || "").trim();
    const fechaCorte = fechaCorteRaw || getTodayLocalISO();
    if (!esFechaISOValida(fechaCorte)) {
      return badRequest(res, "fechaCorte invalida, use YYYY-MM-DD");
    }

    const segmento = normalizeMonitorEnum(req.query?.segmento, MONITOR_SEGMENT_VALUES, "all");
    if (segmento === "__INVALID__") {
      return badRequest(res, "segmento invalido. Use all|retrasado|m2|m3");
    }

    const estado = normalizeMonitorEnum(req.query?.estado, MONITOR_ESTADO_VALUES, "all");
    if (estado === "__INVALID__") {
      return badRequest(res, "estado invalido. Use all|activo|inactivo");
    }

    const tratamiento = normalizeMonitorEnum(req.query?.tratamiento, MONITOR_TRATAMIENTO_VALUES, "all");
    if (tratamiento === "__INVALID__") {
      return badRequest(res, "tratamiento invalido. Use all|odontologia|ortodoncia|sin_registrar");
    }

    const q = normalizeMonitorQuery(req.query?.q);
    let page = normalizeMonitorPage(req.query?.page);
    const pageSize = normalizeMonitorPageSize(req.query?.pageSize);

    let listado = await consultarMonitorSeguimientoListado({
      fechaCorte,
      segmento,
      estado,
      tratamiento,
      q,
      page,
      pageSize
    });

    let total = Number(listado.totalRows || 0);
    let totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total > 0 && page > totalPages) {
      page = totalPages;
      listado = await consultarMonitorSeguimientoListado({
        fechaCorte,
        segmento,
        estado,
        tratamiento,
        q,
        page,
        pageSize
      });
      total = Number(listado.totalRows || 0);
      totalPages = Math.max(1, Math.ceil(total / pageSize));
    }

    const rows = listado.dataRows.map((row) => {
      const idPaciente = Number(row.idPaciente || 0);
      const mesesAusencia = Number(row.mesesAusencia || 0);
      const segmentKeyRaw = String(row.segmentoKey || "").trim().toLowerCase();
      const segmentoKey = MONITOR_SEGMENT_VALUES.has(segmentKeyRaw)
        ? segmentKeyRaw
        : inferSegmentKeyByMonths(mesesAusencia);
      const estadoKeyRaw = String(row.estadoKey || "").trim().toLowerCase();
      const estadoKey = estadoKeyRaw === "inactivo" ? "inactivo" : "activo";

      const tratamientoLabel = normalizeTratamientoLabel(row.tipoTratamientoP || row.tratamientoLabel);
      const tratamientoKey = getTratamientoKeyFromLabel(tratamientoLabel);

      return {
        idPaciente: Number.isInteger(idPaciente) ? idPaciente : 0,
        NombreP: String(row.NombreP || "").trim(),
        telefonoP: String(row.telefonoP || "").trim(),
        ultimaVisitaP: row.ultimaVisitaP ? String(row.ultimaVisitaP).trim() : null,
        mesesAusencia: Number.isFinite(mesesAusencia) && mesesAusencia >= 0 ? mesesAusencia : 0,
        segmentoKey,
        segmentoLabel: getMonitorSegmentLabel(segmentoKey),
        estadoKey,
        estadoLabel: estadoKey === "activo" ? "Activo" : "Inactivo",
        tipoTratamientoP: tratamientoLabel,
        tratamientoKey,
        sms: normalizeBitValue(row.sms, 0),
        llamada: normalizeBitValue(row.llamada, 0)
      };
    });

    const [rowsTotales] = await queryReadWithRetry(
      "CALL sp_paciente_monitor_seguimiento_totales(?,?,?,?)",
      [fechaCorte, estado, tratamiento, q]
    );
    const totalesRow = firstRow(rowsTotales) || {};

    totalPages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = total === 0 ? 0 : Math.min((page - 1) * pageSize + rows.length, total);

    return res.json({
      ok: true,
      rows,
      totales: {
        total,
        retrasado: Number(totalesRow.retrasado || 0),
        m2: Number(totalesRow.m2 || 0),
        m3: Number(totalesRow.m3 || 0)
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        from,
        to
      }
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al listar monitor de seguimiento");
  }
};

const guardarMonitorContacto = async (req, res) => {
  try {
    const idPaciente = Number(req.body?.idPaciente || 0);
    const fechaCorte = String(req.body?.fechaCorte || "").trim();
    const sms = normalizeBitValue(req.body?.sms);
    const llamada = normalizeBitValue(req.body?.llamada);
    const actualizadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;

    if (!Number.isInteger(idPaciente) || idPaciente <= 0) {
      return badRequest(res, "idPaciente invalido");
    }
    if (!esFechaISOValida(fechaCorte)) {
      return badRequest(res, "fechaCorte invalida, use YYYY-MM-DD");
    }
    if (sms === "__INVALID__" || llamada === "__INVALID__") {
      return badRequest(res, "sms/llamada invalidos. Use 0|1 o boolean");
    }

    const [rows] = await pool.query(
      "CALL sp_paciente_monitor_contacto_guardar(?,?,?,?,?)",
      [idPaciente, fechaCorte, sms, llamada, actualizadoPorUsuarioId]
    );

    const saved = firstRow(rows) || {};

    return res.json({
      ok: true,
      data: {
        idPaciente,
        fechaCorte: String(saved.fechaCorte || fechaCorte),
        sms: normalizeBitValue(saved.sms, sms),
        llamada: normalizeBitValue(saved.llamada, llamada)
      }
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al guardar contacto de monitor");
  }
};
// ============================
// ✍️ GUARDAR FIRMA PACIENTE
// ============================
const guardarFirma = async (req, res) => {
  try {
    const idPaciente = Number(req.body?.idPaciente || 0);
    const imagenBase64 = req.body?.imagenBase64;

    if (!Number.isInteger(idPaciente) || idPaciente <= 0 || !imagenBase64) {
      return badRequest(res, "Datos incompletos");
    }

    const buffer = parsePngBase64(imagenBase64);
    if (!buffer) {
      return badRequest(res, "Formato de firma invalido");
    }

    const nombre = `firma_${idPaciente}_${Date.now()}.png`;
    const rutaRelativa = `/firmas/${nombre}`;
    await writeBufferFile(firmasDir, nombre, buffer);

    // 💾 guardar ruta en paciente
    await pool.query(
      "UPDATE paciente SET firmaP = ? WHERE idPaciente = ?",
      [rutaRelativa, idPaciente]
    );

    res.json({
      ok: true,
      ruta: rutaRelativa
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al guardar firma");
  }
};
// ============================
// 💾 GUARDAR / ACTUALIZAR PACIENTE
// ============================
const guardarPaciente = async (req, res) => {
  try {
    const p = req.body;
    const idPacienteNum = p?.idPaciente === null || p?.idPaciente === undefined || p?.idPaciente === ""
      ? null
      : Number(p.idPaciente);
    const nombre = String(p?.NombreP || "").trim();

    if (idPacienteNum !== null && (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0)) {
      return badRequest(res, "idPaciente invalido");
    }
    if (!nombre) {
      return badRequest(res, "Nombre de paciente requerido");
    }
    if (p?.fechaRegistroP && !esFechaISOValida(String(p.fechaRegistroP))) {
      return badRequest(res, "fechaRegistroP invalida");
    }
    if (p?.fechaNacimientoP && !esFechaISOValida(String(p.fechaNacimientoP))) {
      return badRequest(res, "fechaNacimientoP invalida");
    }
    if (p?.ultimaVisitaP && !esFechaISOValida(String(p.ultimaVisitaP))) {
      return badRequest(res, "ultimaVisitaP invalida");
    }

    const [rows] = await pool.query(
      "CALL sp_paciente_guardar(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        idPacienteNum,
        nombre,
        p.direccionP,
        p.telefonoP,
        p.fechaRegistroP,
        p.estadoP ?? 1,
        p.fechaNacimientoP,
        p.recomendadoP,
        p.encargadoP,
        p.motivoConsultaP,
        p.ultimaVisitaP,
        p.duiP,
        p.firmaP || null,
        p.tipoMordidaP,
        p.tipoTratamientoP,
        p.endodonciaP,
        p.dienteP,
        p.vitalidadP,
        p.percusionP,
        p.medProvisional,
        p.medTrabajoP,
        p.historiaMedicaP,
        p.historiaOdontologicaP,
        p.examenClinicoP,
        p.examenRadiologicoP,
        p.examenComplementarioP,
        p.tratamientoP,
        p.notasObservacionP
      ]
    );

    res.json({
      ok: true,
      idPaciente: rows[0][0].idPaciente
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al guardar paciente");
  }
};
// ============================
// ➕ CREAR CITA PACIENTE
// ============================
const crearCitaPaciente = async (req, res) => {
  try {
    const {
      idPaciente,
      fecha,
      procedimiento,
      valor,
      abono,
      doctorId
    } = req.body;
    const idPacienteNum = Number(idPaciente || 0);

    const procedimientoTxt = String(procedimiento || "").trim();
    if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0 || !fecha || !procedimientoTxt) {
      return badRequest(res, "Datos incompletos");
    }
    const errorLongitudProcedimiento = validarLongitudProcedimientoCita(procedimientoTxt);
    if (errorLongitudProcedimiento) {
      return badRequest(res, errorLongitudProcedimiento);
    }
    if (!esFechaISOValida(String(fecha))) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const valorNum = valor === "" || valor === null || valor === undefined
      ? 0
      : Number(valor);
    const abonoNum = abono === "" || abono === null || abono === undefined
      ? 0
      : Number(abono);
    const doctorIdNum = doctorId === "" || doctorId === null || doctorId === undefined
      ? null
      : Number(doctorId);

    if (
      !Number.isFinite(valorNum) ||
      !Number.isFinite(abonoNum) ||
      valorNum < 0 ||
      abonoNum < 0 ||
      (doctorIdNum !== null && (!Number.isInteger(doctorIdNum) || doctorIdNum <= 0))
    ) {
      return badRequest(res, "Datos de cita invalidos");
    }

    let doctor = null;
    if (doctorIdNum !== null) {
      doctor = await obtenerMetaDoctor(doctorIdNum);
      if (!doctor) {
        return notFound(res, "Doctor no encontrado");
      }
      if (Object.prototype.hasOwnProperty.call(doctor, "estadoD") && doctor.estadoD !== 1) {
        return badRequest(res, "El doctor seleccionado esta inactivo");
      }
    }

    const creadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;
    let estadoAutorizacion = ESTADO_AUTORIZACION_PENDIENTE;
    let metodoAutorizacion = null;
    let autorizadoPorUsuarioId = null;

    if (doctorIdNum === null) {
      estadoAutorizacion = ESTADO_AUTORIZACION_OK;
      metodoAutorizacion = METODO_AUTORIZACION_SIN_DOCTOR;
    } else if (esRegistroFisico(doctor.nombreD)) {
      estadoAutorizacion = ESTADO_AUTORIZACION_OK;
      metodoAutorizacion = METODO_AUTORIZACION_FISICO;
    } else if (req.user?.rol === "Doctor" && req.user?.idUsuario) {
      const doctorVinculado = await obtenerVinculoDoctorPorUsuario(req.user.idUsuario);
      if (doctorVinculado && doctorVinculado === doctorIdNum) {
        estadoAutorizacion = ESTADO_AUTORIZACION_OK;
        metodoAutorizacion = METODO_AUTORIZACION_AUTO_DOCTOR;
        autorizadoPorUsuarioId = Number(req.user.idUsuario);
      }
    }

    const [rows] = await pool.query(
      "CALL sp_cita_paciente_crear(?,?,?,?,?,?,?,?,?,?)",
      [
        idPacienteNum,
        fecha,
        procedimientoTxt,
        valorNum,
        abonoNum,
        doctorIdNum,
        creadoPorUsuarioId,
        estadoAutorizacion,
        metodoAutorizacion,
        autorizadoPorUsuarioId
      ]
    );

    res.json({
      ok: true,
      idCitaPaciente: rows[0][0].idCitaPaciente,
      estadoAutorizacion,
      metodoAutorizacion
    });

  } catch (err) {
    if (String(err?.code || "").toUpperCase() === "ER_DATA_TOO_LONG") {
      return badRequest(
        res,
        `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres.`
      );
    }
    return handlePacienteError(res, err, "Error al crear cita");
  }
};
// ============================
// ✏️ ACTUALIZAR CITA PACIENTE
// ============================
const actualizarCitaPaciente = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    const { fecha, procedimiento, valor, abono } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de cita invalido");
    }
    if (!fecha || !procedimiento || valor === undefined || valor === null) {
      return badRequest(res, "Datos incompletos");
    }
    if (!esFechaISOValida(String(fecha))) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const procedimientoTxt = String(procedimiento || "").trim();
    if (!procedimientoTxt) {
      return badRequest(res, "Procedimiento invalido");
    }
    const errorLongitudProcedimiento = validarLongitudProcedimientoCita(procedimientoTxt);
    if (errorLongitudProcedimiento) {
      return badRequest(res, errorLongitudProcedimiento);
    }

    const valorNum = Number(valor);
    const abonoNum = Number(abono ?? 0);

    if (!Number.isFinite(valorNum) || !Number.isFinite(abonoNum) || valorNum < 0 || abonoNum < 0) {
      return badRequest(res, "Valor o abono invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_cita_paciente_actualizar(?,?,?,?,?)",
      [id, fecha, procedimientoTxt, valorNum, abonoNum]
    );

    const out = firstRow(rows);
    if (!out || !out.affectedRows) {
      return notFound(res, "Cita no encontrada");
    }

    res.json({ ok: true });

  } catch (err) {
    if (String(err?.code || "").toUpperCase() === "ER_DATA_TOO_LONG") {
      return badRequest(
        res,
        `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres.`
      );
    }
    return handlePacienteError(res, err, "Error al actualizar cita");
  }
};
// ============================
// 📋 LISTAR CITAS DEL PACIENTE
// ============================
const autorizarCitaPaciente = async (req, res) => {
  try {
    const idCitaPaciente = Number(req.params.id);
    if (!Number.isInteger(idCitaPaciente) || idCitaPaciente <= 0) {
      return badRequest(res, "ID de cita invalido");
    }

    const cita = await obtenerMetaCita(idCitaPaciente);
    if (!cita) {
      return notFound(res, "Cita no encontrada");
    }

    const doctorIdCita = Number(cita.doctorId || 0);
    if (!doctorIdCita) {
      return badRequest(res, "La cita no tiene doctor asignado");
    }

    if (
      textoNormalizado(cita.estadoAutorizacionCP) === textoNormalizado(ESTADO_AUTORIZACION_OK)
      || esRegistroFisico(cita.nombreDoctor)
    ) {
      if (
        esRegistroFisico(cita.nombreDoctor)
        && textoNormalizado(cita.estadoAutorizacionCP) !== textoNormalizado(ESTADO_AUTORIZACION_OK)
      ) {
        await pool.query(
          "CALL sp_cita_paciente_autorizar(?,?,?)",
          [idCitaPaciente, null, METODO_AUTORIZACION_FISICO]
        );
      }

      return res.json({
        ok: true,
        alreadyAuthorized: true,
        estadoAutorizacion: ESTADO_AUTORIZACION_OK,
        metodoAutorizacion: esRegistroFisico(cita.nombreDoctor)
          ? METODO_AUTORIZACION_FISICO
          : (cita.metodoAutorizacionCP || null)
      });
    }

    const ejecutadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;
    const esDoctorLogueado = req.user?.rol === "Doctor";
    if (esDoctorLogueado && ejecutadoPorUsuarioId) {
      const idDoctorLogueado = await obtenerVinculoDoctorPorUsuario(ejecutadoPorUsuarioId);
      if (idDoctorLogueado && idDoctorLogueado === doctorIdCita) {
        await pool.query(
          "CALL sp_cita_paciente_autorizar(?,?,?)",
          [idCitaPaciente, ejecutadoPorUsuarioId, METODO_AUTORIZACION_AUTO_DOCTOR]
        );

        return res.json({
          ok: true,
          estadoAutorizacion: ESTADO_AUTORIZACION_OK,
          metodoAutorizacion: METODO_AUTORIZACION_AUTO_DOCTOR
        });
      }
    }

    let correo = String(req.body?.correo || "").trim();
    const password = String(req.body?.password || "");
    if (!password) {
      return badRequest(res, "Contrasena del doctor requerida");
    }

    if (!correo) {
      correo = await obtenerCorreoUsuarioDoctorPorIdDoctor(doctorIdCita);
    }

    if (!correo) {
      return badRequest(
        res,
        "No hay correo de usuario vinculado al doctor del procedimiento"
      );
    }

    const doctorUsuario = await authService.login(correo, password);
    if (!doctorUsuario || doctorUsuario.rol !== "Doctor") {
      return res.status(401).json({
        ok: false,
        message: "Credenciales invalidas del doctor"
      });
    }

    const doctorUsuarioId = Number(doctorUsuario.idUsuario || 0);
    if (!doctorUsuarioId) {
      return res.status(401).json({
        ok: false,
        message: "No se pudo validar el usuario doctor"
      });
    }

    const doctorVinculado = await obtenerVinculoDoctorPorUsuario(doctorUsuarioId);
    if (doctorVinculado && doctorVinculado !== doctorIdCita) {
      return res.status(403).json({
        ok: false,
        message: "El doctor autenticado no corresponde al procedimiento"
      });
    }

    await pool.query(
      "CALL sp_cita_paciente_autorizar(?,?,?)",
      [idCitaPaciente, doctorUsuarioId, METODO_AUTORIZACION_VALIDACION]
    );

    return res.json({
      ok: true,
      estadoAutorizacion: ESTADO_AUTORIZACION_OK,
      metodoAutorizacion: METODO_AUTORIZACION_VALIDACION
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al autorizar cita");
  }
};

const listarCitasPaciente = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de paciente invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_cita_paciente_listar(?)",
      [id]
    );

    const data = firstResultSet(rows);
    const doctorIds = [...new Set(
      data
        .map(item => Number(item.idDoctor || 0))
        .filter(idDoctor => Number.isInteger(idDoctor) && idDoctor > 0)
    )];

    const correoPorDoctor = new Map();
    if (doctorIds.length > 0) {
      const [usuariosRows] = await queryReadWithRetry(
        `SELECT idDoctor, correoU, idUsuario
         FROM usuario
         WHERE idDoctor IN (?)
         ORDER BY idUsuario ASC`,
        [doctorIds]
      );

      for (const u of usuariosRows || []) {
        const idDoctor = Number(u.idDoctor || 0);
        if (!idDoctor || correoPorDoctor.has(idDoctor)) continue;
        correoPorDoctor.set(idDoctor, String(u.correoU || "").trim());
      }
    }

    const dataConCorreo = data.map(item => ({
      ...item,
      correoDoctor: correoPorDoctor.get(Number(item.idDoctor || 0)) || null
    }));

    res.json({
      ok: true,
      data: dataConCorreo
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al listar citas");
  }
};

const existePaciente = async (req, res) => {
  try {
    const nombreRaw = String(req.query?.nombre || "").trim();
    const telefonoRaw = String(req.query?.telefono || "").trim();

    if (!nombreRaw) {
      return badRequest(res, "Nombre requerido");
    }

    const nombreNorm = nombreRaw.toLowerCase();
    const telefonoNorm = telefonoRaw.toLowerCase();
    const telefonoDigitos = telefonoRaw.replace(/\D+/g, "");

    const [rows] = await queryReadWithRetry(
      `SELECT idPaciente, NombreP, telefonoP
       FROM paciente
       WHERE LOWER(TRIM(NombreP)) = ?
       ORDER BY idPaciente ASC`,
      [nombreNorm]
    );

    const lista = Array.isArray(rows) ? rows : [];
    let coincidencia = null;
    let matchBy = null;

    if (telefonoRaw) {
      coincidencia = lista.find((p) => {
        const telDbRaw = String(p?.telefonoP || "").trim();
        const telDbNorm = telDbRaw.toLowerCase();
        const telDbDig = telDbRaw.replace(/\D+/g, "");
        const matchRaw = telDbNorm && telDbNorm === telefonoNorm;
        const matchDig = telefonoDigitos && telDbDig && telDbDig === telefonoDigitos;
        return matchRaw || matchDig;
      }) || null;

      if (coincidencia) {
        const telDbRaw = String(coincidencia?.telefonoP || "").trim();
        const telDbNorm = telDbRaw.toLowerCase();
        const telDbDig = telDbRaw.replace(/\D+/g, "");
        const matchRaw = telDbNorm && telDbNorm === telefonoNorm;
        const matchDig = telefonoDigitos && telDbDig && telDbDig === telefonoDigitos;
        matchBy = (matchRaw || matchDig) ? "nombre_y_telefono" : "nombre";
      }
    }

    if (!coincidencia && lista.length > 0) {
      coincidencia = lista[0];
      matchBy = "nombre";
    }

    return res.json({
      ok: true,
      exists: !!coincidencia,
      matchBy,
      data: coincidencia
        ? {
            idPaciente: coincidencia.idPaciente,
            NombreP: coincidencia.NombreP,
            telefonoP: coincidencia.telefonoP
          }
        : null
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al validar paciente existente");
  }
};

module.exports = {
  buscar,
  existePaciente,
  monitorSeguimiento,
  guardarMonitorContacto,
  obtenerPorId,
  guardarFirma,
  guardarPaciente,
  crearCitaPaciente,
  actualizarCitaPaciente,
  autorizarCitaPaciente,
  listarCitasPaciente
};
