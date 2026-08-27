"use strict";

// Loop del agente: arma contexto, pide turnos al proveedor, ejecuta herramientas
// y repite hasta obtener un texto para el paciente o agotar los pasos.

const { buildAssistantContext } = require("./assistantContext.service");
const { TOOL_SPECS, runTool } = require("./assistantTools.service");
const { strategyFor, buildInitialMessages, requestTurn, appendToolResults } = require("./assistantProvider.service");

const MAX_STEPS = 6;

/**
 * @param {{
 *   conversation: any,
 *   linkedPatient?: any,
 *   cfg: { providerMode?: string, baseUrl: string, model: string, apiKey?: string, timeoutMs?: number, toolStrategy?: string },
 *   signal?: AbortSignal,
 *   transport?: { requestTurn?: Function, runTool?: Function }
 * }} input
 * @returns {Promise<{ text: string, transfer: string|null, steps: number, trace: any[] }>}
 */
function memoryUpdateFromTrace(trace) {
  for (let i = trace.length - 1; i >= 0; i -= 1) {
    const entry = trace[i];
    if (entry.type !== "tool" || entry.result?.estado !== "ok") continue;
    if (entry.name === "crear_cita") {
      return { lastAppointment: { appointmentId: entry.result.id_cita, action: "creada", service: entry.result.servicio, date: entry.result.fecha, time: entry.result.hora } };
    }
    if (entry.name === "reprogramar_cita") {
      return { lastAppointment: { appointmentId: entry.result.id_cita, action: "reprogramada", service: entry.args?.servicio || null, date: entry.result.fecha, time: entry.result.hora } };
    }
    if (entry.name === "cancelar_cita") {
      return { lastAppointment: null };
    }
  }
  return null;
}

async function runAssistant({ conversation, linkedPatient = null, cfg, signal, transport = {}, history = null, assistantMemory = null }) {
  const doTurn = transport.requestTurn || requestTurn;
  const doTool = transport.runTool || runTool;
  const strategy = strategyFor(cfg);

  const context = await buildAssistantContext({ conversation, linkedPatient, history, assistantMemory });
  const { systemBlocks } = context;
  history = context.history;
  const memory = assistantMemory || {};
  let messages = buildInitialMessages({ systemBlocks, history, toolSpecs: TOOL_SPECS, strategy });

  const trace = [];
  let transfer = null;

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const turn = await doTurn({ messages, toolSpecs: TOOL_SPECS, cfg, strategy, signal });

    if (!turn.toolCalls || !turn.toolCalls.length) {
      trace.push({ step, type: "reply", text: turn.replyText || "" });
      return { text: (turn.replyText || "").trim(), transfer, steps: step, trace, memoryUpdate: memoryUpdateFromTrace(trace) };
    }

    const results = [];
    const seenCalls = new Map();
    for (const call of turn.toolCalls) {
      const key = `${call.name}:${JSON.stringify(call.args || {})}`;
      // Si el modelo repite la misma llamada con los mismos argumentos en el mismo turno,
      // se ejecuta una sola vez (evita crear/cancelar/reprogramar por duplicado).
      const result = seenCalls.has(key)
        ? seenCalls.get(key)
        : await doTool(call.name, call.args, { conversation, linkedPatient, memory });
      seenCalls.set(key, result);
      trace.push({ step, type: "tool", name: call.name, args: call.args, result });
      if (call.name === "transferir_a_recepcion" && result?.estado === "transferido") {
        transfer = result.motivo || call.args?.motivo || "Solicitud del asistente";
      }
      results.push({ call, result });
    }

    if (transfer) {
      return { text: (turn.replyText || "").trim(), transfer, steps: step, trace, memoryUpdate: memoryUpdateFromTrace(trace) };
    }

    messages = appendToolResults(messages, turn.assistantEcho, results, strategy);
  }

  trace.push({ step: MAX_STEPS, type: "exhausted" });
  // Si a pesar de agotar los pasos una acción de agenda se completó, no transferimos:
  // la cita/cambio quedó hecho, solo faltó que el modelo redactara el cierre.
  const doneAction = trace.slice().reverse().find((t) => t.type === "tool" && t.result?.estado === "ok" && ["crear_cita", "reprogramar_cita", "cancelar_cita"].includes(t.name));
  if (doneAction) {
    const label = doneAction.name === "crear_cita" ? "registrada" : doneAction.name === "reprogramar_cita" ? "reprogramada" : "cancelada";
    return {
      text: `Tu cita quedó ${label}. Si necesitás algo más, con gusto te ayudo.`,
      transfer: null,
      steps: MAX_STEPS,
      trace,
      memoryUpdate: memoryUpdateFromTrace(trace)
    };
  }
  return {
    text: "Permíteme confirmar ese dato con recepción y te escribo en un momento.",
    transfer: transfer || "El asistente no logró cerrar la conversación en los pasos disponibles",
    steps: MAX_STEPS,
    trace,
    memoryUpdate: memoryUpdateFromTrace(trace)
  };
}

module.exports = { runAssistant, MAX_STEPS, TOOL_SPECS };
