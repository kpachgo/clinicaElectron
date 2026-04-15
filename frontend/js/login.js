// js/login.js
(function () {
  let loginMountSeq = 0;
  let loginStatusController = null;

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
  }

  function renderLogin(container) {
    container.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h2>Iniciar sesion</h2>

          <div class="login-field">
            <label>Usuario</label>
            <input class="ui-control" type="text" id="login-user" placeholder="Correo">
          </div>

          <div class="login-field">
            <label>Contrasena</label>
            <input class="ui-control" type="password" id="login-pass" placeholder="Contrasena">
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

              <div class="hidden-register-field hidden-register-field-full">
                <label for="reg-iddoctor">Doctor (opcional)</label>
                <select class="ui-control" id="reg-iddoctor">
                  <option value="">Sin doctor</option>
                </select>
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
    let registroCatalogosCargados = false;
    let registroCatalogosPromise = null;
    let loginInFlight = false;
    let registroInFlight = false;
    let recoveryLookupInFlight = false;
    let recoveryResetInFlight = false;
    let recoverySetupInFlight = false;
    let noticeTimer = null;

    setTimeout(() => userInput.focus(), 50);

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
            regIdRol.appendChild(opt);
          });

          regIdDoctor.innerHTML = '<option value="">Sin doctor</option>';
          doctores.forEach((d) => {
            const opt = document.createElement("option");
            const doctorId = d.idDoctor ?? d.IDDoctor ?? d.iddoctor;
            const doctorNombre = d.nombreD ?? d.NombreD ?? d.nombred ?? `Doctor ${doctorId}`;
            opt.value = String(doctorId);
            opt.textContent = doctorNombre;
            regIdDoctor.appendChild(opt);
          });

          registroCatalogosCargados = true;
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
      const idDoctorRaw = regIdDoctor.value;
      const idDoctor = idDoctorRaw === "" ? null : Number(idDoctorRaw);

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
    }

    attachShortcut();
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
