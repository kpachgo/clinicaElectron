DROP PROCEDURE IF EXISTS `sp_paciente_guardar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_guardar`(
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
      duiP, firmaP, tipomordidaP, tipoTratamientoP,
      endodonciaP, dienteP, vitalidadP, percusionP,
      medProvisional, medTrabajoP,
      historiaMedicaP, historiaOdontologicaP,
      examenClinicoP, examenRadiologicoP, examenComplementarioP,
      tratamientoP, notasObservacionP
    ) VALUES (
      p_NombreP, p_direccionP, p_telefonoP, p_fechaRegistroP, p_estadoP, p_fechaNacimientoP,
      p_recomendadoP, p_encargadoP, p_motivoConsultaP, p_ultimaVisitaP,
      p_duiP, p_firmaP, p_tipomordidaP, p_tipoTratamientoP,
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
      ultimaVisitaP = p_ultimaVisitaP,
      duiP = p_duiP,
      firmaP = p_firmaP,
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

END$$
DELIMITER ;


