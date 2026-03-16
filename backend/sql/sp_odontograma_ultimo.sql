DROP PROCEDURE IF EXISTS `sp_odontograma_ultimo`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_ultimo`(
  IN p_idPaciente INT
)
BEGIN
  SELECT *
  FROM odontograma
  WHERE idPaciente = p_idPaciente
  ORDER BY fechaO DESC, idOdontograma DESC
  LIMIT 1;
END$$
DELIMITER ;


