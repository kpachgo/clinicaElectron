DROP PROCEDURE IF EXISTS `sp_foto_paciente_listar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_foto_paciente_listar`(
  IN p_pacienteId INT
)
BEGIN
  SELECT
    idFotoPaciente,
    pacienteId,
    fechaFP,
    rutaFP
  FROM fotopaciente
  WHERE pacienteId = p_pacienteId
  ORDER BY fechaFP ASC;
END$$
DELIMITER ;


