DROP PROCEDURE IF EXISTS `sp_agenda_por_fecha`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_por_fecha`(
    IN p_fecha DATE
)
BEGIN
    SELECT
        idAgendaAP,
        nombreAP,
        fechaAP,
        horaAP,
        contactoAP,
        estadoAP,
        comentarioAP
    FROM agendapersona
    WHERE fechaAP = p_fecha
    ORDER BY horaAP ASC;
END$$
DELIMITER ;


