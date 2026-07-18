DROP PROCEDURE IF EXISTS `sp_seguridad_protocolo_get`;
DELIMITER $$
CREATE PROCEDURE `sp_seguridad_protocolo_get`()
BEGIN
  SELECT
    id,
    IF(enabled = 1, 1, 0) AS enabled,
    updatedByUsuarioId,
    updatedAt
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;
END $$
DELIMITER ;
