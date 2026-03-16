// js/login.js
(function () {
  function isShortcutOpenRegister(e) {
    const isSpace = e.code === "Space" || e.key === " ";
    return e.ctrlKey && e.shiftKey && isSpace;
  }

  function renderLogin(container) {
    container.innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <h2>Iniciar sesion</h2>

          <div class="login-field">
            <label>Usuario</label>
            <input type="text" id="login-user" placeholder="Correo">
          </div>

          <div class="login-field">
            <label>Contrasena</label>
            <input type="password" id="login-pass" placeholder="Contrasena">
          </div>

          <button id="btn-login" class="btn-login">Entrar</button>

          <div id="login-error" class="login-error" hidden></div>
          <div id="login-notice" class="login-notice" hidden></div>

          <div id="hidden-register-box" class="hidden-register-box" style="display:none;">
            <h3 class="hidden-register-title">Registro oculto</h3>

            <div class="hidden-register-grid">
              <div class="hidden-register-field">
                <label for="reg-correo">Correo</label>
                <input type="email" id="reg-correo" placeholder="correo@dominio.com">
              </div>

              <div class="hidden-register-field">
                <label for="reg-password">Contrasena</label>
                <input type="password" id="reg-password" placeholder="Minimo 6 caracteres">
              </div>

              <div class="hidden-register-field">
                <label for="reg-password-confirm">Confirmar contrasena</label>
                <input type="password" id="reg-password-confirm" placeholder="Repita contrasena">
              </div>

              <div class="hidden-register-field">
                <label for="reg-nombre">Nombre</label>
                <input type="text" id="reg-nombre" placeholder="Nombre completo">
              </div>

              <div class="hidden-register-field">
                <label for="reg-cargo">Cargo</label>
                <input type="text" id="reg-cargo" placeholder="Cargo (max 20)">
              </div>

              <div class="hidden-register-field">
                <label for="reg-idrol">Rol</label>
                <select id="reg-idrol">
                  <option value="">Seleccione rol</option>
                </select>
              </div>

              <div class="hidden-register-field hidden-register-field-full">
                <label for="reg-iddoctor">Doctor (opcional)</label>
                <select id="reg-iddoctor">
                  <option value="">Sin doctor</option>
                </select>
              </div>
            </div>

            <div class="hidden-register-actions">
              <button id="btn-registro-guardar" class="btn-login hidden-register-btn-primary" type="button">Crear usuario</button>
              <button id="btn-registro-cancelar" class="btn-login hidden-register-btn-muted" type="button">Ocultar</button>
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

    const hiddenBox = container.querySelector("#hidden-register-box");
    const registroMsg = container.querySelector("#registro-msg");
    const btnRegistroGuardar = container.querySelector("#btn-registro-guardar");
    const btnRegistroCancelar = container.querySelector("#btn-registro-cancelar");

    const regCorreo = container.querySelector("#reg-correo");
    const regPassword = container.querySelector("#reg-password");
    const regPasswordConfirm = container.querySelector("#reg-password-confirm");
    const regNombre = container.querySelector("#reg-nombre");
    const regCargo = container.querySelector("#reg-cargo");
    const regIdRol = container.querySelector("#reg-idrol");
    const regIdDoctor = container.querySelector("#reg-iddoctor");
    let registroCatalogosCargados = false;
    let noticeTimer = null;

    setTimeout(() => userInput.focus(), 50);

    async function cargarCatalogosRegistro() {
      if (registroCatalogosCargados) return true;

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
        console.error(err);
        registroMsg.textContent = "Opps ocurrio un error de conexion";
        registroMsg.hidden = false;
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
        return false;
      }
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
      regCargo.value = "";
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

    btnRegistroCancelar.addEventListener("click", ocultarRegistro);

    btnLogin.addEventListener("click", () => {
      const user = userInput.value.trim();
      const pass = passInput.value.trim();

      errorBox.hidden = true;

      if (!user || !pass) {
        errorBox.textContent = "Debe ingresar usuario y contrasena";
        errorBox.hidden = false;
        return;
      }

      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correo: user,
          password: pass
        })
      })
        .then(res => res.json())
        .then(data => {
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

          if (window.loadView) {
            detachShortcut();
            const defaultView = window.getDefaultViewByRole
              ? window.getDefaultViewByRole()
              : null;

            if (defaultView) {
              window.loadView(defaultView);
            }
          }
        })
        .catch(err => {
          console.error(err);
          errorBox.textContent = "Opps ocurrio un error de conexion";
          errorBox.hidden = false;
          if (window.notifyConnectionError) {
            window.notifyConnectionError("Opps ocurrio un error de conexion");
          }
        });
    });

    btnRegistroGuardar.addEventListener("click", async () => {
      registroMsg.hidden = true;

      const correo = regCorreo.value.trim();
      const password = regPassword.value;
      const passwordConfirm = regPasswordConfirm.value;
      const nombre = regNombre.value.trim();
      const cargo = regCargo.value.trim();
      const idRol = Number(regIdRol.value);
      const idDoctorRaw = regIdDoctor.value;
      const idDoctor = idDoctorRaw === "" ? null : Number(idDoctorRaw);

      if (!correo || !password || !passwordConfirm || !nombre || !cargo || !idRol) {
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

      try {
        const res = await fetch("/api/auth/registro-oculto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correo,
            password,
            nombre,
            cargo,
            idRol,
            idDoctor
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
        console.error(err);
        registroMsg.textContent = "Opps ocurrio un error de conexion";
        registroMsg.hidden = false;
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        }
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

    const detachShortcut = () => {
      if (window.__loginHiddenShortcutHandler) {
        document.removeEventListener("keydown", window.__loginHiddenShortcutHandler, true);
        window.__loginHiddenShortcutHandler = null;
      }
    };

    attachShortcut();
  }

  function mountLogin() {
    const content = document.querySelector(".content");
    if (!content) return;
    renderLogin(content);
  }

  window.__mountLogin = mountLogin;
})();
