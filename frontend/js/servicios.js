// js/servicios.js
(function () {
  // =========================================
  // DATOS EN MEMORIA
  // =========================================
  const serviciosData = [];

  // =========================================
  // UTIL
  // =========================================
  function formatoPrecio(num) {
    if (Number.isNaN(num)) return "";
    if (Number.isInteger(num)) return `$${num}`;
    return `$${num.toFixed(2)}`;
  }

  function renderIcon(name, className) {
    const registry = window.__uiIcons;
    if (!registry || typeof registry.get !== "function") return "";
    return registry.get(name, { className: className || "ui-action-icon" });
  }

  function ensureServicioModalExists() {
    let modal = document.getElementById("modal-servicio");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "modal-servicio";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Agregar Servicio</h2>
        <label>Nombre</label>
        <input type="text" id="servicio-nombre" placeholder="Nombre del servicio">
        <label>Precio</label>
        <input type="number" step="0.01" id="servicio-precio" placeholder="0.00">
        <div class="modal-buttons" style="margin-top:14px;">
          <button id="modal-servicio-cancel" class="btn-cancelar">Cancelar</button>
          <button id="modal-servicio-save" class="btn-cobrar">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  // =========================================
  // RENDER PRINCIPAL
  // =========================================
  function renderServicios(container) {
    container.innerHTML = `
      <div class="servicios-container">
        <div class="servicios-header">
          <div class="servicios-title">Servicios</div>

          <div class="servicios-controls ui-toolbar">
            <input class="autofill-trap" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true">
            <input class="autofill-trap" type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true">
            <input class="ui-control ui-control-search" type="search" id="servicio-search" name="servicio-search-lista" placeholder="Buscar servicio..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button id="servicio-add" class="ui-toolbar-btn is-success">
              ${renderIcon("plus", "ui-toolbar-icon")}
              <span>Agregar Servicio</span>
            </button>
          </div>
        </div>

        <div class="servicios-table-wrap ui-table-wrap-compact">
          <table class="servicios-table ui-table-compact">
            <thead>
              <tr>
                <th>Nombre</th>
                <th style="text-align:right; width:140px;">Precio</th>
                <th style="text-align:center; width:120px;">Acciones</th>
              </tr>
            </thead>
            <tbody id="servicio-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    let serviciosFetchSeq = 0;
    let serviciosFetchController = null;
    let isCreatingServicio = false;

    if (!window.__serviciosEscHandler) {
      window.__serviciosEscHandler = (e) => {
        if (e.key !== "Escape") return;
        const m = document.getElementById("modal-servicio");
        if (m) m.classList.remove("show");
        const inputNombre = document.getElementById("servicio-nombre");
        const inputPrecio = document.getElementById("servicio-precio");
        if (inputNombre) inputNombre.value = "";
        if (inputPrecio) inputPrecio.value = "";
      };
      document.addEventListener("keydown", window.__serviciosEscHandler);
    }

    const tbody = container.querySelector("#servicio-tbody");
    const searchInput = container.querySelector("#servicio-search");
    const addBtn = container.querySelector("#servicio-add");

    if (searchInput) {
      searchInput.setAttribute("name", `servicio-search-${Date.now()}`);
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
    }

    const modal = ensureServicioModalExists();

    function resetServicioModalState() {
      const inputNombre = document.getElementById("servicio-nombre");
      const inputPrecio = document.getElementById("servicio-precio");
      if (inputNombre) inputNombre.value = "";
      if (inputPrecio) inputPrecio.value = "";
      if (modal) modal.classList.remove("show");
    }

    async function cargarServicios() {
      if (serviciosFetchController) {
        try {
          serviciosFetchController.abort();
        } catch {
          // ignore abort failures
        }
      }

      const localSeq = ++serviciosFetchSeq;
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      serviciosFetchController = controller;

      try {
        const fetchOptions = controller ? { signal: controller.signal } : undefined;
        const res = await fetch("/api/servicio", fetchOptions);
        const json = await res.json();

        if (localSeq !== serviciosFetchSeq || !container.isConnected) return;

        if (!res.ok || !json?.ok) {
          alert(json?.message || "Error al cargar servicios");
          return;
        }

        serviciosData.length = 0;
        const rows = Array.isArray(json.data) ? json.data : [];
        rows.forEach((s) => {
          serviciosData.push({
            id: s.idServicio,
            nombre: s.nombreS,
            precio: Number(s.precioS)
          });
        });

        aplicarFiltro();
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (localSeq !== serviciosFetchSeq || !container.isConnected) return;

        console.error(err);
        if (window.notifyConnectionError) {
          window.notifyConnectionError("Opps ocurrio un error de conexion");
        } else {
          alert("Opps ocurrio un error de conexion");
        }
      } finally {
        if (serviciosFetchController === controller) {
          serviciosFetchController = null;
        }
      }
    }

    function openModalForCreate() {
      const inputNombre = document.getElementById("servicio-nombre");
      const inputPrecio = document.getElementById("servicio-precio");
      const btnCancel = document.getElementById("modal-servicio-cancel");
      const btnSave = document.getElementById("modal-servicio-save");

      if (!inputNombre || !inputPrecio || !btnCancel || !btnSave) {
        console.error("Elementos del modal no encontrados despues de crear/asegurar modal.");
        alert("Error interno: modal incompleto.");
        return;
      }

      inputNombre.value = "";
      inputPrecio.value = "";
      modal.classList.add("show");
      setTimeout(() => inputNombre.focus(), 50);

      btnCancel.onclick = () => resetServicioModalState();

      btnSave.onclick = async (ev) => {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (isCreatingServicio) return;

        const nombre = String(inputNombre.value || "").trim();
        const precioRaw = inputPrecio.value;
        const precio = precioRaw === "" ? NaN : Number(precioRaw);

        if (!nombre) {
          alert("El nombre del servicio no puede estar vacio.");
          inputNombre.focus();
          return;
        }
        if (!Number.isFinite(precio) || precio < 0) {
          alert("Precio invalido. Ingrese un numero valido mayor o igual a 0.");
          inputPrecio.focus();
          return;
        }

        isCreatingServicio = true;
        btnSave.disabled = true;

        try {
          const res = await fetch("/api/servicio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre, precio })
          });
          const json = await res.json();
          if (!res.ok || !json?.ok) {
            throw new Error(json?.message || "No se pudo crear servicio");
          }

          serviciosData.unshift({
            id: json.idServicio,
            nombre,
            precio
          });
          aplicarFiltro();
          resetServicioModalState();
        } catch (err) {
          console.error(err);
          alert(err?.message || "No se pudo crear el servicio");
        } finally {
          isCreatingServicio = false;
          if (btnSave && btnSave.isConnected) {
            btnSave.disabled = false;
          }
        }
      };
    }

    addBtn?.addEventListener("click", openModalForCreate);

    function drawRows(list) {
      tbody.innerHTML = "";
      if (!list || list.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="3" style="text-align:center; color:var(--text-muted)">No hay servicios</td></tr>`;
        return;
      }

      list.forEach((s) => {
        const tr = document.createElement("tr");

        const tdNombre = document.createElement("td");
        tdNombre.textContent = s.nombre;
        tdNombre.className = "serv-nombre editable";
        tdNombre.title = "Doble clic para editar nombre";
        tdNombre.addEventListener("dblclick", () => {
          editarTextoInline(tdNombre, s, "nombre");
        });
        tr.appendChild(tdNombre);

        const tdPrecio = document.createElement("td");
        tdPrecio.style.textAlign = "right";
        tdPrecio.textContent = formatoPrecio(s.precio);
        tdPrecio.className = "serv-precio editable";
        tdPrecio.title = "Doble clic para editar precio";
        tdPrecio.addEventListener("dblclick", () => {
          editarPrecioInline(tdPrecio, s);
        });
        tr.appendChild(tdPrecio);

        const tdAcciones = document.createElement("td");
        tdAcciones.style.textAlign = "center";
        const actionGroup = document.createElement("div");
        actionGroup.className = "servicios-actions ui-action-group";
        const btnEliminar = document.createElement("button");
        btnEliminar.type = "button";
        btnEliminar.className = "servicio-btn-delete ui-action-btn is-danger";
        btnEliminar.innerHTML = renderIcon("trash");
        btnEliminar.title = "Eliminar";
        btnEliminar.setAttribute("aria-label", "Eliminar servicio");
        btnEliminar.addEventListener("click", async () => {
          const ok = typeof window.showSystemConfirm === "function"
            ? await window.showSystemConfirm(`Eliminar servicio "${s.nombre}"?`)
            : confirm(`Eliminar servicio "${s.nombre}"?`);
          if (!ok) return;

          btnEliminar.disabled = true;
          try {
            const res = await fetch(`/api/servicio/${s.id}`, { method: "DELETE" });
            const json = await res.json();
            if (!json?.ok) throw new Error(json?.message || "No se pudo eliminar");

            const idx = serviciosData.findIndex((x) => Number(x.id) === Number(s.id));
            if (idx >= 0) serviciosData.splice(idx, 1);
            aplicarFiltro();
          } catch (err) {
            alert(err?.message || "Error al eliminar servicio");
            btnEliminar.disabled = false;
          }
        });
        actionGroup.appendChild(btnEliminar);
        tdAcciones.appendChild(actionGroup);
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
      });
    }

    async function editarTextoInline(td, objeto, campo) {
      const valorOriginal = objeto[campo];
      const input = document.createElement("input");
      input.type = "text";
      input.value = valorOriginal;
      input.className = "comment-edit";

      td.textContent = "";
      td.appendChild(input);
      input.focus();

      let isSaving = false;
      let isClosed = false;

      function closeEditor(value) {
        if (isClosed) return;
        isClosed = true;
        td.textContent = value;
      }

      async function save() {
        if (isSaving || isClosed) return;
        isSaving = true;

        const nuevoValor = input.value.trim();
        if (nuevoValor === valorOriginal) {
          closeEditor(valorOriginal);
          isSaving = false;
          return;
        }

        objeto[campo] = nuevoValor;
        closeEditor(nuevoValor);

        try {
          const res = await fetch(`/api/servicio/${objeto.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [campo]: nuevoValor })
          });
          const json = await res.json();
          if (!json?.ok) throw new Error(json?.message || "Error al guardar cambio");
        } catch (err) {
          console.error(err);
          alert("Error al guardar el cambio");
          objeto[campo] = valorOriginal;
          td.textContent = valorOriginal;
        } finally {
          isSaving = false;
        }
      }

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (isClosed) return;
          objeto[campo] = valorOriginal;
          closeEditor(valorOriginal);
        }
      });

      input.addEventListener("blur", save);
    }

    function editarPrecioInline(td, objeto) {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.01";
      input.value = objeto.precio;
      input.className = "comment-edit";
      input.style.textAlign = "right";

      td.textContent = "";
      td.appendChild(input);
      input.focus();

      let isSaving = false;
      let isClosed = false;

      function closeEditor(value) {
        if (isClosed) return;
        isClosed = true;
        td.textContent = formatoPrecio(value);
      }

      async function save() {
        if (isSaving || isClosed) return;
        isSaving = true;

        const val = Number(input.value);
        if (!Number.isFinite(val) || val < 0) {
          alert("Precio invalido.");
          closeEditor(objeto.precio);
          isSaving = false;
          return;
        }

        const nuevoPrecio = Math.round(val * 100) / 100;
        const precioOriginal = objeto.precio;

        if (nuevoPrecio === precioOriginal) {
          closeEditor(precioOriginal);
          isSaving = false;
          return;
        }

        objeto.precio = nuevoPrecio;
        closeEditor(nuevoPrecio);

        try {
          const res = await fetch(`/api/servicio/${objeto.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ precio: nuevoPrecio })
          });
          const json = await res.json();
          if (!json?.ok) throw new Error(json?.message || "Error al guardar precio");
        } catch (err) {
          console.error(err);
          alert("Error al guardar precio");
          objeto.precio = precioOriginal;
          td.textContent = formatoPrecio(precioOriginal);
        } finally {
          isSaving = false;
        }
      }

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (isClosed) return;
          closeEditor(objeto.precio);
        }
      });
      input.addEventListener("blur", save);
    }

    function aplicarFiltro() {
      const q = String(searchInput?.value || "").trim().toLowerCase();
      const filtered = serviciosData.filter((s) =>
        String(s.nombre || "").toLowerCase().includes(q)
      );
      drawRows(filtered);
    }

    searchInput?.addEventListener("input", aplicarFiltro);

    if (window.__setViewCleanup) {
      window.__setViewCleanup(() => {
        if (serviciosFetchController) {
          try {
            serviciosFetchController.abort();
          } catch {
            // ignore abort failures
          }
        }
        serviciosFetchController = null;
        serviciosFetchSeq++;
        isCreatingServicio = false;

        serviciosData.length = 0;
        if (searchInput) searchInput.value = "";
        if (tbody) tbody.innerHTML = "";
        resetServicioModalState();
      });
    }

    cargarServicios();
  }

  // =========================================
  // MONTAR EN SPA
  // =========================================
  function mountServicios() {
    const content = document.querySelector(".content");
    if (!content) return;
    renderServicios(content);
  }

  window.__mountServicios = mountServicios;
})();
