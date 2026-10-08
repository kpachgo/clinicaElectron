"use strict";

// Herramientas del asistente. Cada una es un envoltorio fino sobre servicios que
// ya validan contra el backend. No mantienen estado de dialogo.

const pool = require("../../config/db");
const { listAiServices, resolveService, searchAvailability, normalizeText } = require("./aiAvailability.service");
const { queryPatientAppointments } = require("./agendaAiQuery.service");
// Se importa el módulo entero (no destructurado) para poder mockearlo en pruebas.
const appointmentActions = require("./aiAppointmentAction.service");
const { cancelAppointment, rescheduleAppointment } = appointmentActions;
const { resolveDatePreference, timeFromText } = require("./dateTimeResolver.service");
const { to12h } = require("./timeFormat.service");
const { requestJudgement } = require("./assistantProvider.service");
const { MensajesRepository } = require("./mensajesRepository.service");
const { getDb } = require("../mensajesDatabase.service");
const { isModoVentaEnabled } = require("../appMode.service");

// Solo para leer el recordatorio reciente que se está confirmando (correlación
// teléfono -> cita). Ninguna interpretación vive acá: eso lo hace el modelo.
const reminderRepo = new MensajesRepository(getDb());

function digitsOf(value) { return String(value || "").replace(/\D/g, ""); }
function namesConsistent(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// Busca un paciente YA registrado. Nunca hace match difuso.
// Devuelve { id, name, expedientePhone, matchedBy } o null si no hay una única coincidencia clara.
async function findExistingPatient({ name, phone }) {
  const digits = digitsOf(phone);
  const needle = normalizeText(name);
  const clauses = [];
  const params = [];
  if (digits.length >= 7) { clauses.push("REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(telefonoP,''),' ',''),'-',''),'(',''),')',''),'+','') = ?"); params.push(digits); }
  if (needle) { clauses.push("LOWER(TRIM(NombreP)) LIKE CONCAT('%', ?, '%')"); params.push(String(name || "").trim().toLowerCase()); }
  if (!clauses.length) return null;
  const [rows] = await pool.query(`SELECT idPaciente, NombreP, telefonoP, tipoTratamientoP, estadoP FROM paciente WHERE (${clauses.join(" OR ")}) LIMIT 25`, params);
  const active = rows.filter((row) => Number(row.estadoP ?? 1) === 1);
  const asMatch = (row, matchedBy) => ({ id: Number(row.idPaciente), name: row.NombreP, expedientePhone: row.telefonoP || "", treatmentType: row.tipoTratamientoP || null, matchedBy });

  // 1) Teléfono exacto + nombre consistente -> match confiable.
  if (digits.length >= 7) {
    const byPhone = active.filter((row) => digitsOf(row.telefonoP) === digits && namesConsistent(row.NombreP, name));
    if (byPhone.length === 1) return asMatch(byPhone[0], "phone");
    // Teléfono coincide pero el nombre no -> posible familiar; no vinculamos.
    if (active.some((row) => digitsOf(row.telefonoP) === digits && !namesConsistent(row.NombreP, name))) {
      return { id: null, matchedBy: "phone_other_name" };
    }
  }
  // 2) Nombre exacto normalizado (único).
  const byName = active.filter((row) => needle && normalizeText(row.NombreP) === needle);
  if (byName.length === 1) return asMatch(byName[0], "name");

  return null;
}

const TOOL_SPECS = [
  {
    name: "consultar_servicios",
    description: "Lista los servicios que la clínica ofrece por este canal, con su duración y (si está permitido) su precio de lista. El precio devuelto es el de lista: si el texto de INFORMACIÓN DE LA CLÍNICA trae un precio o una promoción para ese servicio, ese manda. Úsala cuando el paciente pregunte qué servicios hay, cuánto cuesta algo, o antes de agendar si no está claro el servicio.",
    parameters: {
      type: "object",
      properties: {
        consulta: { type: "string", description: "Texto opcional para filtrar por nombre o alias, por ejemplo 'limpieza' o 'brackets'." }
      }
    }
  },
  {
    name: "consultar_disponibilidad",
    description: "Devuelve los horarios reales disponibles para un servicio en una fecha. Úsala siempre antes de proponer un horario. Nunca inventes horarios.",
    parameters: {
      type: "object",
      properties: {
        servicio: { type: "string", description: "Nombre o alias del servicio tal como lo dijo el paciente." },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD, o expresiones como 'hoy', 'mañana', 'el lunes'." },
        franja: { type: "string", enum: ["mañana", "tarde", "cualquiera"], description: "Preferencia de franja horaria si el paciente la indicó." }
      },
      required: ["servicio", "fecha"]
    }
  },
  {
    name: "consultar_citas_paciente",
    description: "Lista las próximas citas del paciente identificado. Requiere que el paciente esté identificado y verificado por recepción.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "crear_cita",
    description: "Registra una cita nueva. Llama esta herramienta con confirmado=true SOLO después de que el paciente haya aceptado explícitamente el servicio, la fecha y la hora exactos.",
    parameters: {
      type: "object",
      properties: {
        servicio: { type: "string" },
        fecha: { type: "string", description: "YYYY-MM-DD o expresión relativa." },
        hora: { type: "string", description: "Hora en formato de 12 horas con AM/PM, por ejemplo '2:30 PM'. También se acepta 24 horas." },
        nombre: { type: "string", description: "Solo para pacientes NO identificados. Si el paciente está identificado, omití este campo." },
        telefono: { type: "string", description: "Solo para pacientes NO identificados que dictaron un número. Si el paciente está identificado o dijo que usa el mismo número del chat, omití este campo." },
        usar_telefono_del_chat: { type: "boolean", description: "true si el paciente NO identificado confirmó que su teléfono es el mismo número de WhatsApp desde el que escribe." },
        telefono_confirmado: { type: "boolean", description: "Ponelo en true SOLO cuando la herramienta ya devolvió 'verificar_cambio_telefono' y el paciente confirmó que cambió de número. En esa re-llamada seguí pasando también nombre y telefono (el número nuevo)." },
        confirmado: { type: "boolean", description: "true solo tras la aceptación explícita del paciente." },
        acordado_por_recepcion: { type: "boolean", description: "true SOLO si en el historial un mensaje del personal de recepción le ofreció o confirmó al paciente esta misma fecha y hora, y el paciente la aceptó. El sistema lo verifica; si se confirma, la cita se registra aunque la agenda automática no muestre ese cupo y queda marcada para revisión de recepción." },
        nota: { type: "string", description: "Solo con acordado_por_recepcion: detalle breve para recepción que el servicio no dice, por ejemplo '2 extracciones'." }
      },
      required: ["servicio", "fecha", "hora", "confirmado"]
    }
  },
  {
    name: "reprogramar_cita",
    description: "Cambia la fecha y hora de una cita existente del paciente identificado. confirmado=true solo tras aceptación explícita.",
    parameters: {
      type: "object",
      properties: {
        id_cita: { type: "number", description: "id de la cita, obtenido de consultar_citas_paciente." },
        nueva_fecha: { type: "string" },
        nueva_hora: { type: "string", description: "Hora en formato de 12 horas con AM/PM, por ejemplo '2:30 PM'. También se acepta 24 horas." },
        confirmado: { type: "boolean" }
      },
      required: ["id_cita", "nueva_fecha", "nueva_hora", "confirmado"]
    }
  },
  {
    name: "cancelar_cita",
    description: "Cancela una cita existente del paciente identificado. confirmado=true solo tras aceptación explícita.",
    parameters: {
      type: "object",
      properties: {
        id_cita: { type: "number" },
        confirmado: { type: "boolean" }
      },
      required: ["id_cita", "confirmado"]
    }
  },
  {
    name: "confirmar_asistencia",
    description: "Marca que el paciente CONFIRMÓ que asistirá a su cita. Úsala solo cuando hay un recordatorio de cita (en el historial o en el bloque RECORDATORIO DE CITA) y el paciente responde dando a entender que sí va a asistir (con las palabras que sea). NO la uses si pide cambiar la fecha/hora o cancelar (eso es reprogramar/cancelar), ni si no queda claro. No necesita que el paciente esté identificado por recepción.",
    parameters: { type: "object", properties: { ids_cita: { type: "array", items: { type: "integer" }, description: "Solo si el recordatorio fue por varias citas (familiares con el mismo número): ids de las citas a las que se refiere el paciente." } } }
  },
  {
    name: "transferir_a_recepcion",
    description: "Deriva la conversación a una persona de recepción. Úsala cuando no puedas resolver la solicitud, cuando el paciente lo pida, o ante urgencias y quejas.",
    parameters: {
      type: "object",
      properties: { motivo: { type: "string", description: "Motivo breve de la transferencia." } },
      required: ["motivo"]
    }
  }
];

// Modo venta: la IA actúa solo como herramienta sobre recordatorios. Confirma o
// cancela la cita del recordatorio y todo lo demás lo pasa a recepción.
const SALE_TOOL_SPECS = [
  TOOL_SPECS.find((spec) => spec.name === "confirmar_asistencia"),
  {
    name: "cancelar_cita_recordatorio",
    description: "Cancela la cita del recordatorio que se le envió al paciente. Úsala solo cuando el paciente responde al recordatorio diciendo que NO podrá asistir o que quiere cancelar. Si el paciente ya fue claro en que cancela, llamala directo con confirmado=true; si queda en duda, preguntale primero si desea cancelar la cita. NO la uses si pide cambiar fecha u hora (eso va a recepción).",
    parameters: {
      type: "object",
      properties: { confirmado: { type: "boolean", description: "true solo cuando el paciente dejó claro que quiere cancelar." }, ids_cita: { type: "array", items: { type: "integer" }, description: "Solo si el recordatorio fue por varias citas (familiares con el mismo número): ids de las citas a las que se refiere el paciente." } },
      required: ["confirmado"]
    }
  },
  TOOL_SPECS.find((spec) => spec.name === "transferir_a_recepcion")
];

function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const preference = resolveDatePreference(raw);
  return preference?.dates?.[0] || null;
}

