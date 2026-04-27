const express = require("express");
const router = express.Router();


const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

const agendaController = require("../controllers/agenda.controller");
const ROLES_AGENDA = ["Administrador", "Recepcion", "Redes"];

router.get(
  "/buscar-mes",
  authMiddleware,
  roleMiddleware(ROLES_AGENDA),
  agendaController.buscarPorMes
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware(ROLES_AGENDA),
  agendaController.listarPorFecha
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(ROLES_AGENDA),
  agendaController.actualizar
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(ROLES_AGENDA),
  agendaController.eliminar
);
router.post(
  "/",
  authMiddleware,
  roleMiddleware(ROLES_AGENDA),
  agendaController.crear
);

module.exports = router;
