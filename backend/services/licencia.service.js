const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const db = require("../config/db");
const storagePaths = require("../config/storagePaths");
const { firstRow } = require("../utils/dbResult");

const LEGACY_LICENSE_FILE_PATH = path.join(storagePaths.dataRootDir, "licencia.json");
const ZERO_MAC = "00:00:00:00:00:00";
const DEFAULT_OFFLINE_DAYS = 7;
const DEFAULT_USAGE_CACHE_MS = 15_000;
const WARNING_WINDOW_DAYS = 3;
let legacyLicenseFileCleaned = false;

const runtimeState = {
  initializedAt: null,
  codigoLicencia: "",
  codeSource: "none",
  startup: {
    ok: false,
    code: "licencia_no_validada",
    message: "Licencia no validada"
  },
  usage: {
    ok: false,
    code: "suscripcion_no_validada",
    message: "Suscripcion no validada",
    ...buildUsageWarningDefaults()
  }
};

const usageCache = {
  at: 0,
  result: null,
  inFlight: null
};

function buildUsageWarningDefaults() {
  return {
    fechaVencimiento: null,
    diasRestantes: null,
    proximaAVencer: false,
    warningWindowDays: WARNING_WINDOW_DAYS,
    mensajeAviso: null
  };
}

function parseBooleanLike(value) {
  return value === true || value === 1 || value === "1";
}

