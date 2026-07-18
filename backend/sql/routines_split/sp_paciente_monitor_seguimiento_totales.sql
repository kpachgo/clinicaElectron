DROP PROCEDURE IF EXISTS `sp_paciente_monitor_seguimiento_totales`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_monitor_seguimiento_totales`(
  IN p_fechaCorte DATE,
  IN p_estado VARCHAR(20),
  IN p_tratamiento VARCHAR(30),
  IN p_q VARCHAR(120)
)
BEGIN
  DECLARE v_estado VARCHAR(20) DEFAULT 'all';
  DECLARE v_tratamiento VARCHAR(30) DEFAULT 'all';
  DECLARE v_q VARCHAR(120) DEFAULT '';
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SET v_estado = LOWER(TRIM(IFNULL(p_estado, 'all')));
  IF v_estado NOT IN ('all', 'activo', 'inactivo') THEN
    SET v_estado = 'all';
  END IF;

  SET v_tratamiento = LOWER(TRIM(IFNULL(p_tratamiento, 'all')));
  IF v_tratamiento NOT IN ('all', 'odontologia', 'ortodoncia', 'sin_registrar') THEN
    SET v_tratamiento = 'all';
  END IF;

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  IF v_protocol_enabled = 1 THEN
    SET v_tratamiento = 'odontologia';
  END IF;

  SET v_q = LOWER(TRIM(IFNULL(p_q, '')));

  SELECT
    COUNT(*) AS totalBase,
    SUM(CASE WHEN f.segmentoKey = 'retrasado' THEN 1 ELSE 0 END) AS retrasado,
    SUM(CASE WHEN f.segmentoKey = 'm2' THEN 1 ELSE 0 END) AS m2,
    SUM(CASE WHEN f.segmentoKey = 'm3' THEN 1 ELSE 0 END) AS m3
  FROM (
    SELECT
      p.idPaciente,
      p.NombreP,
      LOWER(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(p.telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', '')) AS telefonoNorm,
      CASE
        WHEN GREATEST(
          TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
            p_fechaCorte <= DATE_ADD(
              p.ultimaVisitaP,
              INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
            )
          ),
          0
        ) >= 3 THEN 'm3'
        WHEN GREATEST(
          TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
            p_fechaCorte <= DATE_ADD(
              p.ultimaVisitaP,
              INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
            )
          ),
          0
        ) = 2 THEN 'm2'
        WHEN GREATEST(
          TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
            p_fechaCorte <= DATE_ADD(
              p.ultimaVisitaP,
              INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
            )
          ),
          0
        ) = 1 THEN 'retrasado'
        ELSE 'al_dia'
      END AS segmentoKey,
      CASE WHEN IFNULL(p.estadoP, 1) = 1 THEN 'activo' ELSE 'inactivo' END AS estadoKey,
      CASE
        WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'odontologia'
        WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'ortodoncia'
        ELSE 'sin_registrar'
      END AS tratamientoKey
    FROM paciente p
    WHERE p.ultimaVisitaP IS NOT NULL
  ) AS f
  WHERE
    (v_q = '' OR LOWER(IFNULL(f.NombreP, '')) LIKE CONCAT('%', v_q, '%') OR f.telefonoNorm LIKE CONCAT('%', v_q, '%'))
    AND (v_estado = 'all' OR f.estadoKey = v_estado)
    AND (v_tratamiento = 'all' OR f.tratamientoKey = v_tratamiento);
END $$
DELIMITER ;
