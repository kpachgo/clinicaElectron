DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_reporte_mensual`(
  IN p_anio SMALLINT,
  IN p_mes TINYINT,
  IN p_idServicio INT
)
BEGIN
  SELECT
    s.idServicio,
    s.nombreS AS tratamiento,
    SUM(dc.cantidadDC) AS cantidadTotalMes,
    ROUND(SUM(dc.subTotalDC), 2) AS montoTotalMes
  FROM cuenta c
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  INNER JOIN servicio s ON s.idServicio = dc.idServicio
  WHERE YEAR(c.fechaC) = p_anio
    AND MONTH(c.fechaC) = p_mes
    AND (p_idServicio IS NULL OR p_idServicio = 0 OR dc.idServicio = p_idServicio)
  GROUP BY s.idServicio, s.nombreS
  ORDER BY s.nombreS ASC;
END$$
DELIMITER ;

