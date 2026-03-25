/* =========================================================
   UI BASE (SIDEBAR, ACORDEONES, TEMA)
========================================================= */

// ---------- toggle sidebar ----------
const sidebar = document.querySelector(".sidebar");
const toggleBtn = document.getElementById("sidebar-toggle");
const overlay = document.getElementById("sidebar-overlay");
const topbarEl = document.querySelector(".topbar");

function setAppChromeVisible(visible) {
    if (topbarEl) {
        topbarEl.style.display = visible ? "" : "none";
    }

    if (!visible && overlay) {
        overlay.hidden = true;
        overlay.dataset.visible = "false";
    }
}

if (toggleBtn && sidebar) {
    const MOBILE_BREAK = 768;

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAK;
    }

    toggleBtn.addEventListener("click", () => {
        if (isMobile()) {
            const isOpen = sidebar.classList.toggle("open");
            overlay.hidden = !isOpen;
            toggleBtn.setAttribute("aria-expanded", isOpen);
        } else {
            const collapsed = sidebar.classList.toggle("collapsed");
            toggleBtn.setAttribute("aria-expanded", !collapsed);
        }
    });

    overlay?.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.hidden = true;
        toggleBtn.setAttribute("aria-expanded", "false");
    });

    window.addEventListener("resize", () => {
        if (!isMobile()) {
            sidebar.classList.remove("open");
            overlay.hidden = true;
        }
    });
}

// ================================
// MODO OSCURO / CLARO
// ================================
const themeBtn = document.getElementById("theme-toggle");
const THEME_STORAGE_KEY = "theme";
const DEFAULT_THEME = "light";
const AVAILABLE_THEMES = ["light", "dark", "vampire", "princess"];
const DARK_LIKE_THEMES = new Set(["dark", "vampire"]);

function normalizeTheme(theme) {
    const t = String(theme || "").trim().toLowerCase();
    if (!t) return DEFAULT_THEME;
    return AVAILABLE_THEMES.includes(t) ? t : DEFAULT_THEME;
}

function getNextTheme(theme) {
    const idx = AVAILABLE_THEMES.indexOf(normalizeTheme(theme));
    if (idx < 0) return DEFAULT_THEME;
    return AVAILABLE_THEMES[(idx + 1) % AVAILABLE_THEMES.length];
}

function getThemeLabel(theme) {
    const t = normalizeTheme(theme);
    if (t === "dark") return "Oscuro";
    if (t === "vampire") return "Vampiro (VS Code)";
    if (t === "princess") return "Princesa";
    return "Claro";
}

function refreshThemeButtonA11y(theme) {
    if (!themeBtn) return;
    const label = `Tema actual: ${getThemeLabel(theme)}. Click para cambiar tema.`;
    themeBtn.setAttribute("aria-label", label);
    themeBtn.setAttribute("title", label);
}

function applyTheme(theme, { persist = true } = {}) {
    const normalizedTheme = normalizeTheme(theme);

    document.body.dataset.theme = normalizedTheme;
    // Compatibilidad retroactiva: muchas vistas aun dependen de selectores `.dark-mode`.
    document.body.classList.toggle("dark-mode", DARK_LIKE_THEMES.has(normalizedTheme));
    refreshThemeButtonA11y(normalizedTheme);

    if (persist) {
        localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    }
}

const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(storedTheme || DEFAULT_THEME, { persist: false });

themeBtn?.addEventListener("click", () => {
    const currentTheme = normalizeTheme(document.body.dataset.theme || localStorage.getItem(THEME_STORAGE_KEY));
    const nextTheme = getNextTheme(currentTheme);
    applyTheme(nextTheme);
});

/* =========================================================
   AUTENTICACION
========================================================= */
const ROLE_VIEWS = {
    Administrador: ["Agenda", "Paciente", "En Cola", "Doctores", "Servicios", "Cobro"],
    Recepcion: ["Agenda", "Paciente", "En Cola", "Servicios", "Cobro"],
    Doctor: ["Paciente", "En Cola", "Doctores"],
    Asistente: ["Paciente", "En Cola"]
};
const ROLE_DEFAULT_VIEW = {
    Administrador: "Agenda",
    Recepcion: "Agenda",
    Doctor: "Paciente",
    Asistente: "Paciente"
}
function getDefaultViewByRole() {
    const user = getCurrentUser();
    if (!user || !user.rol) return null;

    return ROLE_DEFAULT_VIEW[user.rol] || null;
}
function setToken(token) {
    localStorage.setItem("token", token);
}

