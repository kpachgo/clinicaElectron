const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/paciente.controller");

// ============================
// 🔍 BUSCAR PACIENTES (AUTOCOMPLETE)
// ============================
router.get(
  "/search",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.buscar
);
router.get(
  "/existe",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.existePaciente
);

// ============================
// 🧍 OBTENER PACIENTE POR ID
// ============================
router.get(
  "/:id",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.obtenerPorId
);
// ============================
// ✍️ GUARDAR FIRMA PACIENTE
// ============================
router.post(
  "/firma",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.guardarFirma
);
// ============================
// 💾 GUARDAR PACIENTE
// ============================
router.post(
  "/guardar",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.guardarPaciente
);

router.post(
  "/cita",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.crearCitaPaciente
);
router.put(
  "/cita/:id",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.actualizarCitaPaciente
);
router.post(
  "/cita/:id/autorizar",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.autorizarCitaPaciente
);
router.get(
  "/:id/citas",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.listarCitasPaciente
);

module.exports = router;
