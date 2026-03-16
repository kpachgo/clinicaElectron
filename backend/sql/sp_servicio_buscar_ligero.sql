DROP PROCEDURE IF EXISTS `sp_servicio_buscar_ligero`;
DELIMITER $$
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_buscar_ligero`(
  IN p_q VARCHAR(50)
)
BEGIN
  SELECT
    idServicio,
    nombreS,
    precioS
  FROM servicio
  WHERE nombreS LIKE CONCAT('%', p_q, '%')
  ORDER BY nombreS
  LIMIT 10;
END$$
DELIMITER ;


