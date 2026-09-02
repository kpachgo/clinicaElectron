const pool = require("../../config/db");
const { getDb } = require("../mensajesDatabase.service");

const DEFAULT_SCHEDULE = {
  0: [],
  1: [{ start: "08:00", end: "18:00" }],
  2: [{ start: "08:00", end: "18:00" }],
  3: [{ start: "08:00", end: "18:00" }],
  4: [{ start: "08:00", end: "18:00" }],
  5: [{ start: "08:00", end: "18:00" }],
  6: []
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")); }
function minutes(value) { const [h, m] = String(value).split(":").map(Number); return h * 60 + m; }
function timeText(value) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function dateWeekday(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
function isRealDate(value) { if (!validDate(value)) return false; const date = new Date(`${value}T12:00:00Z`); return date.toISOString().slice(0, 10) === value; }
function parseJson(value, fallback) { try { return JSON.parse(value || ""); } catch { return fallback; } }
// Normaliza la ventana horaria propia de un servicio a { 0..6: [{start,end}] }.
// Solo conserva días con al menos un rango válido; el resto queda cerrado para ese servicio.
function normalizeWeeklyHours(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const weekly = {};
  for (let day = 0; day <= 6; day += 1) {
    const ranges = Array.isArray(source[day]) ? source[day] : [];
    const clean = ranges
      .filter((range) => validTime(range && range.start) && validTime(range && range.end) && minutes(range.start) < minutes(range.end))
      .map((range) => ({ start: range.start, end: range.end }));
    if (clean.length) weekly[day] = clean;
  }
  return weekly;
}
function serviceConfig(row, aliases = []) {
  const weeklyHours = normalizeWeeklyHours(parseJson(row.weekly_hours_json, {}));
  return {
    serviceId: Number(row.service_id || row.idServicio),
    serviceName: row.nombreS || row.service_name || "",
    durationMinutes: Number(row.duration_minutes || 30),
    capacityPerHour: row.capacity_per_hour === null || row.capacity_per_hour === undefined || row.capacity_per_hour === "" ? null : Number(row.capacity_per_hour),
    minimumAdvanceMinutes: Number(row.minimum_advance_minutes || 0),
     enabled: row.enabled === undefined ? false : Boolean(row.enabled),
    price: row.precioS === null || row.precioS === undefined || row.precioS === "" ? null : Number(row.precioS),
    sharePrice: Boolean(row.share_price),
    requiresIdentifiedPatient: Boolean(row.requires_identified_patient),
    weeklyHours,
    hasWeeklyHours: Object.keys(weeklyHours).length > 0,
    aliases
  };
}

function getClinicSchedule(db = getDb()) {
  const row = db.prepare("SELECT timezone, slot_interval_minutes AS slotIntervalMinutes, schedule_json AS schedule, breaks_json AS breaks, daily_cap AS dailyCap, hourly_cap AS hourlyCap, updated_at AS updatedAt FROM ai_clinic_schedule WHERE id=1").get();
  const dailyCap = row?.dailyCap === null || row?.dailyCap === undefined || Number(row.dailyCap) <= 0 ? null : Number(row.dailyCap);
  const hourlyCap = row?.hourlyCap === null || row?.hourlyCap === undefined || Number(row.hourlyCap) <= 0 ? null : Number(row.hourlyCap);
  return { timezone: row?.timezone || "America/El_Salvador", slotIntervalMinutes: Number(row?.slotIntervalMinutes || 30), schedule: parseJson(row?.schedule, DEFAULT_SCHEDULE), breaks: parseJson(row?.breaks, []), dailyCap, hourlyCap, updatedAt: row?.updatedAt || null };
}
// Tope diario total de la clínica (todas las citas de agendapersona ese día, IA + recepción).
// value: número >=1 para activar, null/0/"" para quitar el tope.
function updateDailyCap(value, db = getDb()) {
  const raw = value === null || value === undefined || String(value).trim() === "" ? null : Number(value);
  if (raw !== null && (!Number.isInteger(raw) || raw < 1 || raw > 1000)) throw new Error("Tope diario invalido");
  db.prepare("UPDATE ai_clinic_schedule SET daily_cap=?, updated_at=datetime('now') WHERE id=1").run(raw);
  return getClinicSchedule(db);
}
// Tope de citas por hora total de la clínica (todos los servicios, IA + recepción).
// Al llegar al tope en una hora, la IA no ofrece ni agenda horarios que caigan en ella.
// value: número >=1 para activar, null/0/"" para quitar el tope.
function updateHourlyCap(value, db = getDb()) {
  const raw = value === null || value === undefined || String(value).trim() === "" ? null : Number(value);
  if (raw !== null && (!Number.isInteger(raw) || raw < 1 || raw > 100)) throw new Error("Tope por hora invalido");
  db.prepare("UPDATE ai_clinic_schedule SET hourly_cap=?, updated_at=datetime('now') WHERE id=1").run(raw);
  return getClinicSchedule(db);
}
// Normaliza y fusiona las franjas de un bloqueo parcial de fecha.
// Descarta rangos inválidos; ordena y une los contiguos o solapados.
function normalizeBlockedHours(raw) {
  const list = (Array.isArray(raw) ? raw : [])
    .filter((range) => range && validTime(range.start) && validTime(range.end) && minutes(range.start) < minutes(range.end))
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => minutes(a.start) - minutes(b.start));
  const merged = [];
  for (const range of list) {
    const last = merged[merged.length - 1];
    if (last && minutes(range.start) <= minutes(last.end)) {
      if (minutes(range.end) > minutes(last.end)) last.end = range.end;
    } else merged.push({ ...range });
  }
  return merged;
}
function listBlockedDates(db = getDb()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  return db.prepare("SELECT id, date, reason, blocked_hours_json FROM ai_blocked_dates WHERE date >= ? ORDER BY date").all(today)
    .map(({ blocked_hours_json, ...row }) => ({ ...row, blockedHours: normalizeBlockedHours(parseJson(blocked_hours_json, [])) }));
}
function addBlockedDate({ date, reason, blockedHours } = {}, db = getDb()) {
  if (!isRealDate(date)) throw new Error("Fecha invalida");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  if (date < today) throw new Error("No se puede bloquear una fecha pasada");
  const hours = normalizeBlockedHours(blockedHours);
  // Se pidieron franjas pero ninguna quedó válida: no degradar a día completo en silencio.
  if (Array.isArray(blockedHours) && blockedHours.length && !hours.length) throw new Error("Horario de bloqueo invalido");
  const hoursJson = hours.length ? JSON.stringify(hours) : null;
  db.prepare("INSERT INTO ai_blocked_dates(date, reason, blocked_hours_json) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET reason=excluded.reason, blocked_hours_json=excluded.blocked_hours_json").run(date, String(reason || "").trim().slice(0, 200), hoursJson);
  return listBlockedDates(db);
}
function removeBlockedDate(id, db = getDb()) {
  db.prepare("DELETE FROM ai_blocked_dates WHERE id=?").run(Number(id));
  return listBlockedDates(db);
}
// null = la fecha no está bloqueada.
// { fullDay: true } = día completo cerrado.
// { fullDay: false, ranges } = solo esas franjas de esa fecha.
function getDateBlock(date, db = getDb()) {
  const row = db.prepare("SELECT blocked_hours_json FROM ai_blocked_dates WHERE date=?").get(date);
  if (!row) return null;
  const ranges = normalizeBlockedHours(parseJson(row.blocked_hours_json, []));
  return ranges.length ? { fullDay: false, ranges } : { fullDay: true, ranges: [] };
}
function updateClinicSchedule(input, db = getDb()) {
  const timezone = String(input.timezone || "America/El_Salvador");
  const slotIntervalMinutes = Number(input.slotIntervalMinutes);
  if (!/^\d+$/.test(String(slotIntervalMinutes)) || slotIntervalMinutes < 5 || slotIntervalMinutes > 240) throw new Error("Intervalo invalido");
  const schedule = input.schedule;
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) throw new Error("Horario invalido");
  for (let day = 0; day <= 6; day += 1) {
    const ranges = Array.isArray(schedule[day]) ? schedule[day] : [];
    for (const range of ranges) if (!validTime(range.start) || !validTime(range.end) || minutes(range.start) >= minutes(range.end)) throw new Error("Rango horario invalido");
  }
  const breaks = Array.isArray(input.breaks) ? input.breaks.map((item) => ({ day: item.day === undefined || item.day === null || item.day === "" ? null : Number(item.day), start: String(item.start || ""), end: String(item.end || "") })) : [];
  if (breaks.some((item) => (item.day !== null && (!Number.isInteger(item.day) || item.day < 0 || item.day > 6)) || !validTime(item.start) || !validTime(item.end) || minutes(item.start) === minutes(item.end))) throw new Error("Pausa invalida");
  db.prepare("UPDATE ai_clinic_schedule SET timezone=?, slot_interval_minutes=?, schedule_json=?, breaks_json=?, updated_at=datetime('now') WHERE id=1").run(timezone, slotIntervalMinutes, JSON.stringify(schedule), JSON.stringify(breaks));
  return getClinicSchedule(db);
}

