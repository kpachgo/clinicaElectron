const pool = require("../config/db");
const { badRequest, serverError } = require("../utils/http");
const { firstRow } = require("../utils/dbResult");

const ENABLED_TRUE_VALUES = new Set(["1", "true", "yes", "on", "si"]);
const ENABLED_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function parseEnabledValue(rawValue) {
  if (rawValue === true || rawValue === 1) return 1;
  if (rawValue === false || rawValue === 0) return 0;

  const txt = String(rawValue ?? "").trim().toLowerCase();
  if (!txt) return null;
  if (ENABLED_TRUE_VALUES.has(txt)) return 1;
  if (ENABLED_FALSE_VALUES.has(txt)) return 0;
  return null;
}

function isMissingProtocolMigrationError(err) {
  const code = String(err?.code || "").toUpperCase();
  if (!code) return false;
  return (
    code.includes("ER_SP_DOES_NOT_EXIST") ||
    code.includes("ER_NO_SUCH_TABLE") ||
    code.includes("ER_BAD_FIELD_ERROR")
  );
}

function normalizeProtocolRow(row) {
  return {
    enabled: Number(row?.enabled) === 1 ? 1 : 0,
    updatedByUsuarioId: row?.updatedByUsuarioId ?? null,
    updatedAt: row?.updatedAt ?? null
  };
}

async function obtenerEstado(req, res) {
  try {
    const [rows] = await pool.query("CALL sp_seguridad_protocolo_get()");
    const row = firstRow(rows) || {};
    return res.json({
      ok: true,
      data: normalizeProtocolRow(row)
    });
  } catch (err) {
    if (isMissingProtocolMigrationError(err)) {
      return res.status(503).json({
        ok: false,
        code: "security_protocol_migration_missing",
        message: "Falta migracion del protocolo de seguridad en BD"
      });
    }
    return serverError(res, err, "Error al obtener protocolo de seguridad");
  }
}

async function actualizarEstado(req, res) {
  try {
    const enabled = parseEnabledValue(req.body?.enabled);
    if (enabled === null) {
      return badRequest(res, "enabled debe ser 0 o 1");
    }

    const idUsuarioRaw = Number(req.user?.idUsuario || 0);
    const idUsuario = Number.isInteger(idUsuarioRaw) && idUsuarioRaw > 0
      ? idUsuarioRaw
      : null;

    const [rows] = await pool.query(
      "CALL sp_seguridad_protocolo_set(?, ?)",
      [enabled, idUsuario]
    );
    const row = firstRow(rows) || {};
    const data = normalizeProtocolRow({
      ...row,
      enabled
    });

    return res.json({
      ok: true,
      message: enabled === 1
        ? "Modo protocolo de seguridad activado"
        : "Modo protocolo de seguridad desactivado",
      data
    });
  } catch (err) {
    if (isMissingProtocolMigrationError(err)) {
      return res.status(503).json({
        ok: false,
        code: "security_protocol_migration_missing",
        message: "Falta migracion del protocolo de seguridad en BD"
      });
    }
    return serverError(res, err, "Error al actualizar protocolo de seguridad");
  }
}

module.exports = {
  obtenerEstado,
  actualizarEstado
};
