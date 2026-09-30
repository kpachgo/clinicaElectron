DROP PROCEDURE IF EXISTS `sp_inv_articulo_actualizar`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_articulo_actualizar`(
  IN p_idArticulo INT,
  IN p_categoriaA VARCHAR(20),
  IN p_nombreA VARCHAR(150),
  IN p_unidadA VARCHAR(30)
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM inv_articulo
    WHERE categoriaA = p_categoriaA AND nombreA = TRIM(p_nombreA) AND idArticulo <> p_idArticulo
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe un articulo con ese nombre en la categoria';
  END IF;

  UPDATE inv_articulo
  SET categoriaA = p_categoriaA,
      nombreA = TRIM(p_nombreA),
      unidadA = NULLIF(TRIM(p_unidadA), '')
  WHERE idArticulo = p_idArticulo AND activoA = 1;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$
DELIMITER ;
