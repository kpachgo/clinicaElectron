SET @exists_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'detallecuenta'
    AND COLUMN_NAME = 'idDoctor'
);

SET @sql_col := IF(
  @exists_col = 0,
  'ALTER TABLE detallecuenta ADD COLUMN idDoctor INT NULL AFTER idServicio',
  'SELECT "idDoctor ya existe en detallecuenta"'
);

PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

SET @exists_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'detallecuenta'
    AND INDEX_NAME = 'idx_detallecuenta_doctor'
);

SET @sql_idx := IF(
  @exists_idx = 0,
  'CREATE INDEX idx_detallecuenta_doctor ON detallecuenta (idDoctor)',
  'SELECT "idx_detallecuenta_doctor ya existe"'
);

PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

