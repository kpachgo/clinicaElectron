DROP PROCEDURE IF EXISTS `sp_doctor_listar_select_activos`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_listar_select_activos`()
BEGIN
    SELECT
        idDoctor,
        nombreD
    FROM doctor
    WHERE COALESCE(estadoD, 1) = 1
    ORDER BY nombreD ASC;
END$$
DELIMITER ;

