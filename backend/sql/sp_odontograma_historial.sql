DROP PROCEDURE IF EXISTS `sp_odontograma_historial`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_historial`(
  IN p_idPaciente INT
)
BEGIN
  SELECT
    idOdontograma,
    idPaciente,
    fechaO
  FROM odontograma
  WHERE idPaciente = p_idPaciente
  ORDER BY fechaO DESC, idOdontograma DESC;
END$$
DELIMITER ;

