const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet } = require("../utils/dbResult");

const BINARY_TRUE_VALUES = new Set(["1", "true", "yes", "on", "si", "sí"]);
const BINARY_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function normalizeBinaryFlag(value, fieldName) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (value === 1 || value === 0) return value;
    throw new Error(`${fieldName} debe ser 0 o 1`);
  }

  const raw = String(value ?? "").trim().toLowerCase();
  if (BINARY_TRUE_VALUES.has(raw)) return 1;
  if (BINARY_FALSE_VALUES.has(raw)) return 0;

  throw new Error(`${fieldName} invalido. Use 0/1 o true/false`);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function isSamePhone(a, b) {
  const aRaw = normalizeText(a);
  const bRaw = normalizeText(b);
  if (aRaw && bRaw && aRaw === bRaw) return true;

  const aDigits = normalizeDigits(a);
  const bDigits = normalizeDigits(b);
  return aDigits && bDigits && aDigits === bDigits;
}

async function getAgendaSnapshot(db, idAgenda) {
  const [rows] = await db.query(
    `SELECT idAgendaAP, nombreAP, contactoAP
     FROM agendapersona
     WHERE idAgendaAP = ?
     LIMIT 1`,
    [idAgenda]
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function syncPacienteTelefonoFromAgenda(db, options = {}) {
  const agendaNombre = String(options?.agendaNombre || "").trim();
  const contactoAnterior = String(options?.contactoAnterior || "").trim();
  const contactoNuevo = String(options?.contactoNuevo || "").trim();

  if (!agendaNombre || !contactoNuevo) return;

  const [rows] = await db.query(
    `SELECT idPaciente, NombreP, telefonoP
     FROM paciente
     WHERE LOWER(TRIM(NombreP)) = ?
     ORDER BY idPaciente ASC`,
    [normalizeText(agendaNombre)]
  );

  const candidatos = Array.isArray(rows) ? rows : [];
  if (candidatos.length === 0) return;

  let objetivo = null;
  if (candidatos.length === 1) {
    objetivo = candidatos[0];
  } else if (contactoAnterior) {
    const porTelefonoAnterior = candidatos.filter((row) => isSamePhone(row?.telefonoP, contactoAnterior));
    if (porTelefonoAnterior.length === 1) {
      objetivo = porTelefonoAnterior[0];
    }
  }

  const idPaciente = Number(objetivo?.idPaciente || 0);
  if (!Number.isInteger(idPaciente) || idPaciente <= 0) return;

  await db.query(
    `UPDATE paciente
     SET telefonoP = ?
     WHERE idPaciente = ?`,
    [contactoNuevo, idPaciente]
  );
}

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
    comentario,
    sms,
    llamada,
    presente
  } = req.body;

  if (!id) {
    return badRequest(res, "ID de agenda requerido");
  }

  const idAgenda = Number(id);
  if (!Number.isInteger(idAgenda) || idAgenda <= 0) {
    return badRequest(res, "ID de agenda invalido");
  }

  const hasSms = Object.prototype.hasOwnProperty.call(req.body || {}, "sms");
  const hasLlamada = Object.prototype.hasOwnProperty.call(req.body || {}, "llamada");
  const hasPresente = Object.prototype.hasOwnProperty.call(req.body || {}, "presente");
  const hasComentario = Object.prototype.hasOwnProperty.call(req.body || {}, "comentario");
  const hasNombre = Object.prototype.hasOwnProperty.call(req.body || {}, "nombre");
  const hasContacto = Object.prototype.hasOwnProperty.call(req.body || {}, "contacto");

  let smsDbValue = null;
  let llamadaDbValue = null;
  let presenteDbValue = null;
  try {
    if (hasSms) smsDbValue = normalizeBinaryFlag(sms, "sms");
    if (hasLlamada) llamadaDbValue = normalizeBinaryFlag(llamada, "llamada");
    if (hasPresente) presenteDbValue = normalizeBinaryFlag(presente, "presente");
  } catch (err) {
    return badRequest(res, err?.message || "Valor invalido para sms/llamada/presente");
  }

  const toDbValue = (v) => (v === undefined ? null : v);

  if (!hasComentario) {
    try {
      let agendaSnapshot = null;
      if (hasContacto) {
        try {
          agendaSnapshot = await getAgendaSnapshot(pool, idAgenda);
        } catch (snapshotErr) {
          console.warn("[agenda.actualizar] No se pudo leer snapshot de agenda para sync de telefono:", snapshotErr?.message || snapshotErr);
        }
      }

      await pool.query(
        "CALL sp_agenda_update(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          idAgenda,
          toDbValue(nombre),
          toDbValue(hora),
          toDbValue(fecha),
          toDbValue(contacto),
          toDbValue(estado),
          toDbValue(comentario),
          smsDbValue,
          llamadaDbValue,
          presenteDbValue
        ]
      );

      if (hasContacto) {
        try {
          const agendaNombre = hasNombre
            ? String(nombre ?? "").trim()
            : String(agendaSnapshot?.nombreAP || "").trim();
          const contactoAnterior = String(agendaSnapshot?.contactoAP || "").trim();
          const contactoNuevo = String(contacto ?? "").trim();

          await syncPacienteTelefonoFromAgenda(pool, {
            agendaNombre,
            contactoAnterior,
            contactoNuevo
          });
        } catch (syncErr) {
          console.warn("[agenda.actualizar] Sync telefono paciente omitido:", syncErr?.message || syncErr);
        }
      }

      return res.json({ ok: true });
    } catch (error) {
      return serverError(res, error, "Error al actualizar agenda");
    }
  }

  let conn = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    let agendaSnapshot = null;
    if (hasContacto) {
      try {
        agendaSnapshot = await getAgendaSnapshot(conn, idAgenda);
      } catch (snapshotErr) {
        console.warn("[agenda.actualizar] No se pudo leer snapshot de agenda para sync de telefono:", snapshotErr?.message || snapshotErr);
      }
    }

    await conn.query(
      "CALL sp_agenda_update(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        idAgenda,
        toDbValue(nombre),
        toDbValue(hora),
        toDbValue(fecha),
        toDbValue(contacto),
        toDbValue(estado),
        toDbValue(comentario),
        smsDbValue,
        llamadaDbValue,
        presenteDbValue
      ]
    );

    const tratamientoSync = String(comentario ?? "").trim() || null;
    await conn.query(
      `UPDATE cola_paciente
       SET tratamiento = ?, actualizadoEn = NOW()
       WHERE agendaId = ?`,
      [tratamientoSync, idAgenda]
    );

    if (hasContacto) {
      try {
        const agendaNombre = hasNombre
          ? String(nombre ?? "").trim()
          : String(agendaSnapshot?.nombreAP || "").trim();
        const contactoAnterior = String(agendaSnapshot?.contactoAP || "").trim();
        const contactoNuevo = String(contacto ?? "").trim();

        await syncPacienteTelefonoFromAgenda(conn, {
          agendaNombre,
          contactoAnterior,
          contactoNuevo
        });
      } catch (syncErr) {
        console.warn("[agenda.actualizar] Sync telefono paciente omitido:", syncErr?.message || syncErr);
      }
    }

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
      comentario,
      sms,
      llamada,
      presente
    } = req.body;

    if (!nombre || !hora || !fecha || !contacto) {
      return badRequest(res, "Datos incompletos");
    }

    let smsFlag = 0;
    let llamadaFlag = 0;
    let presenteFlag = 0;
    try {
      if (sms !== undefined) smsFlag = normalizeBinaryFlag(sms, "sms");
      if (llamada !== undefined) llamadaFlag = normalizeBinaryFlag(llamada, "llamada");
      if (presente !== undefined) presenteFlag = normalizeBinaryFlag(presente, "presente");
    } catch (err) {
      return badRequest(res, err?.message || "Valor invalido para sms/llamada/presente");
    }

    const [rows] = await pool.query(
      "CALL sp_agenda_create(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        nombre,
        hora,
        fecha,
        contacto,
        estado || null,
        comentario || null,
        smsFlag,
        llamadaFlag,
        presenteFlag
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

