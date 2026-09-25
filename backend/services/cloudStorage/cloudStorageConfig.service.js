// Configuracion del almacenamiento de archivos (fotos, firmas, sellos, docs).
// Modos:
//   local    -> todo en ProgramData (comportamiento historico).
//   respaldo -> se guarda en ProgramData y cada N dias se sincroniza con R2 (ida y vuelta).
//   nube     -> archivos nuevos solo en R2; no se escribe copia local.
// Credenciales cifradas con la misma clave local que la conexion de BD (system/electrondump/storage.dat).
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const storagePaths = require("../../config/storagePaths");
const dbConnectionConfig = require("../dbConnectionConfig.service");
const { createR2Client } = require("./r2Client");

const MODES = ["local", "respaldo", "nube"];
const CONFIG_KIND = "clinica-storage";
const CONFIG_VERSION = 1;
const DEFAULT_FREQUENCY_DAYS = 1;
const MAX_FREQUENCY_DAYS = 30;
// Solo desarrollo: archivo .env con R2_* y CLOUD_STORAGE_MODE para probar sin Electron.
const DEV_ENV_FILE_VAR = "CLINICA_R2_ENV_FILE";

let cachedConfig = null;
let cachedClient = null;

function getConfigFilePath() {
  return path.join(storagePaths.protectedConfigDir, "storage.dat");
}

function normalizeCredentials(input = {}) {
  return {
    accountId: String(input.accountId || "").trim(),
    accessKeyId: String(input.accessKeyId || "").trim(),
    secretAccessKey: String(input.secretAccessKey || "").trim(),
    bucket: String(input.bucket || "").trim()
  };
}

function hasCompleteCredentials(r2) {
  return Boolean(r2?.accountId && r2?.accessKeyId && r2?.secretAccessKey && r2?.bucket);
}

function normalizeFrequency(value) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days) || days < 1) return DEFAULT_FREQUENCY_DAYS;
  return Math.min(days, MAX_FREQUENCY_DAYS);
}

function normalizeConfig(raw = {}) {
  const mode = MODES.includes(raw.mode) ? raw.mode : "local";
  return {
    mode,
    frequencyDays: normalizeFrequency(raw.frequencyDays),
    r2: normalizeCredentials(raw.r2),
    savedAt: raw.savedAt || null
  };
}

function readDevEnvConfig() {
  const file = String(process.env[DEV_ENV_FILE_VAR] || "").trim();
  if (!file || !fs.existsSync(file)) return null;
  const env = dotenv.parse(fs.readFileSync(file));
  return normalizeConfig({
    mode: env.CLOUD_STORAGE_MODE || "respaldo",
    frequencyDays: env.CLOUD_STORAGE_FREQUENCY_DAYS,
    r2: {
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET
    }
  });
}

function readConfigFromDisk() {
  const devConfig = readDevEnvConfig();
  if (devConfig) return { ...devConfig, source: "dev-env" };

  const filePath = getConfigFilePath();
  if (!fs.existsSync(filePath)) return { ...normalizeConfig(), source: "default" };

  try {
    const raw = dbConnectionConfig.decryptProtectedPayload(fs.readFileSync(filePath));
    if (raw?.kind !== CONFIG_KIND) throw new Error("tipo de archivo inesperado");
    return { ...normalizeConfig(raw), source: "protected" };
  } catch (err) {
    // Sin clave local o archivo danado: se trabaja en local para no romper subidas.
    console.error("[Almacenamiento] No se pudo leer configuracion, usando modo local:", err.message);
    return { ...normalizeConfig(), source: "error", error: err.message };
  }
}

function getConfig() {
  if (!cachedConfig) cachedConfig = readConfigFromDisk();
  return cachedConfig;
}

function getMode() {
  const config = getConfig();
  // Sin credenciales completas no hay nube posible.
  return hasCompleteCredentials(config.r2) ? config.mode : "local";
}

// Cliente R2 si hay credenciales completas (en cualquier modo: la lectura de respaldo lo usa).
function getClient() {
  const config = getConfig();
  if (!hasCompleteCredentials(config.r2)) return null;
  if (!cachedClient) cachedClient = createR2Client(config.r2);
  return cachedClient;
}

// Combina lo recibido del formulario con lo guardado: los campos vacios conservan el valor actual.
function mergeWithSaved(input = {}) {
  const saved = getConfig();
  const incoming = normalizeCredentials(input.r2);
  const r2 = {};
  for (const key of Object.keys(incoming)) {
    r2[key] = incoming[key] || saved.r2[key];
  }
  return normalizeConfig({
    mode: input.mode ?? saved.mode,
    frequencyDays: input.frequencyDays ?? saved.frequencyDays,
    r2
  });
}

function saveConfig(config) {
  const normalized = normalizeConfig({ ...config, savedAt: new Date().toISOString() });
  const payload = { kind: CONFIG_KIND, version: CONFIG_VERSION, ...normalized };
  dbConnectionConfig.writeBinaryFileAtomic(
    getConfigFilePath(),
    dbConnectionConfig.encryptProtectedPayload(payload)
  );
  cachedConfig = null;
  cachedClient = null;
  return getConfig();
}

function maskValue(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.length > 8 ? `${text.slice(0, 4)}...${text.slice(-4)}` : "****";
}

function getPublicConfig() {
  const config = getConfig();
  return {
    mode: config.mode,
    effectiveMode: getMode(),
    frequencyDays: config.frequencyDays,
    source: config.source,
    error: config.error || null,
    savedAt: config.savedAt,
    hasCredentials: hasCompleteCredentials(config.r2),
    bucket: config.r2.bucket,
    accountId: maskValue(config.r2.accountId),
    accessKeyId: maskValue(config.r2.accessKeyId),
    hasSecret: Boolean(config.r2.secretAccessKey)
  };
}

module.exports = {
  MODES,
  MAX_FREQUENCY_DAYS,
  getClient,
  getConfig,
  getMode,
  getPublicConfig,
  hasCompleteCredentials,
  mergeWithSaved,
  saveConfig
};
