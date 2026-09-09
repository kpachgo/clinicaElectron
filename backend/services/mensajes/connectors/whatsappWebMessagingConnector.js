const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");
const { Client, LocalAuth, Message } = require("whatsapp-web.js");
const {
  MessagingConnector,
  assertConnectorStatus,
  normalizeIncomingMessage,
  normalizeMessageStatus,
  normalizePhone
} = require("./messagingConnector");

const USER_CHAT_SUFFIX = "@c.us";
const IGNORED_CHAT_IDS = new Set(["status@broadcast"]);
// Agenda guarda normalmente los teléfonos salvadoreños como 8 dígitos.
// Solo el destino de WhatsApp necesita el código de país; no modificamos
// el teléfono persistido ni el usado para buscar pacientes.
function whatsappDestinationPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 8 ? `503${digits}` : digits;
}

function persistedPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("503") && digits.length === 11 ? digits.slice(3) : digits;
}

// Un LID tiene 13-16 digitos y pasa cualquier chequeo generico de "esto parece un
// telefono". La agenda y el expediente usan el numero local salvadoreno de 8
// digitos (11 con el prefijo 503), asi que ese es el unico formato que aceptamos
// como identidad de una conversacion. Todo lo demas queda sin resolver hasta que
// WhatsApp devuelva el numero real.
function isRealPhone(value) {
  return persistedPhone(value).length === 8;
}

// WhatsApp multi-dispositivo agrega un sufijo ":<n>" al JID del remitente
// cuando el contacto tiene un dispositivo vinculado (frecuente en @lid).
// El chat en si nunca lleva ese sufijo; si se cuela, cada mensaje crea una
// conversacion nueva y las vinculaciones de paciente dejan de coincidir.
function stripDeviceSuffix(chatId) {
  const raw = String(chatId || "");
  const at = raw.indexOf("@");
  if (at === -1) return raw;
  const colon = raw.indexOf(":");
  return colon !== -1 && colon < at ? raw.slice(0, colon) + raw.slice(at) : raw;
}