function toHhmm(value) {
  const raw = String(value || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return raw;
  return timeFromText(raw);
}

// Servicios marcados como "solo pacientes ya registrados" (control mensual de
// ortodoncia, emergencia de bracket…). Si el chat no está vinculado a un paciente,
// la IA no puede resolverlo: no sabe si el expediente existe ni si el tratamiento
// está activo. Devuelve _forceHumanReview, que aiObserver traduce en "no responder
// nada y pasar la conversación a recepción" para que identifique y la libere.
// El corte está también en consultar_disponibilidad a propósito: así frena ANTES de
// que el modelo alcance a ofrecerle horarios al paciente.
function identityGuard(service, ctx) {
  if (!service?.requiresIdentifiedPatient || ctx?.linkedPatient?.patientId) return null;
  return {
    estado: "requiere_identificacion",
    servicio: service.serviceName,
    _forceHumanReview: `"${service.serviceName}" solo se agenda a pacientes registrados y este chat no está identificado`,
    mensaje: "Este servicio es solo para pacientes ya registrados y este chat no está identificado por recepción. No le respondas nada al paciente: recepción va a tomar esta conversación."
  };
}

function inFranja(time, franja) {
  if (!franja || franja === "cualquiera") return true;
  const hour = Number(String(time).slice(0, 2));
  return franja === "mañana" ? hour < 12 : hour >= 12;
}

const WEEKLY_DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function describeServiceWindow(weeklyHours) {
  if (!weeklyHours || typeof weeklyHours !== "object") return "";
  const parts = [];
  for (let day = 0; day <= 6; day += 1) {
    const ranges = Array.isArray(weeklyHours[day]) ? weeklyHours[day] : [];
    if (ranges.length) parts.push(`${WEEKLY_DAY_NAMES[day]} ${ranges.map((r) => `${to12h(r.start)} a ${to12h(r.end)}`).join(" y ")}`);
  }
  return parts.join("; ");
}

async function consultarServicios(args) {
  const services = (await listAiServices(args?.consulta || "")).filter((service) => service.enabled);
  if (!services.length) return { estado: "sin_servicios", mensaje: "No hay servicios habilitados para agendar por este canal." };
  return {
    estado: "ok",
    servicios: services.map((service) => ({
      nombre: service.serviceName,
      alias: service.aliases || [],
      duracion_minutos: service.durationMinutes,
      precio_de_lista: service.sharePrice && service.price != null ? service.price : null,
      nota_precio: service.sharePrice && service.price != null ? "Precio de lista. Si el texto de la clínica trae precio o promoción para este servicio, usá ese." : null,
      horario_atencion: service.hasWeeklyHours ? describeServiceWindow(service.weeklyHours) : null
    }))
  };
}

async function consultarDisponibilidad(args, ctx) {
  const resolved = await resolveService(args?.servicio || "");
  if (resolved.status === "ambiguous") {
    return { estado: "servicio_ambiguo", opciones: resolved.candidates.map((c) => c.serviceName), mensaje: "Pedí al paciente que elija uno de estos servicios." };
  }
  if (resolved.status !== "matched" || !resolved.service) {
    return { estado: "servicio_no_encontrado", mensaje: "Ese servicio no está disponible para agendar por este canal." };
  }
  const restricted = identityGuard(resolved.service, ctx);
  if (restricted) return restricted;
  const date = toIsoDate(args?.fecha);
  if (!date) return { estado: "fecha_invalida", mensaje: "No se pudo interpretar la fecha. Pedí una fecha concreta." };
  let result;
  try {
    result = await searchAvailability({ serviceId: resolved.service.serviceId, date });
  } catch (error) {
    return { estado: "error", mensaje: error.message || "No se pudo consultar la disponibilidad." };
  }
  if (result.dayUnavailable) {
    return { estado: "dia_no_disponible", servicio: resolved.service.serviceName, fecha: date, mensaje: "Ese día no está disponible para agendar. Ofrecé al paciente otra fecha." };
  }
  const windowText = result.serviceWindow ? describeServiceWindow(result.serviceWindow) : "";
  if (result.serviceClosedThatDay) {
    return { estado: "servicio_no_disponible_ese_dia", servicio: resolved.service.serviceName, fecha: date, horario_atencion: windowText, mensaje: `Ese servicio no se atiende ese día. Su horario de atención es: ${windowText}. Ofrecé una fecha dentro de ese horario.` };
  }
  const horarios = (result.slots || []).map((slot) => slot.time).filter((time) => inFranja(time, args?.franja));
  const horariosMostrar = horarios.map(to12h);
  if (!horarios.length) {
    return { estado: "sin_cupos", servicio: resolved.service.serviceName, fecha: date, horario_atencion: windowText || null, mensaje: windowText ? `No hay horarios disponibles con esos criterios. El horario de atención de este servicio es: ${windowText}. Ofrecé otra fecha u hora dentro de ese horario.` : "No hay horarios disponibles con esos criterios. Ofrecé otra fecha." };
  }
  return { estado: "ok", servicio: resolved.service.serviceName, fecha: date, horarios: horariosMostrar };
}

async function consultarCitasPaciente(args, ctx) {
  const linked = ctx?.linkedPatient;
  if (!linked?.patientId) return { estado: "paciente_no_identificado", mensaje: "El paciente no está identificado por recepción; no se pueden consultar sus citas." };
  const result = await queryPatientAppointments({ patientId: linked.patientId, patientName: linked.patientName, phone: linked.phone, upcomingOnly: true });
  if (result.status !== "found") return { estado: "sin_citas", mensaje: "El paciente no tiene citas futuras activas." };
  return {
    estado: "ok",
    citas: result.appointments.map((cita) => ({
      id_cita: cita.id,
      fecha: cita.date,
      hora: to12h(cita.time),
      servicio: cita.treatment || "servicio no especificado",
      estado: String(cita.status || "").toLowerCase()
    }))
  };
}

// Cita que recepción ya acordó en el chat (pedido del usuario 2026-10-07, caso Jennifer: 2 extracciones,
// recepción ofreció el sábado 17 a las 8:30 y liberó el chat). Se agenda aunque la agenda automática no
// muestre el cupo, marcada para revisión. Nunca por frases: por estado (recepción escribió en este chat en
// las últimas 48 h) y un juicio corto de la IA sobre la conversación. Ante cualquier duda o error, false:
// sigue la validación normal de la agenda.
const RECEPTION_JUDGE_SYSTEM = [
  "Sos un control interno de una clínica dental. Te paso una conversación de WhatsApp y una cita que el asistente quiere registrar.",
  "Decidí si RECEPCIÓN (los mensajes marcados \"Recepción\", no los del asistente) le ofreció o le confirmó al paciente una cita en ESA MISMA fecha y hora, y el paciente la aceptó (puede estar aceptándola en sus últimos mensajes).",
  "Es false si recepción ofreció otra fecha u hora, si dijo que no hay espacio, si no habló de horarios, si la fecha o la hora solo las propuso el paciente o el asistente, o si el paciente no aceptó.",
  "Respondé solo JSON: {\"acordado\": true o false, \"motivo\": \"frase breve\"}"
].join("\n");
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
async function receptionAgreed(ctx, { date, time, service }) {
  const conversationId = ctx?.conversation?.id;
  if (!conversationId || typeof ctx?.judge !== "function" || !ctx?.cfg) return { ok: false };
  const messages = reminderRepo.listMessages(conversationId, { limit: 60 });
  const since = Date.now() - 48 * 3600 * 1000;
  if (!messages.some((m) => m.direction === "outgoing" && m.author === "human" && Date.parse(m.messageAt || m.createdAt) >= since)) return { ok: false };
  const who = (m) => (m.direction === "incoming" ? "Paciente" : m.author === "human" ? "Recepción" : "Asistente");
  const dialogue = messages.slice(-20).map((m) => `${who(m)}: ${String(m.content || "").trim()}`).join("\n");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  const weekday = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  try {
    const verdict = await ctx.judge({ cfg: ctx.cfg, signal: ctx.signal, system: RECEPTION_JUDGE_SYSTEM, user: `Hoy es ${weekday(today)} ${today}.\n\nConversación:\n${dialogue}\n\nCita a registrar: ${service} el ${weekday(date)} ${date} a las ${to12h(time)}.` });
    return { ok: verdict?.acordado === true, reason: verdict?.motivo || null };
  } catch (error) {
    console.warn("[Mensajes][IA] No se pudo verificar el acuerdo de recepción", { error: error?.message });
    return { ok: false };
  }
}

// Botón "Verificar cita" (pedido del usuario 2026-10-08, caso Anyely): recepción acuerda la cita en el chat y en
// vez de agendarla a mano la verifica. La IA solo LEE la conversación y dice qué cita quedó acordada; el sistema la
// busca en la agenda. Esto nunca crea nada: si falta, la vista ofrece "Crear cita" y decide recepción.
const AGREED_JUDGE_SYSTEM = [
  "Sos un control interno de una clínica dental. Te paso una conversación de WhatsApp entre la clínica (Recepción = personal humano, Asistente = asistente automático) y un paciente.",
  "Decidí si en la conversación quedó ACORDADA una cita nueva o un cambio de fecha: la clínica ofreció o confirmó una fecha y hora y el paciente la aceptó, o el paciente eligió una de las opciones que le dio la clínica y nadie la contradijo después. Si hubo varias propuestas, vale el último acuerdo.",
  "Es false si la última propuesta sigue sin respuesta, si la clínica y el paciente no coinciden en la hora, si solo se habló de horarios sin cerrar, o si el paciente solo confirmó asistencia a una cita que ya tenía.",
  "Usá el calendario para convertir el día en fecha. Respondé solo JSON: {\"acordada\": true o false, \"fecha\": \"AAAA-MM-DD\", \"hora\": \"HH:MM\" en 24 h, \"servicio\": \"el servicio tal como se habló en el chat\", \"motivo\": \"frase breve\"}"
].join("\n");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function agendaService(servicio) {
  return resolveService(servicio || "").then((resolved) => {
    if (resolved.status === "matched" && resolved.service) return { service: resolved.service, tipoAConfirmar: "" };
    // Igual que crear_cita con acuerdo de recepción: genérico ("extracción") -> el primero, tipo a confirmar.
    if (resolved.status === "ambiguous" && resolved.candidates?.length) return { service: resolved.candidates[0], tipoAConfirmar: resolved.candidates.slice(0, 3).map((c) => c.serviceName).join(" / ") };
    return { service: null, tipoAConfirmar: "" };
  });
}
async function verifyAgreedAppointment(conversationId) {
  const linked = reminderRepo.getPatientLink(conversationId);
  if (!linked?.patientId) return { estado: "paciente_no_identificado", motivo: "Primero identificá al paciente de este chat." };
  const who = (m) => (m.direction === "incoming" ? "Paciente" : m.author === "human" ? "Recepción" : m.author === "system" ? "Recordatorio automático" : "Asistente");
  const dialogue = reminderRepo.listMessages(conversationId, { limit: 60 })
    .filter((m) => !m.queued && !String(m.content || "").startsWith("Reacción:"))
    .slice(-20).map((m) => `${who(m)}: ${String(m.content || "").trim()}`).join("\n");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  const weekday = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  const calendar = Array.from({ length: 21 }, (_, i) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); const iso = d.toISOString().slice(0, 10); return `${weekday(iso)} ${iso}`; }).join(", ");
  // 15 s: por debajo del timeout de 20 s del frontend, para que llegue un error claro y no un corte.
  const verdict = await requestJudgement({ cfg: reminderRepo.getAiProviderSecret(), signal: AbortSignal.timeout(15000), system: AGREED_JUDGE_SYSTEM, user: `Hoy es ${weekday(today)} ${today}.\nCalendario: ${calendar}\n\nConversación:\n${dialogue}` });
  const date = ISO_DATE.test(String(verdict?.fecha || "")) ? verdict.fecha : null;
  const time = HHMM.test(String(verdict?.hora || "")) ? verdict.hora : null;
  if (verdict?.acordada !== true || !date || !time) return { estado: "sin_acuerdo", motivo: verdict?.motivo || "No encontré una fecha y hora acordadas en el chat." };
  if (date < today) return { estado: "sin_acuerdo", motivo: `La fecha acordada (${weekday(date)} ${date}) ya pasó.` };
  const cita = { fecha: date, hora: time, dia: weekday(date), hora12: to12h(time), servicio: String(verdict.servicio || "").trim() };
  const found = await queryPatientAppointments({ patientId: linked.patientId, patientName: linked.patientName, phone: linked.phone, upcomingOnly: true });
  const appointments = found.appointments || [];
  const otrasCitas = appointments.filter((a) => !(a.date === date && a.time === time)).map((a) => ({ dia: weekday(a.date), fecha: a.date, hora12: to12h(a.time), servicio: a.treatment || "", estado: a.status }));
  if (appointments.some((a) => a.date === date && a.time === time)) return { estado: "ya_agendada", cita, otrasCitas };
  const { service, tipoAConfirmar } = await agendaService(cita.servicio);
  let cupoLibre = null;
  if (service) {
    try { const availability = await searchAvailability({ serviceId: service.serviceId, date }); cupoLibre = !availability.dayUnavailable && availability.slots.some((slot) => slot.time === time); } catch { /* sin dato: no se avisa */ }
  }
  return { estado: "falta_agendar", cita, servicioAgenda: service?.serviceName || null, tipoAConfirmar, cupoLibre, otrasCitas };
}
// "Crear cita" tras la verificación: lo decide recepción, así que no se exige cupo (como cuando agenda a mano;
// la verificación ya le avisó si la agenda no lo muestra libre). La memoria del chat evita que la IA la vuelva a
// crear si después se libera la conversación.
async function createAgreedAppointment(conversationId, { fecha, hora, servicio } = {}) {
  const fail = (message) => Object.assign(new Error(message), { status: 400 });
  const linked = reminderRepo.getPatientLink(conversationId);
  if (!linked?.patientId) throw fail("Primero identificá al paciente de este chat.");
  if (!ISO_DATE.test(String(fecha || "")) || !HHMM.test(String(hora || ""))) throw fail("Fecha u hora no válidas.");
  const { service, tipoAConfirmar } = await agendaService(servicio);
  if (!service) throw fail("No se pudo identificar el servicio. Agendala desde la Agenda.");
  const result = await appointmentActions.createAppointmentForAssistant({
    patientId: linked.patientId,
    patientName: linked.patientName,
    serviceId: service.serviceId,
    date: fecha,
    time: hora,
    contact: linked.phone,
    comment: (tipoAConfirmar ? `${String(servicio).trim()} — tipo a confirmar: ${tipoAConfirmar}` : service.serviceName).slice(0, 255),
    skipAvailability: true,
    idempotencyKey: `manual-create-${conversationId}-${fecha}-${hora}-${service.serviceId}-${linked.patientId}`
  });
  reminderRepo.setAssistantMemory(conversationId, { lastAppointment: { appointmentId: result.idAgendaAP, action: "creada por recepción", service: service.serviceName, date: fecha, time: to12h(hora) } });
  return { id_cita: result.idAgendaAP, duplicada: Boolean(result.duplicate) };
}

