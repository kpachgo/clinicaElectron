"use strict";
// Mide cómo responde la IA a un mensaje de Retrasos (cita a la que el paciente no se presentó; contextos/20, «Retrasos»).
// Uso: node backend/scripts/mensajes-retrasos-check.js [veces=3] [filtro]
// Contexto y modelo reales de la app; el retraso enviado se inyecta (no hace falta un lote real) y las herramientas
// que modifican la agenda se simulan como en mensajes-finalizar-check.js. No envía ni escribe nada.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../config/db");
const { MensajesRepository } = require("../services/mensajes/mensajesRepository.service");
const { runAssistant } = require("../services/mensajes/assistantAgent.service");
const { runTool } = require("../services/mensajes/assistantTools.service");
const { mapHistory } = require("../services/mensajes/assistantContext.service");

const RUNS = Number(process.argv[2]) || 3;
const ONLY = process.argv[3] || "";
const repo = new MensajesRepository();

const MISSED = { patientName: "José Alberto Martínez", phone: "70001234", appointmentDate: "2026-10-10", appointmentTime: "09:00", treatment: "Limpieza" };
const NO_SHOW_TEXT = "¡Buenos días, *José Alberto Martínez*! 😊🦷\nEl día *sábado 10 de octubre* teníamos una cita programada y notamos que no pudo acompañarnos.\n¿Le gustaría que le ayudemos a reprogramar su cita para otro día que le quede conveniente? 📅✨\n¡Con mucho gusto le atendemos!";
// El retraso "enviado" a este chat: lo que devolvería reminder_batch_items para un lote kind='no_show'.
MensajesRepository.prototype.getRecentSentNotice = (kind) => kind !== "no_show" ? null : ({ ...MISSED, content: NO_SHOW_TEXT, sentAt: new Date(Date.now() - 3600000).toISOString().replace("T", " ").slice(0, 19) });

const MUTATING = new Set(["crear_cita", "reprogramar_cita", "cancelar_cita", "confirmar_asistencia", "cancelar_cita_recordatorio"]);
async function testRunTool(name, args, ctx) {
  if (!MUTATING.has(name)) return runTool(name, args, ctx);
  if (name === "crear_cita" && args?.confirmado !== true) return runTool(name, args, ctx);
  return { estado: "ok", simulado: true, id_cita: 999901, servicio: args?.servicio, fecha: args?.nueva_fecha || args?.fecha, hora: args?.nueva_hora || args?.hora, mensaje: `(simulado) ${name} habría ejecutado` };
}

const asksIdentity = (text) => /(nombre|tel[eé]fono|n[uú]mero)/i.test(text) && /\?/.test(text);
const CASES = [
  { name: "«Sí, por favor»", patient: ["Sí, por favor"], check: (r) => r.got === "responde" && /d[ií]a|fecha|cu[aá]ndo/i.test(r.text) && !r.tools.some((t) => /crear_cita|confirmar_asistencia|cancelar|reprogramar/.test(t)) && !asksIdentity(r.text), expect: "pregunta qué día le queda bien, sin pedir nombre ni teléfono" },
  { name: "«Si, el jueves en la mañana»", patient: ["Si, el jueves en la mañana puedo"], check: (r) => r.got === "responde" && !asksIdentity(r.text) && !r.tools.some((t) => /confirmar_asistencia|cancelar|reprogramar/.test(t)), expect: "ofrece horarios del jueves, sin pedir nombre ni teléfono" },
  { name: "«No gracias»", patient: ["No gracias"], check: (r) => r.got === "responde" && /orden/i.test(r.text) && !/\?/.test(r.text) && !r.tools.some((t) => /cita|asistencia/.test(t)), expect: "no insiste: a la orden + feliz día, sin preguntas" },
  { name: "«Ahorita no puedo, ando fuera»", patient: ["Ahorita no puedo, ando fuera del país"], check: (r) => r.got === "responde" && !/\?/.test(r.text) && !r.tools.some((t) => /cita|asistencia/.test(t)), expect: "no insiste ni pregunta" },
  { name: "«Sí» (corto)", patient: ["Si"], check: (r) => r.got === "responde" && /d[ií]a|fecha|cu[aá]ndo/i.test(r.text) && !r.tools.some((t) => /confirmar_asistencia|crear_cita:ok/.test(t)), expect: "un «si» es querer reprogramar, no confirmar asistencia" },
  { name: "Pregunta de precio", patient: ["Cuánto cuesta la limpieza?"], check: (r) => r.got !== "error" && !r.tools.some((t) => /crear_cita:ok|asistencia/.test(t)), expect: "atiende la pregunta" },
  {
    name: "Flujo completo: acepta el horario ofrecido",
    turns: [["patient", "Sí me gustaría"], ["ai", "¡Con gusto! ¿Qué día le quedaría bien para reprogramar su cita de Limpieza?"], ["patient", "el jueves 15 a las 2 de la tarde"], ["ai", "Tenemos disponible el jueves 15 de octubre a las 2:00 PM para su Limpieza. ¿Le confirmo la cita?"], ["patient", "Sí, confírmela por favor"]],
    check: (r) => r.creates.some((a) => /jos[eé] alberto/i.test(a.nombre || "") && String(a.telefono || "").replace(/\D/g, "").endsWith("70001234") || a.usar_telefono_del_chat) && !asksIdentity(r.text),
    expect: "crea la cita con el nombre y el teléfono de la cita perdida, sin pedirlos"
  }
];

