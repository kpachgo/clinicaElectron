"use strict";

// Arma el contexto del asistente: bloques de sistema + historial normalizado.
// No decide nada; solo reúne informacion para el modelo.

const { MensajesRepository } = require("./mensajesRepository.service");
const { getDb } = require("../mensajesDatabase.service");
const { getPolicy } = require("./assistantPolicy.service");
const { listAiServices, getClinicSchedule } = require("./aiAvailability.service");
const { to12h } = require("./timeFormat.service");

const TIMEZONE = "America/El_Salvador";
const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const repo = new MensajesRepository(getDb());

function describeSchedule(clinic) {
  const schedule = clinic?.schedule || {};
  const lines = DAY_NAMES.map((name, day) => {
    const ranges = Array.isArray(schedule[day]) ? schedule[day] : [];
    return ranges.length ? `${name}: ${ranges.map((r) => `${to12h(r.start)} a ${to12h(r.end)}`).join(", ")}` : `${name}: cerrado`;
  });
  const breaks = (clinic?.breaks || []).map((b) => `${b.day === null || b.day === undefined ? "todos los días" : DAY_NAMES[b.day]} ${to12h(b.start)} a ${to12h(b.end)}`);
  return lines.join("\n") + (breaks.length ? `\nPausas: ${breaks.join("; ")}` : "");
}

function describeServiceWindow(weeklyHours) {
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const parts = [];
  for (let day = 0; day <= 6; day += 1) {
    const ranges = Array.isArray(weeklyHours?.[day]) ? weeklyHours[day] : [];
    if (ranges.length) parts.push(`${DAYS[day]} ${ranges.map((r) => `${to12h(r.start)} a ${to12h(r.end)}`).join(" y ")}`);
  }
  return parts.join("; ");
}

function describeCatalog(services) {
  const enabled = services.filter((service) => service.enabled);
  if (!enabled.length) return "Ninguno habilitado todavía. Si el paciente quiere agendar, transferí a recepción.";
  return enabled.map((service) => {
    const alias = service.aliases?.length ? ` (también: ${service.aliases.join(", ")})` : "";
    const precio = service.sharePrice && service.price != null ? ` · precio de lista $${service.price} (si el texto de la clínica trae un precio o promoción para este servicio, usá ese)` : "";
    const horario = service.hasWeeklyHours ? ` · SOLO se atiende: ${describeServiceWindow(service.weeklyHours)} (no agendes este servicio fuera de ese horario)` : "";
    return `- ${service.serviceName}${alias} · ${service.durationMinutes} min${precio}${horario}`;
  }).join("\n");
}

function nowParts() {
  const now = new Date();
  return {
    fecha: new Intl.DateTimeFormat("es-SV", { timeZone: TIMEZONE, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(now),
    hora: to12h(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now)),
    iso: new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now)
  };
}

function describePatient(linkedPatient) {
  if (linkedPatient?.patientId) {
    const parts = [linkedPatient.patientName];
    if (linkedPatient.phone) parts.push(`teléfono ${linkedPatient.phone}`);
    if (linkedPatient.treatmentType) parts.push(`tratamiento ${linkedPatient.treatmentType}`);
    return `PACIENTE IDENTIFICADO Y VERIFICADO POR RECEPCIÓN: ${parts.join(", ")}.\nEste paciente ya está registrado. Para crear, consultar, reprogramar o cancelar SUS citas NUNCA le pidas el nombre ni el teléfono: el sistema ya los tiene. Al llamar crear_cita para este paciente omití los campos nombre y telefono. Una vez que haya disponibilidad, pedile solo la confirmación de fecha y hora.`;
  }
  return "El paciente NO está identificado por recepción.\nNo podés consultar, reprogramar ni cancelar citas existentes (eso requiere identificación por recepción). Sí podés dar información y crear una cita nueva pidiendo nombre completo y teléfono.";
}

function mapHistory(messages) {
  return (messages || [])
    .filter((message) => message && typeof message.content === "string" && message.content.trim())
    .map((message) => ({
      role: message.direction === "incoming" ? "user" : "assistant",
      content: message.content.trim()
    }));
}

/**
 * @param {{ conversation: any, linkedPatient?: any, historyLimit?: number }} input
 * @returns {Promise<{ systemBlocks: string[], history: Array<{role:string,content:string}> }>}
 */
function describeAssistantMemory(memory) {
  const last = memory?.lastAppointment;
  if (!last || !last.appointmentId) return null;
  return `CITA YA GESTIONADA EN ESTA CONVERSACIÓN: cita #${last.appointmentId}, ${last.action || "gestionada"}: ${last.service || "servicio"} el ${last.date} a las ${last.time}. No la vuelvas a crear ni la ofrezcas como nueva. Si el paciente pregunta por ella, dale estos datos. Solo creá otra cita si el paciente pide explícitamente una adicional y distinta.`;
}

