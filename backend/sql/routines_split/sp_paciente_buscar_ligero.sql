DROP PROCEDURE IF EXISTS `sp_paciente_buscar_ligero`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_buscar_ligero`(
  IN p_texto VARCHAR(60)
)
BEGIN
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  SELECT
    idPaciente,
    NombreP
  FROM paciente
  WHERE NombreP LIKE CONCAT('%', p_texto, '%')
    AND (
      v_protocol_enabled = 0
      OR LOWER(TRIM(IFNULL(tipoTratamientoP, ''))) = 'odontologia'
    )
  ORDER BY NombreP
  LIMIT 10;
END $$
DELIMITER ;
