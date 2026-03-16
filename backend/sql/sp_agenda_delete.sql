DROP PROCEDURE IF EXISTS `sp_agenda_delete`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_delete`(
  IN p_idAgendaAP INT
)
BEGIN
  DELETE FROM agendapersona
  WHERE idAgendaAP = p_idAgendaAP;

  SELECT ROW_COUNT() AS filasAfectadas;
END$$
DELIMITER ;

