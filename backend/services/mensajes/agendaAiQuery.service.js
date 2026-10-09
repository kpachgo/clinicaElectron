const pool = require("../../config/db");

// Lectura de las citas del paciente vinculado para la herramienta consultar_citas_paciente.
// La IA decide cuándo consultarlas; acá no se interpreta el texto del paciente.

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function queryPatientAppointments({ patientId, patientName, phone, upcomingOnly = true } = {}) {
  const id = Number(patientId);
  const name = normalizeText(patientName);
  const digits = normalizeDigits(phone);
  const hasId = Number.isInteger(id) && id >= 1;
  // Sin id (paciente nuevo del botón "Verificar cita"): solo por nombre exacto o teléfono.
  if (!hasId && !name && digits.length < 7) return { status: "not_enough_data", appointments: [] };
  const where = ["LOWER(TRIM(IFNULL(a.estadoAP, ''))) NOT IN ('cancelado', 'cancelada')"];
  const params = [];
  if (upcomingOnly) where.push("(a.fechaAP > CURDATE() OR (a.fechaAP = CURDATE() AND LEFT(TRIM(IFNULL(a.horaAP, '')), 5) >= DATE_FORMAT(CURTIME(), '%H:%i')))");
  where.push("a.fechaAP <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)");
  const fallback = [];
  if (name) { fallback.push("LOWER(TRIM(IFNULL(a.nombreAP, ''))) = LOWER(TRIM(?))"); params.push(name); }
  if (digits.length >= 7) { fallback.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(a.contactoAP, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?"); params.push(digits); }
  const identity = hasId ? ["a.pacienteIdAP = ?"] : [`(${fallback.join(" OR ")})`];
  const identityParams = hasId ? [id] : [...params];
  if (hasId && fallback.length) { identity.push(`(a.pacienteIdAP IS NULL AND (${fallback.join(" OR ")}))`); identityParams.push(...params); }
  const [rows] = await pool.query(`SELECT a.idAgendaAP, a.nombreAP, DATE_FORMAT(a.fechaAP, '%Y-%m-%d') AS fechaAP, LEFT(TRIM(a.horaAP), 5) AS horaAP, a.contactoAP, IFNULL(a.estadoAP, 'Pendiente') AS estadoAP, a.servicioIdAP AS serviceId, COALESCE(s.nombreS, a.comentarioAP) AS tratamiento FROM agendapersona a LEFT JOIN servicio s ON s.idServicio=a.servicioIdAP WHERE ${where.join(" AND ")} AND (${identity.join(" OR ")}) ORDER BY a.fechaAP, a.horaAP`, [...identityParams]);
  const appointments = (Array.isArray(rows) ? rows : []).map((row) => ({ id: Number(row.idAgendaAP), patientName: row.nombreAP, date: row.fechaAP, time: row.horaAP, phone: row.contactoAP || null, status: row.estadoAP || "Pendiente", serviceId: row.serviceId ? Number(row.serviceId) : null, treatment: row.tratamiento || null }));
  return { status: appointments.length ? "found" : "not_found", appointments, searchedBy: { patientId: hasId ? id : null, name: name || null, phone: digits || null } };
}

module.exports = { queryPatientAppointments };