async function crearCita(args, ctx) {
  if (args?.confirmado !== true) {
    return { estado: "falta_confirmacion", mensaje: "Confirmá explícitamente servicio, fecha y hora con el paciente y volvé a llamar con confirmado=true." };
  }
  const date = toIsoDate(args?.fecha);
  const time = toHhmm(args?.hora);
  if (!date || !time) return { estado: "datos_invalidos", mensaje: "Fecha u hora no válidas." };
  let resolved = await resolveService(args?.servicio || "");
  const agreed = args?.acordado_por_recepcion === true ? await receptionAgreed(ctx, { date, time, service: args?.servicio || "" }) : null;
  if (agreed) console.log("[Mensajes][IA] Cita acordada por recepción", { conversationId: ctx?.conversation?.id, fecha: date, hora: time, verificada: agreed.ok, motivo: agreed.reason });
  // Recepción acordó un servicio genérico ("2 extracciones") que coincide con varios del catálogo: ni ella lo
  // especificó ni el paciente suele saberlo. Con el acuerdo verificado se registra con el primero y el comentario
  // deja el tipo a confirmar (antes la IA transfería o elegía uno por su cuenta).
  let tipoAConfirmar = "";
  if (resolved.status === "ambiguous" && agreed?.ok && resolved.candidates?.length) {
    tipoAConfirmar = resolved.candidates.slice(0, 3).map((c) => c.serviceName).join(" / ");
    resolved = { status: "matched", service: resolved.candidates[0] };
  }
  if (resolved.status === "ambiguous") return { estado: "servicio_ambiguo", opciones: resolved.candidates.map((c) => c.serviceName) };
  if (resolved.status !== "matched" || !resolved.service) return { estado: "servicio_no_encontrado" };
  const restricted = identityGuard(resolved.service, ctx);
  if (restricted) return restricted;
  const already = ctx?.memory?.lastAppointment;
  if (already?.appointmentId && already.date === date && toHhmm(already.time) === time) {
    return { estado: "ya_registrada", id_cita: already.appointmentId, servicio: already.service, fecha: date, hora: to12h(time), mensaje: "Esta cita ya fue registrada en esta conversación. No la crees de nuevo." };
  }
  const linked = ctx?.linkedPatient;
  let patientId = linked?.patientId || null;
  let patientName = linked?.patientName || String(args?.nombre || "").trim();
  const chatPhone = ctx?.conversation?.phoneResolved ? String(ctx.conversation.phone || "").replace(/[^\d]/g, "") : "";
  let contact = linked?.phone
    || String(args?.telefono || "").replace(/[^\d]/g, "")
    || (args?.usar_telefono_del_chat ? chatPhone : "");
  if (!patientId && (!patientName || contact.length < 7)) {
    return { estado: "faltan_datos", mensaje: "Se necesita el nombre completo y el teléfono del paciente para registrar la cita." };
  }
  // Si no está vinculado, ver si ya existe un expediente.
  let phoneChanged = false;
  let autoLink = null;
  if (!patientId) {
    const existing = await findExistingPatient({ name: patientName, phone: contact }).catch(() => null);
    if (existing && existing.id) {
      const givenDigits = digitsOf(contact);
      const expedienteDigits = digitsOf(existing.expedientePhone);
      if (existing.matchedBy === "name" && expedienteDigits.length >= 7 && givenDigits && givenDigits !== expedienteDigits && args?.telefono_confirmado !== true) {
        return {
          estado: "verificar_cambio_telefono",
          paciente: existing.name,
          telefono_registrado_ultimos4: expedienteDigits.slice(-4),
          telefono_nuevo: givenDigits,
          mensaje: `Este paciente ya tiene expediente pero con otro teléfono (termina en ${expedienteDigits.slice(-4)}). Preguntale si cambió de número. Si confirma que cambió, volvé a llamar con telefono_confirmado=true. Si dice que el registrado es el correcto, volvé a llamar pasando ese número en telefono.`
        };
      }
      patientId = existing.id;
      patientName = existing.name;
      phoneChanged = existing.matchedBy === "name" && expedienteDigits.length >= 7 && Boolean(givenDigits) && givenDigits !== expedienteDigits;
      if (!contact) contact = existing.expedientePhone;
      // Match por teléfono verificado + nombre consistente, o por nombre completo
      // exacto y único: alcanza para vincular también la conversación (equivale a
      // la identificación manual de recepción).
      if (existing.matchedBy === "phone" || existing.matchedBy === "name") {
        autoLink = { patientId: existing.id, patientName: existing.name, phone: contact || existing.expedientePhone, treatmentType: existing.treatmentType || null };
      }
    }
  }
  const provisional = !patientId;
  // Servicio de emergencia de ortodoncia (bracket caído/aflojado): si el paciente ya
  // está identificado, marcarlo en el comentario para que recepción lo priorice.
  const isEmergencyService = normalizeText(resolved.service.serviceName) === "bracket";
  const comment = phoneChanged
    ? `${resolved.service.serviceName} — teléfono nuevo, confirmar en recepción`
    : provisional
      ? `${resolved.service.serviceName} — verificar`
      : isEmergencyService
        ? `${resolved.service.serviceName} — emergencia`
        : resolved.service.serviceName;
  const nota = [String(args?.nota || "").trim().slice(0, 80), tipoAConfirmar ? `tipo a confirmar: ${tipoAConfirmar}` : "", phoneChanged ? "teléfono nuevo" : ""].filter(Boolean).join("; ");
  try {
    const result = await appointmentActions.createAppointmentForAssistant({
      patientId,
      patientName,
      serviceId: resolved.service.serviceId,
      date,
      time,
      contact,
      // Con el tipo a confirmar, el comentario empieza con lo acordado ("extracción"), no con el candidato que
      // se usó para servicioIdAP (podía quedar "Extraccion pieza de leche" para un adulto).
      comment: agreed?.ok ? `${(tipoAConfirmar && String(args?.servicio || "").trim()) || resolved.service.serviceName} — verificar (acordado por recepción${nota ? `: ${nota}` : ""})`.slice(0, 255) : comment,
      skipAvailability: Boolean(agreed?.ok),
      // El paciente entra en la llave: sin esto, una reserva grupal (misma conversación,
      // mismo día/hora/servicio, distinta persona) colisiona y las llamadas 2ª en
      // adelante se leen como duplicado de la 1ª, reportando "ok" sin crear la cita.
      idempotencyKey: `ai-create-${ctx?.conversation?.id || "sim"}-${date}-${time}-${resolved.service.serviceId}-${patientId || normalizeText(patientName)}`
    });
    return {
      estado: "ok",
      id_cita: result.idAgendaAP,
      servicio: resolved.service.serviceName,
      fecha: date,
      hora: to12h(time),
      // Señal interna para aiObserver: vincula la conversación a este paciente. El modelo la ignora.
      _autoLink: autoLink,
      // Nota interna: para paciente nuevo, recepcion completa el registro. NO se lo digas al paciente.
      mensaje: "Cita registrada. Confírmasela al paciente de forma normal, sin mencionar verificación ni registro pendiente."
    };
  } catch (error) {
    return { estado: "rechazada", mensaje: error.message || "No se pudo registrar la cita." };
  }
}

