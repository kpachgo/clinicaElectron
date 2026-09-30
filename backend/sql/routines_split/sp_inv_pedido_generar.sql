DROP PROCEDURE IF EXISTS `sp_inv_pedido_generar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_pedido_generar`(
  IN p_idPedido INT,
  IN p_usuarioId INT
)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inv_pedido_detalle WHERE idPedido = p_idPedido) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El pedido no tiene articulos';
  END IF;

  UPDATE inv_pedido
  SET estadoP = 'Generado',
      generadoPorUsuarioId = p_usuarioId,
      generadoEn = NOW()
  WHERE idPedido = p_idPedido AND estadoP = 'Borrador';
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
