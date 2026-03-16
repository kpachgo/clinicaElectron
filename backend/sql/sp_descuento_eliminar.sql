DROP PROCEDURE IF EXISTS `sp_descuento_eliminar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_descuento_eliminar`(
  IN p_id INT
)
BEGIN
  DELETE FROM descuento
  WHERE idDescuento = p_id;
END$$
DELIMITER ;


