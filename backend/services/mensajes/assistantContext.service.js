"use strict";

// Arma el contexto del asistente: bloques de sistema + historial normalizado.
// No decide nada; solo reúne informacion para el modelo.

const { MensajesRepository } = require("./mensajesRepository.service");
const { getDb } = require("../mensajesDatabase.service");
const { getPolicy } = require("./assistantPolicy.service");
const { listAiServices, getClinicSchedule } = require("./aiAvailability.service");
const { to12h } = require("./timeFormat.service");
const { isModoVentaEnabled } = require("../appMode.service");

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

// Corte duro por vacío: si entre dos mensajes pasaron HISTORY_GAP_HOURS o más, a
// la IA solo le llega lo posterior al último vacío. Antes se mandaba todo con una
// nota "lo de arriba ya está cerrado", y el modelo a veces la ignoraba: un saludo
// 5 días después de pedir una reprogramación se respondía retomando la
// reprogramación. La cita ya gestionada no se pierde: viaja en la memoria del
// agente (describeAssistantMemory), no en el historial.
function mapHistory(messages, { promoTexts = new Set() } = {}) {
  const valid = (messages || []).filter((message) => message && typeof message.content === "string" && message.content.trim());
  // messageAt (fecha real del mensaje, la del teléfono) y no createdAt: en
  // chats con historial importado createdAt queda igual para todos los
  // mensajes (hora de la importación), lo que anularía la detección del gap.
  const timeOf = (message) => { const rawAt = message.messageAt || message.createdAt; return rawAt ? new Date(rawAt).getTime() : NaN; };
  let start = 0;
  let gap = null;
  let previousAt = null;
  valid.forEach((message, index) => {
    const at = timeOf(message);
    if (Number.isNaN(at)) return;
    if (previousAt !== null && (at - previousAt) / 3600000 >= HISTORY_GAP_HOURS) {
      start = index;
      gap = { hours: (at - previousAt) / 3600000, at: message.messageAt || message.createdAt };
    }
    previousAt = at;
  });
  const result = [];
  if (gap) {
    const dateLabel = formatGapDate(gap.at);
    result.push({
      role: "system",
      content: `--- Este paciente ya había escrito antes, pero su último contacto fue hace ${Math.floor(gap.hours / 24)} días; ese historial no se incluye porque era otra conversación, ya cerrada. Lo que sigue${dateLabel ? ` (desde el ${dateLabel})` : ""} es un contacto nuevo: respondé solo a lo que el paciente dice ahora. ---`
    });
  }
  for (const message of valid.slice(start)) {
    // Un saliente con author "human" lo escribió recepción a mano, no la IA: si no se
    // distingue, un compromiso del staff (ej. "sí hay espacio hoy a las 3pm") se lee como
    // si la IA misma lo hubiera dicho, y no hay forma de detectar luego que lo está contradiciendo.
    const isHumanOutgoing = message.direction === "outgoing" && message.author === "human";
    // Una promoción la mandó la clínica por su cuenta (envío a varios pacientes): sin marca se lee como
    // si la IA hubiera iniciado la charla, y no se entiende que el paciente está respondiendo a una oferta.
    const isPromo = message.direction === "outgoing" && message.author === "system" && promoTexts.has(message.content.trim());
    result.push({
      role: message.direction === "incoming" ? "user" : "assistant",
      content: isHumanOutgoing
        ? `[Mensaje enviado por el personal de recepción (un humano), no por vos]: ${message.content.trim()}`
        : isPromo
          ? `[Promoción enviada por la clínica a varios pacientes; no respondía a algo que pidió el paciente]: ${message.content.trim()}`
          : message.content.trim()
    });
  }
  return result;
}

// Modo venta: la IA es solo una herramienta sobre recordatorios. Sin política general,
// conocimiento, catálogo ni horario: confirma, cancela o pasa a recepción.
function buildReminderToolContext({ conversation, historyLimit, history }) {
  const { fecha, hora, iso } = nowParts();
  const systemBlocks = [
    [
      "Sos el asistente de recordatorios de citas de una clínica, por WhatsApp. Tu ÚNICA tarea es gestionar la respuesta del paciente a un recordatorio de cita que la clínica le envió.",
      "- Si el paciente da a entender que SÍ asistirá (con las palabras que sea: \"si\", \"ahí estaré\", \"primero Dios\", un 👍, etc.), llamá confirmar_asistencia y agradecé de forma breve.",
      "- Si el paciente dice que NO podrá asistir o que quiere cancelar, llamá cancelar_cita_recordatorio con confirmado=true. Si no queda claro si quiere cancelar, preguntale primero si desea cancelar su cita.",
      "- Para CUALQUIER otra cosa (cambiar fecha u hora, reprogramar, precios, preguntas, dudas, quejas, urgencias, temas que no son el recordatorio) llamá transferir_a_recepcion con un motivo breve y no respondas nada más.",
      "- Si el paciente solo agradece o se despide, respondé con cortesía en una frase, sin herramientas.",
      "- No inventes datos. No afirmes que una cita quedó confirmada o cancelada hasta que la herramienta devuelva estado \"ok\".",
      "- Respuestas breves y amables. Horas en formato de 12 horas con AM/PM."
    ].join("\n"),
    `Fecha y hora actual: ${fecha}, ${hora} (${TIMEZONE}). Hoy es ${iso}.`
  ];
  const resolvedHistory = Array.isArray(history)
    ? history
    : mapHistory(repo.listMessages(conversation.id, { limit: historyLimit }));
  return { systemBlocks, history: resolvedHistory };
}

