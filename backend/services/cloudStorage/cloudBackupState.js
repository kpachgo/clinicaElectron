// Estado local del respaldo en la nube (no secreto): que objetos ya estan subidos y resultado del ultimo respaldo.
// El manifiesto evita volver a subir todo y evita usar ListObjects (Class A) para saber que hay en R2.
const path = require("path");
const storagePaths = require("../../config/storagePaths");
const dbConnectionConfig = require("../dbConnectionConfig.service");

const STATE_FILE = path.join(storagePaths.configDir, "cloud-backup-state.json");

let state = null;

function emptyState(target = "") {
  return { target, manifest: {}, lastRun: null, lastSuccessAt: null };
}

function load() {
  if (!state) {
    const raw = dbConnectionConfig.readJsonFile(STATE_FILE);
    state = raw && typeof raw.manifest === "object" ? raw : emptyState();
  }
  return state;
}

// Si cambia la cuenta/bucket, lo subido antes no cuenta: se reinicia el manifiesto.
function ensureTarget(target) {
  const current = load();
  if (current.target !== target) {
    state = { ...emptyState(target), lastRun: current.lastRun };
  }
  return state;
}

function save() {
  if (!state) return;
  dbConnectionConfig.writeJsonFileAtomic(STATE_FILE, state);
}

function isUploaded(key, stats) {
  const entry = load().manifest[key];
  return Boolean(entry && entry.size === stats.size && entry.mtimeMs === Math.floor(stats.mtimeMs));
}

function markUploaded(key, stats) {
  load().manifest[key] = { size: stats.size, mtimeMs: Math.floor(stats.mtimeMs) };
}

function forget(key) {
  const current = load();
  if (current.manifest[key]) {
    delete current.manifest[key];
    save();
  }
}

function setLastRun(result) {
  const current = load();
  current.lastRun = result;
  if (result.ok) current.lastSuccessAt = result.finishedAt;
  save();
}

function getSummary() {
  const current = load();
  return {
    lastRun: current.lastRun,
    lastSuccessAt: current.lastSuccessAt,
    uploadedCount: Object.keys(current.manifest).length
  };
}

module.exports = {
  ensureTarget,
  forget,
  getSummary,
  isUploaded,
  load,
  markUploaded,
  save,
  setLastRun
};