function getToken() {
    return localStorage.getItem("token");
}

function clearToken() {
    localStorage.removeItem("token");
}

function isAuthenticated() {
   return !!getToken() && !!getCurrentUser();
}

function getCurrentUser() {
    const raw = sessionStorage.getItem("user");
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error("Sesion de usuario invalida:", err);
        sessionStorage.removeItem("user");
        return null;
    }
}
// =========================================
// FETCH GLOBAL CON JWT
// =========================================
const originalFetch = window.fetch;

function normalizeFetchMethod(url, requestOptions) {
    const fromOptions = requestOptions?.method;
    const fromRequest = url && typeof url === "object" ? url.method : null;
    return String(fromOptions || fromRequest || "GET").toUpperCase();
}

function normalizeFetchUrl(url) {
    if (typeof url === "string") return url;
    if (url && typeof url === "object" && typeof url.url === "string") return url.url;
    return "";
}

function shouldPlayMutationSound(method, requestUrl) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "").toUpperCase())) {
        return false;
    }

    const url = String(requestUrl || "");
    if (url.includes("/api/auth/login")) return false;
    return true;
}

function playMutationSoundByMethod(method) {
    if (typeof window.playUiSound !== "function") return;
    const m = String(method || "").toUpperCase();
    if (m === "DELETE") {
        window.playUiSound("trash", { minIntervalMs: 220 });
        return;
    }
    window.playUiSound("success", { minIntervalMs: 160 });
}

function maybePlayMutationSound(response, method, requestUrl) {
    if (!response?.ok) return;
    if (!shouldPlayMutationSound(method, requestUrl)) return;

    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
        playMutationSoundByMethod(method);
        return;
    }

    response.clone().json()
        .then((body) => {
            if (body && Object.prototype.hasOwnProperty.call(body, "ok") && body.ok === false) {
                return;
            }
            playMutationSoundByMethod(method);
        })
        .catch(() => {
            playMutationSoundByMethod(method);
        });
}

window.fetch = function (url, options = {}) {
    const headers = new Headers(options.headers || {});

    const token = getToken();
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", "Bearer " + token);
    }

    const requestOptions = { ...options, headers };
    const method = normalizeFetchMethod(url, requestOptions);
    const requestUrl = normalizeFetchUrl(url);

    return originalFetch(url, requestOptions)
        .then((response) => {
            maybePlayMutationSound(response, method, requestUrl);
            if (!response.ok && typeof window.notifyServerHttpError === "function") {
                window.notifyServerHttpError(response.status, requestUrl);
            }
            return response;
        })
        .catch((err) => {
            if (err && err.name !== "AbortError" && typeof window.notifyConnectionError === "function") {
                window.notifyConnectionError("Conexion perdida con el servidor.");
            }
            throw err;
        });
};
function canAccessView(viewName) {
    const user = getCurrentUser();
    if (!user || !user.rol) return false;

    const allowedViews = ROLE_VIEWS[user.rol] || [];
    return allowedViews.includes(viewName);
}

/* =========================================================
   ALERTA SUSCRIPCION (TOPBAR)
========================================================= */
const LICENSE_WARNING_STORAGE_PREFIX = "license_warning_seen::";
const LICENSE_WARNING_DEFAULT_WINDOW_DAYS = 3;
let licenseBellGlobalEventsBound = false;
let lastLicenseWarningStatus = null;
let licenseWarningRefreshSeq = 0;
let licenseBellRefsWarned = false;

