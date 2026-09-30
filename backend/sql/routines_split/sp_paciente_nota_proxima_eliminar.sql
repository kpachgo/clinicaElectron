DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_nota_proxima_eliminar`(
  IN p_idNotaPC INT
)
BEGIN
  DELETE FROM paciente_nota_proxima_cita
  WHERE idNotaPC = p_idNotaPC;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
