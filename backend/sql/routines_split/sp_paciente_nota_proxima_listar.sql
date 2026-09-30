DROP PROCEDURE IF EXISTS `sp_paciente_nota_proxima_listar`;
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
DELIMITER ;
