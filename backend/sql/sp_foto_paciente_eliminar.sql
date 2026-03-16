DROP PROCEDURE IF EXISTS `sp_foto_paciente_eliminar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_foto_paciente_eliminar`(
  IN p_idFotoPaciente INT
)
BEGIN
  -- devolver la ruta ANTES de borrar
  SELECT rutaFP
  FROM fotopaciente
  WHERE idFotoPaciente = p_idFotoPaciente;

  -- borrar registro
  DELETE FROM fotopaciente
  WHERE idFotoPaciente = p_idFotoPaciente;
END$$
DELIMITER ;