/**
 * @param {{ conversation: any, linkedPatient?: any, historyLimit?: number }} input
 * @returns {Promise<{ systemBlocks: string[], history: Array<{role:string,content:string}> }>}
 */
// Promoción reciente enviada a este paciente: la intención de la clínica como contexto, no como guion.
// Va como bloque aparte (no solo en el historial) porque el corte de 48h la saca del historial si el
// paciente vuelve a escribir días después; así la IA sigue sabiendo qué se le ofreció.
const PROMO_CONTEXT_DAYS = 15;
function describeRecentPromos(promos) {
  if (!promos.length) return null;
  return [
    "PROMOCIÓN QUE LA CLÍNICA LE ENVIÓ A ESTE PACIENTE (por iniciativa de la clínica, en un envío a varios pacientes; el paciente no la pidió):",
    ...promos.map((p) => `- Enviada el ${formatGapDate(String(p.sentAt).replace(" ", "T") + "Z") || "hace poco"}${p.validUntil ? `, válida hasta el ${formatGapDate(`${p.validUntil}T12:00:00Z`)}` : ""}: «${p.content.trim()}»`),
    "La intención es que el paciente la aproveche y agende. Respondé con normalidad:",
    "- Si pregunta o responde sobre la promoción, resolvé sus dudas con lo que dice ese mensaje y la INFORMACIÓN DE LA CLÍNICA, y ofrecé agendar cuando muestre interés. Si no le interesa, agradecé sin insistir.",
    "- Si escribe por otro motivo, atendé ese motivo y no saques la promoción salvo que venga al caso.",
    "- No supongas por qué la recibió: las promociones pueden ir a pacientes activos, inactivos o nuevos.",
    "- Para lo que ofrece la promoción, el precio y las condiciones del mensaje son los válidos para este paciente, aunque en la INFORMACIÓN DE LA CLÍNICA o en el catálogo no aparezca o aparezca con otro precio. Para cualquier otro servicio, usá los precios de siempre.",
    "- No extiendas la promoción a otros servicios ni le agregues condiciones que el mensaje no dice. Si pregunta un detalle que el mensaje no aclara (qué incluye exactamente, si aplica a otra persona, etc.), no lo inventes: decile que recepción se lo confirma y transferí."
  ].join("\n");
}

