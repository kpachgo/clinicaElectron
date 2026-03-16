DROP PROCEDURE IF EXISTS `sp_servicio_create`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_create`(
    IN p_nombre VARCHAR(50),
    IN p_precio DECIMAL(10,2)
)
BEGIN
    INSERT INTO servicio (nombreS, precioS)
    VALUES (p_nombre, p_precio);

    -- devolver el ID creado
    SELECT LAST_INSERT_ID() AS idServicio;
END$$
DELIMITER ;


