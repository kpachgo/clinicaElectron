-- Agrega campo de correo (opcional) al paciente.
-- IMPORTANTE: no se modifica sp_paciente_guardar (28 params) para no romper
-- instancias del backend que aun no incluyen correoP en la llamada.
-- El backend actualizado usa sp_paciente_guardar_v2 (29 params, con correoP).
ALTER TABLE paciente
  ADD COLUMN correoP VARCHAR(40) NULL AFTER firmaP;

DROP PROCEDURE IF EXISTS `sp_paciente_guardar_v2`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_guardar_v2`(
  IN p_idPaciente INT,
  IN p_NombreP VARCHAR(60),
  IN p_direccionP VARCHAR(100),
  IN p_telefonoP VARCHAR(60),
  IN p_fechaRegistroP DATE,
  IN p_estadoP TINYINT,
  IN p_fechaNacimientoP DATE,
  IN p_recomendadoP VARCHAR(60),
  IN p_encargadoP VARCHAR(60),
  IN p_motivoConsultaP VARCHAR(60),
  IN p_ultimaVisitaP DATE,
  IN p_duiP VARCHAR(15),
  IN p_firmaP VARCHAR(255),
  IN p_correoP VARCHAR(40),
  IN p_tipomordidaP VARCHAR(20),
  IN p_tipoTratamientoP VARCHAR(20),
  IN p_endodonciaP VARCHAR(40),
  IN p_dienteP VARCHAR(20),
  IN p_vitalidadP VARCHAR(60),
  IN p_percusionP VARCHAR(60),
  IN p_medProvisional VARCHAR(255),
  IN p_medTrabajoP VARCHAR(255),
  IN p_historiaMedicaP VARCHAR(255),
  IN p_historiaOdontologicaP VARCHAR(255),
  IN p_examenClinicoP VARCHAR(100),
  IN p_examenRadiologicoP VARCHAR(100),
  IN p_examenComplementarioP VARCHAR(100),
  IN p_tratamientoP VARCHAR(255),
  IN p_notasObservacionP VARCHAR(255)
)
BEGIN

  IF p_idPaciente IS NULL OR p_idPaciente = 0 THEN
    INSERT INTO paciente (
      NombreP, direccionP, telefonoP, fechaRegistroP, estadoP, fechaNacimientoP,
      recomendadoP, encargadoP, motivoConsultaP, ultimaVisitaP,
      duiP, firmaP, correoP, tipomordidaP, tipoTratamientoP,
      endodonciaP, dienteP, vitalidadP, percusionP,
      medProvisional, medTrabajoP,
      historiaMedicaP, historiaOdontologicaP,
      examenClinicoP, examenRadiologicoP, examenComplementarioP,
      tratamientoP, notasObservacionP
    ) VALUES (
      p_NombreP, p_direccionP, p_telefonoP, p_fechaRegistroP, p_estadoP, p_fechaNacimientoP,
      p_recomendadoP, p_encargadoP, p_motivoConsultaP, p_ultimaVisitaP,
      p_duiP, p_firmaP, p_correoP, p_tipomordidaP, p_tipoTratamientoP,
      p_endodonciaP, p_dienteP, p_vitalidadP, p_percusionP,
      p_medProvisional, p_medTrabajoP,
      p_historiaMedicaP, p_historiaOdontologicaP,
      p_examenClinicoP, p_examenRadiologicoP, p_examenComplementarioP,
      p_tratamientoP, p_notasObservacionP
    );

    SELECT LAST_INSERT_ID() AS idPaciente;

  ELSE
    UPDATE paciente SET
      NombreP = p_NombreP,
      direccionP = p_direccionP,
      telefonoP = p_telefonoP,
      fechaRegistroP = p_fechaRegistroP,
      estadoP = p_estadoP,
      fechaNacimientoP = p_fechaNacimientoP,
      recomendadoP = p_recomendadoP,
      encargadoP = p_encargadoP,
      motivoConsultaP = p_motivoConsultaP,
      ultimaVisitaP = CASE
        WHEN p_ultimaVisitaP IS NULL THEN ultimaVisitaP
        WHEN ultimaVisitaP IS NULL OR p_ultimaVisitaP > ultimaVisitaP THEN p_ultimaVisitaP
        ELSE ultimaVisitaP
      END,
      duiP = p_duiP,
      firmaP = p_firmaP,
      correoP = p_correoP,
      tipomordidaP = p_tipomordidaP,
      tipoTratamientoP = p_tipoTratamientoP,
      endodonciaP = p_endodonciaP,
      dienteP = p_dienteP,
      vitalidadP = p_vitalidadP,
      percusionP = p_percusionP,
      medProvisional = p_medProvisional,
      medTrabajoP = p_medTrabajoP,
      historiaMedicaP = p_historiaMedicaP,
      historiaOdontologicaP = p_historiaOdontologicaP,
      examenClinicoP = p_examenClinicoP,
      examenRadiologicoP = p_examenRadiologicoP,
      examenComplementarioP = p_examenComplementarioP,
      tratamientoP = p_tratamientoP,
      notasObservacionP = p_notasObservacionP
    WHERE idPaciente = p_idPaciente;

    SELECT p_idPaciente AS idPaciente;
  END IF;

END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_paciente_get_by_id`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_get_by_id`(
  IN p_idPaciente INT
)
BEGIN
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  SELECT
    idPaciente,
    NombreP,
    direccionP,
    telefonoP,
    fechaRegistroP,
    fechaNacimientoP,
    recomendadoP,
    encargadoP,
    motivoConsultaP,
    ultimaVisitaP,
    duiP,
    firmaP,
    correoP,
    tipomordidaP,
    tipoTratamientoP,
    endodonciaP,
    dienteP,
    vitalidadP,
    percusionP,
    medProvisional,
    medTrabajoP,
    fotoPrincipalId,
    historiaMedicaP,
    historiaOdontologicaP,
    examenClinicoP,
    examenRadiologicoP,
    examenComplementarioP,
    tratamientoP,
    notasObservacionP,
    estadoP
  FROM paciente
  WHERE idPaciente = p_idPaciente
    AND (
      v_protocol_enabled = 0
      OR LOWER(TRIM(IFNULL(tipoTratamientoP, ''))) = 'odontologia'
    )
  LIMIT 1;
END $$
DELIMITER ;
