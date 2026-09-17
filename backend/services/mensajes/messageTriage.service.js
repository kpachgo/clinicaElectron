"use strict";

// Guardia determinista de revisión humana.
// Cubre dos casos donde no tiene sentido dejar que el agente improvise:
// 1) mensajes que el asistente NO puede procesar (audio, imágenes, documentos,
//    video, stickers).
// 2) una confirmación/negación breve ("sí", "no podré", "ok gracias") que llega
//    por un chat todavía sin vincular (LID de WhatsApp sin resolver a teléfono)
//    y que nunca tuvo un mensaje saliente propio: el recordatorio que el
//    paciente está contestando vive en OTRA conversación (la ya vinculada al
//    teléfono), así que acá no hay forma de saber a qué está respondiendo.
//    Pasa la libreria de WhatsApp resolviendo ese LID en segundo plano
//    (refreshLidConversations, cada 60s); mientras tanto, mejor esperar que
//    inventar. Aplica igual para respuestas positivas y negativas.
// El resto de condiciones (urgencia, quejas, pedir hablar con una persona, etc.)
// las decide el agente con el texto libre de "Revisión humana"; ver
// buildAssistantContext y la herramienta transferir_a_recepcion.

const AUDIO_TYPES = ["audio", "ptt", "voice"];
const MEDIA_TYPES = ["image", "photo", "document", "video", "sticker"];

// Coincidencia exacta (todo el mensaje, no una palabra suelta dentro de uno más
// largo) para no atrapar preguntas reales que de casualidad empiecen con "sí" o "no".
const BARE_CONFIRMATION_REPLIES = new Set([
  "si", "sii", "siii", "sip", "simon", "dale", "ok", "okay", "okey", "oka",
  "vale", "listo", "lista", "perfecto", "claro", "confirmado", "de acuerdo",
  "esta bien", "ahi estare", "ahi voy a estar", "primero dios", "amen",
  "gracias", "ok gracias", "muchas gracias", "va", "de una",
  "no", "no puedo", "no podre", "no podre ir", "no ire", "no voy",
  "no asistire", "no gracias", "tampoco", "cancelo", "cancelar",
  "no se va a poder", "no se puede", "lo siento no", "no podre asistir",
  "👍", "👌", "✅"
]);

function normalizeBareReply(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[¡!¿?.,]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} text  contenido consolidado del turno entrante
 * @param {{ messageType?: string, phoneResolved?: boolean, hasOutboundContext?: boolean }} options
 * @returns {{ humanReview: boolean, reason?: string, ruleId?: string }}
 */
function triageMessage(text, options = {}) {
  const type = String(options.messageType || "text").toLowerCase();
  if (AUDIO_TYPES.includes(type)) {
    return { humanReview: true, reason: "El paciente envió un mensaje de audio", ruleId: "audio" };
  }
  if (MEDIA_TYPES.includes(type)) {
    return { humanReview: true, reason: "El paciente envió una imagen o documento", ruleId: "media" };
  }
  if (options.phoneResolved === false && !options.hasOutboundContext) {
    const normalized = normalizeBareReply(text);
    if (normalized && BARE_CONFIRMATION_REPLIES.has(normalized)) {
      return {
        humanReview: true,
        reason: "El paciente respondió una confirmación breve pero este chat aún no está vinculado (LID de WhatsApp sin resolver) y no hay nada en esta conversación que explique a qué responde",
        ruleId: "bare_reply_unlinked_chat"
      };
    }
  }
  return { humanReview: false };
}

module.exports = { triageMessage };
