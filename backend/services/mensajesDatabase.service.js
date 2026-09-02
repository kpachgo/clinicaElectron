const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { mensajesDir, ensureDataDirsSync } = require("../config/storagePaths");

const DB_FILE = path.join(mensajesDir, "mensajes.sqlite");
let db;

const migrations = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    patient_id INTEGER NULL,
    attention_mode TEXT NOT NULL DEFAULT 'assistant' CHECK (attention_mode IN ('manual','assistant','paused','review_required')),
    human_owner_id INTEGER NULL,
    status TEXT NOT NULL DEFAULT 'open',
    summary TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
  CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations(patient_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_phone_open ON conversations(phone) WHERE status <> 'closed';`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    external_id TEXT NULL UNIQUE,
    direction TEXT NOT NULL CHECK (direction IN ('incoming','outgoing')),
    author TEXT NOT NULL CHECK (author IN ('patient','human','system','ai')),
    content TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    error TEXT NULL,
    message_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_date ON messages(conversation_id, message_at);
  CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(delivery_status);`,
  `CREATE TABLE IF NOT EXISTS conversation_state (
    conversation_id INTEGER PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    intent TEXT NULL,
    collected_json TEXT NOT NULL DEFAULT '{}',
    missing_json TEXT NOT NULL DEFAULT '[]',
    offered_slots_json TEXT NOT NULL DEFAULT '[]',
    pending_action_json TEXT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS message_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    request_json TEXT NOT NULL,
    validation_result TEXT NULL,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    appointment_id INTEGER NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_actions_conversation_status ON message_actions(conversation_id, status);`,
  `CREATE TABLE IF NOT EXISTS ai_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    policy_version TEXT NULL,
    tools_json TEXT NOT NULL DEFAULT '[]',
    result_json TEXT NULL,
    input_tokens INTEGER NULL,
    output_tokens INTEGER NULL,
    duration_ms INTEGER NULL,
    estimated_cost REAL NULL,
    error TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_runs_conversation_date ON ai_runs(conversation_id, created_at);`,
  `CREATE TABLE IF NOT EXISTS automation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    conversation_id INTEGER NULL REFERENCES conversations(id) ON DELETE SET NULL,
    appointment_id INTEGER NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status_schedule ON automation_jobs(status, scheduled_at);`,
  `ALTER TABLE messages ADD COLUMN read_at TEXT NULL;`,
  `CREATE TABLE IF NOT EXISTS outgoing_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, content TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_outgoing_queue_status ON outgoing_queue(status, created_at);`
  ,`ALTER TABLE conversations ADD COLUMN response_delay_min REAL NOT NULL DEFAULT 0; ALTER TABLE conversations ADD COLUMN response_delay_max REAL NOT NULL DEFAULT 0;`
  ,`CREATE TABLE IF NOT EXISTS message_settings (id INTEGER PRIMARY KEY CHECK (id=1), response_delay_min REAL NOT NULL DEFAULT 5, response_delay_max REAL NOT NULL DEFAULT 30, updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT OR IGNORE INTO message_settings(id) VALUES (1);`
  ,`ALTER TABLE message_settings ADD COLUMN automation_phone_mode TEXT NOT NULL DEFAULT 'exclude'; ALTER TABLE message_settings ADD COLUMN automation_phone_numbers TEXT NOT NULL DEFAULT '[]';`
  ,`CREATE TABLE IF NOT EXISTS automation_settings (id INTEGER PRIMARY KEY CHECK (id=1), enabled INTEGER NOT NULL DEFAULT 0, appointment_confirmation INTEGER NOT NULL DEFAULT 1, appointment_reminder INTEGER NOT NULL DEFAULT 1, appointment_change_notice INTEGER NOT NULL DEFAULT 1, after_hours_reply INTEGER NOT NULL DEFAULT 1, human_intervention_pause INTEGER NOT NULL DEFAULT 1, allowed_start TEXT NOT NULL DEFAULT '08:00', allowed_end TEXT NOT NULL DEFAULT '18:00', updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT OR IGNORE INTO automation_settings(id) VALUES (1);`
  ,`CREATE TABLE IF NOT EXISTS administrative_settings (id INTEGER PRIMARY KEY CHECK (id=1), clinic_name TEXT NOT NULL DEFAULT 'Clínica Electron', phone TEXT NOT NULL DEFAULT '7268 2797', address TEXT NOT NULL DEFAULT '', payment_methods TEXT NOT NULL DEFAULT '[]', cancellation_policy TEXT NOT NULL DEFAULT '', faq TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT OR IGNORE INTO administrative_settings(id) VALUES (1);`
  ,`CREATE TABLE IF NOT EXISTS clinical_rules (id INTEGER PRIMARY KEY CHECK (id=1), rules_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT OR IGNORE INTO clinical_rules(id) VALUES (1);`
  ,`UPDATE clinical_rules SET rules_json='[{"service":"Control de ortodoncia","requiredQuestions":["¿Es una cita de control?","¿Tiene dolor o urgencia?"],"humanReviewTreatments":["Dolor intenso","Cambio de brackets"],"blockedHours":[{"start":"20:00","end":"07:00"}],"minimumAdvanceMinutes":120,"allowedDoctors":[]},{"service":"Urgencia dental","requiredQuestions":["¿Desde cuándo presenta la molestia?","¿Tiene sangrado o inflamación?"],"humanReviewTreatments":["Trauma","Sangrado persistente"],"blockedHours":[],"minimumAdvanceMinutes":0,"allowedDoctors":[]}]' WHERE rules_json='[]';`
  ,`CREATE TABLE IF NOT EXISTS human_review_rules (id INTEGER PRIMARY KEY CHECK (id=1), rules_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT OR IGNORE INTO human_review_rules(id) VALUES (1); UPDATE human_review_rules SET rules_json='[{"id":"media","label":"Fotografías, radiografías o documentos","enabled":1},{"id":"audio","label":"Mensajes de audio","enabled":1},{"id":"discontent","label":"Paciente molesto o insatisfecho","enabled":1},{"id":"urgency","label":"Dolor intenso, sangrado o urgencia","enabled":1},{"id":"human-request","label":"Solicita hablar con recepción o un doctor","enabled":1}]' WHERE rules_json='[]';`
  ,`CREATE TABLE IF NOT EXISTS ai_provider_settings (id INTEGER PRIMARY KEY CHECK (id=1), provider_mode TEXT NOT NULL DEFAULT 'local' CHECK (provider_mode IN ('local','cloud')), base_url TEXT NOT NULL DEFAULT 'http://localhost:11434/v1', model TEXT NOT NULL DEFAULT 'llama3.2', api_key TEXT NOT NULL DEFAULT '', timeout_ms INTEGER NOT NULL DEFAULT 15000, updated_at TEXT NOT NULL DEFAULT (datetime('now'))); INSERT OR IGNORE INTO ai_provider_settings(id) VALUES (1);`
  ,`ALTER TABLE message_settings ADD COLUMN response_group_delay_seconds REAL NOT NULL DEFAULT 4; CREATE TABLE IF NOT EXISTS response_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','processing','typing','completed','cancelled','failed')), buffer_started_at TEXT NOT NULL DEFAULT (datetime('now')), due_at TEXT NOT NULL, batch_version INTEGER NOT NULL DEFAULT 1, message_ids_json TEXT NOT NULL DEFAULT '[]', consolidated_text TEXT NULL, response_text TEXT NULL, error TEXT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE INDEX IF NOT EXISTS idx_response_queue_due ON response_queue(status, due_at); CREATE INDEX IF NOT EXISTS idx_response_queue_conversation ON response_queue(conversation_id, status);`
  ,`CREATE TABLE IF NOT EXISTS reminder_batches (id INTEGER PRIMARY KEY AUTOINCREMENT, appointment_date TEXT NOT NULL, template TEXT NOT NULL, min_delay_seconds REAL NOT NULL, max_delay_seconds REAL NOT NULL, status TEXT NOT NULL DEFAULT 'draft', total_count INTEGER NOT NULL DEFAULT 0, sent_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0, cancelled_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT NULL, finished_at TEXT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE IF NOT EXISTS reminder_batch_items (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES reminder_batches(id) ON DELETE CASCADE, appointment_id INTEGER NOT NULL, patient_name TEXT NOT NULL, phone TEXT NOT NULL, appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL, treatment TEXT NULL, appointment_status TEXT NULL, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', queue_id INTEGER NULL, error TEXT NULL, sent_at TEXT NULL, scheduled_at TEXT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(batch_id, appointment_id)); CREATE INDEX IF NOT EXISTS idx_reminder_batches_status ON reminder_batches(status); CREATE INDEX IF NOT EXISTS idx_reminder_items_batch_status ON reminder_batch_items(batch_id,status);`
  ,`ALTER TABLE message_settings ADD COLUMN reminder_template TEXT NOT NULL DEFAULT 'Hola {{nombre}}, le recordamos su cita del {{fecha}} a las {{hora}} por {{tratamiento}}.'; ALTER TABLE message_settings ADD COLUMN reminder_min_delay_seconds REAL NOT NULL DEFAULT 30; ALTER TABLE message_settings ADD COLUMN reminder_max_delay_seconds REAL NOT NULL DEFAULT 90;`
  ,`ALTER TABLE conversations ADD COLUMN wa_chat_id TEXT NULL; ALTER TABLE conversations ADD COLUMN wa_contact_number TEXT NULL; ALTER TABLE conversations ADD COLUMN wa_display_name TEXT NULL; CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_wa_chat_open ON conversations(wa_chat_id) WHERE wa_chat_id IS NOT NULL AND status <> 'closed'; CREATE INDEX IF NOT EXISTS idx_conversations_wa_contact ON conversations(wa_contact_number);`
  ,`ALTER TABLE outgoing_queue ADD COLUMN wa_chat_id TEXT NULL; CREATE INDEX IF NOT EXISTS idx_outgoing_queue_wa_chat ON outgoing_queue(wa_chat_id);`
  ,`CREATE TABLE IF NOT EXISTS ai_clinic_schedule (
    id INTEGER PRIMARY KEY CHECK (id=1),
    timezone TEXT NOT NULL DEFAULT 'America/El_Salvador',
    slot_interval_minutes INTEGER NOT NULL DEFAULT 30,
    schedule_json TEXT NOT NULL DEFAULT '{"0":[],"1":[{"start":"08:00","end":"18:00"}],"2":[{"start":"08:00","end":"18:00"}],"3":[{"start":"08:00","end":"18:00"}],"4":[{"start":"08:00","end":"18:00"}],"5":[{"start":"08:00","end":"18:00"}],"6":[]}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO ai_clinic_schedule(id) VALUES (1);
  CREATE TABLE IF NOT EXISTS ai_service_settings (
    service_id INTEGER PRIMARY KEY,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    capacity_per_hour INTEGER NULL DEFAULT NULL,
    required_questions_json TEXT NOT NULL DEFAULT '[]',
    blocked_weekdays_json TEXT NOT NULL DEFAULT '[]',
    blocked_hours_json TEXT NOT NULL DEFAULT '[]',
    minimum_advance_minutes INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_service_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    UNIQUE(service_id, normalized_alias)
  );`,
  `ALTER TABLE ai_clinic_schedule ADD COLUMN breaks_json TEXT NOT NULL DEFAULT '[]';`
  ,`ALTER TABLE ai_service_settings ADD COLUMN available_hours_json TEXT NOT NULL DEFAULT '[]';`
  ,`UPDATE ai_service_settings SET blocked_hours_json='[]';`
  ,`CREATE TABLE IF NOT EXISTS conversation_patient_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL,
    wa_chat_id TEXT NULL,
    phone TEXT NULL,
    patient_name TEXT NOT NULL,
    treatment_type TEXT NULL,
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_by INTEGER NULL,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(conversation_id, patient_id)
  );
  CREATE INDEX IF NOT EXISTS idx_patient_links_chat ON conversation_patient_links(wa_chat_id, active);
  CREATE INDEX IF NOT EXISTS idx_patient_links_patient ON conversation_patient_links(patient_id, active);`
  ,`CREATE TABLE IF NOT EXISTS patient_chat_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_chat_id TEXT NOT NULL UNIQUE,
    patient_id INTEGER NOT NULL,
    phone TEXT NULL,
    patient_name TEXT NOT NULL,
    treatment_type TEXT NULL,
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_by INTEGER NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_patient_chat_identity_patient ON patient_chat_identities(patient_id, active);
  INSERT OR IGNORE INTO patient_chat_identities (wa_chat_id,patient_id,phone,patient_name,treatment_type,verified_at,verified_by,active)
    SELECT wa_chat_id,patient_id,phone,patient_name,treatment_type,verified_at,verified_by,active
    FROM conversation_patient_links WHERE wa_chat_id IS NOT NULL AND active=1;`
  ,`CREATE TABLE ai_service_settings_v2 (
    service_id INTEGER PRIMARY KEY,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    capacity_per_hour INTEGER NULL DEFAULT NULL,
    required_questions_json TEXT NOT NULL DEFAULT '[]',
    blocked_weekdays_json TEXT NOT NULL DEFAULT '[]',
    blocked_hours_json TEXT NOT NULL DEFAULT '[]',
    available_hours_json TEXT NOT NULL DEFAULT '[]',
    minimum_advance_minutes INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO ai_service_settings_v2(service_id,duration_minutes,capacity_per_hour,required_questions_json,blocked_weekdays_json,blocked_hours_json,available_hours_json,minimum_advance_minutes,enabled,updated_at)
    SELECT service_id,duration_minutes,capacity_per_hour,required_questions_json,blocked_weekdays_json,blocked_hours_json,available_hours_json,minimum_advance_minutes,enabled,updated_at FROM ai_service_settings;
  DROP TABLE ai_service_settings;
  ALTER TABLE ai_service_settings_v2 RENAME TO ai_service_settings;`
  ,`CREATE TABLE IF NOT EXISTS ai_clinical_workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_key TEXT NOT NULL UNIQUE,
    service_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    price_json TEXT NOT NULL DEFAULT '{}',
    xray_json TEXT NOT NULL DEFAULT '{}',
    steps_json TEXT NOT NULL DEFAULT '[]',
    completion_action TEXT NOT NULL DEFAULT 'offer_appointment',
    final_message TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_workflows_enabled_service ON ai_clinical_workflows(service_id, enabled);`
  ,`ALTER TABLE conversation_state ADD COLUMN clinical_workflow_json TEXT NULL;`
  ,`ALTER TABLE ai_clinical_workflows ADD COLUMN information_json TEXT NOT NULL DEFAULT '{}';`
  ,`CREATE TABLE response_queue_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','ready_to_send','sending','completed','cancelled','failed')),
    buffer_started_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_at TEXT NOT NULL,
    batch_version INTEGER NOT NULL DEFAULT 1,
    message_ids_json TEXT NOT NULL DEFAULT '[]',
    consolidated_text TEXT NULL,
    response_text TEXT NULL,
    error TEXT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO response_queue_v2 (id,conversation_id,status,buffer_started_at,due_at,batch_version,message_ids_json,consolidated_text,response_text,error,attempts,created_at,updated_at)
    SELECT id,conversation_id,
      CASE WHEN status IN ('waiting','processing','typing') AND response_text IS NOT NULL THEN 'ready_to_send' ELSE 'generating' END,
      buffer_started_at,due_at,batch_version,message_ids_json,consolidated_text,response_text,error,attempts,created_at,updated_at
    FROM response_queue;
  DROP TABLE response_queue;
  ALTER TABLE response_queue_v2 RENAME TO response_queue;
  CREATE INDEX IF NOT EXISTS idx_response_queue_due ON response_queue(status, due_at);
  CREATE INDEX IF NOT EXISTS idx_response_queue_conversation ON response_queue(conversation_id, status);`
  ,`ALTER TABLE conversations ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'active';
  ALTER TABLE conversations ADD COLUMN last_message_direction TEXT NULL;
  ALTER TABLE conversations ADD COLUMN last_message_at TEXT NULL;
  ALTER TABLE conversations ADD COLUMN last_message_type TEXT NULL;
  ALTER TABLE conversations ADD COLUMN last_message_source TEXT NULL;
  ALTER TABLE conversations ADD COLUMN last_inbound_at TEXT NULL;
  ALTER TABLE conversations ADD COLUMN last_outbound_at TEXT NULL;
  ALTER TABLE conversations ADD COLUMN follow_up_sent INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE conversations ADD COLUMN human_review_reason TEXT NULL;
  CREATE INDEX IF NOT EXISTS idx_conversations_last_activity ON conversations(last_message_at);`
  ,`UPDATE conversation_state SET clinical_workflow_json=NULL, collected_json=json_remove(collected_json, '$.clinicalWorkflow') WHERE clinical_workflow_json IS NOT NULL OR collected_json LIKE '%clinicalWorkflow%';`
  ,`CREATE TABLE IF NOT EXISTS ai_assistant_knowledge (
    id INTEGER PRIMARY KEY CHECK (id=1),
    knowledge TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO ai_assistant_knowledge(id) VALUES (1);
  ALTER TABLE ai_service_settings ADD COLUMN share_price INTEGER NOT NULL DEFAULT 0;`
  ,`ALTER TABLE ai_service_settings ADD COLUMN weekly_hours_json TEXT NOT NULL DEFAULT '{}';`
  // Índices para que borrar conversaciones no haga full-scan: el cascade ON DELETE SET NULL
  // de automation_jobs y el DELETE FROM outgoing_queue WHERE phone=? de deleteConversation.
  ,`CREATE INDEX IF NOT EXISTS idx_jobs_conversation ON automation_jobs(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_outgoing_queue_phone ON outgoing_queue(phone);`
  // listConversations corre en cada tick del poll (cada 2s): tenía una subconsulta
  // correlacionada de "no leídos" por fila y un ORDER BY updated_at sin índice.
  ,`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id) WHERE author='patient' AND read_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_messages_conv_direction ON messages(conversation_id, direction);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);`
  // Tope diario total de la clínica para la IA (NULL = sin tope) + fechas bloqueadas a mano
  // (asueto / cierre administrativo / día lleno). El gate vive en searchAvailability.
  ,`ALTER TABLE ai_clinic_schedule ADD COLUMN daily_cap INTEGER NULL DEFAULT NULL;
    CREATE TABLE IF NOT EXISTS ai_blocked_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`
  // Revisión humana: de una lista de toggles con detección por regex fija pasa a un
  // único texto libre que el agente usa tal cual para decidir cuándo transferir a
  // recepción (herramienta transferir_a_recepcion). Los mensajes de audio/imagen/
  // documento siguen yendo a revisión humana por un guardia determinista aparte.
  ,`ALTER TABLE human_review_rules ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
    UPDATE human_review_rules SET instructions='Pasá la conversación a recepción (no respondas vos) cuando ocurra alguna de estas situaciones:
- El paciente menciona dolor intenso, sangrado, inflamación, un golpe, una urgencia o cualquier síntoma clínico.
- El paciente está molesto, se queja, reclama o amenaza con un reclamo formal o una denuncia.
- El paciente pide hablar con una persona, con recepción o con un doctor.
- La solicitud es ambigua y no lográs aclararla, o se sale de lo que podés resolver por este medio.' WHERE instructions='';`
  // Guarda a qué mensaje responde una reacción (❤️, 👍, etc.) para poder mostrarla
  // pegada a ese mensaje en el chat, en vez de como una burbuja aparte.
  ,`ALTER TABLE messages ADD COLUMN reaction_target_id TEXT NULL;`
  // Lista configurable de textos de mensajes automáticos ajenos a esta app (p. ej.
  // el saludo de bienvenida del propio WhatsApp Business, que no se puede
  // desactivar desde acá y varía por clínica). Si un mensaje saliente coincide con
  // alguno, no cuenta como "ya respondió un humano": si no, la IA nunca contesta el
  // mensaje real del paciente porque ve el último evento como saliente.
  ,`ALTER TABLE message_settings ADD COLUMN ignored_outgoing_texts_json TEXT NOT NULL DEFAULT '[]';`
  // Tope de citas por hora para toda la clínica (NULL = sin tope). Complementa la
  // capacidad por servicio: limita el total de citas activas (IA + recepción, todos
  // los servicios) que caen en una misma hora. El gate vive en searchAvailability.
  ,`ALTER TABLE ai_clinic_schedule ADD COLUMN hourly_cap INTEGER NULL DEFAULT NULL;`
  // Bloqueo parcial de una fecha: además de cerrar el día completo, se pueden
  // bloquear solo ciertas franjas horarias de esa fecha (p. ej. el doctor no
  // llega esa mañana). NULL o '[]' = día completo (comportamiento anterior);
  // '[{"start":"08:00","end":"13:00"}]' = solo esa franja. El gate vive en
  // searchAvailability, junto al de las pausas generales.
  ,`ALTER TABLE ai_blocked_dates ADD COLUMN blocked_hours_json TEXT NULL;`
];

function getDb() {
  if (db) return db;
  ensureDataDirsSync();
  fs.mkdirSync(mensajesDir, { recursive: true });
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec("BEGIN");
  try {
    db.exec(migrations[0]);
    for (let i = 0; i < migrations.length; i += 1) {
      const version = i + 1;
      const exists = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version);
      if (!exists) { db.exec(migrations[i]); db.prepare("INSERT INTO schema_migrations(version) VALUES (?)").run(version); }
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); db = null; throw error; }
  return db;
}

function getDatabasePath() { return DB_FILE; }
module.exports = { getDb, getDatabasePath };
