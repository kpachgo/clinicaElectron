DROP PROCEDURE IF EXISTS `sp_paciente_search`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_search`(
    IN p_query VARCHAR(60)
)
BEGIN
    SELECT
        idPaciente,
        NombreP
    FROM paciente
    WHERE estadoP = 1
      AND NombreP LIKE CONCAT('%', p_query, '%')
    ORDER BY NombreP
    LIMIT 10;
END$$
DELIMITER ;


