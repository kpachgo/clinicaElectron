const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/odontograma.controller");

// 🦷 Guardar odontograma
router.post(
  "/",
  auth,
  role(["Administrador", "Doctor", "Asistente"]),
  controller.guardarOdontograma
);

// 🦷 Obtener último odontograma del paciente
router.get(
  "/ultimo/:idPaciente",
  auth,
  role(["Administrador", "Doctor", "Asistente"]),
  controller.obtenerUltimoOdontograma
);

router.get(
  "/historial/:idPaciente",
  auth,
  role(["Administrador", "Doctor", "Asistente"]),
  controller.obtenerHistorialOdontogramas
);

router.get(
  "/version/:idOdontograma",
  auth,
  role(["Administrador", "Doctor", "Asistente"]),
  controller.obtenerOdontogramaPorId
);

module.exports = router;
