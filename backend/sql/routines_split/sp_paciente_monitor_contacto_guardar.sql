DROP PROCEDURE IF EXISTS `sp_paciente_monitor_contacto_guardar`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_monitor_contacto_guardar`(
  IN p_idPaciente INT,
  IN p_fechaCorte DATE,
  IN p_sms TINYINT,
  IN p_llamada TINYINT,
  IN p_actualizadoPorUsuarioId INT
)
BEGIN
  INSERT INTO paciente_seguimiento_contacto (
    idPaciente,
    fechaCorte,
    sms,
    llamada,
    actualizadoPorUsuarioId
  ) VALUES (
    p_idPaciente,
    p_fechaCorte,
    IFNULL(p_sms, 0),
    IFNULL(p_llamada, 0),
    p_actualizadoPorUsuarioId
  )
  ON DUPLICATE KEY UPDATE
    sms = VALUES(sms),
    llamada = VALUES(llamada),
    actualizadoPorUsuarioId = VALUES(actualizadoPorUsuarioId),
    actualizadoEn = CURRENT_TIMESTAMP;

  SELECT
    idPaciente,
    DATE_FORMAT(fechaCorte, '%Y-%m-%d') AS fechaCorte,
    sms,
    llamada
  FROM paciente_seguimiento_contacto
  WHERE idPaciente = p_idPaciente
    AND fechaCorte = p_fechaCorte
  LIMIT 1;
END $$
DELIMITER ;
