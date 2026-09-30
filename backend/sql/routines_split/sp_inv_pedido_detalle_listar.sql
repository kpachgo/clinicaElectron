DROP PROCEDURE IF EXISTS `sp_inv_pedido_detalle_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_pedido_detalle_listar`(
  IN p_idPedido INT
)
BEGIN
  SELECT
    d.idDetalle,
    d.idPedido,
    d.idArticulo,
    d.categoriaD,
    d.descripcionD,
    d.cantidadD,
    d.unidadD,
    d.notaD,
    d.ordenD
  FROM inv_pedido_detalle d
  WHERE d.idPedido = p_idPedido
  ORDER BY d.ordenD, d.idDetalle;
END $$
DELIMITER ;
