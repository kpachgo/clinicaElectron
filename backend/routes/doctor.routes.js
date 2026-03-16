const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const doctorController = require("../controllers/doctor.controller");
const uploadSello = require("../middlewares/uploadSello");

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Doctor"]),
  doctorController.listar
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Doctor"]),
  doctorController.crear
);

router.post(
  "/:id/sello",
  authMiddleware,
  roleMiddleware(["Administrador", "Doctor"]),
  uploadSello.single("sello"),
  doctorController.subirSello
);

// ============================
// 🦷 LISTAR DOCTORES PARA SELECT
// ============================
router.get(
  "/select",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  doctorController.listarSelect
);
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  doctorController.obtenerPorId
);

module.exports = router;