async function reprogramarCita(args, ctx) {
  const linked = ctx?.linkedPatient;
  if (!linked?.patientId) return { estado: "paciente_no_identificado", mensaje: "Solo se pueden reprogramar citas de un paciente identificado por recepción." };
  if (args?.confirmado !== true) return { estado: "falta_confirmacion", mensaje: "Confirmá la nueva fecha y hora con el paciente y volvé a llamar con confirmado=true." };
  const newDate = toIsoDate(args?.nueva_fecha);
  const newTime = toHhmm(args?.nueva_hora);
  if (!newDate || !newTime) return { estado: "datos_invalidos", mensaje: "Nueva fecha u hora no válidas." };
  try {
    const result = await rescheduleAppointment({ patientId: linked.patientId, appointmentId: Number(args?.id_cita), newDate, newTime });
    return { estado: "ok", id_cita: result.appointmentId, fecha: result.date, hora: to12h(result.time), mensaje: "Cita reprogramada." };
  } catch (error) {
    return { estado: "rechazada", mensaje: error.message || "No se pudo reprogramar la cita." };
  }
}

async function cancelarCita(args, ctx) {
  const linked = ctx?.linkedPatient;
  if (!linked?.patientId) return { estado: "paciente_no_identificado", mensaje: "Solo se pueden cancelar citas de un paciente identificado por recepción." };
  if (args?.confirmado !== true) return { estado: "falta_confirmacion", mensaje: "Confirmá con el paciente que desea cancelar y volvé a llamar con confirmado=true." };
  try {
    const result = await cancelAppointment({ patientId: linked.patientId, appointmentId: Number(args?.id_cita) });
    return { estado: "ok", id_cita: result.appointmentId, fecha: result.date, hora: to12h(result.time), mensaje: "Cita cancelada." };
  } catch (error) {
    return { estado: "rechazada", mensaje: error.message || "No se pudo cancelar la cita." };
  }
}

