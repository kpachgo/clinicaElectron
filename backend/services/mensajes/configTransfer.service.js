"use strict";

// Exportar / importar la configuración de la IA de mensajes entre equipos.
// Cubre SOLO configuración (no conversaciones, no vinculaciones de pacientes).
// Incluye la clave del proveedor IA: el archivo resultante contiene un secreto.

const { getDb } = require("../mensajesDatabase.service");

const FORMAT = "clinica-mensajes-config";
const VERSION = 1;

const SINGLETON_COLUMNS = {
  ai_clinic_schedule: ["timezone", "slot_interval_minutes", "schedule_json", "breaks_json", "daily_cap"],
  ai_provider_settings: ["provider_mode", "base_url", "model", "api_key", "timeout_ms"],
  human_review_rules: ["rules_json"],
  message_settings: [
    "response_delay_min", "response_delay_max", "response_group_delay_seconds",
    "automation_phone_mode", "automation_phone_numbers",
    "reminder_template", "reminder_min_delay_seconds", "reminder_max_delay_seconds"
  ],
  automation_settings: [
    "enabled", "appointment_confirmation", "appointment_reminder", "appointment_change_notice",
    "after_hours_reply", "human_intervention_pause", "allowed_start", "allowed_end"
  ],
  administrative_settings: ["clinic_name", "phone", "address", "payment_methods", "cancellation_policy", "faq"]
};

const SERVICE_COLUMNS = [
  "service_id", "duration_minutes", "capacity_per_hour", "minimum_advance_minutes",
  "enabled", "share_price", "weekly_hours_json"
];

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
}

function pickSingleton(db, table) {
  const cols = SINGLETON_COLUMNS[table];
  const row = db.prepare(`SELECT ${cols.join(", ")} FROM ${table} WHERE id=1`).get() || {};
  const out = {};
  for (const col of cols) out[col] = row[col] ?? null;
  return out;
}

function exportConfig(db = getDb()) {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    knowledge: db.prepare("SELECT knowledge FROM ai_assistant_knowledge WHERE id=1").get()?.knowledge || "",
    clinicSchedule: pickSingleton(db, "ai_clinic_schedule"),
    providerSettings: pickSingleton(db, "ai_provider_settings"),
    humanReviewRules: pickSingleton(db, "human_review_rules"),
    messageSettings: pickSingleton(db, "message_settings"),
    automationSettings: pickSingleton(db, "automation_settings"),
    administrativeSettings: pickSingleton(db, "administrative_settings"),
    serviceSettings: db.prepare(`SELECT ${SERVICE_COLUMNS.join(", ")} FROM ai_service_settings`).all(),
    serviceAliases: db.prepare("SELECT service_id, alias, normalized_alias FROM ai_service_aliases").all(),
    blockedDates: db.prepare("SELECT date, reason FROM ai_blocked_dates").all()
  };
}

function updateSingleton(db, table, incoming, { skipEmpty = [] } = {}) {
  if (!incoming || typeof incoming !== "object") return;
  const cols = SINGLETON_COLUMNS[table].filter((col) => col in incoming);
  const applied = cols.filter((col) => !(skipEmpty.includes(col) && (incoming[col] === "" || incoming[col] === null)));
  if (!applied.length) return;
  const setSql = applied.map((col) => `${col}=?`).join(", ");
  db.prepare(`UPDATE ${table} SET ${setSql}, updated_at=datetime('now') WHERE id=1`)
    .run(...applied.map((col) => incoming[col]));
}

