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

