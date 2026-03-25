const pool = require("../config/db");
const { badRequest, serverError } = require("../utils/http");
const { firstRow, firstResultSet } = require("../utils/dbResult");

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

function handleOdontogramaError(res, err, fallbackMessage) {
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

const guardarOdontograma = async (req, res) => {
  try {
    const { idPaciente, fechaO, odontograma } = req.body;
    const idPacienteNum = Number(idPaciente || 0);
    const odontogramaTxt = String(odontograma || "").trim();
    const fechaNormalizada = esFechaISOValida(fechaO)
      ? fechaO
      : new Date().toISOString().split("T")[0];

    if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0) {
      return badRequest(res, "idPaciente invalido");
    }
    if (!odontogramaTxt) {
      return badRequest(res, "Datos incompletos");
    }
    try {
      JSON.parse(odontogramaTxt);
    } catch (_err) {
      return badRequest(res, "Odontograma invalido");
    }

    await pool.query(
      "CALL sp_odontograma_guardar(?, ?, ?)",
      [
        idPacienteNum,
        fechaNormalizada,
        odontogramaTxt
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    return handleOdontogramaError(res, err, "Error al guardar odontograma");
  }
};

const obtenerUltimoOdontograma = async (req, res) => {
  try {
    const idPaciente = Number(req.params?.idPaciente || 0);

    if (!Number.isInteger(idPaciente) || idPaciente <= 0) {
      return badRequest(res, "ID paciente invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_odontograma_ultimo(?)",
      [idPaciente]
    );

    res.json({
      ok: true,
      data: firstRow(rows)
    });
  } catch (err) {
    return handleOdontogramaError(res, err, "Error al obtener odontograma");
  }
};

const obtenerHistorialOdontogramas = async (req, res) => {
  try {
    const idPaciente = Number(req.params?.idPaciente || 0);

    if (!Number.isInteger(idPaciente) || idPaciente <= 0) {
      return badRequest(res, "ID paciente invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_odontograma_historial(?)",
      [idPaciente]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });
  } catch (err) {
    return handleOdontogramaError(res, err, "Error al obtener historial de odontogramas");
  }
};

const obtenerOdontogramaPorId = async (req, res) => {
  try {
    const idOdontograma = Number(req.params?.idOdontograma || 0);

    if (!Number.isInteger(idOdontograma) || idOdontograma <= 0) {
      return badRequest(res, "ID odontograma invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_odontograma_get_by_id(?)",
      [idOdontograma]
    );

    res.json({
      ok: true,
      data: firstRow(rows)
    });
  } catch (err) {
    return handleOdontogramaError(res, err, "Error al obtener odontograma por ID");
  }
};

module.exports = {
  guardarOdontograma,
  obtenerUltimoOdontograma,
  obtenerHistorialOdontogramas,
  obtenerOdontogramaPorId
};

