DROP PROCEDURE IF EXISTS `sp_inv_articulo_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_inv_articulo_crear`(
  IN p_categoriaA VARCHAR(20),
  IN p_nombreA VARCHAR(150),
  IN p_unidadA VARCHAR(30)
)
BEGIN
  DECLARE v_id INT DEFAULT NULL;
  DECLARE v_activo TINYINT DEFAULT NULL;

  SELECT idArticulo, activoA INTO v_id, v_activo
  FROM inv_articulo
  WHERE categoriaA = p_categoriaA AND nombreA = TRIM(p_nombreA)
  LIMIT 1;

  IF v_id IS NOT NULL AND v_activo = 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya existe un articulo con ese nombre en la categoria';
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE inv_articulo
    SET activoA = 1, unidadA = NULLIF(TRIM(p_unidadA), '')
    WHERE idArticulo = v_id;
  ELSE
    INSERT INTO inv_articulo (categoriaA, nombreA, unidadA)
    VALUES (p_categoriaA, TRIM(p_nombreA), NULLIF(TRIM(p_unidadA), ''));
    SET v_id = LAST_INSERT_ID();
  END IF;

  SELECT v_id AS idArticulo;
END $$
DELIMITER ;
