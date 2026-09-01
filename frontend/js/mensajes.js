(function () {
    let selectedId = null;
    let cleanup = null;
    let chatPoll = null;
    let conversationLoadSeq = 0;
    let deletingAll = false;
    let pollBusy = false;
    let sendingMessage = false;
    let lastListSig = "";
    let lastChatSig = "";
    let simulatingIncoming = false;
    // --- Lista de conversaciones: datos crudos + filtro/búsqueda + metadatos ---
    let allConversations = [];
    let convListFilter = "all";        // "all" | "review" | "ai"
    let convSearchTerm = "";
    let patientNameByChat = new Map(); // waChatId -> { name, treatment } (vinculaciones activas)
    let patientNamesFetchedAt = 0;
    let aiWorkingConvIds = new Set();  // conversaciones con la IA generando respuesta

    // --- Estado y utilidades ---

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }
    function formatDate(value) { return value ? new Date(value).toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" }) : ""; }
    // Muestra "HH:mm" (o "HH:mm:ss") de 24h como "1:00 PM". El valor guardado no cambia.
    function fmtHora12(value) {
        const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
        if (!match) return String(value ?? "");
        let hour = Number(match[1]);
        if (hour > 23) return String(value ?? "");
        const period = hour < 12 ? "AM" : "PM";
        hour = hour % 12 || 12;
        return `${hour}:${match[2]} ${period}`;
    }
    // Control de hora en 12h (hora + minutos + AM/PM). Guarda/lee "HH:mm" de 24h.
    // Se usa en vez de <input type="time"> porque el picker de Chromium/Electron
    // ignora lang y muestra 24h en este entorno.
    function t12Html(cls, value) {
        const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
        const h24 = match ? Number(match[1]) : 8;
        const min = match ? match[2] : "00";
        const period = h24 < 12 ? "AM" : "PM";
        const h12 = h24 % 12 || 12;
        const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
        if (!mins.includes(min)) { mins.push(min); mins.sort(); }
        const hOpts = Array.from({ length: 12 }, (_, i) => i + 1).map((n) => `<option value="${n}"${n === h12 ? " selected" : ""}>${n}</option>`).join("");
        const mOpts = mins.map((mm) => `<option value="${mm}"${mm === min ? " selected" : ""}>${mm}</option>`).join("");
        const pOpts = ["AM", "PM"].map((p) => `<option value="${p}"${p === period ? " selected" : ""}>${p}</option>`).join("");
        return `<span class="time12${cls ? " " + cls : ""}"><select class="t12-h">${hOpts}</select><span class="t12-sep">:</span><select class="t12-m">${mOpts}</select><select class="t12-p">${pOpts}</select></span>`;
    }
    function t12Read(el) {
        if (!el) return "";
        const h = Number(el.querySelector(".t12-h")?.value || 0);
        const mm = el.querySelector(".t12-m")?.value || "00";
        const p = el.querySelector(".t12-p")?.value || "AM";
        const h24 = (h % 12) + (p === "PM" ? 12 : 0);
        return `${String(h24).padStart(2, "0")}:${mm}`;
    }
    async function api(url, options) {
        const response = await fetch(url, { ...(options || {}), __skipConnectionErrorAlert: true });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.message || "No se pudo completar la solicitud");
        return data;
    }
    // --- Shell de la vista ---
    function renderShell() {
        const content = document.querySelector(".content");
        content.innerHTML = `<section class="mensajes-view">
          <form id="mensajes-simulator" class="mensajes-simulator">
            <div class="sim-group"><span class="sim-group-label">WhatsApp</span><span id="mensajes-whatsapp-status" class="mensajes-wa-state">Desconectado</span><button id="mensajes-whatsapp-start" type="button" class="sim-btn sim-btn-primary">Iniciar</button><button id="mensajes-whatsapp-stop" type="button" class="sim-btn" disabled>Cerrar</button><button id="mensajes-whatsapp-clear" type="button" class="sim-btn sim-btn-danger">Quitar sesión</button></div>
            <div class="sim-group"><span class="sim-group-label">Simular</span><input id="mensajes-sim-phone" placeholder="Teléfono" inputmode="tel"><input id="mensajes-sim-text" placeholder="Mensaje del paciente"><button id="mensajes-sim-submit" type="button" class="sim-btn sim-btn-primary">Enviar</button></div>
            <div class="sim-group" id="mensajes-actions-group"><span class="sim-group-label">Acciones</span><button id="mensajes-global-settings" type="button" class="sim-btn" title="Ajustes globales">⚙ Ajustes</button></div>
            <div class="sim-group" id="mensajes-ai-group"><span class="sim-group-label">IA</span></div>
          </form>
          <div class="mensajes-layout">
            <aside class="mensajes-conversations"><div class="mensajes-section-title"><span class="mensajes-section-heading">Conversaciones<button id="mensajes-toggle-tools" type="button" class="mensajes-icon-btn" title="Mostrar u ocultar herramientas" aria-label="Mostrar u ocultar herramientas"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg></button></span><button id="mensajes-refresh" class="ui-toolbar-btn">Actualizar</button></div><div class="mensajes-list-toolbar"><input id="mensajes-search" type="search" autocomplete="off" placeholder="Buscar por nombre o número"><div id="mensajes-filters" class="mensajes-filters"><button type="button" data-filter="all" class="is-active">Todas</button><button type="button" data-filter="review">⚠ Necesitan revisión<span class="chip-count"></span></button><button type="button" data-filter="ai">🤖 IA</button></div></div><div id="mensajes-list" class="mensajes-list"></div></aside>
            <main class="mensajes-chat"><div id="mensajes-chat-head" class="mensajes-chat-head"><span>Selecciona una conversación</span></div><div id="mensajes-chat-body" class="mensajes-chat-body"><div class="mensajes-empty">Selecciona una conversación para ver el historial.</div></div><form id="mensajes-compose" class="mensajes-compose"><input id="mensajes-input" maxlength="2000" autocomplete="off" placeholder="Escribe una respuesta..."><button type="submit">Enviar</button></form></main>
          </div>
        </section>`;
    }
    // --- Barra de herramientas (WhatsApp / simulador / acciones): colapsable ---
    const TOOLS_KEY = "mensajes-tools-collapsed";
    function toolsCollapsed() {
        try { const value = localStorage.getItem(TOOLS_KEY); return value === null ? true : value === "1"; }
        catch (_) { return true; }
    }
    function applyToolsCollapsed(collapsed) {
        const bar = document.getElementById("mensajes-simulator");
        const button = document.getElementById("mensajes-toggle-tools");
        if (bar) bar.classList.toggle("is-collapsed", collapsed);
        if (button) { button.classList.toggle("is-active", !collapsed); button.title = collapsed ? "Mostrar herramientas" : "Ocultar herramientas"; }
        try { localStorage.setItem(TOOLS_KEY, collapsed ? "1" : "0"); } catch (_) {}
    }
    // --- Recordatorios ---
    async function openReminderModal() { let modal = document.getElementById("mensajes-reminder-modal"); if (!modal) { modal = document.createElement("div"); modal.id = "mensajes-reminder-modal"; modal.className = "mensajes-settings-overlay"; modal.innerHTML = `<form class="mensajes-reminder-card"><button type="button" data-close>×</button><h2>Enviar recordatorios</h2><label>Fecha<input id="reminder-date" type="date" required></label><label>Plantilla<textarea id="reminder-template" rows="4">Hola {{nombre}}, le recordamos su cita del {{fecha}} a las {{hora}} por {{tratamiento}}.</textarea></label><label class="ai-enabled"><input id="reminder-force-resend" type="checkbox"> Permitir reenviar recordatorios ya enviados</label><div class="reminder-toolbar"><button type="button" id="reminder-load">Cargar pacientes</button><span id="reminder-progress">Aún no cargados</span></div><div id="reminder-items" class="reminder-items"></div><div class="reminder-actions"><button type="submit" id="reminder-send">Enviar recordatorios</button><button type="button" id="reminder-cancel" disabled>Cancelar lote</button></div></form>`; document.body.appendChild(modal); modal.querySelector("[data-close]").addEventListener("click", () => { modal.hidden = true; }); modal.querySelector("#reminder-load").addEventListener("click", loadReminderCandidates); modal.querySelector("form").addEventListener("submit", startReminder); modal.querySelector("#reminder-cancel").addEventListener("click", cancelReminder); } modal.querySelector("#reminder-date").value = new Date().toISOString().slice(0,10); modal.hidden = false; await loadReminderCandidates(); }
    async function loadReminderCandidates() { const modal = document.getElementById("mensajes-reminder-modal"); const data = await api(`/api/mensajes-view/reminders/candidates?date=${encodeURIComponent(modal.querySelector("#reminder-date").value)}`); modal.dataset.items = JSON.stringify(data.candidates); const labels = { pending: "Pendiente", sent: "Enviado", failed: "Error", cancelled: "Cancelado", sending: "Enviando", queued: "En cola" }; modal.querySelector("#reminder-items").innerHTML = data.candidates.length ? data.candidates.map((x) => `<div class="reminder-item"><strong>${esc(x.patientName)}</strong><span>${esc(x.phone)} · ${esc(fmtHora12(x.time))} · ${esc(x.status || "")}</span><small>${esc(x.treatment || "")}</small><em data-item-status="${x.appointmentId}">${labels[x.reminderStatus] || "Pendiente"}</em></div>`).join("") : `<div class="mensajes-empty">No hay pacientes elegibles para esta fecha.</div>`; const summary = data.summary || {}; modal.querySelector("#reminder-progress").textContent = `${data.candidates.length} elegibles · ${summary.sent || 0} enviados · ${summary.failed || 0} errores · ${summary.cancelled || 0} cancelados · ${summary.pending || 0} pendientes`; }
    async function startReminder(event) { event.preventDefault(); const modal = document.getElementById("mensajes-reminder-modal"); const sendButton = modal.querySelector("#reminder-send"); const cancelButton = modal.querySelector("#reminder-cancel"); const items = JSON.parse(modal.dataset.items || "[]"); if (!items.length) return alert("Carga primero los pacientes"); sendButton.disabled = true; try { const reminderSettings = await api("/api/mensajes-view/reminder-settings"); const data = await api("/api/mensajes-view/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: modal.querySelector("#reminder-date").value, template: modal.querySelector("#reminder-template").value, items, minDelaySeconds: reminderSettings.settings.minDelaySeconds, maxDelaySeconds: reminderSettings.settings.maxDelaySeconds, forceResend: modal.querySelector("#reminder-force-resend").checked }) }); modal.dataset.batchId = data.batch.id; const started = await api(`/api/mensajes-view/reminders/${data.batch.id}/start`, { method: "POST" }); modal.querySelector("#reminder-progress").textContent = started.connectionError ? "No enviado: conecta WhatsApp y vuelve a intentarlo" : "Lote iniciado"; cancelButton.disabled = Boolean(started.connectionError); if (!started.connectionError) cancelButton.disabled = false; await pollReminder(); } catch (error) { sendButton.disabled = false; cancelButton.disabled = true; modal.querySelector("#reminder-progress").textContent = error.message || "No se pudo iniciar el lote"; }
    }
    async function pollReminder() { const modal = document.getElementById("mensajes-reminder-modal"); const batchId = modal?.dataset.batchId; if (!batchId || modal.hidden) return; try { const batch = (await api(`/api/mensajes-view/reminders/${batchId}`)).batch; modal.querySelector("#reminder-progress").textContent = `${batch.sentCount} enviados · ${batch.failedCount} errores · ${batch.cancelledCount} cancelados de ${batch.totalCount} · ${batch.status}`; batch.items.forEach((item) => { const el = modal.querySelector(`[data-item-status="${item.appointment_id}"]`); if (el) el.textContent = item.status === "sent" ? "Enviado" : item.status === "failed" ? "Error" : item.status === "cancelled" ? "Cancelado" : item.status === "queued" || item.status === "sending" ? "En cola / trabajando" : "Pendiente"; }); if (["queued", "processing"].includes(batch.status)) { modal.querySelector("#reminder-send").disabled = true; modal.querySelector("#reminder-cancel").disabled = false; setTimeout(pollReminder, 3000); } else { modal.querySelector("#reminder-send").disabled = false; modal.querySelector("#reminder-cancel").disabled = true; } } catch (error) { modal.querySelector("#reminder-send").disabled = false; modal.querySelector("#reminder-cancel").disabled = true; modal.querySelector("#reminder-progress").textContent = error.message || "No se pudo consultar el lote"; } }
    async function cancelReminder() { const modal = document.getElementById("mensajes-reminder-modal"); if (modal?.dataset.batchId) await api(`/api/mensajes-view/reminders/${modal.dataset.batchId}/cancel`, { method: "POST" }); await pollReminder(); }
    async function refreshGlobalAiStatus() { const group = document.getElementById("mensajes-ai-group") || document.getElementById("mensajes-simulator"); if (!group) return; let indicator = document.getElementById("mensajes-ai-global-status"); if (!indicator) { indicator = document.createElement("span"); indicator.id = "mensajes-ai-global-status"; indicator.className = "mensajes-ai-global-status"; group.insertBefore(indicator, document.getElementById("mensajes-pause-ai") || null); } const data = await api("/api/mensajes-view/automation-settings"); const active = Boolean(data.settings.enabled); indicator.textContent = active ? "IA activa" : "IA pausada"; indicator.classList.toggle("is-active", active); indicator.classList.toggle("is-paused", !active); const pause = document.getElementById("mensajes-pause-ai"); const toAi = document.getElementById("mensajes-global-ai"); if (pause) { pause.textContent = active ? "Pausar IA" : "Reanudar IA"; pause.dataset.aiAction = active ? "paused" : "resume"; pause.title = active ? "Apaga la IA y cancela lo que esté respondiendo" : "Vuelve a encender la IA; no responde lo viejo, solo los mensajes que lleguen"; pause.disabled = false; } if (toAi) toAi.textContent = "Pasar todo a IA"; }
    function formatWhatsappStatus(status) { const labels = { disconnected: "Desconectado", initializing: "Iniciando...", connecting: "Conectando...", qr: "QR en ventana de WhatsApp", authenticated: "Autenticado...", syncing: "Sincronizando...", connected: "Conectado", reconnecting: "Reconectando...", auth_failure: "Fallo de autenticación", error: "Error" }; return labels[status] || status || "Desconectado"; }
    function paintWhatsappStatus(status) { const state = document.getElementById("mensajes-whatsapp-status"); const start = document.getElementById("mensajes-whatsapp-start"); const stop = document.getElementById("mensajes-whatsapp-stop"); if (!state) return; const statusName = status?.status || "disconnected"; state.textContent = formatWhatsappStatus(statusName) + (status?.error ? `: ${status.error}` : ""); state.dataset.status = statusName; state.className = `mensajes-wa-state is-${statusName}`; if (start) { start.textContent = ["initializing", "connecting", "authenticated", "syncing", "reconnecting"].includes(statusName) ? "Reintentando..." : "Iniciar / reintentar"; start.disabled = ["initializing", "connecting", "authenticated", "syncing"].includes(statusName); } if (stop) stop.disabled = ["disconnected", "error", "auth_failure"].includes(statusName); }
    async function refreshWhatsappStatus() { try { const data = await api("/api/mensajes-view/whatsapp/status"); paintWhatsappStatus(data.status); } catch (error) { paintWhatsappStatus({ status: "error", error: error.message }); } }
    async function startWhatsapp() { paintWhatsappStatus({ status: "initializing" }); try { const data = await api("/api/mensajes-view/whatsapp/start", { method: "POST" }); paintWhatsappStatus(data.status); } catch (error) { await refreshWhatsappStatus(); alert(error.message); } }
    async function stopWhatsapp() { try { const data = await api("/api/mensajes-view/whatsapp/stop", { method: "POST" }); paintWhatsappStatus(data.status); } catch (error) { alert(error.message); } }
    async function clearWhatsappSession() { if (!confirm("Se cerrará WhatsApp y se borrará la sesión guardada. El siguiente inicio pedirá un QR nuevo. ¿Continuar?")) return; try { const data = await api("/api/mensajes-view/whatsapp/session", { method: "DELETE" }); paintWhatsappStatus(data.status); } catch (error) { alert(error.message); } }
    async function setGlobalAiMode(mode) { await api("/api/mensajes-view/global-ai-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) }); await refreshGlobalAiStatus(); await loadConversations(); if (selectedId) await loadConversation(selectedId); }
    async function restoreActiveReminder() { const active = await api("/api/mensajes-view/reminders-active"); if (!active.batch) return; const modal = document.getElementById("mensajes-reminder-modal"); if (!modal) return; modal.dataset.batchId = active.batch.id; modal.querySelector("#reminder-send").disabled = true; modal.querySelector("#reminder-cancel").disabled = false; pollReminder(); }
    // --- Conversaciones ---
    const CONV_STATE = {
        review_required: { label: "Necesita revisión", cls: "is-review", icon: "⚠" },
        assistant: { label: "IA", cls: "is-ai", icon: "🤖" },
        manual: { label: "Manual", cls: "is-manual", icon: "" },
        paused: { label: "Pausada", cls: "is-paused", icon: "" }
    };
    function normSearch(value) {
        return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    }
    // Avatar = burbuja de chat (contorno, fondo transparente). Varía según el caso:
    // IA -> tres puntos · revisión -> signo de exclamación · resto -> burbuja simple.
    function convAvatarSvg(attentionMode, typing) {
        const bubble = '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>';
        let inner = "";
        if (attentionMode === "review_required") {
            inner = '<line x1="12" y1="7.6" x2="12" y2="12.4"/><circle cx="12" cy="15.5" r="0.6" fill="currentColor" stroke="none"/>';
        } else if (attentionMode === "assistant") {
            inner = '<circle cx="8.4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15.6" cy="12" r="1" fill="currentColor" stroke="none"/>';
        }
        return `<svg class="conv-bubble${typing ? " is-typing" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${bubble}${inner}</svg>`;
    }
    function convShortTime(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const now = new Date();
        if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return "Ayer";
        return date.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit" });
    }
    // Metadatos que no vienen en /conversations: nombre del paciente vinculado y
    // qué conversaciones tienen la IA generando respuesta. Ambos de endpoints ya
    // existentes; las vinculaciones cambian poco, se refrescan cada ~10s.
    async function refreshConversationMeta({ force = false } = {}) {
        const tasks = [];
        if (force || Date.now() - patientNamesFetchedAt > 10000) {
            tasks.push(api("/api/mensajes-view/patient-identities").then((data) => {
                patientNameByChat = new Map((data.identities || []).filter((x) => x.waChatId).map((x) => [x.waChatId, { name: x.patientName, treatment: x.treatmentType }]));
                patientNamesFetchedAt = Date.now();
            }).catch(() => {}));
        }
        tasks.push(api("/api/mensajes-view/response-queue?limit=200").then((data) => {
            aiWorkingConvIds = new Set((data.queue || []).filter((q) => ["generating", "ready_to_send", "sending"].includes(q.status)).map((q) => q.conversationId));
        }).catch(() => {}));
        await Promise.allSettled(tasks);
        renderConversationList();
    }
    async function loadConversations() {
        const data = await api("/api/mensajes-view/conversations?limit=100");
        allConversations = data.conversations || [];
        renderConversationList();
    }
    function renderConversationList() {
        const list = document.getElementById("mensajes-list");
        if (!list) return;
        const term = normSearch(convSearchTerm);
        const decorated = allConversations.map((c) => {
            const linked = c.waChatId ? patientNameByChat.get(c.waChatId) : null;
            const realName = linked?.name || c.waDisplayName || "";
            return {
                c,
                realName,
                displayName: realName || c.phone || "Sin número",
                aiWorking: aiWorkingConvIds.has(c.id)
            };
        });
        const reviewCount = decorated.filter((x) => x.c.attentionMode === "review_required").length;

        const filtersEl = document.getElementById("mensajes-filters");
        if (filtersEl) {
            const countEl = filtersEl.querySelector('[data-filter="review"] .chip-count');
            if (countEl) countEl.textContent = reviewCount ? ` ${reviewCount}` : "";
            filtersEl.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === convListFilter));
        }

        let rows = decorated;
        if (convListFilter === "review") rows = rows.filter((x) => x.c.attentionMode === "review_required");
        else if (convListFilter === "ai") rows = rows.filter((x) => x.c.attentionMode === "assistant");
        if (term) rows = rows.filter((x) => normSearch(x.displayName).includes(term) || normSearch(x.c.phone).includes(term) || normSearch(x.c.waDisplayName).includes(term));

        const sig = JSON.stringify({
            f: convListFilter,
            s: term,
            rows: rows.map((x) => [x.c.id, x.c.attentionMode, x.c.unreadCount, x.c.lastMessageAt, x.c.updatedAt, x.displayName, x.aiWorking, x.c.id === selectedId, x.c.humanReviewReason || 0, x.c.aiExcluded ? 1 : 0])
        });
        if (sig === lastListSig && list.querySelector("[data-id], .mensajes-empty")) return;
        lastListSig = sig;

        if (!rows.length) {
            list.innerHTML = `<div class="mensajes-empty">${allConversations.length ? "Sin resultados." : "No hay conversaciones."}</div>`;
            return;
        }
        list.innerHTML = rows.map(({ c, displayName, aiWorking }) => {
            const state = CONV_STATE[c.attentionMode] || { label: c.attentionMode || "", cls: "", icon: "" };
            const unread = c.unreadCount || 0;
            const isReview = c.attentionMode === "review_required";
            const typing = aiWorking && !isReview;
            const secondLine = isReview ? (c.humanReviewReason || "Necesita revisión") : (typing ? "IA escribiendo…" : "");
            return `<button class="mensajes-conversation ${c.id === selectedId ? "is-selected" : ""} ${state.cls} ${unread ? "has-unread" : ""}" data-id="${c.id}">
                <span class="conv-avatar">${convAvatarSvg(c.attentionMode, typing)}</span>
                <span class="conv-main">
                    <span class="conv-top"><span class="conv-name">${esc(displayName)}</span><span class="conv-time">${esc(convShortTime(c.lastMessageAt || c.updatedAt))}</span></span>
                    <span class="conv-sub">
                        <span class="conv-chip ${state.cls}">${state.icon ? state.icon + " " : ""}${esc(state.label)}</span>
                        ${c.aiExcluded ? '<span class="conv-chip is-excluded" title="La IA no responde a este chat (lista de no responder)">🚫 Excluido</span>' : ""}
                        ${secondLine ? `<span class="conv-preview${typing ? " is-typing" : ""}">${typing ? '<span class="typing-dot"></span>' : ""}${esc(secondLine)}</span>` : ""}
                        ${unread ? `<span class="conv-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
                    </span>
                </span>
            </button>`;
        }).join("");
        list.querySelectorAll("[data-id]").forEach((button) => button.addEventListener("click", () => loadConversation(Number(button.dataset.id))));
    }
    // Las reacciones (❤️, 👍…) llegan como mensajes propios con reactionTargetId
    // apuntando al mensaje reaccionado. En vez de mostrarlas como burbuja aparte,
    // las pegamos sobre esa burbuja (como hace WhatsApp). Si el mensaje original
    // no está en la página cargada, se muestran como burbuja normal (fallback).
    const REACTION_PREFIX = "Reacción: ";
    // El id de WhatsApp a veces llega como clave compuesta ("false_<chat>_<id>")
    // y otras como el id simple; comparamos también por el último segmento para
    // no perder el enlace cuando el formato no coincide exactamente.
    function lastIdSegment(value) {
        const str = String(value || "");
        const idx = str.lastIndexOf("_");
        return idx === -1 ? str : str.slice(idx + 1);
    }
    function groupReactionsOntoTargets(messages) {
        const byTarget = new Map();
        const visible = [];
        for (const m of messages) {
            if (typeof m.content === "string" && m.content.startsWith(REACTION_PREFIX) && m.reactionTargetId) {
                const list = byTarget.get(m.reactionTargetId) || [];
                list.push(m);
                byTarget.set(m.reactionTargetId, list);
            } else {
                visible.push(m);
            }
        }
        const byExternalId = new Map(visible.filter((m) => m.externalId).map((m) => [m.externalId, m]));
        const bySegment = new Map(visible.filter((m) => m.externalId).map((m) => [lastIdSegment(m.externalId), m]));
        for (const [targetId, reactions] of byTarget) {
            const target = byExternalId.get(targetId) || bySegment.get(lastIdSegment(targetId));
            if (target) target.attachedReactions = reactions;
            else visible.push(...reactions);
        }
        return visible;
    }
    function scrollChatToBottom(behavior = "smooth") {
        const body = document.getElementById("mensajes-chat-body");
        if (!body) return;
        requestAnimationFrame(() => body.scrollTo({ top: body.scrollHeight, behavior }));
    }
    function renderPatientPanel(link, conversation) {
        let panel = document.getElementById("mensajes-patient-panel");
        if (!panel) { document.getElementById("mensajes-chat-head")?.insertAdjacentHTML("afterend", `<div id="mensajes-patient-panel" class="mensajes-patient-panel"></div>`); panel = document.getElementById("mensajes-patient-panel"); }
        if (!panel) return;
        if (link) {
            panel.innerHTML = `<div class="patient-identity-main"><span class="patient-identity-status is-linked">Paciente identificado</span><strong>${esc(link.patientName)}</strong><span>${esc(link.phone || "Teléfono no disponible")} · ${esc(link.treatmentType || "Tratamiento no especificado")}</span></div><div class="patient-identity-actions"><button type="button" data-patient-change>Cambiar</button><button type="button" data-patient-unlink>Desvincular</button></div>`;
            panel.querySelector("[data-patient-change]").addEventListener("click", () => openPatientSearchModal(conversation));
            panel.querySelector("[data-patient-unlink]").addEventListener("click", async () => { if (!confirm("¿Desvincular este paciente de la conversación?")) return; await api(`/api/mensajes-view/conversations/${conversation.id}/identify-patient`, { method: "DELETE" }); await refreshConversationMeta({ force: true }); await loadConversation(conversation.id, { markRead: false, force: true }); });
        } else {
            panel.innerHTML = `<div class="patient-identity-main"><span class="patient-identity-status">Paciente no identificado</span><span>${esc(conversation.waDisplayName || (conversation.phoneResolved ? conversation.phone : "Chat sin teléfono real"))}</span></div><button type="button" data-patient-identify>Identificar paciente</button>`;
            panel.querySelector("[data-patient-identify]").addEventListener("click", () => openPatientSearchModal(conversation));
        }
    }
    async function openPatientSearchModal(conversation) {
        let modal = document.getElementById("mensajes-patient-search-modal");
        if (!modal) {
            modal = document.createElement("div"); modal.id = "mensajes-patient-search-modal"; modal.className = "mensajes-settings-overlay";
            modal.innerHTML = `<div class="patient-search-card"><button type="button" class="patient-search-close">×</button><h3>Identificar paciente</h3><p>Busca por nombre o teléfono y selecciona el paciente correcto.</p><div class="patient-search-form"><input id="patient-search-query" placeholder="Nombre o teléfono"><button type="button" id="patient-search-submit">Buscar</button></div><div id="patient-search-results" class="patient-search-results"></div></div>`;
            document.body.appendChild(modal);
            modal.querySelector(".patient-search-close").addEventListener("click", () => { modal.hidden = true; });
            modal.addEventListener("click", (event) => { if (event.target === modal) modal.hidden = true; });
        }
        const queryInput = modal.querySelector("#patient-search-query"); const results = modal.querySelector("#patient-search-results");
        const search = async () => {
            const query = queryInput.value.trim(); if (query.length < 2) { results.innerHTML = `<div class="patient-search-empty">Escribe al menos 2 caracteres.</div>`; return; }
            results.innerHTML = `<div class="patient-search-empty">Buscando...</div>`;
            try {
                const data = await api(`/api/mensajes-view/patients/search?q=${encodeURIComponent(query)}`);
                results.innerHTML = data.patients.length ? data.patients.map((patient) => `<div class="patient-search-result"><div><strong>${esc(patient.name)}</strong><span>${esc(patient.phone || "Sin teléfono")} · ${esc(patient.treatment || "Sin tratamiento")}${patient.active ? "" : " · INACTIVO"}</span></div><button type="button" data-patient-id="${patient.id}" ${patient.active ? "" : "disabled"}>Vincular</button></div>`).join("") : `<div class="patient-search-empty">No se encontraron pacientes. Regístralo primero desde Pacientes.</div>`;
                results.querySelectorAll("[data-patient-id]").forEach((button) => button.addEventListener("click", async () => { button.disabled = true; try { await api(`/api/mensajes-view/conversations/${conversation.id}/identify-patient`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: Number(button.dataset.patientId) }) }); modal.hidden = true; await refreshConversationMeta({ force: true }); await loadConversation(conversation.id, { markRead: false, force: true }); } catch (error) { button.disabled = false; alert(error.message); } }));
            } catch (error) { results.innerHTML = `<div class="patient-search-empty">${esc(error.message)}</div>`; }
        };
        modal.querySelector("#patient-search-submit").onclick = search; queryInput.onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }; queryInput.value = ""; results.innerHTML = `<div class="patient-search-empty">Escribe un nombre o teléfono.</div>`; modal.hidden = false; queryInput.focus();
    }
    async function openPatientSearch(conversation) {
        const query = prompt("Escribe el nombre o teléfono del paciente:");
        if (query === null || query.trim().length < 2) return;
        try {
            const data = await api(`/api/mensajes-view/patients/search?q=${encodeURIComponent(query.trim())}`);
            if (!data.patients.length) return alert("No se encontraron pacientes. Puedes registrarlo desde Pacientes y luego vincularlo.");
            const choices = data.patients.map((p, index) => `${index + 1}. ${p.name} · ${p.phone || "sin teléfono"} · ${p.treatment || "sin tratamiento"}${p.active ? "" : " · INACTIVO"}`).join("\n");
            const answer = prompt(`Selecciona el número del paciente correcto:\n\n${choices}`);
            const selected = data.patients[Number(answer) - 1];
            if (!selected) return;
            if (!selected.active) return alert("No se puede vincular un paciente inactivo.");
            await api(`/api/mensajes-view/conversations/${conversation.id}/identify-patient`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: selected.id }) });
            await refreshConversationMeta({ force: true });
            await loadConversation(conversation.id, { markRead: false, force: true });
        } catch (error) { alert(error.message); }
    }
    async function loadConversation(id, options = {}) {
        const loadSeq = ++conversationLoadSeq;
        const markRead = options.markRead !== false;
        if (selectedId !== id) lastChatSig = "";
        selectedId = id;
        try {
        const queueData = await api(`/api/mensajes-view/conversations/${id}/response-queue?limit=10`); const activeQueue = queueData.queue.find((item) => ["generating", "ready_to_send", "sending"].includes(item.status));
        const data = await api(`/api/mensajes-view/conversations/${id}/messages?limit=100&offset=0`);
        if (loadSeq !== conversationLoadSeq || selectedId !== id || !document.getElementById("mensajes-chat-head")) return;
        // El poll llama esto cada 2s: si el chat no cambió, no reconstruir el DOM
        // (evita re-parsear 100 burbujas, re-scroll y re-bind de listeners cada tick).
        const sig = JSON.stringify({
            p: data.conversation.phone, m: data.conversation.attentionMode, x: data.conversation.aiExcluded ? 1 : 0,
            link: data.patientLink ? [data.patientLink.patientId, data.patientLink.active] : null,
            q: activeQueue ? activeQueue.status : null,
            msgs: (data.messages || []).map((x) => [x.id, x.deliveryStatus, x.queued ? 1 : 0, x.error || 0])
        });
        if (sig === lastChatSig && !options.force && document.querySelector(".mensajes-chat-actions")) {
            if (markRead) await api(`/api/mensajes-view/conversations/${id}/read`, { method: "POST" });
            return;
        }
        lastChatSig = sig;
        const chatBody = document.getElementById("mensajes-chat-body");
        renderPatientPanel(data.patientLink, data.conversation);
        const wasSelectingMessages = document.querySelector(".mensajes-chat")?.classList.contains("is-selecting");
        const selectedMessageIds = new Set([...document.querySelectorAll("[data-message-select]:checked")].map((input) => input.dataset.messageSelect));
        const wasNearBottom = !chatBody || chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 80;
        const headName = data.patientLink?.patientName || data.conversation.waDisplayName || data.conversation.phone || "Sin número";
        const headState = CONV_STATE[data.conversation.attentionMode] || { label: data.conversation.attentionMode || "", icon: "" };
        const headSub = data.conversation.attentionMode === "review_required" && data.conversation.humanReviewReason
            ? `${headState.icon} ${esc(data.conversation.humanReviewReason)}`
            : `${headState.icon ? headState.icon + " " : ""}${esc(headState.label)}`;
        document.getElementById("mensajes-chat-head").innerHTML = `<div><strong>${esc(headName)}</strong><span class="chat-head-state ${headState.cls || ""}">${headSub}</span>${data.conversation.aiExcluded ? '<span class="chat-head-state is-excluded" title="La IA no responde a este chat. Quitalo de la lista en Ajustes, Control de telefonos, para reactivarla.">🚫 Excluido de la IA</span>' : ""}</div><div class="mensajes-chat-actions"><button data-action="take">Tomar</button><button data-action="release">Liberar</button><button data-action="ignore" title="Agregar este teléfono a la lista de ignorados">🚫 No responder</button><button data-action="delete" title="Borrar conversación">🗑</button></div>`;
        const renderedMessages = groupReactionsOntoTargets(data.messages);
        chatBody.innerHTML = renderedMessages.length ? renderedMessages.map((m) => { const state = m.queued ? (m.deliveryStatus === "failed" ? "Error de envío" : "En cola") : (m.deliveryStatus === "delivered" ? "Entregado" : m.deliveryStatus === "read" ? "Leído" : m.deliveryStatus === "sent" ? "Enviado" : "Recibido"); const reactions = m.attachedReactions || []; return `<div class="mensaje-bubble ${m.direction === "outgoing" ? "outgoing" : "incoming"} ${m.queued ? "is-queued" : ""} ${m.deliveryStatus === "failed" ? "is-failed" : ""}"><p>${esc(m.content)}</p><small>${esc(m.author)} · ${esc(formatDate(m.messageAt))} · ${state}${m.error ? ` · ${esc(m.error)}` : ""}</small>${m.deliveryStatus === "failed" ? `<button class="mensaje-retry" data-retry-id="${String(m.id).replace("queue-", "")}" type="button">Reintentar</button>` : ""}${reactions.length ? `<span class="mensaje-reactions">${reactions.map((r) => esc(r.content.slice(REACTION_PREFIX.length))).join(" ")}</span>` : ""}</div>`; }).join("") : `<div class="mensajes-empty">Sin mensajes.</div>`;
        if (activeQueue) { const indicator = document.createElement("div"); indicator.className = "mensajes-ai-queue-status"; indicator.textContent = activeQueue.status === "sending" ? "Enviando respuesta…" : activeQueue.status === "ready_to_send" ? "Respuesta lista para enviar…" : "La IA está preparando una respuesta…"; document.getElementById("mensajes-chat-body").prepend(indicator); }
        if (wasNearBottom) scrollChatToBottom("smooth");
        const compose = document.getElementById("mensajes-compose");
        if (compose) { compose.hidden = false; compose.removeAttribute("hidden"); compose.style.display = "flex"; }
        const actions = document.querySelector(".mensajes-chat-actions");
        if (actions) {
            const deleteSelected = document.createElement("button");
            deleteSelected.type = "button";
            deleteSelected.textContent = "🗑 Eliminar";
            deleteSelected.dataset.deleteSelected = "1";
            actions.insertBefore(deleteSelected, actions.firstChild);
        }
        chatBody.querySelectorAll(".mensaje-bubble").forEach((bubble, index) => {
            const message = renderedMessages[index];
            if (!message) return;
            const label = document.createElement("label");
            label.className = "mensaje-select";
            label.title = "Seleccionar mensaje";
            label.innerHTML = `<input type="checkbox" data-message-select="${esc(String(message.id))}" aria-label="Seleccionar mensaje">`;
            if (selectedMessageIds.has(String(message.id))) label.querySelector("input").checked = true;
            bubble.prepend(label);
            bubble.addEventListener("contextmenu", (event) => openMessageContextMenu(event, message.id));
        });
        document.querySelectorAll("[data-retry-id]").forEach((button) => button.addEventListener("click", () => retryMessage(button.dataset.retryId)));
        const deleteButton = document.querySelector("[data-delete-selected]");
        if (deleteButton) deleteButton.addEventListener("click", () => setMessageSelectionMode(true));
        const refreshDeleteButton = () => { if (deleteButton) deleteButton.textContent = `${document.querySelectorAll("[data-message-select]:checked").length ? "🗑 Eliminar seleccionados" : "🗑 Eliminar"}`; };
        document.querySelectorAll("[data-message-select]").forEach((input) => input.addEventListener("change", refreshDeleteButton));
        refreshDeleteButton();
        if (wasSelectingMessages) setMessageSelectionMode(true);
        const activeCompose = document.getElementById("mensajes-compose");
        if (activeCompose) {
            activeCompose.hidden = false;
            activeCompose.removeAttribute("hidden");
            activeCompose.style.display = "flex";
            const composeInput = activeCompose.querySelector("#mensajes-input");
            const composeButton = activeCompose.querySelector('button[type="submit"]');
            if (composeInput) { composeInput.disabled = false; composeInput.placeholder = "Escribe una respuesta..."; }
            if (composeButton) composeButton.disabled = false;
        }
        document.querySelectorAll(".mensajes-conversation").forEach((b) => b.classList.toggle("is-selected", Number(b.dataset.id) === id));
        document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => conversationAction(button.dataset.action)));
        if (markRead) await api(`/api/mensajes-view/conversations/${id}/read`, { method: "POST" });
        if (loadSeq !== conversationLoadSeq || selectedId !== id || !document.getElementById("mensajes-chat-head")) return;
        if (!options.skipListRefresh) {
            await loadConversations();
        }
        await refreshGlobalAiStatus();
        } catch (error) {
            // La conversación pudo haber sido borrada (por este cliente o durante "Borrar todo").
            // No dejar que reviente el poll; volver al estado vacío si seguía seleccionada.
            if (selectedId === id) {
                selectedId = null;
                const head = document.getElementById("mensajes-chat-head");
                const body = document.getElementById("mensajes-chat-body");
                if (head) head.innerHTML = "<span>Selecciona una conversación</span>";
                if (body) body.innerHTML = "<div class=\"mensajes-empty\">Selecciona una conversación para ver el historial.</div>";
                try { await loadConversations(); } catch (_) {}
            }
        }
    }
    async function retryMessage(queueId) { await api(`/api/mensajes-view/conversations/${selectedId}/messages/${queueId}/retry`, { method: "POST" }); await loadConversation(selectedId); }
    function setMessageSelectionMode(enabled) {
        const chat = document.querySelector(".mensajes-chat");
        if (!chat) return;
        chat.classList.toggle("is-selecting", enabled);
        const actions = chat.querySelector(".mensajes-chat-actions");
        if (!actions) return;
        let cancel = actions.querySelector("[data-cancel-selection]");
        if (enabled && !cancel) { cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancelar"; cancel.dataset.cancelSelection = "1"; cancel.addEventListener("click", () => { document.querySelectorAll("[data-message-select]").forEach((input) => { input.checked = false; }); setMessageSelectionMode(false); }); actions.insertBefore(cancel, actions.firstChild); }
        if (!enabled && cancel) cancel.remove();
        const originalDelete = actions.querySelector("[data-delete-selected]");
        let confirmDelete = actions.querySelector("[data-confirm-delete]");
        if (enabled && !confirmDelete) {
            confirmDelete = document.createElement("button");
            confirmDelete.type = "button";
            confirmDelete.textContent = "Eliminar seleccionados";
            confirmDelete.dataset.confirmDelete = "1";
            confirmDelete.addEventListener("click", deleteSelectedMessages);
            actions.insertBefore(confirmDelete, actions.firstChild);
        }
        if (!enabled && confirmDelete) confirmDelete.remove();
        if (originalDelete) originalDelete.hidden = enabled;
        const deleteButton = actions.querySelector("[data-delete-selected]");
        if (deleteButton) deleteButton.textContent = enabled ? "Eliminar seleccionados" : "🗑 Eliminar";
    }
    function openMessageContextMenu(event, messageId) {
        event.preventDefault();
        document.querySelector(".mensaje-context-menu")?.remove();
        const menu = document.createElement("div");
        menu.className = "mensaje-context-menu";
        menu.innerHTML = `<button type="button" data-context-select>Seleccionar mensaje</button><button type="button" data-context-delete>Eliminar mensaje</button>`;
        menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
        menu.style.top = `${Math.min(event.clientY, window.innerHeight - 90)}px`;
        document.body.appendChild(menu);
        menu.querySelector("[data-context-select]").addEventListener("click", () => { setMessageSelectionMode(true); const input = document.querySelector(`[data-message-select="${CSS.escape(String(messageId))}"]`); if (input) input.checked = true; menu.remove(); });
        menu.querySelector("[data-context-delete]").addEventListener("click", async () => { menu.remove(); if (!confirm("¿Eliminar este mensaje del historial?")) return; try { await api(`/api/mensajes-view/conversations/${selectedId}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" }); await loadConversation(selectedId, { markRead: false }); } catch (error) { alert(error.message); } });
        const close = () => { menu.remove(); document.removeEventListener("click", close); };
        setTimeout(() => document.addEventListener("click", close), 0);
    }
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { document.querySelector(".mensaje-context-menu")?.remove(); setMessageSelectionMode(false); } });
    async function deleteSelectedMessages() { const ids = [...document.querySelectorAll("[data-message-select]:checked")].map((input) => input.dataset.messageSelect); if (!ids.length || !confirm(`¿Eliminar ${ids.length} mensaje(s) del chat?`)) return; try { await Promise.all(ids.map((messageId) => api(`/api/mensajes-view/conversations/${selectedId}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" }))); await loadConversation(selectedId, { markRead: false }); } catch (error) { alert(error.message); } }
    async function conversationAction(action) {
        if (!selectedId) return;
        if (action === "delete") { if (!confirm("¿Borrar esta conversación y su historial?")) return; const target = selectedId; conversationLoadSeq++; selectedId = null; const startedAt = Date.now(); showBusyOverlay("Borrando conversación…", "Un momento."); try { await api(`/api/mensajes-view/conversations/${target}`, { method: "DELETE" }); } catch (error) { if (!/no encontrada/i.test(error.message || "")) alert(error.message); } finally { await hideBusyOverlay(startedAt, 500); } const compose = document.getElementById("mensajes-compose"); if (compose) { compose.hidden = false; compose.removeAttribute("hidden"); compose.style.display = "flex"; const input = compose.querySelector("#mensajes-input"); const button = compose.querySelector('button[type="submit"]'); if (input) { input.value = ""; input.disabled = true; input.placeholder = "Selecciona una conversación para responder"; } if (button) button.disabled = true; } document.getElementById("mensajes-chat-head").innerHTML = "<span>Selecciona una conversación</span>"; document.getElementById("mensajes-chat-body").innerHTML = "<div class=\"mensajes-empty\">Selecciona una conversación para ver el historial.</div>"; return loadConversations().catch(() => {}); }
        if (action === "ignore") return ignoreConversationPhone(selectedId);
        const endpoint = action === "take" ? "take" : "release";
        await api(`/api/mensajes-view/conversations/${selectedId}/${endpoint}`, { method: "POST" });
        await loadConversation(selectedId);
    }
    // Agrega el teléfono de la conversación a la lista de números que la IA no
    // debe responder (misma lista que usa "Ajustes globales > Reglas de teléfonos").
    async function ignoreConversationPhone(conversationId) {
        let conversation, patientLink;
        try {
            const data = await api(`/api/mensajes-view/conversations/${conversationId}/messages?limit=1&offset=0`);
            conversation = data.conversation;
            patientLink = data.patientLink;
        } catch (error) { return alert(error.message); }
        // Un mismo chat puede conocerse por varios identificadores: el número real, el
        // del expediente (si está vinculado), el wa_contact_number resuelto y el LID
        // (chats @lid). Ignoramos todos para que la IA lo respete sin importar cuál use
        // al comparar (ver shouldAllowAutomatedResponseForConversation en el backend).
        const identifiers = [...new Set([patientLink?.phone, conversation.phone, conversation.waContactNumber, conversation.waChatId]
            .map((value) => String(value || "").replace(/\D/g, ""))
            .filter((value) => /^\d{7,20}$/.test(value)))];
        if (!identifiers.length) return alert("Esta conversación no tiene un teléfono válido para ignorar.");
        if (!confirm(`¿Dejar de responder automáticamente a este chat?\n\nLa IA no volverá a contestarle hasta que lo quites de la lista de ignorados en Ajustes.`)) return;
        try {
            const { settings } = await api("/api/mensajes-view/settings");
            let numbers = settings.automationPhoneNumbers || [];
            const mode = settings.automationPhoneMode;
            if (mode === "all") return alert('El modo de automatización está en "Todos los teléfonos". Cambia el modo en Ajustes globales para poder ignorar números individuales.');
            if (mode === "exclude") { numbers = [...new Set([...numbers, ...identifiers])]; }
            else { numbers = numbers.filter((n) => !identifiers.includes(n)); }
            await api("/api/mensajes-view/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responseDelayMin: settings.responseDelayMin, responseDelayMax: settings.responseDelayMax, responseGroupDelaySeconds: settings.responseGroupDelaySeconds, automationPhoneMode: mode, automationPhoneNumbers: numbers }) });
            alert("Listo. La IA ya no responderá automáticamente a este número.");
        } catch (error) { alert(error.message); }
    }
    // --- Simulador y envío ---
    async function simulateIncoming(event) { event?.preventDefault(); if (simulatingIncoming) return; const phoneInput = document.getElementById("mensajes-sim-phone"); const messageInput = document.getElementById("mensajes-sim-text"); const submit = document.getElementById("mensajes-sim-submit"); const phone = phoneInput?.value.trim(); const message = messageInput?.value.trim(); if (!phone || !message) return; simulatingIncoming = true; if (submit) { submit.disabled = true; submit.textContent = "Enviando..."; } try { const data = await api("/api/mensajes-view/simulator/incoming", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, message }) }); messageInput.value = ""; await loadConversation(data.conversation.id, { force: true }); } catch (error) { alert(error.message); } finally { simulatingIncoming = false; if (submit) { submit.disabled = false; submit.textContent = "Simular mensaje"; } messageInput?.focus(); } }
    // --- Ajustes e IA ---
    async function openGlobalSettings() {
        const data = await api("/api/mensajes-view/settings");
        const automation = await api("/api/mensajes-view/automation-settings");
        let modal = document.getElementById("mensajes-settings-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "mensajes-settings-modal";
            modal.className = "mensajes-settings-overlay";
            modal.innerHTML = `<div class="mensajes-settings-panel"><aside class="mensajes-settings-nav"><h2>Ajustes</h2><button class="is-active" data-settings-section="automation">Respuestas automáticas</button><button data-settings-section="ia">Asistente IA</button><button type="button" data-close class="settings-close">Cerrar</button></aside><div class="mensajes-settings-content"><section data-settings-content="automation"><h3>Respuestas automáticas</h3><label>Tiempo mínimo (segundos)<input id="settings-delay-min" type="number" min="0" max="3600" step="0.1"></label><label>Tiempo máximo (segundos)<input id="settings-delay-max" type="number" min="0" max="3600" step="0.1"></label><label><input id="settings-auto-enabled" type="checkbox"> Activar automatizaciones</label><label>Horario inicial<span id="settings-auto-start" class="t12-host"></span></label><label>Horario final<span id="settings-auto-end" class="t12-host"></span></label><button id="settings-save-automation" type="button">Guardar automatizaciones</button></section><section data-settings-content="ia" hidden></section></div></div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll("[data-settings-section]").forEach((button) => button.addEventListener("click", () => {
                modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button));
                modal.querySelectorAll("[data-settings-content]").forEach((content) => { content.hidden = content.dataset.settingsContent !== button.dataset.settingsSection; });
            }));
            modal.querySelector("[data-close]").addEventListener("click", () => { modal.hidden = true; });
            modal.querySelector("#settings-save-automation").addEventListener("click", async () => {
                await api("/api/mensajes-view/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responseDelayMin: Number(modal.querySelector("#settings-delay-min").value), responseDelayMax: Number(modal.querySelector("#settings-delay-max").value) }) });
                await api("/api/mensajes-view/automation-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: modal.querySelector("#settings-auto-enabled").checked, appointmentConfirmation: true, appointmentReminder: true, appointmentChangeNotice: true, afterHoursReply: true, humanInterventionPause: true, allowedStart: t12Read(modal.querySelector("#settings-auto-start")), allowedEnd: t12Read(modal.querySelector("#settings-auto-end")) }) });
                alert("Ajustes guardados");
            });
        }
        modal.querySelector("#settings-delay-min").value = data.settings.responseDelayMin;
        modal.querySelector("#settings-delay-max").value = data.settings.responseDelayMax;
        modal.querySelector("#settings-auto-enabled").checked = automation.settings.enabled;
        modal.querySelector("#settings-auto-start").innerHTML = t12Html("", automation.settings.allowedStart);
        modal.querySelector("#settings-auto-end").innerHTML = t12Html("", automation.settings.allowedEnd);
        modal.hidden = false;
    }
    // Overlay de "operación en curso". Cubre toda la ventana (position:fixed, z-index alto)
    // y bloquea toda interacción por sí solo; no hace falta deshabilitar controles uno a uno.
    function showBusyOverlay(title, subtitle) {
        let overlay = document.getElementById("mensajes-busy-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "mensajes-busy-overlay";
            overlay.className = "mensajes-operation-loader";
            overlay.setAttribute("role", "alert");
            overlay.setAttribute("aria-busy", "true");
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `<div><span class="mensajes-spinner"></span><strong>${esc(title)}</strong><small>${esc(subtitle || "")}</small><span class="mensajes-progress"></span></div>`;
        return overlay;
    }
    async function hideBusyOverlay(startedAt, minMs) {
        const elapsed = Date.now() - (startedAt || 0);
        if (minMs && elapsed < minMs) await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
        document.getElementById("mensajes-busy-overlay")?.remove();
    }
    async function deleteAllConversations() {
        if (deletingAll || !confirm("Borrar TODAS las conversaciones, mensajes y pendientes de la vista Mensajes?\n\nLas vinculaciones de pacientes se conservan. Esta acción no se puede deshacer.")) return;
        deletingAll = true;
        const startedAt = Date.now();
        showBusyOverlay("Borrando conversaciones…", "Puede tardar unos segundos. No cierres ni cambies de vista.");
        try {
            await api("/api/mensajes-view/conversations", { method: "DELETE" });
            selectedId = null;
            lastChatSig = ""; lastListSig = "";
            await loadConversations();
        } catch (error) {
            alert(error.message);
        } finally {
            await hideBusyOverlay(startedAt, 900);
            deletingAll = false;
        }
    }
    async function sendMessage(event) {
        event.preventDefault();
        const input = document.getElementById("mensajes-input");
        const submit = event.currentTarget?.querySelector('button[type="submit"]');
        const value = input.value.trim();
        if (!selectedId || !value || sendingMessage) return;
        sendingMessage = true;
        input.disabled = true;
        if (submit) submit.disabled = true;
        try { await api(`/api/mensajes-view/conversations/${selectedId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }) }); input.value = ""; await loadConversation(selectedId, { force: true }); }
        catch (error) { alert(error.message); }
        finally { sendingMessage = false; input.disabled = false; if (submit) submit.disabled = false; input.focus(); }
    }
    async function enrichPatientIdentitySettings() {
        const modal = document.getElementById("mensajes-settings-modal"); const nav = modal?.querySelector(".mensajes-settings-nav"); const content = modal?.querySelector(".mensajes-settings-content");
        if (!modal || modal.querySelector('[data-settings-section="patient-identities"]')) return;
        nav.insertAdjacentHTML("beforeend", `<button data-settings-section="patient-identities">Vinculaciones</button>`);
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="patient-identities" hidden><h3>Vinculaciones de pacientes</h3><p>Estas relaciones son manuales y no se eliminan al borrar conversaciones.</p><div class="identity-settings-toolbar"><strong id="patient-identities-count">0 vinculaciones activas</strong><button type="button" id="patient-identities-refresh">Actualizar</button></div><div class="identity-settings-search"><input id="patient-identities-search" placeholder="Buscar por nombre, teléfono o chatId"><button type="button" id="patient-identities-search-btn">Buscar</button></div><div id="patient-identities-list" class="patient-identities-list"></div><button type="button" id="patient-identities-clear-all" class="identity-danger-button">Desvincular todas</button></section>`);
        const list = modal.querySelector("#patient-identities-list"); const count = modal.querySelector("#patient-identities-count"); const searchInput = modal.querySelector("#patient-identities-search");
        const load = async () => { const data = await api(`/api/mensajes-view/patient-identities?search=${encodeURIComponent(searchInput.value.trim())}`); count.textContent = `${data.identities.length} vinculaciones encontradas`; list.innerHTML = data.identities.length ? data.identities.map((item) => `<div class="identity-settings-item"><div><strong>${esc(item.patientName)}</strong><span>${esc(item.phone || "Sin teléfono")} · ${esc(item.treatmentType || "Sin tratamiento")}</span><small>${esc(item.waChatId)}</small></div><button type="button" data-identity-remove="${item.id}">Desvincular</button></div>`).join("") : `<div class="patient-search-empty">No hay vinculaciones activas.</div>`; list.querySelectorAll("[data-identity-remove]").forEach((button) => button.addEventListener("click", async () => { if (!confirm("¿Desvincular este paciente?")) return; await api(`/api/mensajes-view/patient-identities/${button.dataset.identityRemove}`, { method: "DELETE" }); await load(); })); };
        modal.querySelector("#patient-identities-refresh").addEventListener("click", load); modal.querySelector("#patient-identities-search-btn").addEventListener("click", load); searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void load(); } }); const clearAllButton = modal.querySelector("#patient-identities-clear-all"); clearAllButton.addEventListener("click", async () => { if (clearAllButton.dataset.confirming !== "1") { clearAllButton.dataset.confirming = "1"; clearAllButton.textContent = "Confirmar desvinculación total"; clearAllButton.classList.add("is-confirming"); setTimeout(() => { clearAllButton.dataset.confirming = "0"; clearAllButton.textContent = "Desvincular todas"; clearAllButton.classList.remove("is-confirming"); }, 5000); return; } clearAllButton.disabled = true; try { const result = await api("/api/mensajes-view/patient-identities", { method: "DELETE" }); clearAllButton.textContent = `${result.cleared} desvinculadas`; await load(); } catch (error) { clearAllButton.disabled = false; clearAllButton.textContent = error.message; } });
        await load(); const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); }; nav.querySelector('[data-settings-section="patient-identities"]').addEventListener("click", (event) => activate(event.currentTarget));
    }
    async function enrichAssistantKnowledge() {
        const modal = document.getElementById("mensajes-settings-modal");
        const section = modal?.querySelector('[data-settings-content="ia"]');
        if (!section || section.querySelector("#settings-assistant-knowledge")) return;
        const data = await api("/api/mensajes-view/assistant-knowledge");
        section.insertAdjacentHTML("afterbegin", `<h3>Conocimiento de la clínica</h3><p>La IA usa este texto tal cual para responder: identidad de la clínica, promociones vigentes, información que puede dar, ubicación, formas de pago y política de cancelación.</p><label>Texto<textarea id="settings-assistant-knowledge" rows="12" placeholder="Ej: Somos la Clínica X, en ... Atendemos de lunes a viernes de 8 a 18 h. Aceptamos efectivo y tarjeta. Promoción de agosto: limpieza dental a $20. Para cancelar una cita avisar con 24 h de anticipación."></textarea></label><button id="settings-save-knowledge" type="button">Guardar conocimiento</button><div id="settings-knowledge-result" class="settings-state-card"></div><hr>`);
        modal.querySelector("#settings-assistant-knowledge").value = data.knowledge || "";
        modal.querySelector("#settings-save-knowledge").addEventListener("click", async () => {
            try {
                const result = await api("/api/mensajes-view/assistant-knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledge: modal.querySelector("#settings-assistant-knowledge").value }) });
                modal.querySelector("#settings-knowledge-result").textContent = `Conocimiento guardado (${(result.knowledge || "").length} caracteres)`;
            } catch (error) { modal.querySelector("#settings-knowledge-result").textContent = error.message; }
        });
    }
    async function enrichHumanReviewSettings() {
        const modal = document.getElementById("mensajes-settings-modal");
        const section = modal?.querySelector('[data-settings-content="ia"]');
        if (!section || section.querySelector("#settings-human-review")) return;
        const data = await api("/api/mensajes-view/human-review");
        section.insertAdjacentHTML("beforeend", `<h3>Revisión humana</h3><p>Describí en qué situaciones el asistente debe dejar de responder y pasar la conversación a recepción. El asistente usa este texto tal cual para decidir cuándo transferir.</p><label>Texto<textarea id="settings-human-review" rows="8" placeholder="Ej: Pasá a recepción si el paciente menciona dolor intenso o urgencia, si está molesto o se queja, o si pide hablar con una persona."></textarea></label><p class="settings-help">Los mensajes de audio, fotos y documentos siempre pasan a recepción de forma automática (el asistente no puede procesarlos).</p><button id="settings-save-human" type="button">Guardar revisión humana</button><div id="settings-human-review-result" class="settings-state-card"></div>`);
        modal.querySelector("#settings-human-review").value = data.instructions || "";
        modal.querySelector("#settings-save-human").addEventListener("click", async () => {
            try {
                const result = await api("/api/mensajes-view/human-review", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructions: modal.querySelector("#settings-human-review").value }) });
                modal.querySelector("#settings-human-review-result").textContent = `Guardado (${(result.instructions || "").length} caracteres)`;
            } catch (error) { modal.querySelector("#settings-human-review-result").textContent = error.message; }
        });
    }
    async function enrichAutomationBuffer() { const modal = document.getElementById("mensajes-settings-modal"); const section = modal?.querySelector('[data-settings-content="automation"]'); if (!section || section.querySelector("#settings-group-delay")) return; section.insertAdjacentHTML("afterbegin", `<label>Tiempo para agrupar mensajes (segundos)<input id="settings-group-delay" type="number" min="0" max="120" step="0.1"></label><label><input id="settings-show-typing" type="checkbox" checked> Mostrar “escribiendo…”</label>`); const data = await api("/api/mensajes-view/settings"); modal.querySelector("#settings-group-delay").value = data.settings.responseGroupDelaySeconds ?? 4; modal.querySelector("#settings-save-automation").addEventListener("click", async () => { await api("/api/mensajes-view/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responseDelayMin: Number(modal.querySelector("#settings-delay-min").value), responseDelayMax: Number(modal.querySelector("#settings-delay-max").value), responseGroupDelaySeconds: Number(modal.querySelector("#settings-group-delay").value) }) }); }); }
    async function enrichReminderSettings() { const modal = document.getElementById("mensajes-settings-modal"); const section = modal?.querySelector('[data-settings-content="automation"]'); if (!section || section.querySelector("#settings-reminder-template")) return; const data = await api("/api/mensajes-view/reminder-settings"); section.insertAdjacentHTML("beforeend", `<hr><h3>Recordatorios</h3><p>Plantilla y temporizador global para los envíos de recordatorios.</p><label>Plantilla de recordatorio<textarea id="settings-reminder-template" rows="6"></textarea></label><p class="settings-help">Variables permitidas: {{nombre}}, {{fecha}}, {{hora}}, {{tratamiento}}. Se admiten saltos de línea.</p><label>Espera mínima entre mensajes (segundos)<input id="settings-reminder-min" type="number" min="1" max="3600" step="1"></label><label>Espera máxima entre mensajes (segundos)<input id="settings-reminder-max" type="number" min="1" max="3600" step="1"></label><button id="settings-save-reminders" type="button">Guardar recordatorios</button><div id="settings-reminder-result" class="settings-state-card"></div>`); modal.querySelector("#settings-reminder-template").value = data.settings.template; modal.querySelector("#settings-reminder-min").value = data.settings.minDelaySeconds; modal.querySelector("#settings-reminder-max").value = data.settings.maxDelaySeconds; modal.querySelector("#settings-save-reminders").addEventListener("click", async () => { const result = await api("/api/mensajes-view/reminder-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: modal.querySelector("#settings-reminder-template").value, minDelaySeconds: Number(modal.querySelector("#settings-reminder-min").value), maxDelaySeconds: Number(modal.querySelector("#settings-reminder-max").value) }) }); modal.querySelector("#settings-reminder-result").textContent = `Guardado: ${result.settings.minDelaySeconds}-${result.settings.maxDelaySeconds} segundos`; }); }
    async function enrichAiProviderSettings() {
        const modal = document.getElementById("mensajes-settings-modal"); const nav = modal?.querySelector(".mensajes-settings-nav"); const content = modal?.querySelector(".mensajes-settings-content");
        if (!modal || modal.querySelector('[data-settings-section="ai-provider"]')) return;
        const data = await api("/api/mensajes-view/ai-provider-settings");
        nav.insertAdjacentHTML("beforeend", `<button data-settings-section="ai-provider">Configuración IA</button>`);
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="ai-provider" hidden><h3>Configuración IA</h3><p>Conecta un proveedor local o en la nube mediante un estándar compatible con OpenAI.</p><label>Tipo de proveedor<select id="ai-provider-mode"><option value="local">Local</option><option value="cloud">Nube</option></select></label><label>URL base<input id="ai-provider-url" type="url" placeholder="http://localhost:11434/v1"></label><label>Modelo<input id="ai-provider-model" placeholder="llama3.2"></label><label>Clave API (opcional)<input id="ai-provider-key" type="password" placeholder="Se conserva la clave actual si se deja vacío"></label><label>Tiempo máximo (ms)<input id="ai-provider-timeout" type="number" min="1000" max="120000" step="1000"></label><button id="ai-provider-save" type="button">Guardar configuración</button><button id="ai-provider-test" type="button">Probar conexión</button><div id="ai-provider-result" class="settings-state-card"></div></section>`);
        modal.querySelector("#ai-provider-mode").value = data.settings.providerMode; modal.querySelector("#ai-provider-url").value = data.settings.baseUrl; modal.querySelector("#ai-provider-model").value = data.settings.model; modal.querySelector("#ai-provider-timeout").value = data.settings.timeoutMs;
        if (data.settings.apiKeyConfigured) { modal.querySelector("#ai-provider-key").placeholder = "••••••••••••••••  ·  hay una clave guardada (dejá vacío para conservarla)"; }
        const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); };
        nav.querySelector('[data-settings-section="ai-provider"]').addEventListener("click", (event) => activate(event.currentTarget));
        modal.querySelector("#ai-provider-save").addEventListener("click", async () => { await api("/api/mensajes-view/ai-provider-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerMode: modal.querySelector("#ai-provider-mode").value, baseUrl: modal.querySelector("#ai-provider-url").value, model: modal.querySelector("#ai-provider-model").value, apiKey: modal.querySelector("#ai-provider-key").value, timeoutMs: Number(modal.querySelector("#ai-provider-timeout").value) }) }); alert("Configuración IA guardada"); });
        modal.querySelector("#ai-provider-test").addEventListener("click", async () => { const result = modal.querySelector("#ai-provider-result"); result.textContent = "Guardando y probando conexión..."; try { await api("/api/mensajes-view/ai-provider-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerMode: modal.querySelector("#ai-provider-mode").value, baseUrl: modal.querySelector("#ai-provider-url").value, model: modal.querySelector("#ai-provider-model").value, apiKey: modal.querySelector("#ai-provider-key").value, timeoutMs: Number(modal.querySelector("#ai-provider-timeout").value) }) }); const response = await api("/api/mensajes-view/ai-provider-settings/test", { method: "POST" }); result.textContent = response.connected ? `Conexión exitosa (${response.durationMs} ms)` : (response.message || "No conectado"); } catch (error) { result.textContent = error.message || "No se pudo probar la conexión"; } });
    }
    async function enrichAiServicesSettingsSimple() {
        const modal = document.getElementById("mensajes-settings-modal");
        const nav = modal?.querySelector(".mensajes-settings-nav");
        const content = modal?.querySelector(".mensajes-settings-content");
        if (!modal || modal.querySelector('[data-settings-section="ai-services"]')) return;
        const [{ services = [] }, { schedule }, knowledgeData] = await Promise.all([api("/api/mensajes-view/ai-services"), api("/api/mensajes-view/ai-clinic-schedule"), api("/api/mensajes-view/assistant-knowledge").catch(() => ({ knowledge: "" }))]);
        const normTxt = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const knowledgeNorm = normTxt(knowledgeData.knowledge);
        const inKnowledge = (service) => [service.serviceName, ...(service.aliases || [])].map(normTxt).filter((n) => n.length >= 4).some((n) => knowledgeNorm.includes(n));
        nav.insertAdjacentHTML("beforeend", '<button data-settings-section="ai-services">Servicios IA</button>');
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="ai-services" hidden class="ai-services-settings"><h3>Servicios IA</h3><p>La IA usa el catálogo y el horario general de la clínica.</p><label>Buscar servicio<input id="simple-ai-service-search" placeholder="Nombre o alias"></label><label>Servicio<select id="simple-ai-service-select"></select></label><details id="simple-ai-active-box" class="ai-collapse"><summary>Servicios activos para la IA (<span id="simple-ai-active-count">0</span>)</summary><div class="ai-collapse-body"><p class="ai-help">Solo estos servicios los puede ofrecer y agendar la IA. El resto quedan invisibles para ella.</p><div id="simple-ai-active-list" class="ai-active-list"></div></div></details><div id="simple-ai-service-fields"><label>Duración (minutos)<input id="simple-ai-duration" type="number" min="5" max="1440" step="5"></label><label>Capacidad por hora<input id="simple-ai-capacity" type="number" min="1" max="100"><small>Déjalo vacío para no limitar.</small></label><label>Alias (uno por línea)<textarea id="simple-ai-aliases" rows="3"></textarea></label><label>Anticipación mínima (minutos)<input id="simple-ai-advance" type="number" min="0" max="43200"></label><label class="ai-enabled"><input id="simple-ai-own-hours" type="checkbox"> Este servicio tiene su propio horario</label><label id="simple-ai-copy-wrap" hidden>Reutilizar horario de otro servicio<select id="simple-ai-copy-hours"></select></label><div id="simple-ai-own-week-wrap" hidden><p class="ai-help">La IA solo ofrecerá este servicio en estas franjas (dentro del horario general). Un día sin franjas queda cerrado para este servicio.</p><div id="simple-ai-own-week" class="ai-week-schedule"></div></div><label class="ai-enabled"><input id="simple-ai-enabled" type="checkbox"> Permitir que la IA ofrezca este servicio</label><label class="ai-enabled"><input id="simple-ai-share-price" type="checkbox"> La IA puede decir el precio<small id="simple-ai-price-hint"></small></label><div id="simple-ai-price-warn" class="ai-help" style="color:#b45309"></div><button id="simple-ai-service-save" type="button">Guardar servicio</button><div id="simple-ai-service-result" class="settings-state-card"></div></div><details class="ai-collapse"><summary>Horario general de la clínica</summary><div class="ai-collapse-body"><p>Agregá turnos por día. Si un día no tiene turnos, queda cerrado. Este horario aplica a todos los servicios que ofrece la IA.</p><label class="ai-inline-field">Intervalo de opciones<select id="simple-ai-interval-sel"><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label><div id="simple-ai-week" class="ai-week-schedule"></div></div></details><details class="ai-collapse"><summary>Pausas generales</summary><div class="ai-collapse-body ai-general-breaks"><div class="ai-blocked-heading"><div><small class="ai-help">Por ejemplo, almuerzo de lunes a viernes de 12:00 a 13:00.</small></div><button id="simple-ai-add-break" class="ai-secondary-btn" type="button">+ Agregar pausa</button></div><div id="simple-ai-breaks" class="ai-blocked-rows"></div></div></details><div class="ai-settings-actions"><button id="simple-ai-schedule-save" type="button">Guardar horario general</button><span id="simple-ai-schedule-result" class="settings-state-card"></span></div></section>`);
        const select = modal.querySelector("#simple-ai-service-select"); const search = modal.querySelector("#simple-ai-service-search"); let visible = services.slice();
        const scheduleDays = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const renderWeek = (weekly, host = "#simple-ai-week") => { modal.querySelector(host).innerHTML = scheduleDays.map((name, day) => { const ranges = Array.isArray(weekly?.[day]) ? weekly[day] : []; return `<div class="ai-day-card" data-day="${day}"><div class="ai-day-head"><strong>${name}</strong><button type="button" class="ai-secondary-btn simple-add-range">+ Turno</button></div><div class="ai-day-ranges">${ranges.length ? ranges.map((r) => `<div class="ai-range-row">${t12Html("simple-start", r.start)}<span>a</span>${t12Html("simple-end", r.end)}<button type="button" class="simple-remove-range">×</button></div>`).join("") : `<span class="ai-day-closed">Cerrado</span>`}</div></div>`; }).join(""); };
        const collectWeek = (host) => { const weekly = {}; modal.querySelectorAll(`${host} .ai-day-card`).forEach((card) => { const ends = [...card.querySelectorAll(".simple-end")]; const ranges = [...card.querySelectorAll(".simple-start")].map((el, index) => ({ start: t12Read(el), end: t12Read(ends[index]) })).filter((r) => r.start && r.end); if (ranges.length) weekly[card.dataset.day] = ranges; }); return weekly; };
        const dayAbbr = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        const summarizeWeek = (weekly) => { const sig = []; for (let d = 0; d <= 6; d += 1) { const r = Array.isArray(weekly?.[d]) ? weekly[d] : []; sig.push(r.length ? r.map((x) => `${fmtHora12(x.start)}-${fmtHora12(x.end)}`).join("/") : null); } const parts = []; let i = 0; while (i <= 6) { if (!sig[i]) { i += 1; continue; } let j = i; while (j + 1 <= 6 && sig[j + 1] === sig[i]) j += 1; parts.push(`${i === j ? dayAbbr[i] : `${dayAbbr[i]}–${dayAbbr[j]}`} ${sig[i]}`); i = j + 1; } return parts.join(", "); };
        const bindRangeClicks = (host) => modal.querySelector(host).addEventListener("click", (event) => {
            const card = event.target.closest(".ai-day-card"); if (!card) return;
            if (event.target.closest(".simple-add-range")) { const h = card.querySelector(".ai-day-ranges"); h.querySelector(".ai-day-closed")?.remove(); h.insertAdjacentHTML("beforeend", `<div class="ai-range-row">${t12Html("simple-start", "08:00")}<span>a</span>${t12Html("simple-end", "18:00")}<button type="button" class="simple-remove-range">×</button></div>`); }
            if (event.target.closest(".simple-remove-range")) { event.target.closest(".ai-range-row")?.remove(); if (!card.querySelector(".ai-range-row")) card.querySelector(".ai-day-ranges").innerHTML = `<span class="ai-day-closed">Cerrado</span>`; }
        });
        const updatePriceWarn = (service) => { modal.querySelector("#simple-ai-price-warn").textContent = (modal.querySelector("#simple-ai-share-price").checked && service && inKnowledge(service)) ? "⚠ Este servicio aparece en el texto de conocimiento. Si ahí tiene precio o promoción, apagá este switch para que la IA use solo ese precio y no el del catálogo." : ""; };
        const render = () => { const service = visible.find((item) => item.serviceId === Number(select.value)); if (!service) return; modal.querySelector("#simple-ai-duration").value = service.durationMinutes; modal.querySelector("#simple-ai-capacity").value = service.capacityPerHour ?? ""; modal.querySelector("#simple-ai-aliases").value = (service.aliases || []).join("\n"); modal.querySelector("#simple-ai-advance").value = service.minimumAdvanceMinutes; modal.querySelector("#simple-ai-enabled").checked = service.enabled; modal.querySelector("#simple-ai-share-price").checked = Boolean(service.sharePrice); modal.querySelector("#simple-ai-price-hint").textContent = service.price != null ? ` (catálogo: $${service.price})` : " (este servicio no tiene precio en el catálogo)"; updatePriceWarn(service); modal.querySelector("#simple-ai-own-hours").checked = Boolean(service.hasWeeklyHours); modal.querySelector("#simple-ai-own-week-wrap").hidden = !service.hasWeeklyHours; renderWeek(service.weeklyHours || {}, "#simple-ai-own-week"); const sources = services.filter((s) => s.serviceId !== service.serviceId && s.hasWeeklyHours); modal.querySelector("#simple-ai-copy-wrap").hidden = !sources.length; modal.querySelector("#simple-ai-copy-hours").innerHTML = `<option value="">— elegir servicio —</option>` + sources.map((s) => `<option value="${s.serviceId}">${esc(s.serviceName)} · ${esc(summarizeWeek(s.weeklyHours))}</option>`).join(""); };
        const renderActiveSummary = () => {
            const active = services.filter((item) => item.enabled).sort((a, b) => a.serviceName.localeCompare(b.serviceName));
            modal.querySelector("#simple-ai-active-count").textContent = String(active.length);
            modal.querySelector("#simple-ai-active-list").innerHTML = active.length
                ? active.map((item) => `<span class="ai-active-chip">${esc(item.serviceName)}${item.hasWeeklyHours ? " ⏰" : ""}${item.sharePrice ? " 💲" : ""}</span>`).join("")
                : '<span class="ai-empty-note">Ningún servicio activo. La IA no puede agendar nada.</span>';
        };
        const fill = () => { select.innerHTML = visible.length ? visible.map((item) => `<option value="${item.serviceId}">${item.enabled ? "● " : "○ "}${esc(item.serviceName)}</option>`).join("") : '<option value="">No hay servicios</option>'; renderActiveSummary(); render(); };
        fill(); search.addEventListener("input", () => { const needle = search.value.trim().toLowerCase(); visible = services.filter((item) => `${item.serviceName} ${(item.aliases || []).join(" ")}`.toLowerCase().includes(needle)); fill(); }); select.addEventListener("change", render); modal.querySelector("#simple-ai-share-price").addEventListener("change", () => updatePriceWarn(visible.find((item) => item.serviceId === Number(select.value))));
        modal.querySelector("#simple-ai-service-save").addEventListener("click", async () => {
            const ownEnabled = modal.querySelector("#simple-ai-own-hours").checked;
            const weeklyHours = ownEnabled ? collectWeek("#simple-ai-own-week") : {};
            if (ownEnabled && !Object.keys(weeklyHours).length) { modal.querySelector("#simple-ai-service-result").textContent = "Activaste horario propio pero no definiste ninguna franja. Agregá al menos un turno o desactivá la opción."; return; }
            try {
                const result = await api(`/api/mensajes-view/ai-services/${select.value}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationMinutes: Number(modal.querySelector("#simple-ai-duration").value), capacityPerHour: modal.querySelector("#simple-ai-capacity").value || null, aliases: modal.querySelector("#simple-ai-aliases").value.split("\n").map((x) => x.trim()).filter(Boolean), minimumAdvanceMinutes: Number(modal.querySelector("#simple-ai-advance").value), enabled: modal.querySelector("#simple-ai-enabled").checked, sharePrice: modal.querySelector("#simple-ai-share-price").checked, weeklyHours }) });
                const index = services.findIndex((item) => item.serviceId === result.service.serviceId); if (index >= 0) services[index] = result.service; visible = services.filter((item) => `${item.serviceName} ${(item.aliases || []).join(" ")}`.toLowerCase().includes(search.value.trim().toLowerCase())); fill(); modal.querySelector("#simple-ai-service-result").textContent = "Servicio guardado";
            } catch (error) { modal.querySelector("#simple-ai-service-result").textContent = error.message || "No se pudo guardar el servicio"; }
        });
        const renderBreaks = (breaks) => { modal.querySelector("#simple-ai-breaks").innerHTML = (breaks || []).map((r) => `<div class="ai-range-row ai-break-row"><select class="simple-break-day">${scheduleDays.map((name, day) => `<option value="${day}" ${Number(r.day) === day ? "selected" : ""}>${name}</option>`).join("")}</select>${t12Html("simple-break-start", r.start)}<span>a</span>${t12Html("simple-break-end", r.end)}<button type="button" class="simple-remove-break">×</button></div>`).join("") || `<span class="ai-empty-note">Sin pausas generales.</span>`; };
        modal.querySelector("#simple-ai-interval-sel").value = String(schedule.slotIntervalMinutes || 30);
        renderWeek(schedule.schedule); renderBreaks(schedule.breaks || []);
        bindRangeClicks("#simple-ai-week");
        bindRangeClicks("#simple-ai-own-week");
        modal.querySelector("#simple-ai-own-hours").addEventListener("change", (event) => { modal.querySelector("#simple-ai-own-week-wrap").hidden = !event.target.checked; if (event.target.checked && !modal.querySelector("#simple-ai-own-week .ai-day-card")) renderWeek({}, "#simple-ai-own-week"); });
        modal.querySelector("#simple-ai-copy-hours").addEventListener("change", (event) => { const src = services.find((s) => s.serviceId === Number(event.target.value)); event.target.value = ""; if (!src) return; modal.querySelector("#simple-ai-own-hours").checked = true; modal.querySelector("#simple-ai-own-week-wrap").hidden = false; renderWeek(src.weeklyHours || {}, "#simple-ai-own-week"); modal.querySelector("#simple-ai-service-result").textContent = `Horario copiado de ${src.serviceName}. Revisá y guardá.`; });
        modal.querySelector("#simple-ai-add-break").addEventListener("click", () => { const host = modal.querySelector("#simple-ai-breaks"); host.querySelector(".ai-empty-note")?.remove(); host.insertAdjacentHTML("beforeend", `<div class="ai-range-row ai-break-row"><select class="simple-break-day">${scheduleDays.map((name, day) => `<option value="${day}">${name}</option>`).join("")}</select>${t12Html("simple-break-start", "12:00")}<span>a</span>${t12Html("simple-break-end", "13:00")}<button type="button" class="simple-remove-break">×</button></div>`); });
        modal.querySelector("#simple-ai-breaks").addEventListener("click", (event) => { if (event.target.closest(".simple-remove-break")) { event.target.closest(".ai-break-row")?.remove(); if (!modal.querySelector("#simple-ai-breaks .ai-break-row")) modal.querySelector("#simple-ai-breaks").innerHTML = `<span class="ai-empty-note">Sin pausas generales.</span>`; } });
        modal.querySelector("#simple-ai-schedule-save").addEventListener("click", async () => {
            const weekly = {};
            modal.querySelectorAll("#simple-ai-week .ai-day-card").forEach((card) => { const ends = [...card.querySelectorAll(".simple-end")]; weekly[card.dataset.day] = [...card.querySelectorAll(".simple-start")].map((el, index) => ({ start: t12Read(el), end: t12Read(ends[index]) })).filter((r) => r.start && r.end); });
            const breaks = [...modal.querySelectorAll("#simple-ai-breaks .ai-break-row")].map((row) => ({ day: Number(row.querySelector(".simple-break-day").value), start: t12Read(row.querySelector(".simple-break-start")), end: t12Read(row.querySelector(".simple-break-end")) }));
            try {
                const result = await api("/api/mensajes-view/ai-clinic-schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timezone: "America/El_Salvador", slotIntervalMinutes: Number(modal.querySelector("#simple-ai-interval-sel").value), schedule: weekly, breaks }) });
                modal.querySelector("#simple-ai-schedule-result").textContent = `Horario guardado (${result.schedule.slotIntervalMinutes} min · ${result.schedule.breaks.length} pausas)`;
            } catch (error) { modal.querySelector("#simple-ai-schedule-result").textContent = error.message; }
        });
        const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); }; nav.querySelector('[data-settings-section="ai-services"]').addEventListener("click", (event) => activate(event.currentTarget));
    }
    async function enrichAiAgendaSettings() {
        const modal = document.getElementById("mensajes-settings-modal");
        const nav = modal?.querySelector(".mensajes-settings-nav");
        const content = modal?.querySelector(".mensajes-settings-content");
        if (!modal || modal.querySelector('[data-settings-section="ai-agenda"]')) return;
        const [{ schedule }, { dates }] = await Promise.all([
            api("/api/mensajes-view/ai-clinic-schedule"),
            api("/api/mensajes-view/ai-blocked-dates")
        ]);
        nav.insertAdjacentHTML("beforeend", '<button data-settings-section="ai-agenda">Agenda IA</button>');
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="ai-agenda" hidden class="ai-agenda-settings">
            <h3>Agenda IA</h3>
            <p>Límites que la IA respeta al agendar, además del horario y la capacidad por servicio.</p>
            <label>Tope de citas por día (toda la clínica)
                <input id="ai-agenda-daily-cap" type="number" min="1" max="1000" placeholder="Sin tope">
                <small>Cuenta todas las citas activas del día (IA y recepción). Al llegar al tope, la IA responde que ese día no está disponible. Vacío = sin tope.</small>
            </label>
            <button id="ai-agenda-cap-save" type="button">Guardar tope diario</button>
            <span id="ai-agenda-cap-result" class="settings-state-card"></span>
            <label>Tope de citas por hora (toda la clínica)
                <input id="ai-agenda-hourly-cap" type="number" min="1" max="100" placeholder="Sin tope">
                <small>Cuenta todas las citas activas que caen en una misma hora (IA y recepción, todos los servicios). Al llegar al tope, la IA no ofrece ni agenda horarios de esa hora. Vacío = sin tope.</small>
            </label>
            <button id="ai-agenda-hourly-save" type="button">Guardar tope por hora</button>
            <span id="ai-agenda-hourly-result" class="settings-state-card"></span>
            <hr>
            <h3>Días bloqueados</h3>
            <p>Cerrá una fecha para la IA: asueto, cierre administrativo o día ya lleno. Ese día la IA no agenda, no reprograma y no ofrece horarios.</p>
            <div class="ai-block-form">
                <input id="ai-agenda-block-date" type="date">
                <input id="ai-agenda-block-reason" type="text" placeholder="Motivo (opcional, uso interno)" maxlength="200">
                <button id="ai-agenda-block-add" type="button">Bloquear fecha</button>
            </div>
            <div id="ai-agenda-block-result" class="settings-state-card"></div>
            <div id="ai-agenda-block-list" class="ai-block-list"></div>
        </section>`);
        const capInput = modal.querySelector("#ai-agenda-daily-cap");
        capInput.value = schedule.dailyCap ?? "";
        modal.querySelector("#ai-agenda-cap-save").addEventListener("click", async () => {
            const result = modal.querySelector("#ai-agenda-cap-result");
            try {
                const data = await api("/api/mensajes-view/ai-daily-cap", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dailyCap: capInput.value.trim() === "" ? null : Number(capInput.value) }) });
                result.textContent = data.schedule.dailyCap ? `Tope guardado: ${data.schedule.dailyCap} citas/día` : "Tope quitado";
            } catch (error) { result.textContent = error.message || "No se pudo guardar"; }
        });
        const hourlyInput = modal.querySelector("#ai-agenda-hourly-cap");
        hourlyInput.value = schedule.hourlyCap ?? "";
        modal.querySelector("#ai-agenda-hourly-save").addEventListener("click", async () => {
            const result = modal.querySelector("#ai-agenda-hourly-result");
            try {
                const data = await api("/api/mensajes-view/ai-hourly-cap", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hourlyCap: hourlyInput.value.trim() === "" ? null : Number(hourlyInput.value) }) });
                result.textContent = data.schedule.hourlyCap ? `Tope guardado: ${data.schedule.hourlyCap} citas/hora` : "Tope quitado";
            } catch (error) { result.textContent = error.message || "No se pudo guardar"; }
        });
        const dateInput = modal.querySelector("#ai-agenda-block-date");
        const reasonInput = modal.querySelector("#ai-agenda-block-reason");
        const list = modal.querySelector("#ai-agenda-block-list");
        const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        dateInput.min = today.toISOString().slice(0, 10);
        const renderDates = (rows) => {
            list.innerHTML = rows.length
                ? rows.map((row) => `<div class="ai-block-item"><div><strong>${esc(new Date(`${row.date}T12:00:00`).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" }))}</strong>${row.reason ? `<span>${esc(row.reason)}</span>` : ""}</div><button type="button" data-unblock="${row.id}">Reabrir</button></div>`).join("")
                : `<div class="ai-empty-note">No hay días bloqueados próximos.</div>`;
            list.querySelectorAll("[data-unblock]").forEach((button) => button.addEventListener("click", async () => {
                const data = await api(`/api/mensajes-view/ai-blocked-dates/${button.dataset.unblock}`, { method: "DELETE" });
                renderDates(data.dates);
            }));
        };
        renderDates(dates);
        modal.querySelector("#ai-agenda-block-add").addEventListener("click", async () => {
            const result = modal.querySelector("#ai-agenda-block-result");
            if (!dateInput.value) { result.textContent = "Elegí una fecha"; return; }
            try {
                const data = await api("/api/mensajes-view/ai-blocked-dates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dateInput.value, reason: reasonInput.value }) });
                dateInput.value = ""; reasonInput.value = ""; result.textContent = "Fecha bloqueada";
                renderDates(data.dates);
            } catch (error) { result.textContent = error.message || "No se pudo bloquear"; }
        });
        const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); };
        nav.querySelector('[data-settings-section="ai-agenda"]').addEventListener("click", (event) => activate(event.currentTarget));
    }
    async function enrichConfigTransfer() {
        const modal = document.getElementById("mensajes-settings-modal");
        const nav = modal?.querySelector(".mensajes-settings-nav");
        const content = modal?.querySelector(".mensajes-settings-content");
        if (!modal || modal.querySelector('[data-settings-section="config-transfer"]')) return;
        nav.insertAdjacentHTML("beforeend", '<button data-settings-section="config-transfer">Copia de configuración</button>');
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="config-transfer" hidden>
            <h3>Copia de configuración</h3>
            <p>Exportá la configuración de la IA de este equipo a un archivo y cargala en otro. Incluye: texto de conocimiento, servicios IA y alias, horario general, pausas, días bloqueados, topes diario y por hora, configuración del proveedor IA (con su clave), revisión humana, automatizaciones, recordatorios, reglas de teléfonos y las vinculaciones paciente-chat activas (para reusarlas hace falta el mismo número de WhatsApp). <strong>No</strong> incluye conversaciones ni mensajes.</p>
            <p class="ai-help" style="color:#b45309">El archivo contiene la clave del proveedor IA. Guardalo en un lugar seguro y no lo subas a repositorios ni lo compartas.</p>
            <button id="config-export-btn" type="button">Exportar configuración</button>
            <hr>
            <p>Importar reemplaza la configuración de este equipo con la del archivo. Las citas ya agendadas no se tocan.</p>
            <input id="config-import-file" type="file" accept="application/json,.json" hidden>
            <button id="config-import-btn" type="button">Importar configuración…</button>
            <div id="config-transfer-result" class="settings-state-card"></div>
        </section>`);
        modal.querySelector("#config-export-btn").addEventListener("click", async () => {
            const result = modal.querySelector("#config-transfer-result");
            result.textContent = "Generando archivo…";
            try {
                const cfg = await api("/api/mensajes-view/config-export");
                const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `clinica-config-${String(cfg.exportedAt || "").slice(0, 10) || "export"}.json`;
                document.body.appendChild(link); link.click(); link.remove();
                URL.revokeObjectURL(url);
                result.textContent = `Configuración exportada (${cfg.serviceSettings?.length || 0} servicios, ${cfg.blockedDates?.length || 0} días bloqueados, ${cfg.patientIdentities?.length || 0} vinculaciones).`;
            } catch (error) { result.textContent = error.message || "No se pudo exportar."; }
        });
        const fileInput = modal.querySelector("#config-import-file");
        modal.querySelector("#config-import-btn").addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async () => {
            const result = modal.querySelector("#config-transfer-result");
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = "";
            if (!file) return;
            let payload;
            try { payload = JSON.parse(await file.text()); }
            catch { result.textContent = "El archivo no es un JSON válido."; return; }
            if (!confirm("Importar esta configuración reemplaza el texto de conocimiento, los servicios IA, el horario, las pausas, los días bloqueados, los topes diario y por hora y la configuración del proveedor IA de este equipo. También agrega o actualiza las vinculaciones paciente-chat exportadas (solo funciona si es el mismo número de WhatsApp). ¿Continuar?")) return;
            result.textContent = "Importando…";
            try {
                const data = await api("/api/mensajes-view/config-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                result.textContent = `Configuración importada: ${data.summary.services} servicios, ${data.summary.aliases} alias, ${data.summary.blockedDates} días bloqueados, ${data.summary.patientIdentities} vinculaciones. Recargando la vista…`;
                setTimeout(() => window.location.reload(), 1600);
            } catch (error) { result.textContent = error.message || "No se pudo importar."; }
        });
        const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); };
        nav.querySelector('[data-settings-section="config-transfer"]').addEventListener("click", (event) => activate(event.currentTarget));
    }
    async function ensurePhoneRules() {
        const modal = document.getElementById("mensajes-settings-modal"); const section = modal?.querySelector('[data-settings-content="automation"]');
        if (!section || section.querySelector("#settings-phone-rules")) return;
        const data = await api("/api/mensajes-view/settings");
        section.insertAdjacentHTML("beforeend", `<hr><h3 id="settings-phone-rules">Control de teléfonos para la IA</h3><p>Define a quién puede responder automáticamente la IA. Esta regla no bloquea mensajes manuales ni recordatorios.</p><label>Modo<select id="settings-phone-mode"><option value="all">Responder a todos</option><option value="allow_only">Solo responder a permitidos</option><option value="exclude">Responder a todos excepto ignorados</option></select></label><label>Números, uno por línea<textarea id="settings-phone-numbers" rows="5" placeholder="Ejemplo: 60613992"></textarea></label><small class="settings-help" id="settings-phone-help"></small><button id="settings-save-phone-rules" type="button">Guardar control de teléfonos</button><div id="settings-phone-result" class="settings-state-card"></div>`);
        const mode = modal.querySelector("#settings-phone-mode"); const numbers = modal.querySelector("#settings-phone-numbers"); const help = modal.querySelector("#settings-phone-help"); mode.value = data.settings.automationPhoneMode || "exclude"; numbers.value = (data.settings.automationPhoneNumbers || []).join("\n"); const updateHelp = () => { help.textContent = mode.value === "all" ? "La IA responderá automáticamente a todos los teléfonos." : mode.value === "allow_only" ? "La IA solo responderá automáticamente a estos números. Los demás quedarán ignorados." : "La IA responderá automáticamente a todos, excepto a estos números."; numbers.disabled = mode.value === "all"; }; updateHelp(); mode.addEventListener("change", updateHelp); modal.querySelector("#settings-save-phone-rules").addEventListener("click", async () => { const list = numbers.value.split("\n").map((x) => x.replace(/\D/g, "")).filter(Boolean); const result = await api("/api/mensajes-view/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responseDelayMin: Number(modal.querySelector("#settings-delay-min").value), responseDelayMax: Number(modal.querySelector("#settings-delay-max").value), automationPhoneMode: mode.value, automationPhoneNumbers: list }) }); modal.querySelector("#settings-phone-result").textContent = mode.value === "all" ? "Guardado: responder a todos" : mode.value === "allow_only" ? `Guardados ${result.settings.automationPhoneNumbers.length} permitidos` : `Guardados ${result.settings.automationPhoneNumbers.length} ignorados`; });
    }
    // Saludos/avisos automáticos ajenos a esta app (p. ej. el mensaje de bienvenida
    // propio de WhatsApp Business, que no se puede apagar desde acá y varía por
    // clínica). Si coinciden exacto, la IA no los confunde con que ya respondió
    // una persona y sigue contestando el mensaje real del paciente.
    async function ensureIgnoredMessages() {
        const modal = document.getElementById("mensajes-settings-modal"); const section = modal?.querySelector('[data-settings-content="automation"]');
        if (!section || section.querySelector("#settings-ignored-texts")) return;
        const data = await api("/api/mensajes-view/settings");
        section.insertAdjacentHTML("beforeend", `<hr><h3 id="settings-ignored-texts">Mensajes automáticos a ignorar</h3><p>Si WhatsApp Business (u otro canal) manda un saludo automático propio que no podés desactivar, pegalo acá tal cual (uno por línea) para que la IA no lo confunda con que ya respondió una persona.</p><label>Mensaje exacto, uno por línea<textarea id="settings-ignored-texts-input" rows="4" placeholder="Ejemplo: Gracias por comunicarte con Mi Clínica. ¿Cómo podemos ayudarte?"></textarea></label><button id="settings-save-ignored-texts" type="button">Guardar mensajes ignorados</button><div id="settings-ignored-texts-result" class="settings-state-card"></div>`);
        const textarea = modal.querySelector("#settings-ignored-texts-input");
        textarea.value = (data.settings.ignoredOutgoingTexts || []).join("\n");
        modal.querySelector("#settings-save-ignored-texts").addEventListener("click", async () => {
            const list = textarea.value.split("\n").map((x) => x.trim()).filter(Boolean);
            try {
                const result = await api("/api/mensajes-view/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responseDelayMin: Number(modal.querySelector("#settings-delay-min").value), responseDelayMax: Number(modal.querySelector("#settings-delay-max").value), ignoredOutgoingTexts: list }) });
                modal.querySelector("#settings-ignored-texts-result").textContent = `Guardados ${result.settings.ignoredOutgoingTexts.length} mensaje(s) ignorado(s).`;
            } catch (error) { modal.querySelector("#settings-ignored-texts-result").textContent = error.message || "No se pudo guardar."; }
        });
    }
    // --- Montaje y limpieza ---
    window.__mountMensajes = async function () {
        renderShell();
        document.getElementById("mensajes-refresh").addEventListener("click", loadConversations);
        const toggleTools = document.getElementById("mensajes-toggle-tools");
        if (toggleTools) toggleTools.addEventListener("click", () => applyToolsCollapsed(!document.getElementById("mensajes-simulator")?.classList.contains("is-collapsed")));
        applyToolsCollapsed(toolsCollapsed());
        const searchInput = document.getElementById("mensajes-search");
        if (searchInput) searchInput.addEventListener("input", (event) => { convSearchTerm = event.target.value; renderConversationList(); });
        const filtersBar = document.getElementById("mensajes-filters");
        if (filtersBar) filtersBar.addEventListener("click", (event) => { const btn = event.target.closest("[data-filter]"); if (!btn) return; convListFilter = btn.dataset.filter; renderConversationList(); });
        document.getElementById("mensajes-compose").addEventListener("submit", sendMessage);
        const simulator = document.getElementById("mensajes-simulator");
        simulator.addEventListener("submit", simulateIncoming);
        simulator.querySelector("#mensajes-sim-submit").addEventListener("click", simulateIncoming);
        simulator.querySelector("#mensajes-sim-text").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void simulateIncoming(event); } });
        document.getElementById("mensajes-whatsapp-start").addEventListener("click", () => void startWhatsapp());
        document.getElementById("mensajes-whatsapp-stop").addEventListener("click", () => void stopWhatsapp());
        document.getElementById("mensajes-whatsapp-clear").addEventListener("click", () => void clearWhatsappSession());
        document.getElementById("mensajes-global-settings").addEventListener("click", async (event) => {
            const btn = event.currentTarget;
            if (btn.dataset.loading === "1") return;
            btn.dataset.loading = "1";
            try {
                await openGlobalSettings();
                // Las secciones son independientes: cargarlas en paralelo en vez de en cadena.
                await Promise.allSettled([
                    enrichPatientIdentitySettings(), enrichAssistantKnowledge(), enrichHumanReviewSettings(),
                    enrichAiProviderSettings(), enrichAiServicesSettingsSimple(), enrichAiAgendaSettings(), enrichAutomationBuffer(),
                    enrichReminderSettings(), ensurePhoneRules(), ensureIgnoredMessages(), enrichConfigTransfer()
                ]);
                // Las pestañas se agregan con insertAdjacentHTML("beforeend"): reubicar
                // "Cerrar" al final para que quede siempre como última opción del nav.
                const settingsNav = document.querySelector("#mensajes-settings-modal .mensajes-settings-nav");
                const closeButton = settingsNav?.querySelector(".settings-close");
                if (settingsNav && closeButton) settingsNav.appendChild(closeButton);
            } finally { btn.dataset.loading = "0"; }
        });
        const actionsGroup = document.getElementById("mensajes-actions-group");
        const aiGroup = document.getElementById("mensajes-ai-group");
        const addSimButton = (group, id, label, cls, handler) => { const button = document.createElement("button"); button.id = id; button.type = "button"; button.className = `sim-btn ${cls || ""}`.trim(); button.textContent = label; group.appendChild(button); button.addEventListener("click", handler); return button; };
        addSimButton(actionsGroup, "mensajes-send-reminders", "🔔 Recordatorios", "", () => void openReminderModal());
        addSimButton(actionsGroup, "mensajes-delete-all", "🗑 Borrar todo", "sim-btn-danger", deleteAllConversations);
        addSimButton(aiGroup, "mensajes-pause-ai", "Pausar IA", "sim-btn-ai-pause", (event) => void setGlobalAiMode(event.currentTarget.dataset.aiAction || "paused"));
        addSimButton(aiGroup, "mensajes-global-ai", "Pasar todo a IA", "sim-btn-ai-resume", () => void setGlobalAiMode("assistant"));
         document.getElementById("mensajes-send-reminders").addEventListener("click", () => setTimeout(() => void restoreActiveReminder(), 200));
         // La vista ya está montada y usable. Estas cargas no deben bloquear
         // la navegación ni la disponibilidad del simulador.
         void Promise.allSettled([loadConversations(), refreshConversationMeta({ force: true }), refreshGlobalAiStatus()]);
         const anyModalOpen = () => { const s = document.getElementById("mensajes-settings-modal"); const r = document.getElementById("mensajes-reminder-modal"); return Boolean((s && !s.hidden) || (r && !r.hidden)); };
        chatPoll = setInterval(() => { if (deletingAll || pollBusy || anyModalOpen()) return; pollBusy = true; Promise.allSettled([loadConversations(), refreshConversationMeta(), refreshWhatsappStatus(), refreshGlobalAiStatus(), selectedId ? loadConversation(selectedId, { markRead: false, skipListRefresh: true }) : null]).finally(() => { pollBusy = false; }); }, 2000);
        void refreshWhatsappStatus();
        cleanup = () => { if (chatPoll) { clearInterval(chatPoll); chatPoll = null; } conversationLoadSeq++; ["mensajes-settings-modal", "mensajes-reminder-modal", "mensajes-busy-overlay"].forEach((id) => document.getElementById(id)?.remove()); selectedId = null; lastListSig = ""; lastChatSig = ""; pollBusy = false; deletingAll = false; allConversations = []; convListFilter = "all"; convSearchTerm = ""; patientNameByChat = new Map(); patientNamesFetchedAt = 0; aiWorkingConvIds = new Set(); cleanup = null; };
        window.__setViewCleanup(() => cleanup?.());
        window.__setViewLeaveGuard(() => !deletingAll);
    };
})();
