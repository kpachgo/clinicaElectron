DROP PROCEDURE IF EXISTS `sp_odontograma_get_by_id`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_get_by_id`(
  IN p_idOdontograma INT
)
BEGIN
  SELECT *
  FROM odontograma
  WHERE idOdontograma = p_idOdontograma
  LIMIT 1;
END$$
DELIMITER ;

