"use strict";

// Triage minimo: decide unicamente si un mensaje debe ir a revision humana.
// No clasifica intencion ni extrae hechos. Respeta los toggles de human_review_rules.

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CHECKS = {
  audio(value, type) {
    return ["audio", "ptt", "voice"].includes(type)
      ? { reason: "El paciente envió un mensaje de audio" }
      : null;
  },
  media(value, type) {
    return ["image", "photo", "document", "video", "sticker"].includes(type)
      ? { reason: "El paciente envió una imagen o documento" }
      : null;
  },
  urgency(value) {
    return /\b(dolor (muy )?fuerte|mucho dolor|me duele mucho|no aguanto el dolor|sangra|sangrado|sangrando|inflamad|hinchad|infeccion|absceso|urgencia|emergencia|se me (rompio|quebro|cayo|partio) (un |una )?(diente|muela|corona)|golpe en (el diente|la boca)|trauma)\b/.test(value)
      ? { reason: "Posible urgencia o síntoma clínico" }
      : null;
  },
  discontent(value) {
    return /\b(molest|inconform|queja|reclamo|reclamar|no me responden|nadie me responde|pesimo|malisimo|terrible|indignad|estafa|denuncia)\b/.test(value)
      ? { reason: "El paciente expresó molestia o insatisfacción" }
      : null;
  },
  "human-request"(value) {
    return /\b(hablar con (una persona|alguien|un humano|recepcion|un recepcionista|un doctor|una doctora|un asesor|un encargado|un agente)|que me atienda una persona|comuniquenme con|quiero (hablar con )?una persona real|pasame con)\b/.test(value)
      ? { reason: "El paciente pidió hablar con una persona" }
      : null;
  }
};

/**
 * @param {string} text
 * @param {{ messageType?: string, rules?: Array<{id:string,label:string,enabled:number|boolean}> }} options
 * @returns {{ humanReview: boolean, reason?: string, ruleId?: string }}
 */
function triageMessage(text, options = {}) {
  const value = normalize(text);
  const type = String(options.messageType || "text").toLowerCase();
  const enabled = new Set((options.rules || []).filter((rule) => rule && (rule.enabled === 1 || rule.enabled === true)).map((rule) => rule.id));
  for (const [ruleId, check] of Object.entries(CHECKS)) {
    if (!enabled.has(ruleId)) continue;
    const hit = check(value, type);
    if (hit) return { humanReview: true, reason: hit.reason, ruleId };
  }
  return { humanReview: false };
}

module.exports = { triageMessage, normalize };
