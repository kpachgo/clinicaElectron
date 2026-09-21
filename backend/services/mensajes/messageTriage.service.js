"use strict";

// Guardia determinista de revisión humana para mensajes que el asistente NO puede
// procesar (audio, imágenes, documentos, video, stickers).
// El resto de condiciones (urgencia, quejas, pedir hablar con una persona, etc.)
// las decide el agente con el texto libre de "Revisión humana"; ver
// buildAssistantContext y la herramienta transferir_a_recepcion.
// La espera por un chat @lid sin resolver NO vive acá: se decide por estado de la
// conversación, no por el texto del mensaje (ver aiObserver.processBatch).

const AUDIO_TYPES = ["audio", "ptt", "voice"];
const MEDIA_TYPES = ["image", "photo", "document", "video", "sticker"];

/**
 * @param {string} text  contenido consolidado del turno entrante
 * @param {{ messageType?: string }} options
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
  return { humanReview: false };
}

module.exports = { triageMessage };
