DROP PROCEDURE IF EXISTS `sp_seguridad_protocolo_set`;
DELIMITER $$
CREATE PROCEDURE `sp_seguridad_protocolo_set`(
  IN p_enabled TINYINT,
  IN p_updatedByUsuarioId INT
)
BEGIN
  DECLARE v_enabled TINYINT DEFAULT 0;

  SET v_enabled = IFNULL(p_enabled, 0);
  SET v_enabled = IF(v_enabled <> 0, 1, 0);

  INSERT INTO seguridad_protocolo_config (
    id,
    enabled,
    updatedByUsuarioId,
    updatedAt
  ) VALUES (
    1,
    v_enabled,
    p_updatedByUsuarioId,
    NOW()
  )
  ON DUPLICATE KEY UPDATE
    enabled = VALUES(enabled),
    updatedByUsuarioId = VALUES(updatedByUsuarioId),
    updatedAt = NOW();

  CALL sp_seguridad_protocolo_get();
END $$
DELIMITER ;
