-- Agenda: marcar presencia en clinica
-- Fecha: 2026-04-26

-- 1) Columna nueva en agenda
SET @has_presente := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'agendapersona'
    AND column_name = 'presenteAP'
);
SET @sql_add_presente := IF(
  @has_presente = 0,
  'ALTER TABLE agendapersona ADD COLUMN presenteAP TINYINT(1) NOT NULL DEFAULT 0 AFTER llamadaAP',
  'SELECT 1'
);
PREPARE stmt_add_presente FROM @sql_add_presente;
EXECUTE stmt_add_presente;
DEALLOCATE PREPARE stmt_add_presente;

DROP PROCEDURE IF EXISTS sp_agenda_create;
DROP PROCEDURE IF EXISTS sp_agenda_update;
DROP PROCEDURE IF EXISTS sp_agenda_por_fecha;
DROP PROCEDURE IF EXISTS sp_agenda_buscar_mes;

DELIMITER $$

CREATE PROCEDURE sp_agenda_create(
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255),
  IN p_smsAP TINYINT,
  IN p_llamadaAP TINYINT,
  IN p_presenteAP TINYINT
)
BEGIN
  INSERT INTO agendapersona (
    nombreAP,
    horaAP,
    fechaAP,
    contactoAP,
    estadoAP,
    comentarioAP,
    smsAP,
    llamadaAP,
    presenteAP
  ) VALUES (
    p_nombreAP,
    p_horaAP,
    p_fechaAP,
    p_contactoAP,
    p_estadoAP,
    p_comentarioAP,
    IFNULL(p_smsAP, 0),
    IFNULL(p_llamadaAP, 0),
    IFNULL(p_presenteAP, 0)
  );

  SELECT LAST_INSERT_ID() AS idAgendaAP;
END $$

CREATE PROCEDURE sp_agenda_update(
  IN p_idAgendaAP INT,
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255),
  IN p_smsAP TINYINT,
  IN p_llamadaAP TINYINT,
  IN p_presenteAP TINYINT
)
BEGIN
  UPDATE agendapersona
  SET
    nombreAP     = COALESCE(p_nombreAP, nombreAP),
    horaAP       = COALESCE(p_horaAP, horaAP),
    fechaAP      = COALESCE(p_fechaAP, fechaAP),
    contactoAP   = COALESCE(p_contactoAP, contactoAP),
    estadoAP     = COALESCE(p_estadoAP, estadoAP),
    comentarioAP = COALESCE(p_comentarioAP, comentarioAP),
    smsAP        = COALESCE(p_smsAP, smsAP),
    llamadaAP    = COALESCE(p_llamadaAP, llamadaAP),
    presenteAP   = COALESCE(p_presenteAP, presenteAP)
  WHERE idAgendaAP = p_idAgendaAP;
END $$

CREATE PROCEDURE sp_agenda_por_fecha(
  IN p_fecha DATE
)
BEGIN
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  SELECT
    a.idAgendaAP,
    a.nombreAP,
    a.fechaAP,
    a.horaAP,
    a.contactoAP,
    a.estadoAP,
    a.comentarioAP,
    IFNULL(a.smsAP, 0) AS smsAP,
    IFNULL(a.llamadaAP, 0) AS llamadaAP,
    IFNULL(a.presenteAP, 0) AS presenteAP
  FROM agendapersona a
  WHERE a.fechaAP = p_fecha
    AND (
      v_protocol_enabled = 0
      OR EXISTS (
        SELECT 1
        FROM paciente p
        WHERE LOWER(TRIM(IFNULL(p.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
          AND LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia'
          AND (
            (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') <> ''
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(p.telefonoP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') =
                  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
            )
            OR (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ''
              AND 1 = (
                SELECT COUNT(*)
                FROM paciente p2
                WHERE LOWER(TRIM(IFNULL(p2.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
                  AND LOWER(TRIM(IFNULL(p2.tipoTratamientoP, ''))) = 'odontologia'
              )
            )
          )
      )
    )
  ORDER BY a.horaAP ASC;
END $$

CREATE PROCEDURE sp_agenda_buscar_mes(
  IN p_desde DATE,
  IN p_hasta DATE,
  IN p_texto VARCHAR(120)
)
BEGIN
  DECLARE v_texto VARCHAR(120);
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SET v_texto = TRIM(IFNULL(p_texto, ''));

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  SELECT
    a.idAgendaAP,
    a.nombreAP,
    a.fechaAP,
    a.horaAP,
    a.contactoAP,
    a.estadoAP,
    a.comentarioAP,
    IFNULL(a.smsAP, 0) AS smsAP,
    IFNULL(a.llamadaAP, 0) AS llamadaAP,
    IFNULL(a.presenteAP, 0) AS presenteAP
  FROM agendapersona a
  WHERE a.fechaAP BETWEEN p_desde AND p_hasta
    AND (
      v_texto = ''
      OR a.nombreAP LIKE CONCAT('%', v_texto, '%')
      OR a.contactoAP LIKE CONCAT('%', v_texto, '%')
    )
    AND (
      v_protocol_enabled = 0
      OR EXISTS (
        SELECT 1
        FROM paciente p
        WHERE LOWER(TRIM(IFNULL(p.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
          AND LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia'
          AND (
            (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') <> ''
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(p.telefonoP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') =
                  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
            )
            OR (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ''
              AND 1 = (
                SELECT COUNT(*)
                FROM paciente p2
                WHERE LOWER(TRIM(IFNULL(p2.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
                  AND LOWER(TRIM(IFNULL(p2.tipoTratamientoP, ''))) = 'odontologia'
              )
            )
          )
      )
    )
  ORDER BY a.fechaAP ASC, a.horaAP ASC;
END $$

DELIMITER ;
