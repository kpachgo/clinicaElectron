"use strict";

// Consola offline para probar el agente de Mensajes sin WhatsApp.
// - Usa el proveedor IA configurado (local o nube).
// - Herramientas de lectura: reales (catalogo y disponibilidad reales).
// - Herramientas que mutan agenda (crear/reprogramar/cancelar): simuladas por
//   defecto; con --live ejecutan de verdad contra la base.
//
// Comandos:
//   /buscar <nombre>         busca pacientes y muestra su id
//   /paciente <idPaciente>   vincula un paciente (consultas/reprogramar/cancelar)
//   /sinpaciente             quita la vinculacion
//   /reset                   reinicia la conversacion
//   /historial               muestra el historial acumulado
//   /salir
//
// Cualquier otra linea se envia como mensaje del paciente.

require("dotenv").config();
const readline = require("node:readline");
const pool = require("./config/db");
const { MensajesRepository } = require("./services/mensajes/mensajesRepository.service");
const { runAssistant } = require("./services/mensajes/assistantAgent.service");
const { runTool: realRunTool } = require("./services/mensajes/assistantTools.service");
const { strategyFor } = require("./services/mensajes/assistantProvider.service");

const LIVE = process.argv.includes("--live");
const repo = new MensajesRepository();
const conversation = { id: -1, phone: "00000000" };
let linkedPatient = null;
let history = [];
let assistantMemory = {};

const MUTATING = new Set(["crear_cita", "reprogramar_cita", "cancelar_cita"]);

async function consoleRunTool(name, args, ctx) {
  if (!LIVE && MUTATING.has(name)) {
    if (name === "crear_cita" && args?.confirmado !== true) return realRunTool(name, args, ctx);
    const already = ctx?.memory?.lastAppointment;
    if (name === "crear_cita" && already?.appointmentId && already.date === args?.fecha && already.time === args?.hora) {
      return { estado: "ya_registrada", id_cita: already.appointmentId, mensaje: "(simulado) esta cita ya estaba registrada en esta conversación" };
    }
    return {
      estado: "ok",
      simulado: true,
      id_cita: 999900 + Math.floor(Math.random() * 99),
      servicio: args?.servicio,
      fecha: name === "reprogramar_cita" ? args?.nueva_fecha : args?.fecha,
      hora: name === "reprogramar_cita" ? args?.nueva_hora : args?.hora,
      mensaje: `(simulado) ${name} habría ejecutado`
    };
  }
  return realRunTool(name, args, ctx);
}

function printTrace(trace) {
  for (const entry of trace) {
    if (entry.type === "tool") {
      console.log(`  · herramienta ${entry.name}(${JSON.stringify(entry.args)})`);
      console.log(`    -> ${JSON.stringify(entry.result)}`);
    } else if (entry.type === "exhausted") {
      console.log("  · (se agotaron los pasos)");
    }
  }
}

async function handleMessage(text) {
  history.push({ role: "user", content: text });
  const cfg = repo.getAiProviderSecret();
  if (!cfg?.baseUrl || !cfg?.model) {
    console.log("No hay proveedor IA configurado. Configuralo en Ajustes de Mensajes.");
    history.pop();
    return;
  }
  console.log(`\n[estrategia: ${strategyFor(cfg)} · modelo: ${cfg.model} · ${LIVE ? "LIVE" : "dry-run"}]`);
  let result;
  try {
    result = await runAssistant({ conversation, linkedPatient, cfg, history, assistantMemory, transport: { runTool: consoleRunTool } });
  } catch (error) {
    console.log(`Error: ${error.message}`);
    history.pop();
    return;
  }
  printTrace(result.trace);
  console.log(`\nAsistente> ${result.text}`);
  if (result.transfer) console.log(`[TRANSFERIDO A RECEPCIÓN: ${result.transfer}]`);
  if (result.memoryUpdate) {
    assistantMemory = { ...assistantMemory, ...result.memoryUpdate };
    console.log(`[memoria: ${JSON.stringify(assistantMemory.lastAppointment)}]`);
  }
  history.push({ role: "assistant", content: result.text });
}

async function searchPatients(term) {
  try {
    const [rows] = await pool.query("SELECT idPaciente, NombreP, telefonoP, tipoTratamientoP, estadoP FROM paciente WHERE NombreP LIKE ? ORDER BY estadoP DESC, NombreP LIMIT 15", [`%${term}%`]);
    if (!rows.length) return console.log("Sin resultados.");
    rows.forEach((r) => console.log(`  #${r.idPaciente}  ${r.NombreP}  ·  ${r.telefonoP || "s/tel"}  ·  ${r.tipoTratamientoP || "s/trat"}${Number(r.estadoP ?? 1) === 1 ? "" : "  (INACTIVO)"}`));
    console.log("Vinculá con  /paciente <id>");
  } catch (error) {
    console.log(`No se pudo buscar: ${error.message}`);
  }
}

async function linkPatient(idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id < 1) return console.log("id de paciente inválido");
  try {
    const [rows] = await pool.query("SELECT idPaciente, NombreP, telefonoP, tipoTratamientoP FROM paciente WHERE idPaciente=? LIMIT 1", [id]);
    if (!rows[0]) return console.log("paciente no encontrado");
    linkedPatient = { patientId: rows[0].idPaciente, patientName: rows[0].NombreP, phone: rows[0].telefonoP || null, treatmentType: rows[0].tipoTratamientoP || null };
    console.log(`Paciente vinculado: ${linkedPatient.patientName} (tel ${linkedPatient.phone || "n/d"})`);
  } catch (error) {
    console.log(`No se pudo consultar el paciente: ${error.message}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "Paciente> " });
console.log("=== Consola del asistente de Mensajes ===");
console.log(LIVE ? "MODO LIVE: crear/reprogramar/cancelar ejecutan de verdad." : "MODO dry-run: crear/reprogramar/cancelar son simulados. Usá --live para ejecutarlas.");
console.log("Comandos: /buscar <nombre>, /paciente <id>, /sinpaciente, /reset, /historial, /salir\n");
rl.prompt();

rl.on("line", async (line) => {
  const value = line.trim();
  if (!value) return rl.prompt();
  if (value === "/salir") return rl.close();
  if (value === "/reset") { history = []; assistantMemory = {}; console.log("Conversación reiniciada.\n"); return rl.prompt(); }
  if (value === "/sinpaciente") { linkedPatient = null; console.log("Paciente desvinculado.\n"); return rl.prompt(); }
  if (value === "/historial") { console.log(JSON.stringify(history, null, 2), "\n"); return rl.prompt(); }
  const search = value.match(/^\/buscar\s+(.+)$/);
  if (search) { await searchPatients(search[1].trim()); rl.prompt(); return; }
  const patient = value.match(/^\/paciente\s+(\d+)\s*$/);
  if (patient) { await linkPatient(patient[1]); rl.prompt(); return; }
  if (/^\/paciente\b/.test(value)) { console.log("Uso: /paciente <id numérico>. Buscá el id con  /buscar <nombre>\n"); return rl.prompt(); }
  await handleMessage(value);
  rl.prompt();
});

rl.on("close", () => { console.log("\nConsola finalizada."); pool.end?.().catch(() => {}); process.exit(0); });
