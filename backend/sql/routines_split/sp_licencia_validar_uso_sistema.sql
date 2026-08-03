DROP PROCEDURE IF EXISTS `sp_licencia_validar_uso_sistema`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_validar_uso_sistema`(
  IN p_codigo_licencia VARCHAR(64)
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_warning_window_days INT DEFAULT 3;
  DECLARE v_tolerancia_horas INT DEFAULT 23;

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_suscripcion_habilitada TINYINT;
  DECLARE v_fecha_vencimiento DATETIME;
  DECLARE v_ultima_fecha_confiable DATETIME DEFAULT NULL;
  DECLARE v_dias_restantes INT DEFAULT NULL;
  DECLARE v_proxima_a_vencer TINYINT DEFAULT 0;
  DECLARE v_mensaje_aviso VARCHAR(255) DEFAULT NULL;

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Uso del sistema autorizado';

  SET v_now = NOW();
  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));

  IF v_codigo = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia requerido' AS message,
      NULL AS id_licencia,
      NULL AS estadoSuscripcion,
      NULL AS suscripcionHabilitada,
      NULL AS fechaVencimiento,
      NULL AS diasRestantes,
      0 AS proximaAVencer,
      v_warning_window_days AS warningWindowDays,
      NULL AS mensajeAviso;
  ELSE
    SELECT
      l.id_licencia,
      l.estado_suscripcion,
      l.suscripcion_habilitada,
      l.fecha_vencimiento
    INTO
      v_id_licencia,
      v_estado_suscripcion,
      v_suscripcion_habilitada,
      v_fecha_vencimiento
    FROM licencias l
    WHERE BINARY l.codigo_licencia = BINARY v_codigo
    LIMIT 1;

    IF v_id_licencia IS NOT NULL THEN
      SELECT MAX(fecha_valor)
      INTO v_ultima_fecha_confiable
      FROM (
        SELECT l.ultima_validacion AS fecha_valor
        FROM licencias l
        WHERE l.id_licencia = v_id_licencia
        UNION ALL
        SELECT MAX(s.inicio_sesion) AS fecha_valor
        FROM licencia_sesiones s
        WHERE s.id_licencia = v_id_licencia
        UNION ALL
        SELECT MAX(s.fin_sesion) AS fecha_valor
        FROM licencia_sesiones s
        WHERE s.id_licencia = v_id_licencia
        UNION ALL
        SELECT MAX(s.creado_en) AS fecha_valor
        FROM licencia_sesiones s
        WHERE s.id_licencia = v_id_licencia
        UNION ALL
        SELECT MAX(s.actualizado_en) AS fecha_valor
        FROM licencia_sesiones s
        WHERE s.id_licencia = v_id_licencia
      ) fechas
      WHERE fecha_valor IS NOT NULL;
    END IF;

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
    ELSEIF v_ultima_fecha_confiable IS NOT NULL
      AND v_now < DATE_SUB(v_ultima_fecha_confiable, INTERVAL v_tolerancia_horas HOUR) THEN
      SET v_ok = 0; SET v_code = 'fecha_sistema_retrocedida'; SET v_message = 'La fecha del sistema/servidor fue retrocedida. Actualice la fecha para continuar.';
    ELSEIF BINARY v_estado_suscripcion <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'suscripcion_inactiva'; SET v_message = 'La suscripcion no esta activa';
    ELSEIF IFNULL(v_suscripcion_habilitada, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'suscripcion_deshabilitada'; SET v_message = 'La suscripcion no esta habilitada';
    ELSEIF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < v_now THEN
      SET v_ok = 0; SET v_code = 'suscripcion_vencida'; SET v_message = 'La suscripcion esta vencida';
    END IF;

    IF v_fecha_vencimiento IS NOT NULL THEN
      SET v_dias_restantes = DATEDIFF(v_fecha_vencimiento, v_now);
    END IF;

    IF BINARY v_estado_suscripcion = BINARY 'activa'
      AND IFNULL(v_suscripcion_habilitada, 0) = 1
      AND v_fecha_vencimiento IS NOT NULL
      AND v_dias_restantes IS NOT NULL
      AND v_dias_restantes >= 0
      AND v_dias_restantes <= v_warning_window_days THEN
      SET v_proxima_a_vencer = 1;

      IF v_dias_restantes = 0 THEN
        SET v_mensaje_aviso = CONCAT(
          'Su suscripcion vence hoy (',
          DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s'),
          ').'
        );
      ELSEIF v_dias_restantes = 1 THEN
        SET v_mensaje_aviso = CONCAT(
          'Su suscripcion vence en 1 dia (',
          DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s'),
          ').'
        );
      ELSE
        SET v_mensaje_aviso = CONCAT(
          'Su suscripcion vence en ',
          v_dias_restantes,
          ' dias (',
          DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s'),
          ').'
        );
      END IF;
    END IF;

    SELECT
      v_ok AS ok,
      v_code AS code,
      v_message AS message,
      v_id_licencia AS id_licencia,
      v_estado_suscripcion AS estadoSuscripcion,
      IFNULL(v_suscripcion_habilitada, 0) AS suscripcionHabilitada,
      IF(v_fecha_vencimiento IS NULL, NULL, DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s')) AS fechaVencimiento,
      v_dias_restantes AS diasRestantes,
      v_proxima_a_vencer AS proximaAVencer,
      v_warning_window_days AS warningWindowDays,
      v_mensaje_aviso AS mensajeAviso;
  END IF;
END $$
DELIMITER ;
