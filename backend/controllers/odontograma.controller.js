const pool = require("../config/db");
const { badRequest, serverError } = require("../utils/http");
const { firstRow, firstResultSet } = require("../utils/dbResult");

// ============================
// 🦷 GUARDAR ODONTOGRAMA
// ============================
const guardarOdontograma = async (req, res) => {
  try {
    const { idPaciente, fechaO, odontograma } = req.body;

    if (!idPaciente || !odontograma) {
      return badRequest(res, "Datos incompletos");
    }

    await pool.query(
      "CALL sp_odontograma_guardar(?, ?, ?)",
      [
        idPaciente,
        fechaO || new Date().toISOString().split("T")[0],
        odontograma
      ]
    );

    res.json({ ok: true });

  } catch (err) {
    return serverError(res, err, "Error al guardar odontograma");
  }
};

// ============================
// 🦷 OBTENER ÚLTIMO ODONTOGRAMA
// ============================
const obtenerUltimoOdontograma = async (req, res) => {
  try {
    const { idPaciente } = req.params;

    if (!idPaciente) {
      return badRequest(res, "ID paciente requerido");
    }

    const [rows] = await pool.query(
      "CALL sp_odontograma_ultimo(?)",
      [idPaciente]
    );

    res.json({
      ok: true,
      data: firstRow(rows)
    });

  } catch (err) {
    return serverError(res, err, "Error al obtener odontograma");
  }
};

// ============================
// HISTORIAL DE ODONTOGRAMAS POR PACIENTE
// ============================
const obtenerHistorialOdontogramas = async (req, res) => {
  try {
    const { idPaciente } = req.params;

    if (!idPaciente) {
      return badRequest(res, "ID paciente requerido");
    }

    const [rows] = await pool.query(
      "CALL sp_odontograma_historial(?)",
      [idPaciente]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });

  } catch (err) {
    return serverError(res, err, "Error al obtener historial de odontogramas");
  }
};

// ============================
// OBTENER ODONTOGRAMA POR ID
// ============================
const obtenerOdontogramaPorId = async (req, res) => {
  try {
    const { idOdontograma } = req.params;

    if (!idOdontograma) {
      return badRequest(res, "ID odontograma requerido");
    }

    const [rows] = await pool.query(
      "CALL sp_odontograma_get_by_id(?)",
      [idOdontograma]
    );

    res.json({
      ok: true,
      data: firstRow(rows)
    });

  } catch (err) {
    return serverError(res, err, "Error al obtener odontograma por ID");
  }
};

module.exports = {
  guardarOdontograma,
  obtenerUltimoOdontograma,
  obtenerHistorialOdontogramas,
  obtenerOdontogramaPorId
};

