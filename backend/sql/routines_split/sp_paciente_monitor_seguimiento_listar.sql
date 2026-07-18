DROP PROCEDURE IF EXISTS `sp_paciente_monitor_seguimiento_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_monitor_seguimiento_listar`(
  IN p_fechaCorte DATE,
  IN p_segmento VARCHAR(20),
  IN p_estado VARCHAR(20),
  IN p_tratamiento VARCHAR(30),
  IN p_q VARCHAR(120),
  IN p_page INT,
  IN p_pageSize INT
)
BEGIN
  DECLARE v_page INT DEFAULT 1;
  DECLARE v_pageSize INT DEFAULT 25;
  DECLARE v_offset INT DEFAULT 0;
  DECLARE v_segmento VARCHAR(20) DEFAULT 'all';
  DECLARE v_estado VARCHAR(20) DEFAULT 'all';
  DECLARE v_tratamiento VARCHAR(30) DEFAULT 'all';
  DECLARE v_q VARCHAR(120) DEFAULT '';
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SET v_page = IFNULL(p_page, 1);
  IF v_page < 1 THEN
    SET v_page = 1;
  END IF;

  SET v_pageSize = IFNULL(p_pageSize, 25);
  IF v_pageSize NOT IN (10, 25, 50) THEN
    SET v_pageSize = 25;
  END IF;

  SET v_segmento = LOWER(TRIM(IFNULL(p_segmento, 'all')));
  IF v_segmento NOT IN ('all', 'retrasado', 'm2', 'm3') THEN
    SET v_segmento = 'all';
  END IF;

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
  SET v_offset = (v_page - 1) * v_pageSize;

  SELECT
    f.idPaciente,
    f.NombreP,
    f.telefonoP,
    f.ultimaVisitaP,
    f.mesesAusencia,
    f.segmentoKey,
    f.segmentoLabel,
    f.estadoKey,
    f.estadoLabel,
    f.tipoTratamientoP,
    f.tratamientoKey,
    f.sms,
    f.llamada
  FROM (
    SELECT
      p.idPaciente,
      p.NombreP,
      p.telefonoP,
      DATE_FORMAT(p.ultimaVisitaP, '%Y-%m-%d') AS ultimaVisitaP,
      LOWER(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(p.telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', '')) AS telefonoNorm,
      GREATEST(
        TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
          p_fechaCorte <= DATE_ADD(
            p.ultimaVisitaP,
            INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
          )
        ),
        0
      ) AS mesesAusencia,
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
      CASE
        WHEN GREATEST(
          TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
            p_fechaCorte <= DATE_ADD(
              p.ultimaVisitaP,
              INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
            )
          ),
          0
        ) >= 3 THEN '+3 meses'
        WHEN GREATEST(
          TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
            p_fechaCorte <= DATE_ADD(
              p.ultimaVisitaP,
              INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
            )
          ),
          0
        ) = 2 THEN '+2 meses'
        WHEN GREATEST(
          TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
            p_fechaCorte <= DATE_ADD(
              p.ultimaVisitaP,
              INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
            )
          ),
          0
        ) = 1 THEN 'Retrasado'
        ELSE 'Al dia'
      END AS segmentoLabel,
      CASE WHEN IFNULL(p.estadoP, 1) = 1 THEN 'activo' ELSE 'inactivo' END AS estadoKey,
      CASE WHEN IFNULL(p.estadoP, 1) = 1 THEN 'Activo' ELSE 'Inactivo' END AS estadoLabel,
      CASE
        WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'Odontologia'
        WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'Ortodoncia'
        ELSE 'Sin registrar'
      END AS tipoTratamientoP,
      CASE
        WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'odontologia'
        WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'ortodoncia'
        ELSE 'sin_registrar'
      END AS tratamientoKey,
      IFNULL(psc.sms, 0) AS sms,
      IFNULL(psc.llamada, 0) AS llamada
    FROM paciente p
    LEFT JOIN paciente_seguimiento_contacto psc
      ON psc.idPaciente = p.idPaciente
     AND psc.fechaCorte = p_fechaCorte
    WHERE p.ultimaVisitaP IS NOT NULL
  ) AS f
  WHERE
    (v_q = '' OR LOWER(IFNULL(f.NombreP, '')) LIKE CONCAT('%', v_q, '%') OR f.telefonoNorm LIKE CONCAT('%', v_q, '%'))
    AND (v_estado = 'all' OR f.estadoKey = v_estado)
    AND (v_tratamiento = 'all' OR f.tratamientoKey = v_tratamiento)
    AND (v_segmento = 'all' OR f.segmentoKey = v_segmento)
  ORDER BY
    f.mesesAusencia DESC,
    f.NombreP ASC
  LIMIT v_offset, v_pageSize;

  SELECT COUNT(*) AS totalRows
  FROM (
    SELECT
      p.idPaciente,
      p.NombreP,
      LOWER(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(p.telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', '')) AS telefonoNorm,
      GREATEST(
        TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) - (
          p_fechaCorte <= DATE_ADD(
            p.ultimaVisitaP,
            INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, p_fechaCorte) MONTH
          )
        ),
        0
      ) AS mesesAusencia,
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
    AND (v_tratamiento = 'all' OR f.tratamientoKey = v_tratamiento)
    AND (v_segmento = 'all' OR f.segmentoKey = v_segmento);
END $$
DELIMITER ;