function isTruthyFlag(rawValue) {
    if (rawValue === true || rawValue === 1) return true;
    const normalized = String(rawValue || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isLicenseDebugEnabled() {
    try {
        const fromWindow = typeof window !== "undefined" ? window.CLINICA_DEBUG_LICENSE : "";
        const fromStorage = localStorage.getItem("CLINICA_DEBUG_LICENSE");
        const fromQuery = new URLSearchParams(window.location.search || "").get("CLINICA_DEBUG_LICENSE");
        return isTruthyFlag(fromWindow || fromStorage || fromQuery);
    } catch {
        return false;
    }
}

function logLicenseDebug(label, payload) {
    if (!isLicenseDebugEnabled()) return;
    if (payload !== undefined) {
        console.info(`[licencia-ui] ${label}`, payload);
        return;
    }
    console.info(`[licencia-ui] ${label}`);
}

function getLicenseBellRefs() {
    const panel = document.getElementById("license-bell-panel");
    const titleById = document.getElementById("license-bell-title");
    const titleByClass = panel ? panel.querySelector(".license-bell-title") : null;

    return {
        wrap: document.querySelector(".license-bell-wrap"),
        btn: document.getElementById("license-bell-btn"),
        badge: document.getElementById("license-bell-badge"),
        panel,
        title: titleById || titleByClass || document.querySelector("#license-bell-panel .license-bell-title"),
        message: document.getElementById("license-bell-message"),
        meta: document.getElementById("license-bell-meta")
    };
}

function getMissingLicenseBellRefs(refs) {
    const missing = [];
    if (!refs.wrap) missing.push("wrap(.license-bell-wrap)");
    if (!refs.btn) missing.push("btn(#license-bell-btn)");
    if (!refs.badge) missing.push("badge(#license-bell-badge)");
    if (!refs.panel) missing.push("panel(#license-bell-panel)");
    if (!refs.title) missing.push("title(#license-bell-title|.license-bell-title)");
    if (!refs.message) missing.push("message(#license-bell-message)");
    if (!refs.meta) missing.push("meta(#license-bell-meta)");
    return missing;
}

function warnMissingLicenseBellRefs(missing) {
    if (missing.length === 0 || licenseBellRefsWarned) return;
    licenseBellRefsWarned = true;
    console.warn(`[licencia-ui] No se encontraron elementos de campana: ${missing.join(", ")}`);
}

function closeLicenseBellPanel() {
    const { btn, panel } = getLicenseBellRefs();
    if (!btn || !panel) return;
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
}

function bindLicenseBellEvents() {
    const { btn, panel, wrap } = getLicenseBellRefs();
    if (!btn || !panel || !wrap) return;

    if (btn.dataset.binded !== "true") {
        btn.dataset.binded = "true";
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const shouldOpen = panel.hidden === true;
            if (shouldOpen) {
                await refreshLicenseWarning({ force: false, showPopup: false });
            }
            panel.hidden = !shouldOpen;
            btn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        });
    }

    if (licenseBellGlobalEventsBound) return;
    licenseBellGlobalEventsBound = true;

    document.addEventListener("click", (e) => {
        const refs = getLicenseBellRefs();
        if (!refs.panel || refs.panel.hidden) return;
        const clickInside = refs.wrap && refs.wrap.contains(e.target);
        if (!clickInside) {
            closeLicenseBellPanel();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeLicenseBellPanel();
        }
    });
}

function parseDiasRestantes(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === "") return null;
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : null;
}

function normalizeLicenseUsage(rawUsage) {
    const usage = rawUsage && typeof rawUsage === "object" ? rawUsage : {};
    const diasRestantes = parseDiasRestantes(usage.diasRestantes ?? usage.dias_restantes);

    const warningWindowRaw = usage.warningWindowDays ?? usage.warning_window_days;
    const warningWindowDays = Number.isFinite(Number(warningWindowRaw))
        ? Number(warningWindowRaw)
        : LICENSE_WARNING_DEFAULT_WINDOW_DAYS;

    const fechaVencimientoRaw = usage.fechaVencimiento ?? usage.fecha_vencimiento ?? null;
    const fechaVencimiento = fechaVencimientoRaw === null || fechaVencimientoRaw === undefined
        ? null
        : String(fechaVencimientoRaw).trim() || null;

    const mensajeAvisoRaw = usage.mensajeAviso ?? usage.mensaje_aviso ?? null;
    const mensajeAviso = mensajeAvisoRaw === null || mensajeAvisoRaw === undefined
        ? null
        : String(mensajeAvisoRaw).trim() || null;

    const proximaRaw = usage.proximaAVencer ?? usage.proxima_a_vencer;
    const proximaAVencer = isTruthyFlag(proximaRaw);

    return {
        ...usage,
        fechaVencimiento,
        diasRestantes,
        warningWindowDays,
        proximaAVencer,
        mensajeAviso
    };
}

function normalizeLicenseStatusData(statusData) {
    const status = statusData && typeof statusData === "object" ? statusData : {};
    return {
        ...status,
        usage: normalizeLicenseUsage(status.usage)
    };
}

function formatVencimientoText(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) return null;
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString("es-GT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function setLicenseBellMetaLines(metaEl, lines) {
    if (!metaEl) return;
    metaEl.innerHTML = "";
    (lines || [])
        .filter(Boolean)
        .forEach((line) => {
            const row = document.createElement("div");
            row.textContent = line;
            metaEl.appendChild(row);
        });
}

