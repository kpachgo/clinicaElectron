const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
console.log("[BACKEND START]", {
  pid: process.pid,
  time: new Date().toISOString()
});
const express = require("express");
const storagePaths = require("./config/storagePaths");
const licenciaService = require("./services/licencia.service");
const licenciaMiddleware = require("./middlewares/licencia.middleware");
const mensajesRuntime = require("./services/mensajes/mensajesRuntime.service");
const fileStorage = require("./services/cloudStorage/fileStorage.service");
const cloudBackup = require("./services/cloudStorage/cloudBackup.service");

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("[BACKEND SHUTDOWN]", {
    pid: process.pid,
    signal,
    time: new Date().toISOString()
  });
  try {
    await mensajesRuntime.stop();
  } catch (error) {
    console.error("[BACKEND SHUTDOWN ERROR]", {
      pid: process.pid,
      message: error?.message,
      stack: error?.stack,
      time: new Date().toISOString()
    });
  }
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";
const frontendDir = path.join(__dirname, "../frontend");

// Middlewares
app.use(express.json({ limit: "10mb" }));
app.use((err, req, res, next) => {
  if (!err) return next();

  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      ok: false,
      message: "La imagen es demasiado grande. Seleccione una firma mas liviana."
    });
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      ok: false,
      message: "JSON invalido en la solicitud"
    });
  }

  return next(err);
});

// Servir archivos persistentes externos (imagenes de docs con fallback legacy).
app.use("/fotos", express.static(storagePaths.fotosDir));
app.use("/firmas", express.static(storagePaths.firmasDir));
app.use("/img/docs", express.static(storagePaths.imgDocsDir));
app.use("/img/docs", express.static(path.join(frontendDir, "img/docs")));
app.use("/docs", express.static(storagePaths.docsDir));
// Si no esta en disco (modo nube o PC nueva), se busca en R2 con la misma ruta.
app.use("/fotos", fileStorage.cloudFallback("fotos"));
app.use("/firmas", fileStorage.cloudFallback("firmas"));
app.use("/img/docs", fileStorage.cloudFallback("imgDocs"));
app.use("/docs", fileStorage.cloudFallback("docs"));

// Servir frontend
app.use(express.static(frontendDir));
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

app.post("/internal/shutdown", (req, res) => {
  const remote = req.socket.remoteAddress;
  if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
    return res.status(403).json({ ok: false, message: "Shutdown local solamente" });
  }
  console.log("[BACKEND] Shutdown iniciado", { pid: process.pid, time: new Date().toISOString() });
  void mensajesRuntime.stop().then(() => {
    console.log("[BACKEND] Shutdown completado", { pid: process.pid, time: new Date().toISOString() });
    res.json({ ok: true });
    setTimeout(() => process.exit(0), 50).unref?.();
  }).catch((error) => {
    console.error("[BACKEND SHUTDOWN ERROR]", error);
    res.status(500).json({ ok: false, message: error?.message || "Shutdown fallido" });
  });
});

// Rutas API
app.use("/api/app-config", require("./routes/appConfig.routes"));
app.use("/api/licencia", require("./routes/licencia.routes"));
app.use("/api/configuracion-db", require("./routes/dbConnectionConfig.routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/backup", licenciaMiddleware.requireLicensedAccess, require("./routes/backup.routes"));
app.use("/api/agenda", licenciaMiddleware.requireLicensedAccess, require("./routes/agenda.routes"));
app.use("/api/seguridad-protocolo", licenciaMiddleware.requireLicensedAccess, require("./routes/seguridadProtocolo.routes"));
app.use("/api/doctor", licenciaMiddleware.requireLicensedAccess, require("./routes/doctor.routes"));
app.use("/api/servicio", licenciaMiddleware.requireLicensedAccess, require("./routes/servicio.routes"));
app.use("/api/paciente", licenciaMiddleware.requireLicensedAccess, require("./routes/paciente.routes"));
app.use("/api/cuenta", licenciaMiddleware.requireLicensedAccess, require("./routes/cuenta.routes"));
app.use("/api/odontograma", licenciaMiddleware.requireLicensedAccess, require("./routes/odontograma.routes"));
app.use("/api/foto-paciente", licenciaMiddleware.requireLicensedAccess, require("./routes/fotoPaciente.routes"));
app.use("/api/cola", licenciaMiddleware.requireLicensedAccess, require("./routes/cola.routes"));
app.use("/api/mensajes", licenciaMiddleware.requireLicensedAccess, require("./routes/mensajes.routes"));
app.use("/api/mensajes-view", licenciaMiddleware.requireLicensedAccess, require("./routes/mensajesView.routes"));

storagePaths.ensureDataDirsSync();
cloudBackup.startScheduler();
require("./services/mensajesDatabase.service").getDb();
mensajesRuntime.start().catch((error) => console.error("[Mensajes] No se pudo iniciar simulador:", error));

const pool = require("./config/db");

async function getDbConnectionStatus() {
  try {
    await pool.query("SELECT 1");
    return { ok: true, message: "conectado" };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || "error desconocido"
    };
  }
}

async function startServer() {
  const dbStatus = await getDbConnectionStatus();
  const licenciaStatus = await licenciaService.initializeRuntimeValidation();

  app.listen(PORT, HOST, () => {
    const dbText = dbStatus.ok ? "DB: conectado" : `DB: no conectado (${dbStatus.message})`;
    const licStartup = licenciaStatus?.startup?.ok ? "startup:ok" : `startup:bloqueado(${licenciaStatus?.startup?.code || "n/a"})`;
    const licUsage = licenciaStatus?.usage?.ok ? "uso:ok" : `uso:bloqueado(${licenciaStatus?.usage?.code || "n/a"})`;
    console.log(`[BOOT] Proyecto levantado en http://localhost:${PORT} | ${dbText} | LIC: ${licStartup}, ${licUsage} | DATA: ${storagePaths.dataRootDir}`);
  });
}

startServer();
