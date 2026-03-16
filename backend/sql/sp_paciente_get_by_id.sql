DROP PROCEDURE IF EXISTS `sp_paciente_get_by_id`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_get_by_id`(
    IN p_idPaciente INT
)
BEGIN
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
    LIMIT 1;
END$$
DELIMITER ;


