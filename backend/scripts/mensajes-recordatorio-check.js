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
  console.log("mensajes-recordatorio-check OK");
})().catch((error) => { console.error(error); process.exit(1); });
