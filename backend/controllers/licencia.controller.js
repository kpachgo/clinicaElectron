const licenciaService = require("../services/licencia.service");

function statusFromCode(code) {
  const value = String(code || "");
  if (value.startsWith("db_no_disponible")) return 503;
  if (value === "sp_no_disponible") return 503;
  if (value === "datos_incompletos") return 400;
  return 403;
}

function sanitizeStatus(status) {
  return {
    initializedAt: status.initializedAt,
    hasConfiguredCode: !!status.codigoLicencia,
    codigoLicenciaMasked: status.codigoLicencia
      ? `${status.codigoLicencia.slice(0, 4)}...${status.codigoLicencia.slice(-4)}`
      : null,
    codeSource: status.codeSource,
    deviceId: status.deviceId,
    startup: status.startup,
    usage: status.usage
  };
}

async function estado(req, res) {
  try {
    const force = String(req.query?.force || "").trim() === "1";
    if (force) {
      await licenciaService.initializeRuntimeValidation();
    }

    const status = licenciaService.getRuntimeStatus();
    return res.json({
      ok: true,
      data: sanitizeStatus(status)
    });
  } catch (err) {
    console.error("[licencia.controller] Error en /api/licencia/estado:", err);
    return res.status(503).json({
      ok: false,
      code: "db_no_disponible_licencia",
      message: "No se pudo validar el estado de licencia"
    });
  }
}

async function activarInicial(req, res) {
  try {
    const codigoLicencia = String(req.body?.codigoLicencia || "").trim();
    const result = await licenciaService.activarInicial(codigoLicencia);

    if (!result.ok) {
      return res.status(statusFromCode(result.code)).json({
        ok: false,
        code: result.code,
        message: result.message
      });
    }

    const status = licenciaService.getRuntimeStatus();
    return res.status(201).json({
      ok: true,
      code: result.code,
      message: result.message,
      data: {
        deviceId: result.deviceId,
        offlineHasta: result.offline_hasta || null,
        estado: sanitizeStatus(status)
      }
    });
  } catch (err) {
    console.error("[licencia.controller] Error en /api/licencia/activar-inicial:", err);
    return res.status(503).json({
      ok: false,
      code: "db_no_disponible_licencia",
      message: "No se pudo activar la licencia temporalmente"
    });
  }
}

module.exports = {
  estado,
  activarInicial
};

