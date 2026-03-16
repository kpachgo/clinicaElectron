DROP PROCEDURE IF EXISTS `sp_cuenta_listar_por_fecha`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_listar_por_fecha`(
    IN p_fecha DATE
)
BEGIN
    SELECT
        c.idCuenta,
        p.NombreP AS nombrePaciente,
        c.fechaC,
        c.totalC,
        c.FormaPagoC,
        SUM(dc.cantidadDC) AS cantidadTotal,
        GROUP_CONCAT(s.nombreS SEPARATOR ' + ') AS procedimientos
    FROM cuenta c
    INNER JOIN paciente p ON p.idPaciente = c.idPaciente
    INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
    INNER JOIN servicio s ON s.idServicio = dc.idServicio
    WHERE c.fechaC = p_fecha
    GROUP BY c.idCuenta
    ORDER BY c.idCuenta DESC;
END$$
DELIMITER ;