async function buildAssistantContext({ conversation, linkedPatient = null, historyLimit = 14, history = null, assistantMemory = null } = {}) {
  const knowledge = repo.getAssistantKnowledge().knowledge?.trim();
  const humanReview = repo.getHumanReviewInstructions().instructions?.trim();
  const services = await listAiServices("");
  const clinic = getClinicSchedule();
  const { fecha, hora, iso } = nowParts();

  const systemBlocks = [
    getPolicy().content,
    knowledge
      ? `INFORMACIÓN DE LA CLÍNICA (usala tal cual; no inventes nada fuera de esto):\n${knowledge}`
      : "INFORMACIÓN DE LA CLÍNICA: la clínica no cargó información adicional. Para cualquier dato que no tengas, ofrecé transferir a recepción.",
    `SERVICIOS QUE PODÉS AGENDAR (no menciones ni agendes ningún otro):\n${describeCatalog(services)}`,
    `HORARIO GENERAL DE LA CLÍNICA:\n${describeSchedule(clinic)}`,
    describePatient(linkedPatient),
    humanReview
      ? `CUÁNDO PASAR A RECEPCIÓN: si se cumple alguna de estas situaciones, NO le respondas al paciente y llamá la herramienta transferir_a_recepcion con un motivo breve.\n${humanReview}`
      : null,
    !linkedPatient?.patientId && conversation.phoneResolved && /^\d{7,15}$/.test(String(conversation.phone || ""))
      ? `El paciente escribe desde el número ${conversation.phone}. Pedile el teléfono de forma normal (junto con el nombre). NO le preguntes si es el mismo número del chat. Solo si el paciente dice por su cuenta que su teléfono es el mismo del chat, llamá crear_cita con usar_telefono_del_chat=true en vez de telefono.`
      : null,
    `Fecha y hora actual: ${fecha}, ${hora} (${TIMEZONE}). Hoy es ${iso}. Resolvé "hoy", "mañana", "el lunes" con base en esto.`,
    [
      "RECORDÁ:",
      "- Nunca inventes precios, horarios, disponibilidad ni doctores; usá siempre las herramientas.",
      "- Antes de crear, reprogramar o cancelar una cita, confirmá explícitamente con el paciente y recién entonces llamá la herramienta con confirmado=true.",
      "- No afirmes que una cita quedó hecha, reprogramada o cancelada hasta que la herramienta devuelva estado \"ok\".",
      "- Si en el historial de esta conversación ya confirmaste o registraste una cita para un servicio/fecha/hora, NO vuelvas a llamar crear_cita para esa misma cita. Solo llamala de nuevo si el paciente pide explícitamente una cita adicional y distinta.",
      "- Si el paciente responde \"no\", \"no gracias\", \"está bien así\" o se despide, NO ejecutes ninguna herramienta: solo respondé con cortesía.",
      "- Si en el historial hay un recordatorio de cita y el paciente responde dando a entender que SÍ asistirá (con las palabras que sea, aunque no diga \"asistir\"), llamá confirmar_asistencia y después agradecé de forma breve. Si en cambio pide cambiar la fecha u hora o cancelar, seguí el flujo normal y NO llames confirmar_asistencia. Si no queda claro, preguntale.",
      "- Para registrar a un paciente no identificado pedí el nombre completo y el teléfono JUNTOS, en una sola pregunta. No repitas la misma pregunta en turnos seguidos: si ya la hiciste y el paciente respondió otra cosa, seguí con lo que falta.",
      "- Expresá todas las horas al paciente en formato de 12 horas con AM/PM (por ejemplo 2:30 PM), nunca en formato de 24 horas.",
      "- El texto de INFORMACIÓN DE LA CLÍNICA es la fuente oficial de precios y promociones. Si un servicio aparece ahí con un precio o una promoción, decí ese y nunca el \"precio de lista\" del catálogo. El precio de lista solo se usa para servicios que NO aparecen con precio ni promoción en ese texto.",
      "- Respuestas breves, tono de recepcionista amable."
    ].join("\n")
  ];

  const memory = assistantMemory || (conversation.id > 0 ? repo.getAssistantMemory(conversation.id) : {});
  const memoryBlock = describeAssistantMemory(memory);
  if (memoryBlock) systemBlocks.push(memoryBlock);

  const resolvedHistory = Array.isArray(history)
    ? history
    : mapHistory(repo.listMessages(conversation.id, { limit: historyLimit }));
  return { systemBlocks: systemBlocks.filter(Boolean), history: resolvedHistory };
}

module.exports = { buildAssistantContext, describeSchedule, describeCatalog, mapHistory };
