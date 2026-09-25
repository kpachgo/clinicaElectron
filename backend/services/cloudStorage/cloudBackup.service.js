// Respaldo de archivos con R2.
//   Subida (modos respaldo y nube): todo archivo de disco que no figure en el manifiesto se sube.
//     En modo nube esto migra lo que ya estaba en ProgramData y respalda docs/logo, que siempre son locales.
//   Bajada (solo modo respaldo): las rutas registradas en MySQL que no estan en disco se descargan de R2
//     (p. ej. fotos subidas mientras el modo era "nube"). Si no estan en ningun lado, se informan como perdidas.
// Nunca usa ListObjects: lo que hay en R2 se sabe por el manifiesto local y por MySQL.
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const pool = require("../../config/db");
const { writeBufferFile } = require("../../utils/file");
const cloudConfig = require("./cloudStorageConfig.service");
const backupState = require("./cloudBackupState");
const fileStorage = require("./fileStorage.service");

const CONCURRENCY = 4;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 2 * 60 * 1000;
const MAX_REPORTED_NAMES = 20;

const DB_REFERENCES = [
  "SELECT rutaFP AS ruta FROM fotopaciente WHERE rutaFP IS NOT NULL AND rutaFP <> ''",
  "SELECT firmaP AS ruta FROM paciente WHERE firmaP IS NOT NULL AND firmaP <> ''",
  "SELECT FirmaD AS ruta FROM doctor WHERE FirmaD IS NOT NULL AND FirmaD <> ''",
  "SELECT SelloD AS ruta FROM doctor WHERE SelloD IS NOT NULL AND SelloD <> ''"
];

let running = null;
let progress = null;
let schedulerStarted = false;

async function runWithConcurrency(items, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function collectLocalFiles() {
  const files = [];
  const seenKeys = new Set();

  for (const categoryId of Object.keys(fileStorage.CATEGORIES)) {
    const category = fileStorage.getCategory(categoryId);
    // La carpeta de ProgramData gana sobre la legacy si el mismo nombre existe en ambas.
    for (const dir of [category.dir, category.legacyDir].filter(Boolean)) {
      let entries = [];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (err.code === "ENOENT") continue;
        throw err;
      }
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith(".tmp")) continue;
        const key = fileStorage.objectKey(categoryId, entry.name);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        files.push({ key, fullPath: path.join(dir, entry.name), name: entry.name });
      }
    }
  }
  return files;
}

async function uploadPhase(client, result) {
  progress = { phase: "comparando", done: 0, total: 0 };
  const files = await collectLocalFiles();
  const pending = [];
  for (const file of files) {
    const stats = await fsp.stat(file.fullPath);
    if (!backupState.isUploaded(file.key, stats)) pending.push({ ...file, stats });
  }

  progress = {
    phase: "subiendo",
    done: 0,
    total: pending.length,
    bytesDone: 0,
    bytesTotal: pending.reduce((sum, file) => sum + file.stats.size, 0)
  };
  await runWithConcurrency(pending, async (file) => {
    try {
      const buffer = await fsp.readFile(file.fullPath);
      await client.putObject(file.key, buffer, fileStorage.contentTypeFor(file.name));
      backupState.markUploaded(file.key, file.stats);
      result.uploaded += 1;
      result.bytesUp += buffer.length;
    } catch (err) {
      result.errors.push(`${file.key}: ${err.message}`);
    } finally {
      progress.done += 1;
      progress.bytesDone += file.stats.size;
      if (progress.done % 25 === 0) backupState.save();
    }
  });
  backupState.save();
}

async function collectDbReferences() {
  const refs = new Map();
  for (const sql of DB_REFERENCES) {
    try {
      const [rows] = await pool.query(sql);
      for (const row of rows || []) {
        const parsed = fileStorage.parsePublicPath(row.ruta);
        if (parsed) refs.set(fileStorage.objectKey(parsed.categoryId, parsed.name), parsed);
      }
    } catch (err) {
      // Una tabla/columna ausente en una BD vieja no debe frenar el resto del respaldo.
      console.error("[Respaldo nube] No se pudieron leer referencias:", err.message);
    }
  }
  return [...refs.entries()].map(([key, parsed]) => ({ key, ...parsed }));
}

