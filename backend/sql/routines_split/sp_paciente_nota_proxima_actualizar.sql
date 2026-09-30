DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_actualizar`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_nota_proxima_actualizar`(
  IN p_idNotaPC INT,
  IN p_notaPC VARCHAR(500)
)
BEGIN
  UPDATE paciente_nota_proxima_cita
  SET notaPC = TRIM(p_notaPC)
  WHERE idNotaPC = p_idNotaPC;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
