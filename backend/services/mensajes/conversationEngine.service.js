"use strict";

// Solo eventos de conversacion. El motor de intenciones por regex, la extraccion
// de hechos y las maquinas de estado se retiraron: el agente con herramientas
// (assistantAgent.service.js) hace ese trabajo. mensajesRuntime usa este modulo
// unicamente para decidir si un evento entrante dispara analisis de la IA.

/**
 * La reconexion solo restaura estado persistido. Nunca debe disparar respuestas,
 * seguimientos atrasados ni reactivar conversaciones antiguas.
 */
function evaluateReconnect() {
  return {
    action: "restore_only",
    sendMessage: false,
    runFollowUps: false,
    reason: "connection_restored_without_new_patient_message"
  };
}

/**
 * Decide si un evento puede activar el analisis de la IA.
 * Es deliberadamente independiente de WhatsApp y de la base de datos.
 */
function evaluateConversationEvent({
  conversationStatus = "active",
  eventDirection,
  eventType = "text",
  humanReviewRequired = false,
  lastMessageDirection,
  hasNewPatientMessage = false,
  isReconnect = false
} = {}) {
  if (isReconnect) return evaluateReconnect();
  if (!hasNewPatientMessage) return { action: "record_only", sendMessage: false, reason: "no_new_patient_message" };
  if (eventDirection !== "incoming") return { action: "record_only", sendMessage: false, reason: "event_is_not_patient_message" };
  if (eventType === "reaction") return { action: "record_only", sendMessage: false, reason: "reaction_is_not_new_request" };
  if (humanReviewRequired) return { action: "human_review", sendMessage: false, reason: "human_attention_required" };
  if (["paused", "human_review"].includes(conversationStatus)) return { action: "record_only", sendMessage: false, reason: "conversation_not_available_for_ai" };
  return {
    action: "analyze_incoming",
    sendMessage: false,
    reopenConversation: ["completed", "stale"].includes(conversationStatus),
    previousMessageDirection: lastMessageDirection || null,
    reason: "new_patient_message"
  };
}

module.exports = { evaluateConversationEvent, evaluateReconnect };
