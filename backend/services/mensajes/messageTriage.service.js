"use strict";

// Guardia determinista de revisión humana.
// Solo cubre los mensajes que el asistente NO puede procesar: audio, imágenes,
// documentos, video y stickers. Esos pasan a recepción sin que la IA responda.
// El resto de condiciones (urgencia, quejas, pedir hablar con una persona, etc.)
// las decide el agente con el texto libre de "Revisión humana"; ver
// buildAssistantContext y la herramienta transferir_a_recepcion.

const AUDIO_TYPES = ["audio", "ptt", "voice"];
const MEDIA_TYPES = ["image", "photo", "document", "video", "sticker"];

/**
 * @param {string} _text  (sin uso: la detección por contenido la hace el agente)
 * @param {{ messageType?: string }} options
 * @returns {{ humanReview: boolean, reason?: string, ruleId?: string }}
 */
function triageMessage(_text, options = {}) {
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
