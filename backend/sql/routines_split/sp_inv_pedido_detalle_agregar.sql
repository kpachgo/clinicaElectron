DROP PROCEDURE IF EXISTS `sp_inv_pedido_detalle_agregar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_pedido_detalle_agregar`(
  IN p_idPedido INT,
  IN p_idArticulo INT,
  IN p_categoriaD VARCHAR(20),
  IN p_descripcionD VARCHAR(150),
  IN p_cantidadD INT,
  IN p_unidadD VARCHAR(30),
  IN p_notaD VARCHAR(200),
  IN p_ordenD INT
)
BEGIN
  INSERT INTO inv_pedido_detalle
    (idPedido, idArticulo, categoriaD, descripcionD, cantidadD, unidadD, notaD, ordenD)
  VALUES
    (p_idPedido, NULLIF(p_idArticulo, 0), NULLIF(TRIM(p_categoriaD), ''), TRIM(p_descripcionD),
     p_cantidadD, NULLIF(TRIM(p_unidadD), ''), NULLIF(TRIM(p_notaD), ''), p_ordenD);
  SELECT LAST_INSERT_ID() AS idDetalle;
END $$
DELIMITER ;
