DROP PROCEDURE IF EXISTS `sp_servicio_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_listar`()
BEGIN
  SELECT idServicio, nombreS, precioS
  FROM servicio
  ORDER BY nombreS;
END $$
DELIMITER ;
