const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");

const ESTADO_ESPERA = "En espera";
const ESTADO_ATENDIDO = "Atendido";
const SELECT_COLA_FIELDS = `
  c.idColaPaciente,
  c.agendaId,
  c.doctorId,
  d.nombreD AS nombreDoctor,
  c.ordenCola,
  c.nombrePaciente,
  c.tratamiento,
  DATE_FORMAT(c.horaAgenda, '%H:%i') AS horaAgenda,
  DATE_FORMAT(c.fechaAgenda, '%Y-%m-%d') AS fechaAgendaISO,
  c.contacto,
  c.estado,
  DATE_FORMAT(c.creadoEn, '%Y-%m-%dT%H:%i:%s.000Z') AS creadoEn,
  DATE_FORMAT(c.actualizadoEn, '%Y-%m-%dT%H:%i:%s.000Z') AS actualizadoEn
`;
const FROM_COLA_JOIN_DOCTOR = `
  FROM cola_paciente c
  LEFT JOIN doctor d ON d.idDoctor = c.doctorId
`;

function normalizarEstado(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "atendido") return ESTADO_ATENDIDO;
  if (raw === "en espera" || raw === "espera") return ESTADO_ESPERA;
  return "__INVALID__";
}

function normalizarDireccion(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "up") return "up";
  if (raw === "down") return "down";
  return "__INVALID__";
}

