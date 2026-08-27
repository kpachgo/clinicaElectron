const pool = require("../config/db");
const { isValidId, isNonEmptyString } = require("../utils/validators");
const { searchAvailability } = require("../services/mensajes/aiAvailability.service");

const ROLES = ["Administrador", "Recepcion"];
const PATIENT_FIELDS = new Set(["telefono"]);
const APPOINTMENT_FIELDS = new Set(["patientId", "date", "time", "serviceId", "contact", "comment", "idempotencyKey", "patientConfirmed"]);

function rejectUnknown(body, allowed) {
  return Object.keys(body || {}).find((key) => !allowed.has(key));
}
function normalizePhone(value) { return String(value || "").replace(/\D/g, ""); }
function bad(res, message) { return res.status(400).json({ ok: false, message }); }
async function audit({ operation, key, user, payload, result, detail }) {
  await pool.query(
    "INSERT INTO mensajes_auditoria (operacion,idempotencyKey,solicitante,payload,resultado,detalle) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE resultado=VALUES(resultado), detalle=VALUES(detalle)",
    [operation, key || null, user?.rol || "Mensajes", JSON.stringify(payload || {}), result, detail || null]
  );
}
function ensureRole(req, res) {
  if (!ROLES.includes(req.user?.rol)) { res.status(403).json({ ok: false, message: "No tiene permiso para usar Mensajes" }); return false; }
  return true;
}

exports.findPatientByPhone = async (req, res) => {
  if (!ensureRole(req, res)) return;
  const extra = rejectUnknown(req.query, PATIENT_FIELDS);
  const phone = normalizePhone(req.query?.telefono);
  if (extra || phone.length < 7) return bad(res, "Telefono invalido");
  try {
    const [rows] = await pool.query("SELECT idPaciente, NombreP, telefonoP, estadoP, tipoTratamientoP FROM paciente WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(telefonoP,''),' ',''),'-',''),'(',''),')',''),'+',''),'.','') = ? LIMIT 10", [phone]);
    res.json({ ok: true, patients: rows.map((p) => ({ id: p.idPaciente, name: p.NombreP, phone: p.telefonoP, active: Number(p.estadoP ?? 1) === 1, treatment: p.tipoTratamientoP || null })) });
  } catch (err) { res.status(500).json({ ok: false, message: "No se pudo consultar el paciente" }); }
};

exports.getService = async (req, res) => {
  if (!ensureRole(req, res)) return;
  if (!isValidId(req.params.id)) return bad(res, "Servicio invalido");
  try {
    const [rows] = await pool.query("SELECT idServicio, nombreS, precioS FROM servicio WHERE idServicio = ? LIMIT 1", [Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ ok: false, message: "Servicio no encontrado" });
    res.json({ ok: true, service: { id: rows[0].idServicio, name: rows[0].nombreS, price: rows[0].precioS, active: true, duration: null, rules: [] } });
  } catch (err) { res.status(500).json({ ok: false, message: "No se pudo consultar el servicio" }); }
};

exports.searchAvailability = async (req, res) => {
  if (!ensureRole(req, res)) return;
  const { date, time, serviceId } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return bad(res, "Fecha invalida");
  try {
    if (serviceId) return res.json(await searchAvailability({ serviceId, date }));
    const [rows] = await pool.query("SELECT horaAP AS time FROM agendapersona WHERE fechaAP = ? AND LOWER(TRIM(IFNULL(estadoAP,''))) NOT IN ('cancelado','cancelada') ORDER BY horaAP", [date]);
    const occupied = new Set(rows.map((r) => String(r.time).slice(0, 5)));
    res.json({ ok: true, date, requestedTime: time || null, available: time ? !occupied.has(String(time).slice(0, 5)) : null, occupied: [...occupied] });
  } catch (err) { res.status(500).json({ ok: false, message: "No se pudo consultar disponibilidad" }); }
};

