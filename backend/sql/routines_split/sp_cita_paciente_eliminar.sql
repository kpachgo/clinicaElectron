DROP PROCEDURE IF EXISTS `sp_cita_paciente_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_cita_paciente_eliminar`(
  IN p_idCitasPaciente INT
)
BEGIN
  DECLARE v_idPaciente INT;
  DECLARE v_affectedRows INT DEFAULT 0;

  SELECT idPaciente
  INTO v_idPaciente
  FROM citaspaciente
  WHERE idcitasPaciente = p_idCitasPaciente
  LIMIT 1;

  DELETE FROM citaspaciente
  WHERE idcitasPaciente = p_idCitasPaciente;

  SET v_affectedRows = ROW_COUNT();

  IF v_idPaciente IS NOT NULL THEN
    UPDATE paciente
    SET ultimaVisitaP = (
      SELECT MAX(fechaCP)
      FROM citaspaciente
      WHERE idPaciente = v_idPaciente
    )
    WHERE idPaciente = v_idPaciente;
  END IF;

  SELECT v_affectedRows AS affectedRows;
END $$
DELIMITER ;
