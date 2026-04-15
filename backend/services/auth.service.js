const db = require("../config/db");
const bcrypt = require("bcrypt");

function normalizeSecurityQuestion(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeSecurityAnswer(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isMissingSecurityColumnsError(err) {
    const code = String(err?.code || "").toUpperCase();
    if (code === "SECURITY_COLUMNS_MISSING") return true;
    if (code !== "ER_BAD_FIELD_ERROR" && code !== "ER_UNKNOWN_COLUMN") return false;

    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("preguntaseguridadu") || msg.includes("respuestaseguridadhashu");
}

function buildSecurityColumnsMissingError() {
    const err = new Error(
        "Faltan columnas de seguridad en tabla usuario. Ejecute migracion de pregunta de seguridad."
    );
    err.code = "SECURITY_COLUMNS_MISSING";
    return err;
}

async function ensureSecurityColumnsAvailable(conn = db) {
    try {
        await conn.query(
            "SELECT preguntaSeguridadU, respuestaSeguridadHashU FROM usuario LIMIT 0"
        );
    } catch (err) {
        if (isMissingSecurityColumnsError(err)) {
            throw buildSecurityColumnsMissingError();
        }
        throw err;
    }
}

async function login(correo, password) {
    const [rows] = await db.query(
        "CALL sp_login_usuario(?)",
        [correo]
    );

    const usuario = rows[0][0];
    if (!usuario) return null;

    const passwordValida = await bcrypt.compare(
        password,
        usuario.passwordU
    );

    if (!passwordValida) return null;

    return {
        idUsuario: usuario.idUsuario,
        correo: usuario.correoU,
        nombre: usuario.NombreU,
        cargo: usuario.Cargo,
        idRol: usuario.idRol,
        rol: usuario.nombreR
    };
}

async function crearUsuario({ correo, passwordHash, nombre, cargo, idRol, idDoctor }) {
    const [rows] = await db.query(
        "CALL sp_usuario_crear(?, ?, ?, ?, ?, ?)",
        [
            correo,
            passwordHash,
            nombre,
            cargo,
            idRol,
            idDoctor ?? null
        ]
    );

    return rows?.[0]?.[0]?.idUsuario ?? null;
}

async function listarRolesRegistro() {
    const [rows] = await db.query(
        "SELECT idRol, nombreR FROM rol ORDER BY nombreR ASC"
    );

    return rows || [];
}

async function obtenerRolPorId(idRol) {
    const [rows] = await db.query(
        "SELECT idRol, nombreR FROM rol WHERE idRol = ? LIMIT 1",
        [idRol]
    );
    return rows?.[0] || null;
}

async function listarDoctoresRegistro() {
    const [rows] = await db.query("CALL sp_doctor_listar_select()");
    return rows?.[0] || [];
}

async function obtenerUsuarioRecuperacionPorCorreo(correo) {
    await ensureSecurityColumnsAvailable();

    const [rows] = await db.query(
        `SELECT
            idUsuario,
            correoU,
            NombreU,
            TRIM(COALESCE(preguntaSeguridadU, '')) AS preguntaSeguridadU,
            TRIM(COALESCE(respuestaSeguridadHashU, '')) AS respuestaSeguridadHashU
         FROM usuario
         WHERE correoU = ?
         LIMIT 1`,
        [correo]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    const preguntaSeguridad = String(row.preguntaSeguridadU || "").trim();
    const respuestaHash = String(row.respuestaSeguridadHashU || "").trim();

    return {
        idUsuario: Number(row.idUsuario || 0),
        correo: String(row.correoU || "").trim(),
        nombre: String(row.NombreU || "").trim(),
        preguntaSeguridad,
        hasSecurityQuestion: !!preguntaSeguridad && !!respuestaHash
    };
}

async function cambiarPasswordPorIdUsuario(idUsuario, passwordHash, conn = null) {
    const executor = conn || db;
    await executor.query(
        `UPDATE usuario
         SET passwordU = ?
         WHERE idUsuario = ?`,
        [passwordHash, idUsuario]
    );
}

async function configurarPreguntaSeguridadPorIdUsuario(
    idUsuario,
    preguntaSeguridad,
    respuestaSeguridad,
    options = {}
) {
    const { conn = null, ignoreMissingColumns = false } = options;
    const executor = conn || db;

    try {
        await ensureSecurityColumnsAvailable(executor);
    } catch (err) {
        if (ignoreMissingColumns && isMissingSecurityColumnsError(err)) {
            return false;
        }
        throw err;
    }

    const preguntaNormalizada = normalizeSecurityQuestion(preguntaSeguridad);
    const respuestaNormalizada = normalizeSecurityAnswer(respuestaSeguridad);
    const respuestaHash = await bcrypt.hash(respuestaNormalizada, 10);

    await executor.query(
        `UPDATE usuario
         SET preguntaSeguridadU = ?, respuestaSeguridadHashU = ?
         WHERE idUsuario = ?`,
        [preguntaNormalizada, respuestaHash, idUsuario]
    );

    return true;
}

async function validarRespuestaSeguridad({
    correo,
    respuestaSeguridad
}) {
    const usuario = await obtenerUsuarioRecuperacionPorCorreo(correo);
    if (!usuario) {
        return { ok: false, code: "NOT_FOUND" };
    }

    if (!usuario.hasSecurityQuestion) {
        return { ok: false, code: "SECURITY_NOT_CONFIGURED" };
    }

    const [rows] = await db.query(
        `SELECT TRIM(COALESCE(respuestaSeguridadHashU, '')) AS respuestaSeguridadHashU
         FROM usuario
         WHERE idUsuario = ?
         LIMIT 1`,
        [usuario.idUsuario]
    );

    const hash = String(rows?.[0]?.respuestaSeguridadHashU || "").trim();
    if (!hash) {
        return { ok: false, code: "SECURITY_NOT_CONFIGURED" };
    }

    const respuestaNormalizada = normalizeSecurityAnswer(respuestaSeguridad);
    const answerOk = await bcrypt.compare(respuestaNormalizada, hash);
    if (!answerOk) {
        return { ok: false, code: "ANSWER_INVALID" };
    }

    return { ok: true, idUsuario: usuario.idUsuario };
}

async function configurarPreguntaConPasswordActual({
    correo,
    passwordActual,
    preguntaSeguridad,
    respuestaSeguridad,
    nuevaPasswordHash
}) {
    const usuarioAuth = await login(correo, passwordActual);
    if (!usuarioAuth || !usuarioAuth.idUsuario) {
        return { ok: false, code: "PASSWORD_INVALID" };
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        await configurarPreguntaSeguridadPorIdUsuario(
            usuarioAuth.idUsuario,
            preguntaSeguridad,
            respuestaSeguridad,
            { conn }
        );

        if (nuevaPasswordHash) {
            await cambiarPasswordPorIdUsuario(usuarioAuth.idUsuario, nuevaPasswordHash, conn);
        }

        await conn.commit();
        return { ok: true, idUsuario: usuarioAuth.idUsuario };
    } catch (err) {
        try {
            await conn.rollback();
        } catch {
            // noop
        }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    login,
    crearUsuario,
    listarRolesRegistro,
    listarDoctoresRegistro,
    obtenerRolPorId,
    obtenerUsuarioRecuperacionPorCorreo,
    cambiarPasswordPorIdUsuario,
    configurarPreguntaSeguridadPorIdUsuario,
    validarRespuestaSeguridad,
    configurarPreguntaConPasswordActual,
    normalizeSecurityQuestion,
    normalizeSecurityAnswer,
    isMissingSecurityColumnsError
};
