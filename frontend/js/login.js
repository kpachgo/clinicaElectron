// js/login.js
(function () {
  let loginMountSeq = 0;
  let loginStatusController = null;
  const DB_CONFIG_GATE_PASSWORD = "D@nielito100pre";

  function abortLoginStatusRequest() {
    if (!loginStatusController) return;
    try {
      loginStatusController.abort();
    } catch {
      // ignore abort failure
    }
    loginStatusController = null;
  }

  function isShortcutOpenRegister(e) {
    const isSpace = e.code === "Space" || e.key === " ";
    return e.ctrlKey && e.shiftKey && isSpace;
  }

  function isShortcutOpenDbConfig(e) {
    return e.ctrlKey && e.shiftKey && String(e.key || "").toLowerCase() === "c";
  }

  function renderIcon(name, className) {
    const registry = window.__uiIcons;
    if (!registry || typeof registry.get !== "function") return "";
    return registry.get(name, { className: className || "ui-toolbar-icon" });
  }

  function sanitizeText(value, fallback = "") {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function formatMaskedCode(maskedCode) {
    const raw = sanitizeText(maskedCode);
    return raw ? raw : "No configurado";
  }

  function isAbortError(err) {
    return String(err?.name || "") === "AbortError";
  }

  async function readJsonResponse(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchDbConfigStatus() {
    const res = await fetch(`/api/configuracion-db/estado?_ts=${Date.now()}`, {
      cache: "no-store"
    });
    const data = await readJsonResponse(res);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || "No se pudo leer configuracion");
    }
    return data.data || {};
  }

  function closeDbConfigModal() {
    const current = document.querySelector(".db-config-overlay");
    if (current) current.remove();
  }

  function attachDbConfigShortcut() {
    if (window.__loginDbConfigShortcutHandler) {
      document.removeEventListener("keydown", window.__loginDbConfigShortcutHandler, true);
    }

    window.__loginDbConfigShortcutHandler = (e) => {
      if (!isShortcutOpenDbConfig(e)) return;
      e.preventDefault();
      void openDbConfigGateModal();
    };
    document.addEventListener("keydown", window.__loginDbConfigShortcutHandler, true);
  }

  function detachDbConfigShortcut() {
    if (!window.__loginDbConfigShortcutHandler) return;
    document.removeEventListener("keydown", window.__loginDbConfigShortcutHandler, true);
    window.__loginDbConfigShortcutHandler = null;
  }

  function setDbConfigFeedback(modal, type, message) {
    const feedback = modal.querySelector("#db-config-feedback");
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.className = `db-config-feedback ${type === "ok" ? "is-ok" : "is-error"}`;
    feedback.hidden = !message;
  }

  function openDbConfigGateModal() {
    closeDbConfigModal();

    const modal = document.createElement("div");
    modal.className = "db-config-overlay";
    modal.innerHTML = `
      <div class="db-config-modal db-config-gate-modal" role="dialog" aria-modal="true" aria-labelledby="db-config-gate-title">
        <div class="db-config-header">
          <div>
            <h2 id="db-config-gate-title">Acceso de mantenimiento</h2>
            <p>Ingrese la contrasena para cambiar servidor.</p>
          </div>
          <button id="db-config-gate-close" class="db-config-close" type="button" aria-label="Cerrar">
            ${renderIcon("x-mark", "ui-toolbar-icon")}
          </button>
        </div>
        <div class="db-config-body">
          <div class="login-field db-config-field-full">
            <label for="db-config-gate-password">Contrasena</label>
            <input class="ui-control" id="db-config-gate-password" type="password" autocomplete="off">
          </div>
          <div class="db-config-actions">
            <button id="db-config-gate-cancel" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
              ${renderIcon("x-mark", "ui-toolbar-icon")}
              <span>Cancelar</span>
            </button>
            <button id="db-config-gate-submit" class="btn-login ui-toolbar-btn is-primary" type="button">
              ${renderIcon("key", "ui-toolbar-icon")}
              <span>Continuar</span>
            </button>
          </div>
          <div id="db-config-feedback" class="db-config-feedback" hidden></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const input = modal.querySelector("#db-config-gate-password");
    const close = () => closeDbConfigModal();
    const submit = () => {
      const password = String(input?.value || "");
      if (password !== DB_CONFIG_GATE_PASSWORD) {
        setDbConfigFeedback(modal, "error", "Contrasena incorrecta");
        input?.focus();
        input?.select();
        return;
      }
      closeDbConfigModal();
      void openDbConfigModal(password);
    };

    modal.querySelector("#db-config-gate-close")?.addEventListener("click", close);
    modal.querySelector("#db-config-gate-cancel")?.addEventListener("click", close);
    modal.querySelector("#db-config-gate-submit")?.addEventListener("click", submit);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    setTimeout(() => input?.focus(), 50);
  }

  function setOptionalConnectionValue(connection, key, value) {
    const text = String(value || "").trim();
    if (text) connection[key] = text;
  }

  function getDbConnectionPayload(modal) {
    const connection = {};
    const passwordValue = String(modal.querySelector("#db-config-password")?.value || "");
    const portValue = String(modal.querySelector("#db-config-port")?.value || "").trim();
    const sslValue = String(modal.querySelector("#db-config-ssl")?.value || "");

    setOptionalConnectionValue(connection, "host", modal.querySelector("#db-config-host")?.value);
    setOptionalConnectionValue(connection, "user", modal.querySelector("#db-config-user")?.value);
    setOptionalConnectionValue(connection, "database", modal.querySelector("#db-config-database")?.value);

    if (portValue) {
      connection.port = Number(portValue);
    }

    if (passwordValue) {
      connection.password = passwordValue;
    }

    if (sslValue === "on") {
      connection.ssl = true;
    } else if (sslValue === "off") {
      connection.ssl = false;
    }

    return {
      connection
    };
  }

  async function waitForBackendAfterRestart(timeoutMs = 60000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const res = await fetch(`/health?_ts=${Date.now()}`, {
          cache: "no-store"
        });
        if (res.ok) return true;
      } catch {
        // Backend can be down while Electron restarts it.
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return false;
  }

  function renderDbConfigForm(modal, status, sessionToken) {
    const body = modal.querySelector(".db-config-body");
    const connection = status?.connection || {};
    body.innerHTML = `
      <div class="db-config-summary">
        <span><strong>Origen:</strong> ${escapeHtml(status?.displaySource || status?.source || "env")}</span>
        <span><strong>Protegida:</strong> ${status?.protectedConfig ? "si" : "no"}</span>
        ${status?.configStatus === "invalid" ? `<span><strong>Estado:</strong> ${escapeHtml(status?.configMessage || "configuracion danada")}</span>` : ""}
        <span><strong>Host:</strong> ${connection.hasHost ? "**********" : "no configurado"}</span>
        <span><strong>Puerto:</strong> ${connection.hasPort ? "**********" : "no configurado"}</span>
        <span><strong>Usuario:</strong> ${connection.hasUser ? "**********" : "no configurado"}</span>
        <span><strong>Base de datos:</strong> ${connection.hasDatabase ? "**********" : "no configurada"}</span>
        <span><strong>Contrasena:</strong> ${connection.hasPassword ? "**********" : "no configurada"}</span>
      </div>

      <div class="db-config-grid">
        <div class="login-field">
          <label for="db-config-host">Host</label>
          <input class="ui-control" id="db-config-host" type="password" placeholder="${connection.hasHost ? "**********" : "Nuevo host"}">
        </div>
        <div class="login-field">
          <label for="db-config-port">Puerto</label>
          <input class="ui-control" id="db-config-port" type="password" inputmode="numeric" placeholder="${connection.hasPort ? "**********" : "3306"}">
        </div>
        <div class="login-field">
          <label for="db-config-user">Usuario</label>
          <input class="ui-control" id="db-config-user" type="password" placeholder="${connection.hasUser ? "**********" : "Usuario"}">
        </div>
        <div class="login-field">
          <label for="db-config-password">Contrasena</label>
          <input class="ui-control" id="db-config-password" type="password" placeholder="${connection.hasPassword ? "**********" : "Contrasena"}">
        </div>
        <div class="login-field db-config-field-full">
          <label for="db-config-database">Base de datos</label>
          <input class="ui-control" id="db-config-database" type="password" placeholder="${connection.hasDatabase ? "**********" : "Base de datos"}">
        </div>
        <div class="login-field db-config-field-full">
          <label for="db-config-ssl">SSL</label>
          <select class="ui-control" id="db-config-ssl">
            <option value="">Mantener configuracion actual</option>
            <option value="on">Activar SSL</option>
            <option value="off">Desactivar SSL</option>
          </select>
        </div>
      </div>

      <div class="db-config-actions">
        <button id="db-config-test" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
          ${renderIcon("shield-check", "ui-toolbar-icon")}
          <span>Probar conexion</span>
        </button>
        <button id="db-config-save" class="btn-login ui-toolbar-btn is-primary" type="button">
          ${renderIcon("arrow-path", "ui-toolbar-icon")}
          <span>Guardar y reiniciar</span>
        </button>
      </div>
      <div id="db-config-feedback" class="db-config-feedback" hidden></div>
    `;

    const btnTest = modal.querySelector("#db-config-test");
    const btnSave = modal.querySelector("#db-config-save");

    btnTest.addEventListener("click", async () => {
      btnTest.disabled = true;
      btnSave.disabled = true;
      setDbConfigFeedback(modal, "ok", "Probando conexion...");
      try {
        const res = await fetch("/api/configuracion-db/probar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-DB-Config-Token": sessionToken
          },
          body: JSON.stringify(getDbConnectionPayload(modal))
        });
        const data = await readJsonResponse(res);
        if (!res.ok || !data?.ok) {
          setDbConfigFeedback(modal, "error", data?.message || "No se pudo conectar");
          return;
        }
        setDbConfigFeedback(modal, "ok", data.message || "Conexion correcta");
      } catch (err) {
        console.error(err);
        setDbConfigFeedback(modal, "error", "No se pudo probar la conexion");
      } finally {
        btnTest.disabled = false;
        btnSave.disabled = false;
      }
    });

    btnSave.addEventListener("click", async () => {
      btnTest.disabled = true;
      btnSave.disabled = true;
      setDbConfigFeedback(modal, "ok", "Guardando configuracion...");
      try {
        const saveRes = await fetch("/api/configuracion-db/guardar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-DB-Config-Token": sessionToken
          },
          body: JSON.stringify(getDbConnectionPayload(modal))
        });
        const saveData = await readJsonResponse(saveRes);
        if (!saveRes.ok || !saveData?.ok) {
          setDbConfigFeedback(modal, "error", saveData?.message || "No se pudo guardar");
          btnTest.disabled = false;
          btnSave.disabled = false;
          return;
        }

        setDbConfigFeedback(modal, "ok", "Reiniciando conexion...");
        await fetch("/api/configuracion-db/reiniciar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-DB-Config-Token": sessionToken
          },
          body: JSON.stringify({})
        }).catch(() => {});

        const ready = await waitForBackendAfterRestart();
        if (!ready) {
          setDbConfigFeedback(modal, "error", "Configuracion guardada, pero el backend no volvio a responder");
          return;
        }

        setDbConfigFeedback(modal, "ok", "Conexion reiniciada correctamente");
        setTimeout(() => {
          closeDbConfigModal();
          void mountLogin({ forceStatus: true });
        }, 500);
      } catch (err) {
        console.error(err);
        setDbConfigFeedback(modal, "error", "No se pudo guardar la conexion");
        btnTest.disabled = false;
        btnSave.disabled = false;
      }
    });
  }

  function renderDbConfigAuth(modal, status) {
    const body = modal.querySelector(".db-config-body");
    const connection = status?.connection || {};
    body.innerHTML = `
      <div class="db-config-summary">
        <span><strong>Origen:</strong> ${escapeHtml(status?.displaySource || status?.source || "env")}</span>
        <span><strong>Protegida:</strong> ${status?.protectedConfig ? "si" : "no"}</span>
        <span><strong>Host:</strong> ${connection.hasHost ? "**********" : "no configurado"}</span>
        <span><strong>BD:</strong> ${connection.hasDatabase ? "**********" : "no configurada"}</span>
        <span><strong>PIN local:</strong> ${status?.hasMaintenancePin ? "configurado" : "no configurado"}</span>
      </div>

      <div class="db-config-auth-grid">
        <div class="db-config-auth-card ${status?.hasMaintenancePin ? "" : "is-disabled"}">
          <h3 class="hidden-register-title">PIN local</h3>
          <div class="login-field">
            <label for="db-config-pin">PIN</label>
            <input class="ui-control" id="db-config-pin" type="password" ${status?.hasMaintenancePin ? "" : "disabled"}>
          </div>
          <button id="db-config-auth-pin" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button" ${status?.hasMaintenancePin ? "" : "disabled"}>
            ${renderIcon("key", "ui-toolbar-icon")}
            <span>Autorizar con PIN</span>
          </button>
        </div>

        <div class="db-config-auth-card">
          <h3 class="hidden-register-title">Administrador</h3>
          <div class="login-field">
            <label for="db-config-admin-user">Correo</label>
            <input class="ui-control" id="db-config-admin-user" type="email" placeholder="correo@dominio.com">
          </div>
          <div class="login-field">
            <label for="db-config-admin-pass">Contrasena</label>
            <input class="ui-control" id="db-config-admin-pass" type="password">
          </div>
          <div class="login-field" ${status?.hasMaintenancePin ? "hidden" : ""}>
            <label for="db-config-new-pin">Nuevo PIN local</label>
            <input class="ui-control" id="db-config-new-pin" type="password" placeholder="Minimo 6 caracteres">
          </div>
          <button id="db-config-auth-admin" class="btn-login ui-toolbar-btn is-primary" type="button">
            ${renderIcon("shield-check", "ui-toolbar-icon")}
            <span>Autorizar administrador</span>
          </button>
        </div>
      </div>

      <div id="db-config-feedback" class="db-config-feedback" hidden></div>
    `;

    const btnPin = modal.querySelector("#db-config-auth-pin");
    const btnAdmin = modal.querySelector("#db-config-auth-admin");
    const pinInput = modal.querySelector("#db-config-pin");
    const adminUserInput = modal.querySelector("#db-config-admin-user");
    const adminPassInput = modal.querySelector("#db-config-admin-pass");
    const newPinInput = modal.querySelector("#db-config-new-pin");

    async function postAuthorize(payload) {
      btnPin.disabled = true;
      btnAdmin.disabled = true;
      setDbConfigFeedback(modal, "ok", "Autorizando...");
      try {
        const res = await fetch("/api/configuracion-db/autorizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await readJsonResponse(res);
        if (!res.ok || !data?.ok) {
          setDbConfigFeedback(modal, "error", data?.message || "No se pudo autorizar");
          return;
        }

        renderDbConfigForm(modal, data.status || status, data.data?.token);
      } catch (err) {
        console.error(err);
        setDbConfigFeedback(modal, "error", "No se pudo autorizar configuracion");
      } finally {
        if (btnPin.isConnected) btnPin.disabled = status?.hasMaintenancePin !== true;
        if (btnAdmin.isConnected) btnAdmin.disabled = false;
      }
    }

    btnPin?.addEventListener("click", () => {
      void postAuthorize({
        mode: "pin",
        pin: String(pinInput?.value || "")
      });
    });

    btnAdmin.addEventListener("click", () => {
      void postAuthorize({
        mode: "admin",
        correo: String(adminUserInput?.value || "").trim(),
        password: String(adminPassInput?.value || ""),
        newPin: String(newPinInput?.value || "")
      });
    });

    [pinInput, adminPassInput, newPinInput].forEach((input) => {
      input?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        if (input === pinInput) {
          btnPin?.click();
          return;
        }
        btnAdmin.click();
      });
    });

    setTimeout(() => {
      if (status?.hasMaintenancePin) {
        pinInput?.focus();
      } else {
        adminUserInput?.focus();
      }
    }, 50);
  }

  async function openDbConfigModal(gatePassword = "") {
    closeDbConfigModal();

    const modal = document.createElement("div");
    modal.className = "db-config-overlay";
    modal.innerHTML = `
      <div class="db-config-modal" role="dialog" aria-modal="true" aria-labelledby="db-config-title">
        <div class="db-config-header">
          <div>
            <h2 id="db-config-title">Conexion de base de datos</h2>
            <p>Configuracion local de mantenimiento</p>
          </div>
          <button id="db-config-close" class="db-config-close" type="button" aria-label="Cerrar">
            ${renderIcon("x-mark", "ui-toolbar-icon")}
          </button>
        </div>
        <div class="db-config-body">
          <div class="db-config-loading">Cargando configuracion...</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector("#db-config-close")?.addEventListener("click", closeDbConfigModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDbConfigModal();
    });

    try {
      const status = await fetchDbConfigStatus();
      const authRes = await fetch("/api/configuracion-db/autorizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "maintenance",
          gatePassword: String(gatePassword || "")
        })
      });
      const authData = await readJsonResponse(authRes);
      if (!authRes.ok || !authData?.ok) {
        throw new Error(authData?.message || "No se pudo autorizar configuracion");
      }
      renderDbConfigForm(modal, authData.status || status, authData.data?.token);
    } catch (err) {
      console.error(err);
      const body = modal.querySelector(".db-config-body");
      body.innerHTML = `
        <div class="db-config-feedback is-error">
          No se pudo cargar configuracion de conexion.
        </div>
      `;
    }
  }

  async function fetchLicenseStatus(options = {}) {
    const { force = false } = options;
    const signal = options?.signal;
    try {
      const params = new URLSearchParams();
      if (force) params.set("force", "1");
      params.set("_ts", String(Date.now()));

      const res = await fetch(`/api/licencia/estado?${params.toString()}`, {
        cache: "no-store",
        signal
      });
      const data = await res.json();

      if (!data || data.ok !== true) {
        return {
          ok: false,
          code: sanitizeText(data?.code, "estado_no_disponible"),
          message: sanitizeText(data?.message, "No se pudo leer estado de licencia")
        };
      }

      return {
        ok: true,
        data: data.data || {}
      };
    } catch (err) {
      if (isAbortError(err)) {
        return {
          ok: false,
          code: "aborted",
          message: "Consulta cancelada"
        };
      }
      console.error(err);
      return {
        ok: false,
        code: "estado_no_disponible",
        message: "No se pudo conectar para validar licencia"
      };
    }
  }

  function renderStatusLine(label, status, fallbackCode, fallbackMessage) {
    const ok = status?.ok === true;
    const code = sanitizeText(status?.code, fallbackCode);
    const message = sanitizeText(status?.message, fallbackMessage);
    const stateText = ok ? "OK" : "BLOQUEADO";
    return `
      <div class="license-status-row">
        <span class="license-status-label">${label}</span>
        <span class="license-status-pill ${ok ? "is-ok" : "is-blocked"}">${stateText}</span>
      </div>
      <div class="license-status-detail"><strong>${code}</strong>: ${message}</div>
    `;
  }

  function renderActivationScreen(container, state = {}, options = {}) {
    const startup = state?.startup || {};
    const usage = state?.usage || {};
    const statusFetchFailed = options.statusFetchFailed === true;

    container.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h2>Activacion inicial</h2>
          <p class="license-subtitle">
            Este servidor necesita una licencia valida antes de habilitar el sistema.
          </p>

          <div class="license-status-card">
            <div class="license-status-meta">
              <span><strong>Licencia:</strong> ${formatMaskedCode(state?.codigoLicenciaMasked)}</span>
              <span><strong>Origen:</strong> ${sanitizeText(state?.codeSource, "none")}</span>
            </div>
            <div class="license-status-meta">
              <span class="license-device-line">
                <strong>Device:</strong>
                <span class="license-device-value">${sanitizeText(state?.deviceId, "N/D")}</span>
              </span>
            </div>
            ${renderStatusLine("Arranque", startup, "arranque_no_validado", "Arranque no validado")}
            ${renderStatusLine("Suscripcion", usage, "suscripcion_no_validada", "Suscripcion no validada")}
          </div>

          <div class="login-field">
            <label for="activation-code">Codigo de licencia</label>
            <input
              class="ui-control"
              type="text"
              id="activation-code"
              placeholder="CLINICA-2026-A8KD-X9PL"
              autocomplete="off"
            >
          </div>

          <div class="login-actions license-actions">
            <button id="btn-license-activate" class="btn-login ui-toolbar-btn is-primary" type="button">
              ${renderIcon("shield-check", "ui-toolbar-icon")}
              <span>Activar equipo</span>
            </button>
            <button id="btn-license-refresh" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
              ${renderIcon("arrow-path", "ui-toolbar-icon")}
              <span>Revalidar estado</span>
            </button>
          </div>

          <div id="activation-error" class="login-error" ${statusFetchFailed ? "" : "hidden"}>
            ${statusFetchFailed ? "No se pudo consultar estado de licencia. Verifique conexion a BD." : ""}
          </div>
          <div id="activation-notice" class="login-notice" hidden></div>
        </div>
      </div>
    `;

    const codeInput = container.querySelector("#activation-code");
    const btnActivate = container.querySelector("#btn-license-activate");
    const btnRefresh = container.querySelector("#btn-license-refresh");
    const errorBox = container.querySelector("#activation-error");
    const noticeBox = container.querySelector("#activation-notice");

    setTimeout(() => codeInput.focus(), 60);

    btnRefresh.addEventListener("click", () => {
      void mountLogin({ forceStatus: true });
    });

    btnActivate.addEventListener("click", async () => {
      const codigoLicencia = sanitizeText(codeInput.value);
      errorBox.hidden = true;
      noticeBox.hidden = true;

      if (!codigoLicencia) {
        errorBox.textContent = "Debe ingresar un codigo de licencia";
        errorBox.hidden = false;
        return;
      }

      btnActivate.disabled = true;
      btnRefresh.disabled = true;

      try {
        const res = await fetch("/api/licencia/activar-inicial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigoLicencia })
        });
        const data = await res.json();

        if (!data?.ok) {
          errorBox.textContent = data?.message || "No se pudo activar la licencia";
          errorBox.hidden = false;
          return;
        }

        noticeBox.textContent = data?.message || "Licencia activada correctamente";
        noticeBox.hidden = false;
        setTimeout(() => {
          void mountLogin({ forceStatus: true });
        }, 600);
      } catch (err) {
        console.error(err);
        errorBox.textContent = "Opps ocurrio un error de conexion";
        errorBox.hidden = false;
      } finally {
        btnActivate.disabled = false;
        btnRefresh.disabled = false;
      }
    });

    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        btnActivate.click();
      }
    });

    attachDbConfigShortcut();
  }

  function renderUsageBlockedScreen(container, state = {}) {
    const usage = state?.usage || {};

    container.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h2>Sistema bloqueado</h2>
          <p class="license-subtitle">
            El servidor esta activo, pero el uso del sistema esta bloqueado por suscripcion.
          </p>

          <div class="license-status-card">
            <div class="license-status-meta">
              <span><strong>Licencia:</strong> ${formatMaskedCode(state?.codigoLicenciaMasked)}</span>
              <span><strong>Origen:</strong> ${sanitizeText(state?.codeSource, "none")}</span>
            </div>
            ${renderStatusLine("Suscripcion", usage, "suscripcion_no_validada", "Suscripcion no validada")}
          </div>

          <div class="login-actions license-actions license-actions-single">
            <button id="btn-license-refresh" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
              ${renderIcon("arrow-path", "ui-toolbar-icon")}
              <span>Revalidar estado</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const btnRefresh = container.querySelector("#btn-license-refresh");
    btnRefresh.addEventListener("click", () => {
      void mountLogin({ forceStatus: true });
    });

    attachDbConfigShortcut();
  }

  function renderLogin(container) {
    container.innerHTML = `
      <div class="login-container">
        <div class="login-box login-box-main">
          <div class="login-brand">
            <div class="login-brand-mark" aria-hidden="true">
              ${renderIcon("sparkles", "login-brand-sparkle")}
              ${renderIcon("tooth", "login-brand-tooth")}
            </div>
          </div>

          <div class="login-field login-field-icon">
            <label for="login-user">Usuario</label>
            <div class="login-input-shell">
              ${renderIcon("user", "login-input-icon")}
              <input class="ui-control" type="text" id="login-user" placeholder="Correo">
            </div>
          </div>

          <div class="login-field login-field-icon">
            <label for="login-pass">Contrasena</label>
            <div class="login-input-shell">
              ${renderIcon("lock-closed", "login-input-icon")}
              <input class="ui-control" type="password" id="login-pass" placeholder="Contrasena">
            </div>
          </div>

          <div class="login-actions">
            <button id="btn-login" class="btn-login ui-toolbar-btn is-primary">
              ${renderIcon("arrow-right-on-rectangle", "ui-toolbar-icon")}
              <span>Entrar</span>
            </button>
          </div>

          <div class="login-helper-row">
            <button id="btn-open-recovery" class="login-link-btn" type="button">
              Olvide mi contrasena
            </button>
          </div>

          <div id="password-recovery-box" class="password-recovery-box" hidden>
            <h3 class="hidden-register-title">Recuperar contrasena</h3>

            <div class="login-field">
              <label for="recovery-correo">Correo</label>
              <input class="ui-control" type="email" id="recovery-correo" placeholder="correo@dominio.com">
            </div>

            <div class="password-recovery-actions">
              <button id="btn-recovery-question" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
                ${renderIcon("question-mark-circle", "ui-toolbar-icon")}
                <span>Ver pregunta</span>
              </button>
              <button id="btn-recovery-close" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
                ${renderIcon("x-mark", "ui-toolbar-icon")}
                <span>Cerrar</span>
              </button>
            </div>

            <div id="recovery-question-wrap" hidden>
              <div class="login-field">
                <label for="recovery-question">Pregunta de seguridad</label>
                <input class="ui-control" type="text" id="recovery-question" readonly>
              </div>
              <div class="login-field">
                <label for="recovery-answer">Respuesta</label>
                <input class="ui-control" type="text" id="recovery-answer" placeholder="Su respuesta">
              </div>
              <div class="login-field">
                <label for="recovery-new-pass">Nueva contrasena</label>
                <input class="ui-control" type="password" id="recovery-new-pass" placeholder="Minimo 6 caracteres">
              </div>
              <div class="login-field">
                <label for="recovery-new-pass-confirm">Confirmar nueva contrasena</label>
                <input class="ui-control" type="password" id="recovery-new-pass-confirm" placeholder="Repita contrasena">
              </div>

              <div class="password-recovery-actions password-recovery-actions-single">
                <button id="btn-recovery-reset" class="btn-login ui-toolbar-btn is-primary" type="button">
                  ${renderIcon("key", "ui-toolbar-icon")}
                  <span>Cambiar contrasena</span>
                </button>
              </div>
            </div>

            <div id="recovery-setup-wrap" hidden>
              <p class="license-subtitle recovery-setup-copy">
                Este usuario aun no tiene pregunta de seguridad. Configurela con su contrasena actual.
              </p>
              <div class="login-field">
                <label for="recovery-current-pass">Contrasena actual</label>
                <input class="ui-control" type="password" id="recovery-current-pass" placeholder="Contrasena actual">
              </div>
              <div class="login-field">
                <label for="recovery-setup-question">Nueva pregunta de seguridad</label>
                <input class="ui-control" type="text" id="recovery-setup-question" placeholder="Ej: Nombre de mi primera mascota">
              </div>
              <div class="login-field">
                <label for="recovery-setup-answer">Nueva respuesta</label>
                <input class="ui-control" type="text" id="recovery-setup-answer" placeholder="Respuesta">
              </div>
              <div class="login-field">
                <label for="recovery-setup-new-pass">Nueva contrasena (opcional)</label>
                <input class="ui-control" type="password" id="recovery-setup-new-pass" placeholder="Dejar vacio para no cambiarla">
              </div>
              <div class="login-field">
                <label for="recovery-setup-new-pass-confirm">Confirmar nueva contrasena</label>
                <input class="ui-control" type="password" id="recovery-setup-new-pass-confirm" placeholder="Solo si cambio contrasena">
              </div>

              <div class="password-recovery-actions password-recovery-actions-single">
                <button id="btn-recovery-setup" class="btn-login ui-toolbar-btn is-primary" type="button">
                  ${renderIcon("shield-check", "ui-toolbar-icon")}
                  <span>Configurar seguridad</span>
                </button>
              </div>
            </div>

            <div id="recovery-msg" class="login-error" hidden></div>
            <div id="recovery-ok" class="login-notice" hidden></div>
          </div>

          <div id="login-error" class="login-error" hidden></div>
          <div id="login-notice" class="login-notice" hidden></div>

          <div id="hidden-register-box" class="hidden-register-box" style="display:none;">
            <h3 class="hidden-register-title">Registro oculto</h3>

            <div class="hidden-register-grid">
              <div class="hidden-register-field">
                <label for="reg-correo">Correo</label>
                <input class="ui-control" type="email" id="reg-correo" placeholder="correo@dominio.com">
              </div>

              <div class="hidden-register-field">
                <label for="reg-password">Contrasena</label>
                <input class="ui-control" type="password" id="reg-password" placeholder="Minimo 6 caracteres">
              </div>

              <div class="hidden-register-field">
                <label for="reg-password-confirm">Confirmar contrasena</label>
                <input class="ui-control" type="password" id="reg-password-confirm" placeholder="Repita contrasena">
              </div>

              <div class="hidden-register-field">
                <label for="reg-nombre">Nombre</label>
                <input class="ui-control" type="text" id="reg-nombre" placeholder="Nombre completo">
              </div>

              <div class="hidden-register-field hidden-register-field-full">
                <label for="reg-pregunta-seguridad">Pregunta de seguridad (opcional)</label>
                <input class="ui-control" type="text" id="reg-pregunta-seguridad" placeholder="Ej: Nombre de mi primera mascota">
              </div>

              <div class="hidden-register-field hidden-register-field-full">
                <label for="reg-respuesta-seguridad">Respuesta de seguridad (opcional)</label>
                <input class="ui-control" type="text" id="reg-respuesta-seguridad" placeholder="Respuesta">
              </div>

              <div class="hidden-register-field">
                <label for="reg-idrol">Rol</label>
                <select class="ui-control" id="reg-idrol">
                  <option value="">Seleccione rol</option>
                </select>
              </div>

              <div id="reg-doctor-panel" class="hidden-register-field hidden-register-field-full hidden-register-doctor-panel" hidden>
                <label>Doctor</label>
                <div class="hidden-register-mode-row" role="radiogroup" aria-label="Modo de doctor">
                  <label class="hidden-register-radio">
                    <input type="radio" name="reg-doctor-mode" value="existing" checked>
                    <span>Usar doctor existente</span>
                  </label>
                  <label class="hidden-register-radio">
                    <input type="radio" name="reg-doctor-mode" value="new">
                    <span>Crear doctor nuevo</span>
                  </label>
                </div>

                <div id="reg-doctor-existing-wrap">
                  <select class="ui-control" id="reg-iddoctor">
                    <option value="">Seleccione doctor disponible</option>
                  </select>
                </div>

                <div id="reg-doctor-new-wrap" class="hidden-register-doctor-new-grid" hidden>
                  <input class="ui-control" type="text" id="reg-doctor-nuevo-nombre" placeholder="Nombre doctor">
                  <input class="ui-control" type="text" id="reg-doctor-nuevo-telefono" placeholder="Telefono doctor">
                </div>
              </div>
            </div>

            <div class="hidden-register-actions">
              <button id="btn-registro-guardar" class="btn-login ui-toolbar-btn is-success hidden-register-btn-primary" type="button">
                ${renderIcon("plus", "ui-toolbar-icon")}
                <span>Crear usuario</span>
              </button>
              <button id="btn-registro-cancelar" class="btn-login ui-toolbar-btn hidden-register-btn-muted" type="button">
                ${renderIcon("x-mark", "ui-toolbar-icon")}
                <span>Ocultar</span>
              </button>
            </div>

            <div id="registro-msg" class="login-error hidden-register-msg" hidden></div>
          </div>
        </div>
      </div>
    `;

    const userInput = container.querySelector("#login-user");
    const passInput = container.querySelector("#login-pass");
    const btnLogin = container.querySelector("#btn-login");
    const errorBox = container.querySelector("#login-error");
    const noticeBox = container.querySelector("#login-notice");
    const btnOpenRecovery = container.querySelector("#btn-open-recovery");
    const recoveryBox = container.querySelector("#password-recovery-box");
    const recoveryCorreo = container.querySelector("#recovery-correo");
    const btnRecoveryQuestion = container.querySelector("#btn-recovery-question");
    const btnRecoveryClose = container.querySelector("#btn-recovery-close");
    const recoveryQuestionWrap = container.querySelector("#recovery-question-wrap");
    const recoveryQuestionInput = container.querySelector("#recovery-question");
    const recoveryAnswerInput = container.querySelector("#recovery-answer");
    const recoveryNewPassInput = container.querySelector("#recovery-new-pass");
    const recoveryNewPassConfirmInput = container.querySelector("#recovery-new-pass-confirm");
    const btnRecoveryReset = container.querySelector("#btn-recovery-reset");
    const recoverySetupWrap = container.querySelector("#recovery-setup-wrap");
    const recoveryCurrentPassInput = container.querySelector("#recovery-current-pass");
    const recoverySetupQuestionInput = container.querySelector("#recovery-setup-question");
    const recoverySetupAnswerInput = container.querySelector("#recovery-setup-answer");
    const recoverySetupNewPassInput = container.querySelector("#recovery-setup-new-pass");
    const recoverySetupNewPassConfirmInput = container.querySelector("#recovery-setup-new-pass-confirm");
    const btnRecoverySetup = container.querySelector("#btn-recovery-setup");
    const recoveryMsg = container.querySelector("#recovery-msg");
    const recoveryOk = container.querySelector("#recovery-ok");

    const hiddenBox = container.querySelector("#hidden-register-box");
    const registroMsg = container.querySelector("#registro-msg");
    const btnRegistroGuardar = container.querySelector("#btn-registro-guardar");
    const btnRegistroCancelar = container.querySelector("#btn-registro-cancelar");

    const regCorreo = container.querySelector("#reg-correo");
    const regPassword = container.querySelector("#reg-password");
    const regPasswordConfirm = container.querySelector("#reg-password-confirm");
    const regNombre = container.querySelector("#reg-nombre");
    const regPreguntaSeguridad = container.querySelector("#reg-pregunta-seguridad");
    const regRespuestaSeguridad = container.querySelector("#reg-respuesta-seguridad");
    const regIdRol = container.querySelector("#reg-idrol");
    const regIdDoctor = container.querySelector("#reg-iddoctor");
    const regDoctorPanel = container.querySelector("#reg-doctor-panel");
    const regDoctorModeInputs = Array.from(container.querySelectorAll('input[name="reg-doctor-mode"]'));
    const regDoctorExistingWrap = container.querySelector("#reg-doctor-existing-wrap");
    const regDoctorNewWrap = container.querySelector("#reg-doctor-new-wrap");
    const regDoctorNuevoNombre = container.querySelector("#reg-doctor-nuevo-nombre");
    const regDoctorNuevoTelefono = container.querySelector("#reg-doctor-nuevo-telefono");
    let registroCatalogosCargados = false;
    let registroCatalogosPromise = null;
    let loginInFlight = false;
    let registroInFlight = false;
    let recoveryLookupInFlight = false;
    let recoveryResetInFlight = false;
    let recoverySetupInFlight = false;
    let noticeTimer = null;

    setTimeout(() => userInput.focus(), 50);

    function getRegistroRolNombre() {
      const selected = regIdRol?.selectedOptions?.[0];
      return String(selected?.dataset?.roleName || selected?.textContent || "")
        .replace(/\([^)]*\)\s*$/, "")
        .trim();
    }

    function isRegistroRolDoctor() {
      return getRegistroRolNombre().toLowerCase() === "doctor";
    }

    function getRegistroDoctorMode() {
      const selected = regDoctorModeInputs.find((input) => input.checked);
      return selected?.value || "existing";
    }

    function resetRegistroDoctorFields() {
      if (regIdDoctor) regIdDoctor.value = "";
      if (regDoctorNuevoNombre) regDoctorNuevoNombre.value = "";
      if (regDoctorNuevoTelefono) regDoctorNuevoTelefono.value = "";
    }

    function syncRegistroDoctorVisibility({ clearOnHide = false } = {}) {
      const esDoctor = isRegistroRolDoctor();
      if (regDoctorPanel) regDoctorPanel.hidden = !esDoctor;

      if (!esDoctor) {
        if (clearOnHide) resetRegistroDoctorFields();
        return;
      }

      const mode = getRegistroDoctorMode();
      if (regDoctorExistingWrap) regDoctorExistingWrap.hidden = mode !== "existing";
      if (regDoctorNewWrap) regDoctorNewWrap.hidden = mode !== "new";

      if (mode === "existing") {
        if (regDoctorNuevoNombre) regDoctorNuevoNombre.value = "";
        if (regDoctorNuevoTelefono) regDoctorNuevoTelefono.value = "";
      } else if (regIdDoctor) {
        regIdDoctor.value = "";
      }
    }

    async function cargarCatalogosRegistro() {
      if (registroCatalogosCargados) return true;
      if (registroCatalogosPromise) return registroCatalogosPromise;

      registroCatalogosPromise = (async () => {
        try {
          const res = await fetch("/api/auth/registro-oculto/catalogos", {
            cache: "no-store"
          });
          const data = await res.json();

          if (!data.ok) {
            registroMsg.textContent = data.message || "No se pudieron cargar catalogos";
            registroMsg.hidden = false;
            return false;
          }

          const roles = Array.isArray(data?.data?.roles) ? data.data.roles : [];
          const doctores = Array.isArray(data?.data?.doctores) ? data.data.doctores : [];

          regIdRol.innerHTML = '<option value="">Seleccione rol</option>';
          roles.forEach((r) => {
            const opt = document.createElement("option");
            opt.value = String(r.idRol);
            opt.textContent = `${r.nombreR} (${r.idRol})`;
            opt.dataset.roleName = String(r.nombreR || "");
            regIdRol.appendChild(opt);
          });

          regIdDoctor.innerHTML = doctores.length
            ? '<option value="">Seleccione doctor disponible</option>'
            : '<option value="">Sin doctores disponibles</option>';
          doctores.forEach((d) => {
            const opt = document.createElement("option");
            const doctorId = d.idDoctor ?? d.IDDoctor ?? d.iddoctor;
            const doctorNombre = d.nombreD ?? d.NombreD ?? d.nombred ?? `Doctor ${doctorId}`;
            opt.value = String(doctorId);
            opt.textContent = doctorNombre;
            regIdDoctor.appendChild(opt);
          });

          registroCatalogosCargados = true;
          syncRegistroDoctorVisibility();
          return true;
        } catch (err) {
          if (isAbortError(err)) return false;
          console.error(err);
          registroMsg.textContent = "Opps ocurrio un error de conexion";
          registroMsg.hidden = false;
          if (window.notifyConnectionError) {
            window.notifyConnectionError("Opps ocurrio un error de conexion");
          }
          return false;
        } finally {
          registroCatalogosPromise = null;
        }
      })();

      return registroCatalogosPromise;
    }

    async function mostrarRegistro(msg = "") {
      hiddenBox.style.display = "block";
      registroMsg.hidden = !msg;
      registroMsg.textContent = msg;
      await cargarCatalogosRegistro();
      syncRegistroDoctorVisibility();
      setTimeout(() => regCorreo.focus(), 50);
    }

    function ocultarRegistro() {
      hiddenBox.style.display = "none";
      registroMsg.hidden = true;
      registroMsg.textContent = "";
      regCorreo.value = "";
      regPassword.value = "";
      regPasswordConfirm.value = "";
      regNombre.value = "";
      if (regPreguntaSeguridad) regPreguntaSeguridad.value = "";
      if (regRespuestaSeguridad) regRespuestaSeguridad.value = "";
      regIdRol.value = "";
      regIdDoctor.value = "";
      regDoctorModeInputs.forEach((input) => {
        input.checked = input.value === "existing";
      });
      resetRegistroDoctorFields();
      syncRegistroDoctorVisibility({ clearOnHide: true });
    }

    function mostrarNotificacionExito(msg) {
      if (noticeTimer) {
        clearTimeout(noticeTimer);
      }

      noticeBox.textContent = msg;
      noticeBox.hidden = false;

      noticeTimer = setTimeout(() => {
        noticeBox.hidden = true;
        noticeBox.textContent = "";
      }, 2600);
    }

    function clearRecoveryFeedback() {
      if (recoveryMsg) {
        recoveryMsg.hidden = true;
        recoveryMsg.textContent = "";
      }
      if (recoveryOk) {
        recoveryOk.hidden = true;
        recoveryOk.textContent = "";
      }
    }

    function showRecoveryError(msg) {
      if (!recoveryMsg) return;
      recoveryMsg.textContent = msg;
      recoveryMsg.hidden = false;
      if (recoveryOk) {
        recoveryOk.hidden = true;
        recoveryOk.textContent = "";
      }
    }

    function showRecoveryNotice(msg) {
      if (!recoveryOk) return;
      recoveryOk.textContent = msg;
      recoveryOk.hidden = false;
      if (recoveryMsg) {
        recoveryMsg.hidden = true;
        recoveryMsg.textContent = "";
      }
    }

    function resetRecoveryStepPanels() {
      if (recoveryQuestionWrap) recoveryQuestionWrap.hidden = true;
      if (recoverySetupWrap) recoverySetupWrap.hidden = true;
      if (recoveryQuestionInput) recoveryQuestionInput.value = "";
      if (recoveryAnswerInput) recoveryAnswerInput.value = "";
      if (recoveryNewPassInput) recoveryNewPassInput.value = "";
      if (recoveryNewPassConfirmInput) recoveryNewPassConfirmInput.value = "";
      if (recoveryCurrentPassInput) recoveryCurrentPassInput.value = "";
      if (recoverySetupQuestionInput) recoverySetupQuestionInput.value = "";
      if (recoverySetupAnswerInput) recoverySetupAnswerInput.value = "";
      if (recoverySetupNewPassInput) recoverySetupNewPassInput.value = "";
      if (recoverySetupNewPassConfirmInput) recoverySetupNewPassConfirmInput.value = "";
    }

    function openRecoveryBox() {
      if (!recoveryBox) return;
      recoveryBox.hidden = false;
      clearRecoveryFeedback();
      resetRecoveryStepPanels();

      const correoLogin = String(userInput?.value || "").trim();
      if (correoLogin && recoveryCorreo && !recoveryCorreo.value.trim()) {
        recoveryCorreo.value = correoLogin;
      }

      setTimeout(() => recoveryCorreo?.focus(), 50);
    }

    function closeRecoveryBox() {
      if (!recoveryBox) return;
      recoveryBox.hidden = true;
      clearRecoveryFeedback();
      resetRecoveryStepPanels();
    }

    btnRegistroCancelar.addEventListener("click", ocultarRegistro);
    regIdRol?.addEventListener("change", () => {
      resetRegistroDoctorFields();
      syncRegistroDoctorVisibility({ clearOnHide: true });
    });
    regDoctorModeInputs.forEach((input) => {
      input.addEventListener("change", () => syncRegistroDoctorVisibility());
    });
    btnOpenRecovery?.addEventListener("click", () => {
      if (recoveryBox?.hidden) {
        openRecoveryBox();
      } else {
        closeRecoveryBox();
      }
    });
    btnRecoveryClose?.addEventListener("click", closeRecoveryBox);

    btnLogin.addEventListener("click", async () => {
      if (loginInFlight) return;
      const user = userInput.value.trim();
      const pass = passInput.value.trim();

      errorBox.hidden = true;

      if (!user || !pass) {
        errorBox.textContent = "Debe ingresar usuario y contrasena";
        errorBox.hidden = false;
        return;
      }

      loginInFlight = true;
      btnLogin.disabled = true;
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo: user,
            password: pass
          })
        });
        const data = await res.json();
        if (!data.ok) {
          errorBox.textContent = data.message || "Correo o contrasena incorrectos";
          errorBox.hidden = false;
          return;
        }

        localStorage.setItem("token", data.token);
        sessionStorage.setItem("user", JSON.stringify(data.usuario));

        if (window.renderTopUser) {
          window.renderTopUser();
        }

        if (window.__setAppChromeVisible) {
          window.__setAppChromeVisible(true);
        }

        if (window.applyMenuPermissions) {
          window.applyMenuPermissions();
        }

        if (window.refreshLicenseWarning) {
          try {
            await window.refreshLicenseWarning({ force: false, showPopup: true });
          } catch (refreshErr) {
            console.error(refreshErr);
          }
        }

        if (window.refreshSecurityProtocolStatus) {
          try {
            await window.refreshSecurityProtocolStatus({ silent: true });
          } catch (refreshErr) {
            console.error(refreshErr);
          }
        }

        if (window.loadView) {
          detachShortcut();
          const defaultView = window.getDefaultViewByRole
            ? window.getDefaultViewByRole()
            : null;

          if (defaultView) {
            await window.loadView(defaultView);
          }
        }
      } catch (err) {
        if (isAbortError(err)) return;
        console.error(err);
        errorBox.textContent = "Opps ocurrio un error de conexion";
        errorBox.hidden = false;
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
      } finally {
        loginInFlight = false;
        btnLogin.disabled = false;
      }
    });

    btnRecoveryQuestion?.addEventListener("click", async () => {
      if (recoveryLookupInFlight) return;
      clearRecoveryFeedback();
      if (recoveryQuestionWrap) recoveryQuestionWrap.hidden = true;
      if (recoverySetupWrap) recoverySetupWrap.hidden = true;

      const correo = String(recoveryCorreo?.value || "").trim().toLowerCase();
      if (!correo) {
        showRecoveryError("Ingrese el correo para continuar");
        recoveryCorreo?.focus();
        return;
      }

      recoveryLookupInFlight = true;
      btnRecoveryQuestion.disabled = true;
      try {
        const res = await fetch("/api/auth/password-recovery/question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ correo })
        });
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          showRecoveryError(data?.message || "No se pudo consultar recuperacion");
          return;
        }

        if (data.mode === "question") {
          if (recoveryQuestionInput) {
            recoveryQuestionInput.value = String(data.preguntaSeguridad || "");
          }
          if (recoveryQuestionWrap) recoveryQuestionWrap.hidden = false;
          if (recoverySetupWrap) recoverySetupWrap.hidden = true;
          recoveryAnswerInput?.focus();
          return;
        }

        if (data.mode === "setup_required") {
          if (recoverySetupWrap) recoverySetupWrap.hidden = false;
          if (recoveryQuestionWrap) recoveryQuestionWrap.hidden = true;
          showRecoveryNotice(
            data?.message ||
            "Este usuario no tiene pregunta configurada. Debe configurarla con su contrasena actual."
          );
          recoveryCurrentPassInput?.focus();
          return;
        }

        showRecoveryNotice(
          data?.message ||
          "Si el correo existe y tiene pregunta configurada, podra recuperar su contrasena."
        );
      } catch (err) {
        if (isAbortError(err)) return;
        console.error(err);
        showRecoveryError("Opps ocurrio un error de conexion");
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
      } finally {
        recoveryLookupInFlight = false;
        if (btnRecoveryQuestion?.isConnected) {
          btnRecoveryQuestion.disabled = false;
        }
      }
    });

    btnRecoveryReset?.addEventListener("click", async () => {
      if (recoveryResetInFlight) return;
      clearRecoveryFeedback();

      const correo = String(recoveryCorreo?.value || "").trim().toLowerCase();
      const respuestaSeguridad = String(recoveryAnswerInput?.value || "").trim();
      const nuevaPassword = String(recoveryNewPassInput?.value || "");
      const nuevaPasswordConfirm = String(recoveryNewPassConfirmInput?.value || "");

      if (!correo || !respuestaSeguridad || !nuevaPassword || !nuevaPasswordConfirm) {
        showRecoveryError("Complete correo, respuesta y nueva contrasena");
        return;
      }

      if (nuevaPassword !== nuevaPasswordConfirm) {
        showRecoveryError("La confirmacion de contrasena no coincide");
        return;
      }

      if (nuevaPassword.length < 6) {
        showRecoveryError("La nueva contrasena debe tener al menos 6 caracteres");
        return;
      }

      recoveryResetInFlight = true;
      btnRecoveryReset.disabled = true;
      try {
        const res = await fetch("/api/auth/password-recovery/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo,
            respuestaSeguridad,
            nuevaPassword
          })
        });
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          showRecoveryError(data?.message || "No se pudo restablecer contrasena");
          return;
        }

        closeRecoveryBox();
        if (userInput) userInput.value = correo;
        if (passInput) {
          passInput.value = "";
          passInput.focus();
        }
        mostrarNotificacionExito(data?.message || "Contrasena actualizada. Inicie sesion.");
      } catch (err) {
        if (isAbortError(err)) return;
        console.error(err);
        showRecoveryError("Opps ocurrio un error de conexion");
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
      } finally {
        recoveryResetInFlight = false;
        if (btnRecoveryReset?.isConnected) {
          btnRecoveryReset.disabled = false;
        }
      }
    });

    btnRecoverySetup?.addEventListener("click", async () => {
      if (recoverySetupInFlight) return;
      clearRecoveryFeedback();

      const correo = String(recoveryCorreo?.value || "").trim().toLowerCase();
      const passwordActual = String(recoveryCurrentPassInput?.value || "");
      const preguntaSeguridad = String(recoverySetupQuestionInput?.value || "").trim();
      const respuestaSeguridad = String(recoverySetupAnswerInput?.value || "").trim();
      const nuevaPassword = String(recoverySetupNewPassInput?.value || "");
      const nuevaPasswordConfirm = String(recoverySetupNewPassConfirmInput?.value || "");

      if (!correo || !passwordActual || !preguntaSeguridad || !respuestaSeguridad) {
        showRecoveryError("Complete correo, contrasena actual, pregunta y respuesta");
        return;
      }

      if ((nuevaPassword || nuevaPasswordConfirm) && nuevaPassword !== nuevaPasswordConfirm) {
        showRecoveryError("La confirmacion de nueva contrasena no coincide");
        return;
      }

      if (nuevaPassword && nuevaPassword.length < 6) {
        showRecoveryError("La nueva contrasena debe tener al menos 6 caracteres");
        return;
      }

      recoverySetupInFlight = true;
      btnRecoverySetup.disabled = true;
      try {
        const res = await fetch("/api/auth/password-recovery/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo,
            passwordActual,
            preguntaSeguridad,
            respuestaSeguridad,
            nuevaPassword: nuevaPassword || null
          })
        });
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          showRecoveryError(data?.message || "No se pudo configurar seguridad");
          return;
        }

        showRecoveryNotice(data?.message || "Pregunta de seguridad configurada");
        if (nuevaPassword) {
          closeRecoveryBox();
          if (userInput) userInput.value = correo;
          if (passInput) {
            passInput.value = "";
            passInput.focus();
          }
          mostrarNotificacionExito("Seguridad configurada y contrasena actualizada.");
          return;
        }

        if (recoverySetupWrap) recoverySetupWrap.hidden = true;
        if (recoveryQuestionWrap) recoveryQuestionWrap.hidden = true;
      } catch (err) {
        if (isAbortError(err)) return;
        console.error(err);
        showRecoveryError("Opps ocurrio un error de conexion");
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
      } finally {
        recoverySetupInFlight = false;
        if (btnRecoverySetup?.isConnected) {
          btnRecoverySetup.disabled = false;
        }
      }
    });

    btnRegistroGuardar.addEventListener("click", async () => {
      if (registroInFlight) return;
      registroMsg.hidden = true;

      const correo = regCorreo.value.trim();
      const password = regPassword.value;
      const passwordConfirm = regPasswordConfirm.value;
      const nombre = regNombre.value.trim();
      const preguntaSeguridad = String(regPreguntaSeguridad?.value || "").trim();
      const respuestaSeguridad = String(regRespuestaSeguridad?.value || "").trim();
      const idRol = Number(regIdRol.value);
      const esRolDoctor = isRegistroRolDoctor();
      const doctorMode = getRegistroDoctorMode();
      let idDoctor = null;
      let doctorNuevo = null;

      if (!correo || !password || !passwordConfirm || !nombre || !idRol) {
        registroMsg.textContent = "Complete los campos obligatorios";
        registroMsg.hidden = false;
        return;
      }

      if (password !== passwordConfirm) {
        registroMsg.textContent = "Las contrasenas no coinciden";
        registroMsg.hidden = false;
        return;
      }

      if (password.length < 6) {
        registroMsg.textContent = "La contrasena debe tener al menos 6 caracteres";
        registroMsg.hidden = false;
        return;
      }

      const hasPreguntaSeguridad = !!preguntaSeguridad;
      const hasRespuestaSeguridad = !!respuestaSeguridad;
      if (hasPreguntaSeguridad !== hasRespuestaSeguridad) {
        registroMsg.textContent = "Si define seguridad, complete pregunta y respuesta";
        registroMsg.hidden = false;
        return;
      }

      if (esRolDoctor && doctorMode === "existing") {
        const idDoctorRaw = regIdDoctor.value;
        idDoctor = idDoctorRaw === "" ? null : Number(idDoctorRaw);
        if (!idDoctor || Number.isNaN(idDoctor)) {
          registroMsg.textContent = "Seleccione un doctor disponible";
          registroMsg.hidden = false;
          return;
        }
      }

      if (esRolDoctor && doctorMode === "new") {
        const nombreDoctorNuevo = String(regDoctorNuevoNombre?.value || "").trim();
        const telefonoDoctorNuevo = String(regDoctorNuevoTelefono?.value || "").trim();
        if (!nombreDoctorNuevo) {
          registroMsg.textContent = "Ingrese el nombre del doctor nuevo";
          registroMsg.hidden = false;
          return;
        }
        doctorNuevo = {
          nombre: nombreDoctorNuevo,
          telefono: telefonoDoctorNuevo || null
        };
      }

      registroInFlight = true;
      btnRegistroGuardar.disabled = true;
      try {
        const res = await fetch("/api/auth/registro-oculto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo,
            password,
            nombre,
            idRol,
            idDoctor,
            doctorNuevo,
            preguntaSeguridad: hasPreguntaSeguridad ? preguntaSeguridad : null,
            respuestaSeguridad: hasRespuestaSeguridad ? respuestaSeguridad : null
          })
        });

        const data = await res.json();

        if (!data.ok) {
          registroMsg.textContent = data.message || "No se pudo crear el usuario";
          registroMsg.hidden = false;
          return;
        }

        ocultarRegistro();
        registroCatalogosCargados = false;
        mostrarNotificacionExito(`Usuario creado. ID: ${data.idUsuario || "N/D"}`);
      } catch (err) {
        if (isAbortError(err)) return;
        console.error(err);
        registroMsg.textContent = "Opps ocurrio un error de conexion";
        registroMsg.hidden = false;
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
      } finally {
        registroInFlight = false;
        btnRegistroGuardar.disabled = false;
      }
    });

    const onLoginKeydown = (e) => {
      if (isShortcutOpenRegister(e)) {
        e.preventDefault();
        if (hiddenBox.style.display === "none") {
          void mostrarRegistro();
        } else {
          ocultarRegistro();
        }
        return;
      }

      if (e.key === "Escape" && hiddenBox.style.display !== "none") {
        ocultarRegistro();
        return;
      }
      if (e.key === "Escape" && recoveryBox && !recoveryBox.hidden) {
        closeRecoveryBox();
        return;
      }

      const targetId = e.target && e.target.id ? e.target.id : "";
      const isLoginField = targetId === "login-user" || targetId === "login-pass";
      if (e.key === "Enter" && isLoginField) {
        btnLogin.click();
      }
    };

    const attachShortcut = () => {
      if (window.__loginHiddenShortcutHandler) {
        document.removeEventListener("keydown", window.__loginHiddenShortcutHandler, true);
      }
      window.__loginHiddenShortcutHandler = onLoginKeydown;
      document.addEventListener("keydown", onLoginKeydown, true);
    };

    function detachShortcut() {
      if (window.__loginHiddenShortcutHandler) {
        document.removeEventListener("keydown", window.__loginHiddenShortcutHandler, true);
        window.__loginHiddenShortcutHandler = null;
      }
      detachDbConfigShortcut();
    }

    attachShortcut();
    attachDbConfigShortcut();
  }

  async function mountLogin(options = {}) {
    const { forceStatus = false } = options;
    const mountSeq = ++loginMountSeq;
    const content = document.querySelector(".content");
    if (!content) return;

    if (window.__loginHiddenShortcutHandler) {
      document.removeEventListener("keydown", window.__loginHiddenShortcutHandler, true);
      window.__loginHiddenShortcutHandler = null;
    }
    abortLoginStatusRequest();
    const controller = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
    loginStatusController = controller;

    content.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h2>Validando licencia...</h2>
          <p class="license-subtitle">Espere un momento.</p>
        </div>
      </div>
    `;

    const statusResult = await fetchLicenseStatus({
      force: forceStatus,
      signal: controller ? controller.signal : undefined
    });
    if (mountSeq !== loginMountSeq) {
      if (loginStatusController === controller && controller?.signal?.aborted) {
        loginStatusController = null;
      }
      return;
    }
    if (statusResult.code === "aborted") {
      if (loginStatusController === controller) {
        loginStatusController = null;
      }
      return;
    }
    if (controller?.signal?.aborted) {
      if (loginStatusController === controller) {
        loginStatusController = null;
      }
      return;
    }
    if (loginStatusController === controller) {
      loginStatusController = null;
    }
    if (!statusResult.ok) {
      renderActivationScreen(
        content,
        {
          startup: {
            ok: false,
            code: statusResult.code,
            message: statusResult.message
          },
          usage: {
            ok: false,
            code: "suscripcion_no_validada",
            message: "No se pudo consultar suscripcion"
          },
          codigoLicenciaMasked: null,
          codeSource: "none",
          deviceId: null
        },
        { statusFetchFailed: true }
      );
      return;
    }

    const state = statusResult.data || {};
    const startupOk = state?.startup?.ok === true;
    const usageOk = state?.usage?.ok === true;

    if (!startupOk) {
      renderActivationScreen(content, state, { statusFetchFailed: false });
      return;
    }

    if (!usageOk) {
      renderUsageBlockedScreen(content, state);
      return;
    }

    renderLogin(content);
  }

  window.__mountLogin = mountLogin;
})();
