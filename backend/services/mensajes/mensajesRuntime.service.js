const { SimulatedMessagingConnector } = require("./connectors/simulatedMessagingConnector");
const { WhatsAppWebMessagingConnector } = require("./connectors/whatsappWebMessagingConnector");
const storagePaths = require("../../config/storagePaths");
const { MensajesRepository } = require("./mensajesRepository.service");
const { enqueueIncomingResponse, setTypingHandler, setSendHandler } = require("./aiObserver.service");
const { evaluateConversationEvent } = require("./conversationEngine.service");
const connector = process.env.MENSAJES_CONNECTOR === "simulated"
  ? new SimulatedMessagingConnector()
  : new WhatsAppWebMessagingConnector({ authPath: require("path").join(storagePaths.mensajesDir, "whatsapp-auth") });
const simulationConnector = new SimulatedMessagingConnector();
const repository = new MensajesRepository();
let started = false;
let queueTimer = null;
let flushingOutgoing = false;
let flushingOutgoingPromise = null;
let connectedAtMs = 0;
const reminderTimers = new Map();
const simulatedConnector = process.env.MENSAJES_CONNECTOR === "simulated";
const isSimulationChat = (conversationOrChatId) => typeof conversationOrChatId === "string"
  ? conversationOrChatId.startsWith("simulated:")
  : conversationOrChatId?.waChatId?.startsWith("simulated:");
