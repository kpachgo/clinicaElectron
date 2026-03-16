DROP PROCEDURE IF EXISTS `sp_cuenta_create`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_create`(
  IN p_idPaciente INT,
  IN p_formaPago VARCHAR(40),
  IN p_total DECIMAL(10,2)
)
BEGIN
  INSERT INTO cuenta (fechaC, FormaPagoC, idPaciente, totalC)
  VALUES (CURDATE(), p_formaPago, p_idPaciente, p_total);

  SELECT LAST_INSERT_ID() AS idCuenta;
END$$
DELIMITER ;


