-- =========================================================
-- LICENCIAMIENTO - TABLAS Y STORED PROCEDURES
-- Fase actual:
-- - Fuente de verdad: BD remota (Railway)
-- - Sin fallback offline implementado en backend por ahora
-- =========================================================

-- =========================================================
-- TABLAS
-- =========================================================
CREATE TABLE IF NOT EXISTS licencias (
  id_licencia BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_licencia VARCHAR(64) NOT NULL,
  cliente_nombre VARCHAR(120) NOT NULL,

  estado_licencia ENUM('activa','inactiva','suspendida','cancelada') NOT NULL DEFAULT 'activa',
  estado_suscripcion ENUM('activa','inactiva','vencida','suspendida','cancelada') NOT NULL DEFAULT 'activa',

  servidor_habilitado TINYINT(1) NOT NULL DEFAULT 1,
  suscripcion_habilitada TINYINT(1) NOT NULL DEFAULT 1,

  fecha_inicio DATETIME NULL,
  fecha_vencimiento DATETIME NULL,

  device_id VARCHAR(128) NULL,
  ultima_validacion DATETIME NULL,
  offline_hasta DATETIME NULL,

  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_licencias_codigo (codigo_licencia),
  KEY idx_licencias_estado_srv (estado_licencia, servidor_habilitado),
  KEY idx_licencias_estado_sub (estado_suscripcion, suscripcion_habilitada),
  KEY idx_licencias_device (device_id),
  KEY idx_licencias_venc (fecha_vencimiento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS licencia_sesiones (
  id_sesion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_licencia BIGINT UNSIGNED NOT NULL,
  codigo_licencia VARCHAR(64) NOT NULL,

  fecha_sesion DATE NOT NULL,
  device_id VARCHAR(128) NOT NULL,

  activa TINYINT(1) NOT NULL DEFAULT 1,
  inicio_sesion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fin_sesion DATETIME NULL,

  origen_validacion ENUM('online','offline') NOT NULL DEFAULT 'online',
  observacion VARCHAR(255) NULL,

  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_licencia_sesiones_licencias
    FOREIGN KEY (id_licencia) REFERENCES licencias(id_licencia)
    ON UPDATE CASCADE ON DELETE CASCADE,

  UNIQUE KEY uq_licencia_dia_device (id_licencia, fecha_sesion, device_id),
  KEY idx_conflicto_dia (id_licencia, fecha_sesion, activa),
  KEY idx_codigo_dia (codigo_licencia, fecha_sesion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =========================================================
-- SP: CREAR LICENCIA (ALTA MANUAL CONTROLADA)
-- Nota:
-- - device_id siempre inicia en NULL para activacion inicial.
-- - fecha_inicio: si viene NULL usa NOW().
-- =========================================================
DROP PROCEDURE IF EXISTS `sp_licencia_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_crear`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_cliente_nombre VARCHAR(120),
  IN p_estado_licencia VARCHAR(20),
  IN p_estado_suscripcion VARCHAR(20),
  IN p_servidor_habilitado TINYINT,
  IN p_suscripcion_habilitada TINYINT,
  IN p_fecha_inicio DATETIME,
  IN p_fecha_vencimiento DATETIME
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_cliente VARCHAR(120);
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT DEFAULT 1;
  DECLARE v_suscripcion_habilitada TINYINT DEFAULT 1;
  DECLARE v_fecha_inicio DATETIME;
  DECLARE v_fecha_vencimiento DATETIME;
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_id_licencia BIGINT UNSIGNED;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_cliente = TRIM(IFNULL(p_cliente_nombre, ''));
  SET v_estado_licencia = LOWER(TRIM(IFNULL(p_estado_licencia, 'activa')));
  SET v_estado_suscripcion = LOWER(TRIM(IFNULL(p_estado_suscripcion, 'activa')));
  SET v_servidor_habilitado = IFNULL(p_servidor_habilitado, 1);
  SET v_suscripcion_habilitada = IFNULL(p_suscripcion_habilitada, 1);
  SET v_fecha_inicio = IFNULL(p_fecha_inicio, NOW());
  SET v_fecha_vencimiento = p_fecha_vencimiento;

  IF v_servidor_habilitado NOT IN (0, 1) THEN
    SET v_servidor_habilitado = 1;
  END IF;

  IF v_suscripcion_habilitada NOT IN (0, 1) THEN
    SET v_suscripcion_habilitada = 1;
  END IF;

  IF v_codigo = '' OR v_cliente = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'codigo_licencia y cliente_nombre son requeridos' AS message,
      NULL AS id_licencia;
  ELSEIF v_estado_licencia NOT IN ('activa','inactiva','suspendida','cancelada') THEN
    SELECT
      0 AS ok,
      'estado_licencia_invalido' AS code,
      'estado_licencia invalido' AS message,
      NULL AS id_licencia;
  ELSEIF v_estado_suscripcion NOT IN ('activa','inactiva','vencida','suspendida','cancelada') THEN
    SELECT
      0 AS ok,
      'estado_suscripcion_invalido' AS code,
      'estado_suscripcion invalido' AS message,
      NULL AS id_licencia;
  ELSEIF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < v_fecha_inicio THEN
    SELECT
      0 AS ok,
      'rango_fechas_invalido' AS code,
      'fecha_vencimiento no puede ser menor que fecha_inicio' AS message,
      NULL AS id_licencia;
  ELSE
    SELECT COUNT(*)
    INTO v_exists
    FROM licencias
    WHERE BINARY codigo_licencia = BINARY v_codigo;

    IF v_exists > 0 THEN
      SELECT
        0 AS ok,
        'codigo_duplicado' AS code,
        'Ya existe una licencia con ese codigo' AS message,
        NULL AS id_licencia;
    ELSE
      INSERT INTO licencias (
        codigo_licencia,
        cliente_nombre,
        estado_licencia,
        estado_suscripcion,
        servidor_habilitado,
        suscripcion_habilitada,
        fecha_inicio,
        fecha_vencimiento,
        device_id
      ) VALUES (
        v_codigo,
        v_cliente,
        v_estado_licencia,
        v_estado_suscripcion,
        v_servidor_habilitado,
        v_suscripcion_habilitada,
        v_fecha_inicio,
        v_fecha_vencimiento,
        NULL
      );

      SET v_id_licencia = LAST_INSERT_ID();

      SELECT
        1 AS ok,
        'licencia_creada' AS code,
        'Licencia creada correctamente' AS message,
        v_id_licencia AS id_licencia;
    END IF;
  END IF;
END$$
DELIMITER ;

-- =========================================================
-- SP: RENOVAR SUSCRIPCION
-- Uso:
--   CALL sp_licencia_renovar_suscripcion('CODIGO-LICENCIA', '2026-12-31 23:59:59', NULL);
-- Nota:
-- - Activa estado_suscripcion y suscripcion_habilitada.
-- - Actualiza fecha_vencimiento.
-- - p_fecha_inicio es opcional.
-- =========================================================
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

-- =========================================================
-- SP: RESOLVER LICENCIA POR DEVICE_ID
-- =========================================================
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
END$$
DELIMITER ;

-- =========================================================
-- SP: ACTIVACION INICIAL
-- =========================================================
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
END$$
DELIMITER ;

-- =========================================================
-- SP: VALIDAR ARRANQUE DIARIO DEL SERVIDOR
-- =========================================================
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

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Arranque autorizado';

  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT;
  DECLARE v_device_id_db VARCHAR(128);

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

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
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
END$$
DELIMITER ;

-- =========================================================
-- SP: VALIDAR USO DEL SISTEMA (SUSCRIPCION)
-- =========================================================
DROP PROCEDURE IF EXISTS `sp_licencia_validar_uso_sistema`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_validar_uso_sistema`(
  IN p_codigo_licencia VARCHAR(64)
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_warning_window_days INT DEFAULT 3;

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_suscripcion_habilitada TINYINT;
  DECLARE v_fecha_vencimiento DATETIME;
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

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
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
END$$
DELIMITER ;

-- =========================================================
-- SP: CERRAR SESION DEL DIA
-- =========================================================
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
END$$
DELIMITER ;

-- =========================================================
-- SP: LIMPIEZA MANUAL DE SESION DEL DIA
-- =========================================================
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
END$$
DELIMITER ;

-- =========================================================
-- SP: RESET TOTAL DE PRUEBAS (BORRA TODO Y REINICIA IDs)
-- Uso:
--   CALL sp_licencia_reset_pruebas('SI');
-- Nota:
--   AUTO_INCREMENT no vuelve a 0; en MySQL queda listo para iniciar en 1.
-- =========================================================
DROP PROCEDURE IF EXISTS `sp_licencia_reset_pruebas`;
DELIMITER $$
CREATE PROCEDURE `sp_licencia_reset_pruebas`(
  IN p_confirmacion VARCHAR(10)
)
BEGIN
  DECLARE v_confirmacion VARCHAR(10);
  DECLARE v_old_fk_checks INT DEFAULT 1;

  SET v_confirmacion = UPPER(TRIM(IFNULL(p_confirmacion, '')));

  IF v_confirmacion <> 'SI' THEN
    SELECT
      0 AS ok,
      'confirmacion_requerida' AS code,
      'Para ejecutar el reset use: CALL sp_licencia_reset_pruebas(''SI'')' AS message;
  ELSE
    SET v_old_fk_checks = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    TRUNCATE TABLE licencia_sesiones;
    TRUNCATE TABLE licencias;

    SET FOREIGN_KEY_CHECKS = v_old_fk_checks;

    SELECT
      1 AS ok,
      'reset_completado' AS code,
      'Tablas licencia_sesiones y licencias limpiadas; AUTO_INCREMENT reiniciado (siguiente ID=1)' AS message;
  END IF;
END$$
DELIMITER ;
