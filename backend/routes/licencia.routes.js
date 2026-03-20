const express = require("express");
const router = express.Router();

const controller = require("../controllers/licencia.controller");

router.get("/estado", controller.estado);
router.post("/activar-inicial", controller.activarInicial);

module.exports = router;

