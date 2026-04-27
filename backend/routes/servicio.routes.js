const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");
const servicioController = require("../controllers/servicio.controller");

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  servicioController.listar
);

router.get(
  "/precios",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor", "Asistente"]),
  servicioController.listarPrecios
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  servicioController.crear
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  servicioController.actualizar
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  servicioController.eliminar
);

// 🔍 AUTOCOMPLETE SERVICIO (COBRO)
router.get(
  "/search",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion", "Doctor", "Asistente", "Redes"]),
  servicioController.buscarLigero
);

module.exports = router;
