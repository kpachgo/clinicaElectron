DROP PROCEDURE IF EXISTS `sp_inv_articulo_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_articulo_eliminar`(
  IN p_idArticulo INT
)
BEGIN
  UPDATE inv_articulo SET activoA = 0
  WHERE idArticulo = p_idArticulo AND activoA = 1;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
