// Check de regresión (2026-10-07): respuesta a un recordatorio desde un chat @lid.
// Uso: node backend/scripts/mensajes-recordatorio-check.js  (sin WhatsApp, MySQL ni la base real)
const assert = require("assert");
const os = require("os");
const path = require("path");
// Base SQLite de prueba con el esquema real (migraciones), nunca la de la clínica.
process.env.CLINICA_DATA_DIR = path.join(os.tmpdir(), `mensajes-check-${process.pid}`);
const Database = require("better-sqlite3");
const { MensajesRepository } = require("../services/mensajes/mensajesRepository.service");
const { WhatsAppWebMessagingConnector } = require("../services/mensajes/connectors/whatsappWebMessagingConnector");

(async () => {
  // 1. El recordatorio sale la tarde anterior y el "sí" llega a la mañana siguiente (>18 h):
  //    sigue vigente mientras la cita sea de hoy en adelante.
  const db = new Database(":memory:");
  db.exec("CREATE TABLE reminder_batch_items (id INTEGER PRIMARY KEY, batch_id INTEGER, appointment_id INTEGER, patient_name TEXT, appointment_date TEXT, appointment_time TEXT, treatment TEXT, phone TEXT, content TEXT, status TEXT, sent_at TEXT)");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
  const add = db.prepare("INSERT INTO reminder_batch_items (batch_id, appointment_id, appointment_date, appointment_time, phone, content, status, sent_at) VALUES (1, ?, ?, '15:00', ?, ?, 'sent', datetime('now', ?))");
  add.run(1, today, "70970485", "Podra Asistir?", "-20 hours");
  add.run(2, "2000-01-01", "71111111", "Podra Asistir?", "-1 hours");
  add.run(3, today, "72222222", "Podra Asistir?", "-4 days");
  add.run(4, today, "79682675", "Hola Daniela y Tatiana", "-2 hours");
  add.run(5, today, "79682675", "Hola Daniela y Tatiana", "-2 hours");
  const repo = new MensajesRepository(db);
  assert.strictEqual(repo.getRecentSentReminderForPhone("50370970485")?.appointmentId, 1, "recordatorio de hace 20 h para una cita de hoy");
  assert.strictEqual(repo.getRecentSentReminderForPhone("71111111"), null, "cita ya pasada");
  assert.strictEqual(repo.getRecentSentReminderForPhone("72222222"), null, "enviado hace más de 3 días");
  // Familiares con el mismo número: un solo mensaje cubre las dos citas.
  assert.deepStrictEqual(repo.getRecentSentReminderForPhone("79682675").appointments.map((c) => c.appointmentId), [4, 5]);

  // 2. En un @lid, contact.number trae los dígitos del LID: igual se usa el teléfono local.
  const connector = Object.create(WhatsAppWebMessagingConnector.prototype);
  connector.client = { info: { wid: { user: "50379990000" } } };
  connector.resolveLidPhoneLocal = async () => "70970485";
  connector.getChatContact = async () => ({ number: "119070150139935" });
  const meta = await connector.getIndividualMeta({ from: "119070150139935@lid", getChat: async () => { throw new Error("r"); } });
  assert.strictEqual(meta.phone, "70970485");
  assert.strictEqual(meta.waChatId, "119070150139935@lid");

  // 3. Mismo paciente en dos chats con números distintos (caso 2026-10-07: Jennifer vinculada al chat de
  //    Eduardo) NO se fusionan; el split @c.us + @lid sin teléfono del mismo paciente sí.
  const real = new MensajesRepository();
  const now = () => new Date().toISOString();
  const jen = real.saveIncomingMessage({ phone: "55559095", waChatId: "900000000000101@lid", waContactNumber: "55559095", externalId: "x1", text: "Si esta bien", messageAt: now(), rawType: "chat" }).conversation;
  const edu = real.saveIncomingMessage({ phone: "55559405", waChatId: "900000000000102@lid", waContactNumber: "55559405", externalId: "x2", text: "Hola buenas", messageAt: now(), rawType: "chat" }).conversation;
  real.setPatientLink(jen.id, { id: 618, name: "Jennifer", phone: "5555 9095" }, 1);
  real.setPatientLink(edu.id, { id: 618, name: "Jennifer", phone: "5555 9095" }, 1);
  assert.strictEqual(real.saveOutgoingMessage({ phone: "55559405", waChatId: "900000000000102@lid", waContactNumber: "55559405", externalId: "x3", text: "lunes 12", author: "ai", messageAt: now() }).conversation.id, edu.id);
  assert.ok(real.getConversation(jen.id) && real.getConversation(edu.id), "no se fusionan");
  real.setPatientLink(jen.id, { id: 1266, name: "Eduardo", phone: "5555 2758" }, 1);
  assert.strictEqual(real.getConversation(jen.id).phone, "55559095", "el teléfono real del chat no se pisa");
  const cus = real.saveOutgoingMessage({ phone: "55557777", waChatId: null, externalId: "x4", text: "recordatorio", author: "system", messageAt: now() }).conversation;
  real.setPatientLink(cus.id, { id: 777, name: "Ana", phone: "5555 7777" }, 1);
  const lid = real.saveIncomingMessage({ phone: null, waChatId: "900000000000103@lid", waContactNumber: null, externalId: "x5", text: "si", messageAt: now(), rawType: "chat" }).conversation;
  real.setPatientLink(lid.id, { id: 777, name: "Ana", phone: "5555 7777" }, 1);
  assert.strictEqual(real.saveIncomingMessage({ phone: null, waChatId: "900000000000103@lid", waContactNumber: null, externalId: "x6", text: "gracias", messageAt: now(), rawType: "chat" }).conversation.id, cus.id, "split @c.us/@lid se fusiona");

  // 4. Dedup de salientes: la recuperación de historial no duplica; una respuesta nueva igual en vivo sí se guarda.
  const t0 = new Date(Date.now() - 60000).toISOString();
  const d = real.saveOutgoingMessage({ phone: "55558888", externalId: "wa-sintetico-1", text: "le parece bien?", author: "human", messageAt: t0 }).conversation;
  real.saveIncomingMessage({ phone: "55558888", externalId: "y1", text: "si", messageAt: new Date().toISOString(), rawType: "chat" });
  assert.strictEqual(real.saveOutgoingMessage({ phone: "55558888", externalId: "3EBreal", text: "le parece bien?", author: "human", messageAt: t0, source: "recovery" }).duplicate, true, "recuperación no duplica");
  assert.strictEqual(Boolean(real.saveOutgoingMessage({ phone: "55558888", externalId: "y2", text: "le parece bien?", author: "ai", messageAt: new Date().toISOString() }).duplicate), false, "respuesta nueva en vivo se guarda");
  assert.strictEqual(real.listMessages(d.id, { limit: 10 }).length, 3);

  // 5. Historial viejo importado por la recuperación a un chat con mensajes más nuevos: no pasa a ser "lo último".
  const h = real.saveIncomingMessage({ phone: "55556666", externalId: "z1", text: "Si esta bien me parece bien", messageAt: new Date().toISOString(), rawType: "chat" }).conversation;
  real.saveOutgoingMessage({ phone: "55556666", externalId: "z2", text: "de acuerdo, quedó agendada", author: "human", messageAt: new Date(Date.now() - 86400e3).toISOString(), source: "recovery" });
  assert.strictEqual(real.getLatestMessage(h.id).content, "Si esta bien me parece bien");
  assert.strictEqual(real.getConversation(h.id).lastMessageDirection, "incoming");

  // 6. No leídos: recepción contesta desde otro teléfono → lo anterior del paciente queda leído; la IA y el historial viejo no.
  const unread = (id) => real.listConversations({ limit: 200 }).find((c) => c.id === id).unreadCount;
  const u = real.saveIncomingMessage({ phone: "55554444", externalId: "u1", text: "quiero cita", messageAt: new Date(Date.now() - 3000).toISOString(), rawType: "chat" }).conversation;
  real.saveIncomingMessage({ phone: "55554444", externalId: "u2", text: "por la tarde", messageAt: new Date(Date.now() - 2000).toISOString(), rawType: "chat" });
  real.saveOutgoingMessage({ phone: "55554444", externalId: "u3", text: "¿qué día le queda?", author: "ai", messageAt: new Date(Date.now() - 1000).toISOString() });
  assert.strictEqual(unread(u.id), 2, "la respuesta de la IA no los marca leídos");
  real.saveOutgoingMessage({ phone: "55554444", externalId: "u4", text: "Buenos días", author: "human", messageAt: new Date(Date.now() - 86400e3).toISOString(), source: "recovery" });
  assert.strictEqual(unread(u.id), 2, "historial viejo importado no los marca leídos");
  real.saveOutgoingMessage({ phone: "55554444", externalId: "u5", text: "para cuando?", author: "human", messageAt: new Date().toISOString() });
  assert.strictEqual(unread(u.id), 0, "respuesta de recepción desde otro teléfono");
  real.saveIncomingMessage({ phone: "55554444", externalId: "u6", text: "el lunes", messageAt: new Date().toISOString(), rawType: "chat" });
  assert.strictEqual(unread(u.id), 1, "lo nuevo del paciente vuelve a contar");
  // Recepción contesta un chat en "Necesita revisión" → Manual (como "Tomar"); la IA y los recordatorios no lo cambian.
  real.updateConversation(u.id, { attentionMode: "review_required" });
  real.saveOutgoingMessage({ phone: "55554444", externalId: "u7", text: "le confirmo en un momento", author: "ai", messageAt: new Date().toISOString() });
  real.saveOutgoingMessage({ phone: "55554444", externalId: "u8", text: "Recordatorio de su cita", author: "system", messageAt: new Date().toISOString() });
  assert.strictEqual(real.getConversation(u.id).attentionMode, "review_required");
  real.saveOutgoingMessage({ phone: "55554444", externalId: "u9", text: "por la tarde tenemos espacio", author: "human", messageAt: new Date().toISOString() });
  assert.strictEqual(real.getConversation(u.id).attentionMode, "manual", "recepción respondió: pasa a Manual");
  // "✓ Atendido": en "Necesita revisión" pasa a Manual; en modo IA no toca el modo.
  real.updateConversation(u.id, { attentionMode: "review_required" });
  real.markAttended(u.id);
  assert.strictEqual(real.getConversation(u.id).attentionMode, "manual", "Atendido en revisión: pasa a Manual");
  real.updateConversation(u.id, { attentionMode: "assistant" });
  real.markAttended(u.id);
  assert.strictEqual(real.getConversation(u.id).attentionMode, "assistant", "Atendido en modo IA: no cambia el modo");

  // 7. Conversación finalizada (contextos/20, «Conversación finalizada»): la IA calla hasta la medianoche de El Salvador (máx. 12 h) o hasta "Liberar".
  const realNow = Date.now;
  const fin = real.saveIncomingMessage({ phone: "55553333", externalId: "f1", text: "Ok", messageAt: new Date().toISOString(), rawType: "chat" }).conversation;
  const closeAt = (at) => real.setAssistantMemory(fin.id, { closed: { at, motivo: "consultó su cita y se despidió", messageId: 1 } });
  Date.now = () => Date.parse("2026-10-09T21:00:00Z"); // 3:00 PM en El Salvador
  closeAt("2026-10-09T20:00:00Z"); // 2:00 PM → hasta la medianoche
  assert.strictEqual(real.assistantClosedUntil(fin.id), "2026-10-10T06:00:00.000Z");
  closeAt("2026-10-09T14:00:00Z"); // 8:00 AM → 12 h, hasta las 8:00 PM
  assert.strictEqual(real.assistantClosedUntil(fin.id), "2026-10-10T02:00:00.000Z");
  assert.strictEqual(real.shouldAllowAutomatedResponseForConversation(fin.id), false, "vigente: la IA no responde");
  assert.strictEqual(real.enqueueUnansweredAssistantMessages(4, 5, fin.id).length, 0, "vigente: la cola no lo reencola");
  Date.now = () => Date.parse("2026-10-10T02:00:01Z");
  assert.strictEqual(real.assistantClosedUntil(fin.id), null, "vencida");
  Date.now = () => Date.parse("2026-10-09T21:00:00Z");
  real.releaseAssistantClose(fin.id);
  assert.strictEqual(real.assistantClosedUntil(fin.id), null, "Liberar la quita aunque no haya vencido");
  assert.strictEqual(real.getAssistantMemory(fin.id).closed.motivo, "consultó su cita y se despidió", "el cierre queda para la nota de la vista");
  Date.now = realNow;
  assert.strictEqual(real.enqueueUnansweredAssistantMessages(4, 5, fin.id).length, 1, "liberada: la IA vuelve a responder");

  // 8. processBatch cuando la IA finaliza (runAssistant simulado, sin red): no envía nada, deja la marca, quita ⏳ y no hay bucle.
  //    El lote vence en 60 s para que el tick propio de aiObserver no lo tome mientras tanto.
  const agent = require("../services/mensajes/assistantAgent.service");
  agent.runAssistant = async () => ({ text: "", transfer: null, closed: "consultó su cita y se despidió", steps: 1, trace: [], memoryUpdate: null });
  const observer = require("../services/mensajes/aiObserver.service");
  real.updateAutomationSettings({ ...real.getAutomationSettings(), enabled: true });
  const g = real.saveIncomingMessage({ phone: "55552222", externalId: "g1", text: "Gracias", messageAt: new Date().toISOString(), rawType: "chat" });
  const done = await observer.processBatch(real.enqueueResponseMessage(g.conversation.id, g.message.id, "Gracias", 60));
  assert.strictEqual(done.status, "cancelled");
  assert.match(done.error, /^Finalizada sin responder/);
  assert.ok(real.assistantClosedUntil(g.conversation.id), "marca vigente");
  assert.strictEqual(real.getConversation(g.conversation.id).attended_message_id, g.message.id, "Atendido: sin ⏳ para lo cerrado");
  assert.strictEqual(real.enqueueUnansweredAssistantMessages(4, 5, g.conversation.id).length, 0, "la cola no lo reencola");
  assert.strictEqual(real.listMessages(g.conversation.id).filter((m) => m.direction === "outgoing").length, 0, "no se envió nada");

  // 9. Historial antes del primer mensaje en vivo del chat (caso Cristian, WhatsApp simulado): una sola carga para los dos
  //    eventos del mismo mensaje, lo recuperado sale antes que el mensaje en vivo, el audio ya respondido viene marcado,
  //    lo que llega tarde no se emite y lo recuperado no vuelve a pedir historial.
  const hist = Object.create(WhatsAppWebMessagingConnector.prototype);
  Object.assign(hist, { events: new (require("events").EventEmitter)(), historySync: new Map(), status: "connected", instanceId: "t" });
  const histLid = "900000000000201@lid";
  const model = (id, fromMe, body, t, extra = {}) => ({ id: { fromMe, remote: histLid, id, _serialized: `${fromMe}_${histLid}_${id}` }, body, type: "chat", t, from: fromMe ? "50379990000@c.us" : histLid, to: fromMe ? histLid : "50379990000@c.us", ...extra });
  let loads = 0;
  hist.client = { pupPage: { evaluate: async (_fn, args) => { loads += 1; assert.strictEqual(args.onlyId, histLid); assert.strictEqual(args.before, 300); return { models: [model("A1", false, "audio viejo", 100, { type: "ptt", __answered: true }), model("R1", true, "Le recordamos su cita de mañana", 200)], debug: [] }; } } };
  hist.getIndividualMeta = async () => ({ phone: "55550201", waChatId: histLid, waContactNumber: "55550201" });
  const emitted = [];
  hist.events.on("incomingMessage", (m) => emitted.push(["in", m.text, m.source, m.answered]));
  hist.events.on("outgoingMessage", (m) => emitted.push(["out", m.text, m.source]));
  const liveMsg = { id: { fromMe: false, id: "L1", _serialized: `false_${histLid}_L1` }, fromMe: false, from: histLid, to: "50379990000@c.us", body: "Si si", type: "chat", timestamp: 300 };
  await Promise.all([hist.handleIncoming(liveMsg, "message"), hist.handleIncoming(liveMsg, "message_create")]);
  assert.strictEqual(loads, 1, "una sola carga por chat");
  assert.deepStrictEqual(emitted.slice(0, 3), [["in", "audio viejo", "recovery", true], ["out", "Le recordamos su cita de mañana", "recovery"], ["in", "Si si", "live", false]], "historial antes del mensaje en vivo");
  await hist.handleIncoming({ ...liveMsg, id: { ...liveMsg.id, id: "L2", _serialized: `false_${histLid}_L2` }, body: "ok", timestamp: 400 }, "message");
  assert.strictEqual(loads, 1, "segundo mensaje del chat: no vuelve a cargar");
  await hist.handleIncoming({ ...liveMsg, from: "900000000000202@lid", body: "hola" }, "recovery");
  assert.strictEqual(loads, 1, "lo recuperado no pide historial");
  const before = emitted.length;
  await hist.emitRecoveredModels(hist.client, [model("X1", false, "tarde", 100), model("X2", true, "tarde", 101)], { deadline: Date.now() - 1 });
  assert.strictEqual(emitted.length, before, "lo que llega tarde no se emite");

  // 10. Corte por tiempo mientras llega el cuerpo (caso Hector): error claro, no una respuesta vacía; un cuerpo que no es JSON sigue valiendo {}.
  const { requestJudgement } = require("../services/mensajes/assistantProvider.service");
  const realFetch = global.fetch;
  const cfgTest = { baseUrl: "http://ia.test", model: "m" };
  global.fetch = async (_url, { signal }) => ({ ok: true, status: 200, json: () => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  const cut = new AbortController(); setTimeout(() => cut.abort(), 50); // AbortSignal.timeout no mantiene vivo el proceso
  await assert.rejects(requestJudgement({ cfg: cfgTest, system: "s", user: "u", signal: cut.signal }), { code: "AI_TIMEOUT" });
  global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("no es JSON"); } });
  assert.deepStrictEqual(await requestJudgement({ cfg: cfgTest, system: "s", user: "u", signal: AbortSignal.timeout(1000) }), {});
  global.fetch = realFetch;
  console.log("mensajes-recordatorio-check OK");
})().catch((error) => { console.error(error); process.exit(1); });
