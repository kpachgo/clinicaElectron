const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const controller = require("../controllers/cuenta.controller");

// CREAR CUENTA + DETALLE
router.post(
  "/",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.crear
);

// LISTAR CUENTAS (RESUMEN POR FECHA)
router.get(
  "/",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.listarPorFecha
);

router.get(
  "/buscar-mes",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.buscarPorMes
);

// REPORTE MENSUAL POR TRATAMIENTO
router.get(
  "/reporte-mensual",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.listarReporteMensual
);

router.get(
  "/reporte-mensual-pacientes",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.listarReporteMensualPacientes
);
// DESCUENTOS
router.post(
  "/descuento",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.crearDescuento
);

router.get(
  "/descuento",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.listarDescuentoPorFecha
);

router.delete(
  "/descuento/:id",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.eliminarDescuento
);

router.put(
  "/:id/doctor",
  auth,
  role(["Administrador", "Recepcion"]),
  controller.actualizarDoctorCuenta
);
// ELIMINAR CUENTA
router.delete(
  "/:id",
  auth,
  role(["Administrador"]),
  controller.eliminar
);

module.exports = router;
