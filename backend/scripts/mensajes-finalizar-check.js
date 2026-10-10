"use strict";
// Mide el criterio de la IA para finalizar_conversacion (contextos/20, «Conversación finalizada») con chats reales cortados en un mensaje.
// Uso: node backend/scripts/mensajes-finalizar-check.js [veces=3]
// Usa la herramienta y el contexto reales de la app con DeepSeek real; las herramientas que modifican la agenda se
// simulan (como assistant-console.js sin --live). No envía ni escribe nada. Solo modo normal (no modo venta).
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../config/db");
const { MensajesRepository } = require("../services/mensajes/mensajesRepository.service");
const { runAssistant } = require("../services/mensajes/assistantAgent.service");
const { runTool } = require("../services/mensajes/assistantTools.service");
const { mapHistory } = require("../services/mensajes/assistantContext.service");

const RUNS = Number(process.argv[2]) || 3;
const ONLY = process.argv[3] || ""; // filtra casos por nombre
const repo = new MensajesRepository();

// "Ahora" = la hora del corte, para que "hoy", "mañana" y la agenda se lean como en ese momento.
const RealDate = Date;
let fixedAt = null;
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixedAt ?? RealDate.now()])); } static now() { return fixedAt ?? RealDate.now(); } };

const MUTATING = new Set(["crear_cita", "reprogramar_cita", "cancelar_cita", "confirmar_asistencia", "cancelar_cita_recordatorio"]);
async function testRunTool(name, args, ctx, raw) {
  // La condición del sistema de finalizar_conversacion mira el chat tal como estaba en el corte.
  if (name === "finalizar_conversacion") return runTool(name, args, { ...ctx, messages: raw });
  if (!MUTATING.has(name)) return runTool(name, args, ctx);
  if (name === "confirmar_asistencia") {
    const phone = String(ctx?.conversation?.waContactNumber || ctx?.conversation?.phone || "").replace(/\D/g, "");
    return phone.length >= 7 && repo.getRecentSentReminderForPhone(phone)?.appointmentId
      ? { estado: "ok", simulado: true, mensaje: "Asistencia confirmada. Agradecé de forma breve y natural." }
      : { estado: "sin_recordatorio_reciente", mensaje: "No hay un recordatorio de cita reciente para este número. Agradecé la respuesta sin afirmar que la cita quedó confirmada." };
  }
  // Como assistant-console.js sin --live: sin confirmar va a la real (no escribe); confirmada se simula como hecha.
  if (["crear_cita", "reprogramar_cita", "cancelar_cita"].includes(name) && args?.confirmado !== true) return runTool(name, args, ctx);
  return { estado: "ok", simulado: true, id_cita: args?.id_cita || 999901, servicio: args?.servicio, fecha: args?.nueva_fecha || args?.fecha, hora: args?.nueva_hora || args?.hora, mensaje: `(simulado) ${name} habría ejecutado` };
}

const CASES = [
  { name: "Elmer 14909 «Sii» a ¿confirmar o reprogramar?", conv: 1558, cut: 14909, expect: "no finaliza" },
  { name: "Elmer 14911 «Gracias» después de ¿algo más?", conv: 1558, cut: 14911, expect: "no finaliza" },
  { name: "Elmer 14913 «Bueno muchas gracias»", conv: 1558, cut: 14913, expect: "finaliza" },
  { name: "Elmer 14915 «Gracias»", conv: 1558, cut: 14915, expect: "finaliza" },
  { name: "Elmer 14917 «Ok»", conv: 1558, cut: 14917, expect: "finaliza" },
  { name: "Despedida + pregunta de precio", conv: 1558, cut: 14912, extra: ["Gracias, y cuánto cuesta la limpieza?"], expect: "no finaliza" },
  { name: "Despedida + llegar tarde", conv: 1558, cut: 14912, extra: ["Ok, puedo llegar 10 min tarde?"], expect: "no finaliza" },
  { name: "Despedida + no podrá ir", conv: 1558, cut: 14912, extra: ["Gracias, pero no voy a poder ir el sábado"], expect: "no finaliza" },
  { name: "Anyely: recepción agendó + «Gracias»", conv: 1541, cut: 14836, extra: ["Gracias"], expect: "finaliza" },
  // "Gracias" a mitad de conversación: responder lo que preguntó no es todavía el cierre.
  { name: "1556 ubicación enviada + «Gracias»", conv: 1556, cut: 14887, extra: ["Gracias"], expect: "no finaliza" },
  { name: "1556 precio + ¿agendar? + «Gracias»", conv: 1556, cut: 14885, extra: ["Gracias"], expect: "no finaliza" },
  { name: "1556 horarios ofrecidos + «Gracias, déjeme ver»", conv: 1556, cut: 14890, extra: ["Gracias, déjeme ver"], expect: "no finaliza" },
  // Cita creada o reprogramada en un mensaje que ya se despide: el "gracias" siguiente no trae nada nuevo.
  { name: "1538 cita creada con despedida + «Muchas gracias 😊»", conv: 1538, cut: 14773, expect: "finaliza" },
  { name: "1534 cita creada («Le esperamos ese día») + «Gracias»", conv: 1534, cut: 14826, extra: ["Gracias"], expect: "finaliza" },
  { name: "1547 cita reprogramada con despedida + «Gracias»", conv: 1547, cut: 14795, extra: ["Gracias"], expect: "finaliza" },
  { name: "Chat que abre con «Muchas gracias»", raw: [{ author: "patient", content: "Muchas gracias" }], expect: "no finaliza" },
  { name: "Recordatorio + «Gracias»", raw: [{ author: "system", content: "Hola Ana Pérez,\nle recordamos su cita de mañana 2026-10-10\na las 9:00 AM\npor Limpieza\nPodra Asistir?" }, { author: "patient", content: "Gracias" }], expect: "no finaliza" },
  // Oferta vieja de recepción: la paciente cambió de pedido (hoy no puede, quiere el lunes). Es una reprogramación nueva.
  { name: "1546 Ashley: no puede hoy, pide el lunes 4:00", conv: 1546, cut: 15439, expect: "no transfiere" }
];

