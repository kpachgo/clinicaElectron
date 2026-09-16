const { getDb } = require("../../services/mensajesDatabase.service");
const { normalizePhone } = require("./connectors/messagingConnector");

// Mismo criterio que el conector: un LID (13-16 digitos) parece un telefono pero no
// lo es. Solo el numero local salvadoreno de 8 digitos (11 con el 503) cuenta como
// identidad de la conversacion; cualquier otra cosa se trata como "sin resolver".
function persistedPhone(value) { const digits = String(value || "").replace(/\D/g, ""); return digits.startsWith("503") && digits.length === 11 ? digits.slice(3) : digits; }
function isRealPhone(value, waChatId = "") {
  const digits = persistedPhone(value);
  if (digits.length !== 8) return false;
  const raw = String(waChatId || "");
  return !raw.endsWith("@lid") || digits !== raw.slice(0, raw.indexOf("@"));
}

function toConversation(row) {
  return row ? { ...row, patientId: row.patient_id, attentionMode: row.attention_mode, humanOwnerId: row.human_owner_id, responseDelayMin: row.response_delay_min, responseDelayMax: row.response_delay_max, waChatId: row.wa_chat_id, waContactNumber: row.wa_contact_number, waDisplayName: row.wa_display_name, lifecycleState: row.lifecycle_state, lastMessageDirection: row.last_message_direction, lastMessageAt: row.last_message_at, lastMessageType: row.last_message_type, lastMessageSource: row.last_message_source, lastInboundAt: row.last_inbound_at, lastOutboundAt: row.last_outbound_at, followUpSent: Boolean(row.follow_up_sent), humanReviewReason: row.human_review_reason, phoneResolved: isRealPhone(row.wa_contact_number, row.wa_chat_id) || isRealPhone(row.phone, row.wa_chat_id), createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

function toMessage(row) {
  return row ? { ...row, conversationId: row.conversation_id, externalId: row.external_id, deliveryStatus: row.delivery_status, messageAt: row.message_at, createdAt: row.created_at, reactionTargetId: row.reaction_target_id } : null;
}
function phoneRuleVariants(value) { const digits = String(value || "").replace(/\D/g, ""); return [...new Set([digits, digits.length === 11 && digits.startsWith("503") ? digits.slice(3) : ""].filter(Boolean))]; }

class MensajesRepository {
  constructor(database = getDb()) {
    this.db = database;
  }

  findOrCreateConversation(phone, options = {}) {
    const waChatId = typeof options.waChatId === "string" && options.waChatId.trim() ? options.waChatId.trim() : null;
    const rawPhone = String(phone || "");
    const normalizedPhone = waChatId?.endsWith("@lid") && rawPhone === waChatId ? null : (phone ? normalizePhone(phone) : null);
    // Un LID, la forma con prefijo 503 o el numero de la propia clinica no pueden
    // pisar el telefono de la conversacion: conversations.phone es UNIQUE y el merge
    // de mas abajo fusiona cualquier otra conversacion que comparta ese valor.
    let waContactNumber = isRealPhone(options.waContactNumber, waChatId) ? normalizePhone(persistedPhone(options.waContactNumber)) : null;
    // Si el conector no resolvió el teléfono de este @lid pero ya lo resolvimos
    // alguna vez, lo tomamos del mapa persistente: así el merge ocurre en el
    // primer mensaje, sin ventana de duplicado esperando a WhatsApp.
    if (!waContactNumber && waChatId && waChatId.endsWith("@lid")) {
      const known = this.knownLidPhone(waChatId);
      if (known) waContactNumber = known;
    }
    if (waContactNumber && waChatId && waChatId.endsWith("@lid")) this.rememberLidPhone(waChatId, waContactNumber);
    const waDisplayName = typeof options.waDisplayName === "string" && options.waDisplayName.trim() ? options.waDisplayName.trim() : null;
    const existing = waChatId
      ? this.db.prepare("SELECT * FROM conversations WHERE wa_chat_id=? AND status <> 'closed' LIMIT 1").get(waChatId)
      : (normalizedPhone ? this.db.prepare("SELECT * FROM conversations WHERE phone=? AND status <> 'closed' LIMIT 1").get(normalizedPhone) : null);
    if (existing) {
      // Primero fusionamos una conversación que ya tenga el teléfono real.
      // Si actualizamos el teléfono antes, el índice único de conversaciones
      // aborta la operación y el mensaje no llega a SQLite.
      if (waContactNumber) this.mergeDuplicateWhatsAppConversation(waChatId, waContactNumber);
      const replaceSimulationChat = waChatId && !waChatId.startsWith("simulated:") && String(existing.wa_chat_id || "").startsWith("simulated:");
      const chatId = replaceSimulationChat ? waChatId : (existing.wa_chat_id || waChatId);
      // Si el teléfono quedó en otra conversación que no se pudo fusionar (otro chat
      // de WhatsApp real), no lo pisamos: conversations.phone es UNIQUE y la escritura
      // abortaría la transacción entera, perdiendo el mensaje.
      const phoneToStamp = waContactNumber && !this.phoneTakenByOther(waContactNumber, existing.id) ? waContactNumber : null;
      this.db.prepare("UPDATE conversations SET wa_chat_id=?, wa_contact_number=COALESCE(?,wa_contact_number), wa_display_name=COALESCE(?,wa_display_name), phone=CASE WHEN ? IS NOT NULL THEN ? ELSE phone END WHERE id=?").run(chatId, waContactNumber, waDisplayName, phoneToStamp, phoneToStamp, existing.id);
      return this.getConversation(existing.id);
    }
    // Chat id que quedó apuntando a una conversación tras una fusión (p. ej. el
    // @c.us viejo de una persona que WhatsApp migró a @lid). Sin esto, cada
    // mensaje nuevo por el id viejo vuelve a partir la conversación.
    if (waChatId) {
      const aliased = this.db.prepare("SELECT c.* FROM wa_chat_aliases a JOIN conversations c ON c.id=a.conversation_id WHERE a.wa_chat_id=? AND c.status <> 'closed' LIMIT 1").get(waChatId);
      if (aliased) {
        if (waContactNumber && !this.phoneTakenByOther(waContactNumber, aliased.id)) {
          this.db.prepare("UPDATE conversations SET wa_contact_number=COALESCE(?,wa_contact_number), wa_display_name=COALESCE(?,wa_display_name) WHERE id=?").run(waContactNumber, waDisplayName, aliased.id);
        }
        return this.getConversation(aliased.id);
      }
    }
    // Sabemos el teléfono real de este @lid (lo trajo el conector o el mapa
    // persistente) y ya hay una conversación con ese teléfono: es la misma
    // persona. El @lid pasa a ser el chat id vigente y el viejo queda de alias.
    if (waChatId && waContactNumber && waChatId !== `${waContactNumber}@c.us`) {
      const byContact = this.db.prepare("SELECT * FROM conversations WHERE phone=? AND status <> 'closed' AND wa_chat_id <> ? ORDER BY id LIMIT 1").get(waContactNumber, waChatId);
      if (byContact) {
        if (byContact.wa_chat_id && byContact.wa_chat_id !== waChatId) {
          this.db.prepare("DELETE FROM wa_chat_aliases WHERE wa_chat_id=?").run(waChatId);
          this.db.prepare("UPDATE conversations SET wa_chat_id=? WHERE id=?").run(waChatId, byContact.id);
          this.db.prepare("INSERT INTO wa_chat_aliases (wa_chat_id, conversation_id) VALUES (?, ?) ON CONFLICT(wa_chat_id) DO UPDATE SET conversation_id=excluded.conversation_id").run(byContact.wa_chat_id, byContact.id);
        }
        this.db.prepare("UPDATE conversations SET wa_contact_number=COALESCE(?,wa_contact_number), wa_display_name=COALESCE(?,wa_display_name) WHERE id=?").run(waContactNumber, waDisplayName, byContact.id);
        return this.getConversation(byContact.id);
      }
    }
    const byPhone = waChatId && normalizedPhone ? this.db.prepare("SELECT * FROM conversations WHERE phone=? AND status <> 'closed' LIMIT 1").get(normalizedPhone) : null;
    if (byPhone) {
      const replaceSimulationChat = waChatId && !waChatId.startsWith("simulated:") && String(byPhone.wa_chat_id || "").startsWith("simulated:");
      const chatId = replaceSimulationChat ? waChatId : (byPhone.wa_chat_id || waChatId);
      this.db.prepare("UPDATE conversations SET wa_chat_id=?, wa_contact_number=COALESCE(?,wa_contact_number), wa_display_name=COALESCE(?,wa_display_name) WHERE id=?").run(chatId, waContactNumber, waDisplayName, byPhone.id);
      return this.getConversation(byPhone.id);
    }
    const result = this.db.prepare("INSERT INTO conversations (phone, patient_id, attention_mode, wa_chat_id, wa_contact_number, wa_display_name) VALUES (?, ?, ?, ?, ?, ?)").run(waContactNumber || normalizedPhone || waChatId, options.patientId || null, options.attentionMode || "assistant", waChatId, waContactNumber, waDisplayName);
    return toConversation(this.db.prepare("SELECT * FROM conversations WHERE id=?").get(result.lastInsertRowid));
  }

  getConversation(id) {
    return toConversation(this.db.prepare("SELECT * FROM conversations WHERE id=?").get(id));
  }

  updateWhatsAppContact(conversationId, phone, displayName = null) {
    if (!isRealPhone(phone)) return this.getConversation(conversationId);
    const normalized = normalizePhone(persistedPhone(phone));
    const own = this.db.prepare("SELECT wa_chat_id, patient_id FROM conversations WHERE id=?").get(conversationId);
    if (own?.wa_chat_id?.endsWith("@lid")) this.rememberLidPhone(own.wa_chat_id, normalized);
    const duplicate = this.db.prepare("SELECT * FROM conversations WHERE phone=? AND id<>? AND status <> 'closed' LIMIT 1").get(normalized, conversationId);
    if (duplicate && !this.isAbsorbable(duplicate, own?.wa_chat_id || "", own?.patient_id || null)) {
      // El teléfono ya identifica a otro chat de WhatsApp: solo actualizamos el nombre.
      this.db.prepare("UPDATE conversations SET wa_display_name=COALESCE(?,wa_display_name), updated_at=datetime('now') WHERE id=?").run(displayName || null, conversationId);
      return this.getConversation(conversationId);
    }
    if (duplicate) this.mergeConversation(duplicate.id, conversationId);
    this.db.prepare("UPDATE conversations SET phone=?, wa_contact_number=?, wa_display_name=COALESCE(?,wa_display_name), updated_at=datetime('now') WHERE id=?").run(normalized, normalized, displayName || null, conversationId);
    return this.getConversation(conversationId);
  }

  // Una conversación solo se puede absorber si NO representa otro chat de WhatsApp:
  // sin wa_chat_id (registro creado solo por teléfono), simulada, el mismo chat, o
  // un chat @c.us que nunca recibió respuesta (el cascarón que deja un recordatorio
  // enviado a un número con el que la cuenta nunca había hablado: WhatsApp identifica
  // la respuesta con un @lid propio y esa se vuelve la conversación real).
  // Dos chats reales distintos (con historial en ambos sentidos) nunca son la misma
  // conversación por más que compartan el teléfono, y fusionarlos movería los
  // mensajes de un paciente al chat de otro y borraría el original.
  isAbsorbable(candidate, waChatId, resolvingPatientId = undefined) {
    const chatId = String(candidate?.wa_chat_id || "");
    if (!chatId || chatId === waChatId || chatId.startsWith("simulated:")) return true;
    if (chatId.endsWith("@c.us") && !this.hasIncomingMessages(candidate.id)) return true;
    // WhatsApp resolvió este @lid a un teléfono que ya tiene un chat @c.us: es la
    // misma persona (migración LID), no dos chats distintos — salvo que cada uno
    // esté vinculado a un paciente DISTINTO (familiares que comparten número).
    if (String(waChatId || "").endsWith("@lid") && resolvingPatientId !== undefined) {
      const candidatePatientId = candidate?.patient_id || null;
      if (!candidatePatientId || !resolvingPatientId || candidatePatientId === resolvingPatientId) return true;
    }
    return false;
  }

  hasIncomingMessages(conversationId) {
    return Boolean(this.db.prepare("SELECT 1 FROM messages WHERE conversation_id=? AND direction='incoming' LIMIT 1").get(conversationId));
  }

  // Mapa persistente LID -> teléfono real.
  knownLidPhone(lid) {
    if (typeof lid !== "string" || !lid.endsWith("@lid")) return null;
    const row = this.db.prepare("SELECT phone FROM lid_phone_map WHERE lid=? LIMIT 1").get(lid);
    const p = row && persistedPhone(row.phone);
    return isRealPhone(p) ? normalizePhone(p) : null;
  }

  rememberLidPhone(lid, phone) {
    if (typeof lid !== "string" || !lid.endsWith("@lid")) return;
    const p = persistedPhone(phone);
    if (!isRealPhone(p)) return;
    this.db.prepare("INSERT INTO lid_phone_map (lid, phone, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(lid) DO UPDATE SET phone=excluded.phone, updated_at=datetime('now')").run(lid, normalizePhone(p));
  }

  phoneTakenByOther(phone, conversationId) {
    const normalized = normalizePhone(persistedPhone(phone));
    return Boolean(this.db.prepare("SELECT 1 FROM conversations WHERE phone=? AND id<>? AND status <> 'closed' LIMIT 1").get(normalized, conversationId));
  }

  mergeConversation(sourceId, targetId) {
    if (sourceId === targetId) return this.getConversation(targetId);
    const tables = ["messages", "message_actions", "ai_runs", "automation_jobs", "outgoing_queue"];
    const source = this.db.prepare("SELECT patient_id, wa_chat_id FROM conversations WHERE id=?").get(sourceId);
    const target = this.db.prepare("SELECT wa_chat_id FROM conversations WHERE id=?").get(targetId);
    const transaction = this.db.transaction(() => {
      for (const table of tables) {
        if (table === "outgoing_queue") continue;
        this.db.prepare(`UPDATE ${table} SET conversation_id=? WHERE conversation_id=?`).run(targetId, sourceId);
      }
      this.db.prepare("DELETE FROM response_queue WHERE conversation_id=?").run(sourceId);
      this.db.prepare("DELETE FROM conversation_state WHERE conversation_id=?").run(sourceId);
      // El chat absorbido puede haber sido identificado por recepción: no dejamos
      // vinculaciones colgando de una conversación que ya no existe.
      this.db.prepare("UPDATE conversation_patient_links SET active=0 WHERE conversation_id=?").run(sourceId);
      // La identidad de paciente activa (esté en el chat id del absorbido o del
      // superviviente) queda apuntando al chat id del superviviente, para que
      // getPatientLink resuelva sin depender de qué mitad ganó la fusión.
      if (target?.wa_chat_id) {
        const active = this.db.prepare("SELECT * FROM patient_chat_identities WHERE wa_chat_id IN (?, ?) AND active=1 ORDER BY verified_at DESC, id DESC LIMIT 1").get(source?.wa_chat_id || "", target.wa_chat_id);
        if (active && active.wa_chat_id !== target.wa_chat_id) {
          this.db.prepare("UPDATE patient_chat_identities SET active=0 WHERE wa_chat_id=?").run(active.wa_chat_id);
          this.db.prepare(`INSERT INTO patient_chat_identities (wa_chat_id,patient_id,phone,patient_name,treatment_type,verified_by,active,verified_at) VALUES (?,?,?,?,?,?,1,datetime('now')) ON CONFLICT(wa_chat_id) DO UPDATE SET patient_id=excluded.patient_id,phone=excluded.phone,patient_name=excluded.patient_name,treatment_type=excluded.treatment_type,verified_by=excluded.verified_by,active=1,verified_at=datetime('now')`).run(target.wa_chat_id, active.patient_id, active.phone, active.patient_name, active.treatment_type, active.verified_by);
        }
      }
      // Los chat ids del absorbido (el suyo propio y los que ya apuntaban a él)
      // pasan a resolver a la conversación destino. Así los mensajes que sigan
      // llegando por el id viejo caen en la conversación correcta.
      this.db.prepare("UPDATE wa_chat_aliases SET conversation_id=? WHERE conversation_id=?").run(targetId, sourceId);
      if (source?.wa_chat_id && source.wa_chat_id !== target?.wa_chat_id) {
        this.db.prepare("INSERT INTO wa_chat_aliases (wa_chat_id, conversation_id) VALUES (?, ?) ON CONFLICT(wa_chat_id) DO UPDATE SET conversation_id=excluded.conversation_id").run(source.wa_chat_id, targetId);
      }
      this.db.prepare("DELETE FROM wa_chat_aliases WHERE wa_chat_id=(SELECT wa_chat_id FROM conversations WHERE id=?)").run(targetId);
      this.db.prepare("DELETE FROM conversations WHERE id=?").run(sourceId);
      // El chat absorbido puede traer un paciente vinculado que el destino todavia
      // no tiene (p. ej. el cascaron de un recordatorio ya vinculado por telefono).
      if (source?.patient_id) this.db.prepare("UPDATE conversations SET patient_id=COALESCE(patient_id,?) WHERE id=?").run(source.patient_id, targetId);
    });
    transaction();
    return this.getConversation(targetId);
  }

  // Todos los teléfonos reales (8 dígitos) por los que se conoce a una
  // conversación: su propio contacto y el de su identidad de paciente activa.
  conversationRealPhones(conv) {
    const out = new Set();
    const add = (v) => { const p = persistedPhone(v); if (isRealPhone(p)) out.add(p); };
    add(conv.wa_contact_number ?? conv.waContactNumber);
    add(conv.phone);
    if (conv.wa_chat_id ?? conv.waChatId) {
      const idn = this.db.prepare("SELECT phone FROM patient_chat_identities WHERE wa_chat_id=? AND active=1 LIMIT 1").get(conv.wa_chat_id ?? conv.waChatId);
      if (idn) add(idn.phone);
    }
    return out;
  }

  // Paciente al que pertenece la conversación: el vínculo directo, o —si no lo
  // tiene— el de una conversación vinculada que comparta un teléfono real (la
  // migración @c.us -> @lid de WhatsApp deja el id nuevo sin identidad). Solo
  // resuelve si hay UN único candidato (evita mezclar familiares homónimos).
  resolvePatientForConversation(conversation) {
    const direct = conversation?.patientId ?? conversation?.patient_id ?? null;
    if (direct) return direct;
    const mine = this.conversationRealPhones(conversation);
    if (!mine.size) return null;
    const linked = this.db.prepare("SELECT * FROM conversations WHERE patient_id IS NOT NULL AND status <> 'closed' AND id <> ?").all(conversation.id ?? -1);
    const hits = new Set();
    for (const l of linked) {
      for (const p of this.conversationRealPhones(l)) if (mine.has(p)) { hits.add(l.patient_id); break; }
    }
    return hits.size === 1 ? [...hits][0] : null;
  }

  // Dos conversaciones abiertas de la misma persona son un duplicado (split de la
  // migración @c.us -> @lid de WhatsApp): se fusionan. Sobrevive la que tiene
  // teléfono real / es @c.us; a igualdad, la más antigua.
  mergeConversationsForSamePatient(conversation) {
    const patientId = this.resolvePatientForConversation(conversation);
    if (!patientId) return conversation;
    const currentId = conversation?.id ?? null;
    const all = this.db.prepare("SELECT * FROM conversations WHERE patient_id=? AND status <> 'closed'").all(patientId).map(toConversation);
    if (currentId && !all.some((c) => c.id === currentId)) {
      const row = this.db.prepare("SELECT * FROM conversations WHERE id=? AND status <> 'closed'").get(currentId);
      if (row) all.push(toConversation(row));
    }
    if (all.length < 2) return conversation;
    const score = (c) => (c.phoneResolved ? 2 : 0) + (String(c.waChatId || "").endsWith("@c.us") ? 1 : 0);
    const survivor = all.reduce((best, c) => {
      const sb = score(best);
      const sc = score(c);
      if (sc !== sb) return sc > sb ? c : best;
      return c.id < best.id ? c : best;
    });
    for (const c of all) if (c.id !== survivor.id) this.mergeConversation(c.id, survivor.id);
    this.db.prepare("UPDATE conversations SET patient_id=COALESCE(patient_id,?) WHERE id=?").run(patientId, survivor.id);
    return this.getConversation(survivor.id);
  }

  // Pasada de reconciliación (arranque): junta duplicados ya existentes de la
  // misma persona — por paciente compartido y por teléfono compartido con una
  // conversación vinculada.
  reconcilePatientDuplicates() {
    const count = () => this.db.prepare("SELECT COUNT(*) n FROM conversations WHERE status <> 'closed'").get().n;
    const before = count();
    for (const { patient_id } of this.db.prepare("SELECT patient_id FROM conversations WHERE patient_id IS NOT NULL AND status <> 'closed' GROUP BY patient_id HAVING COUNT(*) > 1").all()) {
      this.mergeConversationsForSamePatient({ patientId: patient_id });
    }
    for (const { id } of this.db.prepare("SELECT id FROM conversations WHERE patient_id IS NULL AND status <> 'closed'").all()) {
      const row = this.db.prepare("SELECT * FROM conversations WHERE id=? AND status <> 'closed'").get(id);
      if (row) this.mergeConversationsForSamePatient(toConversation(row));
    }
    return Math.max(0, before - count());
  }

  mergeDuplicateWhatsAppConversation(waChatId, phone) {
    if (!waChatId || !isRealPhone(phone, waChatId)) return null;
    const normalized = normalizePhone(persistedPhone(phone));
    const target = this.db.prepare("SELECT * FROM conversations WHERE wa_chat_id=? AND status <> 'closed' LIMIT 1").get(waChatId);
    if (!target) return null;
    const duplicate = this.db.prepare("SELECT * FROM conversations WHERE phone=? AND id<>? AND status <> 'closed' ORDER BY id LIMIT 1").get(normalized, target.id);
    if (duplicate && !this.isAbsorbable(duplicate, waChatId, target.patient_id || null)) {
      // El teléfono pertenece a otro chat real. No se fusiona ni se pisa el teléfono:
      // el wa_contact_number del target queda como está y este chat sigue con su
      // identidad propia hasta que WhatsApp devuelva un número que sea solo suyo.
      return this.getConversation(target.id);
    }
    if (duplicate) this.mergeConversation(duplicate.id, target.id);
    this.db.prepare("UPDATE conversations SET phone=?, wa_contact_number=? WHERE id=?").run(normalized, normalized, target.id);
    return this.getConversation(target.id);
  }

  listConversations(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
    return this.db.prepare("SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.author='patient' AND m.read_at IS NULL) AS unread_count FROM conversations c WHERE NOT (c.wa_chat_id LIKE '%@lid' AND NOT EXISTS (SELECT 1 FROM messages incoming WHERE incoming.conversation_id=c.id AND incoming.direction='incoming')) ORDER BY c.updated_at DESC LIMIT ?").all(limit).map((row) => ({ ...toConversation(row), unreadCount: row.unread_count }));
  }

  saveMessage({ conversationId, externalId, direction, author, text, messageAt, rawType = "text", reactionTargetId = null, source = "live" }) {
    if (!conversationId || !externalId || !direction || !author || typeof text !== "string" || !text.trim()) {
      throw new TypeError("Datos de mensaje incompletos");
    }
    const existing = this.db.prepare("SELECT * FROM messages WHERE external_id=? LIMIT 1").get(externalId);
    if (existing) {
      if (direction === "outgoing" && author && existing.author !== author) {
        this.db.prepare("UPDATE messages SET author=? WHERE id=?").run(author, existing.id);
        return { message: toMessage(this.db.prepare("SELECT * FROM messages WHERE id=?").get(existing.id)), duplicate: true };
      }
      return { message: toMessage(existing), duplicate: true };
    }
    // Mensajes salientes que son saludos automáticos ajenos a esta app (ver
    // ignored_outgoing_texts_json, configurables en Ajustes): ni se guardan ni
    // afectan la conversación. Si se guardaran, la IA vería el último evento
    // como saliente y nunca contestaría el mensaje real del paciente.
    if (direction === "outgoing" && this.isIgnoredOutgoingText(text)) {
      return { message: null, duplicate: false, ignored: true };
    }
    // Dedup de salientes por contenido: el mismo mensaje llega por varias vías con
    // external_id distinto (el envío directo de la IA, el evento message_create, y
    // la recuperación de no leídos — para @lid el _serialized real viene null y se
    // sintetiza uno distinto en cada camino). Mismo chat + mismo texto + a menos
    // de 3 min = es el mismo mensaje, no lo duplicamos.
    if (direction === "outgoing") {
      const at = messageAt || new Date().toISOString();
      const dup = this.db.prepare("SELECT * FROM messages WHERE conversation_id=? AND direction='outgoing' AND content=? AND ABS(strftime('%s', message_at) - strftime('%s', ?)) <= 180 LIMIT 1").get(conversationId, text.trim(), at);
      if (dup) {
        if (author && dup.author !== author && author === "ai") this.db.prepare("UPDATE messages SET author=? WHERE id=?").run(author, dup.id);
        return { message: toMessage(this.db.prepare("SELECT * FROM messages WHERE id=?").get(dup.id)), duplicate: true };
      }
    }
    const insert = this.db.prepare("INSERT INTO messages (conversation_id, external_id, direction, author, content, delivery_status, message_at, reaction_target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const update = this.db.prepare(`UPDATE conversations SET updated_at=datetime('now'), lifecycle_state=CASE WHEN ?='incoming' THEN 'active' ELSE lifecycle_state END, last_message_direction=?, last_message_at=?, last_message_type=?, last_message_source=?, last_inbound_at=CASE WHEN ?='incoming' THEN ? ELSE last_inbound_at END, last_outbound_at=CASE WHEN ?='outgoing' THEN ? ELSE last_outbound_at END WHERE id=?`);
    const transaction = this.db.transaction(() => {
      const result = insert.run(conversationId, externalId, direction, author, text.trim(), direction === "incoming" ? "received" : "sent", messageAt || new Date().toISOString(), reactionTargetId || null);
      const effectiveMessageAt = messageAt || new Date().toISOString();
      update.run(direction, direction, effectiveMessageAt, rawType, source, direction, effectiveMessageAt, direction, effectiveMessageAt, conversationId);
      return this.db.prepare("SELECT * FROM messages WHERE id=?").get(result.lastInsertRowid);
    });
    return { message: toMessage(transaction()), duplicate: false };
  }

  saveIncomingMessage(event) {
    let conversation = this.findOrCreateConversation(event.waContactNumber || event.phone || event.waChatId, event);
    const identity = this.getPatientLink(conversation.id);
    if (identity && conversation.patientId !== identity.patientId) {
      this.updateConversation(conversation.id, { patientId: identity.patientId });
      conversation = this.getConversation(conversation.id);
    }
    conversation = this.mergeConversationsForSamePatient(conversation);
    const saved = this.saveMessage({ conversationId: conversation.id, externalId: event.externalId, direction: "incoming", author: "patient", text: event.text, messageAt: event.messageAt, rawType: event.rawType, reactionTargetId: event.reactionTargetId, source: event.source });
    return { conversation, ...saved };
  }

  saveOutgoingMessage({ phone, externalId, text, author = "human", messageAt, waChatId = null, waContactNumber = null, waDisplayName = null, rawType = "text", reactionTargetId = null, source = "live" }) {
    let conversation = this.findOrCreateConversation(waContactNumber || phone, { waChatId, waContactNumber, waDisplayName });
    conversation = this.mergeConversationsForSamePatient(conversation);
    const saved = this.saveMessage({ conversationId: conversation.id, externalId, direction: "outgoing", author, text, messageAt, rawType, reactionTargetId, source });
    return { conversation, ...saved };
  }
  saveAutomationMessage({ phone, externalId, text, messageAt }) { const conversation = this.findOrCreateConversation(phone); const saved = this.saveMessage({ conversationId: conversation.id, externalId, direction: "outgoing", author: "system", text, messageAt }); return { conversation, ...saved }; }

  updateMessageStatus(externalId, status, error = null) {
    this.db.prepare("UPDATE messages SET delivery_status=?, error=? WHERE external_id=?").run(status, error, externalId);
    return toMessage(this.db.prepare("SELECT * FROM messages WHERE external_id=? LIMIT 1").get(externalId));
  }

  enqueueOutgoing(phone, content, idempotencyKey, options = {}) {
    const waChatId = options.waChatId || null;
    const duplicate = this.db.prepare("SELECT * FROM outgoing_queue WHERE phone=? AND content=? AND status='sent' AND updated_at >= datetime('now','-60 seconds') AND ((wa_chat_id IS NULL AND ? IS NULL) OR wa_chat_id=?) ORDER BY id DESC LIMIT 1").get(phone, content, waChatId, waChatId);
    if (duplicate) return duplicate;
    this.db.prepare("INSERT OR IGNORE INTO outgoing_queue(phone, wa_chat_id, content, idempotency_key) VALUES (?, ?, ?, ?)").run(phone, waChatId, content, idempotencyKey);
    return this.db.prepare("SELECT * FROM outgoing_queue WHERE idempotency_key=?").get(idempotencyKey);
  }
  listPendingOutgoing(limit = 20) { return this.db.prepare("SELECT * FROM outgoing_queue WHERE status='pending' ORDER BY id LIMIT ?").all(Math.min(Math.max(Number(limit) || 20, 1), 100)); }
  claimOutgoing(id) { return this.db.prepare("UPDATE outgoing_queue SET status='sending', updated_at=datetime('now') WHERE id=? AND status='pending'").run(id).changes > 0; }
  markOutgoingSent(id) { this.db.prepare("UPDATE outgoing_queue SET status='sent', updated_at=datetime('now') WHERE id=?").run(id); }
  // Un error de WhatsApp puede ocurrir despues de que el servidor haya aceptado
  // el mensaje. No se reintenta automaticamente para evitar duplicados; el
  // usuario puede usar el boton Reintentar de forma explicita.
  markOutgoingFailed(id, error) { this.db.prepare("UPDATE outgoing_queue SET status='failed', attempts=attempts+1, last_error=?, updated_at=datetime('now') WHERE id=?").run(String(error || "Error de envio"), id); }
  getReminderSettings() { const row = this.db.prepare("SELECT reminder_template AS template, reminder_min_delay_seconds AS minDelaySeconds, reminder_max_delay_seconds AS maxDelaySeconds FROM message_settings WHERE id=1").get(); return { template: row?.template || "Hola {{nombre}}, le recordamos su cita del {{fecha}} a las {{hora}} por {{tratamiento}}.", minDelaySeconds: Number(row?.minDelaySeconds ?? 30), maxDelaySeconds: Number(row?.maxDelaySeconds ?? 90) }; }
  updateReminderSettings(settings) { this.db.prepare("UPDATE message_settings SET reminder_template=?, reminder_min_delay_seconds=?, reminder_max_delay_seconds=?, updated_at=datetime('now') WHERE id=1").run(settings.template, settings.minDelaySeconds, settings.maxDelaySeconds); return this.getReminderSettings(); }
  createReminderBatch({ date, template, minDelay, maxDelay, items }) { return this.db.transaction(() => { const b = this.db.prepare("INSERT INTO reminder_batches (appointment_date,template,min_delay_seconds,max_delay_seconds,total_count,status) VALUES (?,?,?,?,?,'queued')").run(date, template, minDelay, maxDelay, items.length); const insert = this.db.prepare("INSERT INTO reminder_batch_items (batch_id,appointment_id,patient_name,phone,appointment_date,appointment_time,treatment,appointment_status,content) VALUES (?,?,?,?,?,?,?,?,?)"); for (const x of items) insert.run(b.lastInsertRowid, x.appointmentId, x.patientName, x.phone, date, x.time, x.treatment || "", x.status || "", x.content); return this.getReminderBatch(b.lastInsertRowid); })(); }
  getReminderBatch(id) { const batch = this.db.prepare("SELECT * FROM reminder_batches WHERE id=?").get(id); if (!batch) return null; const items = this.db.prepare("SELECT * FROM reminder_batch_items WHERE batch_id=? ORDER BY id").all(id); return { ...batch, items, totalCount: batch.total_count, sentCount: batch.sent_count, failedCount: batch.failed_count, cancelledCount: batch.cancelled_count, minDelaySeconds: batch.min_delay_seconds, maxDelaySeconds: batch.max_delay_seconds }; }
  getActiveReminderBatch() { const row = this.db.prepare("SELECT id FROM reminder_batches WHERE status IN ('queued','processing') ORDER BY id DESC LIMIT 1").get(); return row ? this.getReminderBatch(row.id) : null; }
  claimReminderItem(batchId) { const item = this.db.prepare("SELECT * FROM reminder_batch_items WHERE batch_id=? AND status='pending' ORDER BY id LIMIT 1").get(batchId); if (!item) return null; this.db.prepare("UPDATE reminder_batch_items SET status='sending', updated_at=datetime('now') WHERE id=? AND status='pending'").run(item.id); return this.db.prepare("SELECT * FROM reminder_batch_items WHERE id=?").get(item.id); }
  updateReminderItem(id, status, changes = {}) { this.db.prepare("UPDATE reminder_batch_items SET status=?, queue_id=COALESCE(?,queue_id), error=?, sent_at=CASE WHEN ?='sent' THEN datetime('now') ELSE sent_at END, updated_at=datetime('now') WHERE id=?").run(status, changes.queueId || null, changes.error || null, status, id); }
  refreshReminderBatch(id) { this.db.prepare("UPDATE reminder_batches SET sent_count=(SELECT COUNT(*) FROM reminder_batch_items WHERE batch_id=? AND status='sent'), failed_count=(SELECT COUNT(*) FROM reminder_batch_items WHERE batch_id=? AND status='failed'), cancelled_count=(SELECT COUNT(*) FROM reminder_batch_items WHERE batch_id=? AND status='cancelled'), updated_at=datetime('now') WHERE id=?").run(id,id,id,id); return this.getReminderBatch(id); }
  cancelReminderBatch(id) { this.db.prepare("UPDATE reminder_batch_items SET status='cancelled', updated_at=datetime('now') WHERE batch_id=? AND status IN ('pending','sending')").run(id); this.db.prepare("UPDATE reminder_batches SET status='cancelled', finished_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status IN ('queued','processing')").run(id); return this.getReminderBatch(id); }
  // Recordatorio 'sent' más reciente para ese teléfono dentro de una ventana horaria.
  // Sirve para correlacionar la respuesta del paciente ("sí, ahí estaré") con la cita
  // concreta sin que el recordatorio lleve el id en el texto. sent_at se guarda con
  // datetime('now') (UTC), por eso la ventana se calcula también en SQL.
  getRecentSentReminderForPhone(phone, withinHours = 18) {
    const base = phoneRuleVariants(phone);
    // reminder_batch_items.phone viene de contactoAP; puede estar con o sin el prefijo 503.
    const variants = [...new Set(base.concat(base.filter((v) => v.length === 8).map((v) => "503" + v)))];
    if (!variants.length) return null;
    const hours = Number.isInteger(withinHours) && withinHours > 0 ? withinHours : 18;
    const placeholders = variants.map(() => "?").join(",");
    return this.db.prepare(`SELECT appointment_id AS appointmentId, appointment_date AS appointmentDate, appointment_time AS appointmentTime, phone, sent_at AS sentAt FROM reminder_batch_items WHERE status='sent' AND sent_at >= datetime('now', ?) AND phone IN (${placeholders}) ORDER BY sent_at DESC, id DESC LIMIT 1`).get(`-${hours} hours`, ...variants) || null;
  }
  retryOutgoing(id, phone) { return this.db.prepare("UPDATE outgoing_queue SET status='pending', attempts=0, last_error=NULL, updated_at=datetime('now') WHERE id=? AND phone=? AND status='failed'").run(id, phone).changes > 0; }
  getGlobalSettings() { const row = this.db.prepare("SELECT response_delay_min AS responseDelayMin, response_delay_max AS responseDelayMax, response_group_delay_seconds AS responseGroupDelaySeconds, automation_phone_mode AS automationPhoneMode, automation_phone_numbers AS automationPhoneNumbers, ignored_outgoing_texts_json AS ignoredOutgoingTexts, updated_at AS updatedAt FROM message_settings WHERE id=1").get(); return { ...row, automationPhoneNumbers: JSON.parse(row?.automationPhoneNumbers || "[]"), ignoredOutgoingTexts: JSON.parse(row?.ignoredOutgoingTexts || "[]") }; }
  updateGlobalSettings(min, max, mode = null, numbers = null, groupDelay = null, ignoredOutgoingTexts = null) { const current = this.getGlobalSettings(); this.db.prepare("UPDATE message_settings SET response_delay_min=?, response_delay_max=?, response_group_delay_seconds=?, automation_phone_mode=?, automation_phone_numbers=?, ignored_outgoing_texts_json=?, updated_at=datetime('now') WHERE id=1").run(min, max, groupDelay === null ? current.responseGroupDelaySeconds : groupDelay, mode || current.automationPhoneMode, JSON.stringify(numbers || current.automationPhoneNumbers), JSON.stringify(ignoredOutgoingTexts || current.ignoredOutgoingTexts)); return this.getGlobalSettings(); }
  // Un mensaje saliente que coincide con la lista de "mensajes ignorados" (saludos
  // automáticos de WhatsApp Business u otro canal, ajenos a esta app) no cuenta como
  // que ya respondió un humano.
  isIgnoredOutgoingText(text) { const needle = String(text || "").trim().toLowerCase(); if (!needle) return false; return this.getGlobalSettings().ignoredOutgoingTexts.some((entry) => String(entry || "").trim().toLowerCase() === needle); }
  shouldAllowAutomatedResponse(phone) { return this.shouldAllowAutomatedResponseForIdentifiers([phone]); }
  // Evalúa la regla de teléfonos contra CUALQUIER identificador de la conversación.
  // Necesario porque un mismo chat puede conocerse por varios: el número real, el
  // número del expediente (si está vinculado), el wa_contact_number resuelto por
  // WhatsApp y el LID (chats @lid, donde el "teléfono" que ve recepción es el LID).
  // Si se ignora por uno, debe quedar ignorado aunque la comparación use otro.
  shouldAllowAutomatedResponseForIdentifiers(identifiers = []) {
    const settings = this.getGlobalSettings();
    if (settings.automationPhoneMode === "all") return true;
    const variants = [...new Set(identifiers.flatMap(phoneRuleVariants))];
    const rules = settings.automationPhoneNumbers.flatMap(phoneRuleVariants);
    const included = variants.some((value) => rules.includes(value));
    return settings.automationPhoneMode === "allow_only" ? included : !included;
  }
  shouldAllowAutomatedResponseForConversation(conversationId, fallbackPhone = "") {
    const conversation = conversationId ? this.getConversation(conversationId) : null;
    const link = conversationId ? this.getPatientLink(conversationId) : null;
    return this.shouldAllowAutomatedResponseForIdentifiers([
      link?.phone,
      conversation?.phone,
      conversation?.waContactNumber,
      conversation?.waChatId,
      fallbackPhone
    ]);
  }
  // true si algún identificador del chat está en la lista de "No responder"
  // (modo exclude). Para mostrar la etiqueta de "excluido" en la vista.
  isConversationAiExcluded(conversationId, settings = this.getGlobalSettings()) {
    if (settings.automationPhoneMode !== "exclude") return false;
    const rules = settings.automationPhoneNumbers.flatMap(phoneRuleVariants);
    if (!rules.length) return false;
    const conversation = this.getConversation(conversationId);
    const link = this.getPatientLink(conversationId);
    const variants = [link?.phone, conversation?.phone, conversation?.waContactNumber, conversation?.waChatId].flatMap(phoneRuleVariants);
    return variants.some((value) => rules.includes(value));
  }
  getAutomationSettings() { const row = this.db.prepare("SELECT enabled, appointment_confirmation AS appointmentConfirmation, appointment_reminder AS appointmentReminder, appointment_change_notice AS appointmentChangeNotice, after_hours_reply AS afterHoursReply, human_intervention_pause AS humanInterventionPause, allowed_start AS allowedStart, allowed_end AS allowedEnd, updated_at AS updatedAt FROM automation_settings WHERE id=1").get(); return { ...row, enabled: Boolean(row.enabled), appointmentConfirmation: Boolean(row.appointmentConfirmation), appointmentReminder: Boolean(row.appointmentReminder), appointmentChangeNotice: Boolean(row.appointmentChangeNotice), afterHoursReply: Boolean(row.afterHoursReply), humanInterventionPause: Boolean(row.humanInterventionPause) }; }
  updateAutomationSettings(settings) { this.db.prepare("UPDATE automation_settings SET enabled=?, appointment_confirmation=?, appointment_reminder=?, appointment_change_notice=?, after_hours_reply=?, human_intervention_pause=?, allowed_start=?, allowed_end=?, updated_at=datetime('now') WHERE id=1").run(settings.enabled ? 1 : 0, settings.appointmentConfirmation ? 1 : 0, settings.appointmentReminder ? 1 : 0, settings.appointmentChangeNotice ? 1 : 0, settings.afterHoursReply ? 1 : 0, settings.humanInterventionPause ? 1 : 0, settings.allowedStart, settings.allowedEnd); return this.getAutomationSettings(); }
  enqueueAutomation(job) { const result = this.db.prepare("INSERT OR IGNORE INTO automation_jobs(job_type, conversation_id, appointment_id, scheduled_at, idempotency_key) VALUES (?, ?, ?, ?, ?)").run(job.jobType, job.conversationId || null, job.appointmentId || null, job.scheduledAt, job.idempotencyKey); return this.db.prepare("SELECT * FROM automation_jobs WHERE idempotency_key=?").get(job.idempotencyKey) || { id: result.lastInsertRowid }; }
  listDueAutomationJobs(limit = 20) { return this.db.prepare("SELECT * FROM automation_jobs WHERE status='pending' AND scheduled_at <= datetime('now') ORDER BY scheduled_at, id LIMIT ?").all(Math.min(Math.max(Number(limit) || 20, 1), 100)); }
  listAutomationJobs(options = {}) { const status = options.status || "pending"; return this.db.prepare("SELECT * FROM automation_jobs WHERE status=? ORDER BY scheduled_at, id LIMIT ?").all(status, Math.min(Math.max(Number(options.limit) || 100, 1), 200)); }
  claimAutomationJob(id) { return this.db.prepare("UPDATE automation_jobs SET status='processing', attempts=attempts+1, updated_at=datetime('now') WHERE id=? AND status='pending'").run(id).changes > 0; }
  completeAutomationJob(id) { this.db.prepare("UPDATE automation_jobs SET status='completed', updated_at=datetime('now'), last_error=NULL WHERE id=?").run(id); }
  failAutomationJob(id, error) { this.db.prepare("UPDATE automation_jobs SET status=CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END, last_error=?, updated_at=datetime('now') WHERE id=?").run(String(error || "Error de automatizacion"), id); }
  cancelAutomationJob(id) { return this.db.prepare("UPDATE automation_jobs SET status='cancelled', updated_at=datetime('now') WHERE id=? AND status IN ('pending','processing')").run(id).changes > 0; }
  getAdministrativeSettings() { const row = this.db.prepare("SELECT clinic_name AS clinicName, phone, address, payment_methods AS paymentMethods, cancellation_policy AS cancellationPolicy, faq, updated_at AS updatedAt FROM administrative_settings WHERE id=1").get(); return { ...row, paymentMethods: JSON.parse(row.paymentMethods || "[]"), faq: JSON.parse(row.faq || "[]") }; }
  updateAdministrativeSettings(settings) { this.db.prepare("UPDATE administrative_settings SET clinic_name=?, phone=?, address=?, payment_methods=?, cancellation_policy=?, faq=?, updated_at=datetime('now') WHERE id=1").run(settings.clinicName, settings.phone, settings.address, JSON.stringify(settings.paymentMethods), settings.cancellationPolicy, JSON.stringify(settings.faq)); return this.getAdministrativeSettings(); }

  getAssistantKnowledge() { const row = this.db.prepare("SELECT knowledge, updated_at AS updatedAt FROM ai_assistant_knowledge WHERE id=1").get(); return { knowledge: row?.knowledge || "", updatedAt: row?.updatedAt || null }; }
  updateAssistantKnowledge(knowledge) { this.db.prepare("UPDATE ai_assistant_knowledge SET knowledge=?, updated_at=datetime('now') WHERE id=1").run(String(knowledge ?? "")); return this.getAssistantKnowledge(); }

  // Memoria del agente por conversación (guardrails). Vive dentro de collected._assistant.
  getAssistantMemory(conversationId) { return this.getConversationState(conversationId).collected?._assistant || {}; }
  setAssistantMemory(conversationId, patch) {
    const state = this.getConversationState(conversationId);
    const collected = { ...(state.collected || {}), _assistant: { ...(state.collected?._assistant || {}), ...patch } };
    return this.updateConversationState(conversationId, { intent: state.intent, collected, missing: state.missing || [], offeredSlots: state.offeredSlots || [], pendingAction: state.pendingAction || null });
  }

  getConversationState(conversationId) { const row = this.db.prepare("SELECT conversation_id AS conversationId, intent, collected_json AS collected, missing_json AS missing, offered_slots_json AS offeredSlots, pending_action_json AS pendingAction, version, updated_at AS updatedAt FROM conversation_state WHERE conversation_id=?").get(conversationId); if (!row) return { conversationId, intent: null, collected: {}, missing: [], offeredSlots: [], pendingAction: null, version: 1, updatedAt: null }; return { ...row, collected: JSON.parse(row.collected || "{}"), missing: JSON.parse(row.missing || "[]"), offeredSlots: JSON.parse(row.offeredSlots || "[]"), pendingAction: row.pendingAction ? JSON.parse(row.pendingAction) : null }; }
  updateConversationState(conversationId, state) { this.db.prepare("INSERT INTO conversation_state (conversation_id, intent, collected_json, missing_json, offered_slots_json, pending_action_json, clinical_workflow_json, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 1, datetime('now')) ON CONFLICT(conversation_id) DO UPDATE SET intent=excluded.intent, collected_json=excluded.collected_json, missing_json=excluded.missing_json, offered_slots_json=excluded.offered_slots_json, pending_action_json=excluded.pending_action_json, clinical_workflow_json=NULL, version=conversation_state.version+1, updated_at=datetime('now')").run(conversationId, state.intent || null, JSON.stringify(state.collected || {}), JSON.stringify(state.missing || []), JSON.stringify(state.offeredSlots || []), state.pendingAction ? JSON.stringify(state.pendingAction) : null); if (state.humanTransition === true) { this.updateConversation(conversationId, { attentionMode: "review_required" }); this.db.prepare("UPDATE conversations SET human_review_reason=COALESCE(?,human_review_reason), lifecycle_state='human_review' WHERE id=?").run(state.collected?._humanReviewReason || null, conversationId); } return this.getConversationState(conversationId); }
  markFollowUpSent(conversationId) { this.db.prepare("UPDATE conversations SET follow_up_sent=1, updated_at=datetime('now') WHERE id=?").run(conversationId); return this.getConversation(conversationId); }
  setConversationLifecycle(conversationId, lifecycleState, humanReviewReason = null) { this.db.prepare("UPDATE conversations SET lifecycle_state=?, human_review_reason=COALESCE(?,human_review_reason), updated_at=datetime('now') WHERE id=?").run(lifecycleState, humanReviewReason, conversationId); return this.getConversation(conversationId); }
  getHumanReviewInstructions() { const row = this.db.prepare("SELECT instructions, updated_at AS updatedAt FROM human_review_rules WHERE id=1").get(); return { instructions: row?.instructions || "", updatedAt: row?.updatedAt || null }; }
  updateHumanReviewInstructions(instructions) { this.db.prepare("UPDATE human_review_rules SET instructions=?, updated_at=datetime('now') WHERE id=1").run(String(instructions || "")); return this.getHumanReviewInstructions(); }
  enqueueResponseMessage(conversationId, messageId, text, groupDelaySeconds = 4) {
    const now = Date.now();
    const due = new Date(now + Math.max(0, Number(groupDelaySeconds) || 0) * 1000).toISOString();
    const active = this.db.prepare("SELECT * FROM response_queue WHERE conversation_id=? AND status IN ('generating','ready_to_send','sending') ORDER BY id DESC LIMIT 1").get(conversationId);
    // Solo se puede sumar al lote mientras todavia esta acumulando (sin reclamar: attempts=0,
    // esperando su due_at). Una vez reclamado (attempts>=1) el LLM ya empezo a generar con el
    // contexto leido en ese momento: sumarle el id aca no lo mete en ese contexto, y sin embargo
    // marcaba el mensaje como "ya cubierto" (ver responseQueueStillEligible/listUnansweredAssistantMessages),
    // asi que el paciente quedaba sin respuesta real. En ese caso se cancela el lote en curso (no se
    // envia una respuesta que no lo contempla) y se abre uno nuevo, que el tick reencola con contexto fresco.
    if (active && active.status === "generating" && active.attempts === 0 && !active.response_text) {
      const ids = JSON.parse(active.message_ids_json || "[]");
      ids.push(messageId);
      this.db.prepare("UPDATE response_queue SET due_at=?, message_ids_json=?, updated_at=datetime('now') WHERE id=?").run(due, JSON.stringify(ids), active.id);
      return this.getResponseQueueItem(active.id);
    }
    if (active) this.db.prepare("UPDATE response_queue SET status='cancelled', error='Nuevo mensaje recibido', updated_at=datetime('now') WHERE id=?").run(active.id);
    const result = this.db.prepare("INSERT INTO response_queue (conversation_id, status, due_at, batch_version, message_ids_json, consolidated_text) VALUES (?, 'generating', ?, ?, ?, ?)").run(conversationId, due, (active?.batch_version || 0) + 1, JSON.stringify([messageId]), text);
    return this.getResponseQueueItem(result.lastInsertRowid);
  }
  listUnansweredAssistantMessages(limit = 100, conversationId = null) {
    // "Último mensaje" y "¿ya respondimos?" se deciden por id (orden de inserción,
    // reloj del servidor), NUNCA por message_at: el timestamp de los mensajes
    // entrantes viene del teléfono del paciente y puede estar minutos adelantado
    // o atrasado. Con message_at, un reloj adelantado hace que ninguna respuesta
    // de la IA quede "después" del mensaje -> se reencola sin fin (bucle cada tick).
    return this.db.prepare(`SELECT c.id AS conversation_id, c.phone, m.id AS message_id, m.content
      FROM conversations c
      JOIN messages m ON m.id = (
        SELECT id FROM messages
        WHERE conversation_id=c.id AND direction='incoming' AND author='patient'
        ORDER BY id DESC LIMIT 1
      )
      WHERE c.status <> 'closed'
        AND c.attention_mode='assistant'
        -- Una reacción (❤️, 👍…) como último mensaje del paciente NO es una solicitud
        -- sin responder: processBatch la cancela siempre, así que reencolarla acá crea
        -- un bucle (batch nuevo cada tick -> cancelado -> reencolado).
        AND LOWER(IFNULL(c.last_message_type,'')) <> 'reaction'
        AND m.content NOT LIKE 'Reacción:%'
        AND (? IS NULL OR c.id=?)
        AND NOT EXISTS (
          SELECT 1 FROM messages o
          WHERE o.conversation_id=c.id AND o.direction='outgoing' AND o.id > m.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM response_queue rq
          WHERE rq.conversation_id=c.id AND rq.status IN ('generating','ready_to_send','sending')
      )
      ORDER BY m.id ASC
      LIMIT ?`).all(conversationId || null, conversationId || null, Math.min(Math.max(Number(limit) || 100, 1), 500));
  }
  enqueueUnansweredAssistantMessages(groupDelaySeconds = 4, limit = 100, conversationId = null) {
    const candidates = this.listUnansweredAssistantMessages(limit, conversationId).filter((item) => this.shouldAllowAutomatedResponseForConversation(item.conversation_id, item.phone));
    return candidates.map((item) => this.enqueueResponseMessage(item.conversation_id, item.message_id, item.content, groupDelaySeconds));
  }
  getResponseQueueItem(id) { const row = this.db.prepare("SELECT * FROM response_queue WHERE id=?").get(id); return row ? { ...row, conversationId: row.conversation_id, bufferStartedAt: row.buffer_started_at, dueAt: row.due_at, batchVersion: row.batch_version, messageIds: JSON.parse(row.message_ids_json || "[]"), consolidatedText: row.consolidated_text, responseText: row.response_text, createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  hasAiResponseForQueue(queueId) { const row = this.db.prepare("SELECT conversation_id,message_ids_json FROM response_queue WHERE id=?").get(queueId); if (!row) return false; let ids = []; try { ids = JSON.parse(row.message_ids_json || "[]"); } catch {} const lastIncomingId = ids.map(Number).filter(Number.isInteger).sort((a, b) => b - a)[0] || 0; return Boolean(this.db.prepare("SELECT 1 FROM messages WHERE conversation_id=? AND direction='outgoing' AND author='ai' AND id>? LIMIT 1").get(row.conversation_id, lastIncomingId)); }
  listResponseQueue(conversationId = null, limit = 50) { const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200); const rows = conversationId ? this.db.prepare("SELECT * FROM response_queue WHERE conversation_id=? ORDER BY id DESC LIMIT ?").all(conversationId, safeLimit) : this.db.prepare("SELECT * FROM response_queue ORDER BY id DESC LIMIT ?").all(safeLimit); return rows.map((row) => this.getResponseQueueItem(row.id)); }
  claimDueResponseQueue() {
    // Corta lotes que superaron el maximo de intentos para que no se reprocesen sin fin.
    this.db.prepare("UPDATE response_queue SET status='failed', error=COALESCE(error,'Máximo de reintentos alcanzado'), updated_at=datetime('now') WHERE status IN ('generating','ready_to_send') AND attempts >= 8").run();
    // El tick esta serializado (una sola ejecucion a la vez), asi que cuando esto corre
    // no hay ningun lote en proceso: se puede reclamar el siguiente lote vencido.
    const row = this.db.prepare("SELECT * FROM response_queue WHERE status IN ('generating','ready_to_send') AND attempts < 8 AND datetime(due_at) <= datetime('now') ORDER BY due_at, id LIMIT 1").get();
    if (!row) return null;
    const claimed = this.db.prepare("UPDATE response_queue SET status='generating', attempts=attempts+1, updated_at=datetime('now') WHERE id=? AND status IN ('generating','ready_to_send')").run(row.id);
    return claimed.changes ? this.getResponseQueueItem(row.id) : null;
  }
  recoverStaleResponseQueue(maxAgeSeconds = 30) { const seconds = Math.max(10, Number(maxAgeSeconds) || 30); return this.db.prepare("UPDATE response_queue SET status=CASE WHEN response_text IS NULL THEN 'generating' ELSE 'ready_to_send' END, due_at=datetime('now'), error=COALESCE(error,'Cola recuperada después de quedar detenida'), updated_at=datetime('now') WHERE status IN ('generating','sending') AND datetime(updated_at) <= datetime('now', ?)").run(`-${seconds} seconds`).changes; }
  updateResponseQueue(id, changes = {}) { const fields = []; const values = []; const allowed = { status: "status", consolidatedText: "consolidated_text", responseText: "response_text", error: "error", dueAt: "due_at", attempts: "attempts" }; for (const [key, value] of Object.entries(changes)) if (allowed[key]) { fields.push(`${allowed[key]}=?`); values.push(value); } if (!fields.length) return this.getResponseQueueItem(id); values.push(id); this.db.prepare(`UPDATE response_queue SET ${fields.join(", ")}, updated_at=datetime('now') WHERE id=?`).run(...values); return this.getResponseQueueItem(id); }
  cancelResponseQueue(id) { return this.db.prepare("UPDATE response_queue SET status='cancelled', error='Cancelado por el usuario', updated_at=datetime('now') WHERE id=? AND status IN ('generating','ready_to_send','sending')").run(id).changes > 0; }
  getAiProviderSettings() { const row = this.db.prepare("SELECT provider_mode AS providerMode, base_url AS baseUrl, model, api_key AS apiKey, timeout_ms AS timeoutMs, updated_at AS updatedAt FROM ai_provider_settings WHERE id=1").get(); return { ...row, apiKeyConfigured: Boolean(row.apiKey), apiKey: undefined }; }
  updateAiProviderSettings(settings) { this.db.prepare("UPDATE ai_provider_settings SET provider_mode=?, base_url=?, model=?, api_key=CASE WHEN ?='' THEN api_key ELSE ? END, timeout_ms=?, updated_at=datetime('now') WHERE id=1").run(settings.providerMode, settings.baseUrl, settings.model, settings.apiKey || "", settings.apiKey || "", settings.timeoutMs); return this.getAiProviderSettings(); }
  getAiProviderSecret() { return this.db.prepare("SELECT provider_mode AS providerMode, base_url AS baseUrl, model, api_key AS apiKey, timeout_ms AS timeoutMs FROM ai_provider_settings WHERE id=1").get(); }
  listMessages(conversationId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
    const offset = Math.max(Number(options.offset) || 0, 0);
    const rows = this.db.prepare("SELECT * FROM messages WHERE conversation_id=? ORDER BY message_at DESC, id DESC LIMIT ? OFFSET ?").all(conversationId, limit, offset).map(toMessage).reverse();
    const conversation = this.db.prepare("SELECT phone, wa_chat_id FROM conversations WHERE id=?").get(conversationId);
    if (!conversation || offset > 0) return rows;
    const queued = this.db.prepare("SELECT id, content, status, last_error, created_at FROM outgoing_queue WHERE (phone=? OR (wa_chat_id IS NOT NULL AND wa_chat_id=?)) AND status IN ('pending','sending','failed') ORDER BY id").all(conversation.phone, conversation.wa_chat_id || "").map((item) => ({ id: `queue-${item.id}`, conversationId, externalId: null, direction: "outgoing", author: "human", content: item.content, deliveryStatus: item.status === "failed" ? "failed" : "queued", error: item.last_error, messageAt: item.created_at, createdAt: item.created_at, queued: true }));
    return [...rows, ...queued];
  }

  getLatestMessage(conversationId) {
    // Por id (orden de inserción), no por message_at: el timestamp de los
    // entrantes lo pone el teléfono del paciente y puede venir adelantado, lo que
    // haría que un mensaje viejo tape a la respuesta recién enviada por la IA.
    const row = this.db.prepare("SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(conversationId);
    return toMessage(row);
  }

  markConversationRead(conversationId) {
    this.db.prepare("UPDATE messages SET read_at=datetime('now') WHERE conversation_id=? AND author='patient' AND read_at IS NULL").run(conversationId);
  }

  deleteMessage(conversationId, messageId) {
    const idText = String(messageId || "");
    if (idText.startsWith("queue-")) {
      const queueId = Number(idText.slice(6));
      if (!Number.isInteger(queueId) || queueId < 1) return false;
      const conversation = this.db.prepare("SELECT phone, wa_chat_id FROM conversations WHERE id=?").get(conversationId);
      if (!conversation) return false;
      return this.db.prepare("DELETE FROM outgoing_queue WHERE id=? AND (phone=? OR (wa_chat_id IS NOT NULL AND wa_chat_id=?))").run(queueId, conversation.phone, conversation.wa_chat_id || "").changes > 0;
    }
    const numericId = Number(idText);
    if (!Number.isInteger(numericId) || numericId < 1) return false;
    return this.db.prepare("DELETE FROM messages WHERE id=? AND conversation_id=?").run(numericId, conversationId).changes > 0;
  }

  updateConversation(conversationId, changes = {}) {
    const allowed = { attentionMode: "attention_mode", patientId: "patient_id", humanOwnerId: "human_owner_id", responseDelayMin: "response_delay_min", responseDelayMax: "response_delay_max" };
    const entries = Object.entries(changes).filter(([key, value]) => Object.hasOwn(allowed, key) && value !== undefined);
    if (!entries.length) return this.getConversation(conversationId);
    const sets = entries.map(([key]) => `${allowed[key]}=?`).join(", ");
    const values = entries.map(([, value]) => value === "" ? null : value);
    this.db.prepare(`UPDATE conversations SET ${sets}, updated_at=datetime('now') WHERE id=?`).run(...values, conversationId);
    return this.getConversation(conversationId);
  }

  getPatientLink(conversationId) {
    const conversation = this.db.prepare("SELECT wa_chat_id FROM conversations WHERE id=? LIMIT 1").get(conversationId);
    const cols = "id,wa_chat_id,patient_id,phone,patient_name,treatment_type,verified_at,verified_by,active";
    let row = conversation?.wa_chat_id
      ? this.db.prepare(`SELECT ${cols} FROM patient_chat_identities WHERE wa_chat_id=? AND active=1 LIMIT 1`).get(conversation.wa_chat_id)
      : null;
    // Tras una fusión, la identidad activa puede estar en un chat id que ahora es
    // alias de esta conversación (el @c.us viejo migrado a @lid, o al revés).
    if (!row) {
      row = this.db.prepare(`SELECT pci.id,pci.wa_chat_id,pci.patient_id,pci.phone,pci.patient_name,pci.treatment_type,pci.verified_at,pci.verified_by,pci.active FROM patient_chat_identities pci JOIN wa_chat_aliases a ON a.wa_chat_id=pci.wa_chat_id WHERE a.conversation_id=? AND pci.active=1 LIMIT 1`).get(conversationId);
    }
    if (!row) {
      row = this.db.prepare("SELECT * FROM conversation_patient_links WHERE conversation_id=? AND active=1 ORDER BY id DESC LIMIT 1").get(conversationId);
    }
    // Última red: la conversación tiene paciente en la columna (recepción lo puso,
    // o lo heredó de una fusión) pero ninguna identidad quedó apuntando a su chat
    // id actual — usamos la identidad activa más reciente de ese paciente.
    if (!row) {
      const conv = this.db.prepare("SELECT patient_id FROM conversations WHERE id=? LIMIT 1").get(conversationId);
      if (conv?.patient_id) {
        row = this.db.prepare(`SELECT ${cols} FROM patient_chat_identities WHERE patient_id=? AND active=1 ORDER BY verified_at DESC, id DESC LIMIT 1`).get(conv.patient_id);
      }
    }
    return row ? { id: row.id, conversationId: row.conversation_id, patientId: row.patient_id, waChatId: row.wa_chat_id, phone: row.phone, patientName: row.patient_name, treatmentType: row.treatment_type, verifiedAt: row.verified_at, verifiedBy: row.verified_by, active: Boolean(row.active) } : null;
  }

  setPatientLink(conversationId, patient, verifiedBy = null) {
    return this.db.transaction(() => {
      const conversation = this.db.prepare("SELECT wa_chat_id FROM conversations WHERE id=? LIMIT 1").get(conversationId);
      const waChatId = conversation?.wa_chat_id || `conversation:${conversationId}`;
      // Un paciente puede cambiar de número o de sesión. Conservamos el
      // historial, pero solo dejamos una vinculación activa por paciente.
      this.db.prepare("UPDATE patient_chat_identities SET active=0 WHERE patient_id=? AND wa_chat_id<>? AND active=1").run(patient.id, waChatId);
      this.db.prepare("UPDATE conversation_patient_links SET active=0 WHERE patient_id=? AND wa_chat_id<>? AND active=1").run(patient.id, waChatId);
      this.db.prepare("INSERT INTO patient_chat_identities (wa_chat_id,patient_id,phone,patient_name,treatment_type,verified_by,active) VALUES (?,?,?,?,?,?,1) ON CONFLICT(wa_chat_id) DO UPDATE SET patient_id=excluded.patient_id,phone=excluded.phone,patient_name=excluded.patient_name,treatment_type=excluded.treatment_type,verified_at=datetime('now'),verified_by=excluded.verified_by,active=1").run(waChatId, patient.id, patient.phone || null, patient.name, patient.treatment || null, verifiedBy);
      this.db.prepare("UPDATE conversation_patient_links SET active=0 WHERE conversation_id=?").run(conversationId);
      this.db.prepare("INSERT INTO conversation_patient_links (conversation_id,patient_id,wa_chat_id,phone,patient_name,treatment_type,verified_by,active) VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(conversation_id,patient_id) DO UPDATE SET wa_chat_id=excluded.wa_chat_id,phone=excluded.phone,patient_name=excluded.patient_name,treatment_type=excluded.treatment_type,verified_at=datetime('now'),verified_by=excluded.verified_by,active=1").run(conversationId, patient.id, waChatId, patient.phone || null, patient.name, patient.treatment || null, verifiedBy);
      // El teléfono del expediente puede ya estar en otra conversación (chat viejo del
      // mismo paciente, o un teléfono huérfano de una vinculación anterior). conversations.phone
      // es UNIQUE: si lo pisáramos, la transacción entera aborta y la vinculación no se guarda.
      // La vinculación real vive en conversation_patient_links; si hay choque, no tocamos el teléfono.
      let phoneForConv = patient.phone || null;
      if (phoneForConv) {
        const digits = String(phoneForConv).replace(/\D/g, "");
        const clash = digits && this.db.prepare("SELECT id FROM conversations WHERE id<>? AND status <> 'closed' AND REPLACE(REPLACE(REPLACE(IFNULL(phone,''),' ',''),'-',''),'+','')=? LIMIT 1").get(conversationId, digits);
        if (clash) phoneForConv = null;
      }
      this.db.prepare("UPDATE conversations SET patient_id=?, phone=COALESCE(?,phone), wa_contact_number=COALESCE(?,wa_contact_number) WHERE id=?").run(patient.id, phoneForConv, phoneForConv, conversationId);
      return this.getPatientLink(conversationId);
    })();
  }

  clearPatientLink(conversationId) {
    const conversation = this.db.prepare("SELECT wa_chat_id FROM conversations WHERE id=? LIMIT 1").get(conversationId);
    if (conversation?.wa_chat_id) this.db.prepare("UPDATE patient_chat_identities SET active=0 WHERE wa_chat_id=?").run(conversation.wa_chat_id);
    this.db.prepare("UPDATE conversation_patient_links SET active=0 WHERE conversation_id=?").run(conversationId);
    this.db.prepare("UPDATE conversations SET patient_id=NULL WHERE id=?").run(conversationId);
    return true;
  }

  listPatientIdentities(search = "") {
    const needle = `%${String(search || "").trim()}%`;
    return this.db.prepare("SELECT id,wa_chat_id AS waChatId,patient_id AS patientId,phone,patient_name AS patientName,treatment_type AS treatmentType,verified_at AS verifiedAt,verified_by AS verifiedBy FROM patient_chat_identities WHERE active=1 AND (patient_name LIKE ? OR IFNULL(phone,'') LIKE ? OR wa_chat_id LIKE ?) ORDER BY patient_name LIMIT 200").all(needle, needle, needle);
  }

  clearPatientIdentity(identityId) {
    return this.db.transaction(() => {
      const identity = this.db.prepare("SELECT wa_chat_id FROM patient_chat_identities WHERE id=? AND active=1").get(identityId);
      if (!identity) return false;
      this.db.prepare("UPDATE patient_chat_identities SET active=0 WHERE id=?").run(identityId);
      this.db.prepare("UPDATE conversations SET patient_id=NULL WHERE wa_chat_id=?").run(identity.wa_chat_id);
      this.db.prepare("UPDATE conversation_patient_links SET active=0 WHERE wa_chat_id=?").run(identity.wa_chat_id);
      return true;
    })();
  }

  clearAllPatientIdentities() {
    return this.db.transaction(() => {
      const result = this.db.prepare("UPDATE patient_chat_identities SET active=0 WHERE active=1").run();
      this.db.prepare("UPDATE conversations SET patient_id=NULL WHERE patient_id IS NOT NULL").run();
      this.db.prepare("UPDATE conversation_patient_links SET active=0 WHERE active=1").run();
      return result.changes;
    })();
  }

  deleteConversation(conversationId) {
    return this.db.transaction(() => {
      const conversation = this.db.prepare("SELECT phone FROM conversations WHERE id=?").get(conversationId);
      if (conversation) this.db.prepare("DELETE FROM outgoing_queue WHERE phone=?").run(conversation.phone);
      const result = this.db.prepare("DELETE FROM conversations WHERE id=?").run(conversationId);
      return result.changes > 0;
    })();
  }
  deleteAllConversations() {
    // Se borra todo: vaciar cada tabla hija directamente es O(filas) sin evaluar el
    // cascade fila por fila. El DELETE de conversations al final limpia por cascade
    // cualquier tabla hija que no esté en la lista.
    const changes = this.db.transaction(() => {
      for (const table of ["messages", "conversation_state", "message_actions", "ai_runs", "response_queue", "conversation_patient_links", "outgoing_queue"]) {
        this.db.prepare(`DELETE FROM ${table}`).run();
      }
      this.db.prepare("UPDATE automation_jobs SET conversation_id=NULL WHERE conversation_id IS NOT NULL").run();
      return this.db.prepare("DELETE FROM conversations").run().changes;
    })();
    try { this.db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
    return changes;
  }
}

module.exports = { MensajesRepository };
