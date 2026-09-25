// doctor.js
(function () {
  const doctorData = [];
  const pendientesData = [];

  function renderIcon(name, className) {
    const registry = window.__uiIcons;
    if (!registry || typeof registry.get !== "function") return "";
    return registry.get(name, { className: className || "ui-action-icon" });
  }

  function normalizarRutaMedia(ruta) {
    const raw = String(ruta || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
    const sane = raw.replace(/\\/g, "/");
    return sane.startsWith("/") ? sane : `/${sane}`;
  }

  function normalizarEstadoDoctor(value) {
    const txt = String(value ?? "").trim().toLowerCase();
    if (txt === "0" || txt === "inactivo" || txt === "inactive" || txt === "false") return 0;
    if (txt === "1" || txt === "activo" || txt === "active" || txt === "true") return 1;
    return Number(value) === 0 ? 0 : 1;
  }

  function estadoLabel(estadoD) {
    return Number(estadoD) === 1 ? "Activo" : "Inactivo";
  }

  function cacheBustMedia(ruta) {
    const clean = normalizarRutaMedia(ruta);
    if (!clean) return "";
    const sep = clean.includes("?") ? "&" : "?";
    return `${clean}${sep}v=${Date.now()}`;
  }

  async function leerRespuestaApi(res, fallbackMessage) {
    const text = await res.text();
    const contentType = String(res.headers?.get?.("content-type") || "").toLowerCase();
    if (contentType.includes("application/json") || /^[\s\r\n]*[{[]/.test(text)) {
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        throw new Error(fallbackMessage || "Respuesta invalida del servidor");
      }
    }

    if (!res.ok) {
      if (res.status === 413) {
        throw new Error("La imagen es demasiado grande. Seleccione una firma mas liviana.");
      }
      throw new Error(fallbackMessage || "El servidor devolvio una respuesta no valida");
    }

    throw new Error(fallbackMessage || "Respuesta invalida del servidor");
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "--";
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return raw;
  }

  function formatMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "$0.00";
    return `$${n.toFixed(2)}`;
  }

  function createDoctorMediaPreview(ruta, tipo) {
    const wrap = document.createElement("div");
    wrap.className = "doctor-media-preview";

    const label = document.createElement("span");
    label.className = "doctor-media-preview-label";
    label.textContent = tipo === "firma" ? "Firma" : "Sello";
    wrap.appendChild(label);

    const box = document.createElement("span");
    box.className = "doctor-media-preview-box";
    const media = normalizarRutaMedia(ruta);
    if (media) {
      const img = document.createElement("img");
      img.className = "doctor-media-preview-img";
      img.src = media;
      img.alt = tipo === "firma" ? "Firma del doctor" : "Sello del doctor";
      box.appendChild(img);
    } else {
      const empty = document.createElement("span");
      empty.className = "doctor-media-preview-empty";
      empty.textContent = tipo === "firma" ? "No registrada" : "No registrado";
      box.appendChild(empty);
    }
    wrap.appendChild(box);

    return wrap;
  }

  function openModalCompat(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = "flex";
    modalEl.classList.add("show");
  }

  function closeModalCompat(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("show");
    modalEl.style.display = "none";
  }

  function renderDoctor(container) {
    const currentUser = typeof window.getCurrentUser === "function"
      ? window.getCurrentUser()
      : null;
    const esDoctorLogueado = currentUser?.rol === "Doctor";
    const puedeGestionarDoctores = ["Administrador", "Recepcion"].includes(currentUser?.rol);

    container.innerHTML = `
      <div class="doctor-container">
        <div class="doctor-header">
          <div class="doctor-title">Doctores</div>
          <div class="doctor-controls ui-toolbar">
            <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
            <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
            <input class="ui-control ui-control-search" type="search" id="doctor-search" name="doctor-search-lista" placeholder="Buscar doctor..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
            ${puedeGestionarDoctores
              ? `<button id="doctor-add" class="ui-toolbar-btn is-success">
                  ${renderIcon("plus", "ui-toolbar-icon")}
                  <span>Registrar Doctor</span>
                </button>`
              : ""}
            ${esDoctorLogueado
              ? `<button id="doctor-change-password-btn" class="ui-toolbar-btn is-success" type="button">
                  ${renderIcon("lock-closed", "ui-toolbar-icon") || renderIcon("shield-check", "ui-toolbar-icon")}
                  <span>Cambiar contrasena</span>
                </button>`
              : ""}
          </div>
        </div>

        <div class="doctor-table-wrap ui-table-wrap-compact">
          <table class="doctor-table ui-table-compact">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Telefono</th>
                <th>Estado</th>
                <th>Firma</th>
                <th>Sello</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="doctor-tbody"></tbody>
          </table>
        </div>

        ${esDoctorLogueado
          ? `<section id="doctor-pendientes-section" class="doctor-pendientes-section">
              <div class="doctor-pendientes-header">
                <div>
                  <h3>Pendientes por autorizar</h3>
                  <p>Ultimos 20 procedimientos pendientes de autorizacion</p>
                </div>
                <button id="doctor-autorizar-todos" class="ui-toolbar-btn is-success" type="button">
                  ${renderIcon("check", "ui-toolbar-icon")}
                  <span>Autorizar todos</span>
                </button>
              </div>
              <div class="doctor-table-wrap doctor-pendientes-wrap ui-table-wrap-compact">
                <table class="doctor-table doctor-pendientes-table ui-table-compact">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha</th>
                      <th>Paciente</th>
                      <th>Procedimiento</th>
                      <th>Valor</th>
                      <th>Abono</th>
                      <th>Saldo</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody id="doctor-pendientes-tbody"></tbody>
                </table>
                <div id="doctor-pendientes-loader" class="doctor-pendientes-loader" aria-live="polite" aria-atomic="true" hidden>
                  <div class="doctor-pendientes-loader-card">
                    <span class="doctor-pendientes-loader-spinner" aria-hidden="true"></span>
                    <span id="doctor-pendientes-loader-text">Autorizando pendientes...</span>
                  </div>
                </div>
              </div>
            </section>`
          : ""}
      </div>

      <div id="doctor-estado-modal" class="modal">
        <div class="modal-content">
          <h2>Cambiar estado del doctor</h2>
          <p id="doctor-estado-target" class="doctor-estado-target"></p>
          <label>Contrasena</label>
          <input type="password" id="doctor-estado-password" placeholder="Contrasena del doctor">
          <div class="modal-buttons">
            <button id="doctor-estado-cancel" class="btn-cancelar">Cancelar</button>
            <button id="doctor-estado-save" class="btn-cobrar">Confirmar</button>
          </div>
        </div>
      </div>

      <div id="doctor-firma-update-modal" class="modal">
        <div class="modal-content">
          <h2>Actualizar firma</h2>
          <p id="doctor-firma-update-target" class="doctor-estado-target"></p>
          <label>Firma (dibuje abajo o suba imagen)</label>
          <input type="file" id="doctor-firma-update-file" class="doctor-file-input" accept="image/*">
          <canvas id="doctor-firma-update-canvas" class="signature-canvas"></canvas>
          <div class="signature-actions">
            <button id="doctor-firma-update-clear" class="btn-clear-sign" type="button">Limpiar firma</button>
          </div>
          <div class="modal-buttons" style="margin-top:20px;">
            <button id="doctor-firma-update-cancel" class="btn-cancelar" type="button">Cancelar</button>
            <button id="doctor-firma-update-save" class="btn-cobrar" type="button">Guardar</button>
          </div>
        </div>
      </div>

      <div id="doctor-password-modal" class="modal">
        <div class="modal-content doctor-password-modal-content">
          <h2>Cambiar contrasena</h2>
          <label>Contrasena actual</label>
          <input type="password" id="doctor-password-current" placeholder="Contrasena actual" autocomplete="current-password">
          <label>Nueva contrasena</label>
          <input type="password" id="doctor-password-new" placeholder="Minimo 6 caracteres" autocomplete="new-password">
          <label>Confirmar nueva contrasena</label>
          <input type="password" id="doctor-password-confirm" placeholder="Repita la nueva contrasena" autocomplete="new-password">
          <p id="doctor-password-message" class="doctor-password-message" aria-live="polite"></p>
          <div class="modal-buttons" style="margin-top:20px;">
            <button id="doctor-password-cancel" class="btn-cancelar" type="button">Cancelar</button>
            <button id="doctor-password-save" class="btn-cobrar" type="button">Guardar</button>
          </div>
        </div>
      </div>
    `;

    const tbody = container.querySelector("#doctor-tbody");
    const searchInput = container.querySelector("#doctor-search");
    const regBtn = container.querySelector("#doctor-add");
    const btnChangePassword = container.querySelector("#doctor-change-password-btn");

    const modal = document.querySelector("#modal-doctor");
    const modalCancel = document.querySelector("#modal-doctor-cancel");
    const modalSave = document.querySelector("#modal-doctor-save");
    const modalNombre = document.querySelector("#doctor-nombre");
    const modalTelefono = document.querySelector("#doctor-telefono");
    const modalSello = document.querySelector("#doctor-sello");

    const canvas = document.querySelector("#signature-canvas");
    const btnClearSign = document.querySelector("#btn-clear-sign");
    const firmaFileInput = document.querySelector("#doctor-firma-file");

    const modalVer = document.querySelector("#modal-ver-firma");
    const modalVerCerrar = document.querySelector("#modal-ver-cerrar");
    const firmaImg = document.querySelector("#firma-img");

    const modalVerSello = document.querySelector("#modal-ver-sello");
    const modalVerSelloCerrar = document.querySelector("#modal-ver-sello-cerrar");
    const selloImg = document.querySelector("#sello-img");

    const modalEstado = container.querySelector("#doctor-estado-modal");
    const modalEstadoTarget = container.querySelector("#doctor-estado-target");
    const modalEstadoPass = container.querySelector("#doctor-estado-password");
    const modalEstadoCancel = container.querySelector("#doctor-estado-cancel");
    const modalEstadoSave = container.querySelector("#doctor-estado-save");
    const pendientesTbody = container.querySelector("#doctor-pendientes-tbody");
    const btnAutorizarTodos = container.querySelector("#doctor-autorizar-todos");
    const pendientesWrap = container.querySelector(".doctor-pendientes-wrap");
    const pendientesLoader = container.querySelector("#doctor-pendientes-loader");
    const pendientesLoaderText = container.querySelector("#doctor-pendientes-loader-text");
    const modalFirmaUpdate = container.querySelector("#doctor-firma-update-modal");
    const modalFirmaUpdateTarget = container.querySelector("#doctor-firma-update-target");
    const modalFirmaUpdateFile = container.querySelector("#doctor-firma-update-file");
    const modalFirmaUpdateCanvas = container.querySelector("#doctor-firma-update-canvas");
    const modalFirmaUpdateClear = container.querySelector("#doctor-firma-update-clear");
    const modalFirmaUpdateCancel = container.querySelector("#doctor-firma-update-cancel");
    const modalFirmaUpdateSave = container.querySelector("#doctor-firma-update-save");
    const modalPassword = container.querySelector("#doctor-password-modal");
    const passwordCurrentInput = container.querySelector("#doctor-password-current");
    const passwordNewInput = container.querySelector("#doctor-password-new");
    const passwordConfirmInput = container.querySelector("#doctor-password-confirm");
    const passwordMessage = container.querySelector("#doctor-password-message");
    const passwordCancel = container.querySelector("#doctor-password-cancel");
    const passwordSave = container.querySelector("#doctor-password-save");

    let doctorPropioId = null;
    let doctorEstadoTarget = null;
    let firmaUpdateTargetId = null;

    let ctx = null;
    let firmaUpdateCtx = null;
    let drawing = false;
    let drawingFirmaUpdate = false;
    // true cuando el lienzo tiene trazo o imagen cargada; evita guardar firmas en blanco.
    let firmaTieneTrazo = false;
    let firmaUpdateTieneTrazo = false;
    let isCreatingDoctor = false;
    let isUpdatingEstado = false;
    let isUpdatingFirma = false;
    let isAuthorizingAll = false;
    let isChangingPassword = false;
    let doctorFetchSeq = 0;
    let doctorFetchController = null;
    let pendientesFetchSeq = 0;
    let pendientesFetchController = null;

    function resetDoctorModalState() {
      if (modalNombre) modalNombre.value = "";
      if (modalTelefono) modalTelefono.value = "";
      if (modalSello) modalSello.value = "";
      if (firmaFileInput) firmaFileInput.value = "";
      if (modalFirmaUpdateFile) modalFirmaUpdateFile.value = "";
      resetPasswordModalState();
      if (firmaImg) firmaImg.src = "";
      if (selloImg) selloImg.src = "";
      clearCanvas();
      clearFirmaUpdateCanvas();
    }

    function resetPasswordModalState() {
      if (passwordCurrentInput) passwordCurrentInput.value = "";
      if (passwordNewInput) passwordNewInput.value = "";
      if (passwordConfirmInput) passwordConfirmInput.value = "";
      if (passwordMessage) {
        passwordMessage.textContent = "";
        passwordMessage.classList.remove("is-error", "is-success");
      }
    }

    function setPasswordMessage(message, type = "error") {
      if (!passwordMessage) return;
      passwordMessage.textContent = String(message || "");
      passwordMessage.classList.toggle("is-error", type === "error");
      passwordMessage.classList.toggle("is-success", type === "success");
    }

    function cerrarModalEstadoDoctor() {
      doctorEstadoTarget = null;
      if (modalEstadoPass) modalEstadoPass.value = "";
      closeModalCompat(modalEstado);
    }

    function cerrarModalActualizarFirma() {
      firmaUpdateTargetId = null;
      if (modalFirmaUpdateFile) modalFirmaUpdateFile.value = "";
      clearFirmaUpdateCanvas();
      closeModalCompat(modalFirmaUpdate);
    }

    function abrirModalCambiarPassword() {
      resetPasswordModalState();
      openModalCompat(modalPassword);
      passwordCurrentInput?.focus();
    }

    function cerrarModalCambiarPassword() {
      resetPasswordModalState();
      closeModalCompat(modalPassword);
    }

    function closeDoctorModales() {
      closeModalCompat(modal);
      closeModalCompat(modalVer);
      closeModalCompat(modalVerSello);
      cerrarModalEstadoDoctor();
      cerrarModalActualizarFirma();
      cerrarModalCambiarPassword();
    }

    // Redimensiona el lienzo al tamano visible (HD). Cambiar width/height borra el
    // contenido, asi que si ya hay firma se copia antes y se vuelve a pintar
    // (en tablet: girar pantalla o abrir teclado dispara resize).
    function prepararCanvasFirmaHD(targetCanvas, currentCtx, conservarTrazo) {
      const rect = targetCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return currentCtx;

      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.round(rect.width * dpr);
      const nextHeight = Math.round(rect.height * dpr);

      if (targetCanvas.width === nextWidth && targetCanvas.height === nextHeight && currentCtx) {
        return currentCtx;
      }

      let snapshot = null;
      if (conservarTrazo && currentCtx && targetCanvas.width && targetCanvas.height) {
        snapshot = document.createElement("canvas");
        snapshot.width = targetCanvas.width;
        snapshot.height = targetCanvas.height;
        snapshot.getContext("2d")?.drawImage(targetCanvas, 0, 0);
      }

      targetCanvas.width = nextWidth;
      targetCanvas.height = nextHeight;
      const nextCtx = targetCanvas.getContext("2d");
      if (!nextCtx) return null;

      nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nextCtx.fillStyle = "#ffffff";
      nextCtx.fillRect(0, 0, rect.width, rect.height);

      if (snapshot) {
        const escala = Math.min(rect.width / snapshot.width, rect.height / snapshot.height);
        const drawW = snapshot.width * escala;
        const drawH = snapshot.height * escala;
        nextCtx.drawImage(snapshot, (rect.width - drawW) / 2, (rect.height - drawH) / 2, drawW, drawH);
      }

      nextCtx.strokeStyle = "#000000";
      nextCtx.lineWidth = 2;
      nextCtx.lineCap = "round";
      return nextCtx;
    }

    function setupCanvasHD() {
      if (!canvas) return;
      ctx = prepararCanvasFirmaHD(canvas, ctx, firmaTieneTrazo);
    }

    function clearCanvas() {
      firmaTieneTrazo = false;
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "#ffffff";
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    function setupFirmaUpdateCanvasHD() {
      if (!modalFirmaUpdateCanvas) return;
      firmaUpdateCtx = prepararCanvasFirmaHD(modalFirmaUpdateCanvas, firmaUpdateCtx, firmaUpdateTieneTrazo);
    }

    function clearFirmaUpdateCanvas() {
      firmaUpdateTieneTrazo = false;
      if (!modalFirmaUpdateCanvas || !firmaUpdateCtx) return;
      const rect = modalFirmaUpdateCanvas.getBoundingClientRect();
      firmaUpdateCtx.fillStyle = "#ffffff";
      firmaUpdateCtx.clearRect(0, 0, rect.width, rect.height);
      firmaUpdateCtx.fillRect(0, 0, rect.width, rect.height);
    }

    function dibujarImagenEnCanvas(img) {
      if (!canvas) return;
      if (!ctx) setupCanvasHD();
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      ctx.fillStyle = "#ffffff";
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillRect(0, 0, rect.width, rect.height);

      const imgW = Number(img?.naturalWidth || img?.width || 0);
      const imgH = Number(img?.naturalHeight || img?.height || 0);
      if (!imgW || !imgH) return;

      const escala = Math.min(rect.width / imgW, rect.height / imgH);
      const drawW = imgW * escala;
      const drawH = imgH * escala;
      const x = (rect.width - drawW) / 2;
      const y = (rect.height - drawH) / 2;

      ctx.drawImage(img, x, y, drawW, drawH);
      firmaTieneTrazo = true;
    }

    function dibujarImagenEnFirmaUpdateCanvas(img) {
      if (!modalFirmaUpdateCanvas) return;
      if (!firmaUpdateCtx) setupFirmaUpdateCanvasHD();
      if (!firmaUpdateCtx) return;

      const rect = modalFirmaUpdateCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      firmaUpdateCtx.fillStyle = "#ffffff";
      firmaUpdateCtx.clearRect(0, 0, rect.width, rect.height);
      firmaUpdateCtx.fillRect(0, 0, rect.width, rect.height);

      const imgW = Number(img?.naturalWidth || img?.width || 0);
      const imgH = Number(img?.naturalHeight || img?.height || 0);
      if (!imgW || !imgH) return;

      const escala = Math.min(rect.width / imgW, rect.height / imgH);
      const drawW = imgW * escala;
      const drawH = imgH * escala;
      const x = (rect.width - drawW) / 2;
      const y = (rect.height - drawH) / 2;

      firmaUpdateCtx.drawImage(img, x, y, drawW, drawH);
      firmaUpdateTieneTrazo = true;
    }

    function cargarFirmaDesdeArchivo(file) {
      return new Promise((resolve, reject) => {
        if (!file) {
          reject(new Error("Archivo no valido"));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("La imagen no es valida"));
          img.src = String(reader.result || "");
        };
        reader.readAsDataURL(file);
      });
    }

    function abrirModalEstadoDoctor(doctor, estadoDestino) {
      doctorEstadoTarget = {
        id: Number(doctor?.id || 0),
        estadoD: Number(estadoDestino) === 1 ? 1 : 0,
        nombre: String(doctor?.nombre || "").trim()
      };

      if (modalEstadoTarget) {
        const accion = doctorEstadoTarget.estadoD === 1 ? "activar" : "inactivar";
        modalEstadoTarget.textContent = `Doctor: ${doctorEstadoTarget.nombre} - Confirme para ${accion}.`;
      }
      if (modalEstadoPass) modalEstadoPass.value = "";
      openModalCompat(modalEstado);
      modalEstadoPass?.focus();
    }

    function abrirModalActualizarFirma(doctor) {
      const id = Number(doctor?.id || 0);
      if (!id) return;
      firmaUpdateTargetId = id;
      if (modalFirmaUpdateTarget) {
        modalFirmaUpdateTarget.textContent = `Doctor: ${String(doctor?.nombre || "").trim()}`;
      }
      if (modalFirmaUpdateFile) modalFirmaUpdateFile.value = "";
      openModalCompat(modalFirmaUpdate);
      requestAnimationFrame(() => {
        setupFirmaUpdateCanvasHD();
        clearFirmaUpdateCanvas();
      });
    }

    async function actualizarFirmaDoctor() {
      const id = Number(firmaUpdateTargetId || 0);
      if (!id || !modalFirmaUpdateCanvas || isUpdatingFirma) return;
      if (!firmaUpdateTieneTrazo) {
        alert("Debe firmar o cargar una imagen antes de guardar.");
        return;
      }

      isUpdatingFirma = true;
      if (modalFirmaUpdateSave) modalFirmaUpdateSave.disabled = true;
      window.saveFx?.start(modalFirmaUpdateSave);

      try {
        const firmaBase64 = modalFirmaUpdateCanvas.toDataURL("image/png");
        const res = await fetch(`/api/doctor/${id}/firma`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firmaBase64 })
        });
        const json = await leerRespuestaApi(res, "No se pudo actualizar la firma");
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo actualizar la firma");
        }

        const local = doctorData.find((d) => Number(d.id || 0) === id);
        if (local) local.firma = cacheBustMedia(json.firma);
        await window.saveFx?.success(modalFirmaUpdateSave);
        cerrarModalActualizarFirma();
        aplicarFiltroTexto();
      } catch (err) {
        console.error("No se pudo actualizar firma de doctor", err);
        window.saveFx?.error(modalFirmaUpdateSave);
        alert(err?.message || "No se pudo actualizar la firma.");
      } finally {
        window.saveFx?.stop(modalFirmaUpdateSave);
        isUpdatingFirma = false;
        if (modalFirmaUpdateSave && modalFirmaUpdateSave.isConnected) {
          modalFirmaUpdateSave.disabled = false;
        }
      }
    }

    async function resolverDoctorPropio() {
      doctorPropioId = null;
      if (!esDoctorLogueado) return;

      try {
        const res = await fetch("/api/doctor/select?soloVinculado=1", { cache: "no-store" });
        const json = await res.json();
        if (
          json?.ok &&
          json?.doctorVinculado === true &&
          Array.isArray(json.data) &&
          json.data.length === 1
        ) {
          const id = Number(json.data[0]?.idDoctor || 0);
          doctorPropioId = Number.isInteger(id) && id > 0 ? id : null;
        }
      } catch (err) {
        console.error("Error resolviendo doctor vinculado", err);
      }
    }

    async function cargarDoctores() {
      if (doctorFetchController) {
        try {
          doctorFetchController.abort();
        } catch {
          // ignore abort failures
        }
      }

      const localSeq = ++doctorFetchSeq;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      doctorFetchController = controller;
      const stopLd = window.toothSpinner?.tableLoading(tbody, { label: "Cargando doctores..." }) || (() => {});

      try {
        await resolverDoctorPropio();

        const fetchOptions = controller ? { signal: controller.signal, cache: "no-store" } : { cache: "no-store" };
        const res = await fetch("/api/doctor", fetchOptions);
        const json = await res.json();

        if (localSeq !== doctorFetchSeq || !container.isConnected) return;

        if (!res.ok || !json?.ok) {
          alert(json?.message || "Error al cargar doctores");
          return;
        }

        doctorData.length = 0;
        const rows = Array.isArray(json.data) ? json.data : [];
        rows.forEach((d) => {
          doctorData.push({
            id: Number(d.idDoctor || 0),
            nombre: String(d.nombreD || ""),
            telefono: String(d.TelefonoD || ""),
            estadoD: normalizarEstadoDoctor(d.estadoD),
            firma: normalizarRutaMedia(d.FirmaD),
            sello: normalizarRutaMedia(d.SelloD)
          });
        });

        aplicarFiltroTexto();
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (localSeq !== doctorFetchSeq || !container.isConnected) return;

        console.error(err);
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
          alert("Opps ocurrio un error de conexion");
        }
      } finally {
        stopLd();
        if (doctorFetchController === controller) {
          doctorFetchController = null;
        }
      }
    }

    async function cargarPendientesAutorizacion() {
      if (!esDoctorLogueado || !pendientesTbody) return;
      if (pendientesFetchController) {
        try {
          pendientesFetchController.abort();
        } catch {
          // ignore abort failures
        }
      }

      const localSeq = ++pendientesFetchSeq;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      pendientesFetchController = controller;
      const stopLd = window.toothSpinner?.tableLoading(pendientesTbody, { label: "Cargando pendientes..." }) || (() => {});

      try {
        const fetchOptions = controller ? { signal: controller.signal, cache: "no-store" } : { cache: "no-store" };
        const res = await fetch("/api/doctor/pendientes-autorizacion?limit=20", fetchOptions);
        const json = await res.json();

        if (localSeq !== pendientesFetchSeq || !container.isConnected) return;

        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "Error al cargar pendientes");
        }

        pendientesData.length = 0;
        const rows = Array.isArray(json.data) ? json.data : [];
        rows.forEach((row) => {
          pendientesData.push({
            idCita: Number(row.idcitasPaciente || 0),
            idPaciente: Number(row.idPaciente || 0),
            paciente: String(row.nombrePaciente || ""),
            fecha: String(row.fechaCP || ""),
            procedimiento: String(row.ProcedimientoCP || ""),
            valor: Number(row.valorCP || 0),
            abono: Number(row.abonoCP || 0),
            saldo: Number(row.saldoCP || 0)
          });
        });

        drawPendientes();
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (localSeq !== pendientesFetchSeq || !container.isConnected) return;

        console.error("Error al cargar pendientes de autorizacion", err);
        pendientesData.length = 0;
        drawPendientes(err?.message || "Error al cargar pendientes");
      } finally {
        stopLd();
        if (pendientesFetchController === controller) {
          pendientesFetchController = null;
        }
      }
    }

    async function autorizarPendiente(idCita, button) {
      const id = Number(idCita || 0);
      if (!id) return;
      if (button) button.disabled = true;

      try {
        const res = await fetch(`/api/paciente/cita/${id}/autorizar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo autorizar la cita");
        }

        await cargarPendientesAutorizacion();
      } catch (err) {
        console.error("No se pudo autorizar cita pendiente", err);
        alert(err?.message || "No se pudo autorizar la cita.");
        if (button && button.isConnected) button.disabled = false;
      }
    }

    async function autorizarTodosPendientes() {
      if (isAuthorizingAll) return;
      if (!confirm("Autorizar todos los pendientes de este doctor?")) return;

      isAuthorizingAll = true;
      setPendientesAuthorizationBusy(true, "Autorizando pendientes...");

      try {
        const res = await fetch("/api/doctor/pendientes-autorizacion/autorizar-todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudieron autorizar los pendientes");
        }

        await cargarPendientesAutorizacion();
        alert(`Citas autorizadas: ${Number(json.autorizadas || 0)}`);
      } catch (err) {
        console.error("No se pudieron autorizar todos los pendientes", err);
        alert(err?.message || "No se pudieron autorizar los pendientes.");
      } finally {
        isAuthorizingAll = false;
        setPendientesAuthorizationBusy(false);
      }
    }

    async function cambiarPasswordDoctor() {
      if (isChangingPassword) return;

      const passwordActual = String(passwordCurrentInput?.value || "");
      const nuevaPassword = String(passwordNewInput?.value || "");
      const confirmarPassword = String(passwordConfirmInput?.value || "");

      if (!passwordActual || !nuevaPassword || !confirmarPassword) {
        setPasswordMessage("Complete todos los campos.");
        return;
      }
      if (nuevaPassword !== confirmarPassword) {
        setPasswordMessage("La confirmacion no coincide.");
        passwordConfirmInput?.focus();
        return;
      }
      if (nuevaPassword.length < 6) {
        setPasswordMessage("La nueva contrasena debe tener al menos 6 caracteres.");
        passwordNewInput?.focus();
        return;
      }
      if (nuevaPassword.length > 72) {
        setPasswordMessage("La nueva contrasena es demasiado larga.");
        passwordNewInput?.focus();
        return;
      }

      isChangingPassword = true;
      if (passwordSave) passwordSave.disabled = true;
      setPasswordMessage("");
      window.saveFx?.start(passwordSave);

      try {
        const res = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passwordActual,
            nuevaPassword,
            confirmarPassword
          })
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo cambiar la contrasena");
        }

        setPasswordMessage("Contrasena actualizada correctamente.", "success");
        await window.saveFx?.success(passwordSave);
        if (modalPassword?.isConnected) cerrarModalCambiarPassword();
      } catch (err) {
        console.error("No se pudo cambiar contrasena", err);
        window.saveFx?.error(passwordSave);
        setPasswordMessage(err?.message || "No se pudo cambiar la contrasena.");
      } finally {
        window.saveFx?.stop(passwordSave);
        isChangingPassword = false;
        if (passwordSave && passwordSave.isConnected) {
          passwordSave.disabled = false;
        }
      }
    }

    async function onViewFirma(e) {
      const id = Number(e.currentTarget?.dataset?.id || 0);
      if (!id) return;

      let rutaFirma = "";
      const local = doctorData.find((d) => Number(d.id || 0) === id);
      if (local?.firma) rutaFirma = normalizarRutaMedia(local.firma);

      try {
        const res = await fetch(`/api/doctor/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (json?.ok && json?.data) {
          const remota = normalizarRutaMedia(json.data.FirmaD || json.data.firma);
          if (remota) rutaFirma = remota;
        }
      } catch (err) {
        console.error("Error al obtener firma de doctor", err);
      }

      if (!rutaFirma) {
        alert("El doctor no tiene firma registrada");
        return;
      }

      if (firmaImg) firmaImg.src = rutaFirma;
      openModalCompat(modalVer);
    }

    async function onViewSello(e) {
      const id = Number(e.currentTarget?.dataset?.id || 0);
      if (!id) return;

      let rutaSello = "";
      const local = doctorData.find((d) => Number(d.id || 0) === id);
      if (local?.sello) rutaSello = normalizarRutaMedia(local.sello);

      try {
        const res = await fetch(`/api/doctor/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (json?.ok && json?.data) {
          const remota = normalizarRutaMedia(json.data.SelloD || json.data.sello);
          if (remota) rutaSello = remota;
        }
      } catch (err) {
        console.error("Error al obtener sello de doctor", err);
      }

      if (!rutaSello) {
        alert("El doctor no tiene sello registrado");
        return;
      }

      if (selloImg) selloImg.src = rutaSello;
      openModalCompat(modalVerSello);
    }

    async function subirSelloDoctor(idDoctor, selloFile) {
      const id = Number(idDoctor || 0);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Doctor invalido para subir sello");
      }
      if (!selloFile) {
        throw new Error("Archivo de sello requerido");
      }

      const fd = new FormData();
      fd.append("sello", selloFile);

      const resSello = await fetch(`/api/doctor/${id}/sello`, {
        method: "POST",
        body: fd
      });

      let jsonSello = null;
      try {
        jsonSello = await resSello.json();
      } catch {
        jsonSello = null;
      }

      if (!resSello.ok || !jsonSello?.ok) {
        throw new Error(jsonSello?.message || "No se pudo subir el sello");
      }

      const ruta = normalizarRutaMedia(jsonSello.sello);
      if (!ruta) {
        throw new Error("El servidor no retorno ruta de sello");
      }
      return ruta;
    }

    function onUploadSello(e) {
      const id = Number(e.currentTarget?.dataset?.id || 0);
      if (!id) return;

      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/png,image/jpeg,image/jpg";
      picker.style.display = "none";
      document.body.appendChild(picker);

      picker.addEventListener("change", async () => {
        const file = picker.files?.[0] || null;
        picker.remove();
        if (!file) return;

        const fileType = String(file.type || "").toLowerCase();
        if (!["image/png", "image/jpeg", "image/jpg"].includes(fileType)) {
          alert("Formato de sello invalido. Use PNG o JPG.");
          return;
        }

        try {
          const rutaSello = await subirSelloDoctor(id, file);
          const local = doctorData.find((d) => Number(d.id || 0) === id);
          if (local) local.sello = cacheBustMedia(rutaSello);
          aplicarFiltroTexto();
          alert("Sello subido correctamente.");
        } catch (err) {
          console.error("No se pudo subir sello de doctor", err);
          alert(err?.message || "No se pudo subir el sello.");
        }
      }, { once: true });

      picker.click();
    }

    async function cambiarEstadoDoctorConPassword() {
      if (!doctorEstadoTarget?.id || isUpdatingEstado) return;

      const password = String(modalEstadoPass?.value || "");
      if (!password) {
        alert("Ingrese la contrasena del doctor");
        return;
      }

      isUpdatingEstado = true;
      if (modalEstadoSave) modalEstadoSave.disabled = true;

      try {
        const res = await fetch(`/api/doctor/${doctorEstadoTarget.id}/estado`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estadoD: doctorEstadoTarget.estadoD,
            password
          })
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.message || "No se pudo cambiar el estado del doctor");
        }

        const local = doctorData.find((d) => Number(d.id || 0) === doctorEstadoTarget.id);
        if (local) {
          local.estadoD = normalizarEstadoDoctor(json.estadoD);
        }
        cerrarModalEstadoDoctor();
        aplicarFiltroTexto();
      } catch (err) {
        console.error(err);
        alert(err?.message || "Error al cambiar estado del doctor");
      } finally {
        isUpdatingEstado = false;
        if (modalEstadoSave) modalEstadoSave.disabled = false;
      }
    }

    // Llenado animado (tableFx.js): caen al cargar; al buscar/actualizar se reacomodan.
    function drawRows(list) {
      const fx = window.tableFx?.begin(tbody);
      tbody.innerHTML = "";

      if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay doctores</td></tr>`;
        fx?.end();
        return;
      }

      list.forEach((doctor) => {
        const tr = document.createElement("tr");
        if (doctor.id != null) {
          tr.dataset.fxKey = String(doctor.id);
          tr.dataset.fxSig = JSON.stringify(doctor);
        }

        const estadoD = normalizarEstadoDoctor(doctor.estadoD);
        const esActivo = estadoD === 1;
        const esDoctorPropio = Number(doctor.id || 0) === Number(doctorPropioId || 0);
        const puedeCambiarEstado = esDoctorLogueado && esDoctorPropio;
        const estadoDestino = esActivo ? 0 : 1;

        const tdNombre = document.createElement("td");
        tdNombre.textContent = String(doctor.nombre || "");
        tr.appendChild(tdNombre);

        const tdTelefono = document.createElement("td");
        tdTelefono.textContent = String(doctor.telefono || "");
        tr.appendChild(tdTelefono);

        const tdEstado = document.createElement("td");
        const estadoChip = document.createElement("span");
        estadoChip.className = `doctor-estado-chip ${esActivo ? "is-activo" : "is-inactivo"}`;
        estadoChip.textContent = estadoLabel(estadoD);
        tdEstado.appendChild(estadoChip);
        tr.appendChild(tdEstado);

        const tdFirma = document.createElement("td");
        if (esDoctorLogueado && esDoctorPropio) {
          tdFirma.appendChild(createDoctorMediaPreview(doctor.firma, "firma"));
        } else if (doctor.firma) {
          const btnFirma = document.createElement("button");
          btnFirma.className = "ui-action-btn is-info row-btn view-firma";
          btnFirma.dataset.id = String(doctor.id);
          btnFirma.title = "Ver Firma";
          btnFirma.setAttribute("aria-label", "Ver firma de doctor");
          btnFirma.innerHTML = renderIcon("document-text");
          btnFirma.addEventListener("click", onViewFirma);
          tdFirma.appendChild(btnFirma);
        } else {
          const noFirma = document.createElement("em");
          noFirma.style.color = "#64748b";
          noFirma.textContent = "Sin firma";
          tdFirma.appendChild(noFirma);
        }
        tr.appendChild(tdFirma);

        const tdSello = document.createElement("td");
        if (esDoctorLogueado && esDoctorPropio) {
          tdSello.appendChild(createDoctorMediaPreview(doctor.sello, "sello"));
        } else if (doctor.sello) {
          const btnSello = document.createElement("button");
          btnSello.className = "ui-action-btn is-primary row-btn view-sello";
          btnSello.dataset.id = String(doctor.id);
          btnSello.title = "Ver Sello";
          btnSello.setAttribute("aria-label", "Ver sello de doctor");
          btnSello.innerHTML = renderIcon("shield-check");
          btnSello.addEventListener("click", onViewSello);
          tdSello.appendChild(btnSello);
        } else {
          const noSelloWrap = document.createElement("div");
          noSelloWrap.className = "doctor-sello-missing";

          const noSello = document.createElement("em");
          noSello.style.color = "#64748b";
          noSello.textContent = "Sin sello";
          noSelloWrap.appendChild(noSello);

          if (puedeGestionarDoctores) {
            const btnSubirSello = document.createElement("button");
            btnSubirSello.className = "ui-action-btn is-success row-btn upload-sello";
            btnSubirSello.dataset.id = String(doctor.id);
            btnSubirSello.title = "Subir sello";
            btnSubirSello.setAttribute("aria-label", "Subir sello de doctor");
            btnSubirSello.innerHTML = renderIcon("arrow-up");
            btnSubirSello.addEventListener("click", onUploadSello);
            noSelloWrap.appendChild(btnSubirSello);
          }

          tdSello.appendChild(noSelloWrap);
        }
        tr.appendChild(tdSello);

        const tdAcciones = document.createElement("td");
        tdAcciones.className = "doctor-row-actions";
        if (puedeCambiarEstado) {
          const actionsPanel = document.createElement("div");
          actionsPanel.className = "doctor-own-actions-panel";

          const btnEstado = document.createElement("button");
          btnEstado.type = "button";
          btnEstado.className = "doctor-own-action-btn is-warning row-btn doctor-toggle-estado";
          btnEstado.dataset.id = String(doctor.id);
          btnEstado.dataset.estadoTarget = String(estadoDestino);
          btnEstado.title = esActivo ? "Marcar inactivo" : "Marcar activo";
          btnEstado.setAttribute(
            "aria-label",
            esActivo ? "Marcar doctor inactivo" : "Marcar doctor activo"
          );
          btnEstado.innerHTML = `
            ${renderIcon("arrow-path", "doctor-own-action-icon")}
            <span>${esActivo ? "Marcar inactivo" : "Marcar activo"}</span>
          `;
          btnEstado.addEventListener("click", () => {
            abrirModalEstadoDoctor(doctor, estadoDestino);
          });
          actionsPanel.appendChild(btnEstado);

          const btnFirmaUpdate = document.createElement("button");
          btnFirmaUpdate.type = "button";
          btnFirmaUpdate.className = "doctor-own-action-btn is-info row-btn doctor-update-firma";
          btnFirmaUpdate.dataset.id = String(doctor.id);
          btnFirmaUpdate.title = "Actualizar firma";
          btnFirmaUpdate.setAttribute("aria-label", "Actualizar firma del doctor");
          btnFirmaUpdate.innerHTML = `
            ${renderIcon("document-text", "doctor-own-action-icon")}
            <span>Actualizar firma</span>
          `;
          btnFirmaUpdate.addEventListener("click", () => {
            abrirModalActualizarFirma(doctor);
          });
          actionsPanel.appendChild(btnFirmaUpdate);

          const btnSelloUpdate = document.createElement("button");
          btnSelloUpdate.type = "button";
          btnSelloUpdate.className = "doctor-own-action-btn is-success row-btn doctor-update-sello";
          btnSelloUpdate.dataset.id = String(doctor.id);
          btnSelloUpdate.title = "Actualizar sello";
          btnSelloUpdate.setAttribute("aria-label", "Actualizar sello del doctor");
          btnSelloUpdate.innerHTML = `
            ${renderIcon("shield-check", "doctor-own-action-icon")}
            <span>Actualizar sello</span>
          `;
          btnSelloUpdate.addEventListener("click", onUploadSello);
          actionsPanel.appendChild(btnSelloUpdate);
          tdAcciones.appendChild(actionsPanel);
        } else {
          const noAction = document.createElement("em");
          noAction.style.color = "#94a3b8";
          noAction.textContent = "--";
          tdAcciones.appendChild(noAction);
        }
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
      });
      fx?.end();
    }

    function drawPendientes(errorMessage = "") {
      if (!pendientesTbody) return;
      const fx = window.tableFx?.begin(pendientesTbody);
      pendientesTbody.innerHTML = "";

      if (errorMessage) {
        pendientesTbody.innerHTML = `<tr class="empty-row"><td colspan="8" style="text-align:center; color:var(--text-muted)">${errorMessage}</td></tr>`;
        fx?.end();
        return;
      }

      if (!pendientesData.length) {
        pendientesTbody.innerHTML = `<tr class="empty-row"><td colspan="8" style="text-align:center; color:var(--text-muted)">Sin citas pendientes por autorizar</td></tr>`;
        fx?.end();
        return;
      }

      pendientesData.forEach((item, index) => {
        const tr = document.createElement("tr");
        if (item.idCita != null) {
          tr.dataset.fxKey = String(item.idCita);
          tr.dataset.fxSig = JSON.stringify(item);
        }

        const tdIndex = document.createElement("td");
        tdIndex.textContent = String(index + 1);
        tr.appendChild(tdIndex);

        const tdFecha = document.createElement("td");
        tdFecha.textContent = formatDate(item.fecha);
        tr.appendChild(tdFecha);

        const tdPaciente = document.createElement("td");
        tdPaciente.textContent = item.paciente || "--";
        tr.appendChild(tdPaciente);

        const tdProcedimiento = document.createElement("td");
        tdProcedimiento.textContent = item.procedimiento || "--";
        tr.appendChild(tdProcedimiento);

        const tdValor = document.createElement("td");
        tdValor.textContent = formatMoney(item.valor);
        tr.appendChild(tdValor);

        const tdAbono = document.createElement("td");
        tdAbono.textContent = formatMoney(item.abono);
        tr.appendChild(tdAbono);

        const tdSaldo = document.createElement("td");
        tdSaldo.textContent = formatMoney(item.saldo);
        tr.appendChild(tdSaldo);

        const tdAccion = document.createElement("td");
        const btnAutorizar = document.createElement("button");
        btnAutorizar.className = "ui-action-btn is-success row-btn doctor-pending-authorize";
        btnAutorizar.dataset.id = String(item.idCita);
        btnAutorizar.title = "Autorizar";
        btnAutorizar.setAttribute("aria-label", "Autorizar cita pendiente");
        btnAutorizar.disabled = isAuthorizingAll;
        btnAutorizar.innerHTML = renderIcon("check");
        btnAutorizar.addEventListener("click", (ev) => {
          autorizarPendiente(item.idCita, ev.currentTarget);
        });
        tdAccion.appendChild(btnAutorizar);
        tr.appendChild(tdAccion);

        pendientesTbody.appendChild(tr);
      });
      fx?.end();
    }

    function setPendientesAuthorizationBusy(isBusy, message = "Autorizando pendientes...") {
      if (btnAutorizarTodos && btnAutorizarTodos.isConnected) {
        btnAutorizarTodos.disabled = isBusy;
        btnAutorizarTodos.classList.toggle("is-loading", isBusy);
      }
      if (pendientesWrap) {
        pendientesWrap.classList.toggle("is-loading", isBusy);
      }
      if (pendientesLoader) {
        pendientesLoader.hidden = !isBusy;
      }
      if (pendientesLoaderText) {
        pendientesLoaderText.textContent = message;
      }
      pendientesTbody
        ?.querySelectorAll?.(".doctor-pending-authorize")
        ?.forEach((button) => {
          button.disabled = isBusy;
        });
    }

    function aplicarFiltroTexto() {
      const q = String(searchInput?.value || "").trim().toLowerCase();
      const filtrados = doctorData.filter((d) =>
        String(d.nombre || "").toLowerCase().includes(q)
      );
      drawRows(filtrados);
    }

    if (searchInput) {
      searchInput.setAttribute("name", `doctor-search-${Date.now()}`);
      searchInput.value = "";
      searchInput.readOnly = true;
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.readOnly = false;
        searchInput.value = "";
      }, 80);
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.value = "";
      }, 350);
      setTimeout(() => {
        if (!searchInput.isConnected) return;
        searchInput.value = "";
      }, 1200);
      searchInput.addEventListener("input", aplicarFiltroTexto);
    }

    if (regBtn) {
      regBtn.addEventListener("click", () => {
        resetDoctorModalState();
        openModalCompat(modal);
        requestAnimationFrame(() => {
          setupCanvasHD();
          clearCanvas();
        });
      });
    }

    if (btnChangePassword) {
      btnChangePassword.addEventListener("click", abrirModalCambiarPassword);
    }

    if (modalCancel) {
      modalCancel.onclick = () => {
        resetDoctorModalState();
        closeModalCompat(modal);
      };
    }

    if (modalVerCerrar) {
      modalVerCerrar.onclick = () => {
        closeModalCompat(modalVer);
        if (firmaImg) firmaImg.src = "";
      };
    }

    if (modalVerSelloCerrar) {
      modalVerSelloCerrar.onclick = () => {
        closeModalCompat(modalVerSello);
        if (selloImg) selloImg.src = "";
      };
    }

    if (modalEstadoCancel) {
      modalEstadoCancel.onclick = cerrarModalEstadoDoctor;
    }

    if (modalEstadoSave) {
      modalEstadoSave.onclick = cambiarEstadoDoctorConPassword;
    }

    if (btnAutorizarTodos) {
      btnAutorizarTodos.onclick = autorizarTodosPendientes;
    }

    if (modalFirmaUpdateCancel) {
      modalFirmaUpdateCancel.onclick = cerrarModalActualizarFirma;
    }

    if (modalFirmaUpdateSave) {
      modalFirmaUpdateSave.onclick = actualizarFirmaDoctor;
    }

    if (passwordCancel) {
      passwordCancel.onclick = cerrarModalCambiarPassword;
    }

    if (passwordSave) {
      passwordSave.onclick = cambiarPasswordDoctor;
    }

    [passwordCurrentInput, passwordNewInput, passwordConfirmInput].forEach((input) => {
      input?.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        ev.preventDefault();
        cambiarPasswordDoctor();
      });
    });

    if (modalFirmaUpdateClear) {
      modalFirmaUpdateClear.onclick = () => {
        clearFirmaUpdateCanvas();
        if (modalFirmaUpdateFile) modalFirmaUpdateFile.value = "";
      };
    }

    if (modalFirmaUpdateFile) {
      modalFirmaUpdateFile.addEventListener("change", async (ev) => {
        const file = ev?.target?.files?.[0];
        if (!file) return;
        if (!/^image\//i.test(String(file.type || ""))) {
          alert("Seleccione una imagen valida para la firma.");
          modalFirmaUpdateFile.value = "";
          return;
        }
        try {
          const img = await cargarFirmaDesdeArchivo(file);
          dibujarImagenEnFirmaUpdateCanvas(img);
        } catch (err) {
          console.error("Error al cargar firma desde archivo", err);
          alert("No se pudo cargar la firma. Intente con otra imagen.");
          modalFirmaUpdateFile.value = "";
        }
      });
    }

    if (modalEstadoPass) {
      modalEstadoPass.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          cambiarEstadoDoctorConPassword();
        }
      });
    }

    if (btnClearSign) {
      btnClearSign.onclick = () => {
        clearCanvas();
        if (firmaFileInput) firmaFileInput.value = "";
      };
    }

    if (firmaFileInput) {
      firmaFileInput.addEventListener("change", async (ev) => {
        const file = ev?.target?.files?.[0];
        if (!file) return;
        if (!/^image\//i.test(String(file.type || ""))) {
          alert("Seleccione una imagen valida para la firma.");
          firmaFileInput.value = "";
          return;
        }
        try {
          const img = await cargarFirmaDesdeArchivo(file);
          dibujarImagenEnCanvas(img);
        } catch (err) {
          console.error("Error al cargar firma desde archivo", err);
          alert("No se pudo cargar la firma. Intente con otra imagen.");
          firmaFileInput.value = "";
        }
      });
    }

    if (canvas) {
      canvas.style.touchAction = "none";

      function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }

      canvas.onpointerdown = (e) => {
        if (!ctx) setupCanvasHD();
        if (!ctx) return;
        drawing = true;
        const pos = getPointerPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      };

      canvas.onpointerup = () => {
        drawing = false;
        if (ctx) ctx.beginPath();
      };
      canvas.onpointercancel = () => {
        drawing = false;
        if (ctx) ctx.beginPath();
      };
      canvas.onpointerleave = () => {
        drawing = false;
        if (ctx) ctx.beginPath();
      };

      canvas.onpointermove = (e) => {
        if (!drawing || !ctx) return;
        const { x, y } = getPointerPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        firmaTieneTrazo = true;
        e.preventDefault();
      };
    }

    if (modalFirmaUpdateCanvas) {
      modalFirmaUpdateCanvas.style.touchAction = "none";

      function getFirmaUpdatePointerPos(e) {
        const rect = modalFirmaUpdateCanvas.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }

      modalFirmaUpdateCanvas.onpointerdown = (e) => {
        if (!firmaUpdateCtx) setupFirmaUpdateCanvasHD();
        if (!firmaUpdateCtx) return;
        drawingFirmaUpdate = true;
        const pos = getFirmaUpdatePointerPos(e);
        firmaUpdateCtx.beginPath();
        firmaUpdateCtx.moveTo(pos.x, pos.y);
        modalFirmaUpdateCanvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      };

      modalFirmaUpdateCanvas.onpointerup = () => {
        drawingFirmaUpdate = false;
        if (firmaUpdateCtx) firmaUpdateCtx.beginPath();
      };
      modalFirmaUpdateCanvas.onpointercancel = () => {
        drawingFirmaUpdate = false;
        if (firmaUpdateCtx) firmaUpdateCtx.beginPath();
      };
      modalFirmaUpdateCanvas.onpointerleave = () => {
        drawingFirmaUpdate = false;
        if (firmaUpdateCtx) firmaUpdateCtx.beginPath();
      };

      modalFirmaUpdateCanvas.onpointermove = (e) => {
        if (!drawingFirmaUpdate || !firmaUpdateCtx) return;
        const { x, y } = getFirmaUpdatePointerPos(e);
        firmaUpdateCtx.lineTo(x, y);
        firmaUpdateCtx.stroke();
        firmaUpdateTieneTrazo = true;
        e.preventDefault();
      };
    }

    if (!window.__doctorSignResizeBound) {
      window.__doctorSignResizeBound = true;
      window.addEventListener("resize", setupCanvasHD);
      window.addEventListener("orientationchange", setupCanvasHD);
    }

    if (!window.__doctorFirmaUpdateResizeBound) {
      window.__doctorFirmaUpdateResizeBound = true;
      window.addEventListener("resize", setupFirmaUpdateCanvasHD);
      window.addEventListener("orientationchange", setupFirmaUpdateCanvasHD);
    }

    if (modalSave) {
      modalSave.onclick = async (ev) => {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (isCreatingDoctor) return;

        const nombre = String(modalNombre?.value || "").trim();
        const telefono = String(modalTelefono?.value || "").trim();
        const selloFile = modalSello?.files?.[0] || null;

        if (!nombre) {
          alert("Debe ingresar un nombre.");
          modalNombre?.focus();
          return;
        }

        // Sin trazo no se envia firma: el doctor queda sin firma en lugar de un PNG en blanco.
        const firmaBase64 = canvas && firmaTieneTrazo ? canvas.toDataURL("image/png") : "";
        isCreatingDoctor = true;
        modalSave.disabled = true;
        window.saveFx?.start(modalSave);

        try {
          const res = await fetch("/api/doctor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, telefono, firmaBase64 })
          });
          const json = await leerRespuestaApi(res, "No se pudo registrar doctor");
          if (!res.ok || !json?.ok) {
            throw new Error(json?.message || "No se pudo registrar doctor");
          }

          let selloRuta = "";
          let selloError = "";
          if (selloFile) {
            try {
              selloRuta = await subirSelloDoctor(json.idDoctor, selloFile);
            } catch (selloErr) {
              console.error("No se pudo subir sello", selloErr);
              selloError = String(selloErr?.message || "No se pudo subir el sello");
            }
          }

          doctorData.unshift({
            id: Number(json.idDoctor || 0),
            nombre,
            telefono,
            estadoD: 1,
            firma: normalizarRutaMedia(json.firma),
            sello: normalizarRutaMedia(selloRuta)
          });

          aplicarFiltroTexto();
          await window.saveFx?.success(modalSave);
          resetDoctorModalState();
          closeModalCompat(modal);

          if (selloError) {
            alert(`Doctor creado, pero hubo un problema al subir el sello: ${selloError}`);
          }
        } catch (err) {
          console.error(err);
          window.saveFx?.error(modalSave);
          alert(err?.message || "Error al registrar doctor");
        } finally {
          window.saveFx?.stop(modalSave);
          isCreatingDoctor = false;
          if (modalSave && modalSave.isConnected) {
            modalSave.disabled = false;
          }
        }
      };
    }

    const escHandler = (e) => {
      if (e.key !== "Escape") return;
      resetDoctorModalState();
      closeDoctorModales();
    };
    document.removeEventListener("keydown", window.__doctorEscHandler);
    window.__doctorEscHandler = escHandler;
    document.addEventListener("keydown", window.__doctorEscHandler);

    cargarDoctores();
    if (esDoctorLogueado) {
      cargarPendientesAutorizacion();
    }

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        if (doctorFetchController) {
          try {
            doctorFetchController.abort();
          } catch {
            // ignore abort failures
          }
        }
        if (pendientesFetchController) {
          try {
            pendientesFetchController.abort();
          } catch {
            // ignore abort failures
          }
        }
        doctorFetchController = null;
        pendientesFetchController = null;
        doctorFetchSeq++;
        pendientesFetchSeq++;
        isCreatingDoctor = false;
        isUpdatingEstado = false;
        isUpdatingFirma = false;
        isAuthorizingAll = false;
        doctorEstadoTarget = null;
        doctorPropioId = null;
        firmaUpdateTargetId = null;

        doctorData.length = 0;
        pendientesData.length = 0;
        if (searchInput) searchInput.value = "";
        if (tbody) tbody.innerHTML = "";
        if (pendientesTbody) pendientesTbody.innerHTML = "";

        resetDoctorModalState();
        closeDoctorModales();

        document.removeEventListener("keydown", window.__doctorEscHandler);
      });
    }
  }

  function mountDoctor() {
    const content = document.querySelector(".content");
    if (content) renderDoctor(content);
  }

  window.__mountDoctor = mountDoctor;
})();
