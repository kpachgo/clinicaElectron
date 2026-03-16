DROP PROCEDURE IF EXISTS `sp_doctor_listar_select`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_listar_select`()
BEGIN
    SELECT
        idDoctor,
        nombreD
    FROM doctor
    ORDER BY nombreD ASC;
END$$
DELIMITER ;


