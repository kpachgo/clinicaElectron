const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");

router.post("/login", authController.login);
router.post("/registro-oculto", authController.registroOculto);
router.get("/registro-oculto/catalogos", authController.registroCatalogos);
router.post("/password-recovery/question", authController.passwordRecoveryQuestion);
router.post("/password-recovery/reset", authController.passwordRecoveryReset);
router.post("/password-recovery/setup", authController.passwordRecoverySetup);

module.exports = router;
