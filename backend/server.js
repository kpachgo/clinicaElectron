const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
const express = require("express");
const storagePaths = require("./config/storagePaths");

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
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/agenda", require("./routes/agenda.routes"));
app.use("/api/doctor", require("./routes/doctor.routes"));
app.use("/api/servicio", require("./routes/servicio.routes"));
app.use("/api/paciente", require("./routes/paciente.routes"));
app.use("/api/cuenta", require("./routes/cuenta.routes"));
app.use("/api/odontograma", require("./routes/odontograma.routes"));
app.use("/api/foto-paciente", require("./routes/fotoPaciente.routes"));
app.use("/api/cola", require("./routes/cola.routes"));

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

  app.listen(PORT, HOST, () => {
    const dbText = dbStatus.ok ? "DB: conectado" : `DB: no conectado (${dbStatus.message})`;
    console.log(`[BOOT] Proyecto levantado en http://localhost:${PORT} | ${dbText} | DATA: ${storagePaths.dataRootDir}`);
  });
}

startServer();