async function listAiServices(search = "", db = getDb(), sqlClient = pool) {
  const [services] = await sqlClient.query("SELECT idServicio, nombreS, precioS FROM servicio ORDER BY nombreS");
  const configs = db.prepare("SELECT * FROM ai_service_settings").all();
  const aliases = db.prepare("SELECT service_id, alias FROM ai_service_aliases ORDER BY id").all();
  const byId = new Map(configs.map((row) => [Number(row.service_id), row]));
  const aliasById = new Map();
  aliases.forEach((row) => { if (!aliasById.has(Number(row.service_id))) aliasById.set(Number(row.service_id), []); aliasById.get(Number(row.service_id)).push(row.alias); });
  const needle = normalizeText(search);
  return services.map((service) => serviceConfig({ ...service, ...(byId.get(Number(service.idServicio)) || {}) }, aliasById.get(Number(service.idServicio)) || []))
    .filter((item) => !needle || normalizeText(item.serviceName).includes(needle) || item.aliases.some((alias) => normalizeText(alias).includes(needle)));
}

async function updateAiService(serviceId, input, db = getDb()) {
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id < 1) throw new Error("Servicio invalido");
  const [services] = await pool.query("SELECT idServicio, nombreS FROM servicio WHERE idServicio=? LIMIT 1", [id]);
  if (!services[0]) { const error = new Error("Servicio no encontrado"); error.status = 404; throw error; }
  const durationMinutes = Number(input.durationMinutes);
  const unlimitedCapacity = input.capacityPerHour === null || input.capacityPerHour === undefined || String(input.capacityPerHour).trim() === "" || Number(input.capacityPerHour) === 0;
  const capacityPerHour = unlimitedCapacity ? null : Number(input.capacityPerHour);
  const minimumAdvanceMinutes = Number(input.minimumAdvanceMinutes || 0);
  const sharePrice = input.sharePrice === undefined ? null : (input.sharePrice ? 1 : 0);
  const requiresIdentifiedPatient = input.requiresIdentifiedPatient === undefined ? null : (input.requiresIdentifiedPatient ? 1 : 0);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 1440) throw new Error("Duracion invalida");
  if (!unlimitedCapacity && (!Number.isInteger(capacityPerHour) || capacityPerHour < 1 || capacityPerHour > 100)) throw new Error("Capacidad invalida");
  if (!Number.isInteger(minimumAdvanceMinutes) || minimumAdvanceMinutes < 0 || minimumAdvanceMinutes > 43200) throw new Error("Anticipacion invalida");
  const aliases = [...new Set((Array.isArray(input.aliases) ? input.aliases : []).map(normalizeText).filter(Boolean))];
  // weeklyHours ausente en el input = no tocar el valor guardado (COALESCE); presente = reemplazar.
  const weeklyHoursProvided = input.weeklyHours !== undefined;
  let weeklyHoursJson = null;
  if (weeklyHoursProvided) {
    const weeklyRaw = input.weeklyHours && typeof input.weeklyHours === "object" && !Array.isArray(input.weeklyHours) ? input.weeklyHours : {};
    const weeklyHours = {};
    for (let day = 0; day <= 6; day += 1) {
      const ranges = Array.isArray(weeklyRaw[day]) ? weeklyRaw[day] : [];
      const clean = [];
      for (const range of ranges) {
        if (!validTime(range && range.start) || !validTime(range && range.end) || minutes(range.start) >= minutes(range.end)) throw new Error("Rango horario del servicio invalido");
        clean.push({ start: range.start, end: range.end });
      }
      if (clean.length) weeklyHours[day] = clean;
    }
    weeklyHoursJson = JSON.stringify(weeklyHours);
  }
  db.transaction(() => {
    db.prepare("INSERT INTO ai_service_settings(service_id,duration_minutes,capacity_per_hour,required_questions_json,blocked_weekdays_json,blocked_hours_json,available_hours_json,weekly_hours_json,minimum_advance_minutes,enabled,share_price,requires_identified_patient,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(service_id) DO UPDATE SET duration_minutes=excluded.duration_minutes,capacity_per_hour=excluded.capacity_per_hour,required_questions_json='[]',blocked_weekdays_json='[]',blocked_hours_json='[]',available_hours_json='[]',weekly_hours_json=COALESCE(?,ai_service_settings.weekly_hours_json),minimum_advance_minutes=excluded.minimum_advance_minutes,enabled=excluded.enabled,share_price=COALESCE(?,ai_service_settings.share_price),requires_identified_patient=COALESCE(?,ai_service_settings.requires_identified_patient),updated_at=datetime('now')").run(id, durationMinutes, capacityPerHour, '[]', '[]', '[]', '[]', weeklyHoursJson ?? '{}', minimumAdvanceMinutes, input.enabled === false ? 0 : 1, sharePrice ?? 0, requiresIdentifiedPatient ?? 0, weeklyHoursJson, sharePrice, requiresIdentifiedPatient);
    db.prepare("DELETE FROM ai_service_aliases WHERE service_id=?").run(id);
    const insert = db.prepare("INSERT INTO ai_service_aliases(service_id,alias,normalized_alias) VALUES (?,?,?)");
    aliases.forEach((alias) => insert.run(id, alias, normalizeText(alias)));
  })();
  return (await listAiServices("", db)).find((item) => item.serviceId === id);
}

