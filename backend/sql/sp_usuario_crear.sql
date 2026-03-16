DROP PROCEDURE IF EXISTS `sp_usuario_crear`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_usuario_crear`(
    IN p_correo   VARCHAR(60),
    IN p_password VARCHAR(255),
    IN p_nombre   VARCHAR(60),
    IN p_cargo    VARCHAR(20),
    IN p_idRol    INT,
    IN p_idDoctor INT
)
BEGIN
    -- Verificar correo duplicado
    IF EXISTS (
        SELECT 1 FROM usuario WHERE correoU = p_correo
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'EL_CORREO_YA_EXISTE';
    END IF;

    INSERT INTO usuario (
        correoU,
        passwordU,
        NombreU,
        Cargo,
        idRol,
        idDoctor
    ) VALUES (
        p_correo,
        p_password,
        p_nombre,
        p_cargo,
        p_idRol,
        p_idDoctor
    );

    SELECT LAST_INSERT_ID() AS idUsuario;
END$$
DELIMITER ;


