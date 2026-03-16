const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet } = require("../utils/dbResult");
const { resolveStorageCandidates, deleteIfExists } = require("../utils/file");

/* ======================================================
   📸 SUBIR FOTO DE PACIENTE
   usa: sp_foto_paciente_crear
====================================================== */
// 📸 SUBIR
const subirFotoPaciente = async (req, res) => {
  try {
    if (!req.file) {
      return badRequest(res, "Archivo no recibido");
    }

    const { pacienteId, fecha } = req.body;
    const pacienteIdNum = Number(pacienteId);
    const fechaNormalizada = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))
      ? String(fecha)
      : new Date().toISOString().split("T")[0];

    if (!Number.isInteger(pacienteIdNum) || pacienteIdNum <= 0) {
      await deleteIfExists(req.file.path);
      return badRequest(res, "pacienteId invalido");
    }

    const ruta = `/fotos/${req.file.filename}`;

    const [rows] = await pool.query(
      "CALL sp_foto_paciente_crear(?, ?, ?)",
      [pacienteIdNum, fechaNormalizada, ruta]
    );

    res.json({
      ok: true,
      idFotoPaciente: rows[0][0].idFotoPaciente,
      ruta
    });

  } catch (err) {
    return serverError(res, err, "Error al subir foto");
  }
};
/* ======================================================
   📂 LISTAR FOTOS DE PACIENTE
   usa: sp_foto_paciente_listar
====================================================== */
const listarFotosPaciente = async (req, res) => {
  try {
    const { pacienteId } = req.params;

    if (!pacienteId) {
      return badRequest(res, "ID de paciente requerido");
    }

    const [rows] = await pool.query(
      "CALL sp_foto_paciente_listar(?)",
      [pacienteId]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });

  } catch (err) {
    return serverError(res, err, "Error al listar fotos");
  }
};
/* ======================================================
   ⭐ GUARDAR FOTO PRINCIPAL DE PACIENTE
====================================================== */
const guardarFotoPrincipalPaciente = async (req, res) => {
  try {
    const pacienteId = Number(req.body?.pacienteId || 0);
    const idFotoPaciente = Number(req.body?.idFotoPaciente || 0);

    if (!pacienteId || !idFotoPaciente) {
      return badRequest(res, "pacienteId e idFotoPaciente son requeridos");
    }

    const [fotoRows] = await pool.query(
      `SELECT idFotoPaciente
       FROM fotopaciente
       WHERE idFotoPaciente = ? AND pacienteId = ?
       LIMIT 1`,
      [idFotoPaciente, pacienteId]
    );

    if (!Array.isArray(fotoRows) || fotoRows.length === 0) {
      return notFound(res, "La foto no pertenece al paciente");
    }

    await pool.query(
      "UPDATE paciente SET fotoPrincipalId = ? WHERE idPaciente = ?",
      [idFotoPaciente, pacienteId]
    );

    res.json({
      ok: true,
      fotoPrincipalId: idFotoPaciente
    });
  } catch (err) {
    return serverError(res, err, "Error al guardar foto principal");
  }
};

/* ======================================================
   🗑️ ELIMINAR FOTO DE PACIENTE
   usa: sp_foto_paciente_eliminar
====================================================== */
const eliminarFotoPaciente = async (req, res) => {
  try {
    const { idFotoPaciente } = req.params;

    if (!idFotoPaciente) {
      return badRequest(res, "ID de foto requerido");
    }

    // 1️⃣ Obtener ruta antes de borrar
    const [rows] = await pool.query(
      "SELECT rutaFP FROM fotopaciente WHERE idFotoPaciente = ?",
      [idFotoPaciente]
    );

    const foto = Array.isArray(rows) ? rows[0] : null;
    if (!foto) {
      return notFound(res, "Foto no encontrada");
    }

    const ruta = foto.rutaFP;
    const fullPaths = resolveStorageCandidates(ruta);

    // 2️⃣ Eliminar archivo físico
    for (const fullPath of fullPaths) {
      await deleteIfExists(fullPath);
    }

    // 3️⃣ Si era foto principal, limpiar referencia
    await pool.query(
      "UPDATE paciente SET fotoPrincipalId = NULL WHERE fotoPrincipalId = ?",
      [idFotoPaciente]
    );

    // 4️⃣ Eliminar registro BD
    await pool.query(
      "CALL sp_foto_paciente_eliminar(?)",
      [idFotoPaciente]
    );

    res.json({ ok: true });

  } catch (err) {
    return serverError(res, err, "Error al eliminar foto");
  }
};

module.exports = {
  subirFotoPaciente,
  listarFotosPaciente,
  guardarFotoPrincipalPaciente,
  eliminarFotoPaciente
};
