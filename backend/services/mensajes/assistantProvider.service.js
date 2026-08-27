"use strict";

// Transporte hacia el proveedor IA. Normaliza dos estrategias a la misma forma:
//   requestTurn() -> { replyText, toolCalls: [{ id, name, args }], assistantEcho }
//
// - "native": envia `tools` en formato OpenAI y parsea message.tool_calls.
// - "json":   no envia `tools`; instruye un protocolo JSON y parsea el contenido.
//
// El loop del agente no distingue: solo usa buildInitialMessages / requestTurn /
// appendToolResults, y estas funciones aplican la estrategia correcta.

function strategyFor(cfg) {
  const forced = String(cfg?.toolStrategy || "").toLowerCase();
  if (forced === "native" || forced === "json") return forced;
  return cfg?.providerMode === "cloud" ? "native" : "json";
}

function toOpenAiTool(spec) {
  return { type: "function", function: { name: spec.name, description: spec.description, parameters: spec.parameters || { type: "object", properties: {} } } };
}

function jsonProtocolBlock(toolSpecs) {
  const list = toolSpecs.map((spec) => {
    const props = Object.entries(spec.parameters?.properties || {}).map(([key, value]) => {
      const req = (spec.parameters?.required || []).includes(key) ? "" : "?";
      return `${key}${req}`;
    });
    return `- ${spec.name}(${props.join(", ")}): ${spec.description}`;
  }).join("\n");
  return [
    "PROTOCOLO DE RESPUESTA (obligatorio). Respondé SIEMPRE con un único objeto JSON, sin texto adicional, sin markdown.",
    "Para usar una herramienta:",
    '{"herramienta": "<nombre>", "parametros": { ... }}',
    "Para hablar con el paciente:",
    '{"responder": "<texto para el paciente>"}',
    "",
    "Herramientas disponibles:",
    list
  ].join("\n");
}

function extractJsonObject(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function buildInitialMessages({ systemBlocks, history, toolSpecs, strategy }) {
  const blocks = [...systemBlocks];
  if (strategy === "json") blocks.push(jsonProtocolBlock(toolSpecs));
  return [{ role: "system", content: blocks.join("\n\n") }, ...history];
}

async function callProvider({ cfg, payload, signal }) {
  const controller = signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), Number(cfg.timeoutMs) || 30000) : null;
  try {
    const response = await fetch(`${String(cfg.baseUrl).replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify(payload),
      signal: signal || controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Proveedor IA HTTP ${response.status}: ${body.error?.message || body.message || "respuesta no válida"}`);
      error.code = "AI_PROVIDER_HTTP_ERROR";
      throw error;
    }
    return body;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function requestTurn({ messages, toolSpecs, cfg, strategy, signal }) {
  const mode = strategy || strategyFor(cfg);
  const payload = { model: cfg.model, temperature: mode === "json" ? 0.15 : 0.3, messages };
  if (mode === "native") {
    payload.tools = toolSpecs.map(toOpenAiTool);
    payload.tool_choice = "auto";
  } else {
    payload.response_format = { type: "json_object" };
  }

  const body = await callProvider({ cfg, payload, signal });
  const message = body.choices?.[0]?.message || {};

  if (mode === "native") {
    const toolCalls = (message.tool_calls || []).map((call) => {
      let args = {};
      try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }
      return { id: call.id, name: call.function?.name, args };
    });
    return { replyText: toolCalls.length ? null : (message.content || "").trim(), toolCalls, assistantEcho: message };
  }

  const parsed = extractJsonObject(message.content);
  if (parsed && typeof parsed.herramienta === "string") {
    return {
      replyText: null,
      toolCalls: [{ id: `json-${Date.now()}`, name: parsed.herramienta, args: parsed.parametros && typeof parsed.parametros === "object" ? parsed.parametros : {} }],
      assistantEcho: { role: "assistant", content: message.content || "" }
    };
  }
  const reply = parsed && typeof parsed.responder === "string" ? parsed.responder : (message.content || "").trim();
  return { replyText: reply, toolCalls: [], assistantEcho: { role: "assistant", content: message.content || "" } };
}

function appendToolResults(messages, assistantEcho, results, strategy) {
  const mode = strategy || "json";
  if (mode === "native") {
    const next = [...messages, assistantEcho];
    for (const item of results) {
      next.push({ role: "tool", tool_call_id: item.call.id, content: JSON.stringify(item.result) });
    }
    return next;
  }
  const summary = results.map((item) => `- ${item.call.name}: ${JSON.stringify(item.result)}`).join("\n");
  return [
    ...messages,
    assistantEcho,
    { role: "user", content: `Resultado de las herramientas:\n${summary}\n\nContinuá con el siguiente paso usando el mismo formato JSON.` }
  ];
}

module.exports = { strategyFor, buildInitialMessages, requestTurn, appendToolResults, extractJsonObject };
