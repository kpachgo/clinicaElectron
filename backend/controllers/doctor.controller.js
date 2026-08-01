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

function mapDoctorRows(rows, tieneColumnaEstado) {
  return (rows || []).map((row) => {
    const estadoD = tieneColumnaEstado ? normalizarEstadoDoctor(row.estadoD) : 1;
    return {
      ...row,
      estadoD,
      estadoNombre: estadoD === 1 ? "Activo" : "Inactivo"
    };
  });
}

async function obtenerDoctorVinculadoPorUsuario(idUsuario) {
  const [rows] = await pool.query(
    `SELECT idDoctor
       FROM usuario
      WHERE idUsuario = ?
      LIMIT 1`,
    [idUsuario]
  );
  return Number(rows?.[0]?.idDoctor || 0);
}

async function validarAccesoDoctorPropio(req, idDoctor) {
  if (req.user?.rol !== "Doctor") return true;

  const idUsuario = Number(req.user?.idUsuario || 0);
  if (!idUsuario) return false;

  const idDoctorVinculado = await obtenerDoctorVinculadoPorUsuario(idUsuario);
  return Boolean(idDoctorVinculado && idDoctorVinculado === idDoctor);
}


// ✅ LISTAR DOCTORES
const listar = async (req, res) => {
  try {
    const tieneColumnaEstado = await existeColumnaEstadoDoctor();
    if (req.user?.rol === "Doctor") {
      const idUsuario = Number(req.user?.idUsuario || 0);
      if (!idUsuario) {
        return res.json({ ok: true, data: [] });
      }

      const [rowsDoctor] = await pool.query(
        tieneColumnaEstado
          ? `SELECT d.idDoctor, d.nombreD, d.TelefonoD, d.FirmaD, d.SelloD, d.estadoD
               FROM usuario u
               INNER JOIN doctor d ON d.idDoctor = u.idDoctor
              WHERE u.idUsuario = ?
              LIMIT 1`
          : `SELECT d.idDoctor, d.nombreD, d.TelefonoD, d.FirmaD, d.SelloD
               FROM usuario u
               INNER JOIN doctor d ON d.idDoctor = u.idDoctor
              WHERE u.idUsuario = ?
              LIMIT 1`,
        [idUsuario]
      );

      return res.json({
        ok: true,
        data: mapDoctorRows(rowsDoctor, tieneColumnaEstado)
      });
    }

    const [rows] = await pool.query(
      tieneColumnaEstado
        ? "SELECT idDoctor, nombreD, TelefonoD, FirmaD, SelloD, estadoD FROM doctor"
        : "SELECT idDoctor, nombreD, TelefonoD, FirmaD, SelloD FROM doctor"
    );

    res.json({
      ok: true,
      data: mapDoctorRows(rows, tieneColumnaEstado)
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

    const puedeEditar = await validarAccesoDoctorPropio(req, idDoctor);
    if (!puedeEditar) {
      return res.status(403).json({
        ok: false,
        message: "Solo puede actualizar el sello de su propio doctor"
      });
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

const validarAccesoMediaDoctor = async (req, res, next) => {
  try {
    const idDoctor = Number(req.params?.id || 0);
    if (!Number.isInteger(idDoctor) || idDoctor <= 0) {
      return badRequest(res, "ID de doctor invalido");
    }

    const puedeEditar = await validarAccesoDoctorPropio(req, idDoctor);
    if (!puedeEditar) {
      return res.status(403).json({
        ok: false,
        message: "Solo puede actualizar firma/sello de su propio doctor"
      });
    }

    return next();
  } catch (err) {
    return serverError(res, err, "Error al validar acceso de doctor");
  }
};

const actualizarFirma = async (req, res) => {
  try {
    const idDoctor = Number(req.params?.id || 0);
    const firmaBase64 = req.body?.firmaBase64;
    if (!Number.isInteger(idDoctor) || idDoctor <= 0) {
      return badRequest(res, "ID de doctor invalido");
    }

    const puedeEditar = await validarAccesoDoctorPropio(req, idDoctor);
    if (!puedeEditar) {
      return res.status(403).json({
        ok: false,
        message: "Solo puede actualizar la firma de su propio doctor"
      });
    }

    const firmaBuffer = parsePngBase64(firmaBase64);
    if (!firmaBuffer) {
      return badRequest(res, "Formato de firma invalido");
    }

    const fileName = `firma_${idDoctor}.png`;
    await writeBufferFile(imgDocsDir, fileName, firmaBuffer);
    const rutaFirma = `/img/docs/${fileName}`;

    const [result] = await pool.query(
      "UPDATE doctor SET FirmaD = ? WHERE idDoctor = ?",
      [rutaFirma, idDoctor]
    );
    if (!result?.affectedRows) {
      return notFound(res, "Doctor no encontrado");
    }

    return res.json({
      ok: true,
      firma: rutaFirma
    });
  } catch (err) {
    return serverError(res, err, "Error al actualizar firma");
  }
};

const listarPendientesAutorizacion = async (req, res) => {
  try {
    if (req.user?.rol !== "Doctor") {
      return res.status(403).json({
        ok: false,
        message: "Solo doctores pueden consultar pendientes"
      });
    }

    const idUsuario = Number(req.user?.idUsuario || 0);
    if (!idUsuario) {
      return res.status(403).json({
        ok: false,
        message: "Usuario no autorizado"
      });
    }

    const idDoctor = await obtenerDoctorVinculadoPorUsuario(idUsuario);
    if (!idDoctor) {
      return res.json({ ok: true, data: [], doctorVinculado: false });
    }

    const limit = Number(req.query?.limit || 20);
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const [rows] = await pool.query(
      "CALL sp_doctor_citas_pendientes_autorizacion(?,?)",
      [idDoctor, safeLimit]
    );

    return res.json({
      ok: true,
      data: firstResultSet(rows),
      doctorVinculado: true
    });
  } catch (err) {
    return serverError(res, err, "Error al listar pendientes de autorizacion");
  }
};

const autorizarTodosPendientes = async (req, res) => {
  try {
    if (req.user?.rol !== "Doctor") {
      return res.status(403).json({
        ok: false,
        message: "Solo doctores pueden autorizar pendientes"
      });
    }

    const idUsuario = Number(req.user?.idUsuario || 0);
    if (!idUsuario) {
      return res.status(403).json({
        ok: false,
        message: "Usuario no autorizado"
      });
    }

    const idDoctor = await obtenerDoctorVinculadoPorUsuario(idUsuario);
    if (!idDoctor) {
      return res.status(403).json({
        ok: false,
        message: "Doctor no vinculado"
      });
    }

    const [rows] = await pool.query(
      "CALL sp_doctor_citas_pendientes_autorizar_todos(?,?)",
      [idDoctor, idUsuario]
    );
    const result = firstRow(rows) || {};
    const autorizadas = Number(result.affectedRows || 0);

    return res.json({
      ok: true,
      autorizadas
    });
  } catch (err) {
    return serverError(res, err, "Error al autorizar pendientes");
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
    const soloVinculado = ["1", "true", "yes", "on"].includes(
      String(req.query?.soloVinculado || "").trim().toLowerCase()
    );
    const tieneColumnaEstado = await existeColumnaEstadoDoctor();

    if (req.user?.rol === "Doctor" && soloVinculado) {
      const idUsuario = Number(req.user?.idUsuario || 0);
      if (!idUsuario) {
        return res.json({
          ok: true,
          data: [],
          doctorVinculado: false
        });
      }

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
        [idUsuario]
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

      return res.json({
        ok: true,
        data: [],
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

    if (req.user?.rol === "Doctor") {
      const contexto = String(req.query?.contexto || req.query?.context || "").trim().toLowerCase();
      const esContextoClinico = contexto === "paciente" || contexto === "clinico" || contexto === "clinical";
      if (!esContextoClinico) {
        const idUsuario = Number(req.user?.idUsuario || 0);
        if (!idUsuario) {
          return res.status(403).json({
            ok: false,
            message: "Usuario no autorizado"
          });
        }
        const idDoctorVinculado = await obtenerDoctorVinculadoPorUsuario(idUsuario);
        if (!idDoctorVinculado || idDoctorVinculado !== idDoctor) {
          return res.status(403).json({
            ok: false,
            message: "Solo puede ver su propio doctor"
          });
        }
      }
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
  validarAccesoMediaDoctor,
  actualizarFirma,
  listarPendientesAutorizacion,
  autorizarTodosPendientes,
  listarSelect,
  actualizarEstado,
  obtenerPorId
};
