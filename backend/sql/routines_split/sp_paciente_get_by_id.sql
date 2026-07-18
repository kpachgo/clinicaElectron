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