// Citas que cubre el recordatorio. Si son varias (un solo mensaje para familiares con el mismo número) el
// modelo dice cuáles con ids_cita: un "sí" general son todas, "solo Daniela" es una. Sin ids no se adivina:
// se devuelve la lista para que elija o pregunte.
function reminderCitas(reminder, args) {
  const citas = reminder.appointments?.length ? reminder.appointments : [reminder];
  if (citas.length === 1) return { citas };
  const ids = Array.isArray(args?.ids_cita) ? args.ids_cita.map(Number) : [];
  const elegidas = citas.filter((c) => ids.includes(Number(c.appointmentId)));
  if (elegidas.length) return { citas: elegidas };
  return { pendiente: { estado: "varias_citas", citas: citas.map((c) => ({ id_cita: c.appointmentId, paciente: c.patientName, hora: to12h(c.appointmentTime) })), mensaje: "El recordatorio fue un solo mensaje por varias citas de este número (familiares). Volvé a llamar con ids_cita: todas si el paciente respondió por todos en general, solo las de las personas que nombró si distinguió. Si no queda claro, preguntale." } };
}

async function confirmarAsistencia(args, ctx) {
  const conv = ctx?.conversation || {};
  const phone = String(conv.waContactNumber || conv.phone || "").replace(/\D/g, "");
  const sinRecordatorio = { estado: "sin_recordatorio_reciente", mensaje: "No hay un recordatorio de cita reciente para este número. Agradecé la respuesta sin afirmar que la cita quedó confirmada." };
  if (phone.length < 7) return sinRecordatorio;
  const reminder = reminderRepo.getRecentSentReminderForPhone(phone);
  if (!reminder?.appointmentId) return sinRecordatorio;
  const { citas, pendiente } = reminderCitas(reminder, args);
  if (pendiente) return pendiente;
  const resultados = [];
  for (const c of citas) {
    try { resultados.push({ c, result: await appointmentActions.confirmAppointmentAttendance({ appointmentId: c.appointmentId }) }); }
    catch (error) { resultados.push({ c, error }); }
  }
  if (resultados.length === 1) {
    const { result, error } = resultados[0];
    if (error) return { estado: "error", mensaje: error.message || "No se pudo confirmar la asistencia." };
    if (result.status === "confirmed") return { estado: "ok", fecha: result.date, hora: to12h(result.time), mensaje: "Asistencia confirmada. Agradecé de forma breve y natural." };
    if (result.status === "already_confirmed") return { estado: "ya_confirmada", fecha: result.date, hora: to12h(result.time), mensaje: "La cita ya figuraba confirmada. Agradecé igual, sin volver a anunciarlo como novedad." };
    return { estado: "cita_no_confirmable", mensaje: "Esa cita ya no se puede confirmar (fue cancelada, reprogramada o ya pasó). Si el paciente necesita algo más, derivá a recepción." };
  }
  const resultado = { confirmed: "confirmada", already_confirmed: "ya_confirmada" };
  return { estado: "ok", citas: resultados.map(({ c, result, error }) => ({ id_cita: c.appointmentId, paciente: c.patientName, hora: to12h(c.appointmentTime), resultado: error ? "error" : resultado[result.status] || "no_confirmable" })), mensaje: "Agradecé de forma breve. Si alguna no quedó confirmada, no la des por confirmada y derivala a recepción." };
}

