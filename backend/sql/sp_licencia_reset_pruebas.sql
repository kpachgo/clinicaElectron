DROP PROCEDURE IF EXISTS `sp_licencia_reset_pruebas`;
DELIMITER $$

CREATE PROCEDURE `sp_licencia_reset_pruebas`(
  IN p_confirmacion VARCHAR(10)
)
BEGIN
  DECLARE v_confirmacion VARCHAR(10);
  DECLARE v_old_fk_checks INT DEFAULT 1;

  SET v_confirmacion = UPPER(TRIM(IFNULL(p_confirmacion, '')));

  IF v_confirmacion <> 'SI' THEN
    SELECT
      0 AS ok,
      'confirmacion_requerida' AS code,
      'Para ejecutar el reset use: CALL sp_licencia_reset_pruebas(''SI'')' AS message;
  ELSE
    SET v_old_fk_checks = @@FOREIGN_KEY_CHECKS;
    SET FOREIGN_KEY_CHECKS = 0;

    TRUNCATE TABLE licencia_sesiones;
    TRUNCATE TABLE licencias;

    SET FOREIGN_KEY_CHECKS = v_old_fk_checks;

    SELECT
      1 AS ok,
      'reset_completado' AS code,
      'Tablas licencia_sesiones y licencias limpiadas; AUTO_INCREMENT reiniciado (siguiente ID=1)' AS message;
  END IF;
END$$
DELIMITER ;

