const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const storagePaths = require("../config/storagePaths");

const LEGACY_CONFIG_FILE_NAME = "db-connection.json";
const AUTH_FILE_NAME = "db-maintenance-auth.json";
const CONFIG_VERSION = 1;
const PROTECTED_CONFIG_VERSION = 2;
const PROTECTED_CONFIG_FILE_NAME = "util.dat";
const PROTECTED_CONFIG_MAGIC = Buffer.from("CLDBCFG2", "ascii");
const PROTECTED_CONFIG_KEY_ENV = "CLINICA_DB_CONFIG_KEY";
const PROTECTED_CONFIG_REQUIRED_ENV = "CLINICA_DB_CONFIG_PROTECTED_REQUIRED";
const PROTECTED_CONFIG_KEY_MISSING_MESSAGE =
  "Clave local de configuracion no disponible. Cierre procesos node/backend abiertos y vuelva a abrir ClinicaElectron.";
const ENV_KEYS = {
  url: ["DB_URL", "MYSQL_PUBLIC_URL", "MYSQL_URL"],
  host: ["DB_HOST", "MYSQLHOST"],
  port: ["DB_PORT", "MYSQLPORT"],
  user: ["DB_USER", "MYSQLUSER"],
  password: ["DB_PASS", "MYSQLPASSWORD"],
  database: ["DB_NAME", "MYSQLDATABASE", "MYSQL_DATABASE"],
  ssl: ["DB_SSL", "MYSQL_SSL"],
  poolLimit: ["DB_POOL_LIMIT"],
  connectTimeout: ["DB_CONNECT_TIMEOUT", "MYSQL_CONNECT_TIMEOUT"],
  queueLimit: ["DB_QUEUE_LIMIT"]
};

function pickEnv(keys, fallback = undefined) {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw === undefined || raw === null) continue;

    const value = String(raw).trim();
    if (value !== "") return value;
  }

  return fallback;
}

function pickNumber(keys, fallback) {
  const raw = pickEnv(keys);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseConnectionUrl(rawUrl) {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    const protocol = String(parsed.protocol || "").replace(":", "");
    if (protocol !== "mysql") return null;

    return {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: String(parsed.pathname || "").replace(/^\/+/, "")
    };
  } catch {
    return null;
  }
}

function normalizeConnection(input = {}, fallbackPassword = undefined) {
  const host = String(input.host || "").trim();
  const port = Number(input.port || 3306);
  const user = String(input.user || "").trim();
  const database = String(input.database || "").trim();
  const ssl = toBool(input.ssl, false);
  const passwordInput = input.password;
  const password = passwordInput === undefined || passwordInput === null
    ? fallbackPassword
    : String(passwordInput);

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? Math.round(port) : 3306,
    user,
    password: password || "",
    database,
    ssl
  };
}

function pickConnectionString(input, fallbackConnection, key) {
  if (!Object.prototype.hasOwnProperty.call(input, key)) {
    return String(fallbackConnection?.[key] || "").trim();
  }

  const value = String(input[key] || "").trim();
  return value || String(fallbackConnection?.[key] || "").trim();
}

function mergeConnectionInput(input = {}, fallbackConnection = {}) {
  const fallback = normalizeConnection(fallbackConnection);
  const rawPort = Object.prototype.hasOwnProperty.call(input, "port")
    ? String(input.port || "").trim()
    : "";
  const parsedPort = rawPort ? Number(rawPort) : fallback.port;
  const hasSslInput = Object.prototype.hasOwnProperty.call(input, "ssl");

  return normalizeConnection({
    host: pickConnectionString(input, fallback, "host"),
    port: Number.isFinite(parsedPort) ? parsedPort : fallback.port,
    user: pickConnectionString(input, fallback, "user"),
    password: Object.prototype.hasOwnProperty.call(input, "password")
      ? String(input.password || "")
      : fallback.password,
    database: pickConnectionString(input, fallback, "database"),
    ssl: hasSslInput ? input.ssl : fallback.ssl
  });
}

