CREATE TABLE IF NOT EXISTS mensajes_auditoria (
  idAuditoria BIGINT AUTO_INCREMENT PRIMARY KEY,
  operacion VARCHAR(80) NOT NULL,
  idempotencyKey VARCHAR(120) NULL,
  solicitante VARCHAR(40) NOT NULL,
  payload JSON NULL,
  resultado VARCHAR(30) NOT NULL,
  detalle VARCHAR(255) NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mensajes_auditoria_idempotencia (operacion, idempotencyKey)
);
