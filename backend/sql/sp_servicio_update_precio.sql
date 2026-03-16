DROP PROCEDURE IF EXISTS `sp_servicio_update_precio`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_update_precio`(
  IN p_id INT,
  IN p_precio DECIMAL(10,2)
)
BEGIN
  UPDATE servicio
  SET precioS = p_precio
  WHERE idServicio = p_id;
END$$
DELIMITER ;


