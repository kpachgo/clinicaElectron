const express = require("express");
const multer = require("multer");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const doctorController = require("../controllers/doctor.controller");
const uploadSello = require("../middlewares/uploadSello");

function uploadSelloWithJsonErrors(req, res, next) {
  uploadSello.single("sello")(req, res, (err) => {
    if (!err) return next();

    let message = "No se pudo procesar el archivo del sello";
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        message = "El sello excede el tamano maximo permitido (4 MB)";
      } else if (err.message) {
        message = err.message;
      }
    } else if (err?.message) {
      message = err.message;
    }

    return res.status(400).json({
      ok: false,
      message
    });
  });
}

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor"]),
  doctorController.listar
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  doctorController.crear
);

router.post(
  "/:id/sello",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor"]),
  doctorController.validarAccesoMediaDoctor,
  uploadSelloWithJsonErrors,
  doctorController.subirSello
);

router.post(
  "/:id/firma",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor"]),
  doctorController.validarAccesoMediaDoctor,
  doctorController.actualizarFirma
);

router.get(
  "/pendientes-autorizacion",
  authMiddleware,
  roleMiddleware(["Doctor"]),
  doctorController.listarPendientesAutorizacion
);

router.post(
  "/pendientes-autorizacion/autorizar-todos",
  authMiddleware,
  roleMiddleware(["Doctor"]),
  doctorController.autorizarTodosPendientes
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
router.put(
  "/:id/estado",
  authMiddleware,
  roleMiddleware(["Doctor"]),
  doctorController.actualizarEstado
);
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  doctorController.obtenerPorId
);

module.exports = router;



