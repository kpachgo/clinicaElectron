DROP PROCEDURE IF EXISTS `sp_cita_paciente_actualizar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_actualizar`(
  IN p_idCitasPaciente INT,
  IN p_fechaCP DATE,
  IN p_procedimientoCP VARCHAR(200),
  IN p_valorCP DECIMAL(10,2),
  IN p_abonoCP DECIMAL(10,2)
)
BEGIN
  DECLARE v_idPaciente INT;

  SELECT idPaciente
  INTO v_idPaciente
  FROM citaspaciente
  WHERE idCitasPaciente = p_idCitasPaciente
  LIMIT 1;

  UPDATE citaspaciente
  SET
    fechaCP = p_fechaCP,
    ProcedimientoCP = p_procedimientoCP,
    valorCP = p_valorCP,
    abonoCP = p_abonoCP,
    saldoCP = (p_valorCP - p_abonoCP)
  WHERE idCitasPaciente = p_idCitasPaciente;

  IF v_idPaciente IS NOT NULL THEN
    UPDATE paciente
    SET ultimaVisitaP = CASE
      WHEN ultimaVisitaP IS NULL OR p_fechaCP > ultimaVisitaP THEN p_fechaCP
      ELSE ultimaVisitaP
    END
    WHERE idPaciente = v_idPaciente;
  END IF;

  SELECT ROW_COUNT() AS affectedRows;
END$$
DELIMITER ;


