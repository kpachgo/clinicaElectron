DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual_pacientes`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_reporte_mensual_pacientes`(
  IN p_anio SMALLINT,
  IN p_mes TINYINT,
  IN p_idServicio INT
)
BEGIN
  SELECT
    p.idPaciente,
    p.NombreP AS nombrePaciente,
    SUM(dc.cantidadDC) AS cantidadPaciente,
    ROUND(SUM(dc.subTotalDC), 2) AS montoPaciente
  FROM cuenta c
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  WHERE YEAR(c.fechaC) = p_anio
    AND MONTH(c.fechaC) = p_mes
    AND dc.idServicio = p_idServicio
  GROUP BY p.idPaciente, p.NombreP
  ORDER BY p.NombreP ASC;
END$$
DELIMITER ;

