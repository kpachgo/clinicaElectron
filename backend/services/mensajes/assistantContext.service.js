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
    const registrado = service.requiresIdentifiedPatient ? " · SOLO para pacientes ya registrados e identificados por recepción" : "";
    return `- ${service.serviceName}${alias} · ${service.durationMinutes} min${precio}${horario}${registrado}`;
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

const HISTORY_GAP_HOURS = 48;

function formatGapDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-SV", { timeZone: TIMEZONE, day: "numeric", month: "long", year: "numeric" }).format(date);
}

function mapHistory(messages) {
  const valid = (messages || []).filter((message) => message && typeof message.content === "string" && message.content.trim());
  const result = [];
  let previousAt = null;
  for (const message of valid) {
    // messageAt (fecha real del mensaje, la del teléfono) y no createdAt: en
    // chats con historial importado createdAt queda igual para todos los
    // mensajes (hora de la importación), lo que anularía la detección del gap.
    const rawAt = message.messageAt || message.createdAt;
    const at = rawAt ? new Date(rawAt).getTime() : NaN;
    if (previousAt !== null && !Number.isNaN(at)) {
      const gapHours = (at - previousAt) / 3600000;
      if (gapHours >= HISTORY_GAP_HOURS) {
        const dateLabel = formatGapDate(rawAt);
        const dias = Math.floor(gapHours / 24);
        result.push({
          role: "system",
          content: `--- Pasaron ${dias} días desde el mensaje anterior${dateLabel ? ` (retomado el ${dateLabel})` : ""}. Lo de arriba fue una conversación distinta, ya cerrada: no la continúes ni asumas que sigue vigente (ej. un cambio de cita ya resuelto ahí no aplica de nuevo ahora). Tratá lo que sigue como el inicio de un contacto nuevo, salvo que el paciente mismo retome ese tema explícitamente. ---`
        });
      }
    }
    if (!Number.isNaN(at)) previousAt = at;
    // Un saliente con author "human" lo escribió recepción a mano, no la IA: si no se
    // distingue, un compromiso del staff (ej. "sí hay espacio hoy a las 3pm") se lee como
    // si la IA misma lo hubiera dicho, y no hay forma de detectar luego que lo está contradiciendo.
    const isHumanOutgoing = message.direction === "outgoing" && message.author === "human";
    result.push({
      role: message.direction === "incoming" ? "user" : "assistant",
      content: isHumanOutgoing
        ? `[Mensaje enviado por el personal de recepción (un humano), no por vos]: ${message.content.trim()}`
        : message.content.trim()
    });
  }
  return result;
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

// Una negociación de cita real (saludo, servicio, fechas ofrecidas, horarios, confirmación)
// pasa fácil de 20 mensajes antes de cerrarse; con un límite bajo la IA pierde de vista lo
// ya ofrecido/acordado a mitad de la conversación. El corte por vacío de 48h (HISTORY_GAP_HOURS)
// ya evita arrastrar temas viejos y cerrados, así que subir este número no reabre eso.
async function buildAssistantContext({ conversation, linkedPatient = null, historyLimit = 60, history = null, assistantMemory = null } = {}) {
  const knowledge = repo.getAssistantKnowledge().knowledge?.trim();
  const humanReview = repo.getHumanReviewInstructions().instructions?.trim();
  const services = await listAiServices("");
  const clinic = getClinicSchedule();
  const { fecha, hora, iso } = nowParts();

  // Orden pensado para el context caching por prefijo de DeepSeek (y de cualquier proveedor
  // similar): lo que es igual en TODAS las conversaciones va primero (se cachea entre
  // conversaciones distintas), lo que es fijo dentro de UNA conversación va después (se
  // cachea entre turnos de ese mismo chat), y lo que cambia en CADA llamada (fecha/hora)
  // va al final, para no invalidar el prefijo cacheado de todo lo anterior.
  const systemBlocks = [
    // --- Igual para todas las conversaciones (solo cambia si se edita configuración) ---
    getPolicy().content,
    knowledge
      ? `INFORMACIÓN DE LA CLÍNICA (usala tal cual; no inventes nada fuera de esto):\n${knowledge}`
      : "INFORMACIÓN DE LA CLÍNICA: la clínica no cargó información adicional. Para cualquier dato que no tengas, ofrecé transferir a recepción.",
    `SERVICIOS QUE PODÉS AGENDAR (no menciones ni agendes ningún otro):\n${describeCatalog(services)}`,
    `HORARIO GENERAL DE LA CLÍNICA:\n${describeSchedule(clinic)}`,
    humanReview
      ? `CUÁNDO PASAR A RECEPCIÓN: si se cumple alguna de estas situaciones, NO le respondas al paciente y llamá la herramienta transferir_a_recepcion con un motivo breve.\n${humanReview}`
      : null,
    [
      "NUNCA CONTRADIGAS A RECEPCIÓN (regla obligatoria #11 de tu política):",
      "En el historial, un mensaje que empieza con \"[Mensaje enviado por el personal de recepción (un humano), no por vos]:\" es algo que un humano de la clínica ya le dijo al paciente. Si eso que le prometieron, confirmaron o acordaron (una hora, un cupo, un descuento, una excepción) choca con lo que te devuelve una herramienta ahora, NO se lo comuniques al paciente ni lo corrijas en seco: llamá transferir_a_recepcion con un motivo que diga exactamente qué prometió recepción vs qué dice el sistema, para que un humano lo resuelva. Igual si recepción le ofreció una hora u opción DISTINTA a la que el paciente había pedido (ej. pidió las 9 y recepción ofreció las 10): esa oferta reemplaza el pedido original, no le vuelvas a ofrecer lo que pidió antes aunque una herramienta diga que sigue libre. Si el paciente no acepta la oferta de recepción y insiste en la original o pide una tercera, tampoco lo decidas vos: transferí.",
      "Ejemplo concreto: el historial trae \"[Mensaje enviado por el personal de recepción...]: sí, tenemos espacio hoy a las 3pm\" y ahora la herramienta de disponibilidad te dice que las 3pm ya no está libre. Respuesta INCORRECTA: decirle al paciente que a las 3pm ya no hay espacio. Respuesta CORRECTA: no decirle nada sobre disponibilidad, llamar transferir_a_recepcion con motivo \"recepción le confirmó al paciente las 3pm pero el sistema ya no la tiene libre\"."
    ].join("\n"),
    [
      "RECORDÁ:",
      "- Nunca inventes precios, horarios, disponibilidad ni doctores; usá siempre las herramientas.",
      "- Antes de crear, reprogramar o cancelar una cita, confirmá explícitamente con el paciente y recién entonces llamá la herramienta con confirmado=true.",
      "- No afirmes que una cita quedó hecha, reprogramada o cancelada hasta que la herramienta devuelva estado \"ok\".",
      "- Si en el historial de esta conversación ya confirmaste o registraste una cita para un servicio/fecha/hora, NO vuelvas a llamar crear_cita para esa misma cita. Solo llamala de nuevo si el paciente pide explícitamente una cita adicional y distinta.",
      "- Si el paciente responde \"no\", \"no gracias\", \"está bien así\" o se despide, NO ejecutes ninguna herramienta: solo respondé con cortesía.",
      "- Si tu último mensaje fue un recordatorio de cita preguntando si podrá asistir, y el paciente responde con una afirmación corta cualquiera (sin importar la palabra exacta: puede ser \"si\", \"esta bien\", \"vale\", \"primero dios\", \"ahí estaré\", una expresión religiosa, un emoji de pulgar arriba, etc.), interpretala en ese contexto: una respuesta corta y afirmativa justo después de esa pregunta específica ya es la confirmación completa, aunque no repita la palabra \"asistir\" ni el detalle de la cita. No le preguntes de nuevo a qué se refiere ni le pidas que aclare: llamá confirmar_asistencia directamente. Reservá la pregunta de aclaración solo para cuando la respuesta sea realmente ambigua en ese contexto (por ejemplo si cambia de tema o pregunta algo distinto).",
      "- Para registrar a un paciente no identificado pedí el nombre completo y el teléfono JUNTOS, en una sola pregunta. No repitas la misma pregunta en turnos seguidos: si ya la hiciste y el paciente respondió otra cosa, seguí con lo que falta.",
      "- Expresá todas las horas al paciente en formato de 12 horas con AM/PM (por ejemplo 2:30 PM), nunca en formato de 24 horas.",
      "- El texto de INFORMACIÓN DE LA CLÍNICA es la fuente oficial de precios y promociones. Si un servicio aparece ahí con un precio o una promoción, decí ese y nunca el \"precio de lista\" del catálogo. El precio de lista solo se usa para servicios que NO aparecen con precio ni promoción en ese texto.",
      "- Respuestas breves, tono de recepcionista amable."
    ].join("\n"),
    // --- Fijo dentro de esta conversación (cambia entre chats distintos, no turno a turno) ---
    describePatient(linkedPatient),
    linkedPatient?.patientId
      ? `Este paciente YA está identificado (${linkedPatient.patientName}): nunca le pidas nombre ni teléfono, ni para "confirmar". Después de encontrar disponibilidad, pedile solo que confirme fecha y hora.`
      : null,
    !linkedPatient?.patientId && conversation.phoneResolved && /^\d{8}$/.test(String(conversation.phone || ""))
      ? `El paciente escribe desde el número ${conversation.phone}. Pedile el teléfono de forma normal (junto con el nombre). NO le preguntes si es el mismo número del chat. Solo si el paciente dice por su cuenta que su teléfono es el mismo del chat, llamá crear_cita con usar_telefono_del_chat=true en vez de telefono.`
      : null,
    // --- Cambia en cada llamada: va al final para no cortar el prefijo cacheable de arriba ---
    `Fecha y hora actual: ${fecha}, ${hora} (${TIMEZONE}). Hoy es ${iso}. Resolvé "hoy", "mañana", "el lunes" con base en esto.`
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
