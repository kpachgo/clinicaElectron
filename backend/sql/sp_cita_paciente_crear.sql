DROP PROCEDURE IF EXISTS `sp_cita_paciente_crear`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_crear`(
  IN p_idPaciente INT,
  IN p_fecha DATE,
  IN p_procedimiento VARCHAR(200),
  IN p_valor DECIMAL(10,2),
  IN p_abono DECIMAL(10,2),
  IN p_doctorId INT,
  IN p_creadoPorUsuarioId INT,
  IN p_estadoAutorizacionCP VARCHAR(20),
  IN p_metodoAutorizacionCP VARCHAR(40),
  IN p_autorizadoPorUsuarioId INT
)
BEGIN
  DECLARE v_saldo DECIMAL(10,2);
  DECLARE v_estado VARCHAR(20);

  SET v_saldo = p_valor - IFNULL(p_abono, 0);
  SET v_estado = IFNULL(NULLIF(TRIM(p_estadoAutorizacionCP), ''), 'PENDIENTE');

  INSERT INTO citaspaciente (
    idPaciente,
    fechaCP,
    ProcedimientoCP,
    valorCP,
    abonoCP,
    saldoCP,
    doctorId,
    creadoPorUsuarioId,
    estadoAutorizacionCP,
    metodoAutorizacionCP,
    autorizadoPorUsuarioId,
    fechaAutorizacionCP
  ) VALUES (
    p_idPaciente,
    p_fecha,
    p_procedimiento,
    p_valor,
    p_abono,
    v_saldo,
    p_doctorId,
    p_creadoPorUsuarioId,
    v_estado,
    p_metodoAutorizacionCP,
    p_autorizadoPorUsuarioId,
    CASE WHEN v_estado = 'AUTORIZADA' THEN NOW() ELSE NULL END
  );

  UPDATE paciente
  SET ultimaVisitaP = CASE
    WHEN ultimaVisitaP IS NULL OR p_fecha > ultimaVisitaP THEN p_fecha
    ELSE ultimaVisitaP
  END
  WHERE idPaciente = p_idPaciente;

  SELECT LAST_INSERT_ID() AS idCitaPaciente;
END$$
DELIMITER ;


