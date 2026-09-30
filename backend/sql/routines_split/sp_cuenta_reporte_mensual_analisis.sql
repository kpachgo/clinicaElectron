DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual_analisis`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_reporte_mensual_analisis`(
  IN p_anio INT,
  IN p_mes INT,
  IN p_idServicio INT,
  IN p_formaPago VARCHAR(30),
  IN p_idDoctor INT
)
BEGIN
  -- Pestana "Analisis" del reporte mensual de Cobro. Mismos filtros y mismo criterio de monto
  -- (subtotal bruto de detallecuenta, sin descuentos ni protocolo) que
  -- sp_cuenta_reporte_mensual_pacientes, para que ambas pestanas cuadren.
  -- Result sets: 1) totales del mes, 2) totales del mes anterior, 3) por dia,
  -- 4) por forma de pago, 5) por tratamiento, 6) por doctor.
  DECLARE v_ini DATE;
  DECLARE v_fin DATE;
  DECLARE v_prev_ini DATE;
  DECLARE v_formaPago VARCHAR(30);

  SET v_ini = STR_TO_DATE(CONCAT(p_anio, '-', LPAD(p_mes, 2, '0'), '-01'), '%Y-%m-%d');
  SET v_fin = DATE_ADD(v_ini, INTERVAL 1 MONTH);
  SET v_prev_ini = DATE_SUB(v_ini, INTERVAL 1 MONTH);
  SET v_formaPago = NULLIF(LOWER(TRIM(IFNULL(p_formaPago, ''))), '');

  -- 1) Totales del mes
  SELECT
    COUNT(DISTINCT c.idPaciente) AS pacientes,
    COUNT(DISTINCT c.idCuenta) AS cuentas,
    IFNULL(SUM(IFNULL(dc.cantidadDC, 0)), 0) AS cantidad,
    ROUND(IFNULL(SUM(IFNULL(dc.subTotalDC, 0)), 0), 2) AS monto
  FROM cuenta c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  WHERE c.fechaC >= v_ini AND c.fechaC < v_fin
    AND (p_idServicio IS NULL OR dc.idServicio = p_idServicio)
    AND (v_formaPago IS NULL OR LOWER(TRIM(c.FormaPagoC)) = v_formaPago)
    AND (p_idDoctor IS NULL OR dc.idDoctor = p_idDoctor);

  -- 2) Totales del mes anterior (mismos filtros)
  SELECT
    COUNT(DISTINCT c.idPaciente) AS pacientes,
    COUNT(DISTINCT c.idCuenta) AS cuentas,
    IFNULL(SUM(IFNULL(dc.cantidadDC, 0)), 0) AS cantidad,
    ROUND(IFNULL(SUM(IFNULL(dc.subTotalDC, 0)), 0), 2) AS monto
  FROM cuenta c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  WHERE c.fechaC >= v_prev_ini AND c.fechaC < v_ini
    AND (p_idServicio IS NULL OR dc.idServicio = p_idServicio)
    AND (v_formaPago IS NULL OR LOWER(TRIM(c.FormaPagoC)) = v_formaPago)
    AND (p_idDoctor IS NULL OR dc.idDoctor = p_idDoctor);

  -- 3) Por dia
  SELECT
    DAY(c.fechaC) AS dia,
    COUNT(DISTINCT c.idPaciente) AS pacientes,
    COUNT(DISTINCT c.idCuenta) AS cuentas,
    SUM(IFNULL(dc.cantidadDC, 0)) AS cantidad,
    ROUND(SUM(IFNULL(dc.subTotalDC, 0)), 2) AS monto
  FROM cuenta c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  WHERE c.fechaC >= v_ini AND c.fechaC < v_fin
    AND (p_idServicio IS NULL OR dc.idServicio = p_idServicio)
    AND (v_formaPago IS NULL OR LOWER(TRIM(c.FormaPagoC)) = v_formaPago)
    AND (p_idDoctor IS NULL OR dc.idDoctor = p_idDoctor)
  GROUP BY DAY(c.fechaC)
  ORDER BY dia ASC;

  -- 4) Por forma de pago
  SELECT
    LOWER(TRIM(IFNULL(c.FormaPagoC, ''))) AS formaPago,
    COUNT(DISTINCT c.idCuenta) AS cuentas,
    SUM(IFNULL(dc.cantidadDC, 0)) AS cantidad,
    ROUND(SUM(IFNULL(dc.subTotalDC, 0)), 2) AS monto
  FROM cuenta c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  WHERE c.fechaC >= v_ini AND c.fechaC < v_fin
    AND (p_idServicio IS NULL OR dc.idServicio = p_idServicio)
    AND (v_formaPago IS NULL OR LOWER(TRIM(c.FormaPagoC)) = v_formaPago)
    AND (p_idDoctor IS NULL OR dc.idDoctor = p_idDoctor)
  GROUP BY LOWER(TRIM(IFNULL(c.FormaPagoC, '')))
  ORDER BY monto DESC;

  -- 5) Por tratamiento
  SELECT
    dc.idServicio AS idServicio,
    IFNULL(s.nombreS, 'Sin tratamiento') AS nombre,
    COUNT(DISTINCT c.idPaciente) AS pacientes,
    SUM(IFNULL(dc.cantidadDC, 0)) AS cantidad,
    ROUND(SUM(IFNULL(dc.subTotalDC, 0)), 2) AS monto
  FROM cuenta c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  LEFT JOIN servicio s ON s.idServicio = dc.idServicio
  WHERE c.fechaC >= v_ini AND c.fechaC < v_fin
    AND (p_idServicio IS NULL OR dc.idServicio = p_idServicio)
    AND (v_formaPago IS NULL OR LOWER(TRIM(c.FormaPagoC)) = v_formaPago)
    AND (p_idDoctor IS NULL OR dc.idDoctor = p_idDoctor)
  GROUP BY dc.idServicio, s.nombreS
  ORDER BY monto DESC, cantidad DESC;

  -- 6) Por doctor (detalle sin doctor asignado = idDoctor NULL)
  SELECT
    dc.idDoctor AS idDoctor,
    IFNULL(d.nombreD, 'Sin doctor asignado') AS nombre,
    COUNT(DISTINCT c.idPaciente) AS pacientes,
    SUM(IFNULL(dc.cantidadDC, 0)) AS cantidad,
    ROUND(SUM(IFNULL(dc.subTotalDC, 0)), 2) AS monto
  FROM cuenta c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  LEFT JOIN doctor d ON d.idDoctor = dc.idDoctor
  WHERE c.fechaC >= v_ini AND c.fechaC < v_fin
    AND (p_idServicio IS NULL OR dc.idServicio = p_idServicio)
    AND (v_formaPago IS NULL OR LOWER(TRIM(c.FormaPagoC)) = v_formaPago)
    AND (p_idDoctor IS NULL OR dc.idDoctor = p_idDoctor)
  GROUP BY dc.idDoctor, d.nombreD
  ORDER BY monto DESC, cantidad DESC;
END $$
DELIMITER ;
