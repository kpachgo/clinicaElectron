SET @exists_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cola_paciente'
    AND COLUMN_NAME = 'doctorId'
);

SET @sql_col := IF(
  @exists_col = 0,
  'ALTER TABLE cola_paciente ADD COLUMN doctorId INT NULL AFTER agendaId',
  'SELECT "doctorId ya existe"'
);

PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

SET @exists_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cola_paciente'
    AND INDEX_NAME = 'idx_cola_doctor_estado'
);

SET @sql_idx := IF(
  @exists_idx = 0,
  'CREATE INDEX idx_cola_doctor_estado ON cola_paciente (doctorId, estado)',
  'SELECT "idx_cola_doctor_estado ya existe"'
);

PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
