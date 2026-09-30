const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const inventarioController = require("../controllers/inventario.controller");

// Doctor no ve Inventario por ahora. Borrar un pedido ya generado: solo Administrador (en el controller).
const ROLES_INVENTARIO = ["Administrador", "Recepcion", "Asistente"];

// Catalogo
router.get("/articulos", authMiddleware, role(ROLES_INVENTARIO), inventarioController.listarArticulos);
router.post("/articulos", authMiddleware, role(ROLES_INVENTARIO), inventarioController.crearArticulo);
router.put("/articulos/:id", authMiddleware, role(ROLES_INVENTARIO), inventarioController.actualizarArticulo);
router.delete("/articulos/:id", authMiddleware, role(ROLES_INVENTARIO), inventarioController.eliminarArticulo);

// Pedidos
router.get("/pedidos", authMiddleware, role(ROLES_INVENTARIO), inventarioController.listarPedidos);
router.get("/pedidos/:id", authMiddleware, role(ROLES_INVENTARIO), inventarioController.obtenerPedido);
router.post("/pedidos", authMiddleware, role(ROLES_INVENTARIO), inventarioController.crearPedido);
router.put("/pedidos/:id", authMiddleware, role(ROLES_INVENTARIO), inventarioController.actualizarPedido);
router.delete("/pedidos/:id", authMiddleware, role(ROLES_INVENTARIO), inventarioController.eliminarPedido);

module.exports = router;