function loadCase(c) {
  if (c.raw) {
    const now = RealDate.now();
    const raw = c.raw.map((m, i) => ({ ...m, direction: m.author === "patient" ? "incoming" : "outgoing", messageAt: new RealDate(now - (c.raw.length - i) * 60000).toISOString() }));
    return { conversation: { id: -1, phone: "00000000" }, linkedPatient: null, memory: {}, raw, at: now };
  }
  const raw = repo.listMessages(c.conv, { limit: 200 }).filter((m) => !m.queued && Number(m.id) <= c.cut);
  const lastAt = RealDate.parse(raw[raw.length - 1].messageAt);
  (c.extra || []).forEach((content, i) => raw.push({ direction: "incoming", author: "patient", content, messageAt: new RealDate(lastAt + (i + 1) * 60000).toISOString() }));
  // Memoria de hoy: sirve porque los cortes son posteriores a la última cita gestionada en cada chat.
  return { conversation: repo.getConversation(c.conv), linkedPatient: repo.getPatientLink(c.conv), memory: repo.getAssistantMemory(c.conv), raw, at: RealDate.parse(raw[raw.length - 1].messageAt) + 20000 };
}

async function runOnce({ conversation, linkedPatient, memory, raw }, cfg) {
  try {
    const result = await runAssistant({
      conversation, linkedPatient, cfg, history: mapHistory(raw), assistantMemory: memory, signal: AbortSignal.timeout(120000),
      transport: { runTool: (name, args, ctx) => testRunTool(name, args, ctx, raw) }
    });
    const tools = result.trace.filter((t) => t.type === "tool").map((t) => `${t.name}:${t.result?.estado || "?"}`);
    if (result.closed) return { got: result.text ? "error" : "finaliza", detail: result.closed, tools };
    if (result.transfer) return { got: "transfiere", detail: result.transfer, tools };
    return { got: "responde", detail: result.text, tools };
  } catch (error) {
    return { got: "error", detail: error.message, tools: [] };
  }
}

(async () => {
  const cfg = repo.getAiProviderSecret();
  if (!cfg?.baseUrl || !cfg?.model) throw new Error("No hay proveedor IA configurado en Ajustes de Mensajes.");
  console.log(`modelo ${cfg.model} · ${RUNS} corridas por caso\n`);
  const summary = [];
  for (const c of CASES.filter((x) => x.name.includes(ONLY))) {
    const loaded = loadCase(c);
    fixedAt = loaded.at;
    const results = await Promise.all(Array.from({ length: RUNS }, () => runOnce(loaded, cfg)));
    // Un error del proveedor no dice nada del criterio: se cuenta aparte.
    const valid = results.filter((r) => r.got !== "error").length;
    const ok = results.filter((r) => (c.expect === "finaliza" ? r.got === "finaliza" : c.expect === "no transfiere" ? r.got === "responde" : r.got === "responde" || r.got === "transfiere")).length;
    console.log(`${ok === valid ? "OK " : "MAL"} ${c.name} — esperado: ${c.expect} (${ok}/${valid}${valid < RUNS ? `, ${RUNS - valid} con error del proveedor` : ""})${loaded.linkedPatient?.patientName ? ` · paciente: ${loaded.linkedPatient.patientName}` : ""}`);
    for (const r of results) console.log(`     [${r.got}]${r.tools.length ? ` {${r.tools.join(", ")}}` : ""} ${String(r.detail || "").replace(/\s+/g, " ").slice(0, 160)}`);
    summary.push({ c, ok, valid });
  }
  const failed = summary.filter((s) => s.ok < s.valid);
  console.log(`\n${summary.length - failed.length}/${summary.length} casos sin fallas${failed.length ? ` · con fallas: ${failed.map((s) => s.c.name).join(" | ")}` : ""}`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end?.().catch(() => {}));