function parseNumberLike(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeUsageWarningFromInlineFields(usage) {
  if (!usage || typeof usage !== "object") return null;

  const fechaVencimiento =
    usage.fechaVencimiento ??
    usage.fecha_vencimiento ??
    null;
  const diasRestantesRaw =
    usage.diasRestantes ??
    usage.dias_restantes ??
    null;
  const estadoSuscripcionRaw =
    usage.estadoSuscripcion ??
    usage.estado_suscripcion ??
    "";
  const suscripcionHabilitadaRaw =
    usage.suscripcionHabilitada ??
    usage.suscripcion_habilitada ??
    null;
  const warningWindowRaw =
    usage.warningWindowDays ??
    usage.warning_window_days ??
    null;
  const proximaRaw =
    usage.proximaAVencer ??
    usage.proxima_a_vencer;
  const mensajeAvisoRaw =
    usage.mensajeAviso ??
    usage.mensaje_aviso ??
    null;

  const hasInlineFields = [
    fechaVencimiento,
    diasRestantesRaw,
    estadoSuscripcionRaw,
    suscripcionHabilitadaRaw,
    warningWindowRaw,
    proximaRaw,
    mensajeAvisoRaw
  ].some((v) => v !== null && v !== undefined && v !== "");

  if (!hasInlineFields) return null;

  const warningWindowDays = Number.isFinite(Number(warningWindowRaw))
    ? Number(warningWindowRaw)
    : WARNING_WINDOW_DAYS;
  const diasRestantes = parseNumberLike(diasRestantesRaw);
  const estadoSuscripcion = String(estadoSuscripcionRaw || "").trim().toLowerCase();
  const suscripcionHabilitada = parseBooleanLike(suscripcionHabilitadaRaw);

  const proximaCalculated = Boolean(
    estadoSuscripcion === "activa" &&
    suscripcionHabilitada &&
    fechaVencimiento &&
    Number.isInteger(diasRestantes) &&
    diasRestantes >= 0 &&
    diasRestantes <= warningWindowDays
  );

  const proximaAVencer = parseBooleanLike(proximaRaw) || proximaCalculated;
  const mensajeAviso = proximaAVencer
    ? String(mensajeAvisoRaw || buildUsageWarningMessage(diasRestantes, String(fechaVencimiento || "")) || "")
    : null;

  return {
    fechaVencimiento: fechaVencimiento ? String(fechaVencimiento) : null,
    diasRestantes: Number.isInteger(diasRestantes) ? diasRestantes : null,
    proximaAVencer,
    warningWindowDays,
    mensajeAviso: mensajeAviso || null
  };
}

function pickOfflineDays() {
  const raw = Number(process.env.LICENCIA_OFFLINE_DIAS);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return DEFAULT_OFFLINE_DAYS;
}

function pickUsageCacheMs() {
  const raw = Number(process.env.LICENCIA_USAGE_CACHE_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_USAGE_CACHE_MS;
}

function cleanupLegacyLicenseFile() {
  if (legacyLicenseFileCleaned) return;
  legacyLicenseFileCleaned = true;

  try {
    if (fs.existsSync(LEGACY_LICENSE_FILE_PATH)) {
      fs.unlinkSync(LEGACY_LICENSE_FILE_PATH);
      console.warn("[licencia] Archivo legacy eliminado:", LEGACY_LICENSE_FILE_PATH);
    }
  } catch (err) {
    console.warn("[licencia] No se pudo eliminar licencia.json legacy:", err?.message || err);
  }
}

async function resolveCodeByDevice(deviceId) {
  const device = String(deviceId || "").trim();
  if (!device) {
    return {
      ok: false,
      code: "device_id_invalido",
      message: "No se pudo calcular device_id",
      id_licencia: null,
      codigo_licencia: null
    };
  }

  try {
    const row = await callSp(
      "CALL sp_licencia_resolver_por_device(?)",
      [device]
    );
    return normalizeResult(row, {
      code: "device_sin_licencia",
      message: "No hay licencia asignada para este equipo"
    });
  } catch (err) {
    if (isSpMissingError(err)) {
      return buildMissingSpResult("sp_licencia_resolver_por_device");
    }
    if (isConnectionLikeError(err)) {
      return asConnectionError(err, "db_no_disponible_resolver_device");
    }
    return {
      ok: false,
      code: "error_resolver_device",
      message: err?.message || "Error inesperado al resolver licencia por device_id"
    };
  }
}

async function resolveConfiguredCode() {
  cleanupLegacyLicenseFile();

  const envCode = String(process.env.LICENCIA_CODIGO || "").trim();
  if (envCode) {
    return {
      codigoLicencia: envCode,
      source: "env",
      resolution: null
    };
  }

  const resolved = await resolveCodeByDevice(getDeviceId());
  if (resolved.ok) {
    return {
      codigoLicencia: String(resolved.codigo_licencia || "").trim(),
      source: "device",
      resolution: resolved
    };
  }

  return {
    codigoLicencia: "",
    source: "none",
    resolution: resolved
  };
}

function getPrimaryMac() {
  const interfaces = os.networkInterfaces() || {};
  const candidates = [];

  for (const entries of Object.values(interfaces)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || entry.internal) continue;
      const mac = String(entry.mac || "").trim().toLowerCase();
      if (!mac || mac === ZERO_MAC) continue;
      candidates.push(mac);
    }
  }

  candidates.sort();
  return candidates[0] || "";
}

function getDeviceId() {
  const hostname = String(os.hostname() || "").trim().toLowerCase();
  const mac = getPrimaryMac();
  const fingerprintBase = `${hostname}|${mac || "no-mac"}`;
  return crypto.createHash("sha256").update(fingerprintBase).digest("hex");
}

async function callSp(sql, params) {
  const [rows] = await db.query(sql, params);
  return firstRow(rows) || null;
}

function normalizeResult(row, fallback = {}) {
  if (!row) {
    return {
      ok: false,
      code: fallback.code || "sin_resultado",
      message: fallback.message || "No se recibio resultado"
    };
  }

  const okRaw = row.ok;
  const ok = okRaw === true || okRaw === 1 || okRaw === "1";
  const code = String(row.code || (ok ? "ok" : "error_desconocido"));
  const message = String(row.message || (ok ? "Operacion exitosa" : "Operacion no permitida"));

  return { ...row, ok, code, message };
}

function asConnectionError(err, fallbackCode) {
  const message = err?.message || "No se pudo conectar a la base de datos";
  return {
    ok: false,
    code: fallbackCode || "db_no_disponible",
    message
  };
}

function isConnectionLikeError(err) {
  const code = String(err?.code || "");
  if (!code) return false;
  return (
    code.includes("ECONN") ||
    code.includes("PROTOCOL_CONNECTION_LOST") ||
    code.includes("ER_ACCESS_DENIED_ERROR") ||
    code.includes("ETIMEDOUT")
  );
}

