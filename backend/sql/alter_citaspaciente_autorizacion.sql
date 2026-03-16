ALTER TABLE citaspaciente
  ADD COLUMN IF NOT EXISTS creadoPorUsuarioId INT NULL AFTER doctorId,
  ADD COLUMN IF NOT EXISTS estadoAutorizacionCP VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' AFTER creadoPorUsuarioId,
  ADD COLUMN IF NOT EXISTS metodoAutorizacionCP VARCHAR(40) NULL AFTER estadoAutorizacionCP,
  ADD COLUMN IF NOT EXISTS autorizadoPorUsuarioId INT NULL AFTER metodoAutorizacionCP,
  ADD COLUMN IF NOT EXISTS fechaAutorizacionCP DATETIME NULL AFTER autorizadoPorUsuarioId;

CREATE INDEX IF NOT EXISTS idx_citas_estado_autorizacion ON citaspaciente (estadoAutorizacionCP);
CREATE INDEX IF NOT EXISTS idx_citas_autorizado_por ON citaspaciente (autorizadoPorUsuarioId);
CREATE INDEX IF NOT EXISTS idx_citas_creado_por ON citaspaciente (creadoPorUsuarioId);

UPDATE citaspaciente c
LEFT JOIN doctor d ON d.idDoctor = c.doctorId
SET
  c.estadoAutorizacionCP = CASE
    WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico' THEN 'AUTORIZADA'
    ELSE IFNULL(NULLIF(c.estadoAutorizacionCP, ''), 'PENDIENTE')
  END,
  c.metodoAutorizacionCP = CASE
    WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico' THEN 'FISICO_ESCANEADO'
    ELSE c.metodoAutorizacionCP
  END,
  c.fechaAutorizacionCP = CASE
    WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico' AND c.fechaAutorizacionCP IS NULL
      THEN NOW()
    ELSE c.fechaAutorizacionCP
  END;

