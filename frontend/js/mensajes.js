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
    let convListFilter = "all";        // "all" | "review" | "awaiting" | "ai" | "archived"
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
    // Confirmaciones con el diálogo propio de la app (uiAlerts.js), nunca con el
    // confirm() nativo: en Electron/Windows el diálogo nativo deja la ventana sin
    // foco de teclado al cerrarse y los inputs (chat, simulador, Ajustes) no
    // aceptan escritura hasta cambiar de ventana. Mismo patrón que el resto de vistas.
    function askConfirm(message, options = {}) {
        return typeof window.showSystemConfirm === "function"
            ? window.showSystemConfirm(message, { type: "warning", ...options })
            : Promise.resolve(window.confirm(message));
    }
    async function api(url, options) {
        // Sin timeout, un fetch que nunca resuelve (glitch de red/IPC) deja colgado para
        // siempre cualquier await api(...) — y con eso el overlay de "operación en curso"
        // (que bloquea toda la ventana, no solo Mensajes) nunca se retira. Este límite
        // garantiza que la promesa siempre se resuelva o rechace en un tiempo acotado.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        let response;
        try {
            response = await fetch(url, { ...(options || {}), __skipConnectionErrorAlert: true, signal: controller.signal });
        } catch (error) {
            if (error?.name === "AbortError") throw new Error("La solicitud tardó demasiado y se canceló. Intenta de nuevo.");
            throw error;
        } finally {
            clearTimeout(timer);
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) throw new Error(data.message || "No se pudo completar la solicitud");
        return data;
    }
    // --- Shell de la vista ---
    function renderShell() {
        const content = document.querySelector(".content");
        content.innerHTML = `<section class="mensajes-view">
          <form id="mensajes-simulator" class="mensajes-simulator">
            <div class="sim-group"><span class="sim-group-label">WhatsApp</span><span id="mensajes-whatsapp-status" class="mensajes-wa-state">Desconectado</span><button id="mensajes-whatsapp-start" type="button" class="sim-btn sim-btn-primary">Iniciar</button><button id="mensajes-whatsapp-recover" type="button" class="sim-btn" disabled title="Trae los chats marcados como no leídos en WhatsApp sin cerrar la conexión">Traer no leídos</button></div>
            <div class="sim-group" hidden><span class="sim-group-label">Simular</span><input id="mensajes-sim-phone" placeholder="Teléfono" inputmode="tel"><input id="mensajes-sim-text" placeholder="Mensaje del paciente"><button id="mensajes-sim-submit" type="button" class="sim-btn sim-btn-primary">Enviar</button></div>
            <div class="sim-group" id="mensajes-ai-group"><span class="sim-group-label">IA</span></div>
            <details class="mensajes-more sim-more"><summary class="sim-btn" title="Más acciones">⋯ Más</summary><div class="mensajes-more-menu" id="mensajes-actions-group"><button id="mensajes-global-settings" type="button" title="Ajustes globales">⚙ Ajustes</button><hr id="mensajes-actions-divider"><button id="mensajes-whatsapp-clear" type="button" class="is-danger">Quitar sesión</button></div></details>
          </form>
          <div class="mensajes-layout">
            <aside class="mensajes-conversations"><div class="mensajes-section-title"><span class="mensajes-section-heading">Conversaciones<button id="mensajes-toggle-tools" type="button" class="mensajes-icon-btn" title="Mostrar u ocultar herramientas" aria-label="Mostrar u ocultar herramientas"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg></button></span><button id="mensajes-refresh" class="ui-toolbar-btn">Actualizar</button></div><div class="mensajes-list-toolbar"><input id="mensajes-search" type="search" autocomplete="off" placeholder="Buscar por nombre o número"><div id="mensajes-filters" class="mensajes-filters"><button type="button" data-filter="all" class="is-active">Todas</button><button type="button" data-filter="review">⚠ Necesitan revisión<span class="chip-count"></span></button><button type="button" data-filter="awaiting" title="El último mensaje del paciente lleva 10 minutos o más sin respuesta (de la IA o de recepción)">⏳ Sin responder<span class="chip-count"></span></button><button type="button" data-filter="ai">🤖 IA</button><button type="button" data-filter="archived" title="Chats archivados en WhatsApp (se actualiza cuando escriben)">🗄 Archivados<span class="chip-count"></span></button></div></div><div id="mensajes-list" class="mensajes-list"></div></aside>
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
    async function openReminderModal() { let modal = document.getElementById("mensajes-reminder-modal"); if (!modal) { modal = document.createElement("div"); modal.id = "mensajes-reminder-modal"; modal.className = "mensajes-settings-overlay"; modal.innerHTML = `<form class="mensajes-reminder-card promo-card is-narrow">
                <header class="promo-head"><div><h2>Recordatorios</h2><p>Recuerde las citas de un día; a quien ya se le envió no se le repite.</p></div><button type="button" data-close aria-label="Cerrar">×</button></header>
                <div class="promo-body">
                    <div class="promo-top">
                        <section class="promo-section">
                            <h3><span class="promo-step">1</span>Mensaje</h3>
                            <label><span>Plantilla <small>· {{nombre}}, {{fecha}}, {{hora}}, {{tratamiento}}</small></span><textarea id="reminder-template" rows="4">Hola {{nombre}}, le recordamos su cita del {{fecha}} a las {{hora}} por {{tratamiento}}.</textarea></label>
                            <div class="promo-preview" aria-label="Vista previa"><span>Así se verá</span><div class="promo-bubble" id="reminder-preview"></div></div>
                        </section>
                        <section class="promo-section">
                            <h3><span class="promo-step">2</span>Citas del día</h3>
                            <label>Fecha<input id="reminder-date" type="date" required></label>
                            <label class="promo-inline promo-check"><input id="reminder-force-resend" type="checkbox">Permitir reenviar recordatorios ya enviados</label>
                            <div class="promo-row"><span class="promo-spacer"></span><button type="button" id="reminder-load" class="promo-btn">Cargar pacientes</button></div>
                        </section>
                    </div>
                    <section class="promo-section">
                        <h3><span class="promo-step">3</span>Pacientes</h3>
                        <div id="reminder-progress" class="promo-status">Aún no cargados</div>
                        <div id="reminder-items" class="reminder-items"></div>
                    </section>
                </div>
                <footer class="promo-foot"><button type="button" id="reminder-cancel" class="promo-btn is-danger-ghost" disabled>Cancelar lote</button><button type="submit" id="reminder-send" class="promo-btn is-primary">Enviar recordatorios</button></footer></form>`; document.body.appendChild(modal); modal.querySelector("[data-close]").addEventListener("click", () => { modal.hidden = true; }); modal.querySelector("#reminder-load").addEventListener("click", loadReminderCandidates); modal.querySelector("form").addEventListener("submit", startReminder); modal.querySelector("#reminder-cancel").addEventListener("click", cancelReminder); modal.querySelector("#reminder-template").addEventListener("input", renderReminderPreview); modal.querySelector("#reminder-date").addEventListener("change", renderReminderPreview); } modal.querySelector("#reminder-date").value = new Date().toISOString().slice(0,10); try { const rs = await api("/api/mensajes-view/reminder-settings"); if (rs?.settings?.template) modal.querySelector("#reminder-template").value = rs.settings.template; } catch { /* si falla, queda la plantilla por defecto del textarea */ } modal.hidden = false; renderReminderPreview(); await loadReminderCandidates(); }
    // Mismo reemplazo que hace el servidor al crear el lote (fecha tal cual, hora en 12h), con el primer paciente cargado.
    function renderReminderPreview() {
        const modal = document.getElementById("mensajes-reminder-modal"); if (!modal) return;
        // Si hay familiares con el mismo número se previsualiza su mensaje agrupado (los valores los arma el backend).
        let first = null; try { const items = JSON.parse(modal.dataset.items || "[]"); first = items.find((x) => x.groupValues) || items[0] || null; } catch { /* sin lista cargada */ }
        const fecha = modal.querySelector("#reminder-date").value || "2026-10-07";
        const values = first?.groupValues ? { ...first.groupValues, fecha } : { nombre: first?.patientName || "María López", fecha, hora: first?.time ? fmtHora12(first.time) : "9:00 AM", tratamiento: first?.treatment || "Limpieza" };
        const text = modal.querySelector("#reminder-template").value.trim();
        const bubble = modal.querySelector("#reminder-preview");
        bubble.textContent = text ? text.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => values[key.trim()] ?? "") : "Escriba la plantilla del recordatorio";
        bubble.classList.toggle("is-empty", !text);
    }
    async function loadReminderCandidates() { const modal = document.getElementById("mensajes-reminder-modal"); const data = await api(`/api/mensajes-view/reminders/candidates?date=${encodeURIComponent(modal.querySelector("#reminder-date").value)}`); modal.dataset.items = JSON.stringify(data.candidates); renderReminderPreview(); const labels = { pending: "Pendiente", sent: "Enviado", failed: "Error", cancelled: "Cancelado", sending: "Enviando", queued: "En cola" }; modal.querySelector("#reminder-items").innerHTML = data.candidates.length ? data.candidates.map((x) => `<div class="reminder-item"><strong>${esc(x.patientName)}</strong><span>${esc(x.phone)}${x.groupSize > 1 ? ` · un solo mensaje para ${x.groupSize}` : ""} · ${esc(fmtHora12(x.time))} · ${esc(x.status || "")}</span><small>${esc(x.treatment || "")}</small><em data-item-status="${x.appointmentId}">${labels[x.reminderStatus] || "Pendiente"}</em></div>`).join("") : `<div class="mensajes-empty">No hay pacientes elegibles para esta fecha.</div>`; const summary = data.summary || {}; modal.querySelector("#reminder-progress").textContent = `${data.candidates.length} elegibles · ${summary.sent || 0} enviados · ${summary.failed || 0} errores · ${summary.cancelled || 0} cancelados · ${summary.pending || 0} pendientes`; }
    async function startReminder(event) { event.preventDefault(); const modal = document.getElementById("mensajes-reminder-modal"); const sendButton = modal.querySelector("#reminder-send"); const cancelButton = modal.querySelector("#reminder-cancel"); const items = JSON.parse(modal.dataset.items || "[]"); if (!items.length) return alert("Carga primero los pacientes"); sendButton.disabled = true; try { const reminderSettings = await api("/api/mensajes-view/reminder-settings"); const data = await api("/api/mensajes-view/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: modal.querySelector("#reminder-date").value, template: modal.querySelector("#reminder-template").value, items, minDelaySeconds: reminderSettings.settings.minDelaySeconds, maxDelaySeconds: reminderSettings.settings.maxDelaySeconds, forceResend: modal.querySelector("#reminder-force-resend").checked }) }); modal.dataset.batchId = data.batch.id; const started = await api(`/api/mensajes-view/reminders/${data.batch.id}/start`, { method: "POST" }); modal.querySelector("#reminder-progress").textContent = started.connectionError ? "No enviado: conecta WhatsApp y vuelve a intentarlo" : "Lote iniciado"; cancelButton.disabled = Boolean(started.connectionError); if (!started.connectionError) cancelButton.disabled = false; await pollReminder(); } catch (error) { sendButton.disabled = false; cancelButton.disabled = true; modal.querySelector("#reminder-progress").textContent = error.message || "No se pudo iniciar el lote"; }
    }
    async function pollReminder() { const modal = document.getElementById("mensajes-reminder-modal"); const batchId = modal?.dataset.batchId; if (!batchId || modal.hidden) return; try { const batch = (await api(`/api/mensajes-view/reminders/${batchId}`)).batch; modal.querySelector("#reminder-progress").textContent = `${batch.sentCount} enviados · ${batch.failedCount} errores · ${batch.cancelledCount} cancelados de ${batch.totalCount} · ${batch.status}`; batch.items.forEach((item) => { const el = modal.querySelector(`[data-item-status="${item.appointment_id}"]`); if (el) el.textContent = item.status === "sent" ? "Enviado" : item.status === "failed" ? "Error" : item.status === "cancelled" ? "Cancelado" : item.status === "queued" || item.status === "sending" ? "En cola / trabajando" : "Pendiente"; }); if (["queued", "processing"].includes(batch.status)) { modal.querySelector("#reminder-send").disabled = true; modal.querySelector("#reminder-cancel").disabled = false; setTimeout(pollReminder, 3000); } else { modal.querySelector("#reminder-send").disabled = false; modal.querySelector("#reminder-cancel").disabled = true; } } catch (error) { modal.querySelector("#reminder-send").disabled = false; modal.querySelector("#reminder-cancel").disabled = true; modal.querySelector("#reminder-progress").textContent = error.message || "No se pudo consultar el lote"; } }
    async function cancelReminder() { const modal = document.getElementById("mensajes-reminder-modal"); if (modal?.dataset.batchId) await api(`/api/mensajes-view/reminders/${modal.dataset.batchId}/cancel`, { method: "POST" }); await pollReminder(); }
    // --- Promociones: campaña (texto) enviada por bloques a pacientes del Seguimiento ---
    // El registro vive en SQLite (promo_*): quien ya recibió la campaña no entra en el próximo bloque.
    const PROMO_STATUS = { pending: "Pendiente", sending: "Enviando", queued: "En cola", sent: "Enviado", failed: "Error", cancelled: "Cancelado" };
    async function openPromoModal() {
        let modal = document.getElementById("mensajes-promo-modal");
        if (!modal) {
            modal = document.createElement("div"); modal.id = "mensajes-promo-modal"; modal.className = "mensajes-settings-overlay";
            // Tres pasos: 1 Campaña (texto + vista previa), 2 Destinatarios (Seguimiento o lista), 3 Envío por bloques.
            modal.innerHTML = `<form class="mensajes-reminder-card promo-card">
                <header class="promo-head"><div><h2>Promociones</h2><p>Envíe una campaña por bloques; el registro evita repetirle a quien ya la recibió.</p></div><button type="button" data-close aria-label="Cerrar">×</button></header>
                <div class="promo-body">
                    <div class="promo-top">
                        <section class="promo-section">
                            <h3><span class="promo-step">1</span>Campaña</h3>
                            <label>Campaña<select id="promo-campaign"></select></label>
                            <div class="promo-name-row"><label>Nombre<input id="promo-name" maxlength="80" placeholder="Ej: Limpieza octubre"></label><label title="Hasta ese día la IA tiene en cuenta la promoción al responder. Sin fecha: 15 días desde el envío."><span>Válida hasta <small>(opcional)</small></span><input id="promo-valid-until" type="date"></label></div>
                            <label><span>Mensaje <small>· use {{nombre}} para el nombre del paciente</small></span><textarea id="promo-template" rows="5">Hola {{nombre}}, </textarea></label>
                            <div class="promo-preview" aria-label="Vista previa"><span>Así se verá</span><div class="promo-bubble" id="promo-preview"></div></div>
                            <div class="promo-row"><button type="button" id="promo-save" class="promo-btn">Guardar campaña</button><button type="button" id="promo-delete" class="promo-btn is-danger-ghost" hidden>Borrar campaña</button><span id="promo-campaign-info" class="promo-note"></span></div>
                        </section>
                        <section class="promo-section">
                            <h3><span class="promo-step">2</span>Destinatarios</h3>
                            <select id="promo-source" hidden><option value="seguimiento">Pacientes del sistema</option><option value="lista">Lista importada</option></select>
                            <div class="promo-segmented" role="tablist"><button type="button" data-promo-source="seguimiento">Pacientes del sistema</button><button type="button" data-promo-source="lista">Lista de Excel / CSV</button></div>
                            <div class="promo-filters">
                                <label>Tratamiento<select id="promo-tratamiento"><option value="all">Todos</option><option value="odontologia">Odontologia</option><option value="ortodoncia">Ortodoncia</option><option value="sin_registrar">Sin registrar</option></select></label>
                                <label>Estado<select id="promo-estado"><option value="all">Todos</option><option value="activo">Activos</option><option value="inactivo">Inactivos</option></select></label>
                                <label>Ausencia<select id="promo-segmento"><option value="all">Todos</option><option value="al_dia">Al dia</option><option value="retrasado">Retrasado</option><option value="m2">+2 meses</option><option value="m3">+3 meses</option></select></label>
                                <label>Próxima cita<select id="promo-proxima"><option value="all">Todos</option><option value="con">Con cita</option><option value="sin">Sin cita</option></select></label>
                            </div>
                            <div class="promo-list-box" hidden>
                                <p class="promo-note">Una columna con el nombre (Nombre, Cliente, Paciente, Usuario…) y otra con el teléfono. Se lee la primera hoja; los números repetidos se ignoran.</p>
                                <div class="promo-file"><input id="promo-file" type="file" accept=".xlsx,.csv"><button type="button" id="promo-import" class="promo-btn">Importar</button></div>
                                <div class="promo-row"><span id="promo-list-info" class="promo-note"></span><button type="button" id="promo-clear-list" class="promo-btn is-danger-ghost">Vaciar lista</button></div>
                            </div>
                        </section>
                    </div>
                    <section class="promo-section">
                        <h3><span class="promo-step">3</span>Envío</h3>
                        <div class="promo-row promo-send-tools">
                            <label class="promo-inline">Tamaño del bloque<input id="promo-block" type="number" min="1" max="500" value="50"></label>
                            <label class="promo-inline promo-check" title="Los que fallaron casi siempre son números sin WhatsApp"><input id="promo-retry-failed" type="checkbox">Reintentar los que fallaron</label>
                            <span class="promo-spacer"></span>
                            <button type="button" id="promo-history" class="promo-btn is-ghost">Ver a quiénes se envió</button>
                            <button type="button" id="promo-load" class="promo-btn">Cargar pacientes</button>
                        </div>
                        <div id="promo-progress" class="promo-status">Aún no cargados</div>
                        <div id="promo-items" class="reminder-items"></div>
                    </section>
                </div>
                <footer class="promo-foot"><button type="button" id="promo-cancel" class="promo-btn is-danger-ghost" disabled>Cancelar bloque</button><button type="button" id="promo-resume" class="promo-btn is-ghost" hidden>Reanudar bloque</button><button type="submit" id="promo-send" class="promo-btn is-primary">Enviar bloque</button></footer></form>`;
            document.body.appendChild(modal);
            const $ = (sel) => modal.querySelector(sel);
            $("[data-close]").addEventListener("click", () => { modal.hidden = true; });
            // Al elegir una campaña se carga sola: se ve enseguida cuántos ya la recibieron y cuántos faltan.
            $("#promo-campaign").addEventListener("change", () => { fillPromoCampaign(); clearPromoBlock(); if ($("#promo-campaign").value) void loadPromoCandidates(); });
            $("#promo-history").addEventListener("click", () => void showPromoHistory());
            // La lista cargada es exactamente lo que se envía: si cambia un filtro hay que volver a cargar.
            ["#promo-tratamiento", "#promo-estado", "#promo-segmento", "#promo-proxima", "#promo-block", "#promo-retry-failed"].forEach((sel) => $(sel).addEventListener("change", clearPromoBlock));
            $("#promo-save").addEventListener("click", () => void savePromoCampaign());
            $("#promo-delete").addEventListener("click", () => void deletePromoCampaign());
            $("#promo-source").addEventListener("change", () => { syncPromoSource(); clearPromoBlock(); });
            modal.querySelectorAll("[data-promo-source]").forEach((btn) => btn.addEventListener("click", () => { if ($("#promo-source").value === btn.dataset.promoSource) return; $("#promo-source").value = btn.dataset.promoSource; $("#promo-source").dispatchEvent(new Event("change")); }));
            $("#promo-template").addEventListener("input", renderPromoPreview);
            $("#promo-import").addEventListener("click", () => void importPromoList());
            $("#promo-clear-list").addEventListener("click", () => void clearPromoList());
            $("#promo-load").addEventListener("click", () => void loadPromoCandidates());
            $("form").addEventListener("submit", (event) => { event.preventDefault(); void sendPromoBlock(); });
            $("#promo-resume").addEventListener("click", () => void promoBatchAction("resume"));
            $("#promo-cancel").addEventListener("click", () => void promoBatchAction("cancel"));
        }
        modal.hidden = false;
        await loadPromoCampaigns();
        clearPromoBlock();
        const active = (await api("/api/mensajes-view/promo-batches-active")).batch;
        if (active) { modal.dataset.batchId = active.id; modal.querySelector("#promo-campaign").value = String(active.campaign_id); fillPromoCampaign(); await pollPromo(); }
        else if (modal.querySelector("#promo-campaign").value) await loadPromoCandidates();
    }
    async function loadPromoCampaigns(selectId, options = {}) {
        const modal = document.getElementById("mensajes-promo-modal"); const select = modal.querySelector("#promo-campaign"); const current = selectId || select.value;
        const data = await api("/api/mensajes-view/promos");
        modal._promoCampaigns = data.campaigns;
        select.innerHTML = `<option value="">— Nueva campaña —</option>` + data.campaigns.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.sentCount} enviados)</option>`).join("");
        if (current && data.campaigns.some((c) => String(c.id) === String(current))) select.value = String(current);
        fillPromoCampaign(options);
    }
    function fillPromoCampaign({ keepFilters = false } = {}) {
        const modal = document.getElementById("mensajes-promo-modal"); const campaign = (modal._promoCampaigns || []).find((c) => String(c.id) === modal.querySelector("#promo-campaign").value);
        modal.querySelector("#promo-name").value = campaign?.name || "";
        modal.querySelector("#promo-template").value = campaign?.template || "Hola {{nombre}}, ";
        modal.querySelector("#promo-valid-until").value = campaign?.validUntil || "";
        modal.querySelector("#promo-delete").hidden = !campaign;
        if (!keepFilters) modal.querySelector("#promo-source").value = campaign?.source || "seguimiento";
        syncPromoSource();
        if (!keepFilters) { let filters = {}; try { filters = JSON.parse(campaign?.filtersJson || "{}"); } catch { /* filtros guardados ilegibles: quedan en Todos */ }
        modal.querySelector("#promo-tratamiento").value = filters.tratamiento || "all"; modal.querySelector("#promo-estado").value = filters.estado || "all";
        modal.querySelector("#promo-segmento").value = filters.segmento || "all"; modal.querySelector("#promo-proxima").value = filters.proximaFiltro || "all"; }
        modal.querySelector("#promo-campaign-info").textContent = campaign ? `${campaign.sentCount} pacientes ya la recibieron${campaign.lastSentAt ? ` · último envío ${new Date(campaign.lastSentAt.replace(" ", "T") + "Z").toLocaleDateString("es")}` : ""}` : "Escriba el nombre y el mensaje, y guarde la campaña";
    }
    async function savePromoCampaign() {
        const modal = document.getElementById("mensajes-promo-modal"); const campaignId = modal.querySelector("#promo-campaign").value; const info = modal.querySelector("#promo-campaign-info");
        const body = JSON.stringify({ name: modal.querySelector("#promo-name").value, template: modal.querySelector("#promo-template").value, source: modal.querySelector("#promo-source").value, validUntil: modal.querySelector("#promo-valid-until").value });
        try {
            const data = campaignId
                ? await api(`/api/mensajes-view/promos/${campaignId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
                : await api("/api/mensajes-view/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body });
            await loadPromoCampaigns(data.campaign.id, { keepFilters: true });
            return true;
        } catch (error) { info.textContent = error.message || "No se pudo guardar la campaña"; return false; }
    }
    async function deletePromoCampaign() {
        const modal = document.getElementById("mensajes-promo-modal"); const campaign = (modal._promoCampaigns || []).find((c) => String(c.id) === modal.querySelector("#promo-campaign").value); if (!campaign) return;
        if (!await askConfirm(`Se borrará la campaña "${campaign.name}" y su registro de envíos (${campaign.sentCount} enviados). Los mensajes ya enviados no se borran de los chats. ¿Continuar?`)) return;
        try { await api(`/api/mensajes-view/promos/${campaign.id}`, { method: "DELETE" }); modal.querySelector("#promo-campaign").value = ""; await loadPromoCampaigns(); clearPromoBlock(); }
        catch (error) { modal.querySelector("#promo-campaign-info").textContent = error.message || "No se pudo borrar la campaña"; }
    }
    // Vista previa del mensaje: con el primer paciente del bloque cargado o un nombre de ejemplo.
    function renderPromoPreview() {
        const modal = document.getElementById("mensajes-promo-modal"); if (!modal) return;
        const name = modal._promoBlock?.[0]?.patientName || "María López";
        const text = modal.querySelector("#promo-template").value.trim();
        modal.querySelector("#promo-preview").textContent = text ? text.replace(/{{\s*nombre\s*}}/g, name) : "Escriba el mensaje de la promoción";
        modal.querySelector("#promo-preview").classList.toggle("is-empty", !text);
    }
    // Origen de la campaña: filtros del Seguimiento o lista importada (Excel/CSV).
    function syncPromoSource() {
        const modal = document.getElementById("mensajes-promo-modal"); const isList = modal.querySelector("#promo-source").value === "lista";
        const campaign = (modal._promoCampaigns || []).find((c) => String(c.id) === modal.querySelector("#promo-campaign").value);
        modal.querySelector(".promo-filters").hidden = isList; modal.querySelector(".promo-list-box").hidden = !isList;
        modal.querySelectorAll("[data-promo-source]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.promoSource === modal.querySelector("#promo-source").value));
        renderPromoPreview();
        modal.querySelector("#promo-list-info").textContent = campaign?.source === "lista" ? `Lista guardada: ${campaign.contactCount} contactos. No hace falta volver a subir el archivo (solo para agregar más).` : "Guarde la campaña para poder importar la lista";
    }
    async function importPromoList() {
        const modal = document.getElementById("mensajes-promo-modal"); const info = modal.querySelector("#promo-list-info"); const file = modal.querySelector("#promo-file").files[0];
        if (!file) { info.textContent = "Elija un archivo .xlsx o .csv"; return; }
        const saved = (modal._promoCampaigns || []).find((c) => String(c.id) === modal.querySelector("#promo-campaign").value);
        if ((!saved || saved.source !== "lista") && !await savePromoCampaign()) return;
        info.textContent = "Leyendo archivo…";
        try {
            const contacts = promoContactsFromRows(await readSpreadsheetRows(file));
            const campaignId = modal.querySelector("#promo-campaign").value;
            const data = await api(`/api/mensajes-view/promos/${campaignId}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contacts }) });
            await loadPromoCampaigns(campaignId, { keepFilters: true }); clearPromoBlock();
            modal.querySelector("#promo-file").value = "";
            await loadPromoCandidates();
            info.textContent = `${data.added} contactos nuevos · ${data.duplicates} repetidos · ${data.invalid} sin teléfono válido · ${data.total} en la lista`;
        } catch (error) { info.textContent = error.message || "No se pudo importar la lista"; }
    }
    async function clearPromoList() {
        const modal = document.getElementById("mensajes-promo-modal"); const campaignId = modal.querySelector("#promo-campaign").value; if (!campaignId) return;
        if (!await askConfirm("Se quitarán todos los contactos importados de esta campaña. El registro de a quién ya se le envió se conserva. ¿Continuar?")) return;
        try { await api(`/api/mensajes-view/promos/${campaignId}/contacts`, { method: "DELETE" }); await loadPromoCampaigns(campaignId, { keepFilters: true }); clearPromoBlock(); }
        catch (error) { modal.querySelector("#promo-list-info").textContent = error.message || "No se pudo vaciar la lista"; }
    }
    // Filas -> [{ name, phone }]. Columna del teléfono: la que más celdas con 8-15 dígitos tiene.
    // Columna del nombre: la que tenga encabezado tipo Nombre/Cliente/Paciente/Usuario; si no, la que más texto tenga.
    function promoContactsFromRows(rows) {
        const width = Math.max(0, ...rows.map((r) => r.length));
        const isPhone = (v) => { const d = String(v || "").split(/[\/,;]/)[0].replace(/\D/g, ""); return d.length >= 8 && d.length <= 15; };
        const count = (col, test) => rows.reduce((n, r) => n + (test(r[col]) ? 1 : 0), 0);
        let phoneCol = -1, best = 0;
        for (let c = 0; c < width; c++) { const n = count(c, isPhone); if (n > best) { best = n; phoneCol = c; } }
        if (phoneCol < 0) throw new Error("No se encontró una columna con números de teléfono");
        const header = (rows[0] || []).map((v) => String(v || "").toLowerCase());
        let nameCol = header.findIndex((h, c) => c !== phoneCol && /nombre|cliente|paciente|usuario|contacto|name/.test(h));
        if (nameCol < 0) { best = 0; for (let c = 0; c < width; c++) { if (c === phoneCol) continue; const n = count(c, (v) => /[a-záéíóúñ]/i.test(String(v || ""))); if (n > best) { best = n; nameCol = c; } } }
        // Encabezados y filas vacías (sin ningún dígito en el teléfono) no se envían.
        return rows.filter((r) => /\d/.test(String(r[phoneCol] || ""))).map((r) => ({ name: nameCol >= 0 ? String(r[nameCol] || "").trim() : "", phone: String(r[phoneCol] || "") }));
    }
    async function readSpreadsheetRows(file) {
        const buffer = await file.arrayBuffer();
        if (/\.csv$/i.test(file.name)) {
            let text = new TextDecoder("utf-8").decode(buffer);
            if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buffer); // CSV guardado por Excel en español
            return parseCsv(text.replace(/^﻿/, ""));
        }
        if (/\.xlsx$/i.test(file.name)) return readXlsxRows(buffer);
        throw new Error("Formato no soportado: use .xlsx o .csv");
    }
    function parseCsv(text) {
        const first = text.split(/\r?\n/)[0] || "";
        const sep = first.includes("\t") ? "\t" : (first.split(";").length > first.split(",").length ? ";" : ",");
        const rows = []; let row = [], cell = "", quoted = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
            else if (ch === '"') quoted = true;
            else if (ch === sep) { row.push(cell); cell = ""; }
            else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
            else cell += ch;
        }
        if (cell || row.length) { row.push(cell); rows.push(row); }
        return rows;
    }
    // .xlsx = ZIP con XML. Se lee la primera hoja con APIs del navegador (DecompressionStream + DOMParser), sin librerías.
    async function readXlsxRows(buffer) {
        const bytes = new Uint8Array(buffer); const view = new DataView(buffer); const utf8 = new TextDecoder();
        let end = -1; for (let i = bytes.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
        if (end < 0) throw new Error("El archivo no es un Excel .xlsx válido");
        const files = {}; let p = view.getUint32(end + 16, true);
        for (let n = view.getUint16(end + 10, true); n > 0; n--) {
            const nameLen = view.getUint16(p + 28, true);
            files[utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))] = { method: view.getUint16(p + 10, true), size: view.getUint32(p + 20, true), local: view.getUint32(p + 42, true) };
            p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
        }
        const readXml = async (name) => {
            const f = files[name]; if (!f) return null;
            const start = f.local + 30 + view.getUint16(f.local + 26, true) + view.getUint16(f.local + 28, true);
            const data = bytes.subarray(start, start + f.size);
            const raw = f.method === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
            return new DOMParser().parseFromString(utf8.decode(raw), "application/xml");
        };
        const workbook = await readXml("xl/workbook.xml"); const rels = await readXml("xl/_rels/workbook.xml.rels");
        const rid = workbook?.getElementsByTagName("sheet")[0]?.getAttribute("r:id");
        const target = [...(rels?.getElementsByTagName("Relationship") || [])].find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target") || "worksheets/sheet1.xml";
        const sheet = await readXml(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
        if (!sheet) throw new Error("No se encontró la primera hoja del Excel");
        const shared = [...((await readXml("xl/sharedStrings.xml"))?.getElementsByTagName("si") || [])].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
        const colIndex = (ref) => [...String(ref || "A").replace(/\d/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        return [...sheet.getElementsByTagName("row")].map((rowEl) => {
            const row = [];
            for (const c of rowEl.getElementsByTagName("c")) {
                const type = c.getAttribute("t"); const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
                row[colIndex(c.getAttribute("r"))] = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? (c.getElementsByTagName("is")[0]?.textContent ?? "") : (/^-?\d+(\.\d+)?e\+?\d+$/i.test(v) ? BigInt(Math.round(Number(v))).toString() : v);
            }
            return row;
        });
    }
    async function showPromoHistory() {
        const modal = document.getElementById("mensajes-promo-modal"); const campaignId = modal.querySelector("#promo-campaign").value; const progress = modal.querySelector("#promo-progress");
        if (!campaignId || modal.dataset.batchId) return;
        try {
            const items = (await api(`/api/mensajes-view/promos/${campaignId}/history`)).items;
            clearPromoBlock();
            const sent = items.filter((x) => x.status === "sent").length;
            progress.textContent = `Historial: ${sent} enviados · ${items.length - sent} con error o en cola`;
            modal.querySelector("#promo-items").innerHTML = items.length
                ? items.map((x) => `<div class="reminder-item"><strong>${esc(x.name || x.phone)}</strong><span>${esc(x.phone)} · ${esc(new Date(String(x.at).replace(" ", "T") + "Z").toLocaleString("es"))}${x.error ? ` · ${esc(String(x.error).split("\n")[0])}` : ""}</span><em>${PROMO_STATUS[x.status] || x.status}</em></div>`).join("")
                : `<div class="mensajes-empty">Todavía no se ha enviado esta campaña.</div>`;
        } catch (error) { progress.textContent = error.message || "No se pudo cargar el historial"; }
    }
    function clearPromoBlock() {
        const modal = document.getElementById("mensajes-promo-modal"); if (!modal || modal.dataset.batchId) return;
        modal._promoBlock = []; renderPromoPreview(); modal.querySelector("#promo-items").innerHTML = ""; modal.querySelector("#promo-progress").textContent = "Aún no cargados";
        modal.querySelector("#promo-send").textContent = "Enviar bloque"; modal.querySelector("#promo-send").disabled = true;
    }
    function promoFiltersFromModal(modal) { return { tratamiento: modal.querySelector("#promo-tratamiento").value, estado: modal.querySelector("#promo-estado").value, segmento: modal.querySelector("#promo-segmento").value, proximaFiltro: modal.querySelector("#promo-proxima").value }; }
    async function loadPromoCandidates() {
        const modal = document.getElementById("mensajes-promo-modal"); const campaignId = modal.querySelector("#promo-campaign").value; const progress = modal.querySelector("#promo-progress");
        if (!campaignId) { progress.textContent = "Primero guarde la campaña"; return; }
        const blockSize = Math.max(1, Number(modal.querySelector("#promo-block").value) || 50);
        progress.textContent = "Cargando…";
        try {
            const data = await api(`/api/mensajes-view/promos/${campaignId}/candidates?${new URLSearchParams({ ...promoFiltersFromModal(modal), retryFailed: modal.querySelector("#promo-retry-failed").checked ? "1" : "0" })}`);
            const block = data.pending.slice(0, blockSize);
            modal._promoBlock = block; modal.querySelector("#promo-send").disabled = !block.length; renderPromoPreview();
            progress.textContent = `${data.total} en ${modal.querySelector("#promo-source").value === "lista" ? "la lista" : "el filtro"} · ${data.alreadySent} ya la recibieron · ${data.pending.length} pendientes${data.noPhone ? ` · ${data.noPhone} sin teléfono válido` : ""}${data.failedBefore ? ` · ${data.failedBefore} fallaron antes (no se reintentan)` : ""}`;
            modal.querySelector("#promo-send").textContent = block.length ? `Enviar bloque de ${block.length}` : "Enviar bloque";
            modal.querySelector("#promo-items").innerHTML = block.length
                ? block.map((x) => `<div class="reminder-item"><strong>${esc(x.patientName)}</strong><span>${esc(x.phone)} · ${esc(x.treatment || "")}</span><em>En este bloque</em></div>`).join("") + (data.pending.length > block.length ? `<div class="mensajes-empty">Quedan ${data.pending.length - block.length} para los siguientes bloques.</div>` : "")
                : `<div class="mensajes-empty">${data.alreadySent ? `Ya se les envió a todos (${data.alreadySent}). No queda nadie pendiente en ${modal.querySelector("#promo-source").value === "lista" ? "esta lista" : "estos filtros"}.` : "No hay destinatarios con estos datos."}</div>`;
        } catch (error) { progress.textContent = error.message || "No se pudieron cargar los pacientes"; }
    }
    async function sendPromoBlock() {
        const modal = document.getElementById("mensajes-promo-modal"); const campaignId = modal.querySelector("#promo-campaign").value; const progress = modal.querySelector("#promo-progress");
        if (!campaignId) { progress.textContent = "Primero guarde la campaña"; return; }
        const block = modal._promoBlock || [];
        if (!block.length) { progress.textContent = "Primero cargue los pacientes"; return; }
        // Se envía lo que está escrito: si el mensaje o el nombre cambiaron, se guarda la campaña primero.
        const saved = (modal._promoCampaigns || []).find((c) => String(c.id) === campaignId);
        if (!saved || saved.template !== modal.querySelector("#promo-template").value.trim() || saved.name !== modal.querySelector("#promo-name").value.trim() || saved.source !== modal.querySelector("#promo-source").value || (saved.validUntil || "") !== modal.querySelector("#promo-valid-until").value) {
            if (!await savePromoCampaign()) return;
        }
        const template = modal.querySelector("#promo-template").value.trim();
        const preview = block[0].patientName ? template.replace(/{{\s*nombre\s*}}/g, block[0].patientName) : template.replace(/\s*{{\s*nombre\s*}}/g, "");
        if (!await askConfirm(`Se enviará a los ${block.length} pacientes de la lista cargada. Así le llegará a ${block[0].patientName || block[0].phone}:

${preview}

¿Continuar?`)) return;
        modal.querySelector("#promo-send").disabled = true;
        try {
            const data = await api(`/api/mensajes-view/promos/${campaignId}/send-block`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientIds: block.map((x) => x.patientId), filters: promoFiltersFromModal(modal), retryFailed: modal.querySelector("#promo-retry-failed").checked }) });
            modal.dataset.batchId = data.batch.id;
            await pollPromo();
        } catch (error) { modal.querySelector("#promo-send").disabled = false; progress.textContent = error.message || "No se pudo enviar el bloque"; }
    }
    async function pollPromo() {
        const modal = document.getElementById("mensajes-promo-modal"); const batchId = modal?.dataset.batchId; if (!batchId || modal.hidden) return;
        try {
            const batch = (await api(`/api/mensajes-view/promo-batches/${batchId}`)).batch; const running = ["queued", "processing"].includes(batch.status);
            modal.querySelector("#promo-progress").textContent = `Bloque: ${batch.sentCount} enviados · ${batch.failedCount} errores · ${batch.cancelledCount} cancelados de ${batch.totalCount}${running ? "" : " · terminado"}`;
            modal.querySelector("#promo-items").innerHTML = batch.items.map((x) => `<div class="reminder-item"><strong>${esc(x.patient_name)}</strong><span>${esc(x.phone)}${x.error ? ` · ${esc(x.error)}` : ""}</span><em>${PROMO_STATUS[x.status] || x.status}</em></div>`).join("");
            modal.querySelector("#promo-send").disabled = running; modal.querySelector("#promo-cancel").disabled = !running; modal.querySelector("#promo-resume").hidden = !running;
            clearTimeout(modal._promoPoll); if (running) modal._promoPoll = setTimeout(() => void pollPromo(), 3000);
            else { delete modal.dataset.batchId; modal._promoBlock = []; await loadPromoCampaigns(modal.querySelector("#promo-campaign").value, { keepFilters: true }); }
        } catch (error) { modal.querySelector("#promo-progress").textContent = error.message || "No se pudo consultar el bloque"; }
    }
    async function promoBatchAction(action) {
        const modal = document.getElementById("mensajes-promo-modal"); if (!modal?.dataset.batchId) return;
        try { await api(`/api/mensajes-view/promo-batches/${modal.dataset.batchId}/${action}`, { method: "POST" }); } catch (error) { modal.querySelector("#promo-progress").textContent = error.message; return; }
        await pollPromo();
    }
    async function refreshGlobalAiStatus() { const group = document.getElementById("mensajes-ai-group") || document.getElementById("mensajes-simulator"); if (!group) return; let indicator = document.getElementById("mensajes-ai-global-status"); if (!indicator) { indicator = document.createElement("span"); indicator.id = "mensajes-ai-global-status"; indicator.className = "mensajes-ai-global-status"; group.insertBefore(indicator, document.getElementById("mensajes-pause-ai") || null); } const data = await api("/api/mensajes-view/automation-settings"); const active = Boolean(data.settings.enabled); indicator.textContent = active ? "IA activa" : "IA pausada"; indicator.classList.toggle("is-active", active); indicator.classList.toggle("is-paused", !active); const pause = document.getElementById("mensajes-pause-ai"); const toAi = document.getElementById("mensajes-global-ai"); if (pause) { pause.textContent = active ? "Pausar IA" : "Reanudar IA"; pause.dataset.aiAction = active ? "paused" : "resume"; pause.title = active ? "Apaga la IA y cancela lo que esté respondiendo" : "Vuelve a encender la IA; no responde lo viejo, solo los mensajes que lleguen"; pause.disabled = false; } if (toAi) toAi.textContent = "Pasar todo a IA"; }
    function formatWhatsappStatus(status) { const labels = { disconnected: "Desconectado", initializing: "Iniciando...", connecting: "Conectando...", qr: "QR en ventana de WhatsApp", authenticated: "Autenticado...", syncing: "Sincronizando...", connected: "Conectado", reconnecting: "Reconectando...", auth_failure: "Fallo de autenticación", error: "Error" }; return labels[status] || status || "Desconectado"; }
    function paintWhatsappStatus(status) { const state = document.getElementById("mensajes-whatsapp-status"); const start = document.getElementById("mensajes-whatsapp-start"); if (!state) return; const statusName = status?.status || "disconnected"; state.textContent = formatWhatsappStatus(statusName) + (status?.error ? `: ${status.error}` : ""); state.dataset.status = statusName; state.className = `mensajes-wa-state is-${statusName}`; if (start) { /* Un solo botón: la acción depende del estado (conectado = cerrar el navegador de WhatsApp). */ const busy = ["initializing", "connecting", "authenticated", "syncing"].includes(statusName); const connected = statusName === "connected"; start.dataset.waAction = connected ? "stop" : "start"; start.textContent = busy ? "Conectando..." : connected ? "⏻ Cerrar WhatsApp" : ["qr", "reconnecting"].includes(statusName) ? "Reintentar" : "Iniciar"; start.title = connected ? "Cierra el navegador de WhatsApp; la sesión se conserva (no pide QR al volver a iniciar)" : ""; start.classList.toggle("sim-btn-primary", !connected); start.disabled = busy; } const recover = document.getElementById("mensajes-whatsapp-recover"); if (recover && !recover.dataset.busy) recover.disabled = statusName !== "connected"; }
    async function refreshWhatsappStatus() { try { const data = await api("/api/mensajes-view/whatsapp/status"); paintWhatsappStatus(data.status); } catch (error) { paintWhatsappStatus({ status: "error", error: error.message }); } }
    async function startWhatsapp() { paintWhatsappStatus({ status: "initializing" }); try { const data = await api("/api/mensajes-view/whatsapp/start", { method: "POST" }); paintWhatsappStatus(data.status); } catch (error) { await refreshWhatsappStatus(); alert(error.message); } }
    async function recoverUnread(event) { const btn = event.currentTarget; btn.disabled = true; btn.dataset.busy = "1"; btn.textContent = "Trayendo..."; try { const data = await api("/api/mensajes-view/whatsapp/recover-unread", { method: "POST" }); if (!data.started) alert("Ya hay una recuperación en curso. Intente en unos segundos."); } catch (error) { alert(error.message); } finally { delete btn.dataset.busy; btn.textContent = "Traer no leídos"; await refreshWhatsappStatus(); } }
    async function stopWhatsapp() { if (!await askConfirm("Se cerrará WhatsApp: no entrarán ni saldrán mensajes hasta volver a iniciarlo. La sesión se conserva. ¿Continuar?")) return; try { const data = await api("/api/mensajes-view/whatsapp/stop", { method: "POST" }); paintWhatsappStatus(data.status); } catch (error) { alert(error.message); } }
    async function clearWhatsappSession() { if (!await askConfirm("Se cerrará WhatsApp y se borrará la sesión guardada. El siguiente inicio pedirá un QR nuevo. ¿Continuar?")) return; try { const data = await api("/api/mensajes-view/whatsapp/session", { method: "DELETE" }); paintWhatsappStatus(data.status); } catch (error) { alert(error.message); } }
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
    // Avatar como en WhatsApp: la foto de perfil (la guarda el backend, ver refreshAvatars) o la silueta
    // genérica. El estado ya no va en el avatar: el modo va a la derecha y "IA escribiendo…" en la 2.ª línea.
    // La foto se pide con fetch (lleva el token; un <img src> directo no) y se guarda como object URL.
    const avatarUrls = new Map(); // `${id}:${tag}` -> object URL (null = pedida o sin foto)
    let avatarRenderTimer = null;
    function convAvatarHtml(c) {
        const key = `${c.id}:${c.avatarTag}`;
        if (c.avatarTag && !avatarUrls.has(key)) {
            avatarUrls.set(key, null);
            fetch(`/api/mensajes-view/conversations/${c.id}/avatar?v=${encodeURIComponent(c.avatarTag)}`, { __skipConnectionErrorAlert: true })
                .then((r) => (r.ok ? r.blob() : null))
                .then((blob) => {
                    if (!blob) return;
                    avatarUrls.set(key, URL.createObjectURL(blob));
                    avatarRenderTimer ??= setTimeout(() => { avatarRenderTimer = null; lastListSig = ""; renderConversationList(); }, 100);
                })
                .catch(() => {});
        }
        const url = c.avatarTag ? avatarUrls.get(key) : null;
        return url
            ? `<img class="conv-photo" src="${url}" alt="">`
            : '<svg class="conv-silhouette" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4.2" fill="currentColor"/><path d="M3.8 21.5c.9-4.2 4.2-6.6 8.2-6.6s7.3 2.4 8.2 6.6z" fill="currentColor"/></svg>';
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
    // "Sin responder": el último mensaje del paciente no tiene respuesta (de la IA ni de
    // recepción) ni fue marcado como atendido, y lleva AWAITING_MINUTES o más. Lo calcula
    // el backend por estado (awaitingSince); acá solo se aplica el umbral y se excluye
    // el chat si la IA está preparando la respuesta en este momento.
    const AWAITING_MINUTES = 10;
    function awaitingMinutes(c, aiWorking) {
        if (!c?.awaitingSince || aiWorking) return null;
        const minutes = Math.floor((Date.now() - new Date(c.awaitingSince).getTime()) / 60000);
        return Number.isFinite(minutes) && minutes >= AWAITING_MINUTES ? minutes : null;
    }
    function formatWait(minutes) {
        if (minutes < 60) return `${minutes} min`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
        return `${Math.floor(minutes / 1440)} d`;
    }
    // Botón de la cabecera del chat abierto. "Atendido" no es "Tomar": no cambia el
    // modo de atención, solo quita la etiqueta; si el paciente vuelve a escribir,
    // el chat vuelve a quedar sin responder y la IA (si está en modo IA) responde
    // con el contexto completo, como siempre. Excepción: en "Necesita revisión" pasa a
    // Manual (ver markAttended en el backend).
    function paintAttendedButton() {
        const actions = document.querySelector("#mensajes-chat-head .mensajes-chat-actions");
        if (!actions) return;
        const conversation = allConversations.find((c) => c.id === selectedId);
        const wait = conversation ? awaitingMinutes(conversation, aiWorkingConvIds.has(conversation.id)) : null;
        // En "Necesita revisión" va siempre: recepción puede haberlo resuelto sin escribir (ej. verificó la cita).
        const review = conversation?.attentionMode === "review_required";
        let button = actions.querySelector("[data-mark-attended]");
        if (wait === null && !review) { button?.remove(); return; }
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "chat-attended-btn";
            button.dataset.markAttended = "1";
            button.textContent = "✓ Atendido";
            button.addEventListener("click", async () => {
                const id = selectedId;
                button.disabled = true;
                try { await api(`/api/mensajes-view/conversations/${id}/attended`, { method: "POST" }); await loadConversations(); }
                catch (error) { button.disabled = false; alert(error.message); }
            });
            actions.insertBefore(button, actions.firstChild);
        }
        button.title = review
            ? `Ya lo revisaste: sale de "Necesita revisión" y pasa a Manual, como "Tomar". La IA no responde hasta que lo liberes.${wait === null ? "" : ` También quita "sin responder" (hace ${formatWait(wait)}).`}`
            : `Sin responder hace ${formatWait(wait)}. Quita la etiqueta sin responderle al paciente (por ejemplo, un "gracias 👍"). No cambia el modo: si vuelve a escribir, la etiqueta vuelve y la IA o recepción siguen como estaban.`;
    }
    // Como WhatsApp con un contacto no guardado: sin paciente vinculado se muestra el número, no el nombre que la
    // persona puso en su WhatsApp ("." o emojis); así se relaciona y se busca igual que en el teléfono.
    const waPhoneLabel = (c) => (c?.phoneResolved && /^\d{8}$/.test(String(c.phone || "")) ? `+503 ${c.phone.slice(0, 4)} ${c.phone.slice(4)}` : "");
    function renderConversationList() {
        const list = document.getElementById("mensajes-list");
        if (!list) return;
        const term = normSearch(convSearchTerm);
        const decorated = allConversations.map((c) => {
            const linked = c.waChatId ? patientNameByChat.get(c.waChatId) : null;
            // linkedPatientName viene del backend y sigue fusiones (alias / patient_id);
            // el mapa por waChatId queda de respaldo.
            const patientName = c.linkedPatientName || linked?.name || "";
            const aiWorking = aiWorkingConvIds.has(c.id);
            return {
                c,
                patientName,
                displayName: patientName || waPhoneLabel(c) || c.waDisplayName || c.phone || "Sin número",
                aiWorking,
                waitMinutes: awaitingMinutes(c, aiWorking)
            };
        });
        const reviewCount = decorated.filter((x) => x.c.attentionMode === "review_required").length;
        const awaitingCount = decorated.filter((x) => x.waitMinutes !== null).length;

        const filtersEl = document.getElementById("mensajes-filters");
        if (filtersEl) {
            const countEl = filtersEl.querySelector('[data-filter="review"] .chip-count');
            if (countEl) countEl.textContent = reviewCount ? ` ${reviewCount}` : "";
            const awaitingEl = filtersEl.querySelector('[data-filter="awaiting"] .chip-count');
            if (awaitingEl) awaitingEl.textContent = awaitingCount ? ` ${awaitingCount}` : "";
            const archivedEl = filtersEl.querySelector('[data-filter="archived"] .chip-count');
            if (archivedEl) { const n = decorated.filter((x) => x.c.waArchived).length; archivedEl.textContent = n ? ` ${n}` : ""; }
            filtersEl.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === convListFilter));
        }

        let rows = decorated;
        // Como WhatsApp: los archivados no salen en "Todas". Sí en revisión / sin responder / IA, que son trabajo pendiente.
        if (convListFilter === "all") rows = rows.filter((x) => !x.c.waArchived);
        else if (convListFilter === "archived") rows = rows.filter((x) => x.c.waArchived);
        else if (convListFilter === "review") rows = rows.filter((x) => x.c.attentionMode === "review_required");
        else if (convListFilter === "awaiting") rows = rows.filter((x) => x.waitMinutes !== null).sort((a, b) => b.waitMinutes - a.waitMinutes);
        else if (convListFilter === "ai") rows = rows.filter((x) => x.c.attentionMode === "assistant");
        if (term) rows = rows.filter((x) => [x.displayName, x.patientName, x.c.phone, x.c.waDisplayName].some((value) => normSearch(value).includes(term)));
        paintAttendedButton();

        const sig = JSON.stringify({
            f: convListFilter,
            s: term,
            rows: rows.map((x) => [x.c.id, x.c.attentionMode, x.c.unreadCount, x.c.lastMessageAt, x.c.updatedAt, x.displayName, x.aiWorking, x.c.id === selectedId, x.c.humanReviewReason || 0, x.c.aiExcluded ? 1 : 0, x.c.avatarTag || "", x.c.waArchived ? 1 : 0, x.c.waPinned ? 1 : 0, x.waitMinutes === null ? -1 : formatWait(x.waitMinutes)])
        });
        if (sig === lastListSig && list.querySelector("[data-id], .mensajes-empty")) return;
        lastListSig = sig;

        if (!rows.length) {
            list.innerHTML = `<div class="mensajes-empty">${allConversations.length ? "Sin resultados." : "No hay conversaciones."}</div>`;
            return;
        }
        list.innerHTML = rows.map(({ c, displayName, aiWorking, waitMinutes }) => {
            const state = CONV_STATE[c.attentionMode] || { label: c.attentionMode || "", cls: "", icon: "" };
            const unread = c.unreadCount || 0;
            const isReview = c.attentionMode === "review_required";
            const typing = aiWorking && !isReview;
            const secondLine = isReview ? (c.humanReviewReason || "Necesita revisión") : (typing ? "IA escribiendo…" : "");
            return `<button class="mensajes-conversation ${c.id === selectedId ? "is-selected" : ""} ${state.cls} ${unread ? "has-unread" : ""}" data-id="${c.id}">
                <span class="conv-avatar">${convAvatarHtml(c)}</span>
                <span class="conv-main">
                    <span class="conv-top"><span class="conv-name">${esc(displayName)}</span>${c.waPinned ? '<span class="conv-pin" title="Fijado en WhatsApp">📌</span>' : ""}<span class="conv-time">${esc(convShortTime(c.lastMessageAt || c.updatedAt))}</span></span>
                    <span class="conv-sub">
                        ${isReview ? `<span class="conv-chip ${state.cls}">${state.icon} ${esc(state.label)}</span>` : ""}
                        ${waitMinutes !== null ? `<span class="conv-chip is-awaiting" title="El último mensaje del paciente no tiene respuesta">⏳ ${esc(formatWait(waitMinutes))}</span>` : ""}
                        ${c.aiExcluded ? '<span class="conv-chip is-excluded" title="La IA no responde a este chat (lista de no responder)">🚫 Excluido</span>' : ""}
                        ${secondLine ? `<span class="conv-preview${typing ? " is-typing" : ""}">${typing ? '<span class="typing-dot"></span>' : ""}${esc(secondLine)}</span>` : ""}
                        ${!isReview && state.label ? `<span class="conv-chip conv-mode ${state.cls}">${state.icon ? state.icon + " " : ""}${esc(state.label)}</span>` : ""}
                        ${unread ? `<span class="conv-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
                    </span>
                </span>
            </button>`;
        }).join("");
        list.querySelectorAll("[data-id]").forEach((button) => button.addEventListener("click", () => loadConversation(Number(button.dataset.id))));
    }
    // Las reacciones (❤️, 👍…) se guardan como mensajes "Reacción: ❤️" y el backend
    // las sigue usando (la IA no responde a una reacción), pero no se muestran en el
    // chat: no se pueden pegar al mensaje porque lo que envía la app queda con id
    // interno (Utils.js:585 de whatsapp-web.js, _serialized -> $1).
    const isReaction = (m) => typeof m.content === "string" && m.content.startsWith("Reacción:");
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
            panel.querySelector("[data-patient-unlink]").addEventListener("click", async () => { if (!await askConfirm("¿Desvincular este paciente de la conversación?")) return; await api(`/api/mensajes-view/conversations/${conversation.id}/identify-patient`, { method: "DELETE" }); await refreshConversationMeta({ force: true }); await loadConversation(conversation.id, { markRead: false, force: true }); });
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
    async function loadConversation(id, options = {}) {
        const loadSeq = ++conversationLoadSeq;
        const markRead = options.markRead !== false;
        const switched = selectedId !== id;
        if (switched) lastChatSig = "";
        selectedId = id;
        try {
        const queueData = await api(`/api/mensajes-view/conversations/${id}/response-queue?limit=10`); const activeQueue = queueData.queue.find((item) => ["generating", "ready_to_send", "sending"].includes(item.status));
        const data = await api(`/api/mensajes-view/conversations/${id}/messages?limit=100&offset=0`);
        if (loadSeq !== conversationLoadSeq || selectedId !== id || !document.getElementById("mensajes-chat-head")) return;
        // El poll llama esto cada 2s: si el chat no cambió, no reconstruir el DOM
        // (evita re-parsear 100 burbujas, re-scroll y re-bind de listeners cada tick).
        const sig = JSON.stringify({
            p: data.conversation.phone, m: data.conversation.attentionMode, x: data.conversation.aiExcluded ? 1 : 0,
            f: data.conversation.assistantClose ? [data.conversation.assistantClose.messageId, data.conversation.assistantClose.until] : null,
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
        const headName = data.patientLink?.patientName || waPhoneLabel(data.conversation) || data.conversation.waDisplayName || data.conversation.phone || "Sin número";
        const headState = CONV_STATE[data.conversation.attentionMode] || { label: data.conversation.attentionMode || "", icon: "" };
        const headSub = data.conversation.attentionMode === "review_required" && data.conversation.humanReviewReason
            ? `${headState.icon} ${esc(data.conversation.humanReviewReason)}`
            : `${headState.icon ? headState.icon + " " : ""}${esc(headState.label)}`;
        const close = data.conversation.assistantClose;
        const closedHead = close?.until ? `<span class="chat-head-state is-closed" title="La IA dio la conversación por terminada y no responde en este chat hasta esa hora. Liberar la reactiva.">✓ Finalizada · la IA no responde hasta las ${esc(new Date(close.until).toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit", timeZone: "America/El_Salvador" }))}</span>` : "";
        document.getElementById("mensajes-chat-head").innerHTML = `<div><strong>${esc(headName)}</strong><span class="chat-head-state ${headState.cls || ""}">${headSub}</span>${data.conversation.aiExcluded ? '<span class="chat-head-state is-excluded" title="La IA no responde a este chat. Quitalo de la lista en Ajustes, Control de telefonos, para reactivarla.">🚫 Excluido de la IA</span>' : ""}${closedHead}</div><div class="mensajes-chat-actions"><button data-action="verify-appointment" title="Revisa si la cita acordada en este chat ya está en la agenda">📅 Verificar cita</button>${data.conversation.attentionMode === "assistant" ? '<button data-action="take" title="Pasar a Manual: la IA deja de responder en este chat">✋ Tomar</button>' : '<button data-action="release" title="Devolver el chat a la IA">🤖 Liberar</button>'}<details class="mensajes-more"><summary title="Más acciones">⋯</summary><div class="mensajes-more-menu"><button data-action="ignore" title="Agregar este teléfono a la lista de ignorados">🚫 No responder</button><button data-action="avatar" title="Traer ahora la foto de perfil de WhatsApp de este chat">📷 Actualizar foto</button><hr><button data-action="delete" class="is-danger">🗑 Borrar conversación</button></div></details></div>`;
        const renderedMessages = data.messages.filter((m) => !isReaction(m));
        chatBody.innerHTML = renderedMessages.length ? renderedMessages.map((m) => { const state = m.queued ? (m.deliveryStatus === "failed" ? "Error de envío" : "En cola") : (m.deliveryStatus === "delivered" ? "Entregado" : m.deliveryStatus === "read" ? "Leído" : m.deliveryStatus === "sent" ? "Enviado" : "Recibido"); return `<div class="mensaje-bubble ${m.direction === "outgoing" ? "outgoing" : "incoming"} ${m.queued ? "is-queued" : ""} ${m.deliveryStatus === "failed" ? "is-failed" : ""}"><p>${esc(m.content)}</p><small>${esc(m.author)} · ${esc(formatDate(m.messageAt))} · ${state}${m.error ? ` · ${esc(m.error)}` : ""}</small>${m.deliveryStatus === "failed" ? `<button class="mensaje-retry" data-retry-id="${String(m.id).replace("queue-", "")}" type="button">Reintentar</button>` : ""}</div>`; }).join("") : `<div class="mensajes-empty">Sin mensajes.</div>`;
        // Nota del cierre (finalizar_conversacion): fuera de las burbujas, así no entra en la selección de mensajes.
        const closedIndex = close ? renderedMessages.findIndex((m) => Number(m.id) === Number(close.messageId)) : -1;
        if (closedIndex >= 0) { const note = document.createElement("div"); note.className = "mensajes-closing-note"; note.textContent = `✓ Listo: ${close.motivo} · nota interna, no se envió al paciente`; chatBody.querySelectorAll(".mensaje-bubble")[closedIndex].after(note); }
        if (activeQueue) { const indicator = document.createElement("div"); indicator.className = "mensajes-ai-queue-status"; indicator.textContent = activeQueue.status === "sending" ? "Enviando respuesta…" : activeQueue.status === "ready_to_send" ? "Respuesta lista para enviar…" : "La IA está preparando una respuesta…"; document.getElementById("mensajes-chat-body").prepend(indicator); }
        if (switched) scrollChatToBottom("instant");
        else if (wasNearBottom) scrollChatToBottom("smooth");
        const compose = document.getElementById("mensajes-compose");
        if (compose) { compose.hidden = false; compose.removeAttribute("hidden"); compose.style.display = "flex"; }
        const actions = document.querySelector(".mensajes-chat-actions");
        if (actions) {
            const deleteSelected = document.createElement("button");
            deleteSelected.type = "button";
            deleteSelected.textContent = "☑ Eliminar mensajes";
            deleteSelected.dataset.deleteSelected = "1";
            actions.querySelector(".mensajes-more-menu").prepend(deleteSelected);
        }
        paintAttendedButton();
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
        const refreshDeleteButton = () => { if (deleteButton) deleteButton.textContent = `${document.querySelectorAll("[data-message-select]:checked").length ? "🗑 Eliminar seleccionados" : "☑ Eliminar mensajes"}`; };
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
        if (deleteButton) deleteButton.textContent = enabled ? "Eliminar seleccionados" : "☑ Eliminar mensajes";
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
        menu.querySelector("[data-context-delete]").addEventListener("click", async () => { menu.remove(); if (!await askConfirm("¿Eliminar este mensaje del historial?")) return; try { await api(`/api/mensajes-view/conversations/${selectedId}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" }); await loadConversation(selectedId, { markRead: false }); } catch (error) { alert(error.message); } });
        const close = () => { menu.remove(); document.removeEventListener("click", close); };
        setTimeout(() => document.addEventListener("click", close), 0);
    }
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { document.querySelector(".mensaje-context-menu")?.remove(); setMessageSelectionMode(false); } });
    async function deleteSelectedMessages() { const ids = [...document.querySelectorAll("[data-message-select]:checked")].map((input) => input.dataset.messageSelect); if (!ids.length || !await askConfirm(`¿Eliminar ${ids.length} mensaje(s) del chat?`)) return; try { await Promise.all(ids.map((messageId) => api(`/api/mensajes-view/conversations/${selectedId}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" }))); await loadConversation(selectedId, { markRead: false }); } catch (error) { alert(error.message); } }
    // Botón "Verificar cita": la IA lee el chat y dice qué cita quedó acordada; si no está en la agenda,
    // recepción decide si crearla. Nunca crea nada sin ese clic.
    async function verifyAgreedAppointment(conversationId, conIa = false) {
        const btn = document.querySelector('[data-action="verify-appointment"]');
        if (btn) { btn.disabled = true; btn.textContent = conIa ? "Revisando chat..." : "Verificando..."; }
        let data;
        try { data = await api(`/api/mensajes-view/conversations/${conversationId}/verify-appointment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conIa }) }); }
        catch (error) { return alert(error.message); }
        finally { if (btn) { btn.disabled = false; btn.textContent = "📅 Verificar cita"; } }
        // Paciente identificado con citas: se ven al instante (sin IA). Un cambio o una cita extra acordados en el chat no
        // aparecen en la agenda: para eso, "Revisar chat con IA".
        if (data.estado === "tiene_citas") {
            const lista = data.citas.map((o) => `• ${o.dia} ${o.fecha} ${o.hora12} — ${o.servicio || "sin servicio"} (${o.estado})`).join("\n");
            const revisar = await askConfirm(`El paciente tiene en la agenda:\n\n${lista}\n\nSi en el chat se acordó un cambio de fecha u hora, o una cita adicional, revise el chat con IA.`, { title: "Verificar cita", type: "info", okText: "Revisar chat con IA", cancelText: "Listo" });
            return revisar ? verifyAgreedAppointment(conversationId, true) : undefined;
        }
        const c = data.cita;
        const label = c ? `${c.dia} ${c.fecha} a las ${c.hora12}` : "";
        const otras = (data.otrasCitas || []).map((o) => `• ${o.dia} ${o.fecha} ${o.hora12} — ${o.servicio || "sin servicio"} (${o.estado})`).join("\n");
        const otrasText = otras ? `\n\nOtras citas próximas del paciente (si era un cambio de fecha, actualice la anterior):\n${otras}` : "";
        if (data.estado === "ya_agendada") return alert(`✓ La cita ya está en la agenda: ${label}.${otrasText}`);
        if (data.estado !== "falta_agendar") return alert(data.motivo || "No encontré una cita acordada en este chat.");
        if (!data.servicioAgenda) return alert(`Se acordó cita el ${label}, pero no pude identificar el servicio ("${c.servicio || "sin servicio"}"). Agéndela desde la Agenda.${otrasText}`);
        const warn = data.cupoLibre === false ? "\n\n⚠ La agenda automática no muestra ese horario libre: puede quedar sobrecupo." : "";
        const p = data.paciente || {};
        const quien = p.vinculado ? "" : p.registrado ? `\nPaciente con expediente: ${p.nombre} (${p.telefono})` : `\nPaciente nuevo: ${p.nombre} (${p.telefono}) — queda provisional para completar su registro`;
        const create = await askConfirm(`Se acordó en el chat y NO está en la agenda:\n\n${data.servicioAgenda}${data.tipoAConfirmar ? ` (tipo a confirmar: ${data.tipoAConfirmar})` : ""}\n${label}${quien}${warn}${otrasText}`, { title: "Verificar cita", type: "info", okText: "Crear cita", cancelText: "Ignorar" });
        if (!create) return;
        try {
            const created = await api(`/api/mensajes-view/conversations/${conversationId}/agreed-appointment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fecha: c.fecha, hora: c.hora, servicio: c.servicio, nombre: p.nombre, telefono: p.telefono }) });
            alert(created.duplicada ? `Esa cita ya se había creado (#${created.id_cita}).` : `Cita creada en la agenda (#${created.id_cita}).`);
        } catch (error) { alert(error.message); }
    }
    async function conversationAction(action) {
        if (!selectedId) return;
        if (action === "delete") { if (!await askConfirm("¿Borrar esta conversación y su historial?")) return; const target = selectedId; conversationLoadSeq++; selectedId = null; const startedAt = Date.now(); showBusyOverlay("Borrando conversación…", "Un momento."); try { await api(`/api/mensajes-view/conversations/${target}`, { method: "DELETE" }); } catch (error) { if (!/no encontrada/i.test(error.message || "")) alert(error.message); } finally { await hideBusyOverlay(startedAt, 500); } const compose = document.getElementById("mensajes-compose"); if (compose) { compose.hidden = false; compose.removeAttribute("hidden"); compose.style.display = "flex"; const input = compose.querySelector("#mensajes-input"); const button = compose.querySelector('button[type="submit"]'); if (input) { input.value = ""; input.disabled = true; input.placeholder = "Selecciona una conversación para responder"; } if (button) button.disabled = true; } document.getElementById("mensajes-chat-head").innerHTML = "<span>Selecciona una conversación</span>"; document.getElementById("mensajes-chat-body").innerHTML = "<div class=\"mensajes-empty\">Selecciona una conversación para ver el historial.</div>"; return loadConversations().catch(() => {}); }
        if (action === "ignore") return ignoreConversationPhone(selectedId);
        if (action === "verify-appointment") return verifyAgreedAppointment(selectedId);
        if (action === "avatar") {
            try {
                const { result } = await api(`/api/mensajes-view/conversations/${selectedId}/avatar/refresh`, { method: "POST" });
                if (result === "none") alert("Este contacto no tiene foto de perfil o la tiene oculta por privacidad.");
                else if (result === "unknown") alert("WhatsApp todavía no tiene este chat cargado. Intenta de nuevo en un momento.");
                return loadConversations().catch(() => {});
            } catch (error) { return alert(error.message); }
        }
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
        if (!await askConfirm(`¿Dejar de responder automáticamente a este chat?\n\nLa IA no volverá a contestarle hasta que lo quites de la lista de ignorados en Ajustes.`)) return;
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
    // Deja el panel del chat en "Selecciona una conversación" (sin cabecera, panel de
    // paciente ni compose activo de una conversación que ya no existe).
    function resetChatPanel() {
        conversationLoadSeq++;
        selectedId = null;
        lastChatSig = "";
        const head = document.getElementById("mensajes-chat-head");
        const body = document.getElementById("mensajes-chat-body");
        if (head) head.innerHTML = "<span>Selecciona una conversación</span>";
        if (body) body.innerHTML = "<div class=\"mensajes-empty\">Selecciona una conversación para ver el historial.</div>";
        document.getElementById("mensajes-patient-panel")?.remove();
        const input = document.getElementById("mensajes-input");
        if (input) { input.value = ""; input.disabled = true; input.placeholder = "Selecciona una conversación para responder"; }
        const submit = document.querySelector('#mensajes-compose button[type="submit"]');
        if (submit) submit.disabled = true;
    }
    async function deleteAllConversations() {
        if (deletingAll) return;
        // La guarda se toma antes de preguntar: un segundo clic mientras el diálogo está
        // abierto no encola otra confirmación, y el poll no re-renderiza a mitad de camino.
        deletingAll = true;
        if (!await askConfirm("¿Borrar TODAS las conversaciones, mensajes y pendientes de la vista Mensajes?\n\nLas vinculaciones de pacientes se conservan. Esta acción no se puede deshacer.")) { deletingAll = false; return; }
        const startedAt = Date.now();
        showBusyOverlay("Borrando conversaciones…", "Puede tardar unos segundos. No cierres ni cambies de vista.");
        try {
            await api("/api/mensajes-view/conversations", { method: "DELETE" });
            resetChatPanel();
            lastListSig = "";
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
        const load = async () => { const data = await api(`/api/mensajes-view/patient-identities?search=${encodeURIComponent(searchInput.value.trim())}`); count.textContent = `${data.identities.length} vinculaciones encontradas`; list.innerHTML = data.identities.length ? data.identities.map((item) => `<div class="identity-settings-item"><div><strong>${esc(item.patientName)}</strong><span>${esc(item.phone || "Sin teléfono")} · ${esc(item.treatmentType || "Sin tratamiento")}</span><small>${esc(item.waChatId)}</small></div><button type="button" data-identity-remove="${item.id}">Desvincular</button></div>`).join("") : `<div class="patient-search-empty">No hay vinculaciones activas.</div>`; list.querySelectorAll("[data-identity-remove]").forEach((button) => button.addEventListener("click", async () => { if (!await askConfirm("¿Desvincular este paciente?")) return; await api(`/api/mensajes-view/patient-identities/${button.dataset.identityRemove}`, { method: "DELETE" }); await load(); })); };
        modal.querySelector("#patient-identities-refresh").addEventListener("click", load); modal.querySelector("#patient-identities-search-btn").addEventListener("click", load); searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void load(); } }); const clearAllButton = modal.querySelector("#patient-identities-clear-all"); clearAllButton.addEventListener("click", async () => { if (clearAllButton.dataset.confirming !== "1") { clearAllButton.dataset.confirming = "1"; clearAllButton.textContent = "Confirmar desvinculación total"; clearAllButton.classList.add("is-confirming"); setTimeout(() => { clearAllButton.dataset.confirming = "0"; clearAllButton.textContent = "Desvincular todas"; clearAllButton.classList.remove("is-confirming"); }, 5000); return; } clearAllButton.disabled = true; try { const result = await api("/api/mensajes-view/patient-identities", { method: "DELETE" }); clearAllButton.textContent = `${result.cleared} desvinculadas`; await load(); } catch (error) { clearAllButton.disabled = false; clearAllButton.textContent = error.message; } });
        await load(); const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); }; nav.querySelector('[data-settings-section="patient-identities"]').addEventListener("click", (event) => activate(event.currentTarget));
    }
    const KNOWLEDGE_SECTION_ORDER = ["Identidad", "Información de la clínica", "Citas", "Forma de responder", "Odontología", "Ortodoncia", "Promociones"];
    function parseKnowledgeSections(text) {
        const lines = String(text || "").split(/\r\n|\n/);
        const order = []; const map = new Map(); const preamble = []; let current = null;
        lines.forEach((line) => {
            const heading = /^##\s+(.+?)\s*$/.exec(line);
            if (heading) {
                current = heading[1].trim();
                if (!map.has(current)) { map.set(current, []); order.push(current); }
                map.get(current).push([]);
            } else if (current) {
                map.get(current)[map.get(current).length - 1].push(line);
            } else {
                preamble.push(line);
            }
        });
        return { preamble: preamble.join("\n").trim(), map, discoveredOrder: order };
    }
    function joinKnowledgeBlocks(blocks) { return (blocks || []).map((block) => block.join("\n").trim()).filter(Boolean).join("\n\n"); }
    function buildKnowledgeText(preamble, map, tabOrder) {
        const parts = [];
        if (preamble) parts.push(preamble);
        tabOrder.forEach((title) => {
            const body = joinKnowledgeBlocks(map.get(title));
            if (body) parts.push(`## ${title}\n\n${body}`);
        });
        return `${parts.join("\n\n")}\n`;
    }
    async function enrichAssistantKnowledge() {
        const modal = document.getElementById("mensajes-settings-modal");
        const section = modal?.querySelector('[data-settings-content="ia"]');
        if (!section || section.querySelector("#settings-assistant-knowledge")) return;
        const data = await api("/api/mensajes-view/assistant-knowledge");

        const parsed = parseKnowledgeSections(data.knowledge || "");
        const extraTitles = parsed.discoveredOrder.filter((title) => !KNOWLEDGE_SECTION_ORDER.includes(title));
        const tabOrder = [...KNOWLEDGE_SECTION_ORDER, ...extraTitles];
        tabOrder.forEach((title) => { if (!parsed.map.has(title)) parsed.map.set(title, []); });

        const navHtml = tabOrder.map((title, i) => `<button type="button" data-knowledge-tab="${esc(title)}" class="${i === 0 ? "is-active" : ""}">${esc(title)}</button>`).join("");
        section.insertAdjacentHTML("afterbegin", `<h3>Conocimiento de la clínica</h3><p>La IA usa este texto tal cual para responder: identidad de la clínica, promociones vigentes, información que puede dar, ubicación, formas de pago y política de cancelación. Está dividido en pestañas solo para editarlo más fácil; se guarda como un único texto para la IA.</p><div class="knowledge-editor-nav">${navHtml}</div><label>Texto de la sección<textarea id="settings-assistant-knowledge" rows="14"></textarea></label><button id="settings-save-knowledge" type="button">Guardar conocimiento</button><div id="settings-knowledge-result" class="settings-state-card"></div><hr>`);

        const textarea = section.querySelector("#settings-assistant-knowledge");
        let activeTitle = tabOrder[0];
        const loadTab = (title) => { textarea.value = joinKnowledgeBlocks(parsed.map.get(title)); };
        const captureActiveTab = () => { parsed.map.set(activeTitle, [textarea.value.split(/\r\n|\n/)]); };
        loadTab(activeTitle);

        section.querySelectorAll("[data-knowledge-tab]").forEach((button) => {
            button.addEventListener("click", () => {
                captureActiveTab();
                activeTitle = button.dataset.knowledgeTab;
                section.querySelectorAll("[data-knowledge-tab]").forEach((b) => b.classList.toggle("is-active", b === button));
                loadTab(activeTitle);
            });
        });

        modal.querySelector("#settings-save-knowledge").addEventListener("click", async () => {
            captureActiveTab();
            const fullText = buildKnowledgeText(parsed.preamble, parsed.map, tabOrder);
            try {
                const result = await api("/api/mensajes-view/assistant-knowledge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knowledge: fullText }) });
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
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="ai-services" hidden class="ai-services-settings"><h3>Servicios IA</h3><p>La IA usa el catálogo y el horario general de la clínica.</p><label>Buscar servicio<input id="simple-ai-service-search" placeholder="Nombre o alias"></label><label>Servicio<select id="simple-ai-service-select"></select></label><details id="simple-ai-active-box" class="ai-collapse"><summary>Servicios activos para la IA (<span id="simple-ai-active-count">0</span>)</summary><div class="ai-collapse-body"><p class="ai-help">Solo estos servicios los puede ofrecer y agendar la IA. El resto quedan invisibles para ella.</p><div id="simple-ai-active-list" class="ai-active-list"></div></div></details><div id="simple-ai-service-fields"><label>Duración (minutos)<input id="simple-ai-duration" type="number" min="5" max="1440" step="5"></label><label>Capacidad por hora<input id="simple-ai-capacity" type="number" min="1" max="100"><small>Déjalo vacío para no limitar.</small></label><label>Alias (uno por línea)<textarea id="simple-ai-aliases" rows="3"></textarea></label><label>Anticipación mínima (minutos)<input id="simple-ai-advance" type="number" min="0" max="43200"></label><label class="ai-enabled"><input id="simple-ai-own-hours" type="checkbox"> Este servicio tiene su propio horario</label><label id="simple-ai-copy-wrap" hidden>Reutilizar horario de otro servicio<select id="simple-ai-copy-hours"></select></label><div id="simple-ai-own-week-wrap" hidden><p class="ai-help">La IA solo ofrecerá este servicio en estas franjas (dentro del horario general). Un día sin franjas queda cerrado para este servicio.</p><div id="simple-ai-own-week" class="ai-week-schedule"></div></div><label class="ai-enabled"><input id="simple-ai-enabled" type="checkbox"> Permitir que la IA ofrezca este servicio</label><label class="ai-enabled"><input id="simple-ai-share-price" type="checkbox"> La IA puede decir el precio<small id="simple-ai-price-hint"></small></label><label class="ai-enabled"><input id="simple-ai-requires-patient" type="checkbox"> Solo para pacientes ya registrados<small>Si el chat no está identificado, la IA no responde: la conversación pasa a recepción para que identifique al paciente y la libere.</small></label><div id="simple-ai-price-warn" class="ai-help" style="color:var(--msg-warn-text,#b45309)"></div><button id="simple-ai-service-save" type="button">Guardar servicio</button><div id="simple-ai-service-result" class="settings-state-card"></div></div><details class="ai-collapse"><summary>Horario general de la clínica</summary><div class="ai-collapse-body"><p>Agregá turnos por día. Si un día no tiene turnos, queda cerrado. Este horario aplica a todos los servicios que ofrece la IA.</p><label class="ai-inline-field">Intervalo de opciones<select id="simple-ai-interval-sel"><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></label><div id="simple-ai-week" class="ai-week-schedule"></div></div></details><details class="ai-collapse"><summary>Pausas generales</summary><div class="ai-collapse-body ai-general-breaks"><div class="ai-blocked-heading"><div><small class="ai-help">Por ejemplo, almuerzo de lunes a viernes de 12:00 a 13:00.</small></div><button id="simple-ai-add-break" class="ai-secondary-btn" type="button">+ Agregar pausa</button></div><div id="simple-ai-breaks" class="ai-blocked-rows"></div></div></details><div class="ai-settings-actions"><button id="simple-ai-schedule-save" type="button">Guardar horario general</button><span id="simple-ai-schedule-result" class="settings-state-card"></span></div></section>`);
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
        const render = () => { const service = visible.find((item) => item.serviceId === Number(select.value)); if (!service) return; modal.querySelector("#simple-ai-duration").value = service.durationMinutes; modal.querySelector("#simple-ai-capacity").value = service.capacityPerHour ?? ""; modal.querySelector("#simple-ai-aliases").value = (service.aliases || []).join("\n"); modal.querySelector("#simple-ai-advance").value = service.minimumAdvanceMinutes; modal.querySelector("#simple-ai-enabled").checked = service.enabled; modal.querySelector("#simple-ai-share-price").checked = Boolean(service.sharePrice); modal.querySelector("#simple-ai-requires-patient").checked = Boolean(service.requiresIdentifiedPatient); modal.querySelector("#simple-ai-price-hint").textContent = service.price != null ? ` (catálogo: $${service.price})` : " (este servicio no tiene precio en el catálogo)"; updatePriceWarn(service); modal.querySelector("#simple-ai-own-hours").checked = Boolean(service.hasWeeklyHours); modal.querySelector("#simple-ai-own-week-wrap").hidden = !service.hasWeeklyHours; renderWeek(service.weeklyHours || {}, "#simple-ai-own-week"); const sources = services.filter((s) => s.serviceId !== service.serviceId && s.hasWeeklyHours); modal.querySelector("#simple-ai-copy-wrap").hidden = !sources.length; modal.querySelector("#simple-ai-copy-hours").innerHTML = `<option value="">— elegir servicio —</option>` + sources.map((s) => `<option value="${s.serviceId}">${esc(s.serviceName)} · ${esc(summarizeWeek(s.weeklyHours))}</option>`).join(""); };
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
                const result = await api(`/api/mensajes-view/ai-services/${select.value}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationMinutes: Number(modal.querySelector("#simple-ai-duration").value), capacityPerHour: modal.querySelector("#simple-ai-capacity").value || null, aliases: modal.querySelector("#simple-ai-aliases").value.split("\n").map((x) => x.trim()).filter(Boolean), minimumAdvanceMinutes: Number(modal.querySelector("#simple-ai-advance").value), enabled: modal.querySelector("#simple-ai-enabled").checked, sharePrice: modal.querySelector("#simple-ai-share-price").checked, requiresIdentifiedPatient: modal.querySelector("#simple-ai-requires-patient").checked, weeklyHours }) });
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
            <h3>Días y horas bloqueados</h3>
            <p>Cerrá una fecha para la IA: asueto, cierre administrativo, día lleno o una franja en la que el doctor no llega. La IA no agenda, no reprograma ni ofrece horarios en lo bloqueado.</p>
            <div class="ai-block-form">
                <input id="ai-agenda-block-date" type="date">
                <input id="ai-agenda-block-reason" type="text" placeholder="Motivo (opcional, uso interno)" maxlength="200">
                <button id="ai-agenda-block-add" type="button">Bloquear</button>
            </div>
            <div id="ai-agenda-block-hours" class="ai-block-hours" hidden></div>
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
        const hoursBox = modal.querySelector("#ai-agenda-block-hours");
        const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
        const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
        const fmt12 = (t) => { const [h, m] = String(t).split(":").map(Number); const p = h < 12 ? "a.m." : "p.m."; const h12 = h % 12 || 12; return m ? `${h12}:${String(m).padStart(2, "0")} ${p}` : `${h12} ${p}`; };
        // Horas laborales de ese día de la semana, ya descontadas las pausas generales.
        const workingHours = (weekday) => {
            const ranges = Array.isArray(schedule.schedule?.[weekday]) ? schedule.schedule[weekday] : [];
            const brks = (schedule.breaks || []).filter((b) => b.day === null || b.day === undefined || Number(b.day) === weekday);
            const chips = [];
            for (const r of ranges) {
                const s = toMin(r.start), e = toMin(r.end);
                for (let m = Math.floor(s / 60) * 60; m < e; m += 60) {
                    const hi = Math.max(m, s), ho = Math.min(m + 60, e);
                    if (ho <= hi) continue;
                    if (brks.some((b) => toMin(b.start) <= hi && toMin(b.end) >= ho)) continue;
                    chips.push({ start: toHHMM(hi), end: toHHMM(ho) });
                }
            }
            return chips;
        };
        let lastBlockMode = "all";
        const renderHourPicker = () => {
            hoursBox.innerHTML = "";
            if (!dateInput.value) { hoursBox.hidden = true; return; }
            const weekday = new Date(`${dateInput.value}T12:00:00`).getDay();
            const chips = workingHours(weekday);
            hoursBox.hidden = false;
            if (!chips.length) { hoursBox.innerHTML = `<p class="ai-help">Ese día la clínica no atiende: se bloqueará el día completo.</p>`; lastBlockMode = "all"; return; }
            // Preserva el modo elegido si solo se corrigió la fecha (no perder "solo algunas horas" por error).
            const mode = lastBlockMode === "hours" ? "hours" : "all";
            hoursBox.innerHTML = `<div class="ai-block-mode"><label><input type="radio" name="ai-block-mode" value="all"${mode === "all" ? " checked" : ""}> Todo el día</label><label><input type="radio" name="ai-block-mode" value="hours"${mode === "hours" ? " checked" : ""}> Solo algunas horas</label></div><div class="ai-hour-chips"${mode === "hours" ? "" : " hidden"}>${chips.map((c) => `<label class="ai-hour-chip"><input type="checkbox" value="${c.start}|${c.end}"> ${esc(fmt12(c.start))}</label>`).join("")}</div>`;
            const chipWrap = hoursBox.querySelector(".ai-hour-chips");
            const allRadio = hoursBox.querySelector("input[name='ai-block-mode'][value='all']");
            // Si hay horas marcadas, no se puede pasar a "Todo el día" sin desmarcarlas antes (evita bloqueos de día completo por error).
            const updateAllLock = () => {
                const anyChecked = chipWrap.querySelectorAll("input:checked").length > 0;
                allRadio.disabled = anyChecked;
                allRadio.title = anyChecked ? "Desmarcá las horas seleccionadas para poder bloquear el día completo" : "";
            };
            hoursBox.querySelectorAll("input[name='ai-block-mode']").forEach((r) => r.addEventListener("change", () => { lastBlockMode = r.value; chipWrap.hidden = hoursBox.querySelector("input[name='ai-block-mode']:checked").value !== "hours"; }));
            chipWrap.querySelectorAll("input[type=checkbox]").forEach((cb) => cb.addEventListener("change", updateAllLock));
            updateAllLock();
        };
        const selectedHourRanges = () => {
            const picked = [...hoursBox.querySelectorAll(".ai-hour-chips input:checked")]
                .map((el) => { const [start, end] = el.value.split("|"); return { start, end }; })
                .sort((a, b) => toMin(a.start) - toMin(b.start));
            const merged = [];
            for (const r of picked) {
                const last = merged[merged.length - 1];
                if (last && toMin(r.start) <= toMin(last.end)) { if (toMin(r.end) > toMin(last.end)) last.end = r.end; }
                else merged.push({ ...r });
            }
            return merged;
        };
        dateInput.addEventListener("change", renderHourPicker);
        const renderDates = (rows) => {
            list.innerHTML = rows.length
                ? rows.map((row) => `<div class="ai-block-item"><div><strong>${esc(new Date(`${row.date}T12:00:00`).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" }))}</strong><span>${row.blockedHours && row.blockedHours.length ? esc(row.blockedHours.map((r) => `${fmt12(r.start)} a ${fmt12(r.end)}`).join(", ")) : "Todo el día"}</span>${row.reason ? `<span>${esc(row.reason)}</span>` : ""}</div><button type="button" data-unblock="${row.id}">Reabrir</button></div>`).join("")
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
            const mode = hoursBox.querySelector("input[name='ai-block-mode']:checked")?.value || "all";
            let blockedHours = null;
            if (mode === "hours") {
                blockedHours = selectedHourRanges();
                if (!blockedHours.length) { result.textContent = "Elegí al menos una hora o cambiá a \"Todo el día\""; return; }
            }
            try {
                const data = await api("/api/mensajes-view/ai-blocked-dates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: dateInput.value, reason: reasonInput.value, blockedHours }) });
                dateInput.value = ""; reasonInput.value = ""; lastBlockMode = "all"; renderHourPicker(); result.textContent = "Bloqueo guardado";
                renderDates(data.dates);
            } catch (error) { result.textContent = error.message || "No se pudo bloquear"; }
        });
        const activate = (button) => { modal.querySelectorAll("[data-settings-section]").forEach((item) => item.classList.toggle("is-active", item === button)); modal.querySelectorAll("[data-settings-content]").forEach((item) => { item.hidden = item.dataset.settingsContent !== button.dataset.settingsSection; }); };
        nav.querySelector('[data-settings-section="ai-agenda"]').addEventListener("click", (event) => activate(event.currentTarget));
    }
    // Mismos módulos que MODULES en configTransfer.service.js (= pestañas de Ajustes).
    // `keys` sirve para reconocer qué trae un archivo exportado por la versión anterior.
    const CONFIG_MODULES = [
        { id: "automation", label: "Respuestas automáticas", keys: ["messageSettings", "automationSettings"], detail: "tiempos de respuesta, activar automatizaciones, control de teléfonos, mensajes ignorados y plantilla de recordatorios" },
        { id: "assistant", label: "Asistente IA", keys: ["knowledge", "humanReviewRules", "administrativeSettings"], detail: "conocimiento de la clínica y revisión humana" },
        { id: "identities", label: "Vinculaciones", keys: ["patientIdentities"], detail: "vinculaciones paciente-chat activas" },
        { id: "provider", label: "Configuración IA", keys: ["providerSettings"], detail: "proveedor, modelo y clave" },
        { id: "services", label: "Servicios IA", keys: ["serviceSettings", "serviceAliases"], detail: "servicios habilitados, precios, horario propio, alias, horario general y pausas" },
        { id: "agenda", label: "Agenda IA", keys: ["blockedDates"], detail: "días bloqueados y topes diario y por hora" }
    ];
    async function enrichConfigTransfer() {
        const modal = document.getElementById("mensajes-settings-modal");
        const nav = modal?.querySelector(".mensajes-settings-nav");
        const content = modal?.querySelector(".mensajes-settings-content");
        if (!modal || modal.querySelector('[data-settings-section="config-transfer"]')) return;
        nav.insertAdjacentHTML("beforeend", '<button data-settings-section="config-transfer">Copia de configuración</button>');
        content.insertAdjacentHTML("beforeend", `<section data-settings-content="config-transfer" hidden>
            <h3>Copia de configuración</h3>
            <p>Exportá la configuración de la IA de este equipo a un archivo y cargala en otro. <strong>No</strong> incluye conversaciones ni mensajes.</p>
            <p>Módulos para exportar y borrar:</p>
            <div class="ai-weekday-checks" id="config-modules">${CONFIG_MODULES.map((m) => `<label title="${esc(m.detail)}"><input type="checkbox" value="${m.id}" checked> ${esc(m.label)}</label>`).join("")}</div>
            <p class="ai-help">${CONFIG_MODULES.map((m) => `<strong>${esc(m.label)}:</strong> ${esc(m.detail)}`).join("<br>")}</p>
            <p class="ai-help" style="color:var(--msg-warn-text,#b45309)">Con "Configuración IA" el archivo contiene la clave del proveedor IA. Guardalo en un lugar seguro y no lo subas a repositorios ni lo compartas.</p>
            <button id="config-export-btn" type="button">Exportar seleccionados</button>
            <hr>
            <h3>Importar</h3>
            <p>Elegí el archivo y después marcá qué módulos aplicar. Cada módulo importado reemplaza el de este equipo (Vinculaciones se suman a las existentes); los que no se importan no se tocan. Las citas ya agendadas no se tocan.</p>
            <input id="config-import-file" type="file" accept="application/json,.json" hidden>
            <button id="config-import-btn" type="button">Elegir archivo…</button>
            <div id="config-import-preview" hidden>
                <p><strong id="config-import-name"></strong></p>
                <div class="ai-weekday-checks" id="config-import-modules"></div>
                <div class="ai-settings-actions">
                    <button id="config-import-apply" type="button">Aplicar importación</button>
                    <button id="config-import-cancel" type="button" class="ai-secondary-btn">Cancelar</button>
                </div>
            </div>
            <hr>
            <h3>Borrar configuración</h3>
            <p>Vuelve a valores de fábrica los módulos seleccionados (los servicios quedan todos deshabilitados para la IA y la automatización queda apagada). Las conversaciones, mensajes y citas no se tocan. <strong>No se puede deshacer:</strong> exportá antes si querés conservarla.</p>
            <label>Para habilitar el botón, escribí BORRAR<input id="config-reset-confirm" type="text" autocomplete="off" placeholder="BORRAR"></label>
            <button id="config-reset-btn" type="button" class="identity-danger-button" disabled>Borrar configuración seleccionada</button>
            <div id="config-transfer-result" class="settings-state-card"></div>
        </section>`);
        const selectedModules = () => [...modal.querySelectorAll("#config-modules input:checked")].map((input) => input.value);
        const moduleLabels = (ids) => ids.map((id) => CONFIG_MODULES.find((m) => m.id === id)?.label || id).join(", ");
        modal.querySelector("#config-export-btn").addEventListener("click", async () => {
            const result = modal.querySelector("#config-transfer-result");
            const modules = selectedModules();
            if (!modules.length) { result.textContent = "Elegí al menos un módulo."; return; }
            result.textContent = "Generando archivo…";
            try {
                const cfg = await api(`/api/mensajes-view/config-export?modules=${encodeURIComponent(modules.join(","))}`);
                const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `clinica-config-${String(cfg.exportedAt || "").slice(0, 10) || "export"}.json`;
                document.body.appendChild(link); link.click(); link.remove();
                URL.revokeObjectURL(url);
                result.textContent = `Configuración exportada: ${moduleLabels(cfg.modules || modules)}.`;
            } catch (error) { result.textContent = error.message || "No se pudo exportar."; }
        });
        // Importar en dos pasos: elegir el archivo muestra qué módulos trae (los que no
        // trae quedan apagados), y recién "Aplicar importación" escribe.
        const fileInput = modal.querySelector("#config-import-file");
        const preview = modal.querySelector("#config-import-preview");
        const importChecks = modal.querySelector("#config-import-modules");
        let pendingPayload = null;
        const closePreview = () => { pendingPayload = null; preview.hidden = true; importChecks.innerHTML = ""; };
        modal.querySelector("#config-import-btn").addEventListener("click", () => fileInput.click());
        modal.querySelector("#config-import-cancel").addEventListener("click", closePreview);
        fileInput.addEventListener("change", async () => {
            const result = modal.querySelector("#config-transfer-result");
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = "";
            if (!file) return;
            closePreview();
            let payload;
            try { payload = JSON.parse(await file.text()); }
            catch { result.textContent = "El archivo no es un JSON válido."; return; }
            if (payload?.format !== "clinica-mensajes-config") { result.textContent = "El archivo no es una configuración de mensajes válida."; return; }
            // Archivos viejos no traen `modules`: se deduce por las claves presentes.
            const inFile = CONFIG_MODULES.filter((m) => (payload.modules || []).includes(m.id) || m.keys.some((key) => payload[key] !== undefined)).map((m) => m.id);
            if (!inFile.length) { result.textContent = "El archivo no trae ningún módulo de configuración."; return; }
            pendingPayload = payload;
            modal.querySelector("#config-import-name").textContent = `${file.name} — trae: ${moduleLabels(inFile)}`;
            importChecks.innerHTML = CONFIG_MODULES.map((m) => inFile.includes(m.id)
                ? `<label title="${esc(m.detail)}"><input type="checkbox" value="${m.id}" checked> ${esc(m.label)}</label>`
                : `<label title="No viene en el archivo" style="opacity:.45"><input type="checkbox" value="${m.id}" disabled> ${esc(m.label)} (no viene en el archivo)</label>`).join("");
            preview.hidden = false;
            result.textContent = "";
        });
        modal.querySelector("#config-import-apply").addEventListener("click", async () => {
            const result = modal.querySelector("#config-transfer-result");
            if (!pendingPayload) return;
            const toImport = [...importChecks.querySelectorAll("input:checked:not(:disabled)")].map((input) => input.value);
            if (!toImport.length) { result.textContent = "Marcá al menos un módulo para importar."; return; }
            if (!await askConfirm(`Se va a reemplazar la configuración de este equipo en: ${moduleLabels(toImport)}.${toImport.includes("identities") ? "\n\nLas vinculaciones solo sirven si es el mismo número de WhatsApp." : ""}\n\n¿Continuar?`)) return;
            const payload = pendingPayload;
            result.textContent = "Importando…";
            try {
                const data = await api("/api/mensajes-view/config-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, modules: toImport }) });
                const s = data.summary;
                result.textContent = `Configuración importada: ${moduleLabels(s.modules)} (${s.services} servicios, ${s.aliases} alias, ${s.blockedDates} días bloqueados, ${s.patientIdentities} vinculaciones). Recargando la vista…`;
                setTimeout(() => window.location.reload(), 1600);
            } catch (error) { result.textContent = error.message || "No se pudo importar."; }
        });
        // Doble confirmación: escribir BORRAR habilita el botón, y además askConfirm().
        const resetInput = modal.querySelector("#config-reset-confirm");
        const resetButton = modal.querySelector("#config-reset-btn");
        resetInput.addEventListener("input", () => { resetButton.disabled = resetInput.value.trim() !== "BORRAR"; });
        resetButton.addEventListener("click", async () => {
            const result = modal.querySelector("#config-transfer-result");
            const modules = selectedModules();
            if (!modules.length) { result.textContent = "Elegí al menos un módulo."; return; }
            if (resetInput.value.trim() !== "BORRAR") return;
            if (!await askConfirm(`¿Borrar definitivamente la configuración de: ${moduleLabels(modules)}?\n\nVuelve a valores de fábrica y no se puede deshacer.`)) return;
            result.textContent = "Borrando…";
            try {
                const data = await api("/api/mensajes-view/config-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modules, confirm: "BORRAR" }) });
                resetInput.value = ""; resetButton.disabled = true;
                result.textContent = `Configuración borrada: ${moduleLabels(data.summary.modules)}. Recargando la vista…`;
                setTimeout(() => window.location.reload(), 1600);
            } catch (error) { result.textContent = error.message || "No se pudo borrar."; }
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
        document.getElementById("mensajes-whatsapp-start").addEventListener("click", (event) => void (event.currentTarget.dataset.waAction === "stop" ? stopWhatsapp() : startWhatsapp()));
        document.getElementById("mensajes-whatsapp-recover").addEventListener("click", (event) => void recoverUnread(event));
        document.getElementById("mensajes-whatsapp-clear").addEventListener("click", () => void clearWhatsappSession());
        document.getElementById("mensajes-global-settings").addEventListener("click", async (event) => {
            const btn = event.currentTarget;
            if (btn.dataset.loading === "1") return;
            btn.dataset.loading = "1";
            try {
                await openGlobalSettings();
                // Modo venta: la IA solo confirma/cancela respuestas a recordatorios, así que
                // no se muestran Asistente IA, Servicios IA ni Agenda IA.
                const modoVenta = window.isModoVenta?.() === true;
                if (modoVenta) document.querySelector('#mensajes-settings-modal .mensajes-settings-nav [data-settings-section="ia"]')?.remove();
                // Las secciones son independientes: cargarlas en paralelo en vez de en cadena.
                await Promise.allSettled([
                    enrichPatientIdentitySettings(), enrichAiProviderSettings(), enrichAutomationBuffer(),
                    enrichReminderSettings(), enrichConfigTransfer(),
                    ...(modoVenta ? [] : [enrichAssistantKnowledge(), enrichHumanReviewSettings(), enrichAiServicesSettingsSimple(), enrichAiAgendaSettings(), ensurePhoneRules(), ensureIgnoredMessages()])
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
        const addSimButton = (group, id, label, cls, handler) => { const button = document.createElement("button"); button.id = id; button.type = "button"; if (cls) button.className = cls; button.textContent = label; group.appendChild(button); button.addEventListener("click", handler); return button; };
        const actionsDivider = document.getElementById("mensajes-actions-divider");
        actionsDivider.before(addSimButton(actionsGroup, "mensajes-send-reminders", "🔔 Recordatorios", "", () => void openReminderModal()));
        actionsDivider.before(addSimButton(actionsGroup, "mensajes-send-promos", "📣 Promociones", "", () => void openPromoModal().catch((error) => alert(error.message))));
        addSimButton(actionsGroup, "mensajes-delete-all", "🗑 Borrar todo", "is-danger", deleteAllConversations);
        // Menús "⋯" (barra y cabecera del chat): se cierran al elegir una opción o al hacer clic afuera.
        const closeMoreMenus = (event) => document.querySelectorAll("details.mensajes-more[open]").forEach((menu) => { if (!menu.contains(event.target) || event.target.closest(".mensajes-more-menu button")) menu.open = false; });
        document.addEventListener("click", closeMoreMenus);
        addSimButton(aiGroup, "mensajes-pause-ai", "Pausar IA", "sim-btn-ai-pause", (event) => void setGlobalAiMode(event.currentTarget.dataset.aiAction || "paused"));
        addSimButton(aiGroup, "mensajes-global-ai", "Pasar todo a IA", "sim-btn-ai-resume", () => void setGlobalAiMode("assistant"));
         document.getElementById("mensajes-send-reminders").addEventListener("click", () => setTimeout(() => void restoreActiveReminder(), 200));
         // La vista ya está montada y usable. Estas cargas no deben bloquear
         // la navegación ni la disponibilidad del simulador.
         void Promise.allSettled([loadConversations(), refreshConversationMeta({ force: true }), refreshGlobalAiStatus()]);
         const anyModalOpen = () => { const s = document.getElementById("mensajes-settings-modal"); const r = document.getElementById("mensajes-reminder-modal"); const p = document.getElementById("mensajes-promo-modal"); return Boolean((s && !s.hidden) || (r && !r.hidden) || (p && !p.hidden)); };
        chatPoll = setInterval(() => { if (deletingAll || pollBusy || anyModalOpen()) return; pollBusy = true; Promise.allSettled([loadConversations(), refreshConversationMeta(), refreshWhatsappStatus(), refreshGlobalAiStatus(), selectedId ? loadConversation(selectedId, { markRead: false, skipListRefresh: true }) : null]).finally(() => { pollBusy = false; }); }, 2000);
        void refreshWhatsappStatus();
        cleanup = () => { document.removeEventListener("click", closeMoreMenus); if (chatPoll) { clearInterval(chatPoll); chatPoll = null; } conversationLoadSeq++; ["mensajes-settings-modal", "mensajes-reminder-modal", "mensajes-promo-modal", "mensajes-busy-overlay"].forEach((id) => document.getElementById(id)?.remove()); selectedId = null; lastListSig = ""; lastChatSig = ""; pollBusy = false; deletingAll = false; allConversations = []; convListFilter = "all"; convSearchTerm = ""; patientNameByChat = new Map(); patientNamesFetchedAt = 0; aiWorkingConvIds = new Set(); cleanup = null; };
        window.__setViewCleanup(() => cleanup?.());
        window.__setViewLeaveGuard(() => !deletingAll);
    };
})();
