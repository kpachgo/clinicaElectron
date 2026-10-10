"use strict";

// Loop del agente: arma contexto, pide turnos al proveedor, ejecuta herramientas
// y repite hasta obtener un texto para el paciente o agotar los pasos.

const { buildAssistantContext } = require("./assistantContext.service");
const { TOOL_SPECS, SALE_TOOL_SPECS, runTool } = require("./assistantTools.service");
const { strategyFor, buildInitialMessages, requestTurn, requestJudgement, appendToolResults } = require("./assistantProvider.service");
const { isModoVentaEnabled } = require("../appMode.service");

const MAX_STEPS = 6;
// Modo venta: al cancelar por recordatorio el cierre es siempre este texto, no el
// que redacte el modelo.
const SALE_CANCEL_REPLY = "Listo, tu cita quedó cancelada. Si deseas reprogramar con gusto lo hacemos.";

/**
 * @param {{
 *   conversation: any,
 *   linkedPatient?: any,
 *   cfg: { providerMode?: string, baseUrl: string, model: string, apiKey?: string, timeoutMs?: number, toolStrategy?: string },
 *   signal?: AbortSignal,
 *   transport?: { requestTurn?: Function, runTool?: Function }
 * }} input
 * @returns {Promise<{ text: string, transfer: string|null, closed?: string, steps: number, trace: any[] }>}
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
    if (entry.name === "cancelar_cita" || entry.name === "cancelar_cita_recordatorio") {
      return { lastAppointment: null };
    }
  }
  return null;
}

// Red de seguridad: el modelo a veces le dice al paciente que su cita quedó hecha
// sin haber llamado crear_cita (la regla 7 de la política lo prohíbe, pero es solo
// prompt). Criterio por estado, no por frases:
//   1. Estado: solo se revisa si en esta conversación NO hay ninguna acción de
//      agenda respaldada (herramienta exitosa en este turno o cita en memoria).
//   2. Contexto: en ese caso un juicio corto del modelo decide si la respuesta, en
//      el contexto de la charla, le da a entender al paciente que la cita ya está
//      hecha, la diga como la diga ("¡Listo! A la orden, lo esperamos el lunes").
const MUTATING_TOOLS = new Set(["crear_cita", "reprogramar_cita", "cancelar_cita", "confirmar_asistencia", "cancelar_cita_recordatorio"]);
const ACTION_DONE_STATES = new Set(["ok", "ya_registrada"]);
const CLAIM_JUDGE_SYSTEM = [
  "Revisás un mensaje que el asistente de WhatsApp de una clínica dental está por enviarle a un paciente.",
  "Dato del sistema: en esta conversación NO se registró, reprogramó ni canceló ninguna cita en la agenda.",
  "Decidí si el mensaje, en el contexto de la conversación, le da a entender al paciente que una cita YA quedó registrada, agendada, reprogramada, cancelada o confirmada, aunque lo diga con otras palabras o de forma implícita.",
  "NO cuenta como cita hecha: ofrecer horarios, preguntar si confirma, pedir datos, explicar cómo agendar, ni hablar de una cita que el paciente ya tenía de antes.",
  'Respondé solo con JSON: {"afirma_cita_hecha": true o false, "motivo": "<una frase>"}'
].join("\n");

function hasBackedAction(trace, memory) {
  if (trace.some((t) => t.type === "tool" && MUTATING_TOOLS.has(t.name) && ACTION_DONE_STATES.has(t.result?.estado))) return true;
  // Una cita gestionada en un turno anterior de esta conversación respalda que el
  // modelo la vuelva a mencionar ("gracias" → "lo esperamos el lunes").
  return Boolean(memory?.lastAppointment?.appointmentId);
}

function recentDialogue(history, limit = 6) {
  return (history || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "Paciente" : "Clínica"}: ${String(m.content || "").slice(0, 400)}`)
    .join("\n");
}

// Ante un error del juicio (red, timeout) se deja pasar la respuesta: la red de
// seguridad no debe dejar al paciente sin contestar.
async function claimsUnbackedAction({ replyText, trace, memory, history, judge, cfg, signal }) {
  if (!replyText || hasBackedAction(trace, memory)) return { claims: false };
  try {
    const verdict = await judge({ cfg, signal, system: CLAIM_JUDGE_SYSTEM, user: `Conversación reciente:\n${recentDialogue(history) || "(sin mensajes previos)"}\n\nMensaje a revisar (todavía no enviado):\n${replyText}` });
    return { claims: verdict?.afirma_cita_hecha === true, reason: verdict?.motivo || null };
  } catch (error) {
    console.warn("[Mensajes][IA] No se pudo revisar la respuesta; se envía igual", { error: error?.message });
    return { claims: false };
  }
}

function unbackedClaimCorrection(strategy) {
  const content = "[Control interno del sistema, no lo escribió el paciente] Tu respuesta afirma que una cita quedó registrada, reprogramada o cancelada, pero en esta conversación ninguna herramienta lo hizo: la agenda NO tiene ese cambio. Si el paciente ya confirmó servicio, fecha y hora, llamá ahora la herramienta correspondiente con confirmado=true. Si todavía falta que confirme algo, reescribí la respuesta sin decir que la cita está hecha (por ejemplo, preguntale si confirma).";
  return (strategy || "json") === "native"
    ? { role: "system", content }
    : { role: "user", content: `${content}\n\nRespondé usando el mismo formato JSON.` };
}

async function runAssistant({ conversation, linkedPatient = null, cfg, signal, transport = {}, history = null, assistantMemory = null }) {
  const doTurn = transport.requestTurn || requestTurn;
  const doTool = transport.runTool || runTool;
  const doJudge = transport.requestJudgement || requestJudgement;
  const strategy = strategyFor(cfg);
  const saleMode = isModoVentaEnabled();
  const toolSpecs = saleMode ? SALE_TOOL_SPECS : TOOL_SPECS;
  const saleCancelled = (trace) => saleMode && trace.some((t) => t.type === "tool" && t.name === "cancelar_cita_recordatorio" && t.result?.estado === "ok");

  const context = await buildAssistantContext({ conversation, linkedPatient, history, assistantMemory });
  const { systemBlocks } = context;
  history = context.history;
  const memory = assistantMemory || {};
  let messages = buildInitialMessages({ systemBlocks, history, toolSpecs, strategy });

  const trace = [];
  let transfer = null;
  let closed = null;
  let claimCorrected = false;

  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const turn = await doTurn({ messages, toolSpecs, cfg, strategy, signal });

    if (!turn.toolCalls || !turn.toolCalls.length) {
      const replyText = (turn.replyText || "").trim();
      const check = saleMode ? { claims: false } : await claimsUnbackedAction({ replyText, trace, memory, history, judge: doJudge, cfg, signal });
      if (check.claims) {
        if (!claimCorrected && step < MAX_STEPS) {
          // Primera vez: se le devuelve al modelo para que llame la herramienta o corrija.
          claimCorrected = true;
          trace.push({ step, type: "guard", name: "afirmacion_sin_accion", text: replyText, reason: check.reason });
          console.warn("[Mensajes][IA] Respuesta afirmaba una cita sin registrarla; se pide corrección", { conversationId: conversation?.id, motivo: check.reason, text: replyText.slice(0, 160) });
          // El mensaje completo: en modo de razonamiento DeepSeek exige recibir de vuelta reasoning_content (HTTP 400 sin él).
          messages = [...messages, turn.assistantEcho || { role: "assistant", content: replyText }, unbackedClaimCorrection(strategy)];
          continue;
        }
        // Insistió (o no quedan pasos): no se envía la afirmación falsa.
        trace.push({ step, type: "guard", name: "afirmacion_sin_accion_repetida", text: replyText, reason: check.reason });
        console.warn("[Mensajes][IA] La IA insistió en afirmar una cita sin registrarla; pasa a recepción", { conversationId: conversation?.id, motivo: check.reason, text: replyText.slice(0, 160) });
        return {
          text: "Permíteme confirmar ese dato con recepción y te escribo en un momento.",
          transfer: "La IA afirmó una cita sin haberla registrado en la agenda",
          steps: step,
          trace,
          memoryUpdate: memoryUpdateFromTrace(trace)
        };
      }
      trace.push({ step, type: "reply", text: turn.replyText || "" });
      return { text: saleCancelled(trace) ? SALE_CANCEL_REPLY : (turn.replyText || "").trim(), transfer, steps: step, trace, memoryUpdate: memoryUpdateFromTrace(trace) };
    }

    const results = [];
    const seenCalls = new Map();
    for (const call of turn.toolCalls) {
      const key = `${call.name}:${JSON.stringify(call.args || {})}`;
      // Si el modelo repite la misma llamada con los mismos argumentos en el mismo turno,
      // se ejecuta una sola vez (evita crear/cancelar/reprogramar por duplicado).
      const result = seenCalls.has(key)
        ? seenCalls.get(key)
        : await doTool(call.name, call.args, { conversation, linkedPatient, memory, cfg, signal, judge: doJudge });
      seenCalls.set(key, result);
      trace.push({ step, type: "tool", name: call.name, args: call.args, result });
      if (call.name === "transferir_a_recepcion" && result?.estado === "transferido") {
        transfer = result.motivo || call.args?.motivo || "Solicitud del asistente";
      }
      if (call.name === "finalizar_conversacion" && result?.estado === "finalizada") closed = result.motivo;
      results.push({ call, result });
    }

    if (transfer) {
      return { text: (turn.replyText || "").trim(), transfer, steps: step, trace, memoryUpdate: memoryUpdateFromTrace(trace) };
    }
    // Finalizada (contextos/20, «Conversación finalizada»): no se le envía nada; processBatch deja la marca y la nota para recepción. Si en este
    // turno se tocó la agenda, el paciente tiene que enterarse: se ignora el cierre y el modelo responde.
    if (closed && !hasBackedAction(trace, null)) {
      return { text: "", transfer: null, closed, steps: step, trace, memoryUpdate: memoryUpdateFromTrace(trace) };
    }

    if (saleCancelled(trace)) {
      return { text: SALE_CANCEL_REPLY, transfer: null, steps: step, trace, memoryUpdate: memoryUpdateFromTrace(trace) };
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
