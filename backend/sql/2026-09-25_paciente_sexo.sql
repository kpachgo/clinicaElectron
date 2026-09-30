-- Agrega el sexo del paciente (opcional) para elegir su avatar en la vista Paciente.
--   'F' = femenino, 'M' = masculino, NULL = sin especificar (pacientes existentes y los creados desde Agenda).
-- IMPORTANTE (mismo criterio que 2026-09-12_paciente_correo.sql): NO se modifican sp_paciente_guardar
-- (28 params) ni sp_paciente_guardar_v2 (29 params), para no romper equipos con un backend anterior.
-- El backend actualizado usa sp_paciente_guardar_v3 (30 params, con sexoP despues de fechaNacimientoP).
-- Lectura: sp_paciente_get_by_id_v2 = copia de sp_paciente_get_by_id + sexoP. El original NO se toca.
-- Resultado: este script solo AGREGA (columna nullable + 2 procedimientos nuevos); nada de lo que usa
-- una version ya desplegada cambia. Si luego se ajusta el filtro del protocolo de seguridad en
-- sp_paciente_get_by_id, replicarlo tambien en _v2.
ALTER TABLE paciente
  ADD COLUMN sexoP CHAR(1) NULL AFTER fechaNacimientoP;

DROP PROCEDURE IF EXISTS `sp_paciente_guardar_v3`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_guardar_v3`(
  IN p_idPaciente INT,
  IN p_NombreP VARCHAR(60),
  IN p_direccionP VARCHAR(100),
  IN p_telefonoP VARCHAR(60),
  IN p_fechaRegistroP DATE,
  IN p_estadoP TINYINT,
  IN p_fechaNacimientoP DATE,
  IN p_sexoP CHAR(1),
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
      NombreP, direccionP, telefonoP, fechaRegistroP, estadoP, fechaNacimientoP, sexoP,
      recomendadoP, encargadoP, motivoConsultaP, ultimaVisitaP,
      duiP, firmaP, correoP, tipomordidaP, tipoTratamientoP,
      endodonciaP, dienteP, vitalidadP, percusionP,
      medProvisional, medTrabajoP,
      historiaMedicaP, historiaOdontologicaP,
      examenClinicoP, examenRadiologicoP, examenComplementarioP,
      tratamientoP, notasObservacionP
    ) VALUES (
      p_NombreP, p_direccionP, p_telefonoP, p_fechaRegistroP, p_estadoP, p_fechaNacimientoP, p_sexoP,
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
      sexoP = p_sexoP,
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

DROP PROCEDURE IF EXISTS `sp_paciente_get_by_id_v2`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_get_by_id_v2`(
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
    sexoP,
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
