DROP PROCEDURE IF EXISTS `sp_licencia_resolver_por_device`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_resolver_por_device`(
  IN p_device_id VARCHAR(128)
)
BEGIN
  DECLARE v_device VARCHAR(128);
  DECLARE v_total INT DEFAULT 0;
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_codigo_licencia VARCHAR(64);

  SET v_device = TRIM(IFNULL(p_device_id, ''));

  IF v_device = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'device_id requerido' AS message,
      NULL AS id_licencia,
      NULL AS codigo_licencia;
  ELSE
    SELECT COUNT(*)
    INTO v_total
    FROM licencias l
    WHERE IFNULL(TRIM(l.device_id), '') <> ''
      AND BINARY l.device_id = BINARY v_device;

    IF v_total = 0 THEN
      SELECT
        0 AS ok,
        'device_sin_licencia' AS code,
        'Este equipo no tiene licencia asignada' AS message,
        NULL AS id_licencia,
        NULL AS codigo_licencia;
    ELSEIF v_total > 1 THEN
      SELECT
        0 AS ok,
        'device_licencia_conflicto_multiples' AS code,
        'Conflicto: el device_id esta asignado a multiples licencias' AS message,
        NULL AS id_licencia,
        NULL AS codigo_licencia;
    ELSE
      SELECT
        l.id_licencia,
        l.codigo_licencia
      INTO
        v_id_licencia,
        v_codigo_licencia
      FROM licencias l
      WHERE BINARY l.device_id = BINARY v_device
      LIMIT 1;

      SELECT
        1 AS ok,
        'ok' AS code,
        'Licencia resuelta por device_id' AS message,
        v_id_licencia AS id_licencia,
        v_codigo_licencia AS codigo_licencia;
    END IF;
  END IF;
END $$
DELIMITER ;
