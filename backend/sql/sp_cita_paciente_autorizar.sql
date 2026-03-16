DROP PROCEDURE IF EXISTS `sp_cita_paciente_autorizar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_autorizar`(
  IN p_idCitasPaciente INT,
  IN p_autorizadoPorUsuarioId INT,
  IN p_metodoAutorizacionCP VARCHAR(40)
)
BEGIN
  UPDATE citaspaciente
  SET
    estadoAutorizacionCP = 'AUTORIZADA',
    metodoAutorizacionCP = p_metodoAutorizacionCP,
    autorizadoPorUsuarioId = p_autorizadoPorUsuarioId,
    fechaAutorizacionCP = NOW()
  WHERE idcitasPaciente = p_idCitasPaciente;

  SELECT ROW_COUNT() AS affectedRows;
END$$
DELIMITER ;

