DROP PROCEDURE IF EXISTS `sp_doctor_citas_pendientes_autorizar_todos`;
DELIMITER $$
CREATE PROCEDURE `sp_doctor_citas_pendientes_autorizar_todos`(
  IN p_idDoctor INT,
  IN p_autorizadoPorUsuarioId INT
)
BEGIN
  UPDATE citaspaciente
  SET
    estadoAutorizacionCP = 'AUTORIZADA',
    metodoAutorizacionCP = 'AUTO_DOCTOR',
    autorizadoPorUsuarioId = p_autorizadoPorUsuarioId,
    fechaAutorizacionCP = NOW()
  WHERE doctorId = p_idDoctor
    AND IFNULL(estadoAutorizacionCP, 'PENDIENTE') <> 'AUTORIZADA';

  SELECT ROW_COUNT() AS affectedRows;
END $$
DELIMITER ;
