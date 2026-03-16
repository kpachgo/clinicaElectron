DROP PROCEDURE IF EXISTS `sp_odontograma_guardar`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_guardar`(
  IN p_idPaciente INT,
  IN p_fecha DATE,
  IN p_odontograma MEDIUMTEXT
)
BEGIN
  INSERT INTO odontograma (idPaciente, fechaO, Odontograma)
  VALUES (p_idPaciente, p_fecha, p_odontograma);
END$$
DELIMITER ;


