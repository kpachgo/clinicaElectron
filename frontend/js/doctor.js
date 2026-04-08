// doctor.js
(function () {
  const doctorData = [];

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
    container.innerHTML = `
      <div class="doctor-container">
        <div class="doctor-header">
          <div class="doctor-title">Doctores</div>
          <div class="doctor-controls ui-toolbar">
            <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
            <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
            <input class="ui-control ui-control-search" type="search" id="doctor-search" name="doctor-search-lista" placeholder="Buscar doctor..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button id="doctor-add" class="ui-toolbar-btn is-success">
              ${renderIcon("plus", "ui-toolbar-icon")}
              <span>Registrar Doctor</span>
            </button>
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
    `;

    const tbody = container.querySelector("#doctor-tbody");
    const searchInput = container.querySelector("#doctor-search");
    const regBtn = container.querySelector("#doctor-add");

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

    const currentUser = typeof window.getCurrentUser === "function"
      ? window.getCurrentUser()
      : null;
    const esDoctorLogueado = currentUser?.rol === "Doctor";

    let doctorPropioId = null;
    let doctorEstadoTarget = null;

    let ctx = null;
    let drawing = false;
    let isCreatingDoctor = false;
    let isUpdatingEstado = false;
    let doctorFetchSeq = 0;
    let doctorFetchController = null;

    function resetDoctorModalState() {
      if (modalNombre) modalNombre.value = "";
      if (modalTelefono) modalTelefono.value = "";
      if (modalSello) modalSello.value = "";
      if (firmaFileInput) firmaFileInput.value = "";
      if (firmaImg) firmaImg.src = "";
      if (selloImg) selloImg.src = "";
      clearCanvas();
    }

    function cerrarModalEstadoDoctor() {
      doctorEstadoTarget = null;
      if (modalEstadoPass) modalEstadoPass.value = "";
      closeModalCompat(modalEstado);
    }

    function closeDoctorModales() {
      closeModalCompat(modal);
      closeModalCompat(modalVer);
      closeModalCompat(modalVerSello);
      cerrarModalEstadoDoctor();
    }

    function setupCanvasHD() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dpr = window.devicePixelRatio || 1;
      const nextWidth = Math.round(rect.width * dpr);
      const nextHeight = Math.round(rect.height * dpr);

      if (canvas.width === nextWidth && canvas.height === nextHeight && ctx) return;

      canvas.width = nextWidth;
      canvas.height = nextHeight;
      ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
    }

    function clearCanvas() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "#ffffff";
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillRect(0, 0, rect.width, rect.height);
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

    async function resolverDoctorPropio() {
      doctorPropioId = null;
      if (!esDoctorLogueado) return;

      try {
        const res = await fetch("/api/doctor/select", { cache: "no-store" });
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
        if (doctorFetchController === controller) {
          doctorFetchController = null;
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
          if (local) local.sello = rutaSello;
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

    function drawRows(list) {
      tbody.innerHTML = "";

      if (!Array.isArray(list) || list.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center; color:var(--text-muted)">No hay doctores</td></tr>`;
        return;
      }

      list.forEach((doctor) => {
        const tr = document.createElement("tr");

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
        if (doctor.firma) {
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
        if (doctor.sello) {
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

          const btnSubirSello = document.createElement("button");
          btnSubirSello.className = "ui-action-btn is-success row-btn upload-sello";
          btnSubirSello.dataset.id = String(doctor.id);
          btnSubirSello.title = "Subir sello";
          btnSubirSello.setAttribute("aria-label", "Subir sello de doctor");
          btnSubirSello.innerHTML = renderIcon("arrow-up");
          btnSubirSello.addEventListener("click", onUploadSello);
          noSelloWrap.appendChild(btnSubirSello);

          tdSello.appendChild(noSelloWrap);
        }
        tr.appendChild(tdSello);

        const tdAcciones = document.createElement("td");
        if (puedeCambiarEstado) {
          const btnEstado = document.createElement("button");
          btnEstado.className = "ui-action-btn is-warning row-btn doctor-toggle-estado";
          btnEstado.dataset.id = String(doctor.id);
          btnEstado.dataset.estadoTarget = String(estadoDestino);
          btnEstado.title = esActivo ? "Marcar inactivo" : "Marcar activo";
          btnEstado.setAttribute(
            "aria-label",
            esActivo ? "Marcar doctor inactivo" : "Marcar doctor activo"
          );
          btnEstado.innerHTML = renderIcon("arrow-path");
          btnEstado.addEventListener("click", () => {
            abrirModalEstadoDoctor(doctor, estadoDestino);
          });
          tdAcciones.appendChild(btnEstado);
        } else {
          const noAction = document.createElement("em");
          noAction.style.color = "#94a3b8";
          noAction.textContent = "--";
          tdAcciones.appendChild(noAction);
        }
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
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
        e.preventDefault();
      };
    }

    if (!window.__doctorSignResizeBound) {
      window.__doctorSignResizeBound = true;
      window.addEventListener("resize", setupCanvasHD);
      window.addEventListener("orientationchange", setupCanvasHD);
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

        const firmaBase64 = canvas ? canvas.toDataURL("image/png") : "";
        isCreatingDoctor = true;
        modalSave.disabled = true;

        try {
          const res = await fetch("/api/doctor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, telefono, firmaBase64 })
          });
          const json = await res.json();
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
          resetDoctorModalState();
          closeModalCompat(modal);

          if (selloError) {
            alert(`Doctor creado, pero hubo un problema al subir el sello: ${selloError}`);
          }
        } catch (err) {
          console.error(err);
          alert(err?.message || "Error al registrar doctor");
        } finally {
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

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        if (doctorFetchController) {
          try {
            doctorFetchController.abort();
          } catch {
            // ignore abort failures
          }
        }
        doctorFetchController = null;
        doctorFetchSeq++;
        isCreatingDoctor = false;
        isUpdatingEstado = false;
        doctorEstadoTarget = null;
        doctorPropioId = null;

        doctorData.length = 0;
        if (searchInput) searchInput.value = "";
        if (tbody) tbody.innerHTML = "";

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