async function cancelarCitaRecordatorio(args, ctx) {
  if (!isModoVentaEnabled()) return { estado: "herramienta_desconocida", mensaje: "Esta herramienta no está disponible." };
  const conv = ctx?.conversation || {};
  const phone = String(conv.waContactNumber || conv.phone || "").replace(/\D/g, "");
  const sinRecordatorio = { estado: "sin_recordatorio_reciente", mensaje: "No hay un recordatorio de cita reciente para este número. No afirmes que se canceló nada; transferí a recepción." };
  if (phone.length < 7) return sinRecordatorio;
  const reminder = reminderRepo.getRecentSentReminderForPhone(phone);
  if (!reminder?.appointmentId) return sinRecordatorio;
  const { citas, pendiente } = reminderCitas(reminder, args);
  if (pendiente) return pendiente;
  if (args?.confirmado !== true) return { estado: "falta_confirmacion", mensaje: "Preguntale al paciente si desea cancelar la cita y volvé a llamar con confirmado=true." };
  const resultados = [];
  for (const c of citas) {
    try { resultados.push({ c, result: await appointmentActions.cancelAppointmentFromReminder({ appointmentId: c.appointmentId }) }); }
    catch (error) { resultados.push({ c, error }); }
  }
  const cancelada = (r) => r.result && (r.result.status === "cancelled" || r.result.status === "already_cancelled");
  if (resultados.length === 1) {
    const r = resultados[0];
    if (r.error) return { estado: "error", mensaje: r.error.message || "No se pudo cancelar la cita." };
    if (cancelada(r)) return { estado: "ok", id_cita: r.c.appointmentId, fecha: r.result.date, hora: to12h(r.result.time), mensaje: "Cita cancelada." };
    return { estado: "cita_no_cancelable", mensaje: "Esa cita ya no se puede cancelar desde aquí (fue reprogramada o ya pasó). Transferí a recepción." };
  }
  return { estado: "ok", citas: resultados.map((r) => ({ id_cita: r.c.appointmentId, paciente: r.c.patientName, hora: to12h(r.c.appointmentTime), resultado: r.error ? "error" : cancelada(r) ? "cancelada" : "no_cancelable" })), mensaje: "Si alguna no quedó cancelada, no la des por cancelada y transferí a recepción." };
}

async function transferirARecepcion(args) {
  return { estado: "transferido", motivo: String(args?.motivo || "Solicitud del asistente") };
}

const HANDLERS = {
  consultar_servicios: consultarServicios,
  consultar_disponibilidad: consultarDisponibilidad,
  consultar_citas_paciente: consultarCitasPaciente,
  crear_cita: crearCita,
  reprogramar_cita: reprogramarCita,
  cancelar_cita: cancelarCita,
  confirmar_asistencia: confirmarAsistencia,
  cancelar_cita_recordatorio: cancelarCitaRecordatorio,
  transferir_a_recepcion: transferirARecepcion
};

async function runTool(name, args, ctx = {}) {
  const handler = HANDLERS[name];
  if (!handler) return { estado: "herramienta_desconocida", mensaje: `No existe la herramienta "${name}".` };
  try {
    return await handler(args || {}, ctx);
  } catch (error) {
    return { estado: "error", mensaje: error.message || String(error) };
  }
}

module.exports = { TOOL_SPECS, SALE_TOOL_SPECS, runTool, findExistingPatient, verifyAgreedAppointment, createAgreedAppointment };
