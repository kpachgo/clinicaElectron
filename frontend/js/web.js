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
        if (e.target && e.target.id === "btn-logout") {
            const ok = typeof window.showSystemConfirm === "function"
                ? await window.showSystemConfirm("Desea cerrar sesion?")
                : confirm("Desea cerrar sesion?");
            if (ok) {
                logout();
            }
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


document.addEventListener("DOMContentLoaded", () => {
    initTopbarEnhancements();
    if (isAuthenticated()) {
        setAppChromeVisible(true);

        applyMenuPermissions(); // FALTA ESTA LINEA

        
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
