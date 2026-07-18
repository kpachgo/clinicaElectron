DROP PROCEDURE IF EXISTS `sp_agenda_buscar_mes`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_buscar_mes`(
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
