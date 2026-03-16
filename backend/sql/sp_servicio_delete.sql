DROP PROCEDURE IF EXISTS `sp_servicio_delete`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_delete`(
  IN p_id INT
)
BEGIN
  DELETE FROM servicio
  WHERE idServicio = p_id;

  SELECT ROW_COUNT() AS filasAfectadas;
END$$
DELIMITER ;
