const express = require("express");
const router = express.Router();


const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const agendaController = require("../controllers/agenda.controller");

router.get(
  "/buscar-mes",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  agendaController.buscarPorMes
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  agendaController.listarPorFecha
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  agendaController.actualizar
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  agendaController.eliminar
);
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["Administrador", "Recepcion"]),
  agendaController.crear
);

module.exports = router;
