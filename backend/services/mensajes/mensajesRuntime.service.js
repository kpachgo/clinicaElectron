const { SimulatedMessagingConnector } = require("./connectors/simulatedMessagingConnector");
const { WhatsAppWebMessagingConnector } = require("./connectors/whatsappWebMessagingConnector");
const storagePaths = require("../../config/storagePaths");
const { MensajesRepository } = require("./mensajesRepository.service");
const { enqueueIncomingResponse, setTypingHandler, setSendHandler, setLidResolver } = require("./aiObserver.service");
const { evaluateConversationEvent } = require("./conversationEngine.service");
const connector = process.env.MENSAJES_CONNECTOR === "simulated"
  ? new SimulatedMessagingConnector()
  : new WhatsAppWebMessagingConnector({ authPath: require("path").join(storagePaths.mensajesDir, "whatsapp-auth") });
const simulationConnector = new SimulatedMessagingConnector();
const repository = new MensajesRepository();
let started = false;
let queueTimer = null;
let lidRefreshTimer = null;
let flushingOutgoing = false;
let flushingOutgoingPromise = null;
let connectedAtMs = 0;
const reminderTimers = new Map();
const promoTimers = new Map();
const simulatedConnector = process.env.MENSAJES_CONNECTOR === "simulated";
const isSimulationChat = (conversationOrChatId) => typeof conversationOrChatId === "string"
  ? conversationOrChatId.startsWith("simulated:")
  : conversationOrChatId?.waChatId?.startsWith("simulated:");
