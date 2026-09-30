DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_nota_proxima_crear`(
  IN p_idPaciente INT,
  IN p_fechaNotaPC DATE,
  IN p_notaPC VARCHAR(500),
  IN p_creadoPorUsuarioId INT
)
BEGIN
  INSERT INTO paciente_nota_proxima_cita (idPaciente, fechaNotaPC, notaPC, creadoPorUsuarioId)
  VALUES (p_idPaciente, p_fechaNotaPC, TRIM(p_notaPC), p_creadoPorUsuarioId);
  SELECT LAST_INSERT_ID() AS idNotaPC;
END $$
DELIMITER ;