function isSpMissingError(err) {
  return String(err?.code || "") === "ER_SP_DOES_NOT_EXIST";
}

function buildMissingSpResult(spName) {
  return {
    ok: false,
    code: "sp_no_disponible",
    message: `Stored procedure no disponible: ${spName}`
  };
}

async function getUsageWarningMetadata(codigoLicencia, idLicencia = null) {
  const codigo = String(codigoLicencia || "").trim();
  const id = Number(idLicencia);
  const hasId = Number.isInteger(id) && id > 0;
  if (!codigo && !hasId) return null;

  const sqlById = `
    SELECT
      DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d %H:%i:%s') AS fechaVencimiento,
      DATEDIFF(l.fecha_vencimiento, NOW()) AS diasRestantes,
      l.estado_suscripcion AS estadoSuscripcion,
      l.suscripcion_habilitada AS suscripcionHabilitada
    FROM licencias l
    WHERE l.id_licencia = ?
    LIMIT 1
  `;
  const sqlByCode = `
    SELECT
      DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d %H:%i:%s') AS fechaVencimiento,
      DATEDIFF(l.fecha_vencimiento, NOW()) AS diasRestantes,
      l.estado_suscripcion AS estadoSuscripcion,
      l.suscripcion_habilitada AS suscripcionHabilitada
    FROM licencias l
    WHERE SHA2(LOWER(TRIM(l.codigo_licencia)), 256) = SHA2(LOWER(TRIM(?)), 256)
    LIMIT 1
  `;

  if (hasId) {
    const [rowsById] = await db.query(sqlById, [id]);
    if (Array.isArray(rowsById) && rowsById.length > 0) {
      return rowsById[0] || null;
    }
  }

  if (!codigo) return null;
  const [rowsByCode] = await db.query(sqlByCode, [codigo]);
  if (!Array.isArray(rowsByCode) || rowsByCode.length === 0) return null;
  return rowsByCode[0] || null;
}

function buildUsageWarningMessage(diasRestantes, fechaVencimiento) {
  if (!Number.isInteger(diasRestantes)) return null;
  if (diasRestantes < 0 || diasRestantes > WARNING_WINDOW_DAYS) return null;

  if (diasRestantes === 0) {
    return fechaVencimiento
      ? `Su suscripcion vence hoy (${fechaVencimiento}).`
      : "Su suscripcion vence hoy.";
  }

  if (diasRestantes === 1) {
    return fechaVencimiento
      ? `Su suscripcion vence en 1 dia (${fechaVencimiento}).`
      : "Su suscripcion vence en 1 dia.";
  }

  return fechaVencimiento
    ? `Su suscripcion vence en ${diasRestantes} dias (${fechaVencimiento}).`
    : `Su suscripcion vence en ${diasRestantes} dias.`;
}

async function enrichUsageWithWarningFields(usage, codigoLicencia, idLicencia = null) {
  const baseUsage = usage && typeof usage === "object" ? { ...usage } : {};
  const defaults = buildUsageWarningDefaults();
  const inlineWarning = normalizeUsageWarningFromInlineFields(baseUsage);
  if (inlineWarning) {
    return {
      ...baseUsage,
      ...inlineWarning
    };
  }

  try {
    const meta = await getUsageWarningMetadata(codigoLicencia, idLicencia);
    if (!meta) {
      return { ...baseUsage, ...defaults };
    }

    const diasRaw = meta.diasRestantes;
    const hasDiasValue = diasRaw !== null && diasRaw !== undefined && diasRaw !== "";
    const dias = hasDiasValue && Number.isFinite(Number(diasRaw)) ? Number(diasRaw) : null;
    const estadoSuscripcion = String(meta.estadoSuscripcion || "").trim().toLowerCase();
    const suscripcionHabilitada = Number(meta.suscripcionHabilitada) === 1;
    const fechaVencimiento = meta.fechaVencimiento ? String(meta.fechaVencimiento) : null;

    const proximaAVencer = Boolean(
      estadoSuscripcion === "activa" &&
      suscripcionHabilitada &&
      fechaVencimiento &&
      Number.isInteger(dias) &&
      dias >= 0 &&
      dias <= WARNING_WINDOW_DAYS
    );

    return {
      ...baseUsage,
      fechaVencimiento,
      diasRestantes: Number.isInteger(dias) ? dias : null,
      proximaAVencer,
      warningWindowDays: WARNING_WINDOW_DAYS,
      mensajeAviso: proximaAVencer
        ? buildUsageWarningMessage(dias, fechaVencimiento)
        : null
    };
  } catch (err) {
    console.error("[licencia] Error calculando aviso de vencimiento:", err?.message || err);
    return { ...baseUsage, ...defaults };
  }
}

