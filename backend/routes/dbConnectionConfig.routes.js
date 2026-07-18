const express = require("express");
const router = express.Router();

const controller = require("../controllers/dbConnectionConfig.controller");

router.get("/estado", controller.publicStatus);
router.post("/autorizar", controller.authorize);
router.post("/probar", controller.requireConfigSession, controller.test);
router.post("/guardar", controller.requireConfigSession, controller.save);
router.post("/reiniciar", controller.requireConfigSession, controller.restart);

module.exports = router;