// Recordatorio vigente para este número, desde reminder_batch_items (no se borra con
// "Borrar todo" ni depende de que el chat @lid ya esté fusionado con el del recordatorio).
// Caso real 2026-10-07 (conv 1481): tras "Borrar todo" la paciente contestó "Si" en un
// chat nuevo sin el recordatorio arriba y la IA le preguntó a qué se refería.
function describeReminder(reminder) {
  if (!reminder?.appointmentId) return null;
  const sent = formatGapDate(String(reminder.sentAt).replace(" ", "T") + "Z");
  const citas = reminder.appointments || [];
  if (citas.length > 1) {
    return [
      `RECORDATORIO DE CITAS QUE LA CLÍNICA ENVIÓ A ESTE NÚMERO${sent ? ` el ${sent}` : ""}: un solo mensaje para varias personas que comparten el número (familiares):`,
      ...citas.map((c) => `- id_cita ${c.appointmentId}: ${c.patientName}, ${c.appointmentDate} a las ${to12h(c.appointmentTime)}${c.treatment ? `, ${c.treatment}` : ""}`),
      reminder.content ? `«${String(reminder.content).trim()}»` : null,
      "Puede no aparecer en el historial del chat, pero lo recibieron. Si responden confirmando en general (\"si\", \"ahí estaremos\"), se refiere a todas: llamá confirmar_asistencia con todos los ids_cita. Si nombran solo a algunas personas, solo esas. Si dicen que alguna no podrá ir, no la confirmes y pasá eso a recepción."
    ].filter(Boolean).join("\n");
  }
  return [
    `RECORDATORIO DE CITA QUE LA CLÍNICA LE ENVIÓ A ESTE PACIENTE${sent ? ` el ${sent}` : ""} (cita del ${reminder.appointmentDate} a las ${to12h(reminder.appointmentTime)}):`,
    reminder.content ? `«${String(reminder.content).trim()}»` : null,
    "Puede no aparecer en el historial del chat, pero el paciente sí lo recibió. Si lo que escribe es la respuesta a ese recordatorio (un \"si\" o cualquier afirmación de que asistirá), se refiere a esa cita: llamá confirmar_asistencia sin preguntarle a qué se refiere."
  ].filter(Boolean).join("\n");
}

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
  if (isModoVentaEnabled()) return buildReminderToolContext({ conversation, historyLimit, history });
  const knowledge = repo.getAssistantKnowledge().knowledge?.trim();
  const humanReview = repo.getHumanReviewInstructions().instructions?.trim();
  const services = await listAiServices("");
  const clinic = getClinicSchedule();
  const { fecha, hora, iso } = nowParts();
  const rawMessages = Array.isArray(history) ? [] : repo.listMessages(conversation.id, { limit: historyLimit });
  const promos = conversation.id > 0 ? repo.getRecentSentPromos({
    phones: [conversation.phone, conversation.waContactNumber].filter(Boolean),
    contents: rawMessages.filter((m) => m.direction === "outgoing" && m.author === "system").map((m) => m.content)
  }, PROMO_CONTEXT_DAYS) : [];

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
      ? `CUÁNDO PASAR A RECEPCIÓN: si se cumple alguna de estas situaciones, NO le respondas al paciente y llamá la herramienta transferir_a_recepcion con un motivo breve. Si recepción ya atendió ese motivo en este chat (hay mensajes suyos después) y te devolvió la conversación, ese motivo ya está resuelto: no vuelvas a transferir por lo mismo, seguí con lo que recepción acordó.\n${humanReview}`
      : null,
    [
      "NUNCA CONTRADIGAS A RECEPCIÓN (regla obligatoria #11 de tu política):",
      "En el historial, un mensaje que empieza con \"[Mensaje enviado por el personal de recepción (un humano), no por vos]:\" es algo que un humano de la clínica ya le dijo al paciente. Si eso que le prometieron, confirmaron o acordaron (una hora, un cupo, un descuento, una excepción) choca con lo que te devuelve una herramienta ahora, NO se lo comuniques al paciente ni lo corrijas en seco: llamá transferir_a_recepcion con un motivo que diga exactamente qué prometió recepción vs qué dice el sistema, para que un humano lo resuelva. Igual si recepción le ofreció una hora u opción DISTINTA a la que el paciente había pedido (ej. pidió las 9 y recepción ofreció las 10): esa oferta reemplaza el pedido original, no le vuelvas a ofrecer lo que pidió antes aunque una herramienta diga que sigue libre. Si el paciente no acepta la oferta de recepción y insiste en la original o pide una tercera, tampoco lo decidas vos: transferí.",
      "Citas que ofreció recepción: si recepción le ofreció o confirmó una fecha y hora y el paciente la acepta, registrala con crear_cita (esa fecha y hora, confirmado=true, acordado_por_recepcion=true y en nota lo que incluye si el servicio no lo dice, ej. \"2 extracciones\") sin consultar disponibilidad: el sistema verifica el acuerdo y la marca para que recepción la revise. En servicio poné lo que se acordó tal cual (ej. \"extracción\"): no elijas vos un tipo más específico del catálogo (simple, complicada, cordal…) que nadie dijo; si hay varios, el sistema deja el tipo a confirmar por recepción. Solo si crear_cita igual la rechaza, transferí con el motivo.",
      "Ejemplo concreto: el historial trae \"[Mensaje enviado por el personal de recepción...]: sí, tenemos espacio el sábado a las 8:30 am, ¿le parece?\" y el paciente responde \"sí\". Respuesta CORRECTA: crear_cita para el sábado a las 8:30 AM con acordado_por_recepcion=true y confirmarle la cita. Respuesta INCORRECTA: consultar disponibilidad y decirle que a esa hora no hay espacio. Si crear_cita la rechaza, no le digas nada sobre disponibilidad: transferí con motivo \"recepción ofreció sábado 8:30 AM y el sistema no la registró\"."
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
    describeRecentPromos(promos),
    describeReminder(conversation.id > 0 ? repo.getRecentSentReminderForPhone(conversation.waContactNumber || conversation.phone) : null),
    // --- Cambia en cada llamada: va al final para no cortar el prefijo cacheable de arriba ---
    `Fecha y hora actual: ${fecha}, ${hora} (${TIMEZONE}). Hoy es ${iso}. Resolvé "hoy", "mañana", "el lunes" con base en esto.`
  ];

  const memory = assistantMemory || (conversation.id > 0 ? repo.getAssistantMemory(conversation.id) : {});
  const memoryBlock = describeAssistantMemory(memory);
  if (memoryBlock) systemBlocks.push(memoryBlock);

  const resolvedHistory = Array.isArray(history)
    ? history
    : mapHistory(rawMessages, { promoTexts: new Set(promos.map((p) => p.content.trim())) });
  return { systemBlocks: systemBlocks.filter(Boolean), history: resolvedHistory };
}

module.exports = { buildAssistantContext, describeSchedule, describeCatalog, mapHistory };
