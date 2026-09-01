const { MensajesRepository } = require("./mensajesRepository.service");
const { getDb } = require("../mensajesDatabase.service");
const { triageMessage } = require("./messageTriage.service");
const { runAssistant } = require("./assistantAgent.service");

const repo = new MensajesRepository(getDb());
let timer; let typingHandler; let sendHandler; let ticking = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function safeTyping(phone, enabled, options = {}) { if (!typingHandler) return; Promise.resolve().then(() => typingHandler(phone, enabled, options)).catch(() => {}); }
function withSendTimeout(task, timeoutMs = 30000) { let timerId; return Promise.race([Promise.resolve().then(task), new Promise((_, reject) => { timerId = setTimeout(() => { const error = new Error(`Tiempo agotado al entregar la respuesta (${timeoutMs} ms)`); error.code = "AI_SEND_TIMEOUT"; reject(error); }, timeoutMs); })]).finally(() => clearTimeout(timerId)); }

function enqueueIncomingResponse(conversationId, messageId, text) {
  if (!repo.getAutomationSettings().enabled) return null;
  const conversation = repo.getConversation(conversationId);
  if (!conversation || !repo.shouldAllowAutomatedResponseForConversation(conversationId, conversation.phone)) return null;
  const settings = repo.getGlobalSettings();
  return repo.enqueueResponseMessage(conversationId, messageId, text, settings.responseGroupDelaySeconds);
}

function responseQueueStillEligible(batch, conversation) {
  if (!conversation || conversation.attentionMode !== "assistant") return { ok: false, reason: "conversation_not_in_assistant_mode" };
  if (conversation.lastMessageDirection !== "incoming") return { ok: false, reason: "last_event_was_not_patient_message" };
  if (["audio", "ptt", "reaction"].includes(String(conversation.lastMessageType || "").toLowerCase())) return { ok: false, reason: "last_event_requires_human_or_is_reaction" };
  const latest = repo.getLatestMessage(conversation.id);
  if (!latest || latest.direction !== "incoming") return { ok: false, reason: "no_latest_incoming_message" };
  if (!batch.messageIds.map(Number).includes(Number(latest.id))) return { ok: false, reason: "queue_is_older_than_latest_patient_message" };
  return { ok: true };
}