async function activarInicial(codigoLicencia) {
  const codigo = String(codigoLicencia || "").trim();
  if (!codigo) {
    return {
      ok: false,
      code: "datos_incompletos",
      message: "Codigo de licencia requerido"
    };
  }

  const deviceId = getDeviceId();
  const offlineDays = pickOfflineDays();

  try {
    const row = await callSp(
      "CALL sp_licencia_activar_inicial(?, ?, ?)",
      [codigo, deviceId, offlineDays]
    );
    const result = normalizeResult(row, {
      code: "activacion_fallida",
      message: "No se pudo activar la licencia"
    });

    if (result.ok) {
      usageCache.at = 0;
      usageCache.result = null;
      await initializeRuntimeValidation();
    }

    return {
      ...result,
      deviceId
    };
  } catch (err) {
    if (isSpMissingError(err)) {
      return buildMissingSpResult("sp_licencia_activar_inicial");
    }
    if (isConnectionLikeError(err)) {
      return asConnectionError(err, "db_no_disponible_activacion");
    }
    return {
      ok: false,
      code: "error_activacion",
      message: err?.message || "Error inesperado al activar licencia"
    };
  }
}

async function validarArranqueConCodigo(codigoLicencia) {
  const codigo = String(codigoLicencia || "").trim();
  if (!codigo) {
    return {
      ok: false,
      code: "codigo_no_configurado",
      message: "No hay codigo de licencia configurado"
    };
  }

  try {
    const row = await callSp(
      "CALL sp_licencia_validar_arranque(?, ?, ?)",
      [codigo, getDeviceId(), pickOfflineDays()]
    );
    return normalizeResult(row, {
      code: "arranque_no_autorizado",
      message: "Arranque no autorizado por licencia"
    });
  } catch (err) {
    if (isSpMissingError(err)) {
      return buildMissingSpResult("sp_licencia_validar_arranque");
    }
    if (isConnectionLikeError(err)) {
      return asConnectionError(err, "db_no_disponible_arranque");
    }
    return {
      ok: false,
      code: "error_validacion_arranque",
      message: err?.message || "Error inesperado al validar arranque"
    };
  }
}

async function validarUsoSistemaConCodigo(codigoLicencia) {
  const codigo = String(codigoLicencia || "").trim();
  if (!codigo) {
    return {
      ok: false,
      code: "codigo_no_configurado",
      message: "No hay codigo de licencia configurado"
    };
  }

  try {
    const row = await callSp(
      "CALL sp_licencia_validar_uso_sistema(?)",
      [codigo]
    );
    return normalizeResult(row, {
      code: "uso_no_autorizado",
      message: "Uso del sistema no autorizado"
    });
  } catch (err) {
    if (isSpMissingError(err)) {
      return buildMissingSpResult("sp_licencia_validar_uso_sistema");
    }
    if (isConnectionLikeError(err)) {
      return asConnectionError(err, "db_no_disponible_uso");
    }
    return {
      ok: false,
      code: "error_validacion_uso",
      message: err?.message || "Error inesperado al validar uso del sistema"
    };
  }
}