function updateLicenseBellUi(statusData) {
    const refs = getLicenseBellRefs();
    const missingRefs = getMissingLicenseBellRefs(refs);
    if (missingRefs.length > 0) {
        warnMissingLicenseBellRefs(missingRefs);
        return false;
    }

    const normalizedStatus = normalizeLicenseStatusData(statusData);
    const usage = normalizedStatus.usage;
    const diasRestantes = usage.diasRestantes;
    const fechaVencimientoRaw = usage.fechaVencimiento || null;
    const fechaVencimientoTxt = formatVencimientoText(fechaVencimientoRaw);
    const warningWindowDays = usage.warningWindowDays;
    const proximaFromBackend = usage.proximaAVencer === true;
    const proximaByRange = (
        diasRestantes !== null &&
        diasRestantes >= 0 &&
        diasRestantes <= warningWindowDays
    );
    const proximaAVencer = proximaFromBackend || proximaByRange;

    let title = "Suscripcion";
    let message = "Sin alertas por el momento.";
    const metaLines = [];

    if (proximaAVencer) {
        title = "Suscripcion proxima a vencer";
        message = String(usage.mensajeAviso || "Su suscripcion esta proxima a vencer.");
        if (diasRestantes !== null) {
            metaLines.push(`Dias restantes: ${diasRestantes}`);
        }
        if (fechaVencimientoTxt) {
            metaLines.push(`Vence: ${fechaVencimientoTxt}`);
        }
        metaLines.push(`Ventana de aviso: ${warningWindowDays} dias`);
    } else if (diasRestantes !== null && diasRestantes < 0) {
        title = "Suscripcion vencida";
        message = "La suscripcion ya vencio. Renueve para mantener habilitado el sistema.";
        if (fechaVencimientoTxt) {
            metaLines.push(`Vencio: ${fechaVencimientoTxt}`);
        }
    } else if (fechaVencimientoTxt) {
        message = `Suscripcion activa. Fecha de vencimiento: ${fechaVencimientoTxt}.`;
        if (diasRestantes !== null) {
            metaLines.push(`Dias restantes: ${diasRestantes}`);
        }
    }

    refs.title.textContent = title;
    refs.message.textContent = message;
    setLicenseBellMetaLines(refs.meta, metaLines);
    refs.badge.hidden = !proximaAVencer;
    refs.btn.classList.toggle("has-warning", proximaAVencer);
    logLicenseDebug("campana renderizada", {
        proximaAVencer,
        diasRestantes,
        warningWindowDays,
        fechaVencimiento: fechaVencimientoRaw,
        mensajeAviso: usage.mensajeAviso
    });
    return true;
}

function updateLicenseBellUiUnavailable() {
    const refs = getLicenseBellRefs();
    const missingRefs = getMissingLicenseBellRefs(refs);
    if (missingRefs.length > 0) {
        warnMissingLicenseBellRefs(missingRefs);
        return false;
    }

    refs.title.textContent = "Suscripcion";
    refs.message.textContent = "No se pudo consultar el estado de suscripcion.";
    setLicenseBellMetaLines(refs.meta, ["Intente de nuevo en unos segundos."]);
    refs.badge.hidden = true;
    refs.btn.classList.remove("has-warning");
    logLicenseDebug("campana en estado no disponible");
    return true;
}

function getTodayLocalKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function buildWarningSeenStorageKey(codigoLicencia) {
    const code = String(codigoLicencia || "sin-codigo").trim() || "sin-codigo";
    return `${LICENSE_WARNING_STORAGE_PREFIX}${code}::${getTodayLocalKey()}`;
}

function maybeShowLicenseWarningPopup(statusData) {
    const normalizedStatus = normalizeLicenseStatusData(statusData);
    const usage = normalizedStatus.usage;
    if (usage.proximaAVencer !== true) return;

    const codigoRef = String(normalizedStatus?.codigoLicenciaMasked || "sin-codigo").trim() || "sin-codigo";
    const storageKey = buildWarningSeenStorageKey(codigoRef);
    const alreadyShown = localStorage.getItem(storageKey) === "1";
    if (alreadyShown) return;

    localStorage.setItem(storageKey, "1");
    const msg = String(usage.mensajeAviso || "Su suscripcion esta proxima a vencer.");
    if (typeof window.showSystemMessage === "function") {
        window.showSystemMessage(msg, { title: "Recordatorio de suscripcion", type: "warning" });
    } else {
        alert(msg);
    }
}

