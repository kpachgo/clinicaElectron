DROP PROCEDURE IF EXISTS `sp_descuento_crear`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_descuento_crear`(
  IN p_nombre VARCHAR(50),
  IN p_fecha DATE,
  IN p_cantidad DECIMAL(10,2)
)
BEGIN
  INSERT INTO descuento (nombreD, fechaD, cantidadD)
  VALUES (p_nombre, p_fecha, p_cantidad);

  SELECT LAST_INSERT_ID() AS idDescuento;
END$$
DELIMITER ;


