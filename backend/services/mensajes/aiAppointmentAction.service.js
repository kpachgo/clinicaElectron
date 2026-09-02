const pool = require("../../config/db");
const { getDb } = require("../mensajesDatabase.service");
const { normalizeText, searchAvailability, resolveService } = require("./aiAvailability.service");

async function ensureAuditTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS mensajes_auditoria (idAuditoria BIGINT AUTO_INCREMENT PRIMARY KEY, operacion VARCHAR(80) NOT NULL, idempotencyKey VARCHAR(120) NULL, solicitante VARCHAR(40) NOT NULL, payload JSON NULL, resultado VARCHAR(30) NOT NULL, detalle VARCHAR(255) NULL, creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_mensajes_auditoria_idempotencia (operacion, idempotencyKey))`);
}

async function findPatientByName(name) {
  const needle = normalizeText(name);
  if (!needle) return { status: "not_found", patients: [] };
  const [rows] = await pool.query("SELECT idPaciente, NombreP, telefonoP, estadoP FROM paciente WHERE LOWER(TRIM(NombreP)) LIKE CONCAT('%', LOWER(TRIM(?)), '%') LIMIT 20", [String(name).trim()]);
  const patients = rows.filter((row) => normalizeText(row.NombreP) === needle).map((row) => ({ id: Number(row.idPaciente), name: row.NombreP, phone: row.telefonoP || "", active: Number(row.estadoP ?? 1) === 1 }));
  return { status: patients.length === 1 ? "matched" : patients.length > 1 ? "ambiguous" : "not_found", patients };
}

async function createAppointmentForAssistant({ patientId, serviceId, date, time, contact, comment, idempotencyKey }) {
  await ensureAuditTable();
  const [existing] = await pool.query("SELECT detalle FROM mensajes_auditoria WHERE operacion='create_appointment' AND idempotencyKey=? LIMIT 1", [idempotencyKey]);
  if (existing[0]?.detalle) return { ok: true, duplicate: true, idAgendaAP: Number(existing[0].detalle) };
  const availability = await searchAvailability({ serviceId, date });
  if (availability.dayUnavailable) { const error = new Error("Ese día no está disponible para agendar"); error.status = 409; throw error; }
  const requested = availability.slots.find((slot) => slot.time === String(time).slice(0, 5));
  if (!requested) { const error = new Error("El horario ya no está disponible"); error.status = 409; throw error; }
  const [services] = await pool.query("SELECT nombreS FROM servicio WHERE idServicio=? LIMIT 1", [Number(serviceId)]);
  const [patients] = await pool.query("SELECT NombreP, telefonoP, estadoP FROM paciente WHERE idPaciente=? LIMIT 1", [Number(patientId)]);
  if (!services[0]) { const error = new Error("Servicio no encontrado"); error.status = 404; throw error; }
  if (!patients[0]) { const error = new Error("Paciente no encontrado"); error.status = 404; throw error; }
  if (Number(patients[0].estadoP ?? 1) !== 1) { const error = new Error("El paciente está inactivo"); error.status = 400; throw error; }
  const [result] = await pool.query("CALL sp_agenda_create(?,?,?,?,?,?,?,?,?)", [patients[0].NombreP, String(time).slice(0, 5), date, contact || patients[0].telefonoP || "", "Pendiente", comment || services[0].nombreS, 0, 0, 0]);
  const idAgendaAP = result[0][0].idAgendaAP;
  await pool.query("INSERT INTO mensajes_auditoria (operacion,idempotencyKey,solicitante,payload,resultado,detalle) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE resultado=VALUES(resultado), detalle=VALUES(detalle)", ["create_appointment", idempotencyKey, "IA", JSON.stringify({ patientId, serviceId, date, time, contact, comment }), "success", String(idAgendaAP)]);
  return { ok: true, idAgendaAP };
}

async function createAppointmentForAssistantWithCapacity({ patientId, patientName, serviceId, date, time, contact, comment, idempotencyKey }) {
  await ensureAuditTable();
  const [existing] = await pool.query("SELECT detalle FROM mensajes_auditoria WHERE operacion='create_appointment' AND idempotencyKey=? LIMIT 1", [idempotencyKey]);
  if (existing[0]?.detalle) return { ok: true, duplicate: true, idAgendaAP: Number(existing[0].detalle) };
  const connection = await pool.getConnection();
  const lockName = `agenda-ai-capacity:${Number(serviceId)}:${date}`;
  let locked = false;
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
    locked = Number(lockRows[0]?.acquired) === 1;
    if (!locked) { const error = new Error("No se pudo validar el cupo del horario"); error.status = 409; throw error; }
    // Re-chequeo de idempotencia ya con el lock tomado: si dos llamadas con la misma
    // llave pasaron el chequeo previo antes de que ninguna escribiera, aca se detecta.
    const [lockedExisting] = await connection.query("SELECT detalle FROM mensajes_auditoria WHERE operacion='create_appointment' AND idempotencyKey=? LIMIT 1", [idempotencyKey]);
    if (lockedExisting[0]?.detalle) return { ok: true, duplicate: true, idAgendaAP: Number(lockedExisting[0].detalle) };
    const availability = await searchAvailability({ serviceId, date }, getDb(), connection);
    if (availability.dayUnavailable) { const error = new Error("Ese día no está disponible para agendar"); error.status = 409; throw error; }
    const requested = availability.slots.find((slot) => slot.time === String(time).slice(0, 5));
    if (!requested) { const error = new Error("El horario ya no esta disponible"); error.status = 409; throw error; }
    const [services] = await connection.query("SELECT nombreS FROM servicio WHERE idServicio=? LIMIT 1", [Number(serviceId)]);
    const [patients] = patientId
      ? await connection.query("SELECT NombreP, telefonoP, estadoP FROM paciente WHERE idPaciente=? LIMIT 1", [Number(patientId)])
      : [[]];
    if (!services[0]) { const error = new Error("Servicio no encontrado"); error.status = 404; throw error; }
    if (patientId && !patients[0]) { const error = new Error("Paciente no encontrado"); error.status = 404; throw error; }
    if (patientId && Number(patients[0].estadoP ?? 1) !== 1) { const error = new Error("El paciente esta inactivo"); error.status = 400; throw error; }
    const agendaName = patientId ? patients[0].NombreP : String(patientName || "").trim();
    const agendaPhone = contact || (patientId ? patients[0].telefonoP : "") || "";
    if (!agendaName || !agendaPhone) { const error = new Error("Faltan nombre y telefono del paciente"); error.status = 400; throw error; }
    const [result] = patientId
      ? await connection.query("CALL sp_agenda_create_with_identity(?,?,?,?,?,?,?,?,?,?,?)", [agendaName, Number(patientId), String(time).slice(0, 5), date, Number(serviceId), agendaPhone, "Pendiente", comment || services[0].nombreS, 0, 0, 0])
      : await connection.query("CALL sp_agenda_create(?,?,?,?,?,?,?,?,?)", [agendaName, String(time).slice(0, 5), date, agendaPhone, "Pendiente", comment || services[0].nombreS, 0, 0, 0]);
    const idAgendaAP = result[0][0].idAgendaAP;
    if (!patientId) await connection.query("UPDATE agendapersona SET servicioIdAP=? WHERE idAgendaAP=? AND pacienteIdAP IS NULL", [Number(serviceId), Number(idAgendaAP)]);
    await connection.query("INSERT INTO mensajes_auditoria (operacion,idempotencyKey,solicitante,payload,resultado,detalle) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE resultado=VALUES(resultado), detalle=VALUES(detalle)", ["create_appointment", idempotencyKey, "IA", JSON.stringify({ patientId, serviceId, date, time, contact, comment }), "success", String(idAgendaAP)]);
    return { ok: true, idAgendaAP };
  } finally {
    if (locked) { try { await connection.query("SELECT RELEASE_LOCK(?)", [lockName]); } catch {} }
    connection.release();
  }
}

async function getPatientRecord(patientId, connection = pool) {
  const [rows] = await connection.query("SELECT idPaciente, NombreP, telefonoP, estadoP FROM paciente WHERE idPaciente=? LIMIT 1", [Number(patientId)]);
  return rows[0] || null;
}

async function getOwnedAppointment({ patientId, appointmentId, patient, connection = pool }) {
  const name = normalizeText(patient?.NombreP);
  const phone = normalizeText(patient?.telefonoP).replace(/\D/g, "");
  const [rows] = await connection.query("SELECT a.idAgendaAP,a.nombreAP,a.pacienteIdAP,a.fechaAP,LEFT(TRIM(a.horaAP),5) AS horaAP,a.contactoAP,a.estadoAP,a.comentarioAP,a.servicioIdAP FROM agendapersona a WHERE a.idAgendaAP=? AND LOWER(TRIM(IFNULL(a.estadoAP,''))) NOT IN ('cancelado','cancelada') AND (a.pacienteIdAP=? OR (a.pacienteIdAP IS NULL AND (LOWER(TRIM(IFNULL(a.nombreAP,'')))=LOWER(TRIM(?)) OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(a.contactoAP,''),' ',''),'-',''),'(',''),')',''),'+','')=?))) LIMIT 1", [Number(appointmentId), Number(patientId), name, phone]);
  return rows[0] || null;
}

async function cancelAppointment({ patientId, appointmentId }) {
  const connection = await pool.getConnection();
  try {
    const patient = await getPatientRecord(patientId, connection);
    if (!patient || Number(patient.estadoP ?? 1) !== 1) { const error = new Error("Paciente no encontrado o inactivo"); error.status = 404; throw error; }
    const appointment = await getOwnedAppointment({ patientId, appointmentId, patient, connection });
    if (!appointment) { const error = new Error("La cita no pertenece al paciente o ya no está activa"); error.status = 409; throw error; }
    const [result] = await connection.query("UPDATE agendapersona SET estadoAP='Cancelado' WHERE idAgendaAP=? AND (pacienteIdAP=? OR pacienteIdAP IS NULL)", [Number(appointmentId), Number(patientId)]);
    if (!result.affectedRows) { const error = new Error("No se pudo cancelar la cita"); error.status = 409; throw error; }
    return { ok: true, appointmentId: Number(appointmentId), date: appointment.fechaAP, time: appointment.horaAP, treatment: appointment.comentarioAP || null };
  } finally { connection.release(); }
}

async function rescheduleAppointment({ patientId, appointmentId, newDate, newTime }) {
  const connection = await pool.getConnection();
  try {
    const patient = await getPatientRecord(patientId, connection);
    if (!patient || Number(patient.estadoP ?? 1) !== 1) { const error = new Error("Paciente no encontrado o inactivo"); error.status = 404; throw error; }
    const appointment = await getOwnedAppointment({ patientId, appointmentId, patient, connection });
    if (!appointment) { const error = new Error("La cita no pertenece al paciente o ya no está activa"); error.status = 409; throw error; }
    let serviceId = Number(appointment.servicioIdAP) || null;
    if (!serviceId && appointment.comentarioAP) serviceId = (await resolveService(appointment.comentarioAP)).service?.serviceId || null;
    if (!serviceId) { const error = new Error("La cita no tiene un servicio identificable para validar disponibilidad"); error.status = 409; throw error; }
    const availability = await searchAvailability({ serviceId, date: newDate }, getDb(), connection);
    if (availability.dayUnavailable) { const error = new Error("Ese día no está disponible para agendar"); error.status = 409; throw error; }
    if (!availability.slots.some((slot) => slot.time === String(newTime).slice(0, 5))) { const error = new Error("El nuevo horario no está disponible"); error.status = 409; throw error; }
    const [result] = await connection.query("UPDATE agendapersona SET fechaAP=?, horaAP=?, servicioIdAP=COALESCE(servicioIdAP,?) WHERE idAgendaAP=? AND (pacienteIdAP=? OR pacienteIdAP IS NULL)", [newDate, String(newTime).slice(0, 5), serviceId, Number(appointmentId), Number(patientId)]);
    if (!result.affectedRows) { const error = new Error("No se pudo reprogramar la cita"); error.status = 409; throw error; }
    return { ok: true, appointmentId: Number(appointmentId), date: newDate, time: String(newTime).slice(0, 5), serviceId };
  } finally { connection.release(); }
}

// Marca una cita como 'Confirmado' cuando el paciente confirmó asistencia (tras un
// recordatorio). Solo pisa estado vacío o 'Pendiente': nunca 'Cancelado' ni
// 'Reprogramado'. Idempotente: si ya está confirmada devuelve already_confirmed.
async function confirmAppointmentAttendance({ appointmentId }) {
  const id = Number(appointmentId);
  if (!Number.isInteger(id) || id < 1) { const error = new Error("Cita invalida"); error.status = 400; throw error; }
  const [rows] = await pool.query("SELECT idAgendaAP, DATE_FORMAT(fechaAP,'%Y-%m-%d') AS fechaAP, LEFT(TRIM(IFNULL(horaAP,'')),5) AS horaAP, LOWER(TRIM(IFNULL(estadoAP,''))) AS estado FROM agendapersona WHERE idAgendaAP=? LIMIT 1", [id]);
  const appt = rows[0];
  if (!appt) return { ok: false, status: "not_confirmable" };
  if (["confirmado", "confirmada"].includes(appt.estado)) return { ok: true, status: "already_confirmed", date: appt.fechaAP, time: appt.horaAP };
  if (["cancelado", "cancelada", "reprogramado", "reprogramada"].includes(appt.estado)) return { ok: false, status: "not_confirmable" };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  if (appt.fechaAP < today) return { ok: false, status: "not_confirmable" };
  const [result] = await pool.query("UPDATE agendapersona SET estadoAP='Confirmado' WHERE idAgendaAP=? AND LOWER(TRIM(IFNULL(estadoAP,''))) IN ('','pendiente')", [id]);
  if (!result.affectedRows) return { ok: true, status: "already_confirmed", date: appt.fechaAP, time: appt.horaAP };
  return { ok: true, status: "confirmed", date: appt.fechaAP, time: appt.horaAP };
}

module.exports = { findPatientByName, createAppointmentForAssistant: createAppointmentForAssistantWithCapacity, cancelAppointment, rescheduleAppointment, confirmAppointmentAttendance };
