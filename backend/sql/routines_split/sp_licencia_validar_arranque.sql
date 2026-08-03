DROP PROCEDURE IF EXISTS `sp_licencia_validar_arranque`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_validar_arranque`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_device_id VARCHAR(128),
  IN p_offline_dias INT
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_offline_dias INT DEFAULT 7;
  DECLARE v_tolerancia_horas INT DEFAULT 23;

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Arranque autorizado';

  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT;
  DECLARE v_device_id_db VARCHAR(128);
  DECLARE v_ultima_fecha_confiable DATETIME DEFAULT NULL;

  DECLARE v_conflicto_sesion INT DEFAULT 0;
  DECLARE v_sesion_propia_hoy INT DEFAULT 0;
  DECLARE v_primera_sesion_hoy TINYINT DEFAULT 0;

  SET v_now = NOW();
  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_device = TRIM(IFNULL(p_device_id, ''));
  SET v_offline_dias = IFNULL(p_offline_dias, 7);
  IF v_offline_dias < 1 THEN SET v_offline_dias = 7; END IF;

  IF v_codigo = '' OR v_device = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia y device_id son requeridos' AS message,
      NULL AS id_licencia,
      NULL AS offline_hasta,
      0 AS primera_sesion_hoy;
  ELSE
    START TRANSACTION;

    SELECT
      l.id_licencia,
      l.estado_licencia,
      l.servidor_habilitado,
      l.device_id
    INTO
      v_id_licencia,
      v_estado_licencia,
      v_servidor_habilitado,
      v_device_id_db
    FROM licencias l
    WHERE BINARY l.codigo_licencia = BINARY v_codigo
    LIMIT 1
    FOR UPDATE;

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
    ELSEIF BINARY v_estado_licencia <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'licencia_inactiva'; SET v_message = 'La licencia no esta activa';
    ELSEIF IFNULL(v_servidor_habilitado, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'servidor_deshabilitado'; SET v_message = 'El servidor no esta habilitado para esta licencia';
    ELSEIF IFNULL(TRIM(v_device_id_db), '') = '' THEN
      SET v_ok = 0; SET v_code = 'device_no_asignado'; SET v_message = 'La licencia no esta activada en ningun equipo';
    ELSEIF BINARY v_device_id_db <> BINARY v_device THEN
      SET v_ok = 0; SET v_code = 'device_no_autorizado'; SET v_message = 'Este equipo no coincide con el device_id autorizado';
    END IF;

    IF v_ok = 1 THEN
      SELECT COUNT(*)
      INTO v_conflicto_sesion
      FROM licencia_sesiones s
      WHERE s.id_licencia = v_id_licencia
        AND s.fecha_sesion = CURDATE()
        AND s.activa = 1
        AND BINARY s.device_id <> BINARY v_device;

      IF v_conflicto_sesion > 0 THEN
        SET v_ok = 0; SET v_code = 'sesion_conflicto_otro_equipo'; SET v_message = 'Ya existe una sesion activa hoy con otro equipo';
      END IF;
    END IF;

    IF v_ok = 1 THEN
      UPDATE licencias
      SET
        ultima_validacion = v_now,
        offline_hasta = DATE_ADD(v_now, INTERVAL v_offline_dias DAY)
      WHERE id_licencia = v_id_licencia;

      SELECT COUNT(*)
      INTO v_sesion_propia_hoy
      FROM licencia_sesiones s
      WHERE s.id_licencia = v_id_licencia
        AND s.fecha_sesion = CURDATE()
        AND BINARY s.device_id = BINARY v_device;

      IF v_sesion_propia_hoy = 0 THEN
        SET v_primera_sesion_hoy = 1;
        INSERT INTO licencia_sesiones (
          id_licencia, codigo_licencia, fecha_sesion, device_id, activa, inicio_sesion, origen_validacion, observacion
        ) VALUES (
          v_id_licencia, v_codigo, CURDATE(), v_device, 1, v_now, 'online', 'primera_sesion_dia'
        );
      ELSE
        SET v_primera_sesion_hoy = 0;
        UPDATE licencia_sesiones
        SET activa = 1, fin_sesion = NULL, observacion = 'rearranque_mismo_dia'
        WHERE id_licencia = v_id_licencia
          AND fecha_sesion = CURDATE()
          AND BINARY device_id = BINARY v_device;
      END IF;

      COMMIT;
    ELSE
      ROLLBACK;
    END IF;

    SELECT
      v_ok AS ok,
      v_code AS code,
      v_message AS message,
      v_id_licencia AS id_licencia,
      (SELECT offline_hasta FROM licencias WHERE id_licencia = v_id_licencia LIMIT 1) AS offline_hasta,
      v_primera_sesion_hoy AS primera_sesion_hoy;
  END IF;
END $$
DELIMITER ;
