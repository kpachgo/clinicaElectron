const { EventEmitter } = require("events");
const {
  MessagingConnector,
  assertConnectorStatus,
  normalizeIncomingMessage,
  normalizeMessageStatus,
  normalizePhone
} = require("./messagingConnector");

/**
 * Conector en memoria para pruebas de Mensajes.
 * No guarda datos ni conoce SQLite, MySQL o la interfaz de usuario.
 */
class SimulatedMessagingConnector extends MessagingConnector {
  constructor(options = {}) {
    super();
    this.events = new EventEmitter();
    this.status = "disconnected";
    this.sentMessages = [];
    this.sequence = 0;
    this.instanceId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sendError = null;
    this.connectDelayMs = Number(options.connectDelayMs || 0);
  }

  async connect() {
    if (this.status === "connected") return this.getStatus();
    this.status = "connecting";
    this.events.emit("status", this.getStatus());
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    this.status = "connected";
    this.events.emit("status", this.getStatus());
    return this.getStatus();
  }

  async disconnect() {
    this.status = "disconnected";
    this.events.emit("status", this.getStatus());
    return this.getStatus();
  }

  getStatus() {
    return Object.freeze({
      status: assertConnectorStatus(this.status),
      simulated: true,
      sentCount: this.sentMessages.length
    });
  }

  async sendMessage(phone, text) {
    if (this.status !== "connected") {
      throw new Error("El conector simulado no esta conectado");
    }
    const normalizedPhone = normalizePhone(phone);
    if (typeof text !== "string" || !text.trim()) {
      throw new TypeError("text debe ser un texto no vacio");
    }
    if (this.sendError) {
      const error = this.sendError instanceof Error ? this.sendError : new Error(String(this.sendError));
      this.sendError = null;
      const failed = normalizeMessageStatus({
        externalId: `${this.instanceId}-out-${++this.sequence}`,
        phone: normalizedPhone,
        status: "failed",
        error: error.message
      });
      this.events.emit("messageStatus", failed);
      throw error;
    }
    const message = normalizeIncomingMessage({
      externalId: `${this.instanceId}-out-${++this.sequence}`,
      phone: normalizedPhone,
      text,
      direction: "outgoing"
    });
    this.sentMessages.push(message);
    this.events.emit("messageStatus", normalizeMessageStatus({
      externalId: message.externalId,
      phone: normalizedPhone,
      status: "sent"
    }));
    return message;
  }

  onIncomingMessage(handler) {
    if (typeof handler !== "function") throw new TypeError("handler debe ser una funcion");
    this.events.on("incomingMessage", handler);
    return () => this.events.off("incomingMessage", handler);
  }

  onOutgoingMessage(handler) {
    if (typeof handler !== "function") throw new TypeError("handler debe ser una funcion");
    this.events.on("outgoingMessage", handler);
    return () => this.events.off("outgoingMessage", handler);
  }

  onMessageStatus(handler) {
    if (typeof handler !== "function") throw new TypeError("handler debe ser una funcion");
    this.events.on("messageStatus", handler);
    return () => this.events.off("messageStatus", handler);
  }

  injectIncomingMessage(event) {
    if (this.status !== "connected") {
      throw new Error("El conector simulado no esta conectado");
    }
    const message = normalizeIncomingMessage(event);
    this.events.emit("incomingMessage", message);
    return message;
  }

  failNextSend(error = "Error simulado de envio") {
    this.sendError = error;
  }

  clearSentMessages() {
    this.sentMessages.length = 0;
  }
}

module.exports = { SimulatedMessagingConnector };
