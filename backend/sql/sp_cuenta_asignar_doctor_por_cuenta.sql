DROP PROCEDURE IF EXISTS `sp_cuenta_asignar_doctor_por_cuenta`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_asignar_doctor_por_cuenta`(
  IN p_idCuenta INT,
  IN p_idDoctor INT
)
BEGIN
  UPDATE detallecuenta
  SET idDoctor = p_idDoctor
  WHERE idC = p_idCuenta;
END$$
DELIMITER ;

