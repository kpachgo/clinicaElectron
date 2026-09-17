/**
 * Contrato interno para cualquier conector de mensajería.
 *
 * Los adaptadores (simulado, WhatsApp Web u otro proveedor) deben implementar
 * estos métodos y emitir únicamente eventos normalizados.
 */

const CONNECTOR_STATUSES = Object.freeze([
  "disconnected",
  "initializing",
  "connecting",
  "qr",
  "authenticated",
  "syncing",
  "connected",
  "reconnecting",
  "auth_failure",
  "error"
]);

const MESSAGE_DIRECTIONS = Object.freeze(["incoming", "outgoing"]);

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} debe ser un texto no vacio`);
  }
  return value.trim();
}

function normalizePhone(phone) {
  const normalized = String(phone || "").replace(/\D/g, "");
  if (normalized.length < 7) {
    throw new TypeError("phone debe contener al menos 7 digitos");
  }
  return normalized;
}

function normalizeIncomingMessage(event) {
  const source = event || {};
  const direction = source.direction || "incoming";
  if (!MESSAGE_DIRECTIONS.includes(direction)) {
    throw new TypeError("direction de mensaje invalida");
  }

  return Object.freeze({
    externalId: assertNonEmptyString(source.externalId, "externalId"),
    phone: source.phone ? normalizePhone(source.phone) : (source.waChatId ? null : normalizePhone(source.phone)),
    waChatId: source.waChatId ? assertNonEmptyString(source.waChatId, "waChatId") : null,
    waContactNumber: source.waContactNumber ? normalizePhone(source.waContactNumber) : null,
    waDisplayName: source.waDisplayName ? String(source.waDisplayName).trim() : null,
    author: source.author ? String(source.author).trim() : null,
    text: assertNonEmptyString(source.text, "text"),
    direction,
    messageAt: source.messageAt ? new Date(source.messageAt).toISOString() : new Date().toISOString(),
    rawType: source.rawType ? String(source.rawType) : "text",
    reactionTargetId: source.reactionTargetId ? String(source.reactionTargetId) : null,
    mediaPath: source.mediaPath ? String(source.mediaPath) : null,
    mediaMimeType: source.mediaMimeType ? String(source.mediaMimeType) : null,
    source: source.source ? String(source.source) : "live"
  });
}

function normalizeMessageStatus(event) {
  const source = event || {};
  const status = assertNonEmptyString(source.status, "status");
  return Object.freeze({
    externalId: assertNonEmptyString(source.externalId, "externalId"),
    phone: normalizePhone(source.phone),
    status,
    error: source.error ? String(source.error) : null,
    updatedAt: source.updatedAt ? new Date(source.updatedAt).toISOString() : new Date().toISOString()
  });
}

class MessagingConnector {
  async connect() {
    throw new Error("El adaptador debe implementar connect()");
  }

  async disconnect() {
    throw new Error("El adaptador debe implementar disconnect()");
  }

  getStatus() {
    throw new Error("El adaptador debe implementar getStatus()");
  }

  async sendMessage(_phone, _text) {
    throw new Error("El adaptador debe implementar sendMessage()");
  }

  onIncomingMessage(_handler) {
    throw new Error("El adaptador debe implementar onIncomingMessage()");
  }

  onOutgoingMessage(_handler) {
    throw new Error("El adaptador debe implementar onOutgoingMessage()");
  }

  onMessageStatus(_handler) {
    throw new Error("El adaptador debe implementar onMessageStatus()");
  }
}

function assertConnectorStatus(status) {
  if (!CONNECTOR_STATUSES.includes(status)) {
    throw new TypeError(`Estado de conector invalido: ${status}`);
  }
  return status;
}

module.exports = {
  CONNECTOR_STATUSES,
  MESSAGE_DIRECTIONS,
  MessagingConnector,
  assertConnectorStatus,
  normalizeIncomingMessage,
  normalizeMessageStatus,
  normalizePhone
};
