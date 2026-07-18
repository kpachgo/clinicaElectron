DROP PROCEDURE IF EXISTS `sp_agenda_por_fecha`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_por_fecha`(
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
DELIMITER ;
