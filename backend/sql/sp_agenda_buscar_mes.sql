DROP PROCEDURE IF EXISTS `sp_agenda_buscar_mes`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_buscar_mes`(
    IN p_desde DATE,
    IN p_hasta DATE,
    IN p_texto VARCHAR(120)
)
BEGIN
    DECLARE v_texto VARCHAR(120);
    SET v_texto = TRIM(IFNULL(p_texto, ""));

    SELECT
        idAgendaAP,
        nombreAP,
        fechaAP,
        horaAP,
        contactoAP,
        estadoAP,
        comentarioAP
    FROM agendapersona
    WHERE fechaAP BETWEEN p_desde AND p_hasta
      AND (
        v_texto = ""
        OR nombreAP LIKE CONCAT('%', v_texto, '%')
        OR contactoAP LIKE CONCAT('%', v_texto, '%')
      )
    ORDER BY fechaAP ASC, horaAP ASC;
END$$
DELIMITER ;

