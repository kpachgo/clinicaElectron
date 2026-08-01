const express = require("express");
const multer = require("multer");

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/backup.controller");
const uploadBackupFile = require("../middlewares/uploadBackupFile");

const router = express.Router();
const ADMIN_ROLES = ["Administrador"];

function uploadBackupWithJsonErrors(req, res, next) {
  uploadBackupFile.single("backup")(req, res, (err) => {
    if (!err) return next();

    let message = "No se pudo procesar el archivo de copia de seguridad";
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        message = "La copia excede el tamano maximo permitido (512 MB)";
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
  "/status",
  auth,
  role(ADMIN_ROLES),
  controller.status
);

router.post(
  "/crear",
  auth,
  role(ADMIN_ROLES),
  controller.crear
);

router.post(
  "/restaurar",
  auth,
  role(ADMIN_ROLES),
  uploadBackupWithJsonErrors,
  controller.restaurar
);

module.exports = router;
