"use strict";
// Mide cómo responde la IA a un aviso de Mover (la doctora no puede ese día; contextos/20, «Mover»).
// Uso: node backend/scripts/mensajes-mover-check.js [veces=3] [filtro]
// Contexto y modelo reales de la app; el aviso enviado se inyecta (no hace falta un lote real) y mover_cita_aviso corre
// de verdad (incluido el rechazo del día del aviso) con la escritura en Agenda simulada. No envía ni escribe nada.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../config/db");
const { MensajesRepository } = require("../services/mensajes/mensajesRepository.service");
const { runAssistant } = require("../services/mensajes/assistantAgent.service");
const { runTool } = require("../services/mensajes/assistantTools.service");
const { mapHistory } = require("../services/mensajes/assistantContext.service");
const appointmentActions = require("../services/mensajes/aiAppointmentAction.service");

const RUNS = Number(process.argv[2]) || 3;
const ONLY = process.argv[3] || "";
const repo = new MensajesRepository();

// Cita del jueves 15/10 a las 9:00; el aviso propone el martes 20.
const CITA = { appointmentId: 999801, batchId: 1, patientName: "Carla Ruiz", phone: "70001235", appointmentDate: "2026-10-15", appointmentTime: "09:00", treatment: "Limpieza" };
const MOVE_TEXT = "Buenas tardes, *Carla Ruiz*.\nEl día *jueves 15 de octubre* tenemos agendada su cita, pero la doctora no podrá asistir.\nTendremos que mover la cita para otro día, de preferencia la siguiente semana. ¿Para cuándo le gustaría? ¿El martes le queda bien?";
MensajesRepository.prototype.getRecentSentNotice = (kind) => kind !== "move" ? null : ({ ...CITA, content: MOVE_TEXT, appointments: [CITA], sentAt: new Date(Date.now() - 3600000).toISOString().replace("T", " ").slice(0, 19) });
appointmentActions.moveAppointmentFromNotice = async ({ newDate, newTime }) => ({ ok: true, status: "moved", date: newDate, time: newTime });

const MUTATING = new Set(["crear_cita", "reprogramar_cita", "cancelar_cita", "confirmar_asistencia", "cancelar_cita_recordatorio"]);
async function testRunTool(name, args, ctx) {
  if (!MUTATING.has(name)) return runTool(name, args, ctx);
  return { estado: "ok", simulado: true, mensaje: `(simulado) ${name} habría ejecutado` };
}

const asksIdentity = (text) => /(nombre|tel[eé]fono|n[uú]mero)/i.test(text) && /\?/.test(text);
const wrongTools = (r) => r.tools.some((t) => /crear_cita|reprogramar_cita|confirmar_asistencia|cancelar/.test(t));
const movedOk = (r) => r.tools.includes("mover_cita_aviso:ok");
const CASES = [
  { name: "«Sí, el martes está bien»", patient: ["Sí, el martes está bien"], check: (r) => r.got === "responde" && r.consults.some((a) => /\b0?9\b|9:00/.test(String(a.hora || ""))) && !wrongTools(r) && !asksIdentity(r.text), expect: "consulta el martes con la misma hora (9:00) y la ofrece, sin pedir nombre ni teléfono" },
  { name: "«Si» (corto)", patient: ["Si"], check: (r) => r.got === "responde" && !wrongTools(r) && !asksIdentity(r.text), expect: "no confirma asistencia ni crea otra cita; sigue con mover" },
  { name: "Insiste en el mismo día", patient: ["Y no puede ser el mismo jueves pero más tarde? Ese día es el único que tengo libre"], check: (r) => r.got === "responde" && !movedOk(r) && !wrongTools(r) && /disculp|lament|pena|sentimos/i.test(r.text), expect: "explica que ese día no se puede, se disculpa y ofrece otro día" },
  { name: "Se molesta", patient: ["Qué falta de seriedad, ya había pedido permiso en el trabajo para ese día. Voy a poner una queja"], check: (r) => r.got === "transfiere" && !movedOk(r), expect: "pasa a recepción" },
  { name: "Pide cancelar", patient: ["Mejor cancélela, después veo cuando"], check: (r) => r.got === "transfiere" && !wrongTools(r) && !movedOk(r), expect: "no cancela: pasa a recepción" },
  {
    name: "Flujo completo: acepta martes a la misma hora",
    turns: [["patient", "Sí, el martes está bien"], ["ai", "¡Gracias por su comprensión! Tenemos disponible el martes 20 de octubre a las 9:00 AM, la misma hora de su cita. ¿Se la paso para ese día?"], ["patient", "Sí, por favor"]],
    check: (r) => r.moves.some((a) => a.confirmado === true && /2026-10-20|20/.test(String(a.nueva_fecha)) && /\b0?9\b|9:00/.test(String(a.nueva_hora))) && movedOk(r) && !wrongTools(r) && !asksIdentity(r.text),
    expect: "mover_cita_aviso al martes 20 a las 9:00, sin crear otra cita ni pedir datos"
  }
];

function buildRaw(c) {
  const now = Date.now();
  const turns = [["system", MOVE_TEXT], ...(c.turns || c.patient.map((p) => ["patient", p]))];
  return turns.map(([author, content], i) => ({ author, content, direction: author === "patient" ? "incoming" : "outgoing", messageAt: new Date(now - (turns.length - i) * 60000).toISOString() }));
}

async function runOnce(c, cfg) {
  const moves = [], consults = [];
  try {
    const result = await runAssistant({
      conversation: { id: 999999, phone: CITA.phone, waContactNumber: CITA.phone, phoneResolved: true }, linkedPatient: null, cfg,
      history: mapHistory(buildRaw(c)), assistantMemory: {}, signal: AbortSignal.timeout(120000),
      transport: { runTool: (name, args, ctx) => { if (name === "mover_cita_aviso") moves.push(args || {}); if (name === "consultar_disponibilidad") consults.push(args || {}); return testRunTool(name, args, ctx); } }
    });
    const tools = result.trace.filter((t) => t.type === "tool").map((t) => `${t.name}:${t.result?.estado || "?"}`);
    const got = result.closed ? "finaliza" : result.transfer ? "transfiere" : "responde";
    return { got, text: String(result.text || result.transfer || "").trim(), tools, moves, consults };
  } catch (error) { return { got: "error", text: error.message, tools: [], moves, consults }; }
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
    for (const r of results) console.log(`     [${r.got}]${r.tools.length ? ` {${r.tools.join(", ")}}` : ""}${r.moves.length ? ` mover(${JSON.stringify(r.moves[r.moves.length - 1])})` : ""}${r.consults.length ? ` consulta(${JSON.stringify(r.consults[0])})` : ""} ${r.text.replace(/\s+/g, " ").slice(0, 220)}`);
  }
  console.log(`\n${failedCases ? `${failedCases} casos con fallas` : "todos los casos OK"}`);
  process.exitCode = failedCases ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end?.().catch(() => {}));
