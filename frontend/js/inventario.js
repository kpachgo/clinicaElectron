// js/inventario.js - Vista Inventario: catalogo de insumos/instrumentos y pedidos.
//
// Solo catalogo y pedidos: sin existencias, minimos, proveedor ni precios.
// Pedido: Borrador (se edita, se guarda y se borra) -> Generado (se copia o se baja en PDF para
// enviarlo). Un generado se abre en solo lectura; con "Editar" se le agrega lo que falto y sigue
// Generado. Un pedido generado solo lo borra un Administrador (lo valida el backend).
// Roles: Administrador, Recepcion y Asistente (ROLE_VIEWS en web.js).
(function () {
  const CATEGORIAS = [
    { value: "Odontologia", label: "Odontología" },
    { value: "Ortodoncia", label: "Ortodoncia" },
    { value: "Instrumento", label: "Instrumentos" }
  ];
  const UNIDADES_SUGERIDAS = ["Unidad", "Caja", "Bolsa", "Paquete", "Frasco", "Jeringa", "Rollo", "Pieza"];
  const MAX_CANTIDAD = 100000;

  function categoriaLabel(value) {
    return CATEGORIAS.find((c) => c.value === value)?.label || "Otros";
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizar(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  function renderIcon(name, className) {
    const registry = window.__uiIcons;
    if (!registry || typeof registry.get !== "function") return "";
    return registry.get(name, { className: className || "ui-action-icon" });
  }

  // "4 Caja" -> "4 cajas", "2 Unidad" -> "2 unidades".
  function cantidadConUnidad(cantidad, unidad) {
    const u = String(unidad || "").trim().toLowerCase();
    if (!u) return String(cantidad);
    if (Number(cantidad) === 1 || /s$/.test(u)) return `${cantidad} ${u}`;
    return `${cantidad} ${u}${/[aeiou]$/.test(u) ? "s" : "es"}`;
  }

  // El backend manda las fechas de pedidos en ISO UTC: se muestran en la hora local del equipo.
  function formatoFecha(value) {
    if (/T.*Z$/.test(String(value || ""))) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const p2 = (n) => String(n).padStart(2, "0");
        return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
      }
    }
    const m =/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}))?/.exec(String(value || ""));
    if (!m) return "-";
    return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : `${m[3]}/${m[2]}/${m[1]}`;
  }

  // Doble clic en una fila abre el editor: sin esto el navegador tambien selecciona la palabra
  // y queda resaltada detras del modal. Un solo clic sigue permitiendo seleccionar/copiar texto.
  function onDobleClicFila(tr, handler) {
    tr.addEventListener("mousedown", (e) => {
      if (e.detail > 1 && !e.target.closest("input, textarea, button")) e.preventDefault();
    });
    tr.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, input, textarea")) return;
      window.getSelection?.()?.removeAllRanges();
      handler();
    });
  }

  function avisar(message, type) {
    if (typeof window.showToast === "function") {
      window.showToast(message, { type: type || "info" });
    } else {
      alert(message);
    }
  }

  async function confirmar(message) {
    return typeof window.showSystemConfirm === "function"
      ? window.showSystemConfirm(message)
      : confirm(message);
  }

  async function api(url, options = {}) {
    const init = { ...options };
    if (init.body && typeof init.body !== "string") {
      init.headers = { "Content-Type": "application/json", ...(init.headers || {}) };
      init.body = JSON.stringify(init.body);
    }
    const res = await fetch(url, init);
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok || !json?.ok) {
      const err = new Error(json?.message || "Ocurrio un error, intente de nuevo");
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function esUsuarioAdmin() {
    try {
      return String(window.getCurrentUser?.()?.rol || "").trim() === "Administrador";
    } catch {
      return false;
    }
  }

  // Renglones agrupados por categoria (en el orden del catalogo) para el texto y el PDF.
  function agruparRenglones(renglones) {
    const grupos = [];
    [...CATEGORIAS.map((c) => c.value), ""].forEach((cat) => {
      const items = renglones.filter((r) => (CATEGORIAS.some((c) => c.value === r.categoria) ? r.categoria : "") === cat);
      if (items.length) grupos.push({ label: cat ? categoriaLabel(cat) : "Otros", items });
    });
    return grupos;
  }

  function textoPedido(pedido) {
    const fecha = formatoFecha(pedido.generadoEn || pedido.creadoEn).split(" ")[0];
    const lineas = [`*Pedido #${pedido.idPedido}* - ${fecha}`];
    agruparRenglones(pedido.renglones).forEach((g) => {
      lineas.push("", `*${g.label}*`);
      g.items.forEach((r) => {
        const nota = r.nota ? ` (${r.nota})` : "";
        lineas.push(`- ${r.descripcion}: ${cantidadConUnidad(r.cantidad, r.unidad)}${nota}`);
      });
    });
    if (pedido.nota) lineas.push("", `Nota: ${pedido.nota}`);
    return lineas.join("\n");
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function descargarPdf(pedido) {
    const jsPdfCtor = window.jspdf?.jsPDF;
    if (typeof jsPdfCtor !== "function" || typeof jsPdfCtor.API?.autoTable !== "function") {
      avisar("No se encontro el motor PDF", "error");
      return;
    }

    const doc = new jsPdfCtor({ orientation: "portrait", unit: "pt", format: "a4" });
    const marginX = 36;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 42;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(`Pedido #${pedido.idPedido}`, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Fecha: ${formatoFecha(pedido.generadoEn || pedido.creadoEn)}`, pageWidth - marginX, y, { align: "right" });
    y += 15;
    doc.text(`Hecho por: ${pedido.generadoPor || pedido.creadoPor || "-"}`, marginX, y);
    y += 16;

    agruparRenglones(pedido.renglones).forEach((g) => {
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        theme: "striped",
        head: [[g.label, "Cantidad", "Nota"]],
        body: g.items.map((r) => [r.descripcion, cantidadConUnidad(r.cantidad, r.unidad), r.nota || ""]),
        styles: { fontSize: 9, cellPadding: { top: 3, right: 4, bottom: 3, left: 4 }, overflow: "linebreak" },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 240 }, 1: { cellWidth: 100 } }
      });
      y = (doc.lastAutoTable?.finalY || y) + 12;
    });

    if (pedido.nota) {
      doc.setFontSize(9);
      doc.text(doc.splitTextToSize(`Nota: ${pedido.nota}`, pageWidth - marginX * 2), marginX, y + 4);
    }

    doc.save(`pedido-${pedido.idPedido}.pdf`);
  }

  // =========================================
  // MODAL ARTICULO (crear / editar)
  // =========================================
  function ensureArticuloModal() {
    let modal = document.getElementById("modal-inv-articulo");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "modal-inv-articulo";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-content">
        <h2 id="inv-articulo-titulo">Agregar artículo</h2>
        <label for="inv-articulo-categoria">Categoría</label>
        <select id="inv-articulo-categoria">
          ${CATEGORIAS.map((c) => `<option value="${c.value}">${c.label}</option>`).join("")}
        </select>
        <label for="inv-articulo-nombre">Nombre</label>
        <input type="text" id="inv-articulo-nombre" maxlength="150" placeholder="Ej. Resina fluida A2" autocomplete="off">
        <label for="inv-articulo-unidad">Unidad</label>
        <input type="text" id="inv-articulo-unidad" maxlength="30" list="inv-unidades" placeholder="Caja, bolsa, unidad..." autocomplete="off">
        <datalist id="inv-unidades">
          ${UNIDADES_SUGERIDAS.map((u) => `<option value="${u}"></option>`).join("")}
        </datalist>
        <div class="modal-buttons">
          <button type="button" id="inv-articulo-cancel" class="btn-cancelar">Cancelar</button>
          <button type="button" id="inv-articulo-save" class="btn-cobrar">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) modal.classList.remove("show");
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") modal.classList.remove("show");
      if (e.key === "Enter" && e.target?.tagName === "INPUT") {
        e.preventDefault();
        document.getElementById("inv-articulo-save")?.click();
      }
    });
    return modal;
  }

  // =========================================
  // RENDER PRINCIPAL
  // =========================================
  function renderInventario(container) {
    container.innerHTML = `
      <div class="inv-container">
        <div class="inv-header">
          <div class="inv-title">Inventario</div>
          <div class="inv-tabs" role="tablist" aria-label="Secciones de inventario">
            <button type="button" class="inv-tab" role="tab" data-inv-tab="catalogo" aria-selected="true" aria-controls="inv-panel-catalogo">Catálogo</button>
            <button type="button" class="inv-tab" role="tab" data-inv-tab="pedidos" aria-selected="false" aria-controls="inv-panel-pedidos" tabindex="-1">Pedidos</button>
          </div>
        </div>

        <section id="inv-panel-catalogo" class="inv-panel" role="tabpanel">
          <div class="inv-toolbar ui-toolbar">
            <div class="inv-chips" id="inv-cat-chips"></div>
            <input class="ui-control ui-control-search" type="search" id="inv-cat-search" placeholder="Buscar artículo..." autocomplete="off" spellcheck="false">
            <button type="button" id="inv-cat-add" class="ui-toolbar-btn is-success">
              ${renderIcon("plus", "ui-toolbar-icon")}
              <span>Agregar artículo</span>
            </button>
          </div>
          <div class="inv-table-wrap">
            <table class="inv-table ui-table-compact">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th style="width:150px;">Categoría</th>
                  <th style="width:120px;">Unidad</th>
                  <th style="width:90px; text-align:center;">Acciones</th>
                </tr>
              </thead>
              <tbody id="inv-cat-tbody"></tbody>
            </table>
          </div>
        </section>

        <section id="inv-panel-pedidos" class="inv-panel" role="tabpanel" hidden>
          <div id="inv-pedidos-lista">
            <div class="inv-toolbar ui-toolbar">
              <div class="inv-hint">Arma el pedido, guárdalo como borrador y cuando esté listo genéralo para enviarlo.</div>
              <button type="button" id="inv-ped-nuevo" class="ui-toolbar-btn is-success">
                ${renderIcon("plus", "ui-toolbar-icon")}
                <span>Nuevo pedido</span>
              </button>
            </div>
            <div class="inv-table-wrap">
              <table class="inv-table inv-ped-table ui-table-compact">
                <thead>
                  <tr>
                    <th style="width:70px;">Pedido</th>
                    <th style="width:130px;">Fecha</th>
                    <th style="width:100px;">Estado</th>
                    <th style="width:90px; text-align:center;">Artículos</th>
                    <th style="width:150px;">Hecho por</th>
                    <th>Nota</th>
                    <th style="width:130px; text-align:center;">Acciones</th>
                  </tr>
                </thead>
                <tbody id="inv-ped-tbody"></tbody>
              </table>
            </div>
          </div>
          <div id="inv-editor" class="inv-editor" hidden></div>
        </section>
      </div>
    `;

    const state = {
      tab: "catalogo",
      articulos: [],
      catFiltro: "",
      pedidos: [],
      editor: null,
      alive: true
    };
    let renglonSeq = 0;

    const el = {
      tabs: container.querySelectorAll(".inv-tab"),
      panelCatalogo: container.querySelector("#inv-panel-catalogo"),
      panelPedidos: container.querySelector("#inv-panel-pedidos"),
      chips: container.querySelector("#inv-cat-chips"),
      catSearch: container.querySelector("#inv-cat-search"),
      catAdd: container.querySelector("#inv-cat-add"),
      catTbody: container.querySelector("#inv-cat-tbody"),
      pedLista: container.querySelector("#inv-pedidos-lista"),
      pedNuevo: container.querySelector("#inv-ped-nuevo"),
      pedTbody: container.querySelector("#inv-ped-tbody"),
      editor: container.querySelector("#inv-editor")
    };

    // ---------- Pestanas ----------
    function setTab(tab) {
      state.tab = tab;
      el.tabs.forEach((b) => {
        const on = b.dataset.invTab === tab;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      el.panelCatalogo.hidden = tab !== "catalogo";
      el.panelPedidos.hidden = tab !== "pedidos";
      window.__registerViewSearch?.(tab === "catalogo" ? el.catSearch : el.editor.querySelector("#inv-ed-search"));
      if (tab === "pedidos" && !state.editor) cargarPedidos();
    }

    el.tabs.forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.invTab === state.tab) return;
      if (state.tab === "pedidos" && !(await puedeCerrarEditor())) return;
      if (state.tab === "pedidos") cerrarEditor();
      setTab(b.dataset.invTab);
    }));

    // ---------- Catalogo ----------
    function renderChips() {
      const opciones = [{ value: "", label: "Todos" }, ...CATEGORIAS];
      el.chips.innerHTML = opciones.map((c) => {
        const n = c.value ? state.articulos.filter((a) => a.categoria === c.value).length : state.articulos.length;
        return `<button type="button" class="inv-chip${state.catFiltro === c.value ? " is-active" : ""}" data-cat="${c.value}">${esc(c.label)} <span class="inv-chip-count">${n}</span></button>`;
      }).join("");
    }

    el.chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".inv-chip");
      if (!btn) return;
      state.catFiltro = btn.dataset.cat || "";
      renderChips();
      drawCatalogo();
    });

    function drawCatalogo() {
      const q = normalizar(el.catSearch.value);
      const list = state.articulos.filter((a) =>
        (!state.catFiltro || a.categoria === state.catFiltro) &&
        (!q || normalizar(a.nombre).includes(q))
      );

      const fx = window.tableFx?.begin(el.catTbody);
      el.catTbody.innerHTML = "";
      if (!list.length) {
        el.catTbody.innerHTML = `<tr class="empty-row"><td colspan="4">${state.articulos.length ? "Sin resultados" : "No hay artículos en el catálogo"}</td></tr>`;
        fx?.end();
        return;
      }

      list.forEach((a) => {
        const tr = document.createElement("tr");
        tr.dataset.fxKey = String(a.idArticulo);
        tr.dataset.fxSig = `${a.nombre}|${a.categoria}|${a.unidad}`;
        tr.innerHTML = `
          <td class="inv-nombre">${esc(a.nombre)}</td>
          <td><span class="inv-cat-badge" data-cat="${esc(a.categoria)}">${esc(categoriaLabel(a.categoria))}</span></td>
          <td class="inv-muted">${esc(a.unidad || "-")}</td>
          <td style="text-align:center;">
            <div class="ui-action-group">
              <button type="button" class="ui-action-btn is-primary" data-act="editar" title="Editar" aria-label="Editar ${esc(a.nombre)}">${renderIcon("document-text")}</button>
              <button type="button" class="ui-action-btn is-danger" data-act="eliminar" title="Eliminar" aria-label="Eliminar ${esc(a.nombre)}">${renderIcon("trash")}</button>
            </div>
          </td>
        `;
        tr.querySelector('[data-act="editar"]').addEventListener("click", () => abrirModalArticulo(a));
        tr.querySelector('[data-act="eliminar"]').addEventListener("click", (e) => eliminarArticulo(a, e.currentTarget));
        onDobleClicFila(tr, () => abrirModalArticulo(a));
        el.catTbody.appendChild(tr);
      });
      fx?.end();
    }

    // silencioso: recarga despues de guardar sin spinner (el spinner vacia el tbody y la tabla
    // entera volveria a caer como carga inicial; asi solo destella/entra la fila que cambio).
    async function cargarArticulos({ silencioso = false } = {}) {
      const stopLd = silencioso
        ? () => {}
        : window.toothSpinner?.tableLoading(el.catTbody, { label: "Cargando catálogo..." }) || (() => {});
      try {
        const json = await api("/api/inventario/articulos");
        if (!state.alive) return;
        state.articulos = Array.isArray(json.data) ? json.data : [];
        renderChips();
        drawCatalogo();
        if (state.editor) drawEditorPicker();
      } catch (err) {
        if (!state.alive) return;
        console.error(err);
        avisar(err.message || "No se pudo cargar el catálogo", "error");
      } finally {
        stopLd();
      }
    }

    function abrirModalArticulo(articulo) {
      const modal = ensureArticuloModal();
      const titulo = document.getElementById("inv-articulo-titulo");
      const selCat = document.getElementById("inv-articulo-categoria");
      const inNombre = document.getElementById("inv-articulo-nombre");
      const inUnidad = document.getElementById("inv-articulo-unidad");
      const btnCancel = document.getElementById("inv-articulo-cancel");
      const btnSave = document.getElementById("inv-articulo-save");

      titulo.textContent = articulo ? "Editar artículo" : "Agregar artículo";
      selCat.value = articulo?.categoria || state.catFiltro || CATEGORIAS[0].value;
      inNombre.value = articulo?.nombre || "";
      inUnidad.value = articulo?.unidad || "";
      modal.classList.add("show");
      setTimeout(() => inNombre.focus(), 50);

      btnCancel.onclick = () => modal.classList.remove("show");
      btnSave.onclick = async () => {
        if (btnSave.disabled) return;
        const body = {
          categoria: selCat.value,
          nombre: inNombre.value.trim(),
          unidad: inUnidad.value.trim()
        };
        if (!body.nombre) {
          avisar("El nombre no puede estar vacío", "warning");
          inNombre.focus();
          return;
        }

        btnSave.disabled = true;
        window.saveFx?.start(btnSave);
        try {
          if (articulo) {
            await api(`/api/inventario/articulos/${articulo.idArticulo}`, { method: "PUT", body });
          } else {
            await api("/api/inventario/articulos", { method: "POST", body });
          }
          await window.saveFx?.success(btnSave);
          modal.classList.remove("show");
          await cargarArticulos({ silencioso: true });
        } catch (err) {
          window.saveFx?.error(btnSave);
          avisar(err.message || "No se pudo guardar el artículo", "error");
        } finally {
          window.saveFx?.stop(btnSave);
          btnSave.disabled = false;
        }
      };
    }

    async function eliminarArticulo(a, btn) {
      if (!(await confirmar(`¿Eliminar "${a.nombre}" del catálogo?\nLos pedidos anteriores lo conservan.`))) return;
      btn.disabled = true;
      try {
        await api(`/api/inventario/articulos/${a.idArticulo}`, { method: "DELETE" });
        state.articulos = state.articulos.filter((x) => x.idArticulo !== a.idArticulo);
        renderChips();
        drawCatalogo();
      } catch (err) {
        btn.disabled = false;
        avisar(err.message || "No se pudo eliminar el artículo", "error");
      }
    }

    el.catSearch.addEventListener("input", drawCatalogo);
    el.catAdd.addEventListener("click", () => abrirModalArticulo(null));

    // ---------- Lista de pedidos ----------
    async function cargarPedidos() {
      const stopLd = window.toothSpinner?.tableLoading(el.pedTbody, { label: "Cargando pedidos..." }) || (() => {});
      try {
        const json = await api("/api/inventario/pedidos");
        if (!state.alive) return;
        state.pedidos = Array.isArray(json.data) ? json.data : [];
        drawPedidos();
      } catch (err) {
        if (!state.alive) return;
        console.error(err);
        avisar(err.message || "No se pudieron cargar los pedidos", "error");
      } finally {
        stopLd();
      }
    }

    function drawPedidos() {
      const fx = window.tableFx?.begin(el.pedTbody);
      el.pedTbody.innerHTML = "";
      if (!state.pedidos.length) {
        el.pedTbody.innerHTML = `<tr class="empty-row"><td colspan="7">Aún no hay pedidos</td></tr>`;
        fx?.end();
        return;
      }

      const admin = esUsuarioAdmin();
      state.pedidos.forEach((p) => {
        const borrador = p.estado === "Borrador";
        const puedeBorrar = borrador || admin;
        const tr = document.createElement("tr");
        tr.className = "inv-ped-row";
        tr.dataset.fxKey = String(p.idPedido);
        tr.dataset.fxSig = `${p.estado}|${p.totalRenglones}|${p.nota}`;
        tr.innerHTML = `
          <td class="inv-nombre inv-c-id">#${p.idPedido}</td>
          <td class="inv-c-fecha">${esc(formatoFecha(p.generadoEn || p.creadoEn))}</td>
          <td class="inv-c-estado"><span class="inv-estado ${borrador ? "is-borrador" : "is-generado"}">${esc(p.estado)}</span></td>
          <td class="inv-c-cant" style="text-align:center;">${p.totalRenglones}<span class="inv-solo-sm"> artículo${p.totalRenglones === 1 ? "" : "s"}</span></td>
          <td class="inv-muted inv-c-por">${esc(p.generadoPor || p.creadoPor || "-")}</td>
          <td class="inv-muted inv-nota-cell inv-c-nota" title="${esc(p.nota)}">${esc(p.nota || "")}</td>
          <td class="inv-c-acc" style="text-align:center;">
            <div class="ui-action-group">
              <button type="button" class="ui-action-btn is-primary" data-act="abrir" title="${borrador ? "Editar" : "Ver"}" aria-label="${borrador ? "Editar" : "Ver"} pedido ${p.idPedido}">${renderIcon(borrador ? "document-text" : "magnifying-glass")}</button>
              ${borrador ? "" : `<button type="button" class="ui-action-btn is-info" data-act="copiar" title="Copiar texto para WhatsApp" aria-label="Copiar pedido ${p.idPedido}">${renderIcon("document-text")}</button>`}
              ${puedeBorrar ? `<button type="button" class="ui-action-btn is-danger" data-act="eliminar" title="Eliminar" aria-label="Eliminar pedido ${p.idPedido}">${renderIcon("trash")}</button>` : ""}
            </div>
          </td>
        `;
        tr.querySelector('[data-act="abrir"]').addEventListener("click", () => abrirPedido(p.idPedido));
        tr.querySelector('[data-act="copiar"]')?.addEventListener("click", async () => {
          try {
            const json = await api(`/api/inventario/pedidos/${p.idPedido}`);
            avisar((await copiarTexto(textoPedido(json.data))) ? "Pedido copiado" : "No se pudo copiar", "success");
          } catch (err) {
            avisar(err.message, "error");
          }
        });
        tr.querySelector('[data-act="eliminar"]')?.addEventListener("click", (e) => eliminarPedido(p, e.currentTarget));
        onDobleClicFila(tr, () => abrirPedido(p.idPedido));
        el.pedTbody.appendChild(tr);
      });
      fx?.end();
    }

    async function eliminarPedido(p, btn) {
      const extra = p.estado === "Borrador" ? "" : "\nEste pedido ya fue generado.";
      if (!(await confirmar(`¿Eliminar el pedido #${p.idPedido}?${extra}`))) return;
      if (btn) btn.disabled = true;
      try {
        await api(`/api/inventario/pedidos/${p.idPedido}`, { method: "DELETE" });
        state.pedidos = state.pedidos.filter((x) => x.idPedido !== p.idPedido);
        if (state.editor?.idPedido === p.idPedido) cerrarEditor();
        drawPedidos();
        return true;
      } catch (err) {
        if (btn) btn.disabled = false;
        avisar(err.message || "No se pudo eliminar el pedido", "error");
        return false;
      }
    }

    // ---------- Editor de pedido ----------
    function nuevoRenglon(data) {
      renglonSeq += 1;
      return {
        key: renglonSeq,
        idArticulo: data.idArticulo || null,
        categoria: data.categoria || "",
        descripcion: data.descripcion || "",
        cantidad: Number(data.cantidad) || 1,
        unidad: data.unidad || "",
        nota: data.nota || ""
      };
    }

    function abrirEditor(pedido) {
      state.editor = {
        idPedido: pedido?.idPedido || 0,
        estado: pedido?.estado || "Borrador",
        nota: pedido?.nota || "",
        creadoEn: pedido?.creadoEn || null,
        generadoEn: pedido?.generadoEn || null,
        creadoPor: pedido?.creadoPor || null,
        generadoPor: pedido?.generadoPor || null,
        renglones: (pedido?.renglones || []).map(nuevoRenglon),
        pickerCat: "",
        editando: false, // true = pedido Generado abierto con "Editar"
        dirty: false,
        saving: false
      };
      el.pedLista.hidden = true;
      el.editor.hidden = false;
      renderEditor();
    }

    function cerrarEditor() {
      state.editor = null;
      el.editor.hidden = true;
      el.editor.innerHTML = "";
      el.pedLista.hidden = false;
      window.__registerViewSearch?.(null);
    }

    async function puedeCerrarEditor() {
      if (!state.editor?.dirty) return true;
      return confirmar("El pedido tiene cambios sin guardar. ¿Salir sin guardar?");
    }

    async function abrirPedido(idPedido) {
      try {
        const json = await api(`/api/inventario/pedidos/${idPedido}`);
        if (!state.alive) return;
        abrirEditor(json.data);
      } catch (err) {
        avisar(err.message || "No se pudo abrir el pedido", "error");
      }
    }

    function marcarCambio() {
      if (!state.editor) return;
      state.editor.dirty = true;
      const lbl = el.editor.querySelector("#inv-ed-dirty");
      if (lbl) lbl.hidden = false;
    }

    function esEditable(ed) {
      return !!ed && (ed.estado === "Borrador" || ed.editando);
    }

    function renderEditor() {
      const ed = state.editor;
      const editable = esEditable(ed);
      const borrador = ed.estado === "Borrador";
      const titulo = ed.idPedido ? `Pedido #${ed.idPedido}` : "Nuevo pedido";
      const meta = ed.idPedido
        ? `${formatoFecha(ed.generadoEn || ed.creadoEn)} · ${ed.generadoPor || ed.creadoPor || "-"}`
        : "Borrador sin guardar";

      el.editor.innerHTML = `
        <div class="inv-ed-head">
          <button type="button" class="inv-ed-back" id="inv-ed-back" title="Volver a la lista">← Pedidos</button>
          <div class="inv-ed-title">
            <strong>${esc(titulo)}</strong>
            <span class="inv-estado ${borrador ? "is-borrador" : "is-generado"}">${esc(ed.estado)}</span>
            ${ed.editando ? `<span class="inv-editando">Editando</span>` : ""}
            <span class="inv-muted">${esc(meta)}</span>
            <span class="inv-dirty" id="inv-ed-dirty" ${ed.dirty ? "" : "hidden"}>Cambios sin guardar</span>
          </div>
        </div>

        <div class="inv-ed-body ${editable ? "" : "is-readonly"}">
          ${editable ? `
          <aside class="inv-picker">
            <div class="inv-picker-head">Catálogo</div>
            <input class="ui-control" type="search" id="inv-ed-search" placeholder="Buscar y Enter para agregar..." autocomplete="off" spellcheck="false">
            <div class="inv-chips inv-chips-sm" id="inv-ed-chips"></div>
            <div class="inv-picker-list" id="inv-ed-picker"></div>
            <button type="button" class="inv-picker-libre" id="inv-ed-libre">+ Renglón libre (no está en el catálogo)</button>
          </aside>` : ""}

          <div class="inv-ed-main">
            <div class="inv-table-wrap">
              <table class="inv-table inv-ed-table ${editable ? "is-editable" : ""} ui-table-compact">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th style="width:${editable ? 118 : 70}px; text-align:center;">Cantidad</th>
                    <th style="width:110px;">Unidad</th>
                    <th>Nota</th>
                    ${editable ? `<th style="width:44px;"></th>` : ""}
                  </tr>
                </thead>
                <tbody id="inv-ed-tbody"></tbody>
              </table>
            </div>

            ${editable || ed.nota ? `
            <label class="inv-ed-nota-label" for="inv-ed-nota">Nota del pedido</label>
            <textarea id="inv-ed-nota" class="inv-ed-nota" maxlength="500" rows="2" placeholder="Opcional" ${editable ? "" : "readonly"}>${esc(ed.nota)}</textarea>` : ""}

            <div class="inv-ed-actions">
              ${borrador ? `
                ${ed.idPedido ? `<button type="button" class="ui-toolbar-btn is-danger" id="inv-ed-eliminar">${renderIcon("trash", "ui-toolbar-icon")}<span>Eliminar</span></button>` : ""}
                <span class="inv-spacer"></span>
                <button type="button" class="ui-toolbar-btn is-neutral" id="inv-ed-guardar">${renderIcon("check", "ui-toolbar-icon")}<span>Guardar borrador</span></button>
                <button type="button" class="ui-toolbar-btn is-success" id="inv-ed-generar">${renderIcon("check-circle", "ui-toolbar-icon")}<span>Generar pedido</span></button>
              ` : ed.editando ? `
                ${esUsuarioAdmin() ? `<button type="button" class="ui-toolbar-btn is-danger" id="inv-ed-eliminar">${renderIcon("trash", "ui-toolbar-icon")}<span>Eliminar</span></button>` : ""}
                <span class="inv-spacer"></span>
                <button type="button" class="ui-toolbar-btn is-neutral" id="inv-ed-cancelar">${renderIcon("x-mark", "ui-toolbar-icon")}<span>Cancelar</span></button>
                <button type="button" class="ui-toolbar-btn is-success" id="inv-ed-guardar">${renderIcon("check", "ui-toolbar-icon")}<span>Guardar cambios</span></button>
              ` : `
                <button type="button" class="ui-toolbar-btn is-neutral" id="inv-ed-editar" title="Agregar o corregir lo que falto">${renderIcon("document-text", "ui-toolbar-icon")}<span>Editar</span></button>
                <span class="inv-spacer"></span>
                <button type="button" class="ui-toolbar-btn is-neutral" id="inv-ed-copiar">${renderIcon("document-text", "ui-toolbar-icon")}<span>Copiar texto</span></button>
                <button type="button" class="ui-toolbar-btn is-primary" id="inv-ed-pdf">${renderIcon("arrow-down", "ui-toolbar-icon")}<span>Descargar PDF</span></button>
              `}
            </div>
          </div>
        </div>
      `;

      el.editor.querySelector("#inv-ed-back").addEventListener("click", async () => {
        if (!(await puedeCerrarEditor())) return;
        cerrarEditor();
        cargarPedidos();
      });

      const nota = el.editor.querySelector("#inv-ed-nota");
      if (editable) {
        nota.addEventListener("input", () => {
          ed.nota = nota.value;
          marcarCambio();
        });

        const search = el.editor.querySelector("#inv-ed-search");
        search.addEventListener("input", drawEditorPicker);
        search.addEventListener("keydown", (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const primero = articulosPicker()[0];
          if (primero) {
            agregarArticulo(primero);
            search.select();
          }
        });
        window.__registerViewSearch?.(search);

        el.editor.querySelector("#inv-ed-chips").addEventListener("click", (e) => {
          const btn = e.target.closest(".inv-chip");
          if (!btn) return;
          ed.pickerCat = btn.dataset.cat || "";
          drawEditorPicker();
        });
        el.editor.querySelector("#inv-ed-libre").addEventListener("click", () => {
          ed.renglones.push(nuevoRenglon({ descripcion: "", cantidad: 1 }));
          marcarCambio();
          drawEditorRenglones();
          const inputs = el.editor.querySelectorAll(".inv-in-desc");
          inputs[inputs.length - 1]?.focus();
        });
        el.editor.querySelector("#inv-ed-guardar").addEventListener("click", (e) => guardarEditor(false, e.currentTarget));
        el.editor.querySelector("#inv-ed-generar")?.addEventListener("click", (e) => guardarEditor(true, e.currentTarget));
        el.editor.querySelector("#inv-ed-cancelar")?.addEventListener("click", async () => {
          if (!(await puedeCerrarEditor())) return;
          abrirPedido(ed.idPedido); // vuelve a la version guardada, en solo lectura
        });
        el.editor.querySelector("#inv-ed-eliminar")?.addEventListener("click", async (e) => {
          const ok = await eliminarPedido({ idPedido: ed.idPedido, estado: ed.estado }, e.currentTarget);
          if (ok) cargarPedidos();
        });
        drawEditorPicker();
      } else {
        const pedido = pedidoDesdeEditor();
        el.editor.querySelector("#inv-ed-editar").addEventListener("click", () => {
          ed.editando = true;
          renderEditor();
          el.editor.querySelector("#inv-ed-search")?.focus();
        });
        el.editor.querySelector("#inv-ed-copiar").addEventListener("click", async () => {
          avisar((await copiarTexto(textoPedido(pedido))) ? "Pedido copiado, listo para pegar en WhatsApp" : "No se pudo copiar", "success");
        });
        el.editor.querySelector("#inv-ed-pdf").addEventListener("click", () => descargarPdf(pedido));
      }

      drawEditorRenglones();
    }

    function pedidoDesdeEditor() {
      const ed = state.editor;
      return {
        idPedido: ed.idPedido,
        nota: ed.nota,
        creadoEn: ed.creadoEn,
        generadoEn: ed.generadoEn,
        creadoPor: ed.creadoPor,
        generadoPor: ed.generadoPor,
        renglones: ed.renglones
      };
    }

    function articulosPicker() {
      const ed = state.editor;
      const q = normalizar(el.editor.querySelector("#inv-ed-search")?.value);
      return state.articulos.filter((a) =>
        (!ed.pickerCat || a.categoria === ed.pickerCat) &&
        (!q || normalizar(a.nombre).includes(q))
      );
    }

    function drawEditorPicker() {
      const ed = state.editor;
      const chips = el.editor.querySelector("#inv-ed-chips");
      const list = el.editor.querySelector("#inv-ed-picker");
      if (!ed || !chips || !list) return;

      chips.innerHTML = [{ value: "", label: "Todos" }, ...CATEGORIAS].map((c) =>
        `<button type="button" class="inv-chip${ed.pickerCat === c.value ? " is-active" : ""}" data-cat="${c.value}">${esc(c.label)}</button>`
      ).join("");

      const articulos = articulosPicker();
      if (!articulos.length) {
        list.innerHTML = `<div class="inv-picker-empty">${state.articulos.length ? "Sin resultados" : "El catálogo está vacío"}</div>`;
        return;
      }

      const enPedido = new Map(ed.renglones.filter((r) => r.idArticulo).map((r) => [r.idArticulo, r.cantidad]));
      let html = "";
      let catActual = null;
      articulos.forEach((a) => {
        if (!ed.pickerCat && a.categoria !== catActual) {
          catActual = a.categoria;
          html += `<div class="inv-picker-group">${esc(categoriaLabel(a.categoria))}</div>`;
        }
        const cant = enPedido.get(a.idArticulo);
        html += `
          <button type="button" class="inv-picker-item${cant ? " is-added" : ""}" data-id="${a.idArticulo}" title="Agregar al pedido">
            <span class="inv-picker-name">${esc(a.nombre)}</span>
            ${cant ? `<span class="inv-picker-qty">${cant}</span>` : `<span class="inv-picker-plus">+</span>`}
          </button>`;
      });
      list.innerHTML = html;
      list.querySelectorAll(".inv-picker-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const a = state.articulos.find((x) => x.idArticulo === Number(btn.dataset.id));
          if (a) agregarArticulo(a);
        });
      });
    }

    // Si ya esta en el pedido suma 1; si no, lo agrega con cantidad 1.
    function agregarArticulo(a) {
      const ed = state.editor;
      const existente = ed.renglones.find((r) => r.idArticulo === a.idArticulo);
      if (existente) {
        existente.cantidad = Math.min(MAX_CANTIDAD, existente.cantidad + 1);
      } else {
        ed.renglones.push(nuevoRenglon({
          idArticulo: a.idArticulo,
          categoria: a.categoria,
          descripcion: a.nombre,
          cantidad: 1,
          unidad: a.unidad
        }));
      }
      marcarCambio();
      drawEditorRenglones(existente ? existente.key : ed.renglones[ed.renglones.length - 1].key);
      drawEditorPicker();
    }

    function drawEditorRenglones(resaltarKey) {
      const ed = state.editor;
      const tbody = el.editor.querySelector("#inv-ed-tbody");
      if (!ed || !tbody) return;
      const editable = esEditable(ed);
      tbody.innerHTML = "";

      if (!ed.renglones.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="${editable ? 5 : 4}">${editable ? "Elige artículos del catálogo para armar el pedido" : "Sin artículos"}</td></tr>`;
        return;
      }

      const grupos = editable ? [{ label: null, items: ed.renglones }] : agruparRenglones(ed.renglones);
      grupos.forEach((g) => {
        if (g.label) {
          const trG = document.createElement("tr");
          trG.className = "inv-ed-group";
          trG.innerHTML = `<td colspan="4">${esc(g.label)}</td>`;
          tbody.appendChild(trG);
        }
        g.items.forEach((r) => tbody.appendChild(editable ? filaEditable(r) : filaLectura(r)));
      });

      if (resaltarKey) {
        const tr = tbody.querySelector(`tr[data-key="${resaltarKey}"]`);
        if (tr) {
          tr.classList.remove("is-flash");
          void tr.offsetWidth;
          tr.classList.add("is-flash");
          tr.scrollIntoView({ block: "nearest" });
        }
      }
    }

    function filaLectura(r) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="inv-nombre">${esc(r.descripcion)}</td>
        <td style="text-align:center;"><strong>${r.cantidad}</strong></td>
        <td class="inv-muted">${esc(r.unidad || "-")}</td>
        <td class="inv-muted">${esc(r.nota || "")}</td>
      `;
      return tr;
    }

    function filaEditable(r) {
      const ed = state.editor;
      const tr = document.createElement("tr");
      tr.dataset.key = String(r.key);
      const libre = !r.idArticulo;
      tr.innerHTML = `
        <td class="inv-r-art">
          ${libre
            ? `<input type="text" class="inv-in inv-in-desc" maxlength="150" placeholder="Descripción" value="${esc(r.descripcion)}">`
            : `<span class="inv-nombre">${esc(r.descripcion)}</span> <span class="inv-cat-badge is-sm" data-cat="${esc(r.categoria)}">${esc(categoriaLabel(r.categoria))}</span>`}
        </td>
        <td class="inv-r-qty">
          <div class="inv-qty">
            <button type="button" class="inv-qty-btn" data-d="-1" aria-label="Menos">−</button>
            <input type="number" class="inv-in inv-in-qty" min="1" max="${MAX_CANTIDAD}" step="1" value="${r.cantidad}" aria-label="Cantidad">
            <button type="button" class="inv-qty-btn" data-d="1" aria-label="Más">+</button>
          </div>
        </td>
        <td class="inv-r-uni"><input type="text" class="inv-in inv-in-unidad" maxlength="30" list="inv-unidades-ed" placeholder="Unidad" value="${esc(r.unidad)}"></td>
        <td class="inv-r-nota"><input type="text" class="inv-in inv-in-nota" maxlength="200" placeholder="Ej. superior e inferior" value="${esc(r.nota)}"></td>
        <td class="inv-r-del" style="text-align:center;">
          <button type="button" class="ui-action-btn is-danger" data-act="quitar" title="Quitar" aria-label="Quitar ${esc(r.descripcion)}">${renderIcon("x-mark")}</button>
        </td>
      `;

      const inQty = tr.querySelector(".inv-in-qty");
      const setQty = (n) => {
        const v = Math.max(1, Math.min(MAX_CANTIDAD, Math.round(Number(n) || 1)));
        r.cantidad = v;
        inQty.value = v;
        marcarCambio();
        drawEditorPicker();
      };
      tr.querySelectorAll(".inv-qty-btn").forEach((b) => b.addEventListener("click", () => setQty(r.cantidad + Number(b.dataset.d))));
      inQty.addEventListener("change", () => setQty(inQty.value));

      tr.querySelector(".inv-in-desc")?.addEventListener("input", (e) => {
        r.descripcion = e.target.value;
        marcarCambio();
      });
      tr.querySelector(".inv-in-unidad").addEventListener("input", (e) => {
        r.unidad = e.target.value;
        marcarCambio();
      });
      tr.querySelector(".inv-in-nota").addEventListener("input", (e) => {
        r.nota = e.target.value;
        marcarCambio();
      });
      tr.querySelector('[data-act="quitar"]').addEventListener("click", () => {
        ed.renglones = ed.renglones.filter((x) => x.key !== r.key);
        marcarCambio();
        drawEditorRenglones();
        drawEditorPicker();
      });
      return tr;
    }

    async function guardarEditor(generar, btn) {
      const ed = state.editor;
      if (!ed || ed.saving) return;

      const renglones = ed.renglones.map((r) => ({ ...r, descripcion: String(r.descripcion || "").trim() }));
      const sinNombre = renglones.findIndex((r) => !r.descripcion);
      if (sinNombre >= 0) {
        avisar("Hay un renglón libre sin descripción", "warning");
        el.editor.querySelectorAll("#inv-ed-tbody tr")[sinNombre]?.querySelector(".inv-in-desc")?.focus();
        return;
      }
      if (generar) {
        if (!renglones.length) {
          avisar("Agrega al menos un artículo antes de generar el pedido", "warning");
          return;
        }
        if (!(await confirmar(`¿Generar el pedido con ${renglones.length} artículo(s)?\nSi falta algo, después puedes editarlo.`))) return;
      }

      ed.saving = true;
      el.editor.querySelectorAll(".inv-ed-actions button").forEach((b) => { b.disabled = true; });
      window.saveFx?.start(btn);
      try {
        const body = {
          nota: ed.nota,
          generar,
          renglones: renglones.map((r) => ({
            idArticulo: r.idArticulo,
            categoria: r.categoria,
            descripcion: r.descripcion,
            cantidad: r.cantidad,
            unidad: r.unidad,
            nota: r.nota
          }))
        };
        const json = ed.idPedido
          ? await api(`/api/inventario/pedidos/${ed.idPedido}`, { method: "PUT", body })
          : await api("/api/inventario/pedidos", { method: "POST", body });
        await window.saveFx?.success(btn);
        if (!state.alive) return;

        if (generar) {
          avisar(`Pedido #${json.idPedido} generado`, "success");
          abrirEditor(json.data);
        } else if (ed.editando) {
          avisar(`Pedido #${json.idPedido} actualizado`, "success");
          abrirEditor(json.data);
        } else {
          avisar("Borrador guardado", "success");
          abrirEditor(json.data);
        }
      } catch (err) {
        window.saveFx?.error(btn);
        avisar(err.message || "No se pudo guardar el pedido", "error");
        if (state.editor === ed) {
          el.editor.querySelectorAll(".inv-ed-actions button").forEach((b) => { b.disabled = false; });
        }
      } finally {
        window.saveFx?.stop(btn);
        ed.saving = false;
      }
    }

    el.pedNuevo.addEventListener("click", () => abrirEditor(null));

    // Datalist de unidades para los renglones (uno solo por vista).
    const dl = document.createElement("datalist");
    dl.id = "inv-unidades-ed";
    dl.innerHTML = UNIDADES_SUGERIDAS.map((u) => `<option value="${u}"></option>`).join("");
    container.querySelector(".inv-container").appendChild(dl);

    window.__setViewLeaveGuard?.(() => puedeCerrarEditor());
    window.__setViewCleanup?.(() => {
      state.alive = false;
      state.editor = null;
      document.getElementById("modal-inv-articulo")?.classList.remove("show");
    });

    setTab("catalogo");
    cargarArticulos();
  }

  // =========================================
  // MONTAR EN SPA
  // =========================================
  function mountInventario() {
    const content = document.querySelector(".content");
    if (!content) return;
    renderInventario(content);
  }

  window.__mountInventario = mountInventario;
})();