async function validateSystemUsageConfigured(options = {}) {
  const { force = false, configuredCode = null, idLicenciaHint = null } = options;
  const now = Date.now();
  const cacheMs = pickUsageCacheMs();

  if (!force && usageCache.result && now - usageCache.at < cacheMs) {
    return usageCache.result;
  }

  if (usageCache.inFlight) {
    return usageCache.inFlight;
  }

  const validationPromise = (async () => {
    const configured = configuredCode || await resolveConfiguredCode();
    runtimeState.codigoLicencia = configured.codigoLicencia;
    runtimeState.codeSource = configured.source;

    if (!configured.codigoLicencia) {
      const usageDenied = {
        ok: false,
        code: configured?.resolution?.code || "codigo_no_configurado",
        message: configured?.resolution?.message || "No hay codigo de licencia configurado",
        ...buildUsageWarningDefaults()
      };

      usageCache.result = usageDenied;
      usageCache.at = Date.now();
      runtimeState.usage = usageDenied;
      return usageDenied;
    }

    const usageRaw = await validarUsoSistemaConCodigo(configured.codigoLicencia);
    const startupId = Number(runtimeState?.startup?.id_licencia);
    const usageId = Number(usageRaw?.id_licencia);
    const hintId = Number(idLicenciaHint);
    const usage = await enrichUsageWithWarningFields(
      usageRaw,
      configured.codigoLicencia,
      Number.isInteger(usageId) && usageId > 0
        ? usageId
        : Number.isInteger(hintId) && hintId > 0
          ? hintId
          : Number.isInteger(startupId) && startupId > 0
            ? startupId
            : null
    );

    usageCache.result = usage;
    usageCache.at = Date.now();
    runtimeState.usage = usage;
    return usage;
  })();

  usageCache.inFlight = validationPromise;
  try {
    return await validationPromise;
  } finally {
    if (usageCache.inFlight === validationPromise) {
      usageCache.inFlight = null;
    }
  }
}

async function initializeRuntimeValidation() {
  const configured = await resolveConfiguredCode();
  runtimeState.initializedAt = new Date().toISOString();
  runtimeState.codigoLicencia = configured.codigoLicencia;
  runtimeState.codeSource = configured.source;

  if (!configured.codigoLicencia) {
    const fallback = normalizeResult(configured.resolution, {
      code: "codigo_no_configurado",
      message: "No hay codigo de licencia configurado"
    });

    runtimeState.startup = {
      ok: false,
      code: fallback.code,
      message: fallback.message
    };
    runtimeState.usage = {
      ok: false,
      code: "arranque_no_autorizado",
      message: "No se valida suscripcion porque el arranque no fue autorizado",
      ...buildUsageWarningDefaults()
    };
    usageCache.result = runtimeState.usage;
    usageCache.at = Date.now();
    return {
      startup: runtimeState.startup,
      usage: runtimeState.usage
    };
  }

  const startup = await validarArranqueConCodigo(configured.codigoLicencia);
  runtimeState.startup = startup;

  if (!startup.ok) {
    runtimeState.usage = {
      ok: false,
      code: "arranque_no_autorizado",
      message: "No se valida suscripcion porque el arranque no fue autorizado",
      ...buildUsageWarningDefaults()
    };
    usageCache.result = runtimeState.usage;
    usageCache.at = Date.now();
    return {
      startup: runtimeState.startup,
      usage: runtimeState.usage
    };
  }

  const startupId = Number(startup?.id_licencia);
  const usage = await validateSystemUsageConfigured({
    force: true,
    configuredCode: configured,
    idLicenciaHint: Number.isInteger(startupId) && startupId > 0 ? startupId : null
  });
  runtimeState.usage = usage;

  return {
    startup: runtimeState.startup,
    usage: runtimeState.usage
  };
}

function getRuntimeStatus() {
  return {
    initializedAt: runtimeState.initializedAt,
    codigoLicencia: runtimeState.codigoLicencia,
    codeSource: runtimeState.codeSource,
    deviceId: getDeviceId(),
    startup: runtimeState.startup,
    usage: runtimeState.usage
  };
}

module.exports = {
  getDeviceId,
  getRuntimeStatus,
  initializeRuntimeValidation,
  validateSystemUsageConfigured,
  activarInicial
};