async function resolveService(query, db = getDb()) {
  const needle = normalizeText(query);
  if (!needle || needle.length < 3 || /^(si|no|ok|a|de|la|el|un|una|quiero)$/.test(needle)) return { status: "not_found", candidates: [] };
  const services = (await listAiServices("", db)).filter((service) => service.enabled);
  const stopWords = new Set(["quiero", "agendar", "agenda", "cita", "para", "mañana", "manana", "hoy", "favor", "por", "una", "un", "del", "que", "servicio", "consulta"]);
  const queryTokens = new Set(needle.split(" ").filter((token) => token.length >= 3 && !stopWords.has(token) && !/^\d+$/.test(token)));
  const scored = services.map((service) => {
    const values = [service.serviceName, ...(service.aliases || [])].map(normalizeText).filter((value) => value.length >= 3);
    let score = 0; let exact = false;
    for (const value of values) {
      if (value === needle || needle.includes(value)) { exact = true; score = Math.max(score, 100 + value.length); }
      const overlap = value.split(" ").filter((token) => token.length >= 3 && queryTokens.has(token)).length;
      score = Math.max(score, overlap * 10 + (overlap ? value.length / 100 : 0));
    }
    return { service, score, exact };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.service.serviceName.localeCompare(b.service.serviceName));
  const exactMatches = [...new Map(scored.filter((item) => item.exact).map((item) => [item.service.serviceId, item])).values()].map((item) => item.service);
  if (exactMatches.length === 1) return { status: "matched", service: exactMatches[0], candidates: exactMatches };
  const unique = [...new Map(scored.map((item) => [item.service.serviceId, item])).values()].map((item) => item.service);
  if (unique.length === 1) return { status: "matched", service: unique[0], candidates: unique };
  return { status: unique.length ? "ambiguous" : "not_found", candidates: unique.slice(0, 8) };
}

function breakBlocked(breaks, start, end, weekday) {
  return (breaks || []).some((item) => {
    if (item.day !== undefined && item.day !== null && Number(item.day) !== weekday) return false;
    const from = minutes(item.start), to = minutes(item.end);
    if (from < to) return start < to && end > from;
    return start < to || end > from;
  });
}
async function searchAvailability({ serviceId, date }, db = getDb(), sqlClient = pool) {
  if (!isRealDate(date)) throw new Error("Fecha invalida");
  const services = await listAiServices("", db, sqlClient);
  const config = services.find((item) => item.serviceId === Number(serviceId));
  if (!config || !config.enabled) { const error = new Error("Servicio no disponible para IA"); error.status = 404; throw error; }
  const clinic = getClinicSchedule(db);
  const weekday = dateWeekday(date);
  // Cierre manual de fecha (asueto / cierre administrativo / día lleno): sin slots, sin importar servicio.
  const dateBlock = getDateBlock(date, db);
  if (dateBlock?.fullDay) {
    return { ok: true, service: { id: config.serviceId, name: config.serviceName, durationMinutes: config.durationMinutes }, date, slots: [], dayUnavailable: true, serviceClosedThatDay: false, serviceWindow: null };
  }
  // Tope diario total de la clínica: cuenta TODAS las citas activas de ese día (IA + recepción).
  if (clinic.dailyCap) {
    const [capRows] = await sqlClient.query("SELECT COUNT(*) AS total FROM agendapersona WHERE fechaAP=? AND LOWER(TRIM(IFNULL(estadoAP,''))) NOT IN ('cancelado','cancelada')", [date]);
    if (Number(capRows[0]?.total || 0) >= clinic.dailyCap) {
      return { ok: true, service: { id: config.serviceId, name: config.serviceName, durationMinutes: config.durationMinutes }, date, slots: [], dayUnavailable: true, serviceClosedThatDay: false, serviceWindow: null };
    }
  }
  const ranges = Array.isArray(clinic.schedule?.[weekday]) ? clinic.schedule[weekday] : [];
  // Ventana horaria propia del servicio (si tiene): se intersecta con el horario general.
  // Con ventana activa, un día sin franjas deja el servicio cerrado ese día.
  const serviceWindow = config.hasWeeklyHours ? (Array.isArray(config.weeklyHours[weekday]) ? config.weeklyHours[weekday] : []) : null;
  const serviceClosedThatDay = config.hasWeeklyHours && (!serviceWindow || serviceWindow.length === 0);
  const [rows] = await sqlClient.query("SELECT horaAP AS time, servicioIdAP AS serviceId FROM agendapersona WHERE fechaAP=? AND LOWER(TRIM(IFNULL(estadoAP,''))) NOT IN ('cancelado','cancelada') AND servicioIdAP=?", [date, config.serviceId]);
  const occupancy = new Map();
  rows.forEach((row) => { const hour = Math.floor(minutes(String(row.time).slice(0, 5)) / 60); occupancy.set(hour, (occupancy.get(hour) || 0) + 1); });
  // Ocupación total de la hora (todos los servicios, IA + recepción) para el tope por hora de la clínica.
  const hourlyOccupancy = new Map();
  if (clinic.hourlyCap) {
    const [allRows] = await sqlClient.query("SELECT horaAP AS time FROM agendapersona WHERE fechaAP=? AND LOWER(TRIM(IFNULL(estadoAP,''))) NOT IN ('cancelado','cancelada')", [date]);
    allRows.forEach((row) => { const hour = Math.floor(minutes(String(row.time).slice(0, 5)) / 60); hourlyOccupancy.set(hour, (hourlyOccupancy.get(hour) || 0) + 1); });
  }
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone }).format(now);
  const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: clinic.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const minimum = date === today ? minutes(nowTime) + config.minimumAdvanceMinutes : (date < today ? Number.MAX_SAFE_INTEGER : 0);
  const slots = [];
  for (const range of ranges) {
    const from = minutes(range.start), to = minutes(range.end);
    for (let start = from; start + config.durationMinutes <= to; start += clinic.slotIntervalMinutes) {
      const end = start + config.durationMinutes;
      if (date === today && start < minimum) continue;
      if (breakBlocked(clinic.breaks, start, end, weekday)) continue;
      // Franjas bloqueadas solo para esta fecha puntual (los rangos no llevan día).
      if (dateBlock && breakBlocked(dateBlock.ranges, start, end, weekday)) continue;
      if (serviceWindow && !serviceWindow.some((r) => start >= minutes(r.start) && end <= minutes(r.end))) continue;
      let valid = true;
      if (config.capacityPerHour !== null) for (let cursor = start; cursor < end; cursor += 60) if ((occupancy.get(Math.floor(cursor / 60)) || 0) >= config.capacityPerHour) valid = false;
      if (clinic.hourlyCap) for (let cursor = start; cursor < end; cursor += 60) if ((hourlyOccupancy.get(Math.floor(cursor / 60)) || 0) >= clinic.hourlyCap) valid = false;
      if (valid) slots.push({ date, time: timeText(start), endTime: timeText(end) });
    }
  }
  return { ok: true, service: { id: config.serviceId, name: config.serviceName, durationMinutes: config.durationMinutes }, date, slots, serviceClosedThatDay, serviceWindow: config.hasWeeklyHours ? config.weeklyHours : null };
}

module.exports = { normalizeText, getClinicSchedule, updateClinicSchedule, updateDailyCap, updateHourlyCap, listBlockedDates, addBlockedDate, removeBlockedDate, listAiServices, updateAiService, resolveService, searchAvailability };
