const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.post("/login", authController.login);
router.post("/registro-oculto", authController.registroOculto);
router.get("/registro-oculto/catalogos", authController.registroCatalogos);

module.exports = router;
