DROP PROCEDURE IF EXISTS `sp_inv_pedido_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_pedido_eliminar`(
  IN p_idPedido INT
)
BEGIN
  DELETE FROM inv_pedido WHERE idPedido = p_idPedido;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
