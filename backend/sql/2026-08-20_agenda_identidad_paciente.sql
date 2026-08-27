-- Asocia formalmente las citas con el paciente de MySQL.
ALTER TABLE agendapersona
  ADD COLUMN pacienteIdAP INT NULL AFTER nombreAP;

CREATE INDEX idx_agendapersona_paciente_fecha_hora
  ON agendapersona (pacienteIdAP, fechaAP, horaAP);

DROP PROCEDURE IF EXISTS sp_agenda_update_ai;
DELIMITER $$
CREATE PROCEDURE sp_agenda_update_ai(
  IN p_idAgendaAP INT,
  IN p_pacienteIdAP INT,
  IN p_fechaAP DATE,
  IN p_horaAP VARCHAR(20)
)
BEGIN
  UPDATE agendapersona
  SET fechaAP = p_fechaAP,
      horaAP = p_horaAP
  WHERE idAgendaAP = p_idAgendaAP
    AND pacienteIdAP = p_pacienteIdAP;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_agenda_cancel_ai;
DELIMITER $$
CREATE PROCEDURE sp_agenda_cancel_ai(
  IN p_idAgendaAP INT,
  IN p_pacienteIdAP INT
)
BEGIN
  UPDATE agendapersona
  SET estadoAP = 'Cancelado'
  WHERE idAgendaAP = p_idAgendaAP
    AND pacienteIdAP = p_pacienteIdAP
    AND LOWER(TRIM(IFNULL(estadoAP, ''))) NOT IN ('cancelado', 'cancelada');
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_agenda_create_with_identity;
DELIMITER $$
CREATE PROCEDURE sp_agenda_create_with_identity(
  IN p_nombreAP VARCHAR(100),
  IN p_pacienteIdAP INT,
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_servicioIdAP INT,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255),
  IN p_smsAP TINYINT,
  IN p_llamadaAP TINYINT,
  IN p_presenteAP TINYINT
)
BEGIN
  INSERT INTO agendapersona (nombreAP,pacienteIdAP,horaAP,fechaAP,servicioIdAP,contactoAP,estadoAP,comentarioAP,smsAP,llamadaAP,presenteAP)
  VALUES (p_nombreAP,p_pacienteIdAP,p_horaAP,p_fechaAP,p_servicioIdAP,p_contactoAP,p_estadoAP,p_comentarioAP,IFNULL(p_smsAP,0),IFNULL(p_llamadaAP,0),IFNULL(p_presenteAP,0));
  SELECT LAST_INSERT_ID() AS idAgendaAP;
END $$
DELIMITER ;
