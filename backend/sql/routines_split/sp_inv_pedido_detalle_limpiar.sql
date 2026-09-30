DROP PROCEDURE IF EXISTS `sp_inv_pedido_detalle_limpiar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_pedido_detalle_limpiar`(
  IN p_idPedido INT
)
BEGIN
  DELETE FROM inv_pedido_detalle WHERE idPedido = p_idPedido;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
