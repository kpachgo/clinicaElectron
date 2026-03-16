DROP PROCEDURE IF EXISTS `sp_doctor_get_by_id`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_get_by_id`(
  IN p_idDoctor INT
)
BEGIN
  SELECT
    idDoctor,
    nombreD,
    TelefonoD,
    FirmaD,
    SelloD
  FROM doctor
  WHERE idDoctor = p_idDoctor;
END$$
DELIMITER ;


