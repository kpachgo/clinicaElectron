-- Cuenta: filtro por doctor en reporte mensual por pacientes
-- Fecha: 2026-04-27

-- 1) Asegurar columna idDoctor en detallecuenta
SET @has_detalle_doctor := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'detallecuenta'
    AND column_name = 'idDoctor'
);
SET @sql_add_detalle_doctor := IF(
  @has_detalle_doctor = 0,
  'ALTER TABLE detallecuenta ADD COLUMN idDoctor INT NULL',
  'SELECT 1'
);
PREPARE stmt_add_detalle_doctor FROM @sql_add_detalle_doctor;
EXECUTE stmt_add_detalle_doctor;
DEALLOCATE PREPARE stmt_add_detalle_doctor;

-- 2) Asegurar indice para filtro por doctor
SET @has_detalle_doctor_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'detallecuenta'
    AND index_name = 'idx_detallecuenta_idDoctor'
);
SET @sql_add_detalle_doctor_idx := IF(
  @has_detalle_doctor_idx = 0,
  'CREATE INDEX idx_detallecuenta_idDoctor ON detallecuenta(idDoctor)',
  'SELECT 1'
);
PREPARE stmt_add_detalle_doctor_idx FROM @sql_add_detalle_doctor_idx;
EXECUTE stmt_add_detalle_doctor_idx;
DEALLOCATE PREPARE stmt_add_detalle_doctor_idx;

DROP PROCEDURE IF EXISTS sp_cuenta_reporte_mensual_pacientes;

DELIMITER $$

CREATE PROCEDURE sp_cuenta_reporte_mensual_pacientes(
  IN p_anio INT,
  IN p_mes INT,
  IN p_idServicio INT,
  IN p_formaPago VARCHAR(30),
  IN p_idDoctor INT
)
BEGIN
  DECLARE v_colCantidad VARCHAR(32);
  DECLARE v_colPrecio VARCHAR(32);
  DECLARE v_colSubtotal VARCHAR(32);
  DECLARE v_colCuentaFk VARCHAR(32);
  DECLARE v_exprMonto LONGTEXT;
  DECLARE v_sql LONGTEXT;

  SET v_colCantidad = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'cantidadDC'
      ) THEN 'cantidadDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'cantidad'
      ) THEN 'cantidad'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'cantidadD'
      ) THEN 'cantidadD'
      ELSE NULL
    END
  );

  SET v_colPrecio = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'precioUnitarioDC'
      ) THEN 'precioUnitarioDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'precio'
      ) THEN 'precio'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'precioD'
      ) THEN 'precioD'
      ELSE NULL
    END
  );

  SET v_colSubtotal = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subTotalDC'
      ) THEN 'subTotalDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subtotalDC'
      ) THEN 'subtotalDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subTotal'
      ) THEN 'subTotal'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subtotal'
      ) THEN 'subtotal'
      ELSE NULL
    END
  );

  SET v_colCuentaFk = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'idCuenta'
      ) THEN 'idCuenta'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'idC'
      ) THEN 'idC'
      ELSE NULL
    END
  );

  IF v_colCantidad IS NULL
     OR (v_colSubtotal IS NULL AND v_colPrecio IS NULL)
     OR v_colCuentaFk IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se encontraron columnas requeridas en detallecuenta';
  END IF;

  SET v_exprMonto = IF(
    v_colSubtotal IS NOT NULL,
    CONCAT('IFNULL(dc.`', v_colSubtotal, '`, 0)'),
    CONCAT('IFNULL(dc.`', v_colCantidad, '`, 0) * IFNULL(dc.`', v_colPrecio, '`, 0)')
  );

  SET @p_anio_rm = p_anio;
  SET @p_mes_rm = p_mes;
  SET @p_idServicio_rm = p_idServicio;
  SET @p_formaPago_rm = p_formaPago;
  SET @p_idDoctor_rm = p_idDoctor;

  SET v_sql = CONCAT(
    'SELECT ',
    'p.idPaciente AS idPaciente, ',
    'p.NombreP AS nombrePaciente, ',
    'SUM(IFNULL(dc.`', v_colCantidad, '`, 0)) AS cantidadPaciente, ',
    'ROUND(SUM(', v_exprMonto, '), 2) AS montoPaciente ',
    'FROM cuenta c ',
    'INNER JOIN paciente p ON p.idPaciente = c.idPaciente ',
    'INNER JOIN detallecuenta dc ON dc.`', v_colCuentaFk, '` = c.idCuenta ',
    'WHERE YEAR(c.fechaC) = ? ',
    'AND MONTH(c.fechaC) = ? ',
    'AND (? IS NULL OR dc.idServicio = ?) ',
    'AND (? IS NULL OR TRIM(?) = '''' OR LOWER(TRIM(c.FormaPagoC)) = LOWER(TRIM(?))) ',
    'AND (? IS NULL OR dc.idDoctor = ?) ',
    'GROUP BY p.idPaciente, p.NombreP ',
    'ORDER BY montoPaciente DESC, cantidadPaciente DESC, p.NombreP ASC'
  );

  SET @v_sql_rm = v_sql;
  PREPARE stmt_reporte_mensual_pacientes FROM @v_sql_rm;
  EXECUTE stmt_reporte_mensual_pacientes USING
    @p_anio_rm,
    @p_mes_rm,
    @p_idServicio_rm,
    @p_idServicio_rm,
    @p_formaPago_rm,
    @p_formaPago_rm,
    @p_formaPago_rm,
    @p_idDoctor_rm,
    @p_idDoctor_rm;
  DEALLOCATE PREPARE stmt_reporte_mensual_pacientes;
END $$

DELIMITER ;
