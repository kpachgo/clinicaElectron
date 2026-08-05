const express = require("express");

const router = express.Router();

function isModoVentaEnabled() {
  const raw = String(process.env.CLINICA_MODO_VENTA || "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "venta"].includes(raw);
}

router.get("/public", (req, res) => {
  res.json({
    ok: true,
    data: {
      modoVenta: isModoVentaEnabled()
    }
  });
});

module.exports = router;
