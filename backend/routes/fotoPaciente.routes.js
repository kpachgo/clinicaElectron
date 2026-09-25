const express = require("express");
const router = express.Router();
const multer = require("multer");

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/fotoPaciente.controller");

// ======= MULTER =======
// En memoria: el controlador comprime y decide destino (disco o R2 segun modo de almacenamiento).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }
});

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

