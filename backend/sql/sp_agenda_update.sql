DROP PROCEDURE IF EXISTS `sp_agenda_update`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_update`(
  IN p_idAgendaAP INT,
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255)
)
BEGIN
  UPDATE agendapersona
  SET
    nombreAP     = COALESCE(p_nombreAP, nombreAP),
    horaAP       = COALESCE(p_horaAP, horaAP),
    fechaAP      = COALESCE(p_fechaAP, fechaAP),
    contactoAP   = COALESCE(p_contactoAP, contactoAP),
    estadoAP     = COALESCE(p_estadoAP, estadoAP),
    comentarioAP = COALESCE(p_comentarioAP, comentarioAP)
  WHERE idAgendaAP = p_idAgendaAP;
END$$
DELIMITER ;


