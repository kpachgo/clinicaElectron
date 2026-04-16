const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const controller = require("../controllers/seguridadProtocolo.controller");

router.get(
  "/",
  authMiddleware,
  controller.obtenerEstado
);

router.put(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  controller.actualizarEstado
);

module.exports = router;
