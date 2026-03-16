DROP PROCEDURE IF EXISTS `sp_paciente_actualizar_firma`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_actualizar_firma`(
  IN p_idPaciente INT,
  IN p_firmaP VARCHAR(255)
)
BEGIN
  UPDATE paciente
  SET firmaP = p_firmaP
  WHERE idPaciente = p_idPaciente;
END$$
DELIMITER ;


