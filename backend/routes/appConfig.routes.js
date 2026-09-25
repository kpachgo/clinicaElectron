const express = require("express");
const { isModoVentaEnabled } = require("../services/appMode.service");

const router = express.Router();

router.get("/public", (req, res) => {
  res.json({
    ok: true,
    data: {
      modoVenta: isModoVentaEnabled()
    }
  });
});

module.exports = router;
