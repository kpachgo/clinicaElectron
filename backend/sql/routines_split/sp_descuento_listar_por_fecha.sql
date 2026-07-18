DROP PROCEDURE IF EXISTS `sp_descuento_listar_por_fecha`;
DELIMITER $$
CREATE PROCEDURE `sp_descuento_listar_por_fecha`(
  IN p_fecha DATE
)
BEGIN
  SELECT
    idDescuento,
    nombreD,
    fechaD,
    cantidadD
  FROM descuento
  WHERE fechaD = p_fecha
  ORDER BY idDescuento DESC;
END $$
DELIMITER ;
