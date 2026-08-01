const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

router.post("/login", authController.login);
router.post("/registro-oculto", authController.registroOculto);
router.get("/registro-oculto/catalogos", authController.registroCatalogos);
router.post(
    "/change-password",
    authMiddleware,
    roleMiddleware(["Doctor"]),
    authController.changePassword
);
router.post("/password-recovery/question", authController.passwordRecoveryQuestion);
router.post("/password-recovery/reset", authController.passwordRecoveryReset);
router.post("/password-recovery/setup", authController.passwordRecoverySetup);

module.exports = router;
