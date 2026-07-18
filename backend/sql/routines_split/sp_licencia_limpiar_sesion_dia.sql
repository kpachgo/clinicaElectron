DROP PROCEDURE IF EXISTS `sp_licencia_limpiar_sesion_dia`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_limpiar_sesion_dia`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_fecha DATE
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_fecha_objetivo DATE;
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_rows INT DEFAULT 0;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_fecha_objetivo = IFNULL(p_fecha, CURDATE());

  SELECT id_licencia
  INTO v_id_licencia
  FROM licencias
  WHERE BINARY codigo_licencia = BINARY v_codigo
  LIMIT 1;

  IF v_id_licencia IS NOT NULL THEN
    UPDATE licencia_sesiones
    SET activa = 0, fin_sesion = NOW(), observacion = 'limpieza_manual'
    WHERE id_licencia = v_id_licencia
      AND fecha_sesion = v_fecha_objetivo
      AND activa = 1;

    SET v_rows = ROW_COUNT();
  END IF;

  SELECT
    1 AS ok,
    'limpieza_sesion_aplicada' AS code,
    CONCAT('Filas actualizadas: ', v_rows) AS message,
    v_rows AS filas_afectadas;
END $$
DELIMITER ;
