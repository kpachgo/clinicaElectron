DROP PROCEDURE IF EXISTS `sp_paciente_buscar_ligero`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_buscar_ligero`(
  IN p_texto VARCHAR(60)
)
BEGIN
  SELECT
    idPaciente,
    NombreP
  FROM paciente
  WHERE NombreP LIKE CONCAT('%', p_texto, '%')
  ORDER BY NombreP
  LIMIT 10;
END$$
DELIMITER ;


