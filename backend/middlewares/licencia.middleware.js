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

async function requireStartupAuthorized(req, res, next) {
  const status = licenciaService.getRuntimeStatus();
  if (!status?.startup?.ok) {
    return deny(res, status.startup);
  }
  return next();
}

async function requireSystemUsageAuthorized(req, res, next) {
  const usage = await licenciaService.validateSystemUsageConfigured();
  if (!usage?.ok) {
    return deny(res, usage);
  }
  return next();
}

async function requireLicensedAccess(req, res, next) {
  const status = licenciaService.getRuntimeStatus();
  if (!status?.startup?.ok) {
    return deny(res, status.startup);
  }

  const usage = await licenciaService.validateSystemUsageConfigured();
  if (!usage?.ok) {
    return deny(res, usage);
  }

  return next();
}

module.exports = {
  requireStartupAuthorized,
  requireSystemUsageAuthorized,
  requireLicensedAccess
};

