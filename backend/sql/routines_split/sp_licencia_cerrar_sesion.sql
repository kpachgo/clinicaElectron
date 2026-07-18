DROP PROCEDURE IF EXISTS `sp_licencia_cerrar_sesion`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_cerrar_sesion`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_device_id VARCHAR(128)
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_rows INT DEFAULT 0;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_device = TRIM(IFNULL(p_device_id, ''));

  SELECT id_licencia
  INTO v_id_licencia
  FROM licencias
  WHERE BINARY codigo_licencia = BINARY v_codigo
  LIMIT 1;

  IF v_id_licencia IS NOT NULL AND v_device <> '' THEN
    UPDATE licencia_sesiones
    SET activa = 0, fin_sesion = NOW(), observacion = 'cierre_servidor'
    WHERE id_licencia = v_id_licencia
      AND fecha_sesion = CURDATE()
      AND BINARY device_id = BINARY v_device
      AND activa = 1;

    SET v_rows = ROW_COUNT();
  END IF;

  SELECT
    1 AS ok,
    'sesion_cerrada' AS code,
    CONCAT('Filas actualizadas: ', v_rows) AS message,
    v_rows AS filas_afectadas;
END $$
DELIMITER ;
