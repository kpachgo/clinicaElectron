DROP PROCEDURE IF EXISTS `sp_inv_articulo_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_articulo_listar`()
BEGIN
  SELECT
    a.idArticulo,
    a.categoriaA,
    a.nombreA,
    a.unidadA
  FROM inv_articulo a
  WHERE a.activoA = 1
  ORDER BY FIELD(a.categoriaA, 'Odontologia', 'Ortodoncia', 'Instrumento'), a.nombreA;
END $$
DELIMITER ;
