const pool = require("../../config/db");

const AGENDA_TERMS = /\b(cita|citas|agenda|agendar|reservar|reserva|horario|hora|fecha|consulta|visita|pr[oó]xima|pr[oó]ximo)\b/i;

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function shouldConsultAgenda(text) {
  return AGENDA_TERMS.test(normalizeText(text));
}

function formatAppointment(row) {
  return {
    id: Number(row.idAgendaAP),
    patientName: row.nombreAP,
    date: row.fechaAP,
    time: row.horaAP,
    phone: row.contactoAP || null,
    status: row.estadoAP || "Pendiente",
    treatment: row.comentarioAP || null
  };
}

async function queryAgenda({ contactName, phone, dateFrom, dateTo } = {}) {
  const name = normalizeText(contactName);
  const digits = normalizeDigits(phone);
  if (!name && digits.length < 7) return { status: "not_enough_data", appointments: [] };

  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(dateFrom || "")) ? String(dateFrom) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(dateTo || "")) ? String(dateTo) : null;
  const where = [];
  const params = [];
  where.push("LOWER(TRIM(IFNULL(a.estadoAP, ''))) NOT IN ('cancelado', 'cancelada')");
  if (from) { where.push("a.fechaAP >= ?"); params.push(from); } else where.push("(a.fechaAP > CURDATE() OR (a.fechaAP = CURDATE() AND LEFT(TRIM(IFNULL(a.horaAP, '')), 5) >= DATE_FORMAT(CURTIME(), '%H:%i')))");
  if (to) { where.push("a.fechaAP <= ?"); params.push(to); } else where.push("a.fechaAP <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)");

  const identity = [];
  if (name) { identity.push("LOWER(TRIM(IFNULL(a.nombreAP, ''))) LIKE CONCAT('%', LOWER(TRIM(?)), '%')"); params.push(name); }
  if (digits.length >= 7) {
    identity.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(a.contactoAP, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?");
    params.push(digits);
  }
  if (!identity.length) return { status: "not_enough_data", appointments: [] };

  const [rows] = await pool.query(`SELECT a.idAgendaAP, a.nombreAP, DATE_FORMAT(a.fechaAP, '%Y-%m-%d') AS fechaAP, a.horaAP, a.contactoAP, IFNULL(a.estadoAP, 'Pendiente') AS estadoAP, a.comentarioAP FROM agendapersona a WHERE ${where.join(" AND ")} AND (${identity.join(" OR ")}) ORDER BY a.fechaAP, a.horaAP`, params);
  const appointments = (Array.isArray(rows) ? rows : []).map(formatAppointment);
  return { status: appointments.length ? "found" : "not_found", appointments, searchedBy: { name: name || null, phone: digits || null }, dateFrom: from, dateTo: to };
}

function formatAgendaContext(result) {
  if (!result || result.status === "not_enough_data") return "No hay suficiente información para buscar la agenda. Solicita al paciente su nombre completo.";
  if (result.status === "not_found") return "No se encontraron citas futuras para el paciente identificado.";
  return result.appointments.map((item) => `- ${item.patientName}: ${item.date} a las ${item.time}; estado: ${item.status}; tratamiento: ${item.treatment || "no especificado"}`).join("\n");
}

async function getAgendaContextForConversation({ text, contactName, phone } = {}) {
  if (!shouldConsultAgenda(text)) return null;
  const result = await queryAgenda({ contactName, phone });
  return { result, context: formatAgendaContext(result) };
}

async function queryPatientAppointments({ patientId, patientName, phone, upcomingOnly = true } = {}) {
  const id = Number(patientId);
  const name = normalizeText(patientName);
  const digits = normalizeDigits(phone);
  if (!Number.isInteger(id) || id < 1) return { status: "not_enough_data", appointments: [] };
  const where = ["LOWER(TRIM(IFNULL(a.estadoAP, ''))) NOT IN ('cancelado', 'cancelada')"];
  const params = [];
  if (upcomingOnly) where.push("(a.fechaAP > CURDATE() OR (a.fechaAP = CURDATE() AND LEFT(TRIM(IFNULL(a.horaAP, '')), 5) >= DATE_FORMAT(CURTIME(), '%H:%i')))");
  where.push("a.fechaAP <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)");
  const fallback = [];
  if (name) { fallback.push("LOWER(TRIM(IFNULL(a.nombreAP, ''))) = LOWER(TRIM(?))"); params.push(name); }
  if (digits.length >= 7) { fallback.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(a.contactoAP, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?"); params.push(digits); }
  const identity = ["a.pacienteIdAP = ?"];
  const identityParams = [id];
  if (fallback.length) { identity.push(`(a.pacienteIdAP IS NULL AND (${fallback.join(" OR ")}))`); identityParams.push(...params); }
  const [rows] = await pool.query(`SELECT a.idAgendaAP, a.nombreAP, DATE_FORMAT(a.fechaAP, '%Y-%m-%d') AS fechaAP, LEFT(TRIM(a.horaAP), 5) AS horaAP, a.contactoAP, IFNULL(a.estadoAP, 'Pendiente') AS estadoAP, a.servicioIdAP AS serviceId, COALESCE(s.nombreS, a.comentarioAP) AS tratamiento FROM agendapersona a LEFT JOIN servicio s ON s.idServicio=a.servicioIdAP WHERE ${where.join(" AND ")} AND (${identity.join(" OR ")}) ORDER BY a.fechaAP, a.horaAP`, [...identityParams]);
  const appointments = (Array.isArray(rows) ? rows : []).map((row) => ({ id: Number(row.idAgendaAP), patientName: row.nombreAP, date: row.fechaAP, time: row.horaAP, phone: row.contactoAP || null, status: row.estadoAP || "Pendiente", serviceId: row.serviceId ? Number(row.serviceId) : null, treatment: row.tratamiento || null }));
  return { status: appointments.length ? "found" : "not_found", appointments, searchedBy: { patientId: id, name: name || null, phone: digits || null } };
}

function formatPatientAppointments(result, { all = false } = {}) {
  if (!result || result.status === "not_enough_data") return "No hay suficiente información del paciente vinculado para buscar sus citas.";
  if (result.status === "not_found") return "No tienes citas futuras activas registradas.";
  const items = all ? result.appointments : result.appointments.slice(0, 1);
  return items.map((item) => `- ${item.date} a las ${item.time}; ${item.treatment || "servicio no especificado"}; estado: ${item.status.toLowerCase()}`).join("\n");
}

module.exports = { shouldConsultAgenda, queryAgenda, queryPatientAppointments, getAgendaContextForConversation, formatAgendaContext, formatPatientAppointments };
