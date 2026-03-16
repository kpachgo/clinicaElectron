DROP PROCEDURE IF EXISTS `sp_cuenta_listar_por_fecha`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_listar_por_fecha`(
    IN p_fecha DATE
)
BEGIN
    DECLARE v_hasDoctorCol INT DEFAULT 0;

    SELECT COUNT(*)
      INTO v_hasDoctorCol
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detallecuenta'
      AND COLUMN_NAME = 'idDoctor';

    IF v_hasDoctorCol > 0 THEN
      SELECT
          c.idCuenta,
          p.NombreP AS nombrePaciente,
          c.fechaC,
          c.totalC,
          c.FormaPagoC,
          SUM(dc.cantidadDC) AS cantidadTotal,
          GROUP_CONCAT(s.nombreS SEPARATOR ' + ') AS procedimientos,
          CASE
            WHEN COUNT(DISTINCT IFNULL(dc.idDoctor, -1)) > 1 THEN NULL
            ELSE MAX(dc.idDoctor)
          END AS idDoctorCuenta,
          CASE
            WHEN COUNT(DISTINCT IFNULL(dc.idDoctor, -1)) > 1 THEN NULL
            ELSE MAX(d.nombreD)
          END AS nombreDoctorCuenta,
          CASE
            WHEN COUNT(DISTINCT IFNULL(dc.idDoctor, -1)) > 1 THEN 1
            ELSE 0
          END AS doctorMixto
      FROM cuenta c
      INNER JOIN paciente p ON p.idPaciente = c.idPaciente
      INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
      INNER JOIN servicio s ON s.idServicio = dc.idServicio
      LEFT JOIN doctor d ON d.idDoctor = dc.idDoctor
      WHERE c.fechaC = p_fecha
      GROUP BY c.idCuenta
      ORDER BY c.idCuenta DESC;
    ELSE
      SELECT
          c.idCuenta,
          p.NombreP AS nombrePaciente,
          c.fechaC,
          c.totalC,
          c.FormaPagoC,
          SUM(dc.cantidadDC) AS cantidadTotal,
          GROUP_CONCAT(s.nombreS SEPARATOR ' + ') AS procedimientos,
          NULL AS idDoctorCuenta,
          NULL AS nombreDoctorCuenta,
          0 AS doctorMixto
      FROM cuenta c
      INNER JOIN paciente p ON p.idPaciente = c.idPaciente
      INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
      INNER JOIN servicio s ON s.idServicio = dc.idServicio
      WHERE c.fechaC = p_fecha
      GROUP BY c.idCuenta
      ORDER BY c.idCuenta DESC;
    END IF;
END$$
DELIMITER ;