async function downloadPhase(client, result) {
  const refs = await collectDbReferences();
  const missingLocal = refs.filter((ref) => !fileStorage.findLocal(ref.categoryId, ref.name));

  progress = { phase: "descargando", done: 0, total: missingLocal.length };
  await runWithConcurrency(missingLocal, async (ref) => {
    try {
      const buffer = await client.getObjectOrNull(ref.key);
      if (!buffer) {
        result.missing += 1;
        if (result.missingNames.length < MAX_REPORTED_NAMES) result.missingNames.push(ref.key);
        return;
      }
      // Escribir como .tmp y renombrar: si se corta a mitad, no queda una foto incompleta
      // que la siguiente corrida tomaria como "ya existe en disco".
      const dir = fileStorage.getCategory(ref.categoryId).dir;
      const tempPath = await writeBufferFile(dir, `${ref.name}.${process.pid}.tmp`, buffer);
      const fullPath = path.join(dir, ref.name);
      await fsp.rename(tempPath, fullPath);
      backupState.markUploaded(ref.key, fs.statSync(fullPath));
      result.downloaded += 1;
      result.bytesDown += buffer.length;
    } catch (err) {
      result.errors.push(`${ref.key}: ${err.message}`);
    } finally {
      progress.done += 1;
    }
  });
  backupState.save();
}

async function execute(trigger) {
  const config = cloudConfig.getConfig();
  const client = cloudConfig.getClient();
  const mode = cloudConfig.getMode();
  const result = {
    ok: false,
    trigger,
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    uploaded: 0,
    downloaded: 0,
    missing: 0,
    missingNames: [],
    bytesUp: 0,
    bytesDown: 0,
    errors: [],
    message: ""
  };

  try {
    if (!client) throw new Error("No hay credenciales de R2 configuradas");
    backupState.ensureTarget(`${config.r2.accountId}/${config.r2.bucket}`);

    await uploadPhase(client, result);
    if (mode === "respaldo") await downloadPhase(client, result);

    result.ok = result.errors.length === 0;
    result.message = result.ok
      ? `Respaldo completo: ${result.uploaded} subidos, ${result.downloaded} descargados${result.missing ? `, ${result.missing} no encontrados en ningun lado` : ""}`
      : `Respaldo con ${result.errors.length} errores`;
  } catch (err) {
    result.message = err.message;
    result.errors.push(err.message);
  } finally {
    result.errors = result.errors.slice(0, MAX_REPORTED_NAMES);
    result.finishedAt = new Date().toISOString();
    backupState.setLastRun(result);
    console.log("[Respaldo nube]", result.message);
  }
  return result;
}

// Un solo respaldo a la vez; si ya hay uno corriendo se devuelve ese.
function runBackup(trigger = "manual") {
  if (!running) {
    running = execute(trigger).finally(() => {
      running = null;
      progress = null;
    });
  }
  return running;
}

function isDue() {
  const mode = cloudConfig.getMode();
  if (mode !== "respaldo" && mode !== "nube") return false;
  const { lastSuccessAt } = backupState.getSummary();
  if (!lastSuccessAt) return true;
  const frequencyMs = cloudConfig.getConfig().frequencyDays * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(lastSuccessAt).getTime() >= frequencyMs;
}

function checkSchedule() {
  if (running || !isDue()) return;
  void runBackup("automatico");
}

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setTimeout(checkSchedule, FIRST_CHECK_DELAY_MS).unref?.();
  setInterval(checkSchedule, CHECK_INTERVAL_MS).unref?.();
}

function getStatus() {
  return {
    running: Boolean(running),
    progress,
    ...backupState.getSummary()
  };
}

module.exports = {
  getStatus,
  runBackup,
  startScheduler
};
