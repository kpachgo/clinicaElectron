const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/cola.controller");
const ROLES_COLA = ["Administrador", "Recepcion", "Doctor", "Asistente"];

router.get(
  "/",
  auth,
  role(ROLES_COLA),
  controller.listar
);

router.post(
  "/",
  auth,
  role(ROLES_COLA),
  controller.crear
);

router.put(
  "/:id/estado",
  auth,
  role(ROLES_COLA),
  controller.actualizarEstado
);

router.put(
  "/:id/doctor",
  auth,
  role(ROLES_COLA),
  controller.actualizarDoctor
);

router.put(
  "/:id/tratamiento",
  auth,
  role(ROLES_COLA),
  controller.actualizarTratamiento
);

router.delete(
  "/atendidos",
  auth,
  role(ROLES_COLA),
  controller.limpiarAtendidos
);

router.delete(
  "/todo",
  auth,
  role(ROLES_COLA),
  controller.borrarTodo
);

router.delete(
  "/:id",
  auth,
  role(ROLES_COLA),
  controller.eliminar
);

module.exports = router;
