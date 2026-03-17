// doctor.js
(function () {

    // =========================================
    // DATOS DE EJEMPLO
    // =========================================
    const doctorData = [];

    // =========================================
    // FUNCIÓN PRINCIPAL PARA CARGAR LA VISTA
    // =========================================
    function renderIcon(name, className) {
        const registry = window.__uiIcons;
        if (!registry || typeof registry.get !== "function") return "";
        return registry.get(name, { className: className || "ui-action-icon" });
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
                            <th>Teléfono</th>
                            <th>Firma</th>
                            <th>Sello</th>
                        </tr>
                    </thead>
                    <tbody id="doctor-tbody"></tbody>
                </table>
            </div>
        </div>
        `;

        // REFERENCIAS
        const tbody = container.querySelector("#doctor-tbody");
        const searchInput = container.querySelector("#doctor-search");
        const regBtn = container.querySelector("#doctor-add");

        // ==========================
        // ===== MODALES ============
        // ==========================
        const modal = document.querySelector("#modal-doctor");
        const modalCancel = document.querySelector("#modal-doctor-cancel");
        const modalSave = document.querySelector("#modal-doctor-save");

        const canvas = document.querySelector("#signature-canvas");
        let ctx = null;  // será inicializado al abrir modal

        const btnClearSign = document.querySelector("#btn-clear-sign");

        const firmaImg = document.querySelector("#firma-img");
        const modalVer = document.querySelector("#modal-ver-firma");
        const modalVerCerrar = document.querySelector("#modal-ver-cerrar");

        const selloImg = document.querySelector("#sello-img");
        const modalVerSello = document.querySelector("#modal-ver-sello");
        const modalVerSelloCerrar = document.querySelector("#modal-ver-sello-cerrar");
        function normalizarRutaMedia(ruta) {
            const raw = String(ruta || "").trim();
            if (!raw) return "";
            if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
            const sane = raw.replace(/\\/g, "/");
            return sane.startsWith("/") ? sane : `/${sane}`;
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
        function closeDoctorModales() {
            closeModalCompat(modal);
            closeModalCompat(modalVer);
            closeModalCompat(modalVerSello);
        }
        function resetDoctorModalState() {
            const nombreEl = document.querySelector("#doctor-nombre");
            const telefonoEl = document.querySelector("#doctor-telefono");
            const selloEl = document.querySelector("#doctor-sello");

            if (nombreEl) nombreEl.value = "";
            if (telefonoEl) telefonoEl.value = "";
            if (selloEl) selloEl.value = "";
            if (firmaImg) firmaImg.src = "";
            if (selloImg) selloImg.src = "";

            clearCanvas();
        }
        if (searchInput) {
            searchInput.setAttribute("name", `doctor-search-${Date.now()}`);
            searchInput.value = "";
            // Evita autofill agresivo del navegador al recargar (F5).
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
        }


        // =========================================
        // ==== CANVAS HD (definido correctamente)
        // =========================================
        function setupCanvasHD() {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dpr = window.devicePixelRatio || 1;
            const nextWidth = Math.round(rect.width * dpr);
            const nextHeight = Math.round(rect.height * dpr);

            if (canvas.width === nextWidth && canvas.height === nextHeight && ctx) return;

            canvas.width = nextWidth;
            canvas.height = nextHeight;
            ctx = canvas.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, rect.width, rect.height);

            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
        }

        function clearCanvas() {
            if (!ctx) return;
            const rect = canvas.getBoundingClientRect();
            ctx.fillStyle = "#ffffff";
            ctx.clearRect(0, 0, rect.width, rect.height);
            ctx.fillRect(0, 0, rect.width, rect.height);
        }


        // =========================================
        // ==== ABRIR MODAL (CANVAS INIT AQUI) =====
        // =========================================
        regBtn.addEventListener("click", () => {
            resetDoctorModalState();
            openModalCompat(modal);

            // Inicializar Canvas cuando modal YA está visible
            requestAnimationFrame(() => {
                setupCanvasHD();
                clearCanvas();
            });
        });

        // ==========================
        // ==== CERRAR MODAL ========
        // ==========================
        modalCancel.onclick = () => {
            resetDoctorModalState();
            closeModalCompat(modal);
        };

        // ESC para cerrar (handler unico)
        const escHandler = (e) => {
            if (e.key === "Escape") {
                resetDoctorModalState();
                closeDoctorModales();
            }
        };
        document.removeEventListener("keydown", window.__doctorEscHandler);
        window.__doctorEscHandler = escHandler;
        document.addEventListener("keydown", window.__doctorEscHandler);

        modalVerCerrar.onclick = () => {
            closeModalCompat(modalVer);
            if (firmaImg) firmaImg.src = "";
        };
        modalVerSelloCerrar.onclick = () => {
            closeModalCompat(modalVerSello);
            if (selloImg) selloImg.src = "";
        };

        // ==========================
        // ======= CANVAS ===========
        // ==========================
        btnClearSign.onclick = clearCanvas;

        let drawing = false;
        canvas.style.touchAction = "none";
        if (!window.__doctorSignResizeBound) {
            window.__doctorSignResizeBound = true;
            window.addEventListener("resize", setupCanvasHD);
            window.addEventListener("orientationchange", setupCanvasHD);
        }

        function getPointerPos(e) {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }

        canvas.onpointerdown = (e) => {
            if (!ctx) setupCanvasHD();
            drawing = true;
            const pos = getPointerPos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
        };

        canvas.onpointerup = () => {
            drawing = false;
            ctx.beginPath();
        };
        canvas.onpointercancel = () => {
            drawing = false;
            ctx.beginPath();
        };
        canvas.onpointerleave = () => {
            drawing = false;
            ctx.beginPath();
        };

        canvas.onpointermove = (e) => {
            if (!drawing) return;
            const { x, y } = getPointerPos(e);

            ctx.lineTo(x, y);
            ctx.stroke();
            e.preventDefault();
        };


        // ==========================
        // ===== GUARDAR DOCTOR =====
        // ==========================
        modalSave.replaceWith(modalSave.cloneNode(true));
        const modalSaveNew = document.querySelector("#modal-doctor-save");
        modalSaveNew.addEventListener("click", async () => {

        const nombre = document.querySelector("#doctor-nombre").value.trim();
        const telefono = document.querySelector("#doctor-telefono").value.trim();
        const selloFile = document.querySelector("#doctor-sello").files[0];

        if (!nombre) {
        alert("Debe ingresar un nombre.");
        return;
        }

        const firmaBase64 = canvas.toDataURL("image/png");

        try {
        // 1️⃣ Crear doctor (JSON)
        const res = await fetch("/api/doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        nombre,
        telefono,
        firmaBase64
        })

        });

    const json = await res.json();
    if (!json.ok) throw new Error(json.message);

    // 2️⃣ Subir sello SI existe
    let selloRuta = "";

    if (selloFile) {
      const fd = new FormData();
      fd.append("sello", selloFile);

      const resSello = await fetch(`/api/doctor/${json.idDoctor}/sello`, {
        method: "POST",
        body: fd
      });

      const jsonSello = await resSello.json();
      if (jsonSello.ok) selloRuta = jsonSello.sello;
    }

    // 3️⃣ Actualizar frontend
    doctorData.unshift({
      id: Number(json.idDoctor || 0),
      nombre,
      telefono,
      firma: normalizarRutaMedia(json.firma),
      sello: normalizarRutaMedia(selloRuta)
    });

    aplicarFiltroTexto();
    resetDoctorModalState();
    closeModalCompat(modal);

  } catch (err) {
    console.error(err);
    alert("Error al registrar doctor");
  }
});




        // ==========================
        // ===== VER FIRMAS =========
        // ==========================
        async function onViewFirma(e) {
            const id = Number(e.currentTarget.dataset.id || 0);
            if (!id) return;

            let rutaFirma = "";
            const local = doctorData.find(d => Number(d.id || 0) === id);
            if (local?.firma) {
                rutaFirma = normalizarRutaMedia(local.firma);
            }

            try {
                const res = await fetch(`/api/doctor/${id}`);
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

            firmaImg.src = rutaFirma;
            openModalCompat(modalVer);
        }

        async function onViewSello(e) {
            const id = Number(e.currentTarget.dataset.id || 0);
            if (!id) return;

            let rutaSello = "";
            const local = doctorData.find(d => Number(d.id || 0) === id);
            if (local?.sello) {
                rutaSello = normalizarRutaMedia(local.sello);
            }

            try {
                const res = await fetch(`/api/doctor/${id}`);
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

            selloImg.src = rutaSello;
            openModalCompat(modalVerSello);
        }

        async function cargarDoctores() {
        try {
        const res = await fetch("/api/doctor");
        const json = await res.json();

        if (!json.ok) {
        alert(json.message || "Error al cargar doctores");
        return;
        }

        doctorData.length = 0;

        json.data.forEach(d => {
        doctorData.push({
        id: Number(d.idDoctor || 0),
        nombre: d.nombreD,
        telefono: d.TelefonoD,
        firma: normalizarRutaMedia(d.FirmaD),   // ruta o null
        sello: normalizarRutaMedia(d.SelloD)    // ruta o null
        });
        });

        drawRows(doctorData);

        } catch (err) {
        console.error(err);
        if (window.notifyConnectionError) {
            window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
            alert("Opps ocurrio un error de conexion");
        }
        }
}

        // ==========================
        // ===== DIBUJAR TABLA ======
        // ==========================
        function drawRows(list) {
            tbody.innerHTML = "";

            list.forEach(doctor => {
                const tr = document.createElement("tr");

                tr.innerHTML = `
                    <td>${doctor.nombre}</td>
                    <td>${doctor.telefono}</td>

                    <td>
                        ${doctor.firma
                            ? `<button class="ui-action-btn is-info row-btn view-firma" data-id="${doctor.id}" title="Ver Firma" aria-label="Ver firma de doctor">${renderIcon("document-text")}</button>`
                            : `<em style="color:#64748b">Sin firma</em>`}
                    </td>

                    <td>
                        ${doctor.sello
                            ? `<button class="ui-action-btn is-primary row-btn view-sello" data-id="${doctor.id}" title="Ver Sello" aria-label="Ver sello de doctor">${renderIcon("shield-check")}</button>`
                            : `<em style="color:#64748b">Sin sello</em>`}
                    </td>
                `;

                tbody.appendChild(tr);
            });

            container.querySelectorAll(".view-firma")
                .forEach(btn => btn.addEventListener("click", onViewFirma));

            container.querySelectorAll(".view-sello")
                .forEach(btn => btn.addEventListener("click", onViewSello));
        }


        // ==========================
        // ===== FILTROS ============
        // ==========================
        function aplicarFiltroTexto() {
            const q = searchInput.value.trim().toLowerCase();
            const filtrados = doctorData.filter(d =>
                d.nombre.toLowerCase().includes(q)
            );
            drawRows(filtrados);
        }

        searchInput.addEventListener("input", aplicarFiltroTexto);

        // primera carga
        cargarDoctores();

        if (window.__setViewCleanup) {
            window.__setViewCleanup(() => {
                doctorData.length = 0;
                if (searchInput) searchInput.value = "";
                resetDoctorModalState();
                closeDoctorModales();
            });
        }

    }


    // =========================================
    // EXPONER A SPA
    // =========================================
    function mountDoctor() {
        const content = document.querySelector(".content");
        if (content) renderDoctor(content);
    }

    window.__mountDoctor = mountDoctor;
     // Los datos de ejemplo si los quiero imprimir en consola, los expongo al window, 
     // y luego en consola solo los invoco = __doctorData

})();