// Procesa un lote: triage minimo -> agente con herramientas -> envio.
// El motor de intenciones por regex y las maquinas de estado de agenda se
// eliminaron; la unica pausa disponible es "Pausar IA" (automation_settings).
async function processBatch(batch) {
  if (!repo.getAutomationSettings().enabled) return repo.updateResponseQueue(batch.id, { status: "cancelled", error: "IA pausada globalmente" });
  const conversation = repo.getConversation(batch.conversationId);
  const initialEligibility = responseQueueStillEligible(batch, conversation);
  if (!initialEligibility.ok) { console.warn("[Mensajes][IA] Cola no elegible", { batchId: batch.id, conversationId: conversation?.id, reason: initialEligibility.reason }); return repo.updateResponseQueue(batch.id, { status: "cancelled", error: `Respuesta cancelada: ${initialEligibility.reason}` }); }
  if (conversation && !repo.shouldAllowAutomatedResponseForConversation(conversation.id, conversation.phone)) return repo.updateResponseQueue(batch.id, { status: "cancelled", error: "Teléfono fuera de la lista permitida para IA" });
  if (!conversation || conversation.attentionMode !== "assistant") return repo.updateResponseQueue(batch.id, { status: "cancelled", error: "Conversación en atención humana" });
  const text = repo.listMessages(batch.conversationId, { limit: 100 }).filter((m) => batch.messageIds.includes(m.id)).map((m) => m.content).join("\n").trim();
  repo.updateResponseQueue(batch.id, { consolidatedText: text });

  const savedState = repo.getConversationState(conversation.id);
  const linkedPatient = repo.getPatientLink(conversation.id);
  const assistantMemory = repo.getAssistantMemory(conversation.id);

  const triage = triageMessage(text, { messageType: conversation.lastMessageType || "text" });
  if (triage.humanReview) {
    repo.updateConversationState(conversation.id, { ...savedState, collected: { ...(savedState.collected || {}), _humanReviewReason: triage.reason }, missing: savedState.missing || [], offeredSlots: savedState.offeredSlots || [], pendingAction: savedState.pendingAction || null, humanTransition: true });
    console.log("[Mensajes][IA] Revisión humana", { batchId: batch.id, conversationId: conversation.id, ruleId: triage.ruleId });
    return repo.updateResponseQueue(batch.id, { status: "cancelled", error: triage.reason || "Revisión humana requerida" });
  }

  const cfg = repo.getAiProviderSecret();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(30000, Number(cfg.timeoutMs) || 30000) * 4);
  try {
    const result = await runAssistant({ conversation, linkedPatient, cfg, signal: controller.signal, assistantMemory });
    if (result.memoryUpdate !== null && result.memoryUpdate !== undefined) {
      try { repo.setAssistantMemory(conversation.id, result.memoryUpdate.lastAppointment === null ? { lastAppointment: null } : result.memoryUpdate); }
      catch (memoryError) { console.warn("[Mensajes][IA] No se pudo guardar memoria del agente", { error: memoryError?.message }); }
    }
    // Vinculación automática de la conversación cuando crear_cita hizo match por
    // teléfono verificado o por nombre completo exacto y único (ver assistantTools.service.js).
    if (!linkedPatient?.patientId) {
      const autoLink = result.trace.find((t) => t.type === "tool" && t.name === "crear_cita" && t.result?.estado === "ok" && t.result?._autoLink)?.result?._autoLink;
      if (autoLink?.patientId) {
        try {
          repo.setPatientLink(conversation.id, { id: autoLink.patientId, name: autoLink.patientName, phone: autoLink.phone, treatment: autoLink.treatmentType, waChatId: conversation.waChatId }, null);
          console.log("[Mensajes][IA] Conversación vinculada automáticamente al registrar la cita", { conversationId: conversation.id, patientId: autoLink.patientId });
        } catch (linkError) { console.warn("[Mensajes][IA] No se pudo vincular automáticamente", { error: linkError?.message }); }
      }
    }
    const answer = (result.text || "").trim();
    const markHumanReview = () => {
      const state = repo.getConversationState(conversation.id);
      repo.updateConversationState(conversation.id, { ...state, collected: { ...(state.collected || {}), _humanReviewReason: result.transfer }, missing: state.missing || [], offeredSlots: state.offeredSlots || [], pendingAction: state.pendingAction || null, humanTransition: true });
    };
    console.log("[Mensajes][IA] Turno resuelto", { batchId: batch.id, conversationId: conversation.id, steps: result.steps, transfer: Boolean(result.transfer), tools: result.trace.filter((t) => t.type === "tool").map((t) => `${t.name}:${t.result?.estado || "?"}`) });

    if (result.transfer && !answer) { markHumanReview(); return repo.updateResponseQueue(batch.id, { status: "cancelled", error: `Transferido a recepción: ${result.transfer}` }); }
    if (!answer) return repo.updateResponseQueue(batch.id, { status: "cancelled", error: "El asistente no produjo respuesta" });

    repo.updateResponseQueue(batch.id, { responseText: answer, error: null });
    if (!repo.getAutomationSettings().enabled) return repo.updateResponseQueue(batch.id, { status: "cancelled", error: "IA pausada globalmente" });
    const active = repo.getResponseQueueItem(batch.id);
    if (!active || active.status !== "generating") return active;
    repo.updateResponseQueue(batch.id, { status: "ready_to_send", error: null });

    const settings = repo.getGlobalSettings();
    const min = Number(settings.responseDelayMin) * 1000;
    const max = Math.max(min, Number(settings.responseDelayMax) * 1000);
    const factor = Math.min(1, text.length / 240);
    await wait(min + Math.random() * (max - min) * (0.5 + factor * 0.5));

    const latest = repo.getResponseQueueItem(batch.id);
    if (!repo.getAutomationSettings().enabled) return repo.updateResponseQueue(batch.id, { status: "cancelled", error: "IA pausada globalmente" });
    if (!latest || latest.status !== "ready_to_send") return latest;
    const eligibility = responseQueueStillEligible(latest, repo.getConversation(batch.conversationId));
    if (!eligibility.ok) return repo.updateResponseQueue(batch.id, { status: "cancelled", error: `Respuesta cancelada antes de enviar: ${eligibility.reason}` });

    repo.updateResponseQueue(batch.id, { status: "sending", error: null });
    safeTyping(conversation.phone, true, { waChatId: conversation.waChatId });
    if (sendHandler) await withSendTimeout(() => sendHandler(conversation, answer, batch));
    else repo.saveOutgoingMessage({ phone: conversation.phone, externalId: `ai-preview-${batch.id}-${Date.now()}`, text: answer, author: "ai", messageAt: new Date().toISOString(), waChatId: conversation.waChatId });

    const completed = repo.updateResponseQueue(batch.id, { status: "completed", responseText: answer, error: null });
    if (result.transfer) markHumanReview();
    return completed;
  } catch (error) {
    const current = repo.getResponseQueueItem(batch.id);
    console.error("[Mensajes][IA] Lote fallido", { batchId: batch.id, conversationId: conversation.id, attempts: current?.attempts, error: error?.message || String(error) });
    return repo.updateResponseQueue(batch.id, { status: (current?.attempts || 0) < 3 ? "generating" : "failed", dueAt: new Date(Date.now() + 3000).toISOString(), error: error?.message || "Error del agente" });
  } finally {
    clearTimeout(timeout);
    safeTyping(conversation.phone, false, { waChatId: conversation.waChatId });
  }
}

// Un solo tick a la vez. setInterval no espera al tick anterior; sin esta guarda,
// un lote lento (LLM + herramientas) es reclamado y reprocesado en paralelo por
// los ticks siguientes, produciendo respuestas y acciones duplicadas.
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const batch = repo.claimDueResponseQueue();
    if (batch) {
      await processBatch(batch);
      // Si entraron mensajes nuevos mientras se procesaba el lote, encolar respuesta para ellos.
      try {
        if (repo.getAutomationSettings().enabled && batch.conversationId) repo.enqueueUnansweredAssistantMessages(repo.getGlobalSettings().responseGroupDelaySeconds, 5, batch.conversationId);
      } catch (followUpError) {
        console.warn("[Mensajes][IA] No se pudo reencolar mensajes pendientes", { error: followUpError?.message });
      }
    }
  } catch (error) {
    console.error("[Mensajes][IA] Error en tick", { error: error?.message || String(error) });
  } finally {
    ticking = false;
  }
}

function start() {
  if (timer) return;
  const held = repo.db.prepare("UPDATE response_queue SET status='cancelled', error='No se reanudó automáticamente al iniciar Mensajes', updated_at=datetime('now') WHERE status IN ('generating','sending','ready_to_send')").run().changes;
  if (held) console.warn("[Mensajes][IA] Colas antiguas retenidas al iniciar", { held });
  timer = setInterval(() => void tick(), 500);
  timer.unref?.();
}
function setTypingHandler(handler) { typingHandler = handler; }
function setSendHandler(handler) { sendHandler = handler; }
start();

module.exports = { enqueueIncomingResponse, processBatch, tick, setTypingHandler, setSendHandler, responseQueueStillEligible };
