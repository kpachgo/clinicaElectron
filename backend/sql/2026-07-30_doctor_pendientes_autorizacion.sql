DROP PROCEDURE IF EXISTS `sp_doctor_citas_pendientes_autorizacion`;
DROP PROCEDURE IF EXISTS `sp_doctor_citas_pendientes_autorizar_todos`;
DELIMITER $$
CREATE PROCEDURE `sp_doctor_citas_pendientes_autorizacion`(
  IN p_idDoctor INT,
  IN p_limit INT
)
BEGIN
  DECLARE v_limit INT DEFAULT 20;

  SET v_limit = IFNULL(p_limit, 20);
  IF v_limit < 1 THEN
    SET v_limit = 20;
  END IF;
  IF v_limit > 100 THEN
    SET v_limit = 100;
  END IF;

  SELECT
    c.idcitasPaciente,
    c.idPaciente,
    p.NombreP AS nombrePaciente,
    c.fechaCP,
    c.ProcedimientoCP,
    c.valorCP,
    c.abonoCP,
    c.saldoCP
  FROM citaspaciente c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  WHERE c.doctorId = p_idDoctor
    AND IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') <> 'AUTORIZADA'
  ORDER BY c.fechaCP DESC, c.idcitasPaciente DESC
  LIMIT v_limit;
END $$

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