class WhatsAppWebMessagingConnector extends MessagingConnector {
  constructor(options = {}) {
    super();
    this.authPath = path.resolve(options.authPath);
    this.clientId = options.clientId || "clinica-electron";
    this.headless = options.headless === true ? true : false;
    this.events = new EventEmitter();
    this.client = null;
    this.status = "disconnected";
    this.error = null;
    this.qrAvailable = false;
    this.authenticated = false;
    this.initializing = null;
    this.knownOutgoingIds = new Set();
    this.pendingOutgoingKeys = new Set();
    this.pendingOutgoingBodies = new Map();
    this.inFlightOutgoing = new Map();
    this.stateProbeTimer = null;
    this.inboundRecoveryTimers = new Set();
    this.inboundRecoveryRunning = false;
    this.inboundRecoveryStarted = false;
    this.cleanupTimers = new Set();
    this.instanceId = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  emitStatus(status, extra = {}) {
    this.status = assertConnectorStatus(status);
    this.events.emit("status", this.getStatus(extra));
  }

  getStatus(extra = {}) {
    return Object.freeze({
      status: assertConnectorStatus(this.status),
      authenticated: this.authenticated,
      qrAvailable: this.qrAvailable,
      error: this.error,
      sessionPath: this.authPath,
      ...extra
    });
  }

  async connect() {
    if (this.status === "connected" || this.status === "authenticated" || this.status === "syncing") return this.getStatus();
    if (this.initializing) return this.initializing;

    if (this.client) await this.disconnect();
    this.error = null;
    this.qrAvailable = false;
    this.emitStatus("initializing");
    this.initializing = this.initializeClient().catch(() => this.getStatus()).finally(() => { this.initializing = null; });
    return this.getStatus();
  }

  async initializeClient() {
    fs.mkdirSync(this.authPath, { recursive: true });
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: this.clientId, dataPath: this.authPath }),
      puppeteer: {
        headless: this.headless,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      }
    });
    this.client = client;
    this.bindClientEvents(client);
    try {
      await client.initialize();
      return this.getStatus();
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  bindClientEvents(client) {
    client.on("qr", () => {
      this.qrAvailable = true;
      this.emitStatus("qr");
    });
    client.on("loading_screen", (percent, message) => {
      if (!this.authenticated) this.emitStatus("syncing", { loadingPercent: percent, loadingMessage: message });
    });
    client.on("authenticated", () => {
      this.authenticated = true;
      this.qrAvailable = false;
      this.emitStatus("authenticated");
      this.schedulePageCleanup(client);
      this.startStateProbe(client);
    });
    client.on("ready", () => {
      this.stopStateProbe();
      this.error = null;
      this.qrAvailable = false;
      this.emitStatus("connected", { account: client.info?.pushname || null, phone: client.info?.wid?.user || null });
      this.startInboundRecovery(client);
    });
    client.on("auth_failure", (message) => {
      this.authenticated = false;
      this.handleError(new Error(String(message || "Fallo de autenticacion")), "auth_failure");
    });
    client.on("disconnected", (reason) => {
      this.stopStateProbe();
      this.stopInboundRecovery();
      this.authenticated = false;
      this.emitStatus("disconnected", { reason: String(reason || "Desconectado") });
    });
    client.on("change_state", (state) => {
      if (this.status !== "connected") this.emitStatus("reconnecting", { whatsappState: state });
    });
    client.on("message", (message) => void this.handleIncoming(message, "message"));
    client.on("message_create", (message) => {
      if (message?.fromMe) void this.handleOutgoing(message);
      else void this.handleIncoming(message, "message_create");
    });
    client.on("message_reaction", (reaction) => void this.handleReaction(reaction));
  }

  startStateProbe(client) {
    this.stopStateProbe();
    this.stateProbeTimer = setInterval(async () => {
      if (this.client !== client || ["connected", "disconnected", "error"].includes(this.status)) return;
      try {
        const state = await client.getState();
        if (state === "CONNECTED") {
          this.stopStateProbe();
          this.error = null;
          this.emitStatus("connected", { whatsappState: state, account: client.info?.pushname || null, phone: client.info?.wid?.user || null });
          this.startInboundRecovery(client);
        }
      } catch (error) {
        this.handleError(error);
        this.stopStateProbe();
      }
    }, 2000);
    this.stateProbeTimer.unref?.();
  }

  stopStateProbe() {
    if (this.stateProbeTimer) clearInterval(this.stateProbeTimer);
    this.stateProbeTimer = null;
  }

  // Recuperacion de una sola pasada al conectar: trae SOLO los chats con
  // mensajes sin leer (unreadCount). No es un poll continuo; se agenda un
  // pequeno set de pasadas por si WhatsApp Web todavia esta sincronizando el
  // historial cuando emitimos "connected".
  startInboundRecovery(client) {
    if (this.inboundRecoveryStarted && this.client === client) return;
    this.stopInboundRecovery();
    this.inboundRecoveryStarted = true;
    const runPass = async () => {
      if (this.client !== client || this.status !== "connected" || this.inboundRecoveryRunning) return;
      this.inboundRecoveryRunning = true;
      try {
        // Ni client.getChats() ni client.getChatById() sirven aca: ambos pasan
        // por getChatModel()/findOrCreateLatestChat, que revienta ('r') para los
        // chats @lid (que son casi todos los no leidos). Tampoco getMessageById:
        // el _serialized del MsgKey de esos mensajes viene null. Serializamos los
        // mensajes DENTRO del Store con getMessageModel() y devolvemos los modelos
        // ya planos, sin tocar el Chat. Traemos las ultimas HISTORY_LIMIT lineas
        // de cada chat no leido (no solo unreadCount) para que recepcion / la IA
        // tengan el hilo con contexto, incluidas las respuestas salientes.
        const HISTORY_LIMIT = 40;
        const { models, debug } = await client.pupPage.evaluate(async (max) => {
          const out = [];
          const debug = [];
          const arr = window.require("WAWebCollections").Chat.getModelsArray();
          const loader = (() => { try { return window.require("WAWebChatLoadMessages"); } catch (e) { return null; } })();
          const apiContact = (() => { try { return window.require("WAWebApiContact"); } catch (e) { return null; } })();
          for (const c of arr) {
            if (!c || c.isGroup || !c.id) continue;
            const id = c.id._serialized;
            if (id === "status@broadcast" || /@(g\.us|newsletter|broadcast)$/.test(id)) continue;
            // WhatsApp usa unreadCount === -1 (o markedAsUnread) cuando el chat se
            // marca "no leido" a mano sin mensajes nuevos: tambien cuenta.
            const uc = Number(c.unreadCount || 0);
            const marcadoNoLeido = uc === -1 || c.markedAsUnread === true || c.markedUnread === true;
            if (uc <= 0 && !marcadoNoLeido) continue;
            const getMsgs = () => (c.msgs && typeof c.msgs.getModelsArray === "function" ? c.msgs.getModelsArray() : []);
            const enCacheInicial = getMsgs().length;
            // Traer historial anterior sin resolver el Chat serializado (que
            // revienta para @lid): loadEarlierMsgs opera sobre el chat crudo.
            if (loader && typeof loader.loadEarlierMsgs === "function") {
              for (let i = 0; i < 6 && getMsgs().length < max; i++) {
                try {
                  const loaded = await loader.loadEarlierMsgs({ chat: c });
                  if (!loaded || !loaded.length) break;
                } catch (e) { break; }
              }
            }
            const msgs = getMsgs();
            // Teléfono real del @lid, resuelto acá mismo (sincrónico, sin red):
            // así el mensaje importado ya trae el número y la fusión ocurre al
            // guardarlo, sin ventana de conversación duplicada.
            let lidPhone = null;
            if (id.endsWith("@lid") && apiContact) {
              try { const p = apiContact.getPhoneNumber(c.id); lidPhone = p && (p._serialized || (p.user ? p.user + "@c.us" : null)); } catch (e) { /* no disponible */ }
            }
            debug.push({ id, unreadCount: c.unreadCount, markedAsUnread: c.markedAsUnread, enCacheInicial, enCache: msgs.length, lidPhone: lidPhone || null });
            const pick = msgs.filter((m) => m && !m.isNotification && m.id).slice(-max);
            for (const m of pick) {
              try { const mm = window.WWebJS.getMessageModel(m); if (lidPhone) mm.__lidPhone = lidPhone; out.push(mm); } catch (e) { /* mensaje suelto que no serializa: lo agarra el path en vivo */ }
            }
          }
          return { models: out, debug };
        }, HISTORY_LIMIT);
        const entrantes = models.filter((m) => !m?.id?.fromMe).length;
        console.log("[Mensajes][WhatsApp] Recuperacion no leidos: pasada", { chats: debug.length, mensajes: models.length, entrantes, salientes: models.length - entrantes });
        for (const model of models) {
          if (this.client !== client || this.status !== "connected") break;
          try {
            const message = new Message(client, model);
            if (model.__lidPhone) message.__recoveryLidPhone = model.__lidPhone;
            const text = String(message.body || "").trim();
            if (!text) continue;
            if (message.fromMe) {
              const meta = await this.getIndividualMeta(message, "outgoing");
              if (!meta || meta.discarded) continue;
              this.events.emit("outgoingMessage", normalizeIncomingMessage({
                externalId: this.getDirectExternalId(message) || `${this.instanceId}-recovery-out-${crypto.createHash("sha1").update(`${meta.waChatId}|${text}|${message.timestamp || ""}`).digest("hex")}`,
                ...meta,
                text,
                direction: "outgoing",
                author: "human",
                messageAt: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : new Date().toISOString(),
                rawType: message.type || "text",
                reactionTargetId: null,
                source: "recovery"
              }));
            } else {
              await this.handleIncoming(message, "recovery");
            }
          } catch (msgError) {
            console.warn("[Mensajes][WhatsApp] Recuperacion no leidos: mensaje fallido", { error: msgError?.message || String(msgError) });
          }
        }
      } catch (error) {
        console.error("[Mensajes][WhatsApp] Recuperacion de mensajes no disponible", {
          message: error?.message || String(error),
          stack: error?.stack || null
        });
      } finally {
        this.inboundRecoveryRunning = false;
      }
    };
    for (const delay of [0, 5000, 15000, 30000]) {
      const timer = setTimeout(() => {
        this.inboundRecoveryTimers.delete(timer);
        void runPass();
      }, delay);
      timer.unref?.();
      this.inboundRecoveryTimers.add(timer);
    }
  }

  stopInboundRecovery() {
    for (const timer of this.inboundRecoveryTimers) clearTimeout(timer);
    this.inboundRecoveryTimers.clear();
    this.inboundRecoveryRunning = false;
    this.inboundRecoveryStarted = false;
  }

  schedulePageCleanup(client) {
    this.stopPageCleanup();
    for (const delay of [300, 1000, 2500, 5000]) {
      const timer = setTimeout(() => {
        this.cleanupTimers.delete(timer);
        void this.cleanupRestoredPages(client);
      }, delay);
      timer.unref?.();
      this.cleanupTimers.add(timer);
    }
  }

  stopPageCleanup() {
    for (const timer of this.cleanupTimers) clearTimeout(timer);
    this.cleanupTimers.clear();
  }

  async cleanupRestoredPages(client) {
    try {
      const browser = client.pupBrowser;
      const activePage = client.pupPage;
      if (!browser || !activePage) return;
      const pages = await browser.pages();
      for (const [index, page] of pages.entries()) {
        const url = page.url();
        const isActivePage = page === activePage;
        console.log("[Mensajes][WhatsApp] Pagina detectada", { index, url, isActivePage });
        if (isActivePage) continue;
        const isOldWhatsApp = url.includes("web.whatsapp.com");
        const isBlank = url === "about:blank";
        if (!isOldWhatsApp && !isBlank) continue;
        console.log("[Mensajes][WhatsApp] Cerrando pagina sobrante", { index, url });
        try { await page.close(); } catch (error) { console.warn("[Mensajes][WhatsApp] No se pudo cerrar pagina sobrante", { url, error: error?.message }); }
      }
    } catch (error) {
      console.warn("[Mensajes] No se pudieron limpiar paginas restauradas:", error?.message || error);
    }
  }

  handleError(error, status = "error") {
    this.error = error?.message || String(error || "Error de WhatsApp");
    this.emitStatus(status, { error: this.error });
  }

  getExternalId(message, direction = "incoming") {
    const direct = this.getDirectExternalId(message);
    if (direct) return String(direct);
    const chatId = stripDeviceSuffix(direction === "outgoing" ? (message?.to || message?.from) : (message?.from || message?.to) || "unknown");
    const seed = `${chatId}|${message?.timestamp || message?._data?.t || ""}|${message?.body || ""}|${direction}`;
    return `wa-fallback-${crypto.createHash("sha1").update(seed).digest("hex")}`;
  }

  getDirectExternalId(message) {
    const rawId = message?.id;
    const dataId = message?._data?.id;
    return rawId?._serialized || rawId?.id || (typeof rawId === "string" ? rawId : "")
      || dataId?._serialized || dataId?.id || (typeof dataId === "string" ? dataId : "");
  }

  getReactionText(message) {
    const value = message?.reactionText || message?._data?.reactionText || message?._data?.reaction?.text || message?.body || "";
    return String(value || "").trim();
  }

  async getIndividualMeta(message, direction = "incoming") {
    const chatId = stripDeviceSuffix(direction === "outgoing" ? (message?.to || message?.from) : (message?.from || message?.to) || "");
    if (!chatId || IGNORED_CHAT_IDS.has(chatId)) return { discarded: "chat_id_invalido" };
    if (chatId.endsWith("@g.us")) return { discarded: "grupo" };
    let chat = null;
    if (typeof message.getChat === "function") {
      try {
        chat = await message.getChat();
      } catch (error) {
        console.warn("[Mensajes][WhatsApp] No se pudo consultar el chat; se usara metadata minima", { chatId, error: error?.message });
      }
    }
    if (chat?.isGroup) return { discarded: "grupo" };
    const contact = await this.getChatContact(message, chat, chatId, direction);
    // Aun con el contacto del chat, si lo que resolvimos es nuestra propia cuenta no
    // lo usamos: sellar la conversacion con el numero y el nombre de la clinica la
    // vuelve indistinguible de cualquier otro chat sellado igual, y el merge por
    // telefono del repositorio termina fusionando dos chats distintos.
    const ownNumber = persistedPhone(this.client?.info?.wid?.user || "");
    let contactNumber = String(contact?.number || "").replace(/\D/g, "");
    const contactIsSelf = Boolean(ownNumber) && persistedPhone(contactNumber) === ownNumber;
    if (contactIsSelf) contactNumber = "";
    if (!contactNumber && chatId.endsWith("@lid") && String(message?.__recoveryLidPhone || "").endsWith("@c.us")) {
      contactNumber = String(message.__recoveryLidPhone).replace(/\D/g, "");
    }
    if (!contactNumber && chatId.endsWith("@lid")) {
      // Primero el lookup local sincrónico (instantáneo si WhatsApp ya tiene el
      // mapeo); solo si falla, la consulta de red, que puede tardar minutos.
      contactNumber = String((await this.resolveLidPhoneLocal(chatId)) || "").replace(/\D/g, "");
      if (!contactNumber && typeof this.client?.getContactLidAndPhone === "function") {
        try {
          const resolved = await this.client.getContactLidAndPhone([chatId]);
          contactNumber = String(resolved?.[0]?.pn || "").replace(/\D/g, "");
          console.log("[Mensajes][WhatsApp] LID -> telefono (red)", { chatId, pn: resolved?.[0]?.pn || null, resuelto: Boolean(contactNumber) });
        } catch (error) {
          console.warn("[Mensajes][WhatsApp] No se pudo resolver LID a telefono", { chatId, error: error?.message || String(error) });
        }
      }
    }
    // Nunca usamos los digitos de un @lid como telefono.
    const fallback = chatId.includes("@") ? chatId.slice(0, chatId.indexOf("@")) : chatId;
    const phone = contactNumber || (chatId.endsWith("@lid") ? "" : fallback);
    if (!phone && !chatId.endsWith("@lid")) return { discarded: "telefono_no_resoluble", chatId };
    // Solo un telefono real se propaga como identidad de la conversacion.
    const identity = isRealPhone(phone) ? normalizePhone(persistedPhone(phone)) : null;
    return {
      // La Agenda y la lista de teléfonos usan el número local de 8 dígitos.
      // El @c.us/@lid completo se conserva aparte para el destino de WhatsApp.
      phone: identity,
      waChatId: chatId,
      waContactNumber: identity,
      waDisplayName: contactIsSelf
        ? (chat?.name || null)
        : (contact?.pushname || contact?.name || contact?.shortName || chat?.name || null)
    };
  }

  // Devuelve el contacto DEL CHAT, nunca el del remitente.
  // message.getContact() hace getContactById(author || from) y en un chat individual
  // el "from" de un mensaje fromMe somos nosotros: usarlo en salientes devuelve la
  // cuenta de la clinica (su pushname y su numero) en lugar del paciente.
  async getChatContact(message, chat, chatId, direction) {
    if (direction === "incoming" && typeof message?.getContact === "function") {
      try { return await message.getContact(); } catch (error) { console.warn("[Mensajes][WhatsApp] No se pudo consultar el contacto del mensaje", { chatId, error: error?.message }); }
    }
    if (chat && typeof chat.getContact === "function") {
      try { return await chat.getContact(); } catch (error) { console.warn("[Mensajes][WhatsApp] No se pudo consultar el contacto del chat", { chatId, error: error?.message }); }
    }
    if (chatId && typeof this.client?.getContactById === "function") {
      try { return await this.client.getContactById(chatId); } catch (error) { console.warn("[Mensajes][WhatsApp] No se pudo consultar el contacto por chatId", { chatId, error: error?.message }); }
    }
    return null;
  }

  async handleIncoming(message, eventName = "message") {
    const externalId = this.getExternalId(message, "incoming");
    const isReaction = String(message?.type || message?._data?.type || "").toLowerCase() === "reaction";
    const reaction = isReaction ? this.getReactionText(message) : "";
    const text = isReaction ? `Reacción: ${reaction || "❤️"}` : String(message?.body || "").trim();
    const sourceChat = message?.from || message?.to || "";
    console.log("[Mensajes][WhatsApp] Evento entrante", { event: eventName, externalId, chatId: sourceChat, hasText: Boolean(text) });
    if (message?.fromMe) return;
    if (!text) { console.log("[Mensajes][WhatsApp] Mensaje descartado: sin texto", { externalId, chatId: sourceChat, type: message?.type }); return; }
    try {
      const meta = await this.getIndividualMeta(message);
      if (meta?.discarded) { console.log("[Mensajes][WhatsApp] Mensaje descartado", { externalId, reason: meta.discarded, chatId: meta.chatId || sourceChat }); return; }
      this.events.emit("incomingMessage", normalizeIncomingMessage({
        externalId,
        ...meta,
        text,
        messageAt: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : new Date().toISOString(),
        rawType: isReaction ? "reaction" : (message.type || "text"),
        reactionTargetId: isReaction ? (message.reactionTargetId || null) : null,
        source: eventName === "recovery" ? "recovery" : "live"
      }));
      console.log("[Mensajes][WhatsApp] Mensaje normalizado para SQLite", { externalId, chatId: meta.waChatId, phone: meta.phone });
    } catch (error) {
      console.error("[Mensajes][WhatsApp] Error procesando mensaje entrante", { externalId, chatId: sourceChat, error: error?.message });
    }
  }

  async handleReaction(reaction) {
    const reactionText = String(reaction?.reaction || reaction?._data?.reaction || "").trim();
    if (!reactionText) return;
    try {
      const parentKey = reaction?.msgId || reaction?._data?.parentMsgKey || {};
      const parentSerialized = typeof parentKey === "string" ? parentKey : (parentKey?._serialized || "");
      const parentId = typeof parentKey === "object" ? String(parentKey.id || "") : "";
      const parentRemote = typeof parentKey === "object" ? String(parentKey.remote || parentKey.remoteJid || "") : "";
      const targetId = parentSerialized || (parentRemote && parentId ? `${parentKey.fromMe ? "true" : "false"}_${parentRemote}_${parentId}` : "");
      let target = null;
      if (targetId && typeof this.client?.getMessageById === "function") {
        try { target = await this.client.getMessageById(targetId); } catch (error) { console.warn("[Mensajes][WhatsApp] No se pudo cargar el mensaje reaccionado; se usara el chat del evento", { targetId, error: error?.message }); }
      }
      const chatId = String(target?.fromMe ? (target?.to || target?.from) : (target?.from || target?.to) || parentRemote || reaction?.chatId || "");
      if (!chatId) return;
      const ownId = String(this.client?.info?.wid?._serialized || this.client?.info?.wid?.user || "");
      const senderId = String(reaction?.senderId?._serialized || reaction?.senderId?.user || reaction?.senderId || "");
      const fromMe = Boolean(reaction?.fromMe) || (ownId && senderId && (senderId === ownId || senderId.replace(/@c\.us$/, "") === ownId.replace(/@c\.us$/, "")));
      let targetChat = target?.getChat ? () => target.getChat() : undefined;
      if (!targetChat && typeof this.client?.getChatById === "function") targetChat = () => this.client.getChatById(chatId);
      // El external_id del mensaje objetivo se calculo con getDirectExternalId al
      // guardarlo; reusamos la misma funcion sobre "target" para que coincidan
      // byte a byte (targetId es una clave compuesta que no siempre es igual).
      const targetExternalId = (target && this.getDirectExternalId(target)) || targetId || null;
      const message = {
        id: reaction?.id || reaction?._data?.id || `reaction-${Date.now()}`,
        fromMe,
        from: fromMe ? ownId : chatId,
        to: chatId,
        body: reactionText,
        type: "reaction",
        reactionTargetId: targetExternalId,
        getChat: targetChat,
        getContact: target?.getContact ? () => target.getContact() : undefined,
        timestamp: reaction?.timestamp || Math.floor(Date.now() / 1000)
      };
      if (fromMe) await this.handleOutgoing(message);
      else await this.handleIncoming(message, "message_reaction");
    } catch (error) {
      console.error("[Mensajes][WhatsApp] Error procesando reacción", { error: error?.message || String(error) });
    }
  }

  async handleOutgoing(message) {
    if (!message?.fromMe) return;
    const isReaction = String(message?.type || message?._data?.type || "").toLowerCase() === "reaction";
    const reaction = isReaction ? this.getReactionText(message) : "";
    const outgoingText = isReaction ? `Reacción: ${reaction || "❤️"}` : String(message?.body || "").trim();
    if (!outgoingText) return;
    const externalId = this.getDirectExternalId(message)
      || `${this.instanceId}-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outgoingKey = `${message.to || message.from}|${message.body || outgoingText}`;
    if (this.pendingOutgoingKeys.has(outgoingKey)) {
      this.pendingOutgoingKeys.delete(outgoingKey);
      if (externalId) this.knownOutgoingIds.add(externalId);
      return;
    }
    if (externalId && this.knownOutgoingIds.has(externalId)) {
      this.knownOutgoingIds.delete(externalId);
      return;
    }
    const body = outgoingText;
    const pendingBodyCount = this.pendingOutgoingBodies.get(body) || 0;
    if (body && pendingBodyCount > 0) {
      if (pendingBodyCount === 1) this.pendingOutgoingBodies.delete(body);
      else this.pendingOutgoingBodies.set(body, pendingBodyCount - 1);
      return;
    }
    try {
      const meta = await this.getIndividualMeta(message, "outgoing");
      if (!meta) return;
      this.events.emit("outgoingMessage", normalizeIncomingMessage({
        externalId: externalId || `${this.instanceId}-out-${Date.now()}`,
        ...meta,
        text: outgoingText,
        direction: "outgoing",
        author: "human",
        messageAt: message.timestamp ? new Date(message.timestamp * 1000).toISOString() : new Date().toISOString(),
        rawType: isReaction ? "reaction" : (message.type || "text"),
        reactionTargetId: isReaction ? (message.reactionTargetId || null) : null,
        source: "live"
      }));
    } catch (error) {
      this.handleError(error);
    }
  }

  async sendMessage(phone, text, options = {}) {
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    const normalizedPhone = phoneDigits.length >= 7 ? normalizePhone(phone) : (options.waChatId ? "0000000" : normalizePhone(phone));
    const normalizedText = typeof text === "string" ? text.trim() : "";
    const chatId = options.waChatId || `${whatsappDestinationPhone(normalizedPhone)}${USER_CHAT_SUFFIX}`;
    const key = `${chatId}|${normalizedText}`;
    const existing = this.inFlightOutgoing.get(key);
    if (existing) {
      console.warn("[Mensajes][WhatsApp] Envio duplicado coalescido", { chatId, phone: normalizedPhone });
      return existing;
    }
    const promise = this.sendMessageOnce(normalizedPhone, normalizedText, { ...options, waChatId: chatId });
    this.inFlightOutgoing.set(key, promise);
    try {
      return await promise;
    } finally {
      if (this.inFlightOutgoing.get(key) === promise) this.inFlightOutgoing.delete(key);
    }
  }

  // Lookup local sincrónico LID -> teléfono: WAWebApiContact.getPhoneNumber es
  // instantáneo cuando WhatsApp ya tiene el mapeo en memoria (siempre lo tiene
  // para alguien que ya mandó un mensaje). No hace consulta de red.
  async resolveLidPhoneLocal(chatId) {
    if (!this.client?.pupPage || typeof chatId !== "string" || !chatId.endsWith("@lid")) return null;
    try {
      const pn = await this.client.pupPage.evaluate((lid) => {
        try {
          const wid = window.require("WAWebWidFactory").createWid(lid);
          const p = window.require("WAWebApiContact").getPhoneNumber(wid);
          return (p && (p._serialized || p.user)) ? (p._serialized || (p.user + "@c.us")) : null;
        } catch (e) { return null; }
      }, chatId);
      const ok = pn && pn.endsWith("@c.us") && isRealPhone(pn);
      if (ok) console.log("[Mensajes][WhatsApp] LID -> telefono (local)", { chatId, pn });
      return ok ? normalizePhone(persistedPhone(pn)) : null;
    } catch { return null; }
  }

  async resolvePhoneForChatId(chatId) {
    if (typeof chatId !== "string" || !chatId.endsWith("@lid")) return null;
    const local = await this.resolveLidPhoneLocal(chatId);
    if (local) return local;
    if (typeof this.client?.getContactLidAndPhone !== "function") return null;
    const resolved = await this.client.getContactLidAndPhone([chatId]);
    const phoneId = resolved?.[0]?.pn;
    const ok = phoneId && phoneId.endsWith("@c.us") && isRealPhone(phoneId);
    console.log("[Mensajes][WhatsApp] refresh LID -> telefono (red)", { chatId, pn: phoneId || null, aceptado: Boolean(ok) });
    return ok ? normalizePhone(persistedPhone(phoneId)) : null;
  }

  async sendMessageOnce(phone, text, options = {}) {
    if (!this.client || this.status !== "connected") throw new Error("WhatsApp no esta conectado");
    const phoneDigits = String(phone || "").replace(/\D/g, "");
    let normalizedPhone = phoneDigits.length >= 7 ? normalizePhone(phone) : (options.waChatId ? "0000000" : normalizePhone(phone));
    if (typeof text !== "string" || !text.trim()) throw new TypeError("text debe ser un texto no vacio");
    const chatId = options.waChatId || `${whatsappDestinationPhone(normalizedPhone)}${USER_CHAT_SUFFIX}`;
    let sendChatId = chatId;
    if (sendChatId.endsWith("@lid") && typeof this.client.getContactLidAndPhone === "function") {
      const resolved = await this.client.getContactLidAndPhone([sendChatId]);
      const phoneId = resolved?.[0]?.pn;
      if (phoneId) {
        sendChatId = phoneId;
        // persistedPhone: la conversacion guarda el numero local de 8 digitos. Sin
        // esto el mismo chat queda a veces como 503XXXXXXXX y a veces como XXXXXXXX,
        // y cada forma crea o fusiona una conversacion distinta.
        normalizedPhone = normalizePhone(persistedPhone(phoneId));
        console.log("[Mensajes][WhatsApp] LID convertido a telefono", { lid: chatId, phoneId });
      }
    }
    const outgoingKey = `${chatId}|${text.trim()}`;
    this.pendingOutgoingKeys.add(outgoingKey);
    this.pendingOutgoingBodies.set(text.trim(), (this.pendingOutgoingBodies.get(text.trim()) || 0) + 1);
    setTimeout(() => this.pendingOutgoingKeys.delete(outgoingKey), 15000).unref?.();
    setTimeout(() => { const count = this.pendingOutgoingBodies.get(text.trim()) || 0; if (count <= 1) this.pendingOutgoingBodies.delete(text.trim()); else this.pendingOutgoingBodies.set(text.trim(), count - 1); }, 15000).unref?.();
    let message;
    try {
      // Envio oficial y unico para chats individuales: numero@c.us.
      message = await this.client.sendMessage(sendChatId, text.trim());
    } catch (error) {
      console.error("[Mensajes][WhatsApp] Error enviando mensaje", {
        phone: normalizedPhone,
        chatId,
        error: error?.stack || error?.message || String(error)
      });
      throw error;
    }
    const externalId = this.getDirectExternalId(message)
      || `${this.instanceId}-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (externalId) this.knownOutgoingIds.add(externalId);
    // normalizedPhone puede ser el LID (cuando la conversacion todavia no tiene
    // telefono) o el placeholder "0000000". Ninguno de los dos es una identidad.
    const identity = isRealPhone(normalizedPhone) ? persistedPhone(normalizedPhone) : null;
    const normalized = normalizeIncomingMessage({
      externalId,
      phone: identity,
      // Conservamos el identificador original de la conversacion. El @c.us
      // resuelto es solo el destino de envio, no una conversacion nueva.
      waChatId: chatId,
      waContactNumber: identity,
      text: text.trim(),
      direction: "outgoing",
      author: options.author || "human",
      messageAt: message?.timestamp ? new Date(message.timestamp * 1000).toISOString() : new Date().toISOString()
    });
    this.events.emit("messageStatus", normalizeMessageStatus({ externalId: normalized.externalId, phone: normalizedPhone, status: "sent" }));
    return normalized;
  }

  async disconnect() {
    this.stopStateProbe();
    this.stopInboundRecovery();
    this.stopPageCleanup();
    const client = this.client;
    this.client = null;
    this.initializing = null;
    this.qrAvailable = false;
    this.authenticated = false;
    if (client) {
      try { await client.destroy(); } catch (error) { this.error = error?.message || String(error); }
    }
    this.emitStatus("disconnected");
    return this.getStatus();
  }

  async clearSession() {
    await this.disconnect();
    await fs.promises.rm(this.authPath, { recursive: true, force: true });
    this.error = null;
    return this.getStatus({ sessionCleared: true });
  }

  onIncomingMessage(handler) { this.events.on("incomingMessage", handler); return () => this.events.off("incomingMessage", handler); }
  onOutgoingMessage(handler) { this.events.on("outgoingMessage", handler); return () => this.events.off("outgoingMessage", handler); }
  onMessageStatus(handler) { this.events.on("messageStatus", handler); return () => this.events.off("messageStatus", handler); }
  onStatus(handler) { this.events.on("status", handler); return () => this.events.off("status", handler); }
}

module.exports = { WhatsAppWebMessagingConnector };
