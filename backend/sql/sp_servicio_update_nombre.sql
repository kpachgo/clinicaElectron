DROP PROCEDURE IF EXISTS `sp_servicio_update_nombre`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_update_nombre`(
  IN p_id INT,
  IN p_nombre VARCHAR(50)
)
BEGIN
  UPDATE servicio
  SET nombreS = p_nombre
  WHERE idServicio = p_id;
END$$
DELIMITER ;


