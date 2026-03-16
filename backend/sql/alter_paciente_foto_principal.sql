USE clinica;

SET @db := DATABASE();

-- Agregar columna paciente.fotoPrincipalId si no existe
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'paciente'
    AND COLUMN_NAME = 'fotoPrincipalId'
);

SET @sql_col := IF(
  @col_exists = 0,
  'ALTER TABLE paciente ADD COLUMN fotoPrincipalId INT NULL AFTER medTrabajoP',
  'SELECT 1'
);
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

-- Agregar indice si no existe
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'paciente'
    AND INDEX_NAME = 'idx_paciente_foto_principal'
);

SET @sql_idx := IF(
  @idx_exists = 0,
  'ALTER TABLE paciente ADD INDEX idx_paciente_foto_principal (fotoPrincipalId)',
  'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
