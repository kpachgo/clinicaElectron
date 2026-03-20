const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
const express = require("express");
const storagePaths = require("./config/storagePaths");
const licenciaService = require("./services/licencia.service");
const licenciaMiddleware = require("./middlewares/licencia.middleware");

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0";
const frontendDir = path.join(__dirname, "../frontend");

// Middlewares
app.use(express.json());

// Servir archivos persistentes externos con fallback a ubicaciones legacy.
app.use("/fotos", express.static(storagePaths.fotosDir));
app.use("/fotos", express.static(path.join(frontendDir, "fotos")));
app.use("/firmas", express.static(storagePaths.firmasDir));
app.use("/firmas", express.static(path.join(frontendDir, "firmas")));
app.use("/img/docs", express.static(storagePaths.imgDocsDir));
app.use("/img/docs", express.static(path.join(frontendDir, "img/docs")));

// Servir frontend
app.use(express.static(frontendDir));
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ ok: true, port: PORT });
});

// Rutas API
app.use("/api/licencia", require("./routes/licencia.routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/agenda", licenciaMiddleware.requireLicensedAccess, require("./routes/agenda.routes"));
app.use("/api/doctor", licenciaMiddleware.requireLicensedAccess, require("./routes/doctor.routes"));
app.use("/api/servicio", licenciaMiddleware.requireLicensedAccess, require("./routes/servicio.routes"));
app.use("/api/paciente", licenciaMiddleware.requireLicensedAccess, require("./routes/paciente.routes"));
app.use("/api/cuenta", licenciaMiddleware.requireLicensedAccess, require("./routes/cuenta.routes"));
app.use("/api/odontograma", licenciaMiddleware.requireLicensedAccess, require("./routes/odontograma.routes"));
app.use("/api/foto-paciente", licenciaMiddleware.requireLicensedAccess, require("./routes/fotoPaciente.routes"));
app.use("/api/cola", licenciaMiddleware.requireLicensedAccess, require("./routes/cola.routes"));

storagePaths.ensureDataDirsSync();

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
