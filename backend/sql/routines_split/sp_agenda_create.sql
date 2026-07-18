DROP PROCEDURE IF EXISTS `sp_agenda_create`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_create`(
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
DELIMITER ;
