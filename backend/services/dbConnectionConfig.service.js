const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");

const storagePaths = require("../config/storagePaths");

const CONFIG_FILE_NAME = "db-connection.json";
const AUTH_FILE_NAME = "db-maintenance-auth.json";
const CONFIG_VERSION = 1;
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

function getConfigFilePath() {
  return path.join(storagePaths.configDir, CONFIG_FILE_NAME);
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

function getExternalConnection() {
  const raw = readJsonFile(getConfigFilePath());
  if (!raw || raw.version !== CONFIG_VERSION || !raw.connection) return null;

  const connection = normalizeConnection(raw.connection);
  return {
    source: "external",
    connection,
    savedAt: raw.savedAt || null,
    savedBy: raw.savedBy || null,
    poolLimit: pickNumber(ENV_KEYS.poolLimit, 10),
    connectTimeout: pickNumber(ENV_KEYS.connectTimeout, 15000),
    queueLimit: pickNumber(ENV_KEYS.queueLimit, 0)
  };
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

function buildMysqlOptions(configLike = getActiveConfig(), options = {}) {
  const connection = configLike.connection || configLike;
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
    connectTimeout: configLike.connectTimeout || 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    waitForConnections: true,
    connectionLimit: configLike.poolLimit || 10,
    queueLimit: configLike.queueLimit || 0
  };
}

function getPublicStatus() {
  const active = getActiveConfig();
  const connection = active.connection;
  return {
    source: active.source,
    configPath: getConfigFilePath(),
    hasExternalConfig: active.source === "external",
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
  const connection = mergeConnectionInput(connectionInput, getActiveConfig().connection);
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
  const currentExternal = getExternalConnection();
  const fallbackConnection = currentExternal?.connection || getActiveConfig().connection;
  const connection = mergeConnectionInput(connectionInput, fallbackConnection);
  validateConnection(connection);

  const saved = {
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    savedBy: metadata.savedBy || "pre-login",
    connection
  };
  writeJsonFileAtomic(getConfigFilePath(), saved);
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
  getActiveConfig,
  getPublicStatus,
  hasMaintenancePin,
  saveExternalConnection,
  setMaintenancePin,
  testConnection,
  verifyMaintenancePin
};
