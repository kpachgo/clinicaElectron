
--
-- Host: centerbeam.proxy.rlwy.net    Database: clinica
-- ------------------------------------------------------
-- Server version	9.4.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Dumping events for database 'clinica'
--

--
-- Dumping routines for database 'clinica'
--
/*!50003 DROP PROCEDURE IF EXISTS `sp_agenda_buscar_mes` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_buscar_mes`(
  IN p_desde DATE,
  IN p_hasta DATE,
  IN p_texto VARCHAR(120)
)
BEGIN
  DECLARE v_texto VARCHAR(120);
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SET v_texto = TRIM(IFNULL(p_texto, ''));

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  SELECT
    a.idAgendaAP,
    a.nombreAP,
    a.fechaAP,
    a.horaAP,
    a.contactoAP,
    a.estadoAP,
    a.comentarioAP,
    IFNULL(a.smsAP, 0) AS smsAP,
    IFNULL(a.llamadaAP, 0) AS llamadaAP,
    IFNULL(a.presenteAP, 0) AS presenteAP
  FROM agendapersona a
  WHERE a.fechaAP BETWEEN p_desde AND p_hasta
    AND (
      v_texto = ''
      OR a.nombreAP LIKE CONCAT('%', v_texto, '%')
      OR a.contactoAP LIKE CONCAT('%', v_texto, '%')
    )
    AND (
      v_protocol_enabled = 0
      OR EXISTS (
        SELECT 1
        FROM paciente p
        WHERE LOWER(TRIM(IFNULL(p.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
          AND LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia'
          AND (
            (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') <> ''
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(p.telefonoP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') =
                  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
            )
            OR (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ''
              AND 1 = (
                SELECT COUNT(*)
                FROM paciente p2
                WHERE LOWER(TRIM(IFNULL(p2.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
                  AND LOWER(TRIM(IFNULL(p2.tipoTratamientoP, ''))) = 'odontologia'
              )
            )
          )
      )
    )
  ORDER BY a.fechaAP ASC, a.horaAP ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_agenda_create` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_create`(
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255),
  IN p_smsAP TINYINT,
  IN p_llamadaAP TINYINT,
  IN p_presenteAP TINYINT
)
BEGIN
  INSERT INTO agendapersona (
    nombreAP,
    horaAP,
    fechaAP,
    contactoAP,
    estadoAP,
    comentarioAP,
    smsAP,
    llamadaAP,
    presenteAP
  ) VALUES (
    p_nombreAP,
    p_horaAP,
    p_fechaAP,
    p_contactoAP,
    p_estadoAP,
    p_comentarioAP,
    IFNULL(p_smsAP, 0),
    IFNULL(p_llamadaAP, 0),
    IFNULL(p_presenteAP, 0)
  );

  SELECT LAST_INSERT_ID() AS idAgendaAP;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_agenda_delete` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_delete`(IN p_idAgendaAP INT)
BEGIN
  DELETE FROM agendapersona
  WHERE idAgendaAP = p_idAgendaAP;

  SELECT ROW_COUNT() AS filasAfectadas;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_agenda_por_fecha` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_por_fecha`(
  IN p_fecha DATE
)
BEGIN
  DECLARE v_protocol_enabled TINYINT DEFAULT 0;

  SELECT IFNULL(enabled, 0)
    INTO v_protocol_enabled
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;

  SELECT
    a.idAgendaAP,
    a.nombreAP,
    a.fechaAP,
    a.horaAP,
    a.contactoAP,
    a.estadoAP,
    a.comentarioAP,
    IFNULL(a.smsAP, 0) AS smsAP,
    IFNULL(a.llamadaAP, 0) AS llamadaAP,
    IFNULL(a.presenteAP, 0) AS presenteAP
  FROM agendapersona a
  WHERE a.fechaAP = p_fecha
    AND (
      v_protocol_enabled = 0
      OR EXISTS (
        SELECT 1
        FROM paciente p
        WHERE LOWER(TRIM(IFNULL(p.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
          AND LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia'
          AND (
            (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') <> ''
              AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(p.telefonoP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') =
                  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
            )
            OR (
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(a.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ''
              AND 1 = (
                SELECT COUNT(*)
                FROM paciente p2
                WHERE LOWER(TRIM(IFNULL(p2.NombreP, ''))) = LOWER(TRIM(IFNULL(a.nombreAP, '')))
                  AND LOWER(TRIM(IFNULL(p2.tipoTratamientoP, ''))) = 'odontologia'
              )
            )
          )
      )
    )
  ORDER BY a.horaAP ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_agenda_update` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_agenda_update`(
  IN p_idAgendaAP INT,
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255),
  IN p_smsAP TINYINT,
  IN p_llamadaAP TINYINT,
  IN p_presenteAP TINYINT
)
BEGIN
  UPDATE agendapersona
  SET
    nombreAP     = COALESCE(p_nombreAP, nombreAP),
    horaAP       = COALESCE(p_horaAP, horaAP),
    fechaAP      = COALESCE(p_fechaAP, fechaAP),
    contactoAP   = COALESCE(p_contactoAP, contactoAP),
    estadoAP     = COALESCE(p_estadoAP, estadoAP),
    comentarioAP = COALESCE(p_comentarioAP, comentarioAP),
    smsAP        = COALESCE(p_smsAP, smsAP),
    llamadaAP    = COALESCE(p_llamadaAP, llamadaAP),
    presenteAP   = COALESCE(p_presenteAP, presenteAP)
  WHERE idAgendaAP = p_idAgendaAP;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cita_paciente_actualizar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_actualizar`(
  IN p_idCitasPaciente INT,
  IN p_fechaCP DATE,
  IN p_procedimientoCP VARCHAR(500),
  IN p_valorCP DECIMAL(10,2),
  IN p_abonoCP DECIMAL(10,2)
)
BEGIN
  DECLARE v_idPaciente INT;

  SELECT idPaciente
  INTO v_idPaciente
  FROM citaspaciente
  WHERE idCitasPaciente = p_idCitasPaciente
  LIMIT 1;

  UPDATE citaspaciente
  SET
    fechaCP = p_fechaCP,
    ProcedimientoCP = p_procedimientoCP,
    valorCP = p_valorCP,
    abonoCP = p_abonoCP,
    saldoCP = (p_valorCP - p_abonoCP)
  WHERE idCitasPaciente = p_idCitasPaciente;

  IF v_idPaciente IS NOT NULL THEN
    UPDATE paciente
    SET ultimaVisitaP = CASE
      WHEN ultimaVisitaP IS NULL OR p_fechaCP > ultimaVisitaP THEN p_fechaCP
      ELSE ultimaVisitaP
    END
    WHERE idPaciente = v_idPaciente;
  END IF;

  SELECT ROW_COUNT() AS affectedRows;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cita_paciente_autorizar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_autorizar`(
  IN p_idCitasPaciente INT,
  IN p_autorizadoPorUsuarioId INT,
  IN p_metodoAutorizacionCP VARCHAR(40)
)
BEGIN
  UPDATE citaspaciente
  SET
    estadoAutorizacionCP = 'AUTORIZADA',
    metodoAutorizacionCP = p_metodoAutorizacionCP,
    autorizadoPorUsuarioId = p_autorizadoPorUsuarioId,
    fechaAutorizacionCP = NOW()
  WHERE idcitasPaciente = p_idCitasPaciente;

  SELECT ROW_COUNT() AS affectedRows;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cita_paciente_eliminar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_eliminar`(
  IN p_idCitasPaciente INT
)
BEGIN
  DECLARE v_idPaciente INT;
  DECLARE v_affectedRows INT DEFAULT 0;

  SELECT idPaciente
  INTO v_idPaciente
  FROM citaspaciente
  WHERE idcitasPaciente = p_idCitasPaciente
  LIMIT 1;

  DELETE FROM citaspaciente
  WHERE idcitasPaciente = p_idCitasPaciente;

  SET v_affectedRows = ROW_COUNT();

  IF v_idPaciente IS NOT NULL THEN
    UPDATE paciente
    SET ultimaVisitaP = (
      SELECT MAX(fechaCP)
      FROM citaspaciente
      WHERE idPaciente = v_idPaciente
    )
    WHERE idPaciente = v_idPaciente;
  END IF;

  SELECT v_affectedRows AS affectedRows;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cita_paciente_crear` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_crear`(
  IN p_idPaciente INT,
  IN p_fecha DATE,
  IN p_procedimiento VARCHAR(500),
  IN p_valor DECIMAL(10,2),
  IN p_abono DECIMAL(10,2),
  IN p_doctorId INT,
  IN p_creadoPorUsuarioId INT,
  IN p_estadoAutorizacionCP VARCHAR(20),
  IN p_metodoAutorizacionCP VARCHAR(40),
  IN p_autorizadoPorUsuarioId INT
)
BEGIN
  DECLARE v_saldo DECIMAL(10,2);
  DECLARE v_estado VARCHAR(20);

  SET v_saldo = p_valor - IFNULL(p_abono, 0);
  SET v_estado = IFNULL(NULLIF(TRIM(p_estadoAutorizacionCP), ''), 'PENDIENTE');

  INSERT INTO citaspaciente (
    idPaciente,
    fechaCP,
    ProcedimientoCP,
    valorCP,
    abonoCP,
    saldoCP,
    doctorId,
    creadoPorUsuarioId,
    estadoAutorizacionCP,
    metodoAutorizacionCP,
    autorizadoPorUsuarioId,
    fechaAutorizacionCP
  ) VALUES (
    p_idPaciente,
    p_fecha,
    p_procedimiento,
    p_valor,
    p_abono,
    v_saldo,
    p_doctorId,
    p_creadoPorUsuarioId,
    v_estado,
    p_metodoAutorizacionCP,
    p_autorizadoPorUsuarioId,
    CASE WHEN v_estado = 'AUTORIZADA' THEN NOW() ELSE NULL END
  );

  UPDATE paciente
  SET ultimaVisitaP = CASE
    WHEN ultimaVisitaP IS NULL OR p_fecha > ultimaVisitaP THEN p_fecha
    ELSE ultimaVisitaP
  END
  WHERE idPaciente = p_idPaciente;

  SELECT LAST_INSERT_ID() AS idCitaPaciente;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cita_paciente_listar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cita_paciente_listar`(
  IN p_idPaciente INT
)
BEGIN
  SELECT
    c.idcitasPaciente,
    c.fechaCP,
    c.ProcedimientoCP,
    c.valorCP,
    c.abonoCP,
    c.saldoCP,
    c.doctorId AS idDoctor,
    d.nombreD AS nombreDoctor,
    IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') AS estadoAutorizacionCP,
    c.metodoAutorizacionCP,
    c.autorizadoPorUsuarioId,
    c.fechaAutorizacionCP,
    c.creadoPorUsuarioId,
    CASE
      WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico' THEN 1
      ELSE 0
    END AS esRegistroFisico,
    CASE
      WHEN LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico'
        OR IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') = 'AUTORIZADA'
      THEN 1
      ELSE 0
    END AS puedeVerDoctor,
    CASE
      WHEN c.doctorId IS NOT NULL
        AND (
          LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico'
          OR IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') = 'AUTORIZADA'
        )
      THEN d.FirmaD
      ELSE NULL
    END AS FirmaD,
    CASE
      WHEN c.doctorId IS NOT NULL
        AND (
          LOWER(TRIM(IFNULL(d.nombreD, ''))) = 'registro fisico'
          OR IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') = 'AUTORIZADA'
        )
      THEN d.SelloD
      ELSE NULL
    END AS SelloD
  FROM citaspaciente c
  LEFT JOIN doctor d ON d.idDoctor = c.doctorId
  WHERE c.idPaciente = p_idPaciente
  ORDER BY c.fechaCP ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cuenta_asignar_doctor_por_cuenta` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_asignar_doctor_por_cuenta`(
  IN p_idCuenta INT,
  IN p_idDoctor INT
)
BEGIN
  UPDATE detallecuenta
  SET idDoctor = p_idDoctor
  WHERE idC = p_idCuenta;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cuenta_create` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_create`(
  IN p_idPaciente INT,
  IN p_formaPago VARCHAR(40),
  IN p_total DECIMAL(10,2)
)
BEGIN
  INSERT INTO cuenta (fechaC, FormaPagoC, idPaciente, totalC)
  VALUES (CURDATE(), p_formaPago, p_idPaciente, p_total);

  SELECT LAST_INSERT_ID() AS idCuenta;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cuenta_eliminar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_eliminar`(
  IN p_idCuenta INT
)
BEGIN
  -- Eliminar primero los detalles
  DELETE FROM detallecuenta
  WHERE idC = p_idCuenta;

  -- Luego eliminar la cuenta
  DELETE FROM cuenta
  WHERE idCuenta = p_idCuenta;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cuenta_listar_por_fecha` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_listar_por_fecha`(
    IN p_fecha DATE
)
BEGIN
    DECLARE v_hasDoctorCol INT DEFAULT 0;
    DECLARE v_protocol_enabled TINYINT DEFAULT 0;

    SELECT COUNT(*)
      INTO v_hasDoctorCol
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detallecuenta'
      AND COLUMN_NAME = 'idDoctor';

    SELECT IFNULL(enabled, 0)
      INTO v_protocol_enabled
    FROM seguridad_protocolo_config
    WHERE id = 1
    LIMIT 1;

    IF v_hasDoctorCol > 0 THEN
      SELECT
          c.idCuenta,
          p.NombreP AS nombrePaciente,
          c.fechaC,
          c.totalC,
          c.FormaPagoC,
          SUM(dc.cantidadDC) AS cantidadTotal,
          GROUP_CONCAT(s.nombreS SEPARATOR ' + ') AS procedimientos,
          CASE
            WHEN COUNT(DISTINCT IFNULL(dc.idDoctor, -1)) > 1 THEN NULL
            ELSE MAX(dc.idDoctor)
          END AS idDoctorCuenta,
          CASE
            WHEN COUNT(DISTINCT IFNULL(dc.idDoctor, -1)) > 1 THEN NULL
            ELSE MAX(d.nombreD)
          END AS nombreDoctorCuenta,
          CASE
            WHEN COUNT(DISTINCT IFNULL(dc.idDoctor, -1)) > 1 THEN 1
            ELSE 0
          END AS doctorMixto
      FROM cuenta c
      INNER JOIN paciente p ON p.idPaciente = c.idPaciente
      INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
      INNER JOIN servicio s ON s.idServicio = dc.idServicio
      LEFT JOIN doctor d ON d.idDoctor = dc.idDoctor
      WHERE c.fechaC = p_fecha
        AND (
          v_protocol_enabled = 0
          OR LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia'
        )
      GROUP BY c.idCuenta
      ORDER BY c.idCuenta DESC;
    ELSE
      SELECT
          c.idCuenta,
          p.NombreP AS nombrePaciente,
          c.fechaC,
          c.totalC,
          c.FormaPagoC,
          SUM(dc.cantidadDC) AS cantidadTotal,
          GROUP_CONCAT(s.nombreS SEPARATOR ' + ') AS procedimientos,
          NULL AS idDoctorCuenta,
          NULL AS nombreDoctorCuenta,
          0 AS doctorMixto
      FROM cuenta c
      INNER JOIN paciente p ON p.idPaciente = c.idPaciente
      INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
      INNER JOIN servicio s ON s.idServicio = dc.idServicio
      WHERE c.fechaC = p_fecha
        AND (
          v_protocol_enabled = 0
          OR LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia'
        )
      GROUP BY c.idCuenta
      ORDER BY c.idCuenta DESC;
    END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_reporte_mensual`(
  IN p_anio SMALLINT,
  IN p_mes TINYINT,
  IN p_idServicio INT
)
BEGIN
  SELECT
    s.idServicio,
    s.nombreS AS tratamiento,
    SUM(dc.cantidadDC) AS cantidadTotalMes,
    ROUND(SUM(dc.subTotalDC), 2) AS montoTotalMes
  FROM cuenta c
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  INNER JOIN servicio s ON s.idServicio = dc.idServicio
  WHERE YEAR(c.fechaC) = p_anio
    AND MONTH(c.fechaC) = p_mes
    AND (p_idServicio IS NULL OR p_idServicio = 0 OR dc.idServicio = p_idServicio)
  GROUP BY s.idServicio, s.nombreS
  ORDER BY s.nombreS ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual_pacientes` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_cuenta_reporte_mensual_pacientes`(
  IN p_anio INT,
  IN p_mes INT,
  IN p_idServicio INT,
  IN p_formaPago VARCHAR(30),
  IN p_idDoctor INT
)
BEGIN
  DECLARE v_colCantidad VARCHAR(32);
  DECLARE v_colPrecio VARCHAR(32);
  DECLARE v_colSubtotal VARCHAR(32);
  DECLARE v_colCuentaFk VARCHAR(32);
  DECLARE v_exprMonto LONGTEXT;
  DECLARE v_sql LONGTEXT;

  SET v_colCantidad = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'cantidadDC'
      ) THEN 'cantidadDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'cantidad'
      ) THEN 'cantidad'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'cantidadD'
      ) THEN 'cantidadD'
      ELSE NULL
    END
  );

  SET v_colPrecio = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'precioUnitarioDC'
      ) THEN 'precioUnitarioDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'precio'
      ) THEN 'precio'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'precioD'
      ) THEN 'precioD'
      ELSE NULL
    END
  );

  SET v_colSubtotal = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subTotalDC'
      ) THEN 'subTotalDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subtotalDC'
      ) THEN 'subtotalDC'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subTotal'
      ) THEN 'subTotal'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'subtotal'
      ) THEN 'subtotal'
      ELSE NULL
    END
  );

  SET v_colCuentaFk = (
    SELECT CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'idCuenta'
      ) THEN 'idCuenta'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'detallecuenta'
          AND column_name = 'idC'
      ) THEN 'idC'
      ELSE NULL
    END
  );

  IF v_colCantidad IS NULL
     OR (v_colSubtotal IS NULL AND v_colPrecio IS NULL)
     OR v_colCuentaFk IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'No se encontraron columnas requeridas en detallecuenta';
  END IF;

  SET v_exprMonto = IF(
    v_colSubtotal IS NOT NULL,
    CONCAT('IFNULL(dc.`', v_colSubtotal, '`, 0)'),
    CONCAT('IFNULL(dc.`', v_colCantidad, '`, 0) * IFNULL(dc.`', v_colPrecio, '`, 0)')
  );

  SET @p_anio_rm = p_anio;
  SET @p_mes_rm = p_mes;
  SET @p_idServicio_rm = p_idServicio;
  SET @p_formaPago_rm = p_formaPago;
  SET @p_idDoctor_rm = p_idDoctor;

  SET v_sql = CONCAT(
    'SELECT ',
    'p.idPaciente AS idPaciente, ',
    'p.NombreP AS nombrePaciente, ',
    'SUM(IFNULL(dc.`', v_colCantidad, '`, 0)) AS cantidadPaciente, ',
    'ROUND(SUM(', v_exprMonto, '), 2) AS montoPaciente ',
    'FROM cuenta c ',
    'INNER JOIN paciente p ON p.idPaciente = c.idPaciente ',
    'INNER JOIN detallecuenta dc ON dc.`', v_colCuentaFk, '` = c.idCuenta ',
    'WHERE YEAR(c.fechaC) = ? ',
    'AND MONTH(c.fechaC) = ? ',
    'AND (? IS NULL OR dc.idServicio = ?) ',
    'AND (? IS NULL OR TRIM(?) = '''' OR LOWER(TRIM(c.FormaPagoC)) = LOWER(TRIM(?))) ',
    'AND (? IS NULL OR dc.idDoctor = ?) ',
    'GROUP BY p.idPaciente, p.NombreP ',
    'ORDER BY montoPaciente DESC, cantidadPaciente DESC, p.NombreP ASC'
  );

  SET @v_sql_rm = v_sql;
  PREPARE stmt_reporte_mensual_pacientes FROM @v_sql_rm;
  EXECUTE stmt_reporte_mensual_pacientes USING
    @p_anio_rm,
    @p_mes_rm,
    @p_idServicio_rm,
    @p_idServicio_rm,
    @p_formaPago_rm,
    @p_formaPago_rm,
    @p_formaPago_rm,
    @p_idDoctor_rm,
    @p_idDoctor_rm;
  DEALLOCATE PREPARE stmt_reporte_mensual_pacientes;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_descuento_crear` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_descuento_crear`(
  IN p_nombre VARCHAR(50),
  IN p_fecha DATE,
  IN p_cantidad DECIMAL(10,2)
)
BEGIN
  INSERT INTO descuento (nombreD, fechaD, cantidadD)
  VALUES (p_nombre, p_fecha, p_cantidad);

  SELECT LAST_INSERT_ID() AS idDescuento;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_descuento_eliminar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_descuento_eliminar`(
  IN p_id INT
)
BEGIN
  DELETE FROM descuento
  WHERE idDescuento = p_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_descuento_listar_por_fecha` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_descuento_listar_por_fecha`(
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_detallecuenta_create` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_detallecuenta_create`(
  IN p_idCuenta INT,
  IN p_idServicio INT,
  IN p_cantidad INT,
  IN p_precio DECIMAL(10,2)
)
BEGIN
  INSERT INTO detallecuenta (
    idC,
    idServicio,
    cantidadDC,
    precioUnitarioDC,
    subTotalDC
  ) VALUES (
    p_idCuenta,
    p_idServicio,
    p_cantidad,
    p_precio,
    p_cantidad * p_precio
  );
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_doctor_get_by_id` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_get_by_id`(
  IN p_idDoctor INT
)
BEGIN
  SELECT
    idDoctor,
    nombreD,
    TelefonoD,
    FirmaD,
    SelloD
  FROM doctor
  WHERE idDoctor = p_idDoctor;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_doctor_citas_pendientes_autorizacion` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_citas_pendientes_autorizacion`(
  IN p_idDoctor INT,
  IN p_limit INT
)
BEGIN
  DECLARE v_limit INT DEFAULT 20;

  SET v_limit = IFNULL(p_limit, 20);
  IF v_limit < 1 THEN
    SET v_limit = 20;
  END IF;
  IF v_limit > 100 THEN
    SET v_limit = 100;
  END IF;

  SELECT
    c.idcitasPaciente,
    c.idPaciente,
    p.NombreP AS nombrePaciente,
    c.fechaCP,
    c.ProcedimientoCP,
    c.valorCP,
    c.abonoCP,
    c.saldoCP
  FROM citaspaciente c
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  WHERE c.doctorId = p_idDoctor
    AND IFNULL(c.estadoAutorizacionCP, 'PENDIENTE') <> 'AUTORIZADA'
  ORDER BY c.fechaCP DESC, c.idcitasPaciente DESC
  LIMIT v_limit;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_doctor_citas_pendientes_autorizar_todos` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_citas_pendientes_autorizar_todos`(
  IN p_idDoctor INT,
  IN p_autorizadoPorUsuarioId INT
)
BEGIN
  UPDATE citaspaciente
  SET
    estadoAutorizacionCP = 'AUTORIZADA',
    metodoAutorizacionCP = 'AUTO_DOCTOR',
    autorizadoPorUsuarioId = p_autorizadoPorUsuarioId,
    fechaAutorizacionCP = NOW()
  WHERE doctorId = p_idDoctor
    AND IFNULL(estadoAutorizacionCP, 'PENDIENTE') <> 'AUTORIZADA';

  SELECT ROW_COUNT() AS affectedRows;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_doctor_listar_select` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_listar_select`()
BEGIN
    SELECT
        idDoctor,
        nombreD
    FROM doctor
    ORDER BY nombreD ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_doctor_listar_select_activos` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_doctor_listar_select_activos`()
BEGIN
    SELECT
        idDoctor,
        nombreD
    FROM doctor
    WHERE COALESCE(estadoD, 1) = 1
    ORDER BY nombreD ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_foto_paciente_crear` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_foto_paciente_crear`(
  IN p_pacienteId INT,
  IN p_fecha DATE,
  IN p_ruta VARCHAR(255)
)
BEGIN
  INSERT INTO fotopaciente (pacienteId, fechaFP, rutaFP)
  VALUES (p_pacienteId, p_fecha, p_ruta);

  SELECT LAST_INSERT_ID() AS idFotoPaciente;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_foto_paciente_eliminar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_foto_paciente_eliminar`(
  IN p_idFotoPaciente INT
)
BEGIN
  -- devolver la ruta ANTES de borrar
  SELECT rutaFP
  FROM fotopaciente
  WHERE idFotoPaciente = p_idFotoPaciente;

  -- borrar registro
  DELETE FROM fotopaciente
  WHERE idFotoPaciente = p_idFotoPaciente;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_foto_paciente_listar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_foto_paciente_listar`(
  IN p_pacienteId INT
)
BEGIN
  SELECT
    idFotoPaciente,
    pacienteId,
    fechaFP,
    rutaFP
  FROM fotopaciente
  WHERE pacienteId = p_pacienteId
  ORDER BY fechaFP ASC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_activar_inicial` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_activar_inicial`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_device_id VARCHAR(128),
  IN p_offline_dias INT
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_offline_dias INT DEFAULT 7;

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Licencia activada correctamente';

  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT;
  DECLARE v_suscripcion_habilitada TINYINT;
  DECLARE v_fecha_vencimiento DATETIME;
  DECLARE v_device_id_db VARCHAR(128);
  DECLARE v_conflicto_sesion INT DEFAULT 0;

  SET v_now = NOW();
  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_device = TRIM(IFNULL(p_device_id, ''));
  SET v_offline_dias = IFNULL(p_offline_dias, 7);
  IF v_offline_dias < 1 THEN SET v_offline_dias = 7; END IF;

  IF v_codigo = '' OR v_device = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia y device_id son requeridos' AS message,
      NULL AS id_licencia,
      NULL AS offline_hasta;
  ELSE
    START TRANSACTION;

    SELECT
      l.id_licencia,
      l.estado_licencia,
      l.estado_suscripcion,
      l.servidor_habilitado,
      l.suscripcion_habilitada,
      l.fecha_vencimiento,
      l.device_id
    INTO
      v_id_licencia,
      v_estado_licencia,
      v_estado_suscripcion,
      v_servidor_habilitado,
      v_suscripcion_habilitada,
      v_fecha_vencimiento,
      v_device_id_db
    FROM licencias l
    WHERE BINARY l.codigo_licencia = BINARY v_codigo
    LIMIT 1
    FOR UPDATE;

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
    ELSEIF BINARY v_estado_licencia <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'licencia_inactiva'; SET v_message = 'La licencia no esta activa';
    ELSEIF IFNULL(v_servidor_habilitado, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'servidor_deshabilitado'; SET v_message = 'El servidor no esta habilitado para esta licencia';
    ELSEIF BINARY v_estado_suscripcion <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'suscripcion_inactiva'; SET v_message = 'La suscripcion no esta activa';
    ELSEIF IFNULL(v_suscripcion_habilitada, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'suscripcion_deshabilitada'; SET v_message = 'La suscripcion no esta habilitada';
    ELSEIF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < v_now THEN
      SET v_ok = 0; SET v_code = 'suscripcion_vencida'; SET v_message = 'La suscripcion esta vencida';
    ELSEIF IFNULL(TRIM(v_device_id_db), '') <> '' THEN
      SET v_ok = 0; SET v_code = 'device_ya_asignado'; SET v_message = 'La licencia ya esta asociada a otro equipo';
    END IF;

    IF v_ok = 1 THEN
      SELECT COUNT(*)
      INTO v_conflicto_sesion
      FROM licencia_sesiones s
      WHERE s.id_licencia = v_id_licencia
        AND s.fecha_sesion = CURDATE()
        AND s.activa = 1
        AND BINARY s.device_id <> BINARY v_device;

      IF v_conflicto_sesion > 0 THEN
        SET v_ok = 0; SET v_code = 'sesion_conflicto_otro_equipo'; SET v_message = 'Ya existe una sesion activa hoy con otro equipo';
      END IF;
    END IF;

    IF v_ok = 1 THEN
      UPDATE licencias
      SET
        device_id = v_device,
        ultima_validacion = v_now,
        offline_hasta = DATE_ADD(v_now, INTERVAL v_offline_dias DAY)
      WHERE id_licencia = v_id_licencia;

      INSERT IGNORE INTO licencia_sesiones (
        id_licencia, codigo_licencia, fecha_sesion, device_id, activa, inicio_sesion, origen_validacion, observacion
      ) VALUES (
        v_id_licencia, v_codigo, CURDATE(), v_device, 1, v_now, 'online', 'activacion_inicial'
      );

      UPDATE licencia_sesiones
      SET activa = 1, fin_sesion = NULL, origen_validacion = 'online', observacion = 'activacion_inicial'
      WHERE id_licencia = v_id_licencia
        AND fecha_sesion = CURDATE()
        AND BINARY device_id = BINARY v_device;

      COMMIT;
    ELSE
      ROLLBACK;
    END IF;

    SELECT
      v_ok AS ok,
      v_code AS code,
      v_message AS message,
      v_id_licencia AS id_licencia,
      (SELECT offline_hasta FROM licencias WHERE id_licencia = v_id_licencia LIMIT 1) AS offline_hasta;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_cerrar_sesion` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_cerrar_sesion`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_device_id VARCHAR(128)
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_rows INT DEFAULT 0;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_device = TRIM(IFNULL(p_device_id, ''));

  SELECT id_licencia
  INTO v_id_licencia
  FROM licencias
  WHERE BINARY codigo_licencia = BINARY v_codigo
  LIMIT 1;

  IF v_id_licencia IS NOT NULL AND v_device <> '' THEN
    UPDATE licencia_sesiones
    SET activa = 0, fin_sesion = NOW(), observacion = 'cierre_servidor'
    WHERE id_licencia = v_id_licencia
      AND fecha_sesion = CURDATE()
      AND BINARY device_id = BINARY v_device
      AND activa = 1;

    SET v_rows = ROW_COUNT();
  END IF;

  SELECT
    1 AS ok,
    'sesion_cerrada' AS code,
    CONCAT('Filas actualizadas: ', v_rows) AS message,
    v_rows AS filas_afectadas;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_crear` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_crear`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_cliente_nombre VARCHAR(120),
  IN p_estado_licencia VARCHAR(20),
  IN p_estado_suscripcion VARCHAR(20),
  IN p_servidor_habilitado TINYINT,
  IN p_suscripcion_habilitada TINYINT,
  IN p_fecha_inicio DATETIME,
  IN p_fecha_vencimiento DATETIME
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_cliente VARCHAR(120);
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT DEFAULT 1;
  DECLARE v_suscripcion_habilitada TINYINT DEFAULT 1;
  DECLARE v_fecha_inicio DATETIME;
  DECLARE v_fecha_vencimiento DATETIME;
  DECLARE v_exists INT DEFAULT 0;
  DECLARE v_id_licencia BIGINT UNSIGNED;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_cliente = TRIM(IFNULL(p_cliente_nombre, ''));
  SET v_estado_licencia = LOWER(TRIM(IFNULL(p_estado_licencia, 'activa')));
  SET v_estado_suscripcion = LOWER(TRIM(IFNULL(p_estado_suscripcion, 'activa')));
  SET v_servidor_habilitado = IFNULL(p_servidor_habilitado, 1);
  SET v_suscripcion_habilitada = IFNULL(p_suscripcion_habilitada, 1);
  SET v_fecha_inicio = IFNULL(p_fecha_inicio, NOW());
  SET v_fecha_vencimiento = p_fecha_vencimiento;

  IF v_servidor_habilitado NOT IN (0, 1) THEN
    SET v_servidor_habilitado = 1;
  END IF;

  IF v_suscripcion_habilitada NOT IN (0, 1) THEN
    SET v_suscripcion_habilitada = 1;
  END IF;

  IF v_codigo = '' OR v_cliente = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'codigo_licencia y cliente_nombre son requeridos' AS message,
      NULL AS id_licencia;
  ELSEIF v_estado_licencia NOT IN ('activa','inactiva','suspendida','cancelada') THEN
    SELECT
      0 AS ok,
      'estado_licencia_invalido' AS code,
      'estado_licencia invalido' AS message,
      NULL AS id_licencia;
  ELSEIF v_estado_suscripcion NOT IN ('activa','inactiva','vencida','suspendida','cancelada') THEN
    SELECT
      0 AS ok,
      'estado_suscripcion_invalido' AS code,
      'estado_suscripcion invalido' AS message,
      NULL AS id_licencia;
  ELSEIF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < v_fecha_inicio THEN
    SELECT
      0 AS ok,
      'rango_fechas_invalido' AS code,
      'fecha_vencimiento no puede ser menor que fecha_inicio' AS message,
      NULL AS id_licencia;
  ELSE
    SELECT COUNT(*)
    INTO v_exists
    FROM licencias
    WHERE BINARY codigo_licencia = BINARY v_codigo;

    IF v_exists > 0 THEN
      SELECT
        0 AS ok,
        'codigo_duplicado' AS code,
        'Ya existe una licencia con ese codigo' AS message,
        NULL AS id_licencia;
    ELSE
      INSERT INTO licencias (
        codigo_licencia,
        cliente_nombre,
        estado_licencia,
        estado_suscripcion,
        servidor_habilitado,
        suscripcion_habilitada,
        fecha_inicio,
        fecha_vencimiento,
        device_id
      ) VALUES (
        v_codigo,
        v_cliente,
        v_estado_licencia,
        v_estado_suscripcion,
        v_servidor_habilitado,
        v_suscripcion_habilitada,
        v_fecha_inicio,
        v_fecha_vencimiento,
        NULL
      );

      SET v_id_licencia = LAST_INSERT_ID();

      SELECT
        1 AS ok,
        'licencia_creada' AS code,
        'Licencia creada correctamente' AS message,
        v_id_licencia AS id_licencia;
    END IF;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_limpiar_sesion_dia` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_limpiar_sesion_dia`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_fecha DATE
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_fecha_objetivo DATE;
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_rows INT DEFAULT 0;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_fecha_objetivo = IFNULL(p_fecha, CURDATE());

  SELECT id_licencia
  INTO v_id_licencia
  FROM licencias
  WHERE BINARY codigo_licencia = BINARY v_codigo
  LIMIT 1;

  IF v_id_licencia IS NOT NULL THEN
    UPDATE licencia_sesiones
    SET activa = 0, fin_sesion = NOW(), observacion = 'limpieza_manual'
    WHERE id_licencia = v_id_licencia
      AND fecha_sesion = v_fecha_objetivo
      AND activa = 1;

    SET v_rows = ROW_COUNT();
  END IF;

  SELECT
    1 AS ok,
    'limpieza_sesion_aplicada' AS code,
    CONCAT('Filas actualizadas: ', v_rows) AS message,
    v_rows AS filas_afectadas;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_renovar_suscripcion` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_renovar_suscripcion`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_nueva_fecha_vencimiento DATETIME,
  IN p_fecha_inicio DATETIME
)
BEGIN
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_fecha_inicio_aplicar DATETIME;
  DECLARE v_fecha_inicio_actual DATETIME;

  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));

  IF v_codigo = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia requerido' AS message,
      NULL AS id_licencia,
      NULL AS fechaVencimiento;
  ELSEIF p_nueva_fecha_vencimiento IS NULL THEN
    SELECT
      0 AS ok,
      'fecha_vencimiento_requerida' AS code,
      'Debe enviar la nueva fecha de vencimiento' AS message,
      NULL AS id_licencia,
      NULL AS fechaVencimiento;
  ELSE
    SELECT id_licencia, fecha_inicio
    INTO v_id_licencia, v_fecha_inicio_actual
    FROM licencias
    WHERE BINARY codigo_licencia = BINARY v_codigo
    LIMIT 1;

    IF v_id_licencia IS NULL THEN
      SELECT
        0 AS ok,
        'licencia_no_encontrada' AS code,
        'La licencia no existe' AS message,
        NULL AS id_licencia,
        NULL AS fechaVencimiento;
    ELSE
      SET v_fecha_inicio_aplicar = IFNULL(p_fecha_inicio, IFNULL(v_fecha_inicio_actual, NOW()));

      IF p_nueva_fecha_vencimiento < v_fecha_inicio_aplicar THEN
        SELECT
          0 AS ok,
          'rango_fechas_invalido' AS code,
          'fecha_vencimiento no puede ser menor que fecha_inicio' AS message,
          v_id_licencia AS id_licencia,
          NULL AS fechaVencimiento;
      ELSE
        UPDATE licencias
        SET
          estado_suscripcion = 'activa',
          suscripcion_habilitada = 1,
          fecha_inicio = v_fecha_inicio_aplicar,
          fecha_vencimiento = p_nueva_fecha_vencimiento
        WHERE id_licencia = v_id_licencia;

        SELECT
          1 AS ok,
          'suscripcion_renovada' AS code,
          'Suscripcion renovada correctamente' AS message,
          v_id_licencia AS id_licencia,
          DATE_FORMAT(p_nueva_fecha_vencimiento, '%Y-%m-%d %H:%i:%s') AS fechaVencimiento;
      END IF;
    END IF;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_reset_pruebas` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_reset_pruebas`(
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_resolver_por_device` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_resolver_por_device`(
  IN p_device_id VARCHAR(128)
)
BEGIN
  DECLARE v_device VARCHAR(128);
  DECLARE v_total INT DEFAULT 0;
  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_codigo_licencia VARCHAR(64);

  SET v_device = TRIM(IFNULL(p_device_id, ''));

  IF v_device = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'device_id requerido' AS message,
      NULL AS id_licencia,
      NULL AS codigo_licencia;
  ELSE
    SELECT COUNT(*)
    INTO v_total
    FROM licencias l
    WHERE IFNULL(TRIM(l.device_id), '') <> ''
      AND BINARY l.device_id = BINARY v_device;

    IF v_total = 0 THEN
      SELECT
        0 AS ok,
        'device_sin_licencia' AS code,
        'Este equipo no tiene licencia asignada' AS message,
        NULL AS id_licencia,
        NULL AS codigo_licencia;
    ELSEIF v_total > 1 THEN
      SELECT
        0 AS ok,
        'device_licencia_conflicto_multiples' AS code,
        'Conflicto: el device_id esta asignado a multiples licencias' AS message,
        NULL AS id_licencia,
        NULL AS codigo_licencia;
    ELSE
      SELECT
        l.id_licencia,
        l.codigo_licencia
      INTO
        v_id_licencia,
        v_codigo_licencia
      FROM licencias l
      WHERE BINARY l.device_id = BINARY v_device
      LIMIT 1;

      SELECT
        1 AS ok,
        'ok' AS code,
        'Licencia resuelta por device_id' AS message,
        v_id_licencia AS id_licencia,
        v_codigo_licencia AS codigo_licencia;
    END IF;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_validar_arranque` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_validar_arranque`(
  IN p_codigo_licencia VARCHAR(64),
  IN p_device_id VARCHAR(128),
  IN p_offline_dias INT
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_offline_dias INT DEFAULT 7;

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Arranque autorizado';

  DECLARE v_codigo VARCHAR(64);
  DECLARE v_device VARCHAR(128);

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_licencia VARCHAR(20);
  DECLARE v_servidor_habilitado TINYINT;
  DECLARE v_device_id_db VARCHAR(128);

  DECLARE v_conflicto_sesion INT DEFAULT 0;
  DECLARE v_sesion_propia_hoy INT DEFAULT 0;
  DECLARE v_primera_sesion_hoy TINYINT DEFAULT 0;

  SET v_now = NOW();
  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));
  SET v_device = TRIM(IFNULL(p_device_id, ''));
  SET v_offline_dias = IFNULL(p_offline_dias, 7);
  IF v_offline_dias < 1 THEN SET v_offline_dias = 7; END IF;

  IF v_codigo = '' OR v_device = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia y device_id son requeridos' AS message,
      NULL AS id_licencia,
      NULL AS offline_hasta,
      0 AS primera_sesion_hoy;
  ELSE
    START TRANSACTION;

    SELECT
      l.id_licencia,
      l.estado_licencia,
      l.servidor_habilitado,
      l.device_id
    INTO
      v_id_licencia,
      v_estado_licencia,
      v_servidor_habilitado,
      v_device_id_db
    FROM licencias l
    WHERE BINARY l.codigo_licencia = BINARY v_codigo
    LIMIT 1
    FOR UPDATE;

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
    ELSEIF BINARY v_estado_licencia <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'licencia_inactiva'; SET v_message = 'La licencia no esta activa';
    ELSEIF IFNULL(v_servidor_habilitado, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'servidor_deshabilitado'; SET v_message = 'El servidor no esta habilitado para esta licencia';
    ELSEIF IFNULL(TRIM(v_device_id_db), '') = '' THEN
      SET v_ok = 0; SET v_code = 'device_no_asignado'; SET v_message = 'La licencia no esta activada en ningun equipo';
    ELSEIF BINARY v_device_id_db <> BINARY v_device THEN
      SET v_ok = 0; SET v_code = 'device_no_autorizado'; SET v_message = 'Este equipo no coincide con el device_id autorizado';
    END IF;

    IF v_ok = 1 THEN
      SELECT COUNT(*)
      INTO v_conflicto_sesion
      FROM licencia_sesiones s
      WHERE s.id_licencia = v_id_licencia
        AND s.fecha_sesion = CURDATE()
        AND s.activa = 1
        AND BINARY s.device_id <> BINARY v_device;

      IF v_conflicto_sesion > 0 THEN
        SET v_ok = 0; SET v_code = 'sesion_conflicto_otro_equipo'; SET v_message = 'Ya existe una sesion activa hoy con otro equipo';
      END IF;
    END IF;

    IF v_ok = 1 THEN
      UPDATE licencias
      SET
        ultima_validacion = v_now,
        offline_hasta = DATE_ADD(v_now, INTERVAL v_offline_dias DAY)
      WHERE id_licencia = v_id_licencia;

      SELECT COUNT(*)
      INTO v_sesion_propia_hoy
      FROM licencia_sesiones s
      WHERE s.id_licencia = v_id_licencia
        AND s.fecha_sesion = CURDATE()
        AND BINARY s.device_id = BINARY v_device;

      IF v_sesion_propia_hoy = 0 THEN
        SET v_primera_sesion_hoy = 1;
        INSERT INTO licencia_sesiones (
          id_licencia, codigo_licencia, fecha_sesion, device_id, activa, inicio_sesion, origen_validacion, observacion
        ) VALUES (
          v_id_licencia, v_codigo, CURDATE(), v_device, 1, v_now, 'online', 'primera_sesion_dia'
        );
      ELSE
        SET v_primera_sesion_hoy = 0;
        UPDATE licencia_sesiones
        SET activa = 1, fin_sesion = NULL, observacion = 'rearranque_mismo_dia'
        WHERE id_licencia = v_id_licencia
          AND fecha_sesion = CURDATE()
          AND BINARY device_id = BINARY v_device;
      END IF;

      COMMIT;
    ELSE
      ROLLBACK;
    END IF;

    SELECT
      v_ok AS ok,
      v_code AS code,
      v_message AS message,
      v_id_licencia AS id_licencia,
      (SELECT offline_hasta FROM licencias WHERE id_licencia = v_id_licencia LIMIT 1) AS offline_hasta,
      v_primera_sesion_hoy AS primera_sesion_hoy;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_licencia_validar_uso_sistema` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_licencia_validar_uso_sistema`(
  IN p_codigo_licencia VARCHAR(64)
)
BEGIN
  DECLARE v_now DATETIME;
  DECLARE v_codigo VARCHAR(64);
  DECLARE v_warning_window_days INT DEFAULT 3;

  DECLARE v_id_licencia BIGINT UNSIGNED;
  DECLARE v_estado_suscripcion VARCHAR(20);
  DECLARE v_suscripcion_habilitada TINYINT;
  DECLARE v_fecha_vencimiento DATETIME;
  DECLARE v_dias_restantes INT DEFAULT NULL;
  DECLARE v_proxima_a_vencer TINYINT DEFAULT 0;
  DECLARE v_mensaje_aviso VARCHAR(255) DEFAULT NULL;

  DECLARE v_ok TINYINT DEFAULT 1;
  DECLARE v_code VARCHAR(60) DEFAULT 'ok';
  DECLARE v_message VARCHAR(255) DEFAULT 'Uso del sistema autorizado';

  SET v_now = NOW();
  SET v_codigo = TRIM(IFNULL(p_codigo_licencia, ''));

  IF v_codigo = '' THEN
    SELECT
      0 AS ok,
      'datos_incompletos' AS code,
      'Codigo de licencia requerido' AS message,
      NULL AS id_licencia,
      NULL AS estadoSuscripcion,
      NULL AS suscripcionHabilitada,
      NULL AS fechaVencimiento,
      NULL AS diasRestantes,
      0 AS proximaAVencer,
      v_warning_window_days AS warningWindowDays,
      NULL AS mensajeAviso;
  ELSE
    SELECT
      l.id_licencia,
      l.estado_suscripcion,
      l.suscripcion_habilitada,
      l.fecha_vencimiento
    INTO
      v_id_licencia,
      v_estado_suscripcion,
      v_suscripcion_habilitada,
      v_fecha_vencimiento
    FROM licencias l
    WHERE BINARY l.codigo_licencia = BINARY v_codigo
    LIMIT 1;

    IF v_id_licencia IS NULL THEN
      SET v_ok = 0; SET v_code = 'licencia_no_encontrada'; SET v_message = 'La licencia no existe';
    ELSEIF BINARY v_estado_suscripcion <> BINARY 'activa' THEN
      SET v_ok = 0; SET v_code = 'suscripcion_inactiva'; SET v_message = 'La suscripcion no esta activa';
    ELSEIF IFNULL(v_suscripcion_habilitada, 0) <> 1 THEN
      SET v_ok = 0; SET v_code = 'suscripcion_deshabilitada'; SET v_message = 'La suscripcion no esta habilitada';
    ELSEIF v_fecha_vencimiento IS NOT NULL AND v_fecha_vencimiento < v_now THEN
      SET v_ok = 0; SET v_code = 'suscripcion_vencida'; SET v_message = 'La suscripcion esta vencida';
    END IF;

    IF v_fecha_vencimiento IS NOT NULL THEN
      SET v_dias_restantes = DATEDIFF(v_fecha_vencimiento, v_now);
    END IF;

    IF BINARY v_estado_suscripcion = BINARY 'activa'
      AND IFNULL(v_suscripcion_habilitada, 0) = 1
      AND v_fecha_vencimiento IS NOT NULL
      AND v_dias_restantes IS NOT NULL
      AND v_dias_restantes >= 0
      AND v_dias_restantes <= v_warning_window_days THEN
      SET v_proxima_a_vencer = 1;

      IF v_dias_restantes = 0 THEN
        SET v_mensaje_aviso = CONCAT(
          'Su suscripcion vence hoy (',
          DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s'),
          ').'
        );
      ELSEIF v_dias_restantes = 1 THEN
        SET v_mensaje_aviso = CONCAT(
          'Su suscripcion vence en 1 dia (',
          DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s'),
          ').'
        );
      ELSE
        SET v_mensaje_aviso = CONCAT(
          'Su suscripcion vence en ',
          v_dias_restantes,
          ' dias (',
          DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s'),
          ').'
        );
      END IF;
    END IF;

    SELECT
      v_ok AS ok,
      v_code AS code,
      v_message AS message,
      v_id_licencia AS id_licencia,
      v_estado_suscripcion AS estadoSuscripcion,
      IFNULL(v_suscripcion_habilitada, 0) AS suscripcionHabilitada,
      IF(v_fecha_vencimiento IS NULL, NULL, DATE_FORMAT(v_fecha_vencimiento, '%Y-%m-%d %H:%i:%s')) AS fechaVencimiento,
      v_dias_restantes AS diasRestantes,
      v_proxima_a_vencer AS proximaAVencer,
      v_warning_window_days AS warningWindowDays,
      v_mensaje_aviso AS mensajeAviso;
  END IF;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_login_usuario` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_login_usuario`(IN p_correo VARCHAR(60))
BEGIN
    SELECT
        u.idUsuario,
        u.correoU,
        u.passwordU,
        u.NombreU,
        u.Cargo,
        r.idRol,
        r.nombreR
    FROM usuario u
    INNER JOIN rol r ON r.idRol = u.idRol
    WHERE u.correoU = p_correo
    LIMIT 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_odontograma_get_by_id` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_get_by_id`(
  IN p_idOdontograma INT
)
BEGIN
  SELECT *
  FROM odontograma
  WHERE idOdontograma = p_idOdontograma
  LIMIT 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_odontograma_guardar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_guardar`(
  IN p_idPaciente INT,
  IN p_fecha DATE,
  IN p_odontograma MEDIUMTEXT
)
BEGIN
  INSERT INTO odontograma (idPaciente, fechaO, Odontograma)
  VALUES (p_idPaciente, p_fecha, p_odontograma);
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_odontograma_historial` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_historial`(
  IN p_idPaciente INT
)
BEGIN
  SELECT
    idOdontograma,
    idPaciente,
    fechaO
  FROM odontograma
  WHERE idPaciente = p_idPaciente
  ORDER BY fechaO DESC, idOdontograma DESC;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_odontograma_ultimo` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_odontograma_ultimo`(
  IN p_idPaciente INT
)
BEGIN
  SELECT *
  FROM odontograma
  WHERE idPaciente = p_idPaciente
  ORDER BY fechaO DESC, idOdontograma DESC
  LIMIT 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_actualizar_firma` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_actualizar_firma`(
  IN p_idPaciente INT,
  IN p_firmaP VARCHAR(255)
)
BEGIN
  UPDATE paciente
  SET firmaP = p_firmaP
  WHERE idPaciente = p_idPaciente;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_buscar_ligero` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_buscar_ligero`(
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_get_by_id` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_get_by_id`(
  IN p_idPaciente INT
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
    NombreP,
    direccionP,
    telefonoP,
    fechaRegistroP,
    fechaNacimientoP,
    recomendadoP,
    encargadoP,
    motivoConsultaP,
    ultimaVisitaP,
    duiP,
    firmaP,
    tipomordidaP,
    tipoTratamientoP,
    endodonciaP,
    dienteP,
    vitalidadP,
    percusionP,
    medProvisional,
    medTrabajoP,
    fotoPrincipalId,
    historiaMedicaP,
    historiaOdontologicaP,
    examenClinicoP,
    examenRadiologicoP,
    examenComplementarioP,
    tratamientoP,
    notasObservacionP,
    estadoP
  FROM paciente
  WHERE idPaciente = p_idPaciente
    AND (
      v_protocol_enabled = 0
      OR LOWER(TRIM(IFNULL(tipoTratamientoP, ''))) = 'odontologia'
    )
  LIMIT 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_guardar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_guardar`(
  IN p_idPaciente INT,
  IN p_NombreP VARCHAR(60),
  IN p_direccionP VARCHAR(100),
  IN p_telefonoP VARCHAR(60),
  IN p_fechaRegistroP DATE,
  IN p_estadoP TINYINT,
  IN p_fechaNacimientoP DATE,
  IN p_recomendadoP VARCHAR(60),
  IN p_encargadoP VARCHAR(60),
  IN p_motivoConsultaP VARCHAR(60),
  IN p_ultimaVisitaP DATE,
  IN p_duiP VARCHAR(15),
  IN p_firmaP VARCHAR(255),
  IN p_tipomordidaP VARCHAR(20),
  IN p_tipoTratamientoP VARCHAR(20),
  IN p_endodonciaP VARCHAR(40),
  IN p_dienteP VARCHAR(20),
  IN p_vitalidadP VARCHAR(60),
  IN p_percusionP VARCHAR(60),
  IN p_medProvisional VARCHAR(255),
  IN p_medTrabajoP VARCHAR(255),
  IN p_historiaMedicaP VARCHAR(255),
  IN p_historiaOdontologicaP VARCHAR(255),
  IN p_examenClinicoP VARCHAR(100),
  IN p_examenRadiologicoP VARCHAR(100),
  IN p_examenComplementarioP VARCHAR(100),
  IN p_tratamientoP VARCHAR(255),
  IN p_notasObservacionP VARCHAR(255)
)
BEGIN

  IF p_idPaciente IS NULL OR p_idPaciente = 0 THEN
    INSERT INTO paciente (
      NombreP, direccionP, telefonoP, fechaRegistroP, estadoP, fechaNacimientoP,
      recomendadoP, encargadoP, motivoConsultaP, ultimaVisitaP,
      duiP, firmaP, tipomordidaP, tipoTratamientoP,
      endodonciaP, dienteP, vitalidadP, percusionP,
      medProvisional, medTrabajoP,
      historiaMedicaP, historiaOdontologicaP,
      examenClinicoP, examenRadiologicoP, examenComplementarioP,
      tratamientoP, notasObservacionP
    ) VALUES (
      p_NombreP, p_direccionP, p_telefonoP, p_fechaRegistroP, p_estadoP, p_fechaNacimientoP,
      p_recomendadoP, p_encargadoP, p_motivoConsultaP, p_ultimaVisitaP,
      p_duiP, p_firmaP, p_tipomordidaP, p_tipoTratamientoP,
      p_endodonciaP, p_dienteP, p_vitalidadP, p_percusionP,
      p_medProvisional, p_medTrabajoP,
      p_historiaMedicaP, p_historiaOdontologicaP,
      p_examenClinicoP, p_examenRadiologicoP, p_examenComplementarioP,
      p_tratamientoP, p_notasObservacionP
    );

    SELECT LAST_INSERT_ID() AS idPaciente;

  ELSE
    UPDATE paciente SET
      NombreP = p_NombreP,
      direccionP = p_direccionP,
      telefonoP = p_telefonoP,
      fechaRegistroP = p_fechaRegistroP,
      estadoP = p_estadoP,
      fechaNacimientoP = p_fechaNacimientoP,
      recomendadoP = p_recomendadoP,
      encargadoP = p_encargadoP,
      motivoConsultaP = p_motivoConsultaP,
      ultimaVisitaP = CASE
        WHEN p_ultimaVisitaP IS NULL THEN ultimaVisitaP
        WHEN ultimaVisitaP IS NULL OR p_ultimaVisitaP > ultimaVisitaP THEN p_ultimaVisitaP
        ELSE ultimaVisitaP
      END,
      duiP = p_duiP,
      firmaP = p_firmaP,
      tipomordidaP = p_tipomordidaP,
      tipoTratamientoP = p_tipoTratamientoP,
      endodonciaP = p_endodonciaP,
      dienteP = p_dienteP,
      vitalidadP = p_vitalidadP,
      percusionP = p_percusionP,
      medProvisional = p_medProvisional,
      medTrabajoP = p_medTrabajoP,
      historiaMedicaP = p_historiaMedicaP,
      historiaOdontologicaP = p_historiaOdontologicaP,
      examenClinicoP = p_examenClinicoP,
      examenRadiologicoP = p_examenRadiologicoP,
      examenComplementarioP = p_examenComplementarioP,
      tratamientoP = p_tratamientoP,
      notasObservacionP = p_notasObservacionP
    WHERE idPaciente = p_idPaciente;

    SELECT p_idPaciente AS idPaciente;
  END IF;

END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_monitor_contacto_guardar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_monitor_contacto_guardar`(
  IN p_idPaciente INT,
  IN p_fechaCorte DATE,
  IN p_sms TINYINT,
  IN p_llamada TINYINT,
  IN p_actualizadoPorUsuarioId INT
)
BEGIN
  INSERT INTO paciente_seguimiento_contacto (
    idPaciente,
    fechaCorte,
    sms,
    llamada,
    actualizadoPorUsuarioId
  ) VALUES (
    p_idPaciente,
    p_fechaCorte,
    IFNULL(p_sms, 0),
    IFNULL(p_llamada, 0),
    p_actualizadoPorUsuarioId
  )
  ON DUPLICATE KEY UPDATE
    sms = VALUES(sms),
    llamada = VALUES(llamada),
    actualizadoPorUsuarioId = VALUES(actualizadoPorUsuarioId),
    actualizadoEn = CURRENT_TIMESTAMP;

  SELECT
    idPaciente,
    DATE_FORMAT(fechaCorte, '%Y-%m-%d') AS fechaCorte,
    sms,
    llamada
  FROM paciente_seguimiento_contacto
  WHERE idPaciente = p_idPaciente
    AND fechaCorte = p_fechaCorte
  LIMIT 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_monitor_seguimiento_listar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_monitor_seguimiento_listar`(
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_monitor_seguimiento_totales` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_monitor_seguimiento_totales`(
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_paciente_search` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_paciente_search`(
    IN p_query VARCHAR(60)
)
BEGIN
    SELECT
        idPaciente,
        NombreP
    FROM paciente
    WHERE estadoP = 1
      AND NombreP LIKE CONCAT('%', p_query, '%')
    ORDER BY NombreP
    LIMIT 10;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_seguridad_protocolo_get` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_seguridad_protocolo_get`()
BEGIN
  SELECT
    id,
    IF(enabled = 1, 1, 0) AS enabled,
    updatedByUsuarioId,
    updatedAt
  FROM seguridad_protocolo_config
  WHERE id = 1
  LIMIT 1;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_seguridad_protocolo_set` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_seguridad_protocolo_set`(
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
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_servicio_buscar_ligero` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_buscar_ligero`(
  IN p_q VARCHAR(50)
)
BEGIN
  SELECT
    idServicio,
    nombreS,
    precioS
  FROM servicio
  WHERE nombreS LIKE CONCAT('%', p_q, '%')
  ORDER BY nombreS
  LIMIT 10;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_servicio_create` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_create`(
    IN p_nombre VARCHAR(50),
    IN p_precio DECIMAL(10,2)
)
BEGIN
    INSERT INTO servicio (nombreS, precioS)
    VALUES (p_nombre, p_precio);

    -- devolver el ID creado
    SELECT LAST_INSERT_ID() AS idServicio;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_servicio_delete` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_delete`(
  IN p_id INT
)
BEGIN
  DELETE FROM servicio
  WHERE idServicio = p_id;

  SELECT ROW_COUNT() AS filasAfectadas;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_servicio_listar` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_listar`()
BEGIN
  SELECT idServicio, nombreS, precioS
  FROM servicio
  ORDER BY nombreS;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_servicio_update_nombre` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_update_nombre`(
  IN p_id INT,
  IN p_nombre VARCHAR(50)
)
BEGIN
  UPDATE servicio
  SET nombreS = p_nombre
  WHERE idServicio = p_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_servicio_update_precio` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_servicio_update_precio`(
  IN p_id INT,
  IN p_precio DECIMAL(10,2)
)
BEGIN
  UPDATE servicio
  SET precioS = p_precio
  WHERE idServicio = p_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 DROP PROCEDURE IF EXISTS `sp_usuario_crear` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`%` PROCEDURE `sp_usuario_crear`(
    IN p_correo   VARCHAR(60),
    IN p_password VARCHAR(255),
    IN p_nombre   VARCHAR(60),
    IN p_cargo    VARCHAR(20),
    IN p_idRol    INT,
    IN p_idDoctor INT
)
BEGIN
    -- Verificar correo duplicado
    IF EXISTS (
        SELECT 1 FROM usuario WHERE correoU = p_correo
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'EL_CORREO_YA_EXISTE';
    END IF;

    INSERT INTO usuario (
        correoU,
        passwordU,
        NombreU,
        Cargo,
        idRol,
        idDoctor
    ) VALUES (
        p_correo,
        p_password,
        p_nombre,
        p_cargo,
        p_idRol,
        p_idDoctor
    );

    SELECT LAST_INSERT_ID() AS idUsuario;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-18 14:47:14
