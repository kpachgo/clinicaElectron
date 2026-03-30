const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet } = require("../utils/dbResult");

// =================================================
// LISTAR AGENDA POR FECHA (FASE 1)
// =================================================
exports.listarPorFecha = async (req, res) => {
  try {
    const { fecha } = req.query;

    if (!fecha) {
      return badRequest(res, "La fecha es obligatoria");
    }

    // Llamar SP
    const [rows] = await pool.query(
      "CALL sp_agenda_por_fecha(?)",
      [fecha]
    );

    const data = firstResultSet(rows);

    return res.json({
      ok: true,
      data
    });

  } catch (error) {
    return serverError(res, error, "Error al obtener la agenda");
  }
};

exports.buscarPorMes = async (req, res) => {
  try {
    const { q, fecha } = req.query;
    const texto = String(q || "").trim();
    const fechaBase = String(fecha || "").trim();

    if (!texto) {
      return badRequest(res, "Texto de busqueda requerido");
    }

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaBase);
    if (!m) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return badRequest(res, "Mes invalido");
    }

    const desde = `${m[1]}-${m[2]}-01`;
    const ultimoDia = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0");
    const hasta = `${m[1]}-${m[2]}-${ultimoDia}`;

    const [rows] = await pool.query(
      "CALL sp_agenda_buscar_mes(?, ?, ?)",
      [desde, hasta, texto]
    );

    const data = firstResultSet(rows);

    return res.json({
      ok: true,
      data,
      desde,
      hasta
    });
  } catch (error) {
    return serverError(res, error, "Error al buscar agenda por mes");
  }
};

exports.actualizar = async (req, res) => {
  const { id } = req.params;

  const {
    nombre,
    hora,
    fecha,
    contacto,
    estado,
    comentario
  } = req.body;

  if (!id) {
    return badRequest(res, "ID de agenda requerido");
  }

  const idAgenda = Number(id);
  if (!Number.isInteger(idAgenda) || idAgenda <= 0) {
    return badRequest(res, "ID de agenda invalido");
  }

  const toDbValue = (v) => (v === undefined ? null : v);
  const hasComentario = Object.prototype.hasOwnProperty.call(req.body || {}, "comentario");

  if (!hasComentario) {
    try {
      await pool.query(
        "CALL sp_agenda_update(?, ?, ?, ?, ?, ?, ?)",
        [
          idAgenda,
          toDbValue(nombre),
          toDbValue(hora),
          toDbValue(fecha),
          toDbValue(contacto),
          toDbValue(estado),
          toDbValue(comentario)
        ]
      );

      return res.json({ ok: true });
    } catch (error) {
      return serverError(res, error, "Error al actualizar agenda");
    }
  }

  let conn = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    await conn.query(
      "CALL sp_agenda_update(?, ?, ?, ?, ?, ?, ?)",
      [
        idAgenda,
        toDbValue(nombre),
        toDbValue(hora),
        toDbValue(fecha),
        toDbValue(contacto),
        toDbValue(estado),
        toDbValue(comentario)
      ]
    );

    const tratamientoSync = String(comentario ?? "").trim() || null;
    await conn.query(
      `UPDATE cola_paciente
       SET tratamiento = ?, actualizadoEn = NOW()
       WHERE agendaId = ?`,
      [tratamientoSync, idAgenda]
    );

    await conn.commit();
    return res.json({ ok: true });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // noop
      }
    }
    return serverError(res, error, "Error al actualizar agenda");
  } finally {
    if (conn) conn.release();
  }
};

exports.eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const idAgenda = Number(id);

    if (!Number.isInteger(idAgenda) || idAgenda <= 0) {
      return badRequest(res, "ID de agenda invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_agenda_delete(?)",
      [idAgenda]
    );

    const data = firstResultSet(rows);
    const filasAfectadas = Number(data?.[0]?.filasAfectadas || 0);

    if (filasAfectadas <= 0) {
      return notFound(res, "Cita de agenda no encontrada");
    }

    return res.json({ ok: true });
  } catch (error) {
    return serverError(res, error, "Error al eliminar cita de agenda");
  }
};

exports.crear = async (req, res) => {
  try {
    const {
      nombre,
      hora,
      fecha,
      contacto,
      estado,
      comentario
    } = req.body;

    if (!nombre || !hora || !fecha || !contacto) {
      return badRequest(res, "Datos incompletos");
    }

    const [rows] = await pool.query(
      "CALL sp_agenda_create(?, ?, ?, ?, ?, ?)",
      [
        nombre,
        hora,
        fecha,
        contacto,
        estado || null,
        comentario || null
      ]
    );

    const idAgendaAP = rows[0][0].idAgendaAP;

    res.json({
      ok: true,
      idAgendaAP
    });

  } catch (error) {
    return serverError(res, error, "Error al crear cita");
  }
};

