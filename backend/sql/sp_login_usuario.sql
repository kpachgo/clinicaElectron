DROP PROCEDURE IF EXISTS `sp_login_usuario`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_login_usuario`(IN p_correo VARCHAR(60))
BEGIN
    SELECT
        u.idUsuario,
        u.correoU,
        u.passwordU,
        u.NombreU,
        u.Cargo,
        r.idRol,
        r.nombreR
    FROM usuario u
    INNER JOIN rol r ON r.idRol = u.idRol
    WHERE u.correoU = p_correo
    LIMIT 1;
END$$
DELIMITER ;


