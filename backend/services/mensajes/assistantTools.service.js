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
const { MensajesRepository } = require("./mensajesRepository.service");
const { getDb } = require("../mensajesDatabase.service");

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
        confirmado: { type: "boolean", description: "true solo tras la aceptación explícita del paciente." }
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
    description: "Marca que el paciente CONFIRMÓ que asistirá a su cita. Úsala solo cuando en el historial hay un recordatorio de cita y el paciente responde dando a entender que sí va a asistir (con las palabras que sea). NO la uses si pide cambiar la fecha/hora o cancelar (eso es reprogramar/cancelar), ni si no queda claro. No necesita que el paciente esté identificado por recepción.",
    parameters: { type: "object", properties: {} }
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

async function crearCita(args, ctx) {
  if (args?.confirmado !== true) {
    return { estado: "falta_confirmacion", mensaje: "Confirmá explícitamente servicio, fecha y hora con el paciente y volvé a llamar con confirmado=true." };
  }
  const resolved = await resolveService(args?.servicio || "");
  if (resolved.status === "ambiguous") return { estado: "servicio_ambiguo", opciones: resolved.candidates.map((c) => c.serviceName) };
  if (resolved.status !== "matched" || !resolved.service) return { estado: "servicio_no_encontrado" };
  const restricted = identityGuard(resolved.service, ctx);
  if (restricted) return restricted;
  const date = toIsoDate(args?.fecha);
  const time = toHhmm(args?.hora);
  if (!date || !time) return { estado: "datos_invalidos", mensaje: "Fecha u hora no válidas." };
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
  try {
    const result = await appointmentActions.createAppointmentForAssistant({
      patientId,
      patientName,
      serviceId: resolved.service.serviceId,
      date,
      time,
      contact,
      comment,
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

async function confirmarAsistencia(args, ctx) {
  const conv = ctx?.conversation || {};
  const phone = String(conv.waContactNumber || conv.phone || "").replace(/\D/g, "");
  const sinRecordatorio = { estado: "sin_recordatorio_reciente", mensaje: "No hay un recordatorio de cita reciente para este número. Agradecé la respuesta sin afirmar que la cita quedó confirmada." };
  if (phone.length < 7) return sinRecordatorio;
  const reminder = reminderRepo.getRecentSentReminderForPhone(phone, 18);
  if (!reminder?.appointmentId) return sinRecordatorio;
  let result;
  try {
    result = await appointmentActions.confirmAppointmentAttendance({ appointmentId: reminder.appointmentId });
  } catch (error) {
    return { estado: "error", mensaje: error.message || "No se pudo confirmar la asistencia." };
  }
  if (result.status === "confirmed") return { estado: "ok", fecha: result.date, hora: to12h(result.time), mensaje: "Asistencia confirmada. Agradecé de forma breve y natural." };
  if (result.status === "already_confirmed") return { estado: "ya_confirmada", fecha: result.date, hora: to12h(result.time), mensaje: "La cita ya figuraba confirmada. Agradecé igual, sin volver a anunciarlo como novedad." };
  return { estado: "cita_no_confirmable", mensaje: "Esa cita ya no se puede confirmar (fue cancelada, reprogramada o ya pasó). Si el paciente necesita algo más, derivá a recepción." };
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

module.exports = { TOOL_SPECS, runTool, findExistingPatient };
