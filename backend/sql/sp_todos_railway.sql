-- =====================================================
-- STORED PROCEDURES CONSOLIDADOS PARA RAILWAY MYSQL
-- Generado desde backend/sql/sp_base_actual.sql
-- Nota: se removio DEFINER para evitar errores de importacion
-- =====================================================

DROP PROCEDURE IF EXISTS `sp_agenda_create`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_create`(
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255)
)
BEGIN
  INSERT INTO agendapersona (
    nombreAP,
    horaAP,
    fechaAP,
    contactoAP,
    estadoAP,
    comentarioAP
  ) VALUES (
    p_nombreAP,
    p_horaAP,
    p_fechaAP,
    p_contactoAP,
    p_estadoAP,
    p_comentarioAP
  );

  SELECT LAST_INSERT_ID() AS idAgendaAP;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_agenda_por_fecha`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_por_fecha`(
    IN p_fecha DATE
)
BEGIN
    SELECT
        idAgendaAP,
        nombreAP,
        fechaAP,
        horaAP,
        contactoAP,
        estadoAP,
        comentarioAP
    FROM agendapersona
    WHERE fechaAP = p_fecha
    ORDER BY horaAP ASC;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_agenda_update`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_update`(
  IN p_idAgendaAP INT,
  IN p_nombreAP VARCHAR(100),
  IN p_horaAP VARCHAR(20),
  IN p_fechaAP DATE,
  IN p_contactoAP VARCHAR(50),
  IN p_estadoAP VARCHAR(30),
  IN p_comentarioAP VARCHAR(255)
)
BEGIN
  UPDATE agendapersona
  SET
    nombreAP     = COALESCE(p_nombreAP, nombreAP),
    horaAP       = COALESCE(p_horaAP, horaAP),
    fechaAP      = COALESCE(p_fechaAP, fechaAP),
    contactoAP   = COALESCE(p_contactoAP, contactoAP),
    estadoAP     = COALESCE(p_estadoAP, estadoAP),
    comentarioAP = COALESCE(p_comentarioAP, comentarioAP)
  WHERE idAgendaAP = p_idAgendaAP;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_agenda_delete`;
