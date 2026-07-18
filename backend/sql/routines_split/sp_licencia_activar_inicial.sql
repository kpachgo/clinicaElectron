DROP PROCEDURE IF EXISTS `sp_licencia_activar_inicial`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_activar_inicial`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_device_id VARCHAR(128),
  IN p_offline_dias INT
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_offline_dias INT DEFAULT 7;

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Licencia activada correctamente';

  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT;
  DECLARE v_suscripcion_habilitada TINYINT;
  DECLARE v_fecha_vencimiento DATETIME;
  DECLARE v_device_id_db VARCHAR(128);
  DECLARE v_conflicto_sesion INT DEFAULT 0;

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
      NULL AS offline_hasta;
  ELSE
    START TRANSACTION;

    SELECT
      l.id_licencia,
      l.estado_licencia,
      l.estado_suscripcion,
      l.servidor_habilitado,
      l.suscripcion_habilitada,
      l.fecha_vencimiento,
      l.device_id
    INTO
      v_id_licencia,
      v_estado_licencia,
      v_estado_suscripcion,
      v_servidor_habilitado,
      v_suscripcion_habilitada,
      v_fecha_vencimiento,
      v_device_id_db
    FROM licencias l
    WHERE BINARY l.codigo_licencia = BINARY v_codigo
    LIMIT 1
    FOR UPDATE;

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
    ELSEIF BINARY v_estado_licencia <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'licencia_inactiva'; SET v_message = 'La licencia no esta activa';
    ELSEIF IFNULL(v_servidor_habilitado, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'servidor_deshabilitado'; SET v_message = 'El servidor no esta habilitado para esta licencia';
    ELSEIF BINARY v_estado_suscripcion <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'suscripcion_inactiva'; SET v_message = 'La suscripcion no esta activa';
    ELSEIF IFNULL(v_suscripcion_habilitada, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'suscripcion_deshabilitada'; SET v_message = 'La suscripcion no esta habilitada';
    ELSEIF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < v_now THEN
      SET v_ok = 0; SET v_code = 'suscripcion_vencida'; SET v_message = 'La suscripcion esta vencida';
    ELSEIF IFNULL(TRIM(v_device_id_db), '') <> '' THEN
      SET v_ok = 0; SET v_code = 'device_ya_asignado'; SET v_message = 'La licencia ya esta asociada a otro equipo';
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
        device_id = v_device,
        ultima_validacion = v_now,
        offline_hasta = DATE_ADD(v_now, INTERVAL v_offline_dias DAY)
      WHERE id_licencia = v_id_licencia;

      INSERT IGNORE INTO licencia_sesiones (
        id_licencia, codigo_licencia, fecha_sesion, device_id, activa, inicio_sesion, origen_validacion, observacion
      ) VALUES (
        v_id_licencia, v_codigo, CURDATE(), v_device, 1, v_now, 'online', 'activacion_inicial'
      );

      UPDATE licencia_sesiones
      SET activa = 1, fin_sesion = NULL, origen_validacion = 'online', observacion = 'activacion_inicial'
      WHERE id_licencia = v_id_licencia
        AND fecha_sesion = CURDATE()
        AND BINARY device_id = BINARY v_device;

      COMMIT;
    ELSE
      ROLLBACK;
    END IF;

    SELECT
      v_ok AS ok,
      v_code AS code,
      v_message AS message,
      v_id_licencia AS id_licencia,
      (SELECT offline_hasta FROM licencias WHERE id_licencia = v_id_licencia LIMIT 1) AS offline_hasta;
  END IF;
END $$
DELIMITER ;