function getMessageConnector(conversationOrChatId) { return isSimulationChat(conversationOrChatId) ? simulationConnector : connector; }
async function start() {
  if (started) return { connector, repository };
  connector.onIncomingMessage((message) => { const saved = repository.saveIncomingMessage(message); const eventDecision = evaluateConversationEvent({ conversationStatus: saved.conversation.status, eventDirection: "incoming", eventType: message.rawType || "text", humanReviewRequired: saved.conversation.attentionMode === "review_required", hasNewPatientMessage: message.source !== "recovery" && message.rawType !== "reaction", isReconnect: message.source === "recovery" }); const allowedByPhone = repository.shouldAllowAutomatedResponseForConversation(saved.conversation.id, message.waContactNumber || message.phone || ""); if (message.rawType === "audio" || message.rawType === "ptt") { const state = repository.getConversationState(saved.conversation.id); repository.updateConversationState(saved.conversation.id, { ...state, collected: { ...(state.collected || {}), _engineFacts: { ...(state.collected?._engineFacts || {}), unreviewedAudio: true } }, humanTransition: true }); } console.log("[Mensajes][SQLite] Mensaje entrante", { externalId: message.externalId, conversationId: saved.conversation.id, duplicate: Boolean(saved.duplicate), rawType: message.rawType || "text", source: message.source || "live", eventAction: eventDecision.action, automatedResponseAllowed: allowedByPhone }); if (saved.message?.id && !saved.duplicate && eventDecision.action === "analyze_incoming" && allowedByPhone) enqueueIncomingResponse(saved.conversation.id, saved.message.id, message.text); });
  if (typeof connector.onOutgoingMessage === "function") connector.onOutgoingMessage((message) => { repository.saveOutgoingMessage({ phone: message.phone, externalId: message.externalId, text: message.text, author: message.author || "human", messageAt: message.messageAt, waChatId: message.waChatId, waContactNumber: message.waContactNumber, waDisplayName: message.waDisplayName, rawType: message.rawType || "text", reactionTargetId: message.reactionTargetId || null, source: message.source || "live" }); });
  connector.onMessageStatus((status) => repository.updateMessageStatus(status.externalId, status.status, status.error));
  if (typeof connector.onStatus === "function") connector.onStatus((status) => { if (status.status === "connected") { connectedAtMs = Date.now(); console.log("[Mensajes] Conexion restaurada; no se reanudan respuestas ni recordatorios automaticamente"); for (const ms of [3000, 15000, 40000, 90000]) setTimeout(() => void refreshLidConversations(), ms).unref?.(); } });
  if (typeof connector.setTyping === "function") setTypingHandler((phone, enabled, options = {}) => connector.setTyping(phone, enabled, options));
  if (typeof connector.sendMessage === "function") setSendHandler(sendAiMessage);
  if (typeof connector.resolvePhoneForChatId === "function") setLidResolver((chatId) => connector.resolvePhoneForChatId(chatId));
  queueTimer = null;
  if (typeof connector.resolvePhoneForChatId === "function" && !lidRefreshTimer) {
    lidRefreshTimer = setInterval(() => void refreshLidConversations(), 60 * 1000);
    lidRefreshTimer.unref?.();
  }
  started = true;
  try {
    const merged = repository.reconcilePatientDuplicates();
    if (merged > 0) console.log("[Mensajes] Conversaciones duplicadas del mismo paciente fusionadas al arrancar", { merged });
  } catch (error) {
    console.warn("[Mensajes] No se pudieron reconciliar conversaciones duplicadas", { error: error?.message || String(error) });
  }
  if (simulationConnector.getStatus().status !== "connected") await simulationConnector.connect();
  if (simulatedConnector && connector.getStatus().status !== "connected") {
    console.log("[Mensajes][Simulado] Conectando automaticamente el conector de pruebas");
    await connector.connect();
  }
  return { connector, repository };
}
// Respaldo para los @lid que no se resolvieron al llegar el mensaje (getIndividualMeta ya lo hace en el
// primer mensaje). El lookup local es instantáneo y sin red: va en cada pasada. La consulta de red a
// WhatsApp, una vez cada 30 min por chat: del 2026-09-30 al 10-07 hizo 106 y ninguna resolvió (vacío o
// número extranjero), y repetirla cada minuto es tráfico automático contra la cuenta de la clínica.
// Una pasada a la vez: setInterval no espera, y una consulta de red puede tardar minutos.
const LID_NETWORK_RETRY_MS = 30 * 60 * 1000;
const lidNetworkTriedAt = new Map();
let refreshingLids = false;
async function refreshLidConversations() {
  if (refreshingLids || typeof connector.resolvePhoneForChatId !== "function") return;
  refreshingLids = true;
  try {
    for (const conversation of repository.listConversations({ limit: 200 })) {
      const chatId = conversation.waChatId;
      if (!chatId?.endsWith("@lid") || conversation.phoneResolved) continue;
      try {
        const network = Date.now() - (lidNetworkTriedAt.get(chatId) || 0) >= LID_NETWORK_RETRY_MS;
        if (network) lidNetworkTriedAt.set(chatId, Date.now());
        const phone = network ? await connector.resolvePhoneForChatId(chatId) : await connector.resolveLidPhoneLocal?.(chatId);
        if (phone && phone !== conversation.phone) { repository.updateWhatsAppContact(conversation.id, phone); lidNetworkTriedAt.delete(chatId); }
      } catch (error) {
        console.warn("[Mensajes][WhatsApp] No se pudo actualizar contacto LID", { conversationId: conversation.id, error: error?.message || String(error) });
      }
    }
  } finally {
    refreshingLids = false;
  }
}
async function connectConnector() { if (!started) await start(); return connector.connect(); }
async function stop() {
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  if (lidRefreshTimer) { clearInterval(lidRefreshTimer); lidRefreshTimer = null; }
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
        // Los recordatorios de cita pasan por esta misma cola (processReminder) pero son
        // texto automatico, no algo que un humano escribio: si quedan marcados author="human",
        // assistantContext los etiqueta como "promesa de recepcion" y la regla de
        // confirmar_asistencia (que exige que el ULTIMO mensaje sea un recordatorio propio)
        // nunca dispara cuando el paciente responde "si voy". idempotency_key los distingue
        // (reminder-<batchId>-<itemId> vs manual-<conversationId>-...). Las promociones
        // (promo-<batchId>-<itemId>) tampoco las escribio recepcion.
        const isReminder = /^(reminder|promo)-/.test(String(item.idempotency_key || ""));
        repository.saveOutgoingMessage({ phone: sent.phone || item.phone, externalId: sent.externalId, text: sent.text, author: isReminder ? "system" : "human", messageAt: sent.messageAt, waChatId: item.wa_chat_id || sent.waChatId, waContactNumber: sent.waContactNumber });
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
async function processReminder(batchId) { const batch = repository.getReminderBatch(batchId); if (!batch || ["cancelled", "completed", "completed_with_errors"].includes(batch.status)) return; if (connector.getStatus().status !== "connected") return; const item = repository.claimReminderItem(batchId); if (!item) { const final = repository.refreshReminderBatch(batchId); if (final && !final.items.some((x) => ["pending", "sending", "queued"].includes(x.status))) repository.db.prepare("UPDATE reminder_batches SET status=CASE WHEN failed_count>0 THEN 'completed_with_errors' ELSE 'completed' END, finished_at=datetime('now') WHERE id=?").run(batchId); reminderTimers.delete(batchId); return; } repository.db.prepare("UPDATE reminder_batches SET status='processing', started_at=COALESCE(started_at,datetime('now')), updated_at=datetime('now') WHERE id=?").run(batchId); try { const queued = repository.enqueueOutgoing(item.phone, item.content, `reminder-${batchId}-${item.id}`); repository.updateReminderItem(item.id, "queued", { queueId: queued?.id }); await flushOutgoingQueue(); const sent = queued && repository.db.prepare("SELECT status,last_error FROM outgoing_queue WHERE id=?").get(queued.id); if (sent?.status === "sent") { repository.updateReminderItem(item.id, "sent"); /* Recordatorio agrupado (familiares con el mismo número): el resto de las citas del grupo ya va en este mensaje. */ repository.db.prepare("UPDATE reminder_batch_items SET status='sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE batch_id=? AND id<>? AND phone=? AND content=? AND status='pending'").run(batchId, item.id, item.phone, item.content); } else if (sent?.status === "failed") repository.updateReminderItem(item.id, "failed", { error: sent.last_error || "Error de envío" }); else repository.updateReminderItem(item.id, "failed", { error: "No se pudo confirmar el envío" }); } catch (error) { repository.updateReminderItem(item.id, "failed", { error: error.message }); } repository.refreshReminderBatch(batchId); const next = repository.getReminderBatch(batchId); const remaining = next?.items.some((x) => x.status === "pending"); if (remaining && next.status !== "cancelled") { const delay = (next.min_delay_seconds + Math.random() * (next.max_delay_seconds - next.min_delay_seconds)) * 1000; const timer = setTimeout(() => void processReminder(batchId), delay); timer.unref?.(); reminderTimers.set(batchId, timer); } else { repository.db.prepare("UPDATE reminder_batches SET status=CASE WHEN failed_count>0 THEN 'completed_with_errors' ELSE 'completed' END, finished_at=datetime('now') WHERE id=?").run(batchId); reminderTimers.delete(batchId); } }
// Estado real de un envío de promoción según su fila en outgoing_queue (clave promo-<lote>-<item>).
function promoQueueRow(batchId, itemId) { return repository.db.prepare("SELECT id, status, last_error FROM outgoing_queue WHERE idempotency_key=?").get(`promo-${batchId}-${itemId}`); }
// Items que quedaron en 'sending'/'queued' (app reiniciada a mitad, o cola ocupada): se ajustan a lo que pasó
// de verdad. Sin fila en la cola nunca se envió -> vuelve a 'pending'. Con fila pendiente se deja 'queued'.
function reconcilePromoItems(batch) {
  for (const it of batch.items.filter((x) => x.status === "sending" || x.status === "queued")) {
    const row = promoQueueRow(batch.id, it.id);
    if (!row) repository.updatePromoItem(it.id, "pending");
    else if (row.status === "sent") repository.updatePromoItem(it.id, "sent", { queueId: row.id });
    else if (row.status === "failed" || row.status === "cancelled") repository.updatePromoItem(it.id, "failed", { queueId: row.id, error: row.last_error || "No se envió" });
  }
}
// Promociones: mismo ritmo que los recordatorios (un mensaje, pausa aleatoria, el siguiente).
async function processPromo(batchId) {
  let batch = repository.getPromoBatch(batchId);
  if (!batch || !["queued", "processing"].includes(batch.status)) { promoTimers.delete(batchId); return; }
  reconcilePromoItems(batch);
  if (connector.getStatus().status !== "connected") { promoTimers.delete(batchId); return; }
  const item = repository.claimPromoItem(batchId);
  if (!item) {
    batch = repository.refreshPromoBatch(batchId);
    // Si queda alguno 'queued' (en la cola de salida) no se cierra: se revisa de nuevo en un rato.
    if (batch.items.some((x) => x.status === "queued")) { const timer = setTimeout(() => void processPromo(batchId), 15000); timer.unref?.(); promoTimers.set(batchId, timer); return; }
    repository.finishPromoBatch(batchId); promoTimers.delete(batchId); return;
  }
  repository.db.prepare("UPDATE promo_batches SET status='processing', started_at=COALESCE(started_at,datetime('now')), updated_at=datetime('now') WHERE id=? AND status IN ('queued','processing')").run(batchId);
  try {
    const queued = repository.enqueueOutgoing(item.phone, item.content, `promo-${batchId}-${item.id}`);
    repository.updatePromoItem(item.id, "queued", { queueId: queued?.id });
    // flushOutgoingQueue devuelve el vaciado que ya estuviera en curso, que puede no incluir esta fila:
    // se reintenta unas veces antes de decidir. Nunca se marca 'failed' algo que todavía puede salir.
    let row = null;
    for (let i = 0; i < 6; i++) {
      await flushOutgoingQueue();
      row = queued && repository.db.prepare("SELECT status,last_error FROM outgoing_queue WHERE id=?").get(queued.id);
      if (!row || ["sent", "failed"].includes(row.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (row?.status === "sent") repository.updatePromoItem(item.id, "sent");
    else if (row?.status === "failed") repository.updatePromoItem(item.id, "failed", { error: row.last_error || "Error de envío" });
    // Sigue pendiente (WhatsApp ocupado o desconectado): se retira de la cola para que no salga más tarde
    // sin registro. Si ya la tomó un envío en curso, queda 'queued' y la reconciliación la cierra.
    else if (queued && repository.db.prepare("UPDATE outgoing_queue SET status='cancelled', last_error='No se envió: WhatsApp ocupado o desconectado', updated_at=datetime('now') WHERE id=? AND status='pending'").run(queued.id).changes) repository.updatePromoItem(item.id, "failed", { error: "No se envió: WhatsApp ocupado o desconectado" });
  } catch (error) {
    // Error antes de encolar (o al leer la cola): si no hay fila en la cola no salió nada.
    if (!promoQueueRow(batchId, item.id)) repository.updatePromoItem(item.id, "failed", { error: error.message });
  }
  const next = repository.refreshPromoBatch(batchId);
  if (next?.status !== "cancelled" && next?.items.some((x) => ["pending", "queued"].includes(x.status))) {
    const delay = (next.min_delay_seconds + Math.random() * (next.max_delay_seconds - next.min_delay_seconds)) * 1000;
    const timer = setTimeout(() => void processPromo(batchId), delay); timer.unref?.(); promoTimers.set(batchId, timer);
  } else { repository.finishPromoBatch(batchId); promoTimers.delete(batchId); }
}
function startPromoBatch(batchId) { if (promoTimers.has(batchId)) return; promoTimers.set(batchId, null); void processPromo(batchId); }
function startReminderBatch(batchId) { if (reminderTimers.has(batchId)) return; void processReminder(batchId); }
function getRuntime() { return { connector, repository, started }; }
function getMetrics() { const memory = process.memoryUsage(); return { started, connector: connector.getStatus(), process: { uptimeSeconds: Math.round(process.uptime()), rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal }, queue: { pending: repository.listPendingOutgoing(100).length } }; }
module.exports = { start, stop, connectConnector, disconnectConnector, clearConnectorSession, getRuntime: () => ({ connector, repository, started, startReminderBatch, startPromoBatch }), getMetrics, sendQueuedMessage, flushOutgoingQueue, startReminderBatch, startPromoBatch };