function normalizarOrdenCola(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function esFechaIsoReal(fechaIso) {
  const m = String(fechaIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    Number.isFinite(dt.getTime()) &&
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function validarFechaISO(value) {
  const txt = String(value || "").trim();
  if (!txt) return null;
  return esFechaIsoReal(txt) ? txt : "__INVALID__";
}

function validarHoraHHMM(value) {
  const txt = String(value || "").trim();
  if (!txt) return null;
  const m = txt.match(/^(\d{2}):(\d{2})$/);
  if (!m) return "__INVALID__";
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return "__INVALID__";
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "__INVALID__";
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function validarDoctorId(value) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return "__INVALID__";
  return id;
}

function normalizarTratamiento(value) {
  const txt = String(value ?? "").trim();
  return txt || null;
}

async function existeDoctorPorId(idDoctor) {
  const [rows] = await pool.query(
    "SELECT idDoctor FROM doctor WHERE idDoctor = ? LIMIT 1",
    [idDoctor]
  );
  return !!rows?.[0];
}

async function obtenerPorId(idColaPaciente, db = pool) {
  const [rows] = await db.query(
    `SELECT
      ${SELECT_COLA_FIELDS}
     ${FROM_COLA_JOIN_DOCTOR}
     WHERE c.idColaPaciente = ?
     LIMIT 1`,
    [idColaPaciente]
  );
  return rows?.[0] || null;
}

async function listarEnEsperaPorFechaForUpdate(conn, fechaAgenda, options = {}) {
  const excludeId = Number(options?.excludeId || 0) || null;
  const params = [ESTADO_ESPERA, fechaAgenda];
  let whereExtra = "";
  if (excludeId) {
    whereExtra = " AND c.idColaPaciente <> ?";
    params.push(excludeId);
  }

  const [rows] = await conn.query(
    `SELECT
      c.idColaPaciente,
      c.ordenCola
     FROM cola_paciente c
     WHERE c.estado = ?
       AND (c.fechaAgenda <=> ?)
       ${whereExtra}
     ORDER BY
       COALESCE(c.ordenCola, 2147483647) ASC,
       c.creadoEn ASC,
       c.idColaPaciente ASC
     FOR UPDATE`,
    params
  );

  return Array.isArray(rows) ? rows : [];
}

async function reindexarEnEsperaPorFecha(conn, fechaAgenda, options = {}) {
  const rows = await listarEnEsperaPorFechaForUpdate(conn, fechaAgenda, options);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const ordenEsperada = i + 1;
    const ordenActual = normalizarOrdenCola(row?.ordenCola);
    if (ordenActual === ordenEsperada) continue;
    await conn.query(
      `UPDATE cola_paciente
       SET ordenCola = ?, actualizadoEn = NOW()
       WHERE idColaPaciente = ?`,
      [ordenEsperada, row.idColaPaciente]
    );
    row.ordenCola = ordenEsperada;
  }
  return rows.map((row, idx) => ({
    idColaPaciente: Number(row.idColaPaciente || 0),
    ordenCola: idx + 1
  }));
}

exports.listar = async (req, res) => {
  try {
    const fecha = validarFechaISO(req.query?.fecha);
    if (fecha === "__INVALID__") {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const params = [];
    let where = "";
    if (fecha) {
      where = "WHERE c.fechaAgenda = ?";
      params.push(fecha);
    }

    const [rows] = await pool.query(
      `SELECT
        ${SELECT_COLA_FIELDS}
       ${FROM_COLA_JOIN_DOCTOR}
       ${where}
       ORDER BY
         CASE WHEN c.estado = '${ESTADO_ESPERA}' THEN 0 ELSE 1 END,
         CASE WHEN c.estado = '${ESTADO_ESPERA}' THEN COALESCE(c.ordenCola, 2147483647) ELSE NULL END ASC,
         c.creadoEn ASC,
         c.idColaPaciente ASC`,
      params
    );

    return res.json({
      ok: true,
      data: Array.isArray(rows) ? rows : []
    });
  } catch (err) {
    return serverError(res, err, "Error al listar cola de pacientes");
  }
};

exports.crear = async (req, res) => {
  let conn = null;
  try {
    const nombrePaciente = String(req.body?.nombrePaciente || "").trim();
    if (!nombrePaciente) {
      return badRequest(res, "Nombre de paciente requerido");
    }

    const agendaIdNum = Number(req.body?.agendaId || 0);
    const agendaId = Number.isInteger(agendaIdNum) && agendaIdNum > 0 ? agendaIdNum : null;
    const doctorId = validarDoctorId(req.body?.doctorId);
    if (doctorId === "__INVALID__") {
      return badRequest(res, "Doctor invalido");
    }
    const tratamiento = String(req.body?.tratamiento || "").trim() || null;
    const contacto = String(req.body?.contacto || "").trim() || null;

    const fechaAgendaISO = validarFechaISO(req.body?.fechaAgendaISO);
    if (fechaAgendaISO === "__INVALID__") {
      return badRequest(res, "Fecha de agenda invalida, use YYYY-MM-DD");
    }

    const horaAgenda = validarHoraHHMM(req.body?.horaAgenda);
    if (horaAgenda === "__INVALID__") {
      return badRequest(res, "Hora invalida, use HH:mm");
    }

    if (doctorId && !(await existeDoctorPorId(doctorId))) {
      return badRequest(res, "Doctor no encontrado");
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    let duplicado = null;
    if (agendaId) {
      const [rowsDup] = await conn.query(
        `SELECT
          ${SELECT_COLA_FIELDS}
         ${FROM_COLA_JOIN_DOCTOR}
         WHERE c.agendaId = ?
           AND c.estado = ?
           AND (c.fechaAgenda <=> ?)
         LIMIT 1`,
        [agendaId, ESTADO_ESPERA, fechaAgendaISO]
      );
      duplicado = rowsDup?.[0] || null;
    } else if (fechaAgendaISO) {
      const [rowsDup] = await conn.query(
        `SELECT
          ${SELECT_COLA_FIELDS}
         ${FROM_COLA_JOIN_DOCTOR}
         WHERE LOWER(TRIM(c.nombrePaciente)) = LOWER(TRIM(?))
           AND c.fechaAgenda = ?
           AND c.estado = ?
         LIMIT 1`,
        [nombrePaciente, fechaAgendaISO, ESTADO_ESPERA]
      );
      duplicado = rowsDup?.[0] || null;
    }

    if (duplicado) {
      await conn.rollback();
      return res.json({
        ok: true,
        duplicated: true,
        data: duplicado
      });
    }

    const [rowsOrden] = await conn.query(
      `SELECT COALESCE(MAX(c.ordenCola), 0) AS maxOrden
       FROM cola_paciente c
       WHERE c.estado = ?
         AND (c.fechaAgenda <=> ?)
       FOR UPDATE`,
      [ESTADO_ESPERA, fechaAgendaISO]
    );
    const maxOrden = Number(rowsOrden?.[0]?.maxOrden || 0);
    const siguienteOrden = maxOrden + 1;

    const creadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;
    const [result] = await conn.query(
      `INSERT INTO cola_paciente (
        agendaId,
        doctorId,
        ordenCola,
        nombrePaciente,
        tratamiento,
        horaAgenda,
        fechaAgenda,
        contacto,
        estado,
        creadoPorUsuarioId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agendaId,
        doctorId,
        siguienteOrden,
        nombrePaciente,
        tratamiento,
        horaAgenda,
        fechaAgendaISO,
        contacto,
        ESTADO_ESPERA,
        creadoPorUsuarioId
      ]
    );
    await conn.commit();

    const idColaPaciente = Number(result?.insertId || 0);
    const creado = idColaPaciente ? await obtenerPorId(idColaPaciente) : null;

    return res.status(201).json({
      ok: true,
      duplicated: false,
      data: creado
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // noop
      }
    }
    return serverError(res, err, "Error al crear registro en cola");
  } finally {
    if (conn) conn.release();
  }
};

exports.actualizarEstado = async (req, res) => {
  let conn = null;
  try {
    const idColaPaciente = Number(req.params?.id || 0);
    if (!Number.isInteger(idColaPaciente) || idColaPaciente <= 0) {
      return badRequest(res, "ID invalido");
    }

    const estado = normalizarEstado(req.body?.estado);
    if (estado === "__INVALID__") {
      return badRequest(res, "Estado invalido. Use 'En espera' o 'Atendido'");
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT
        idColaPaciente,
        estado,
        fechaAgenda,
        ordenCola
       FROM cola_paciente
       WHERE idColaPaciente = ?
       LIMIT 1
       FOR UPDATE`,
      [idColaPaciente]
    );
    const row = rows?.[0] || null;
    if (!row) {
      await conn.rollback();
      return notFound(res, "Registro de cola no encontrado");
    }

    const estadoActual = normalizarEstado(row.estado);
    if (estadoActual === estado) {
      await conn.commit();
      const same = await obtenerPorId(idColaPaciente);
      return res.json({ ok: true, data: same });
    }

    if (estado === ESTADO_ATENDIDO) {
      await conn.query(
        `UPDATE cola_paciente
         SET estado = ?, actualizadoEn = NOW()
         WHERE idColaPaciente = ?`,
        [ESTADO_ATENDIDO, idColaPaciente]
      );
    } else {
      const fechaAgenda = row.fechaAgenda ?? null;
      const esperaReindexada = await reindexarEnEsperaPorFecha(conn, fechaAgenda, {
        excludeId: idColaPaciente
      });
      const maxOrden = esperaReindexada.length;
      const ordenAnterior = normalizarOrdenCola(row.ordenCola);
      const ordenObjetivo = ordenAnterior
        ? Math.min(Math.max(ordenAnterior, 1), maxOrden + 1)
        : maxOrden + 1;

      await conn.query(
        `UPDATE cola_paciente
         SET ordenCola = ordenCola + 1,
             actualizadoEn = NOW()
         WHERE estado = ?
           AND (fechaAgenda <=> ?)
           AND idColaPaciente <> ?
           AND ordenCola >= ?`,
        [ESTADO_ESPERA, fechaAgenda, idColaPaciente, ordenObjetivo]
      );

      await conn.query(
        `UPDATE cola_paciente
         SET estado = ?,
             ordenCola = ?,
             actualizadoEn = NOW()
         WHERE idColaPaciente = ?`,
        [ESTADO_ESPERA, ordenObjetivo, idColaPaciente]
      );
    }
    await conn.commit();

    const updated = await obtenerPorId(idColaPaciente);
    return res.json({
      ok: true,
      data: updated
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // noop
      }
    }
    return serverError(res, err, "Error al actualizar estado de cola");
  } finally {
    if (conn) conn.release();
  }
};

exports.mover = async (req, res) => {
  let conn = null;
  try {
    const idColaPaciente = Number(req.params?.id || 0);
    if (!Number.isInteger(idColaPaciente) || idColaPaciente <= 0) {
      return badRequest(res, "ID invalido");
    }

    const direccion = normalizarDireccion(req.body?.direccion);
    if (direccion === "__INVALID__") {
      return badRequest(res, "Direccion invalida. Use 'up' o 'down'");
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT
        idColaPaciente,
        estado,
        fechaAgenda
       FROM cola_paciente
       WHERE idColaPaciente = ?
       LIMIT 1
       FOR UPDATE`,
      [idColaPaciente]
    );
    const row = rows?.[0] || null;
    if (!row) {
      await conn.rollback();
      return notFound(res, "Registro de cola no encontrado");
    }

    if (normalizarEstado(row.estado) !== ESTADO_ESPERA) {
      await conn.rollback();
      return badRequest(res, "Solo se pueden mover pacientes en espera");
    }

    const fechaAgenda = row.fechaAgenda ?? null;
    const espera = await reindexarEnEsperaPorFecha(conn, fechaAgenda);
    const idxActual = espera.findIndex((item) => item.idColaPaciente === idColaPaciente);
    if (idxActual < 0) {
      await conn.rollback();
      return notFound(res, "Registro de cola no encontrado");
    }

    const idxVecino = direccion === "up" ? idxActual - 1 : idxActual + 1;
    if (idxVecino < 0 || idxVecino >= espera.length) {
      await conn.commit();
      const same = await obtenerPorId(idColaPaciente);
      return res.json({ ok: true, data: same });
    }

    const actual = espera[idxActual];
    const vecino = espera[idxVecino];

    await conn.query(
      `UPDATE cola_paciente
       SET ordenCola = ?, actualizadoEn = NOW()
       WHERE idColaPaciente = ?`,
      [vecino.ordenCola, actual.idColaPaciente]
    );

    await conn.query(
      `UPDATE cola_paciente
       SET ordenCola = ?, actualizadoEn = NOW()
       WHERE idColaPaciente = ?`,
      [actual.ordenCola, vecino.idColaPaciente]
    );

    await conn.commit();

    const updated = await obtenerPorId(idColaPaciente);
    return res.json({
      ok: true,
      data: updated
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // noop
      }
    }
    return serverError(res, err, "Error al mover posicion en cola");
  } finally {
    if (conn) conn.release();
  }
};

exports.actualizarDoctor = async (req, res) => {
  try {
    const idColaPaciente = Number(req.params?.id || 0);
    if (!Number.isInteger(idColaPaciente) || idColaPaciente <= 0) {
      return badRequest(res, "ID invalido");
    }

    const doctorId = validarDoctorId(req.body?.doctorId);
    if (doctorId === "__INVALID__") {
      return badRequest(res, "Doctor invalido");
    }

    if (doctorId && !(await existeDoctorPorId(doctorId))) {
      return badRequest(res, "Doctor no encontrado");
    }

    const [result] = await pool.query(
      `UPDATE cola_paciente
       SET doctorId = ?, actualizadoEn = NOW()
       WHERE idColaPaciente = ?`,
      [doctorId, idColaPaciente]
    );

    if (!result?.affectedRows) {
      return notFound(res, "Registro de cola no encontrado");
    }

    const updated = await obtenerPorId(idColaPaciente);
    return res.json({
      ok: true,
      data: updated
    });
  } catch (err) {
    return serverError(res, err, "Error al actualizar doctor de cola");
  }
};

exports.actualizarTratamiento = async (req, res) => {
  const idColaPaciente = Number(req.params?.id || 0);
  if (!Number.isInteger(idColaPaciente) || idColaPaciente <= 0) {
    return badRequest(res, "ID invalido");
  }

  const tratamientoAgenda = String(req.body?.tratamiento ?? "").trim();
  const tratamiento = normalizarTratamiento(req.body?.tratamiento);
  let conn = null;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT idColaPaciente, agendaId
       FROM cola_paciente
       WHERE idColaPaciente = ?
       LIMIT 1
       FOR UPDATE`,
      [idColaPaciente]
    );

    const row = rows?.[0] || null;
    if (!row) {
      await conn.rollback();
      return notFound(res, "Registro de cola no encontrado");
    }

    const agendaId = Number(row.agendaId || 0) || null;
    if (agendaId) {
      await conn.query(
        `UPDATE cola_paciente
         SET tratamiento = ?, actualizadoEn = NOW()
         WHERE agendaId = ?`,
        [tratamiento, agendaId]
      );

      await conn.query(
        "CALL sp_agenda_update(?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [agendaId, null, null, null, null, null, tratamientoAgenda, null, null]
      );
    } else {
      await conn.query(
        `UPDATE cola_paciente
         SET tratamiento = ?, actualizadoEn = NOW()
         WHERE idColaPaciente = ?`,
        [tratamiento, idColaPaciente]
      );
    }

    await conn.commit();

    const updated = await obtenerPorId(idColaPaciente);
    return res.json({
      ok: true,
      data: updated
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // noop
      }
    }
    return serverError(res, err, "Error al actualizar tratamiento de cola");
  } finally {
    if (conn) conn.release();
  }
};

exports.eliminar = async (req, res) => {
  try {
    const idColaPaciente = Number(req.params?.id || 0);
    if (!Number.isInteger(idColaPaciente) || idColaPaciente <= 0) {
      return badRequest(res, "ID invalido");
    }

    const [result] = await pool.query(
      "DELETE FROM cola_paciente WHERE idColaPaciente = ?",
      [idColaPaciente]
    );

    if (!result?.affectedRows) {
      return notFound(res, "Registro de cola no encontrado");
    }

    return res.json({ ok: true });
  } catch (err) {
    return serverError(res, err, "Error al eliminar registro de cola");
  }
};

exports.limpiarAtendidos = async (req, res) => {
  try {
    const fecha = validarFechaISO(req.query?.fecha);
    if (fecha === "__INVALID__") {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    let sql = "DELETE FROM cola_paciente WHERE estado = ?";
    const params = [ESTADO_ATENDIDO];
    if (fecha) {
      sql += " AND fechaAgenda = ?";
      params.push(fecha);
    }

    const [result] = await pool.query(sql, params);
    return res.json({
      ok: true,
      deleted: Number(result?.affectedRows || 0)
    });
  } catch (err) {
    return serverError(res, err, "Error al limpiar atendidos en cola");
  }
};

exports.borrarTodo = async (req, res) => {
  try {
    const fecha = validarFechaISO(req.query?.fecha);
    if (fecha === "__INVALID__") {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    let sql = "DELETE FROM cola_paciente";
    const params = [];
    if (fecha) {
      sql += " WHERE fechaAgenda = ?";
      params.push(fecha);
    }

    const [result] = await pool.query(sql, params);
    return res.json({
      ok: true,
      deleted: Number(result?.affectedRows || 0)
    });
  } catch (err) {
    return serverError(res, err, "Error al borrar cola");
  }
};
