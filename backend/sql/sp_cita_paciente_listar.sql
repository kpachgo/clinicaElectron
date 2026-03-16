DROP PROCEDURE IF EXISTS `sp_cita_paciente_listar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_listar`(
  IN p_idPaciente INT
)
BEGIN
  SELECT
    c.idcitasPaciente,
    c.fechaCP,
    c.ProcedimientoCP,
    c.valorCP,
    c.abonoCP,
    c.saldoCP,
    c.doctorId AS idDoctor,
    d.nombreD AS nombreDoctor,
    IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') AS estadoAutorizacionCP,
    c.metodoAutorizacionCP,
    c.autorizadoPorUsuarioId,
    c.fechaAutorizacionCP,
    c.creadoPorUsuarioId,
    CASE
      WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico' THEN 1
      ELSE 0
    END AS esRegistroFisico,
    CASE
      WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico'
        OR IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') = 'AUTORIZADA'
      THEN 1
      ELSE 0
    END AS puedeVerDoctor
  FROM citaspaciente c
  LEFT JOIN doctor d ON d.idDoctor = c.doctorId
  WHERE c.idPaciente = p_idPaciente
  ORDER BY c.fechaCP ASC;
END$$
DELIMITER ;


