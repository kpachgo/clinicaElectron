const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { parsePngBase64, writeBufferFile } = require("../utils/file");
const { imgDocsDir } = require("../config/storagePaths");

// backend/controllers/doctor.controller.js


// ✅ LISTAR DOCTORES
const listar = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT idDoctor, nombreD, TelefonoD, FirmaD, SelloD FROM doctor"
    );

    res.json({
      ok: true,
      data: rows
    });
  } catch (err) {
    return serverError(res, err, "Error al listar doctores");
  }
};

// ✅ CREAR DOCTOR (CON FIRMA EN PNG)
const crear = async (req, res) => {
  try {
    const { nombre, telefono, firmaBase64 } = req.body;

    if (!nombre) {
      return badRequest(res, "Nombre requerido");
    }

    let firmaBuffer = null;
    if (firmaBase64) {
      firmaBuffer = parsePngBase64(firmaBase64);
      if (!firmaBuffer) {
        return badRequest(res, "Formato de firma invalido");
      }
    }

    // 1️⃣ Insertar doctor SIN firma
    const [result] = await pool.query(
      "INSERT INTO doctor (nombreD, TelefonoD) VALUES (?, ?)",
      [nombre, telefono || null]
    );

    const idDoctor = result.insertId;
    let rutaFirma = null;

    // 2️⃣ Si viene firmaBase64 → guardarla como PNG
    if (firmaBuffer) {
      const fileName = `firma_${idDoctor}.png`;
      await writeBufferFile(imgDocsDir, fileName, firmaBuffer);

      rutaFirma = `/img/docs/${fileName}`;

      // 3️⃣ Actualizar BD con la ruta
      await pool.query(
        "UPDATE doctor SET FirmaD = ? WHERE idDoctor = ?",
        [rutaFirma, idDoctor]
      );
    }

    res.json({
      ok: true,
      idDoctor,
      firma: rutaFirma
    });

  } catch (err) {
    return serverError(res, err, "Error al crear doctor");
  }
};
// ✅ SUBIR SELLO
const subirSello = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return badRequest(res, "ID de doctor requerido");
    }

    if (!req.file) {
      return badRequest(res, "Archivo requerido");
    }

    const ruta = `/img/docs/${req.file.filename}`;

    await pool.query(
      "UPDATE doctor SET SelloD = ? WHERE idDoctor = ?",
      [ruta, id]
    );

    res.json({
      ok: true,
      sello: ruta
    });

  } catch (err) {
    return serverError(res, err, "Error al subir sello");
  }
};
// ============================
// 🦷 LISTAR DOCTORES (SELECT)
// ============================
const listarSelect = async (req, res) => {
  try {
    if (req.user?.rol === "Doctor" && req.user?.idUsuario) {
      const [rowsVinculados] = await pool.query(
        `SELECT d.idDoctor, d.nombreD
         FROM usuario u
         INNER JOIN doctor d ON d.idDoctor = u.idDoctor
         WHERE u.idUsuario = ?
         LIMIT 1`,
        [req.user.idUsuario]
      );

      if (Array.isArray(rowsVinculados) && rowsVinculados.length > 0) {
        return res.json({
          ok: true,
          data: rowsVinculados,
          doctorVinculado: true
        });
      }

      const [rowsFallback] = await pool.query(
        "CALL sp_doctor_listar_select()"
      );

      return res.json({
        ok: true,
        data: firstResultSet(rowsFallback),
        doctorVinculado: false
      });
    }

    const [rows] = await pool.query(
      "CALL sp_doctor_listar_select()"
    );

    res.json({
      ok: true,
      data: firstResultSet(rows),
      doctorVinculado: null
    });

  } catch (err) {
    return serverError(res, err, "Error al listar doctores");
  }
};
// 🦷 OBTENER DOCTOR POR ID (MODAL VER)
const obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return badRequest(res, "ID de doctor requerido");
    }

    const [rows] = await pool.query(
      "CALL sp_doctor_get_by_id(?)",
      [id]
    );

    const doctor = firstRow(rows);
    if (!doctor) {
      return notFound(res, "Doctor no encontrado");
    }

    res.json({
      ok: true,
      data: doctor
    });

  } catch (err) {
    return serverError(res, err, "Error al obtener doctor");
  }
};



// ✅ EXPORT CORRECTO
module.exports = {
  listar,
  crear,
  subirSello,
  listarSelect,
  obtenerPorId
};
