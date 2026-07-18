const authService = require("../services/auth.service");
const dbConnectionConfig = require("../services/dbConnectionConfig.service");

const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map();

function isTransientDbError(err) {
  const code = String(err?.code || "").toUpperCase();
  return (
    code.includes("ETIMEDOUT") ||
    code.includes("ECONNRESET") ||
    code.includes("ECONNREFUSED") ||
    code.includes("PROTOCOL_CONNECTION_LOST") ||
    code.includes("ENOTFOUND") ||
    code.includes("EHOSTUNREACH") ||
    code === "ER_ACCESS_DENIED_ERROR" ||
    code === "ER_BAD_DB_ERROR" ||
    code === "ER_NO_SUCH_TABLE" ||
    code === "ER_SP_DOES_NOT_EXIST"
  );
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) sessions.delete(token);
  }
}

function createSession(meta = {}) {
  cleanupSessions();
  const token = dbConnectionConfig.createSessionToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, {
    expiresAt,
    authorizedBy: meta.authorizedBy || "pre-login",
    mode: meta.mode || "unknown"
  });
  return {
    token,
    expiresAt
  };
}

function getToken(req) {
  return String(req.headers["x-db-config-token"] || req.body?.token || "").trim();
}

function requireConfigSession(req, res, next) {
  cleanupSessions();
  const token = getToken(req);
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    return res.status(401).json({
      ok: false,
      message: "Autorizacion de configuracion expirada"
    });
  }

  req.dbConfigSession = session;
  next();
}

function publicStatus(req, res) {
  return res.json({
    ok: true,
    data: dbConnectionConfig.getPublicStatus()
  });
}

async function authorize(req, res) {
  const mode = String(req.body?.mode || "").trim().toLowerCase();
  const hasPin = dbConnectionConfig.hasMaintenancePin();

  try {
    if (mode === "pin") {
      if (!hasPin) {
        return res.status(409).json({
          ok: false,
          code: "pin_not_configured",
          message: "No hay PIN local configurado"
        });
      }

      const pinOk = await dbConnectionConfig.verifyMaintenancePin(req.body?.pin);
      if (!pinOk) {
        return res.status(401).json({
          ok: false,
          message: "PIN de mantenimiento incorrecto"
        });
      }

      return res.json({
        ok: true,
        data: createSession({ authorizedBy: "pin", mode: "pin" }),
        status: dbConnectionConfig.getPublicStatus()
      });
    }

    if (mode !== "admin") {
      return res.status(400).json({
        ok: false,
        message: "Modo de autorizacion invalido"
      });
    }

    const correo = String(req.body?.correo || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const newPin = String(req.body?.newPin || "");

    if (!correo || !password) {
      return res.status(400).json({
        ok: false,
        message: "Correo y contrasena requeridos"
      });
    }

    if (!hasPin && !newPin) {
      return res.status(400).json({
        ok: false,
        code: "pin_required",
        message: "Configure un PIN local para habilitar rescate sin conexion"
      });
    }

    const usuario = await authService.login(correo, password);
    if (!usuario || usuario.rol !== "Administrador") {
      return res.status(403).json({
        ok: false,
        message: "Solo un usuario Administrador puede autorizar esta configuracion"
      });
    }

    if (newPin) {
      await dbConnectionConfig.setMaintenancePin(newPin, {
        savedBy: usuario.correo || usuario.nombre || "Administrador"
      });
    }

    return res.json({
      ok: true,
      data: createSession({
        authorizedBy: usuario.correo || usuario.nombre || "Administrador",
        mode: "admin"
      }),
      status: dbConnectionConfig.getPublicStatus()
    });
  } catch (err) {
    if (err?.code === "PIN_INVALID") {
      return res.status(400).json({
        ok: false,
        message: err.message
      });
    }

    if (isTransientDbError(err)) {
      return res.status(503).json({
        ok: false,
        code: "db_no_disponible",
        message: hasPin
          ? "Base de datos no disponible. Use el PIN local de mantenimiento."
          : "Base de datos no disponible y no hay PIN local configurado."
      });
    }

    console.error("[dbConnectionConfig.controller] authorize:", err);
    return res.status(500).json({
      ok: false,
      message: "No se pudo autorizar configuracion"
    });
  }
}

async function test(req, res) {
  try {
    const result = await dbConnectionConfig.testConnection(req.body?.connection || {}, {
      keepCurrentPassword: req.body?.keepCurrentPassword === true
    });

    return res.json({
      ok: true,
      message: result.message
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      message: err?.message || "No se pudo probar la conexion"
    });
  }
}

async function save(req, res) {
  try {
    await dbConnectionConfig.testConnection(req.body?.connection || {}, {
      keepCurrentPassword: req.body?.keepCurrentPassword === true
    });

    const status = dbConnectionConfig.saveExternalConnection(req.body?.connection || {}, {
      savedBy: req.dbConfigSession?.authorizedBy || "pre-login"
    });

    return res.json({
      ok: true,
      message: "Conexion guardada correctamente",
      data: status
    });
  } catch (err) {
    return res.status(400).json({
      ok: false,
      message: err?.message || "No se pudo guardar la conexion"
    });
  }
}

function restart(req, res) {
  res.json({
    ok: true,
    message: "Reinicio de backend solicitado"
  });

  setTimeout(() => {
    process.exit(0);
  }, 350);
}

module.exports = {
  authorize,
  publicStatus,
  requireConfigSession,
  restart,
  save,
  test
};
