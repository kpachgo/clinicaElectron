DROP PROCEDURE IF EXISTS `sp_foto_paciente_crear`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_foto_paciente_crear`(
  IN p_pacienteId INT,
  IN p_fecha DATE,
  IN p_ruta VARCHAR(255)
)
BEGIN
  INSERT INTO fotopaciente (pacienteId, fechaFP, rutaFP)
  VALUES (p_pacienteId, p_fecha, p_ruta);

  SELECT LAST_INSERT_ID() AS idFotoPaciente;
END$$
DELIMITER ;


