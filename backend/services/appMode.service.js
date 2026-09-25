"use strict";

// Modo venta: variante comercial sin reglas propias de una clínica específica
// (ver contextos/18_modo_venta.md). Se lee en cada llamada para respetar el .env
// cargado al arrancar sin cachear un valor viejo.
function isModoVentaEnabled() {
  const raw = String(process.env.CLINICA_MODO_VENTA || "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "venta"].includes(raw);
}

module.exports = { isModoVentaEnabled };
