const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { fotosDir } = require("../config/storagePaths");

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/fotoPaciente.controller");

function tokenSeguro(value, fallback) {
  const clean = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return clean || fallback;
}

function fechaSegura(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().split("T")[0];
}

// ======= MULTER =======
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fotosDir);
  },
  filename: (req, file, cb) => {
    const pacienteId = tokenSeguro(req.body?.pacienteId, "paciente");
    const fecha = fechaSegura(req.body?.fecha);
    const ext = (path.extname(file.originalname || "") || ".jpg").toLowerCase();
    cb(null, `paciente_${pacienteId}_${fecha}_${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

// ============================
// 📸 SUBIR FOTO PACIENTE
// ============================
router.post(
  "/",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  upload.single("foto"),
  controller.subirFotoPaciente
);

router.post(
  "/principal",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.guardarFotoPrincipalPaciente
);

// ============================
// 📂 LISTAR FOTOS PACIENTE
// ============================
router.get(
  "/:pacienteId",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.listarFotosPaciente
);

// ============================
// 🗑️ ELIMINAR FOTO
// ============================
router.delete(
  "/:idFotoPaciente",
  auth,
  role(["Administrador", "Asistente", "Doctor"]),
  controller.eliminarFotoPaciente
);

module.exports = router;