function buildRaw(c) {
  const now = Date.now();
  const turns = [["system", NO_SHOW_TEXT], ...(c.turns || c.patient.map((p) => ["patient", p]))];
  return turns.map(([author, content], i) => ({ author, content, direction: author === "patient" ? "incoming" : "outgoing", messageAt: new Date(now - (turns.length - i) * 60000).toISOString() }));
}

async function runOnce(c, cfg) {
  const raw = buildRaw(c);
  const creates = [];
  try {
    const result = await runAssistant({
      conversation: { id: 999999, phone: MISSED.phone, waContactNumber: MISSED.phone, phoneResolved: true }, linkedPatient: null, cfg,
      history: mapHistory(raw), assistantMemory: {}, signal: AbortSignal.timeout(120000),
      transport: { runTool: (name, args, ctx) => { if (name === "crear_cita") creates.push(args || {}); return testRunTool(name, args, ctx); } }
    });
    const tools = result.trace.filter((t) => t.type === "tool").map((t) => `${t.name}:${t.result?.estado || "?"}`);
    const got = result.closed ? "finaliza" : result.transfer ? "transfiere" : "responde";
    return { got, text: String(result.text || result.transfer || "").trim(), tools, creates };
  } catch (error) { return { got: "error", text: error.message, tools: [], creates }; }
}

(async () => {
  const cfg = repo.getAiProviderSecret();
  if (!cfg?.baseUrl || !cfg?.model) throw new Error("No hay proveedor IA configurado en Ajustes de Mensajes.");
  console.log(`modelo ${cfg.model} · ${RUNS} corridas por caso\n`);
  let failedCases = 0;
  for (const c of CASES.filter((x) => x.name.includes(ONLY))) {
    const results = await Promise.all(Array.from({ length: RUNS }, () => runOnce(c, cfg)));
    const valid = results.filter((r) => r.got !== "error");
    const ok = valid.filter(c.check).length;
    if (ok < valid.length) failedCases++;
    console.log(`${ok === valid.length ? "OK " : "MAL"} ${c.name} — esperado: ${c.expect} (${ok}/${valid.length}${valid.length < RUNS ? `, ${RUNS - valid.length} con error del proveedor` : ""})`);
    for (const r of results) console.log(`     [${r.got}]${r.tools.length ? ` {${r.tools.join(", ")}}` : ""}${r.creates.length ? ` crear_cita(${JSON.stringify(r.creates[r.creates.length - 1])})` : ""} ${r.text.replace(/\s+/g, " ").slice(0, 220)}`);
  }
  console.log(`\n${failedCases ? `${failedCases} casos con fallas` : "todos los casos OK"}`);
  process.exitCode = failedCases ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end?.().catch(() => {}));
