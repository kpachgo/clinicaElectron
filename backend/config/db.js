const mysql = require("mysql2/promise");
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
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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
const urlConfig = parseConnectionUrl(pickEnv(ENV_KEYS.url));
const host = urlConfig?.host || pickEnv(ENV_KEYS.host);
const port = urlConfig?.port || pickNumber(ENV_KEYS.port, 3306);
const user = urlConfig?.user || pickEnv(ENV_KEYS.user);
const password = urlConfig?.password || pickEnv(ENV_KEYS.password);
const database = urlConfig?.database || pickEnv(ENV_KEYS.database);
const forceSsl = toBool(pickEnv(ENV_KEYS.ssl));
const railwayHost = /(?:^|[.])rlwy[.]net$/i.test(String(host || ""));
const useSsl = forceSsl || railwayHost;
const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  connectTimeout: pickNumber(ENV_KEYS.connectTimeout, 15000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  waitForConnections: true,
  connectionLimit: pickNumber(ENV_KEYS.poolLimit, 10),
  queueLimit: pickNumber(ENV_KEYS.queueLimit, 0)
});
module.exports = pool;
