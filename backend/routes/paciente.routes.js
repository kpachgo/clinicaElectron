const express = require("express");
const router = express.Router();
const multer = require("multer");

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/paciente.controller");
const uploadPrintLogo = require("../middlewares/uploadPrintLogo");
const ROLES_PACIENTE_AGENDA = ["Administrador", "Recepcion", "Doctor", "Asistente", "Redes"];
const ROLES_MONITOR_SEGUIMIENTO = ["Administrador", "Recepcion", "Redes"];
const ROLES_PRINT_BRANDING = ["Administrador", "Recepcion", "Doctor", "Asistente"];

function uploadPrintLogoWithJsonErrors(req, res, next) {
  uploadPrintLogo.single("logo")(req, res, (err) => {
    if (!err) return next();

    let message = "No se pudo procesar el archivo del logo";
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        message = "El logo excede el tamano maximo permitido (4 MB)";
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

// ============================
// BUSCAR PACIENTES (AUTOCOMPLETE)
// ============================
router.get(
  "/search",
  auth,
  role(ROLES_PACIENTE_AGENDA),
  controller.buscar
);
router.get(
  "/existe",
  auth,
  role(ROLES_PACIENTE_AGENDA),
  controller.existePaciente
);

// ============================
// MONITOR DE SEGUIMIENTO
// Debe declararse antes de "/:id" para evitar colision de rutas.
// ============================
router.get(
  "/monitor-seguimiento",
  auth,
  role(ROLES_MONITOR_SEGUIMIENTO),
  controller.monitorSeguimiento
);
router.get(
  "/monitor-seguimiento/proxima-cita",
  auth,
  role(ROLES_MONITOR_SEGUIMIENTO),
  controller.monitorSeguimientoProximaCita
);
router.put(
  "/monitor-seguimiento/contacto",
  auth,
  role(ROLES_MONITOR_SEGUIMIENTO),
  controller.guardarMonitorContacto
);
router.get(
  "/print-branding/logo",
  auth,
  role(ROLES_PRINT_BRANDING),
  controller.obtenerPrintBrandingLogo
);
router.post(
  "/print-branding/logo",
  auth,
  role(ROLES_PRINT_BRANDING),
  uploadPrintLogoWithJsonErrors,
  controller.subirPrintBrandingLogo
);

// ============================
// OBTENER PACIENTE POR ID
// ============================
router.get(
  "/:id",
  auth,
  role(ROLES_PACIENTE_AGENDA),
  controller.obtenerPorId
);

// ============================
// GUARDAR FIRMA PACIENTE
// ============================
router.post(
  "/firma",
  auth,
  role(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  controller.guardarFirma
);

// ============================
// GUARDAR PACIENTE
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