exports.createAppointment = async (req, res) => {
  if (!ensureRole(req, res)) return;
  const body = req.body || {};
  if (rejectUnknown(body, APPOINTMENT_FIELDS)) return bad(res, "La solicitud contiene campos no permitidos");
  const { patientId, date, time, serviceId, contact, comment, idempotencyKey, patientConfirmed } = body;
  if (!isValidId(patientId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}/.test(String(time || "")) || !isValidId(serviceId) || !isNonEmptyString(idempotencyKey) || patientConfirmed !== true) return bad(res, "Faltan datos o confirmacion del paciente");
  try {
    const [existing] = await pool.query("SELECT detalle FROM mensajes_auditoria WHERE operacion='create_appointment' AND idempotencyKey=? LIMIT 1", [idempotencyKey]);
    if (existing[0]?.detalle) return res.json({ ok: true, duplicate: true, idAgendaAP: Number(existing[0].detalle) });
    const [busy] = await pool.query("SELECT idAgendaAP FROM agendapersona WHERE fechaAP=? AND horaAP=? AND LOWER(TRIM(IFNULL(estadoAP,''))) NOT IN ('cancelado','cancelada') LIMIT 1", [date, time]);
    if (busy[0]) return res.status(409).json({ ok: false, message: "El horario ya esta ocupado" });
    const [service] = await pool.query("SELECT nombreS FROM servicio WHERE idServicio=? LIMIT 1", [serviceId]);
    if (!service[0]) return res.status(404).json({ ok: false, message: "Servicio no encontrado" });
    const [patient] = await pool.query("SELECT NombreP, telefonoP, estadoP FROM paciente WHERE idPaciente=? LIMIT 1", [patientId]);
    if (!patient[0]) return res.status(404).json({ ok: false, message: "Paciente no encontrado" });
    if (Number(patient[0].estadoP ?? 1) !== 1) return bad(res, "El paciente esta inactivo");
    const [result] = await pool.query("CALL sp_agenda_create(?,?,?,?,?,?,?,?,?)", [patient[0].NombreP, time, date, contact || patient[0].telefonoP || "", "Pendiente", comment || service[0].nombreS, 0, 0, 0]);
    const id = result[0][0].idAgendaAP;
    await audit({ operation: "create_appointment", key: idempotencyKey, user: req.user, payload: body, result: "success", detail: String(id) });
    res.status(201).json({ ok: true, idAgendaAP: id });
  } catch (err) { res.status(500).json({ ok: false, message: "No se pudo crear la cita" }); }
};

exports.rescheduleAppointment = async (req, res) => {
  if (!ensureRole(req, res)) return;
  const body = req.body || {};
  const allowed = new Set(["appointmentId", "date", "time", "idempotencyKey", "patientConfirmed"]);
  if (rejectUnknown(body, allowed)) return bad(res, "La solicitud contiene campos no permitidos");
  const { appointmentId, date, time, idempotencyKey, patientConfirmed } = body;
  if (!isValidId(appointmentId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}/.test(String(time || "")) || !isNonEmptyString(idempotencyKey) || patientConfirmed !== true) return bad(res, "Faltan datos o confirmacion del paciente");
  try {
    const [existing] = await pool.query("SELECT detalle FROM mensajes_auditoria WHERE operacion='reschedule_appointment' AND idempotencyKey=? LIMIT 1", [idempotencyKey]);
    if (existing[0]?.detalle) return res.json({ ok: true, duplicate: true, appointmentId: Number(existing[0].detalle) });
    const [busy] = await pool.query("SELECT idAgendaAP FROM agendapersona WHERE fechaAP=? AND horaAP=? AND idAgendaAP<>? AND LOWER(TRIM(IFNULL(estadoAP,''))) NOT IN ('cancelado','cancelada') LIMIT 1", [date, time, appointmentId]);
    if (busy[0]) return res.status(409).json({ ok: false, message: "El horario ya esta ocupado" });
    const [current] = await pool.query("SELECT idAgendaAP FROM agendapersona WHERE idAgendaAP=? LIMIT 1", [appointmentId]);
    if (!current[0]) return res.status(404).json({ ok: false, message: "Cita no encontrada" });
    await pool.query("CALL sp_agenda_update(?,?,?,?,?,?,?,?,?,?)", [appointmentId, null, time, date, null, null, null, null, null, null]);
    await audit({ operation: "reschedule_appointment", key: idempotencyKey, user: req.user, payload: body, result: "success", detail: String(appointmentId) });
    res.json({ ok: true, appointmentId });
  } catch (err) { res.status(500).json({ ok: false, message: "No se pudo reprogramar la cita" }); }
};

exports.cancelAppointment = async (req, res) => {
  if (!ensureRole(req, res)) return;
  const body = req.body || {};
  const allowed = new Set(["appointmentId", "idempotencyKey", "patientConfirmed"]);
  if (rejectUnknown(body, allowed)) return bad(res, "La solicitud contiene campos no permitidos");
  const { appointmentId, idempotencyKey, patientConfirmed } = body;
  if (!isValidId(appointmentId) || !isNonEmptyString(idempotencyKey) || patientConfirmed !== true) return bad(res, "Faltan datos o confirmacion del paciente");
  try {
    const [existing] = await pool.query("SELECT detalle FROM mensajes_auditoria WHERE operacion='cancel_appointment' AND idempotencyKey=? LIMIT 1", [idempotencyKey]);
    if (existing[0]?.detalle) return res.json({ ok: true, duplicate: true, appointmentId: Number(existing[0].detalle) });
    const [current] = await pool.query("SELECT idAgendaAP FROM agendapersona WHERE idAgendaAP=? LIMIT 1", [appointmentId]);
    if (!current[0]) return res.status(404).json({ ok: false, message: "Cita no encontrada" });
    await pool.query("CALL sp_agenda_update(?,?,?,?,?,?,?,?,?,?)", [appointmentId, null, null, null, null, "Cancelado", null, null, null, null]);
    await audit({ operation: "cancel_appointment", key: idempotencyKey, user: req.user, payload: body, result: "success", detail: String(appointmentId) });
    res.json({ ok: true, appointmentId });
  } catch (err) { res.status(500).json({ ok: false, message: "No se pudo cancelar la cita" }); }
};