function validateConnection(connection) {
  const missing = [];
  if (!connection.host) missing.push("host");
  if (!connection.user) missing.push("usuario");
  if (!connection.database) missing.push("base de datos");
  if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) {
    missing.push("puerto valido");
  }

  if (missing.length) {
    const err = new Error(`Faltan datos de conexion: ${missing.join(", ")}`);
    err.code = "DB_CONFIG_INVALID";
    throw err;
  }
}

function buildCodedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function getLegacyConfigFilePath() {
  return path.join(storagePaths.configDir, LEGACY_CONFIG_FILE_NAME);
}

function getProtectedConfigFilePath() {
  return path.join(storagePaths.protectedConfigDir, PROTECTED_CONFIG_FILE_NAME);
}

function getAuthFilePath() {
  return path.join(storagePaths.configDir, AUTH_FILE_NAME);
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFileAtomic(filePath, data) {
  storagePaths.ensureDataDirsSync();
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeBinaryFileAtomic(filePath, data) {
  storagePaths.ensureDataDirsSync();
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Ignore permission adjustments on platforms that do not support chmod semantics.
  }
}

function isProtectedConfigRequired() {
  const raw = String(process.env[PROTECTED_CONFIG_REQUIRED_ENV] || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function getProtectedConfigKey({ required = false } = {}) {
  const raw = String(process.env[PROTECTED_CONFIG_KEY_ENV] || "").trim();
  if (!raw) {
    if (required || isProtectedConfigRequired()) {
      throw buildCodedError(
        "DB_CONFIG_KEY_MISSING",
        PROTECTED_CONFIG_KEY_MISSING_MESSAGE
      );
    }
    return null;
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw buildCodedError(
      "DB_CONFIG_KEY_INVALID",
      "Clave local de configuracion invalida"
    );
  }
  return key;
}

function isProtectedConfigError(err) {
  return [
    "DB_CONFIG_KEY_MISSING",
    "DB_CONFIG_KEY_INVALID",
    "DB_CONFIG_PROTECTED_INVALID"
  ].includes(String(err?.code || ""));
}

function encryptProtectedPayload(payload) {
  const key = getProtectedConfigKey({ required: true });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([PROTECTED_CONFIG_MAGIC, iv, tag, encrypted]);
}

function decryptProtectedPayload(data) {
  try {
    if (!Buffer.isBuffer(data) || data.length <= PROTECTED_CONFIG_MAGIC.length + 12 + 16) {
      throw new Error("payload too small");
    }
    if (!data.subarray(0, PROTECTED_CONFIG_MAGIC.length).equals(PROTECTED_CONFIG_MAGIC)) {
      throw new Error("magic mismatch");
    }

    const key = getProtectedConfigKey({ required: true });
    const offset = PROTECTED_CONFIG_MAGIC.length;
    const iv = data.subarray(offset, offset + 12);
    const tag = data.subarray(offset + 12, offset + 28);
    const encrypted = data.subarray(offset + 28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (err) {
    if (isProtectedConfigError(err)) throw err;
    throw buildCodedError(
      "DB_CONFIG_PROTECTED_INVALID",
      "La configuracion local esta danada o fue modificada"
    );
  }
}

function getEnvConnection() {
  const urlConfig = parseConnectionUrl(pickEnv(ENV_KEYS.url));
  const connection = normalizeConnection({
    host: urlConfig?.host || pickEnv(ENV_KEYS.host),
    port: urlConfig?.port || pickNumber(ENV_KEYS.port, 3306),
    user: urlConfig?.user || pickEnv(ENV_KEYS.user),
    password: urlConfig?.password || pickEnv(ENV_KEYS.password),
    database: urlConfig?.database || pickEnv(ENV_KEYS.database),
    ssl: toBool(pickEnv(ENV_KEYS.ssl), false)
  });
  return {
    source: urlConfig ? "env_url" : "env",
    connection,
    poolLimit: pickNumber(ENV_KEYS.poolLimit, 10),
    connectTimeout: pickNumber(ENV_KEYS.connectTimeout, 15000),
    queueLimit: pickNumber(ENV_KEYS.queueLimit, 0)
  };
}

function normalizeSavedConnectionRecord(raw, source, extra = {}) {
  if (!raw || raw.version !== CONFIG_VERSION || !raw.connection) return null;

  const connection = normalizeConnection(raw.connection);
  return {
    source,
    connection,
    savedAt: raw.savedAt || null,
    savedBy: raw.savedBy || null,
    protectedConfig: source === "protected",
    poolLimit: pickNumber(ENV_KEYS.poolLimit, 10),
    connectTimeout: pickNumber(ENV_KEYS.connectTimeout, 15000),
    queueLimit: pickNumber(ENV_KEYS.queueLimit, 0),
    ...extra
  };
}

function readProtectedConnection() {
  const filePath = getProtectedConfigFilePath();
  if (!fs.existsSync(filePath)) return null;

  const raw = decryptProtectedPayload(fs.readFileSync(filePath));
  if (!raw || raw.version !== PROTECTED_CONFIG_VERSION || !raw.connection) {
    throw buildCodedError(
      "DB_CONFIG_PROTECTED_INVALID",
      "La configuracion local esta danada o fue modificada"
    );
  }

  return normalizeSavedConnectionRecord(
    {
      version: CONFIG_VERSION,
      savedAt: raw.savedAt || null,
      savedBy: raw.savedBy || null,
      connection: raw.connection
    },
    "protected",
    { migratedFromLegacy: raw.migratedFromLegacy === true }
  );
}

function writeProtectedConnection(record) {
  const payload = {
    version: PROTECTED_CONFIG_VERSION,
    savedAt: record.savedAt || new Date().toISOString(),
    savedBy: record.savedBy || "pre-login",
    connection: record.connection,
    migratedFromLegacy: record.migratedFromLegacy === true
  };
  writeBinaryFileAtomic(getProtectedConfigFilePath(), encryptProtectedPayload(payload));
}

function readLegacyConnection() {
  const raw = readJsonFile(getLegacyConfigFilePath());
  return normalizeSavedConnectionRecord(raw, "legacy_plaintext");
}

function migrateLegacyConnectionIfPossible() {
  const legacy = readLegacyConnection();
  if (!legacy) return null;

  const key = getProtectedConfigKey({ required: false });
  if (!key) {
    if (isProtectedConfigRequired()) {
      throw buildCodedError(
        "DB_CONFIG_KEY_MISSING",
        PROTECTED_CONFIG_KEY_MISSING_MESSAGE
      );
    }
    return legacy;
  }

  writeProtectedConnection({
    savedAt: legacy.savedAt || new Date().toISOString(),
    savedBy: legacy.savedBy || "migracion",
    connection: legacy.connection,
    migratedFromLegacy: true
  });

  try {
    fs.unlinkSync(getLegacyConfigFilePath());
  } catch {
    // If cleanup fails, protected config still takes precedence.
  }

  return readProtectedConnection();
}

function getExternalConnection() {
  const protectedConnection = readProtectedConnection();
  if (protectedConnection) return protectedConnection;
  return migrateLegacyConnectionIfPossible();
}

function getActiveConfig() {
  const external = getExternalConnection();
  if (external) return external;
  return getEnvConnection();
}

function shouldUseSsl(connection) {
  const railwayHost = /(?:^|[.])rlwy[.]net$/i.test(String(connection.host || ""));
  return Boolean(connection.ssl || railwayHost);
}

function buildMysqlOptions(configLike, options = {}) {
  let resolvedConfig = configLike;
  if (resolvedConfig === undefined || resolvedConfig === null) {
    try {
      resolvedConfig = getActiveConfig();
    } catch (err) {
      if (!options.allowInvalid || !isProtectedConfigError(err)) throw err;
      resolvedConfig = { connection: {} };
    }
  }
  const connection = resolvedConfig.connection || resolvedConfig;
  if (!options.allowInvalid) {
    validateConnection(connection);
  }
  return {
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: shouldUseSsl(connection) ? { rejectUnauthorized: false } : undefined,
    connectTimeout: resolvedConfig.connectTimeout || 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    waitForConnections: true,
    connectionLimit: resolvedConfig.poolLimit || 10,
    queueLimit: resolvedConfig.queueLimit || 0
  };
}

function getPublicStatus() {
  let active;
  let statusError = null;
  try {
    active = getActiveConfig();
  } catch (err) {
    if (!isProtectedConfigError(err)) throw err;
    statusError = err;
    active = {
      source: "protected_error",
      connection: {},
      protectedConfig: true
    };
  }
  const connection = active.connection;
  const hasProtectedFile = fs.existsSync(getProtectedConfigFilePath());
  const hasLegacyFile = fs.existsSync(getLegacyConfigFilePath());
  return {
    source: active.source,
    displaySource: active.source === "protected"
      ? "local protegido"
      : active.source === "protected_error"
        ? "local protegido danado"
        : active.source === "legacy_plaintext"
          ? "local legado"
          : active.source,
    hasExternalConfig: active.source === "protected" || active.source === "legacy_plaintext" || hasProtectedFile,
    protectedConfig: active.protectedConfig === true || hasProtectedFile,
    configStatus: statusError ? "invalid" : "ok",
    configMessage: statusError?.message || "",
    hasLegacyPlaintextConfig: hasLegacyFile,
    savedAt: active.savedAt || null,
    savedBy: active.savedBy || null,
    connection: {
      hasHost: String(connection.host || "") !== "",
      hasPort: Number.isInteger(connection.port) && connection.port > 0,
      hasUser: String(connection.user || "") !== "",
      hasDatabase: String(connection.database || "") !== "",
      hasSsl: typeof connection.ssl === "boolean",
      hasPassword: String(connection.password || "") !== ""
    },
    hasMaintenancePin: hasMaintenancePin()
  };
}

async function testConnection(connectionInput) {
  let fallbackConnection = {};
  try {
    fallbackConnection = getActiveConfig().connection;
  } catch (err) {
    if (!isProtectedConfigError(err)) throw err;
  }
  const connection = mergeConnectionInput(connectionInput, fallbackConnection);
  validateConnection(connection);
  const pool = mysql.createPool({
    ...buildMysqlOptions({ connection }),
    connectionLimit: 1,
    queueLimit: 0
  });

  try {
    await pool.query("SELECT 1");
    return {
      ok: true,
      message: "Conexion probada correctamente"
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

function saveExternalConnection(connectionInput, metadata = {}) {
  let fallbackConnection = {};
  try {
    const currentExternal = getExternalConnection();
    fallbackConnection = currentExternal?.connection || getActiveConfig().connection;
  } catch (err) {
    if (!isProtectedConfigError(err)) throw err;
  }
  const connection = mergeConnectionInput(connectionInput, fallbackConnection);
  validateConnection(connection);

  const saved = {
    savedAt: new Date().toISOString(),
    savedBy: metadata.savedBy || "pre-login",
    connection
  };
  writeProtectedConnection(saved);
  try {
    fs.unlinkSync(getLegacyConfigFilePath());
  } catch {
    // No legacy file to clean up, or cleanup not permitted.
  }
  return getPublicStatus();
}

function readAuthConfig() {
  const raw = readJsonFile(getAuthFilePath());
  if (!raw || raw.version !== CONFIG_VERSION) return null;
  return raw;
}

function hasMaintenancePin() {
  const authConfig = readAuthConfig();
  return !!authConfig?.pinHash;
}

async function verifyMaintenancePin(pin) {
  const authConfig = readAuthConfig();
  if (!authConfig?.pinHash) return false;
  const value = String(pin || "");
  if (!value) return false;
  return bcrypt.compare(value, authConfig.pinHash);
}

async function setMaintenancePin(pin, metadata = {}) {
  const value = String(pin || "");
  if (value.length < 6 || value.length > 72) {
    const err = new Error("El PIN debe tener entre 6 y 72 caracteres");
    err.code = "PIN_INVALID";
    throw err;
  }

  const saved = {
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    savedBy: metadata.savedBy || "admin",
    pinHash: await bcrypt.hash(value, 10)
  };
  writeJsonFileAtomic(getAuthFilePath(), saved);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  buildMysqlOptions,
  createSessionToken,
  decryptProtectedPayload,
  encryptProtectedPayload,
  writeBinaryFileAtomic,
  writeJsonFileAtomic,
  readJsonFile,
  getActiveConfig,
  getPublicStatus,
  hasMaintenancePin,
  saveExternalConnection,
  setMaintenancePin,
  testConnection,
  verifyMaintenancePin
};
