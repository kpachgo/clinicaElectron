DROP PROCEDURE IF EXISTS `sp_cuenta_eliminar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_eliminar`(
  IN p_idCuenta INT
)
BEGIN
  -- Eliminar primero los detalles
  DELETE FROM detallecuenta
  WHERE idC = p_idCuenta;

  -- Luego eliminar la cuenta
  DELETE FROM cuenta
  WHERE idCuenta = p_idCuenta;
END$$
DELIMITER ;


