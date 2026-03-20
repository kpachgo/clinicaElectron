DROP PROCEDURE IF EXISTS `sp_licencia_renovar_suscripcion`;
DELIMITER $$

CREATE PROCEDURE `sp_licencia_renovar_suscripcion`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_nueva_fecha_vencimiento DATETIME,
  IN p_fecha_inicio DATETIME
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_fecha_inicio_aplicar DATETIME;
  DECLARE v_fecha_inicio_actual DATETIME;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));

  IF v_codigo = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia requerido' AS message,
      NULL AS id_licencia,
      NULL AS fechaVencimiento;
  ELSEIF p_nueva_fecha_vencimiento IS NULL THEN
    SELECT
      0 AS ok,
      'fecha_vencimiento_requerida' AS code,
      'Debe enviar la nueva fecha de vencimiento' AS message,
      NULL AS id_licencia,
      NULL AS fechaVencimiento;
  ELSE
    SELECT id_licencia, fecha_inicio
    INTO v_id_licencia, v_fecha_inicio_actual
    FROM licencias
    WHERE BINARY codigo_licencia = BINARY v_codigo
    LIMIT 1;

    IF v_id_licencia IS NULL THEN
      SELECT
        0 AS ok,
        'licencia_no_encontrada' AS code,
        'La licencia no existe' AS message,
        NULL AS id_licencia,
        NULL AS fechaVencimiento;
    ELSE
      SET v_fecha_inicio_aplicar = IFNULL(p_fecha_inicio, IFNULL(v_fecha_inicio_actual, NOW()));

      IF p_nueva_fecha_vencimiento < v_fecha_inicio_aplicar THEN
        SELECT
          0 AS ok,
          'rango_fechas_invalido' AS code,
          'fecha_vencimiento no puede ser menor que fecha_inicio' AS message,
          v_id_licencia AS id_licencia,
          NULL AS fechaVencimiento;
      ELSE
        UPDATE licencias
        SET
          estado_suscripcion = 'activa',
          suscripcion_habilitada = 1,
          fecha_inicio = v_fecha_inicio_aplicar,
          fecha_vencimiento = p_nueva_fecha_vencimiento
        WHERE id_licencia = v_id_licencia;

        SELECT
          1 AS ok,
          'suscripcion_renovada' AS code,
          'Suscripcion renovada correctamente' AS message,
          v_id_licencia AS id_licencia,
          DATE_FORMAT(p_nueva_fecha_vencimiento, '%Y-%m-%d %H:%i:%s') AS fechaVencimiento;
      END IF;
    END IF;
  END IF;
END$$
DELIMITER ;

