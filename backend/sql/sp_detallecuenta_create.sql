DROP PROCEDURE IF EXISTS `sp_detallecuenta_create`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_detallecuenta_create`(
  IN p_idCuenta INT,
  IN p_idServicio INT,
  IN p_cantidad INT,
  IN p_precio DECIMAL(10,2)
)
BEGIN
  INSERT INTO detallecuenta (
    idC,
    idServicio,
    cantidadDC,
    precioUnitarioDC,
    subTotalDC
  ) VALUES (
    p_idCuenta,
    p_idServicio,
    p_cantidad,
    p_precio,
    p_cantidad * p_precio
  );
END$$
DELIMITER ;


