DROP PROCEDURE IF EXISTS `sp_inv_pedido_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_pedido_listar`()
BEGIN
  SELECT
    p.idPedido,
    p.estadoP,
    p.notaP,
    DATE_FORMAT(p.creadoEn, '%Y-%m-%d %H:%i') AS creadoEn,
    DATE_FORMAT(p.generadoEn, '%Y-%m-%d %H:%i') AS generadoEn,
    uc.NombreU AS creadoPor,
    ug.NombreU AS generadoPor,
    (SELECT COUNT(*) FROM inv_pedido_detalle d WHERE d.idPedido = p.idPedido) AS totalRenglones
  FROM inv_pedido p
  LEFT JOIN usuario uc ON uc.idUsuario = p.creadoPorUsuarioId
  LEFT JOIN usuario ug ON ug.idUsuario = p.generadoPorUsuarioId
  ORDER BY (p.estadoP = 'Borrador') DESC, p.creadoEn DESC, p.idPedido DESC;
END $$
DELIMITER ;