function importConfig(payload, db = getDb()) {
  if (!payload || payload.format !== FORMAT) throw new Error("El archivo no es una configuración de mensajes válida");
  if (Number(payload.version) !== VERSION) throw new Error(`Versión de configuración no soportada (${payload.version})`);

  const summary = { services: 0, aliases: 0, blockedDates: 0 };
  const today = todayIso();

  const run = db.transaction(() => {
    if (typeof payload.knowledge === "string") {
      db.prepare("UPDATE ai_assistant_knowledge SET knowledge=?, updated_at=datetime('now') WHERE id=1").run(payload.knowledge);
    }

    updateSingleton(db, "ai_clinic_schedule", payload.clinicSchedule);
    // La clave se conserva si el export no traía ninguna (api_key vacío).
    updateSingleton(db, "ai_provider_settings", payload.providerSettings, { skipEmpty: ["api_key"] });
    updateSingleton(db, "human_review_rules", payload.humanReviewRules);
    updateSingleton(db, "message_settings", payload.messageSettings);
    updateSingleton(db, "automation_settings", payload.automationSettings);
    updateSingleton(db, "administrative_settings", payload.administrativeSettings);

    if (Array.isArray(payload.serviceSettings)) {
      const upsert = db.prepare(`
        INSERT INTO ai_service_settings
          (service_id, duration_minutes, capacity_per_hour, required_questions_json, blocked_weekdays_json, blocked_hours_json, available_hours_json, weekly_hours_json, minimum_advance_minutes, enabled, share_price, updated_at)
        VALUES (@service_id, @duration_minutes, @capacity_per_hour, '[]', '[]', '[]', '[]', @weekly_hours_json, @minimum_advance_minutes, @enabled, @share_price, datetime('now'))
        ON CONFLICT(service_id) DO UPDATE SET
          duration_minutes=excluded.duration_minutes,
          capacity_per_hour=excluded.capacity_per_hour,
          weekly_hours_json=excluded.weekly_hours_json,
          minimum_advance_minutes=excluded.minimum_advance_minutes,
          enabled=excluded.enabled,
          share_price=excluded.share_price,
          updated_at=datetime('now')
      `);
      const delAliases = db.prepare("DELETE FROM ai_service_aliases WHERE service_id=?");
      const insAlias = db.prepare("INSERT OR IGNORE INTO ai_service_aliases(service_id, alias, normalized_alias) VALUES (?, ?, ?)");
      const aliasesBySvc = new Map();
      for (const a of Array.isArray(payload.serviceAliases) ? payload.serviceAliases : []) {
        if (!aliasesBySvc.has(a.service_id)) aliasesBySvc.set(a.service_id, []);
        aliasesBySvc.get(a.service_id).push(a);
      }
      for (const svc of payload.serviceSettings) {
        const id = Number(svc.service_id);
        if (!Number.isInteger(id) || id < 1) continue;
        upsert.run({
          service_id: id,
          duration_minutes: Number(svc.duration_minutes) || 30,
          capacity_per_hour: svc.capacity_per_hour === null || svc.capacity_per_hour === undefined || svc.capacity_per_hour === "" ? null : Number(svc.capacity_per_hour),
          weekly_hours_json: typeof svc.weekly_hours_json === "string" ? svc.weekly_hours_json : "{}",
          minimum_advance_minutes: Number(svc.minimum_advance_minutes) || 0,
          enabled: svc.enabled ? 1 : 0,
          share_price: svc.share_price ? 1 : 0
        });
        summary.services += 1;
        delAliases.run(id);
        for (const a of aliasesBySvc.get(svc.service_id) || aliasesBySvc.get(id) || []) {
          if (a && a.alias && a.normalized_alias) { insAlias.run(id, String(a.alias), String(a.normalized_alias)); summary.aliases += 1; }
        }
      }
    }

    if (Array.isArray(payload.blockedDates)) {
      db.prepare("DELETE FROM ai_blocked_dates").run();
      const ins = db.prepare("INSERT OR IGNORE INTO ai_blocked_dates(date, reason) VALUES (?, ?)");
      for (const b of payload.blockedDates) {
        if (b && /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) && String(b.date) >= today) {
          ins.run(String(b.date), String(b.reason || "").slice(0, 200));
          summary.blockedDates += 1;
        }
      }
    }
  });

  run();
  return summary;
}

module.exports = { exportConfig, importConfig, FORMAT, VERSION };
