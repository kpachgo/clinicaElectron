-- Notas para la proxima cita (indicaciones puntuales, distintas a paciente.notasObservacionP).
-- Fecha: 2026-09-28
--
-- Regla de vigencia (calculada, sin columna de estado):
--   una nota esta VIGENTE mientras el paciente no tenga en citaspaciente una cita con
--   fecha MAYOR a fechaNotaPC. Al registrar la siguiente cita la nota deja de avisarse
--   sola y queda en el historial como "cumplida" con la fecha de esa cita.
--   Si se borra esa cita, la nota vuelve a estar vigente.
--
-- Orden al desplegar: primero este SQL, despues el backend.

CREATE TABLE IF NOT EXISTS paciente_nota_proxima_cita (
  idNotaPC INT NOT NULL AUTO_INCREMENT,
  idPaciente INT NOT NULL,
  fechaNotaPC DATE NOT NULL,
  notaPC VARCHAR(500) NOT NULL,
  creadoPorUsuarioId INT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idNotaPC),
  KEY idx_pnpc_paciente_fecha (idPaciente, fechaNotaPC),
  KEY idx_pnpc_creadoPorUsuarioId (creadoPorUsuarioId),
  CONSTRAINT fk_pnpc_paciente
    FOREIGN KEY (idPaciente) REFERENCES paciente(idPaciente),
  CONSTRAINT fk_pnpc_usuario
    FOREIGN KEY (creadoPorUsuarioId) REFERENCES usuario(idUsuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_listar`;
DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_crear`;
DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_actualizar`;
DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_eliminar`;

DELIMITER $$

CREATE PROCEDURE `sp_paciente_nota_proxima_listar`(
  IN p_idPaciente INT
)
BEGIN
  SELECT
    x.idNotaPC,
    x.idPaciente,
    x.fechaNotaPC,
    x.notaPC,
    x.creadoPorUsuarioId,
    x.creadoPor,
    x.creadoEn,
    x.cumplidaEnCita,
    CASE WHEN x.cumplidaEnCita IS NULL THEN 1 ELSE 0 END AS vigente
  FROM (
    SELECT
      n.idNotaPC,
      n.idPaciente,
      DATE_FORMAT(n.fechaNotaPC, '%Y-%m-%d') AS fechaNotaPC,
      n.notaPC,
      n.creadoPorUsuarioId,
      u.NombreU AS creadoPor,
      DATE_FORMAT(n.creadoEn, '%Y-%m-%d %H:%i') AS creadoEn,
      (
        SELECT DATE_FORMAT(MIN(DATE(c.fechaCP)), '%Y-%m-%d')
        FROM citaspaciente c
        WHERE c.idPaciente = n.idPaciente
          AND DATE(c.fechaCP) > n.fechaNotaPC
      ) AS cumplidaEnCita
    FROM paciente_nota_proxima_cita n
    LEFT JOIN usuario u ON u.idUsuario = n.creadoPorUsuarioId
    WHERE n.idPaciente = p_idPaciente
  ) x
  ORDER BY x.fechaNotaPC DESC, x.idNotaPC DESC;
END $$

CREATE PROCEDURE `sp_paciente_nota_proxima_crear`(
  IN p_idPaciente INT,
  IN p_fechaNotaPC DATE,
  IN p_notaPC VARCHAR(500),
  IN p_creadoPorUsuarioId INT
)
BEGIN
  INSERT INTO paciente_nota_proxima_cita (idPaciente, fechaNotaPC, notaPC, creadoPorUsuarioId)
  VALUES (p_idPaciente, p_fechaNotaPC, TRIM(p_notaPC), p_creadoPorUsuarioId);
  SELECT LAST_INSERT_ID() AS idNotaPC;
END $$

CREATE PROCEDURE `sp_paciente_nota_proxima_actualizar`(
  IN p_idNotaPC INT,
  IN p_notaPC VARCHAR(500)
)
BEGIN
  UPDATE paciente_nota_proxima_cita
  SET notaPC = TRIM(p_notaPC)
  WHERE idNotaPC = p_idNotaPC;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

CREATE PROCEDURE `sp_paciente_nota_proxima_eliminar`(
  IN p_idNotaPC INT
)
BEGIN
  DELETE FROM paciente_nota_proxima_cita
  WHERE idNotaPC = p_idNotaPC;
  SELECT ROW_COUNT() AS filasAfectadas;
END $$

DELIMITER ;