async function refreshLicenseWarning(options = {}) {
    const { force = false, showPopup = false } = options;
    bindLicenseBellEvents();
    const refreshSeq = ++licenseWarningRefreshSeq;

    const params = new URLSearchParams();
    if (force) params.set("force", "1");
    params.set("_ts", String(Date.now()));
    const query = `?${params.toString()}`;
    try {
        const res = await fetch(`/api/licencia/estado${query}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || data?.ok !== true || !data?.data) {
            if (refreshSeq !== licenseWarningRefreshSeq) return null;
            if (lastLicenseWarningStatus) {
                updateLicenseBellUi(lastLicenseWarningStatus);
            } else {
                updateLicenseBellUiUnavailable();
            }
            return null;
        }

        const statusData = normalizeLicenseStatusData(data.data);
        logLicenseDebug("payload /api/licencia/estado", statusData);

        if (refreshSeq !== licenseWarningRefreshSeq) return null;
        const rendered = updateLicenseBellUi(statusData);
        if (rendered) {
            lastLicenseWarningStatus = statusData;
        } else if (lastLicenseWarningStatus) {
            updateLicenseBellUi(lastLicenseWarningStatus);
        }

        if (showPopup) {
            maybeShowLicenseWarningPopup(statusData);
        }
        return statusData;
    } catch (err) {
        console.error(err);
        if (refreshSeq !== licenseWarningRefreshSeq) return null;
        if (lastLicenseWarningStatus) {
            updateLicenseBellUi(lastLicenseWarningStatus);
        } else {
            updateLicenseBellUiUnavailable();
        }
        return null;
    }
}

function resetLicenseWarningUi() {
    lastLicenseWarningStatus = null;
    updateLicenseBellUi(null);
    closeLicenseBellPanel();
}

/* =========================================================
   USER INFO (TOPBAR)
========================================================= */

function renderTopUser() {
    const user = getCurrentUser();
    if (!user) return;

    const nameEl = document.getElementById("top-user-name");
    const emailEl = document.getElementById("top-user-email");

    if (nameEl) nameEl.textContent = user?.nombre ?? "Usuario";
    if (emailEl) emailEl.textContent = user?.correo ?? "";

}
function clearTopUser() {
    const nameEl = document.getElementById("top-user-name");
    const emailEl = document.getElementById("top-user-email");

    if (nameEl) nameEl.textContent = "";
    if (emailEl) emailEl.textContent = "";
}

/* =========================================================
   LOGOUT
========================================================= */

function logout() {
    clearToken();
    sessionStorage.removeItem("user");

    setAppChromeVisible(false);
    clearTopUser();
    resetLicenseWarningUi();
    mountLogin();
}


/* =========================================================
   SPA - CARGA DE VISTAS
========================================================= */

const content = document.querySelector(".content");
window.currentView = null;
window.__currentViewCleanup = null;
window.__currentViewLeaveGuard = null;

async function runSpaViewTransition(renderFn) {
    if (typeof renderFn !== "function") return;
    if (typeof window.__animateSpaTransition === "function") {
        await window.__animateSpaTransition(renderFn, { host: content });
        return;
    }
    await Promise.resolve(renderFn());
}

function syncActiveAccordion(viewName) {
    document.querySelectorAll(".accordion").forEach((btn) => {
        const name = btn.querySelector(".label")?.innerText.trim();
        btn.classList.toggle("active", name === viewName);
    });
}

function runCurrentViewCleanup() {
    if (typeof window.__currentViewCleanup === "function") {
        try {
            window.__currentViewCleanup();
        } catch (err) {
            console.error("Cleanup error:", err);
        }
    }
    window.__currentViewCleanup = null;
    window.__currentViewLeaveGuard = null;
}

window.__setViewCleanup = function (fn) {
    window.__currentViewCleanup = typeof fn === "function" ? fn : null;
};
window.__setViewLeaveGuard = function (fn) {
    window.__currentViewLeaveGuard = typeof fn === "function" ? fn : null;
};
async function canLeaveCurrentView() {
    if (typeof window.__currentViewLeaveGuard !== "function") return true;
    try {
        const result = window.__currentViewLeaveGuard();
        if (result && typeof result.then === "function") {
            return (await result) !== false;
        }
        return result !== false;
    } catch (err) {
        console.error("Leave guard error:", err);
        return true;
    }
}
function initTopbarEnhancements() {
    const topbar = document.querySelector(".topbar");
    const scrollHost = document.querySelector(".content");
    if (!topbar || !scrollHost) return;

    const syncTopbarShadow = () => {
        topbar.classList.toggle("is-scrolled", scrollHost.scrollTop > 4);
    };

    if (!scrollHost.dataset.topbarScrollBound) {
        scrollHost.dataset.topbarScrollBound = "true";
        scrollHost.addEventListener("scroll", syncTopbarShadow, { passive: true });
    }

    syncTopbarShadow();
}

async function loadView(name) {
    if (window.currentView === name) return;
    if (!isAuthenticated()) {
        mountLogin();
        return;
    }

    if (!canAccessView(name)) {
        alert("No tiene permisos para acceder a esta vista");
        return;
    }
    if (!(await canLeaveCurrentView())) return;

    setAppChromeVisible(true);
    runCurrentViewCleanup();
    window.currentView = name;
    syncActiveAccordion(name);

    await runSpaViewTransition(() => {
        switch (name) {
            case "Agenda":
                window.__mountAgenda && window.__mountAgenda();
                break;
            case "Paciente":
                window.__mountPaciente && window.__mountPaciente();
                break;
            case "En Cola":
                window.__mountEnCola && window.__mountEnCola();
                break;
            case "Doctores":
                window.__mountDoctor && window.__mountDoctor();
                break;
            case "Servicios":
                window.__mountServicios && window.__mountServicios();
                break;
            case "Cobro":
                window.__mountCobro && window.__mountCobro();
                break;
        }
    });
    renderTopUser();
    initTopbarEnhancements();
}

// ---------- menu lateral ----------
function applyMenuPermissions() {
    document.querySelectorAll(".accordion").forEach(btn => {
        const name = btn.querySelector(".label")?.innerText.trim();

        if (!canAccessView(name)) {
            btn.style.display = "none";
        } else {
            btn.style.display = "";

            // BLINDAJE
            if (btn.dataset.binded === "true") return;
            btn.dataset.binded = "true";

            btn.addEventListener("click", () => {
                if (window.currentView !== name && typeof window.playUiSound === "function") {
                    window.playUiSound("tab", { minIntervalMs: 60 });
                }
                loadView(name);
            });
        }
    });
}


/* =========================================================
   LOGIN VIEW
========================================================= */

function mountLogin() {
    runCurrentViewCleanup();
    window.currentView = null;
    syncActiveAccordion(null);
    setAppChromeVisible(false);

    const renderLogin = () => {
        if (window.__mountLogin) {
            window.__mountLogin();
        } else {
            content.innerHTML = "<p>Error: vista login no encontrada</p>";
        }
    };

    if (typeof window.__animateSpaTransition === "function") {
        window.__animateSpaTransition(renderLogin, { host: content });
        return;
    }
    renderLogin();
}

/* =========================================================
   EVENTOS GLOBALES
========================================================= */

if (!document.body.dataset.logoutBinded) {
    document.body.dataset.logoutBinded = "true";

    document.addEventListener("click", async (e) => {
        const logoutBtn = e.target?.closest?.("#btn-logout");
        if (!logoutBtn) return;

        const ok = typeof window.showSystemConfirm === "function"
            ? await window.showSystemConfirm("Desea cerrar sesion?")
            : confirm("Desea cerrar sesion?");
        if (ok) {
            logout();
        }
    });
}

/* =========================================================
   ARRANQUE DEL SISTEMA
========================================================= */
window.renderTopUser = renderTopUser;
window.getDefaultViewByRole = getDefaultViewByRole;
window.loadView = loadView;
window.applyMenuPermissions = applyMenuPermissions;
window.__setAppChromeVisible = setAppChromeVisible;
window.__applyTheme = applyTheme;
window.refreshLicenseWarning = refreshLicenseWarning;


document.addEventListener("DOMContentLoaded", () => {
    initTopbarEnhancements();
    bindLicenseBellEvents();
    if (isAuthenticated()) {
        setAppChromeVisible(true);

        applyMenuPermissions(); // FALTA ESTA LINEA

        void refreshLicenseWarning({ force: false, showPopup: true });

        
        const defaultView = getDefaultViewByRole();
        if (defaultView) {
    loadView(defaultView);
}
    } else {
        // Si quedo token sin usuario (sessionStorage se pierde al cerrar ventana),
        // limpiar sesion incompleta para forzar login limpio.
        if (getToken() && !getCurrentUser()) {
            clearToken();
        }
        mountLogin();
    }
});
