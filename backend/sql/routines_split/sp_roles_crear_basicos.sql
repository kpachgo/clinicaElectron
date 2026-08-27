DROP PROCEDURE IF EXISTS `sp_roles_crear_basicos`;
DELIMITER $$
CREATE PROCEDURE `sp_roles_crear_basicos`()
BEGIN
    INSERT INTO rol (nombreR)
    SELECT 'Administrador'
    WHERE NOT EXISTS (
        SELECT 1 FROM rol WHERE nombreR = 'Administrador'
    );

    INSERT INTO rol (nombreR)
    SELECT 'Recepcion'
    WHERE NOT EXISTS (
        SELECT 1 FROM rol WHERE nombreR = 'Recepcion'
    );

    INSERT INTO rol (nombreR)
    SELECT 'Doctor'
    WHERE NOT EXISTS (
        SELECT 1 FROM rol WHERE nombreR = 'Doctor'
    );

    INSERT INTO rol (nombreR)
    SELECT 'Asistente'
    WHERE NOT EXISTS (
        SELECT 1 FROM rol WHERE nombreR = 'Asistente'
    );

    INSERT INTO rol (nombreR)
    SELECT 'Redes'
    WHERE NOT EXISTS (
        SELECT 1 FROM rol WHERE nombreR = 'Redes'
    );

    SELECT idRol, nombreR
    FROM rol
    WHERE nombreR IN ('Administrador', 'Recepcion', 'Doctor', 'Asistente', 'Redes')
    ORDER BY
        CASE nombreR
            WHEN 'Administrador' THEN 1
            WHEN 'Recepcion' THEN 2
            WHEN 'Doctor' THEN 3
            WHEN 'Asistente' THEN 4
            WHEN 'Redes' THEN 5
            ELSE 99
        END,
        idRol;
END $$
DELIMITER ;
