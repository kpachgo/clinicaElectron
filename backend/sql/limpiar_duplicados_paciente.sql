-- =========================================================
-- LIMPIAR DUPLICADOS DE PACIENTE (SEGURO CON RESPALDO)
-- Criterio: NombreP + telefonoP normalizados
-- Mantiene: idPaciente mas pequeno (el mas antiguo)
-- =========================================================

-- 1) VISTA PREVIA: grupos duplicados
SELECT
  LOWER(TRIM(NombreP)) AS nombre_norm,
  REPLACE(REPLACE(REPLACE(IFNULL(telefonoP, ''), ' ', ''), '-', ''), '.', '') AS telefono_norm,
  COUNT(*) AS total_registros,
  GROUP_CONCAT(idPaciente ORDER BY idPaciente) AS ids
FROM paciente
WHERE TRIM(IFNULL(NombreP, '')) <> ''
  AND TRIM(IFNULL(telefonoP, '')) <> ''
GROUP BY nombre_norm, telefono_norm
HAVING COUNT(*) > 1
ORDER BY total_registros DESC, nombre_norm;

-- 2) EJECUTAR BORRADO CON RESPALDO
START TRANSACTION;

-- Tabla temporal con los grupos duplicados y el id a conservar
DROP TEMPORARY TABLE IF EXISTS tmp_paciente_dup;
CREATE TEMPORARY TABLE tmp_paciente_dup AS
SELECT
  LOWER(TRIM(NombreP)) AS nombre_norm,
  REPLACE(REPLACE(REPLACE(IFNULL(telefonoP, ''), ' ', ''), '-', ''), '.', '') AS telefono_norm,
  MIN(idPaciente) AS keep_id,
  COUNT(*) AS total_registros
FROM paciente
WHERE TRIM(IFNULL(NombreP, '')) <> ''
  AND TRIM(IFNULL(telefonoP, '')) <> ''
GROUP BY nombre_norm, telefono_norm
HAVING COUNT(*) > 1;

-- Si quieres abortar antes de borrar, revisa este resultado y luego usa ROLLBACK;
SELECT * FROM tmp_paciente_dup ORDER BY total_registros DESC, keep_id;

-- Mapeo exacto de registros a eliminar -> id a conservar
DROP TEMPORARY TABLE IF EXISTS tmp_paciente_to_delete;
CREATE TEMPORARY TABLE tmp_paciente_to_delete AS
SELECT
  p.idPaciente AS delete_id,
  d.keep_id
FROM paciente p
INNER JOIN tmp_paciente_dup d
  ON LOWER(TRIM(p.NombreP)) = d.nombre_norm
 AND REPLACE(REPLACE(REPLACE(IFNULL(p.telefonoP, ''), ' ', ''), '-', ''), '.', '') = d.telefono_norm
WHERE p.idPaciente <> d.keep_id;

-- Preview de los candidatos a borrar
SELECT * FROM tmp_paciente_to_delete ORDER BY keep_id, delete_id;

-- Tabla de respaldo (persistente)
CREATE TABLE IF NOT EXISTS paciente_duplicados_backup AS
SELECT * FROM paciente WHERE 1 = 0;

-- Guardar en respaldo SOLO los registros que se van a borrar
INSERT INTO paciente_duplicados_backup
SELECT p.*
FROM paciente p
INNER JOIN tmp_paciente_to_delete t
  ON p.idPaciente = t.delete_id;

-- Reasignar referencias en tablas hijas antes de borrar
-- (evita error FK 1451: Cannot delete or update a parent row)
UPDATE citaspaciente c
INNER JOIN tmp_paciente_to_delete t ON c.idPaciente = t.delete_id
SET c.idPaciente = t.keep_id;

UPDATE cuenta c
INNER JOIN tmp_paciente_to_delete t ON c.idPaciente = t.delete_id
SET c.idPaciente = t.keep_id;

UPDATE fotopaciente f
INNER JOIN tmp_paciente_to_delete t ON f.pacienteId = t.delete_id
SET f.pacienteId = t.keep_id;

UPDATE odontograma o
INNER JOIN tmp_paciente_to_delete t ON o.idPaciente = t.delete_id
SET o.idPaciente = t.keep_id;

-- Borrar duplicados por id (mas compatible entre clientes SQL)
DELETE FROM paciente
WHERE idPaciente IN (SELECT delete_id FROM tmp_paciente_to_delete);

-- Resumen
SELECT ROW_COUNT() AS filas_eliminadas;
SELECT COUNT(*) AS filas_respaldadas FROM paciente_duplicados_backup;

COMMIT;

-- =========================================================
-- OPCIONAL: SOLO BUSQUEDA de posibles duplicados por telefono
-- (NO BORRA NADA)
-- =========================================================
-- SELECT
--   REPLACE(REPLACE(REPLACE(IFNULL(telefonoP, ''), ' ', ''), '-', ''), '.', '') AS telefono_norm,
--   COUNT(*) AS total_registros,
--   GROUP_CONCAT(CONCAT(idPaciente, ':', NombreP) ORDER BY idPaciente SEPARATOR ' | ') AS detalle
-- FROM paciente
-- WHERE TRIM(IFNULL(telefonoP, '')) <> ''
-- GROUP BY telefono_norm
-- HAVING COUNT(*) > 1
-- ORDER BY total_registros DESC;