DELIMITER $$
CREATE PROCEDURE `sp_agenda_delete`(
  IN p_idAgendaAP INT
)
BEGIN
  DELETE FROM agendapersona
  WHERE idAgendaAP = p_idAgendaAP;

  SELECT ROW_COUNT() AS filasAfectadas;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cita_paciente_actualizar`;
DELIMITER $$
CREATE PROCEDURE `sp_cita_paciente_actualizar`(
  IN p_idCitasPaciente INT,
  IN p_fechaCP DATE,
  IN p_procedimientoCP VARCHAR(200),
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cita_paciente_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_cita_paciente_crear`(
  IN p_idPaciente INT,
  IN p_fecha DATE,
  IN p_procedimiento VARCHAR(200),
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cita_paciente_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_cita_paciente_listar`(
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
    END AS puedeVerDoctor
  FROM citaspaciente c
  LEFT JOIN doctor d ON d.idDoctor = c.doctorId
  WHERE c.idPaciente = p_idPaciente
  ORDER BY c.fechaCP ASC;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cita_paciente_autorizar`;
DELIMITER $$
CREATE PROCEDURE `sp_cita_paciente_autorizar`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cuenta_create`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_create`(
  IN p_idPaciente INT,
  IN p_formaPago VARCHAR(40),
  IN p_total DECIMAL(10,2)
)
BEGIN
  INSERT INTO cuenta (fechaC, FormaPagoC, idPaciente, totalC)
  VALUES (CURDATE(), p_formaPago, p_idPaciente, p_total);

  SELECT LAST_INSERT_ID() AS idCuenta;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cuenta_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_eliminar`(
  IN p_idCuenta INT
)
BEGIN
  -- Eliminar primero los detalles
  DELETE FROM detallecuenta
  WHERE idC = p_idCuenta;

  -- Luego eliminar la cuenta
  DELETE FROM cuenta
  WHERE idCuenta = p_idCuenta;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cuenta_listar_por_fecha`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_listar_por_fecha`(
    IN p_fecha DATE
)
BEGIN
    DECLARE v_hasDoctorCol INT DEFAULT 0;

    SELECT COUNT(*)
      INTO v_hasDoctorCol
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'detallecuenta'
      AND COLUMN_NAME = 'idDoctor';

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
      GROUP BY c.idCuenta
      ORDER BY c.idCuenta DESC;
    END IF;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cuenta_asignar_doctor_por_cuenta`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_asignar_doctor_por_cuenta`(
  IN p_idCuenta INT,
  IN p_idDoctor INT
)
BEGIN
  UPDATE detallecuenta
  SET idDoctor = p_idDoctor
  WHERE idC = p_idCuenta;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_reporte_mensual`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_cuenta_reporte_mensual_pacientes`;
DELIMITER $$
CREATE PROCEDURE `sp_cuenta_reporte_mensual_pacientes`(
  IN p_anio SMALLINT,
  IN p_mes TINYINT,
  IN p_idServicio INT
)
BEGIN
  SELECT
    p.idPaciente,
    p.NombreP AS nombrePaciente,
    SUM(dc.cantidadDC) AS cantidadPaciente,
    ROUND(SUM(dc.subTotalDC), 2) AS montoPaciente
  FROM cuenta c
  INNER JOIN detallecuenta dc ON dc.idC = c.idCuenta
  INNER JOIN paciente p ON p.idPaciente = c.idPaciente
  WHERE YEAR(c.fechaC) = p_anio
    AND MONTH(c.fechaC) = p_mes
    AND dc.idServicio = p_idServicio
  GROUP BY p.idPaciente, p.NombreP
  ORDER BY p.NombreP ASC;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_descuento_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_descuento_crear`(
  IN p_nombre VARCHAR(50),
  IN p_fecha DATE,
  IN p_cantidad DECIMAL(10,2)
)
BEGIN
  INSERT INTO descuento (nombreD, fechaD, cantidadD)
  VALUES (p_nombre, p_fecha, p_cantidad);

  SELECT LAST_INSERT_ID() AS idDescuento;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_descuento_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_descuento_eliminar`(
  IN p_id INT
)
BEGIN
  DELETE FROM descuento
  WHERE idDescuento = p_id;
END$$
DELIMITER ;

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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_detallecuenta_create`;
DELIMITER $$
CREATE PROCEDURE `sp_detallecuenta_create`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_doctor_get_by_id`;
DELIMITER $$
CREATE PROCEDURE `sp_doctor_get_by_id`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_doctor_listar_select`;
DELIMITER $$
CREATE PROCEDURE `sp_doctor_listar_select`()
BEGIN
    SELECT
        idDoctor,
        nombreD
    FROM doctor
    ORDER BY nombreD ASC;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_foto_paciente_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_foto_paciente_crear`(
  IN p_pacienteId INT,
  IN p_fecha DATE,
  IN p_ruta VARCHAR(255)
)
BEGIN
  INSERT INTO fotopaciente (pacienteId, fechaFP, rutaFP)
  VALUES (p_pacienteId, p_fecha, p_ruta);

  SELECT LAST_INSERT_ID() AS idFotoPaciente;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_foto_paciente_eliminar`;
DELIMITER $$
CREATE PROCEDURE `sp_foto_paciente_eliminar`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_foto_paciente_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_foto_paciente_listar`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_login_usuario`;
DELIMITER $$
CREATE PROCEDURE `sp_login_usuario`(IN p_correo VARCHAR(60))
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_odontograma_guardar`;
DELIMITER $$
CREATE PROCEDURE `sp_odontograma_guardar`(
  IN p_idPaciente INT,
  IN p_fecha DATE,
  IN p_odontograma MEDIUMTEXT
)
BEGIN
  INSERT INTO odontograma (idPaciente, fechaO, Odontograma)
  VALUES (p_idPaciente, p_fecha, p_odontograma);
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_odontograma_ultimo`;
DELIMITER $$
CREATE PROCEDURE `sp_odontograma_ultimo`(
  IN p_idPaciente INT
)
BEGIN
  SELECT *
  FROM odontograma
  WHERE idPaciente = p_idPaciente
  ORDER BY fechaO DESC, idOdontograma DESC
  LIMIT 1;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_odontograma_historial`;
DELIMITER $$
CREATE PROCEDURE `sp_odontograma_historial`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_odontograma_get_by_id`;
DELIMITER $$
CREATE PROCEDURE `sp_odontograma_get_by_id`(
  IN p_idOdontograma INT
)
BEGIN
  SELECT *
  FROM odontograma
  WHERE idOdontograma = p_idOdontograma
  LIMIT 1;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_paciente_actualizar_firma`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_actualizar_firma`(
  IN p_idPaciente INT,
  IN p_firmaP VARCHAR(255)
)
BEGIN
  UPDATE paciente
  SET firmaP = p_firmaP
  WHERE idPaciente = p_idPaciente;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_paciente_buscar_ligero`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_buscar_ligero`(
  IN p_texto VARCHAR(60)
)
BEGIN
  SELECT
    idPaciente,
    NombreP
  FROM paciente
  WHERE NombreP LIKE CONCAT('%', p_texto, '%')
  ORDER BY NombreP
  LIMIT 10;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_paciente_get_by_id`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_get_by_id`(
    IN p_idPaciente INT
)
BEGIN
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
    LIMIT 1;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_paciente_guardar`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_guardar`(
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
      ultimaVisitaP = p_ultimaVisitaP,
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

END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_paciente_search`;
DELIMITER $$
CREATE PROCEDURE `sp_paciente_search`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_servicio_buscar_ligero`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_buscar_ligero`(
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
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_servicio_create`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_create`(
    IN p_nombre VARCHAR(50),
    IN p_precio DECIMAL(10,2)
)
BEGIN
    INSERT INTO servicio (nombreS, precioS)
    VALUES (p_nombre, p_precio);

    -- devolver el ID creado
    SELECT LAST_INSERT_ID() AS idServicio;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_servicio_listar`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_listar`()
BEGIN
  SELECT idServicio, nombreS, precioS
  FROM servicio
  ORDER BY nombreS;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_servicio_update_nombre`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_update_nombre`(
  IN p_id INT,
  IN p_nombre VARCHAR(50)
)
BEGIN
  UPDATE servicio
  SET nombreS = p_nombre
  WHERE idServicio = p_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_servicio_update_precio`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_update_precio`(
  IN p_id INT,
  IN p_precio DECIMAL(10,2)
)
BEGIN
  UPDATE servicio
  SET precioS = p_precio
  WHERE idServicio = p_id;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_servicio_delete`;
DELIMITER $$
CREATE PROCEDURE `sp_servicio_delete`(
  IN p_id INT
)
BEGIN
  DELETE FROM servicio
  WHERE idServicio = p_id;

  SELECT ROW_COUNT() AS filasAfectadas;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS `sp_usuario_crear`;
DELIMITER $$
CREATE PROCEDURE `sp_usuario_crear`(
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
END$$
DELIMITER ;

