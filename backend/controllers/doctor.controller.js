const pool = require("../config/db");
const bcrypt = require("bcrypt");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { parsePngBase64, writeBufferFile } = require("../utils/file");
const { imgDocsDir } = require("../config/storagePaths");

// backend/controllers/doctor.controller.js

function normalizarEstadoDoctor(value) {
  const txt = String(value ?? "").trim().toLowerCase();
  if (txt === "0" || txt === "inactivo" || txt === "inactive" || txt === "false") return 0;
  if (txt === "1" || txt === "activo" || txt === "active" || txt === "true") return 1;
  return Number(value) === 0 ? 0 : 1;
}

async function existeColumnaEstadoDoctor() {
  const [rows] = await pool.query(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'doctor'
        AND COLUMN_NAME = 'estadoD'
      LIMIT 1`
  );
  return Array.isArray(rows) && rows.length > 0;
}


// ✅ LISTAR DOCTORES
const listar = async (req, res) => {
  try {
    const tieneColumnaEstado = await existeColumnaEstadoDoctor();
    const [rows] = await pool.query(
      tieneColumnaEstado
        ? "SELECT idDoctor, nombreD, TelefonoD, FirmaD, SelloD, estadoD FROM doctor"
        : "SELECT idDoctor, nombreD, TelefonoD, FirmaD, SelloD FROM doctor"
    );

    const data = (rows || []).map((row) => {
      const estadoD = tieneColumnaEstado ? normalizarEstadoDoctor(row.estadoD) : 1;
      return {
        ...row,
        estadoD,
        estadoNombre: estadoD === 1 ? "Activo" : "Inactivo"
      };
    });

    res.json({
      ok: true,
      data
    });
  } catch (err) {
    return serverError(res, err, "Error al listar doctores");
  }
};

// ✅ CREAR DOCTOR (CON FIRMA EN PNG)
const crear = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const telefono = String(req.body?.telefono || "").trim();
    const firmaBase64 = req.body?.firmaBase64;

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
    const idDoctor = Number(req.params?.id || 0);
    if (!Number.isInteger(idDoctor) || idDoctor <= 0) {
      return badRequest(res, "ID de doctor invalido");
    }

    if (!req.file) {
      return badRequest(res, "Archivo requerido");
    }

    const ruta = `/img/docs/${req.file.filename}`;

    const [result] = await pool.query(
      "UPDATE doctor SET SelloD = ? WHERE idDoctor = ?",
      [ruta, idDoctor]
    );
    if (!result?.affectedRows) {
      return notFound(res, "Doctor no encontrado");
    }

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
    const soloActivos = ["1", "true", "yes", "on"].includes(
      String(req.query?.soloActivos || "").trim().toLowerCase()
    );
    const tieneColumnaEstado = await existeColumnaEstadoDoctor();

    if (req.user?.rol === "Doctor" && req.user?.idUsuario) {
      const [rowsVinculados] = await pool.query(
        tieneColumnaEstado
          ? `SELECT d.idDoctor, d.nombreD, d.estadoD
             FROM usuario u
             INNER JOIN doctor d ON d.idDoctor = u.idDoctor
             WHERE u.idUsuario = ?
             LIMIT 1`
          : `SELECT d.idDoctor, d.nombreD
             FROM usuario u
             INNER JOIN doctor d ON d.idDoctor = u.idDoctor
             WHERE u.idUsuario = ?
             LIMIT 1`,
        [req.user.idUsuario]
      );

      if (Array.isArray(rowsVinculados) && rowsVinculados.length > 0) {
        const doctorVinculado = rowsVinculados[0];
        const estadoVinculado = tieneColumnaEstado
          ? normalizarEstadoDoctor(doctorVinculado.estadoD)
          : 1;
        const data = (soloActivos && estadoVinculado !== 1)
          ? []
          : [{ idDoctor: doctorVinculado.idDoctor, nombreD: doctorVinculado.nombreD }];

        return res.json({
          ok: true,
          data,
          doctorVinculado: true
        });
      }

      const [rowsFallback] = await pool.query(
        soloActivos && tieneColumnaEstado
          ? "CALL sp_doctor_listar_select_activos()"
          : "CALL sp_doctor_listar_select()"
      );

      return res.json({
        ok: true,
        data: firstResultSet(rowsFallback),
        doctorVinculado: false
      });
    }

    const [rows] = await pool.query(
      soloActivos && tieneColumnaEstado
        ? "CALL sp_doctor_listar_select_activos()"
        : "CALL sp_doctor_listar_select()"
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

const actualizarEstado = async (req, res) => {
  try {
    const idDoctor = Number(req.params?.id || 0);
    const estadoD = Number(req.body?.estadoD);
    const password = String(req.body?.password || "");
    const idUsuario = Number(req.user?.idUsuario || 0);

    if (!Number.isInteger(idDoctor) || idDoctor <= 0) {
      return badRequest(res, "ID de doctor invalido");
    }
    if (!Number.isInteger(estadoD) || (estadoD !== 0 && estadoD !== 1)) {
      return badRequest(res, "estadoD invalido");
    }
    if (!password) {
      return badRequest(res, "Contrasena requerida");
    }
    if (!idUsuario) {
      return res.status(403).json({
        ok: false,
        message: "Usuario no autorizado"
      });
    }

    const tieneColumnaEstado = await existeColumnaEstadoDoctor();
    if (!tieneColumnaEstado) {
      return badRequest(res, "Falta migracion en base de datos: doctor.estadoD");
    }

    const [usuarioRows] = await pool.query(
      `SELECT idUsuario, idDoctor, passwordU
         FROM usuario
        WHERE idUsuario = ?
        LIMIT 1`,
      [idUsuario]
    );

    const usuario = usuarioRows?.[0] || null;
    const idDoctorVinculado = Number(usuario?.idDoctor || 0);
    if (!usuario || !idDoctorVinculado || idDoctorVinculado !== idDoctor) {
      return res.status(403).json({
        ok: false,
        message: "Solo puede cambiar el estado de su propio doctor"
      });
    }

    const passwordOk = await bcrypt.compare(password, String(usuario.passwordU || ""));
    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        message: "Credenciales invalidas del doctor"
      });
    }

    const [result] = await pool.query(
      "UPDATE doctor SET estadoD = ? WHERE idDoctor = ?",
      [estadoD, idDoctor]
    );
    if (!result?.affectedRows) {
      return notFound(res, "Doctor no encontrado");
    }

    return res.json({
      ok: true,
      idDoctor,
      estadoD
    });
  } catch (err) {
    return serverError(res, err, "Error al cambiar estado del doctor");
  }
};
// 🦷 OBTENER DOCTOR POR ID (MODAL VER)
const obtenerPorId = async (req, res) => {
  try {
    const idDoctor = Number(req.params?.id || 0);
    if (!Number.isInteger(idDoctor) || idDoctor <= 0) {
      return badRequest(res, "ID de doctor invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_doctor_get_by_id(?)",
      [idDoctor]
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
  actualizarEstado,
  obtenerPorId
};
