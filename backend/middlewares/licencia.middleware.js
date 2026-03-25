const licenciaService = require("../services/licencia.service");

function buildStatusCodeFromResult(result) {
  const code = String(result?.code || "");
  if (code.startsWith("db_no_disponible")) return 503;
  if (code === "sp_no_disponible") return 503;
  return 403;
}

function deny(res, result) {
  return res.status(buildStatusCodeFromResult(result)).json({
    ok: false,
    code: result?.code || "licencia_no_valida",
    message: result?.message || "Operacion bloqueada por licencia"
  });
}

function denyUnexpectedError(res, err, fallbackMessage) {
  console.error("[licencia.middleware] Error inesperado validando licencia:", err);
  return deny(res, {
    code: "db_no_disponible_licencia",
    message: fallbackMessage || "No se pudo validar licencia temporalmente"
  });
}

async function requireStartupAuthorized(req, res, next) {
  const status = licenciaService.getRuntimeStatus();
  if (!status?.startup?.ok) {
    return deny(res, status.startup);
  }
  return next();
}

async function requireSystemUsageAuthorized(req, res, next) {
  try {
    const usage = await licenciaService.validateSystemUsageConfigured();
    if (!usage?.ok) {
      return deny(res, usage);
    }
    return next();
  } catch (err) {
    return denyUnexpectedError(res, err, "No se pudo validar la suscripcion temporalmente");
  }
}

async function requireLicensedAccess(req, res, next) {
  try {
    const status = licenciaService.getRuntimeStatus();
    if (!status?.startup?.ok) {
      return deny(res, status.startup);
    }

    const usage = await licenciaService.validateSystemUsageConfigured();
    if (!usage?.ok) {
      return deny(res, usage);
    }

    return next();
  } catch (err) {
    return denyUnexpectedError(res, err, "No se pudo validar licencia temporalmente");
  }
}

module.exports = {
  requireStartupAuthorized,
  requireSystemUsageAuthorized,
  requireLicensedAccess
};

