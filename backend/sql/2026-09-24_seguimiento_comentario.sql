-- Monitor de Seguimiento: comentario del motivo de ausencia + marcas vigentes.
-- Fecha: 2026-09-24
--
-- Regla nueva (la aplica el backend al listar):
--   SMS / Llamada / Comentario se siguen mostrando mientras la fecha del registro
--   sea MAYOR a paciente.ultimaVisitaP. Cuando el paciente vuelve (ultimaVisitaP
--   se actualiza) el registro queda viejo y deja de mostrarse solo.
--   El backend guarda cada marca con la fecha real del dia (no la fecha de corte
--   elegida en pantalla), por eso `fechaCorte` pasa a ser "fecha del contacto".
--
-- IMPORTANTE: no se modifica sp_paciente_monitor_contacto_guardar (5 params) para
-- no romper instancias del backend que aun no envian el comentario.
-- El backend actualizado usa sp_paciente_monitor_contacto_guardar_v2 (6 params).

ALTER TABLE paciente_seguimiento_contacto
  ADD COLUMN comentario VARCHAR(500) NULL AFTER llamada;

DROP PROCEDURE IF EXISTS `sp_paciente_monitor_contacto_guardar_v2`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_monitor_contacto_guardar_v2`(
  IN p_idPaciente INT,
  IN p_fechaCorte DATE,
  IN p_sms TINYINT,
  IN p_llamada TINYINT,
  IN p_comentario VARCHAR(500),
  IN p_actualizadoPorUsuarioId INT
)
BEGIN
  INSERT INTO paciente_seguimiento_contacto (
    idPaciente,
    fechaCorte,
    sms,
    llamada,
    comentario,
    actualizadoPorUsuarioId
  ) VALUES (
    p_idPaciente,
    p_fechaCorte,
    IFNULL(p_sms, 0),
    IFNULL(p_llamada, 0),
    NULLIF(TRIM(p_comentario), ''),
    p_actualizadoPorUsuarioId
  )
  ON DUPLICATE KEY UPDATE
    sms = VALUES(sms),
    llamada = VALUES(llamada),
    comentario = VALUES(comentario),
    actualizadoPorUsuarioId = VALUES(actualizadoPorUsuarioId),
    actualizadoEn = CURRENT_TIMESTAMP;

  SELECT
    idPaciente,
    DATE_FORMAT(fechaCorte, '%Y-%m-%d') AS fechaCorte,
    sms,
    llamada,
    comentario
  FROM paciente_seguimiento_contacto
  WHERE idPaciente = p_idPaciente
    AND fechaCorte = p_fechaCorte
  LIMIT 1;
END $$
DELIMITER ;