function getMessageConnector(conversationOrChatId) { return isSimulationChat(conversationOrChatId) ? simulationConnector : connector; }
async function start() {
  if (started) return { connector, repository };
  connector.onIncomingMessage((message) => { const saved = repository.saveIncomingMessage(message); const eventDecision = evaluateConversationEvent({ conversationStatus: saved.conversation.status, eventDirection: "incoming", eventType: message.rawType || "text", humanReviewRequired: saved.conversation.attentionMode === "review_required", hasNewPatientMessage: message.source !== "recovery" && message.rawType !== "reaction", isReconnect: message.source === "recovery" }); const allowedByPhone = repository.shouldAllowAutomatedResponseForConversation(saved.conversation.id, message.waContactNumber || message.phone || ""); if (message.rawType === "audio" || message.rawType === "ptt") { const state = repository.getConversationState(saved.conversation.id); repository.updateConversationState(saved.conversation.id, { ...state, collected: { ...(state.collected || {}), _engineFacts: { ...(state.collected?._engineFacts || {}), unreviewedAudio: true } }, humanTransition: true }); } console.log("[Mensajes][SQLite] Mensaje entrante", { externalId: message.externalId, conversationId: saved.conversation.id, duplicate: Boolean(saved.duplicate), rawType: message.rawType || "text", source: message.source || "live", eventAction: eventDecision.action, automatedResponseAllowed: allowedByPhone }); if (saved.message?.id && !saved.duplicate && eventDecision.action === "analyze_incoming" && allowedByPhone) enqueueIncomingResponse(saved.conversation.id, saved.message.id, message.text); });
  if (typeof connector.onOutgoingMessage === "function") connector.onOutgoingMessage((message) => { repository.saveOutgoingMessage({ phone: message.phone, externalId: message.externalId, text: message.text, author: message.author || "human", messageAt: message.messageAt, waChatId: message.waChatId, waContactNumber: message.waContactNumber, waDisplayName: message.waDisplayName, rawType: message.rawType || "text", source: message.source || "live" }); });
  connector.onMessageStatus((status) => repository.updateMessageStatus(status.externalId, status.status, status.error));
  if (typeof connector.onStatus === "function") connector.onStatus((status) => { if (status.status === "connected") { connectedAtMs = Date.now(); console.log("[Mensajes] Conexion restaurada; no se reanudan respuestas ni recordatorios automaticamente"); void refreshLidConversations(); } });
  if (typeof connector.setTyping === "function") setTypingHandler((phone, enabled, options = {}) => connector.setTyping(phone, enabled, options));
  if (typeof connector.sendMessage === "function") setSendHandler(sendAiMessage);
  queueTimer = null;
  started = true;
  if (simulationConnector.getStatus().status !== "connected") await simulationConnector.connect();
  if (simulatedConnector && connector.getStatus().status !== "connected") {
    console.log("[Mensajes][Simulado] Conectando automaticamente el conector de pruebas");
    await connector.connect();
  }
  return { connector, repository };
}
async function refreshLidConversations() {
  if (typeof connector.resolvePhoneForChatId !== "function") return;
  for (const conversation of repository.listConversations({ limit: 200 })) {
    if (!conversation.waChatId?.endsWith("@lid")) continue;
    try {
      const phone = await connector.resolvePhoneForChatId(conversation.waChatId);
      if (phone && phone !== conversation.phone) repository.updateWhatsAppContact(conversation.id, phone);
    } catch (error) {
      console.warn("[Mensajes][WhatsApp] No se pudo actualizar contacto LID", { conversationId: conversation.id, error: error?.message || String(error) });
    }
  }
}
async function connectConnector() { if (!started) await start(); return connector.connect(); }
async function stop() {
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  if (started) {
    if (typeof connector.shutdown === "function") await connector.shutdown();
    else await connector.disconnect();
    started = false;
  }
}
async function disconnectConnector() { return connector.disconnect(); }
async function clearConnectorSession() {
  if (typeof connector.clearSession !== "function") throw new Error("El conector actual no permite quitar la sesion");
  return connector.clearSession();
}
async function sendQueuedMessage(phone, text, idempotencyKey, options = {}) { const queued = repository.enqueueOutgoing(phone, text, idempotencyKey, options); await flushOutgoingQueue(); return queued; }
async function flushOutgoingQueue() {
  if (!started) return;
  if (flushingOutgoingPromise) return flushingOutgoingPromise;
  flushingOutgoing = true;
  flushingOutgoingPromise = (async () => {
    for (const item of repository.listPendingOutgoing()) {
      if (!repository.claimOutgoing(item.id)) continue;
      const messageConnector = getMessageConnector(item.wa_chat_id);
      if (!["connected", "syncing"].includes(messageConnector.getStatus().status)) { repository.db.prepare("UPDATE outgoing_queue SET status='pending', updated_at=datetime('now') WHERE id=? AND status='sending'").run(item.id); continue; }
      try {
        const sent = await messageConnector.sendMessage(item.phone, item.content, { waChatId: item.wa_chat_id });
        repository.saveOutgoingMessage({ phone: sent.phone || item.phone, externalId: sent.externalId, text: sent.text, author: "human", messageAt: sent.messageAt, waChatId: item.wa_chat_id || sent.waChatId, waContactNumber: sent.waContactNumber });
        repository.markOutgoingSent(item.id);
        console.log("[Mensajes][WhatsApp] Mensaje enviado", { queueId: item.id, phone: item.phone, waChatId: item.wa_chat_id, externalId: sent.externalId });
      } catch (error) {
        console.error("[Mensajes][WhatsApp] Error en cola de envio", { queueId: item.id, phone: item.phone, waChatId: item.wa_chat_id, error: error?.stack || error?.message || String(error) });
        repository.markOutgoingFailed(item.id, error?.message || String(error));
      }
    }
  })();
  try { return await flushingOutgoingPromise; } finally { flushingOutgoing = false; flushingOutgoingPromise = null; }
}
async function sendAiMessage(conversation, text, batch) {
  const messageConnector = getMessageConnector(conversation);
  const status = messageConnector.getStatus();
  if (!started || status.status !== "connected") {
    const error = new Error(`Conector no conectado para enviar respuesta IA (estado: ${status.status})`);
    error.code = "AI_CONNECTOR_NOT_CONNECTED";
    throw error;
  }
  console.log("[Mensajes][IA] Enviando respuesta", { batchId: batch.id, conversationId: conversation.id, phone: conversation.phone, waChatId: conversation.waChatId, connectorStatus: status.status });
  let sent;
  try {
    sent = await messageConnector.sendMessage(conversation.phone, text, { waChatId: conversation.waChatId, author: "ai" });
  } catch (error) {
    error.code = error.code || "AI_SEND_FAILED";
    console.error("[Mensajes][IA] Error de envio", { batchId: batch.id, conversationId: conversation.id, phone: conversation.phone, error: error?.stack || error?.message || String(error) });
    throw error;
  }
  const saved = repository.saveOutgoingMessage({ phone: conversation.phone, externalId: sent.externalId || `ai-wa-${batch.id}-${Date.now()}`, text: sent.text || text, author: "ai", messageAt: sent.messageAt || new Date().toISOString(), waChatId: sent.waChatId || conversation.waChatId, waContactNumber: conversation.waContactNumber, waDisplayName: conversation.waDisplayName });
  console.log("[Mensajes][IA] Respuesta guardada en SQLite", { batchId: batch.id, conversationId: saved.conversation.id, messageId: saved.message?.id, externalId: sent.externalId });
  return sent;
}
async function processReminder(batchId) { const batch = repository.getReminderBatch(batchId); if (!batch || ["cancelled", "completed", "completed_with_errors"].includes(batch.status)) return; if (connector.getStatus().status !== "connected") return; const item = repository.claimReminderItem(batchId); if (!item) { const final = repository.refreshReminderBatch(batchId); if (final && !final.items.some((x) => ["pending", "sending", "queued"].includes(x.status))) repository.db.prepare("UPDATE reminder_batches SET status=CASE WHEN failed_count>0 THEN 'completed_with_errors' ELSE 'completed' END, finished_at=datetime('now') WHERE id=?").run(batchId); reminderTimers.delete(batchId); return; } repository.db.prepare("UPDATE reminder_batches SET status='processing', started_at=COALESCE(started_at,datetime('now')), updated_at=datetime('now') WHERE id=?").run(batchId); try { const queued = repository.enqueueOutgoing(item.phone, item.content, `reminder-${batchId}-${item.id}`); repository.updateReminderItem(item.id, "queued", { queueId: queued?.id }); await flushOutgoingQueue(); const sent = queued && repository.db.prepare("SELECT status,last_error FROM outgoing_queue WHERE id=?").get(queued.id); if (sent?.status === "sent") repository.updateReminderItem(item.id, "sent"); else if (sent?.status === "failed") repository.updateReminderItem(item.id, "failed", { error: sent.last_error || "Error de envío" }); else repository.updateReminderItem(item.id, "failed", { error: "No se pudo confirmar el envío" }); } catch (error) { repository.updateReminderItem(item.id, "failed", { error: error.message }); } repository.refreshReminderBatch(batchId); const next = repository.getReminderBatch(batchId); const remaining = next?.items.some((x) => x.status === "pending"); if (remaining && next.status !== "cancelled") { const delay = (next.min_delay_seconds + Math.random() * (next.max_delay_seconds - next.min_delay_seconds)) * 1000; const timer = setTimeout(() => void processReminder(batchId), delay); timer.unref?.(); reminderTimers.set(batchId, timer); } else { repository.db.prepare("UPDATE reminder_batches SET status=CASE WHEN failed_count>0 THEN 'completed_with_errors' ELSE 'completed' END, finished_at=datetime('now') WHERE id=?").run(batchId); reminderTimers.delete(batchId); } }
function startReminderBatch(batchId) { if (reminderTimers.has(batchId)) return; void processReminder(batchId); }
function getRuntime() { return { connector, repository, started }; }
function getMetrics() { const memory = process.memoryUsage(); return { started, connector: connector.getStatus(), process: { uptimeSeconds: Math.round(process.uptime()), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal }, queue: { pending: repository.listPendingOutgoing(100).length } }; }
module.exports = { start, stop, connectConnector, disconnectConnector, clearConnectorSession, getRuntime: () => ({ connector, repository, started, startReminderBatch }), getMetrics, sendQueuedMessage, flushOutgoingQueue, startReminderBatch };
