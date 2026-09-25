const express = require("express");
const router = express.Router();

const controller = require("../controllers/dbConnectionConfig.controller");
const storageController = require("../controllers/cloudStorage.controller");

router.get("/estado", controller.publicStatus);
router.post("/autorizar", controller.authorize);
router.post("/probar", controller.requireConfigSession, controller.test);
router.post("/guardar", controller.requireConfigSession, controller.save);
router.post("/reiniciar", controller.requireConfigSession, controller.restart);

// Almacenamiento de archivos (local / respaldo / nube)
router.get("/almacenamiento", controller.requireConfigSession, storageController.status);
router.post("/almacenamiento/probar", controller.requireConfigSession, storageController.test);
router.post("/almacenamiento/guardar", controller.requireConfigSession, storageController.save);
router.post("/almacenamiento/respaldar", controller.requireConfigSession, storageController.backupNow);

module.exports = router;
