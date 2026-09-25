// Configuracion de almacenamiento (Ctrl+Shift+C): modo, credenciales R2, frecuencia y respaldo manual.
// Protegido por la misma sesion de mantenimiento que la conexion de BD (requireConfigSession).
const cloudConfig = require("../services/cloudStorage/cloudStorageConfig.service");
const cloudBackup = require("../services/cloudStorage/cloudBackup.service");
const { createR2Client } = require("../services/cloudStorage/r2Client");

function buildStatus() {
  return {
    config: cloudConfig.getPublicConfig(),
    backup: cloudBackup.getStatus()
  };
}

// Acceso, escritura, lectura y borrado de un objeto de prueba (no deja nada en el bucket).
async function verifyConnection(r2) {
  const client = createR2Client(r2);
  await client.headBucket();
  const key = `_prueba-conexion/${Date.now()}.txt`;
  const content = `ClinicaElectron ${new Date().toISOString()}`;
  await client.putObject(key, content, "text/plain");
  const read = await client.getObject(key);
  await client.deleteObject(key);
  if (read.toString("utf8") !== content) {
    throw new Error("El archivo de prueba no coincide al descargarlo");
  }
}

function describeR2Error(err) {
  const code = String(err?.code || "");
  if (code === "R2_CONFIG_INVALID") return err.message;
  if (code === "AccessDenied" || code === "SignatureDoesNotMatch" || code === "InvalidAccessKeyId") {
    return "Credenciales rechazadas por R2. Revise Access Key ID, Secret y que el token tenga permiso sobre el bucket.";
  }
  if (code === "NoSuchBucket" || err?.status === 404) return "El bucket no existe en esa cuenta.";
  if (err?.name === "TimeoutError" || /fetch failed|ENOTFOUND|ECONNRESET/i.test(String(err?.message || err?.cause?.message))) {
    return "Sin conexion con Cloudflare R2. Revise el internet o el Account ID.";
  }
  return err?.message || "Error desconocido con R2";
}

function status(req, res) {
  return res.json({ ok: true, data: buildStatus() });
}

async function test(req, res) {
  const merged = cloudConfig.mergeWithSaved(req.body || {});
  if (!cloudConfig.hasCompleteCredentials(merged.r2)) {
    return res.status(400).json({ ok: false, message: "Complete Account ID, Access Key ID, Secret y Bucket" });
  }
  try {
    await verifyConnection(merged.r2);
    return res.json({ ok: true, message: `Conexion correcta con el bucket "${merged.r2.bucket}"` });
  } catch (err) {
    return res.status(400).json({ ok: false, message: describeR2Error(err) });
  }
}

async function save(req, res) {
  const merged = cloudConfig.mergeWithSaved(req.body || {});

  if (merged.mode !== "local") {
    if (!cloudConfig.hasCompleteCredentials(merged.r2)) {
      return res.status(400).json({ ok: false, message: "Para usar la nube complete las credenciales de R2" });
    }
    try {
      await verifyConnection(merged.r2);
    } catch (err) {
      return res.status(400).json({ ok: false, message: `No se guardo: ${describeR2Error(err)}` });
    }
  }

  try {
    cloudConfig.saveConfig(merged);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || "No se pudo guardar la configuracion" });
  }

  return res.json({ ok: true, message: "Configuracion de almacenamiento guardada", data: buildStatus() });
}

function backupNow(req, res) {
  if (!cloudConfig.getClient()) {
    return res.status(400).json({ ok: false, message: "Primero guarde credenciales de R2" });
  }
  void cloudBackup.runBackup("manual");
  return res.json({ ok: true, message: "Respaldo iniciado", data: buildStatus() });
}

module.exports = {
  backupNow,
  save,
  status,
  test
};
