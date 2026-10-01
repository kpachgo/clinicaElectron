// pacienteExpediente.js - Vista Paciente como expediente (diseño aprobado en prueba.html, opcion 3).
//
// No recrea nada: MUEVE las tarjetas que ya arma paciente.js (mismos ids y eventos) a un diseño con
// perfil + menu a la izquierda, tarjetas Etiquetas/Notas/Alergias arriba, la seccion elegida al centro
// y Evolucion (ultimas citas realizadas) a la derecha.
//
// Modos (clase en .pe):
//   is-exp  -> paciente existente: cada seccion se lee como documento; "Editar" muestra el formulario
//              actual solo de esa seccion (Guardar cambios / Cancelar).
//   is-form -> nuevo paciente (o sin paciente): todas las tarjetas apiladas como antes, con "Guardar Paciente".
// Secciones a lo ancho (sin tarjetas de arriba ni Evolucion): odontograma, endodoncia, diagnostico, fotos
// y citas. En tablets se gana espacio contrayendo el panel izquierdo.
//
// Enganches desde paciente.js: mount(), onPacienteCargado(), setMode("form"), onGuardado(), refreshEvolucion().
(function () {
  const COLLAPSE_KEY = "clinica-paciente-exp-collapsed";
  const WIDE = new Set(["odontograma", "endodoncia", "diagnostico", "fotos", "impresiones", "citas"]);
  const SECS = [
    { id: "filiacion", icon: "user", label: "Informacion", card: "Datos Personales" },
    { id: "historia", icon: "clip", label: "Historia clinica", card: "Datos Clinicos" },
    { id: "odontograma", icon: "tooth", label: "Odontograma", card: "Odontograma", raw: true },
    { id: "endodoncia", icon: "bolt", label: "Endodoncia / Cirugia", card: "Endodoncia Cirugia" },
    { id: "diagnostico", icon: "check", label: "Diagnostico final", card: "Diagnostico Final" },
    { id: "fotos", icon: "photo", label: "Radiografias y fotografias", cardId: "fotos-paciente-card", raw: true },
    // Sin tarjeta propia en paciente.js: se arma en mount() con los botones de impresion del odontograma.
    { id: "impresiones", icon: "print", label: "Impresiones", raw: true },
    { id: "citas", icon: "cal", label: "Citas", cardId: "citas-paciente-card", raw: true },
  ];

  const ICON = {
    user: '<path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0A17.9 17.9 0 0 1 12 21.75c-2.68 0-5.22-.58-7.5-1.65Z"/>',
    clip: '<path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.1c0-1.13-.84-2.09-1.96-2.18a48.4 48.4 0 0 0-1.12-.08m-5.8 0a2.25 2.25 0 0 0-.1.66v.75h4.5v-.75c0-.23-.03-.45-.1-.66m-4.3 0A2.25 2.25 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.59m-5.8 0c-.38.03-.75.05-1.12.08C9.1 4.01 8.25 4.97 8.25 6.1V8.25m0 0H4.88c-.62 0-1.13.5-1.13 1.13v10.5c0 .62.5 1.12 1.13 1.12h9.75c.62 0 1.12-.5 1.12-1.12V9.38c0-.63-.5-1.13-1.12-1.13H8.25Z"/>',
    tooth: '<path d="M7 3c-2.5 0-4 2-4 4.5 0 2 .8 3.5 1.5 5 .6 1.4.8 3.2 1.1 5.1.3 1.8.9 3.4 2 3.4 1.3 0 1.6-2 1.9-3.6.2-1.2.6-2.4 1.5-2.4s1.3 1.2 1.5 2.4c.3 1.6.6 3.6 1.9 3.6 1.1 0 1.7-1.6 2-3.4.3-1.9.5-3.7 1.1-5.1.7-1.5 1.5-3 1.5-5C21 5 19.5 3 17 3c-1.8 0-3 1-5 1S8.8 3 7 3z"/>',
    bolt: '<path d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"/>',
    check: '<path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>',
    photo: '<path d="m2.25 15.75 5.16-5.16a2.25 2.25 0 0 1 3.18 0l5.16 5.16m-1.5-1.5 1.41-1.41a2.25 2.25 0 0 1 3.18 0l2.91 2.91M3.75 21h16.5A1.5 1.5 0 0 0 21.75 19.5V4.5A1.5 1.5 0 0 0 20.25 3H3.75A1.5 1.5 0 0 0 2.25 4.5v15A1.5 1.5 0 0 0 3.75 21Z"/>',
    print: '<path d="M6.72 13.83a42.4 42.4 0 0 1 10.56 0M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.46c0-1.08.77-2.01 1.84-2.17a48.5 48.5 0 0 1 14.32 0c1.07.16 1.84 1.09 1.84 2.17v6.29A2.25 2.25 0 0 1 18.75 18h-1.09M6.34 18l-.23 2.5a1.13 1.13 0 0 0 1.12 1.25h9.54a1.13 1.13 0 0 0 1.12-1.25L17.66 18M6.34 18l.38-4.17m10.94 4.17-.38-4.17M6.75 7.1V3.38c0-.62.5-1.13 1.13-1.13h8.24c.63 0 1.13.5 1.13 1.13V7.1M18 10.5h.01"/>',
    cal: '<path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>',
    phone: '<path d="M2.25 6.75c0 8.28 6.72 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.37c0-.52-.35-.97-.85-1.09l-4.42-1.1c-.44-.12-.9.05-1.17.41l-.97 1.29a1.13 1.13 0 0 1-1.21.38 12.04 12.04 0 0 1-7.14-7.14 1.13 1.13 0 0 1 .38-1.21l1.3-.97c.35-.27.52-.73.4-1.17L6.97 3.1a1.13 1.13 0 0 0-1.09-.85H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"/>',
    mail: '<path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.24a2.25 2.25 0 0 1-1.07 1.92l-7.5 4.61a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.91V6.75"/>',
    id: '<path d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.13a1.88 1.88 0 1 1-3.75 0 1.88 1.88 0 0 1 3.75 0Zm1.29 7.13a6.04 6.04 0 0 0-8.33 0"/>',
    pen: '<path d="m16.86 4.49 1.69-1.69a1.88 1.88 0 1 1 2.65 2.65L10.58 16.07a4.5 4.5 0 0 1-1.9 1.13L6 18l.8-2.68a4.5 4.5 0 0 1 1.13-1.9l8.93-8.93Zm0 0L19.5 7.13"/>',
    pin: '<path d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path d="M19.5 10.5c0 7.14-7.5 11.25-7.5 11.25S4.5 17.64 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>',
    tag: '<path d="M9.57 3H5.25A2.25 2.25 0 0 0 3 5.25v4.32c0 .6.24 1.17.66 1.6l9.58 9.58c.7.7 1.78.87 2.61.33a18.1 18.1 0 0 0 5.22-5.22c.54-.83.37-1.91-.33-2.61L11.16 3.66A2.25 2.25 0 0 0 9.57 3Z"/><path d="M6 6h.01v.01H6V6Z"/>',
    warn: '<path d="M12 9v3.75m-9.3 3.38c-.87 1.5.22 3.37 1.95 3.37h14.7c1.73 0 2.82-1.87 1.95-3.37L13.95 3.38c-.87-1.5-3.03-1.5-3.9 0L2.7 16.13ZM12 15.75h.01v.01H12v-.01Z"/>',
    note: '<path d="M19.5 14.25v-2.63a3.38 3.38 0 0 0-3.38-3.37h-1.5A1.13 1.13 0 0 1 13.5 7.13v-1.5a3.38 3.38 0 0 0-3.38-3.38H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.63c-.62 0-1.13.5-1.13 1.13v17.25c0 .62.5 1.12 1.13 1.12h12.75c.62 0 1.12-.5 1.12-1.12V11.25a9 9 0 0 0-9-9Z"/>',
    search: '<path d="m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z"/>',
    chev: '<path d="m18.75 4.5-7.5 7.5 7.5 7.5m-6-15L5.25 12l7.5 7.5"/>',
    plus: '<path d="M12 4.5v15m7.5-7.5h-15"/>',
  };
  const ico = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const EMPTY = "Sin registrar";

  let root = null;
  let mode = "form";
  let sec = "filiacion";
  let collapsed = false;
  let avatarObserver = null;
  let refreshTimer = null;
  const editSnapshots = new Map();

  // ---------- lectura de campos del formulario actual ----------
  const el = (id) => document.getElementById(id);
  const val = (id) => String(el(id)?.value ?? "").trim();
  const selText = (id) => {
    const s = el(id);
    if (!s || !s.value) return "";
    return String(s.options[s.selectedIndex]?.text || s.value).trim();
  };
  const fecha = (iso) => {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso || "");
  };
  // Fecha de una cita como yyyy-mm-dd LOCAL (igual que la tabla de citas: el servidor la manda con hora UTC).
  const citaKey = (v) => {
    const raw = String(v || "").trim();
    if (!raw) return "";
    if (!/T/.test(raw)) return raw.slice(0, 10);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function field(label, value, opts = {}) {
    const v = String(value || "").trim();
    return `<div class="pe-f${v ? "" : " empty"}${opts.wide ? " wide" : ""}"><dt>${label}</dt><dd>${v ? esc(v) : EMPTY}</dd>${opts.extra || ""}</div>`;
  }
  const blank = (secId) => `<div class="pe-blank">Sin datos registrados<button type="button" class="pe-edit-btn" data-pe-edit="${secId}">${ico("plus")}Agregar</button></div>`;

  // ---------- montaje ----------
  function findCard(shell, s) {
    if (s.cardId) return el(s.cardId);
    return Array.from(shell.querySelectorAll(":scope > .paciente-card")).find(
      (c) => String(c.querySelector(".paciente-titulo")?.textContent || "").trim() === s.card
    ) || null;
  }

  // Seccion Impresiones: MUEVE la barra Impresiones / Consentimientos / Configuracion del resumen del
  // odontograma (mismos ids y eventos). El resumen de tratamientos se queda en el odontograma.
  // Se llama dentro de mount(): la tarjeta del odontograma ya se movio a su panel en `root`, que
  // todavia no esta en la pagina (por eso se busca en root y no en shell ni en document).
  // Cada boton se mueve a un mosaico (icono + nombre + descripcion). paciente.js solo usa su
  // onclick y disabled, asi que cambiar su contenido y clases es seguro.
  const IMPRESIONES = [
    { group: "Documentos", items: [
      ["odonto-summary-print-btn", "Pendiente", "Hoja de tratamientos pendientes con precios"],
      ["odonto-summary-assist-btn", "Asistencia", "Constancia de asistencia con horario"],
      ["odonto-summary-exp-btn", "Expediente", "Datos, odontograma, resumen y citas del paciente"],
      ["odonto-summary-multi-btn", "Varios", "Documentos PDF guardados para imprimir"],
    ] },
    { group: "Consentimientos", items: [
      ["odonto-summary-consent-btn", "Endodoncia", "Consentimiento informado de endodoncia"],
      ["odonto-summary-ortho-consent-btn", "Ortodoncia", "Consentimiento informado de ortodoncia"],
    ] },
  ];

  function buildImpresionesCard(shell) {
    const sel = "#odontograma-summary-panel .odonto-summary-header-actions";
    const actions = root?.querySelector(sel) || shell.querySelector(sel);
    if (!actions) return null;
    const btn = (id) => actions.querySelector(`#${id}`);
    const card = document.createElement("div");
    card.className = "paciente-card card pe-impresiones-card";
    card.innerHTML = `
      <div class="pe-print-head">
        <div><h5 class="pe-print-title">Impresiones</h5>
          <p class="pe-print-sub">Documentos del paciente listos para revisar e imprimir</p></div>
      </div>`;

    const config = btn("odonto-summary-config-btn");
    if (config) {
      config.className = "pe-print-config";
      config.innerHTML = `${config.querySelector(".odonto-summary-btn-icon")?.outerHTML || ""}<span>Configuracion</span>`;
      card.querySelector(".pe-print-head").appendChild(config);
    }

    IMPRESIONES.forEach(({ group, items }) => {
      const found = items.map(([id, title, desc]) => [btn(id), title, desc]).filter(([b]) => b);
      if (!found.length) return; // modo venta: sin consentimientos
      const sec = document.createElement("section");
      sec.className = "pe-print-group";
      sec.innerHTML = `<h6 class="pe-print-group-title">${group}</h6><div class="pe-print-grid"></div>`;
      const grid = sec.querySelector(".pe-print-grid");
      found.forEach(([b, title, desc]) => {
        const icon = b.querySelector(".odonto-summary-btn-icon")?.outerHTML || "";
        b.className = "pe-print-tile";
        b.innerHTML = `<span class="pe-print-ico">${icon}</span>
          <span class="pe-print-txt"><b>${esc(title)}</b><small>${esc(desc)}</small></span>
          <span class="pe-print-go" aria-hidden="true">&rsaquo;</span>`;
        grid.appendChild(b);
      });
      card.appendChild(sec);
    });

    actions.remove(); // la barra queda vacia: fuera del resumen del odontograma
    return card;
  }

  function mount() {
    const shell = el("paciente-detail-shell");
    if (!shell || shell.querySelector(":scope > .pe")) return;
    try { collapsed = localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { collapsed = false; }

    // Motivo de consulta y ultima visita pasan a "Datos Clinicos" (se leen y editan en Historia clinica).
    const clinicos = findCard(shell, SECS[1]);
    const motivoCol = el("motivoConsultaP")?.closest(".p-col");
    const ultimaCol = el("ultimaVisitaP")?.closest(".p-col");
    if (clinicos && motivoCol && ultimaCol) {
      const row = document.createElement("div");
      row.className = "p-row";
      row.append(motivoCol, ultimaCol);
      clinicos.querySelector(".paciente-titulo")?.after(row);
    }

    root = document.createElement("div");
    root.className = "pe is-form";
    root.innerHTML = `
      <button type="button" class="pe-search-tab" data-pe-search-tab aria-expanded="false">${ico("search")}<span class="lbl">Buscar paciente</span></button>
      <header class="pe-head">
        <h2 class="pe-head-title">Expediente clinico</h2>
        <p class="pe-head-sub">Historia medica, odontograma, citas y radiografias del paciente</p>
      </header>
      <div class="pe-left">
        <section class="pe-card pe-profile">
          <button type="button" class="pe-collapse" data-pe-collapse title="Ocultar panel" aria-label="Ocultar panel">${ico("chev")}</button>
          <div class="pe-cover"></div>
          <div class="pe-avatar"><span class="pe-initials cav cav-suave"></span></div>
          <h3 class="pe-name"></h3>
          <div class="pe-age"></div>
          <div class="pe-icons">
            <button type="button" data-pe-copy="telefonoP" title="Copiar telefono">${ico("phone")}</button>
            <button type="button" data-pe-copy="correoP" title="Copiar correo">${ico("mail")}</button>
            <button type="button" data-pe-copy="duiP" title="Copiar DUI">${ico("id")}</button>
            <button type="button" data-pe-firma title="Ver firma">${ico("pen")}</button>
          </div>
          <div class="pe-meta"></div>
        </section>
        <nav class="pe-card pe-nav" aria-label="Secciones del expediente">
          <span class="pe-nav-ink"></span>
          ${SECS.map((s) => `<button type="button" data-pe-nav="${s.id}" title="${s.label}">${ico(s.icon)}<span class="lbl">${s.label}</span></button>`).join("")}
        </nav>
      </div>
      <div class="pe-center">
        <div class="pe-top">
          <section class="pe-card pe-mini"><h4>${ico("tag")}Etiquetas</h4><div class="pe-tags"></div></section>
          <section class="pe-card pe-mini note"><h4>${ico("note")}Notas</h4><p class="pe-notes"></p></section>
          <section class="pe-card pe-mini allergy"><h4>${ico("warn")}Alergias</h4><p class="pe-allergies"></p></section>
        </div>
      </div>
      <div class="pe-right">
        <section class="pe-card pe-evo-card">
          <h4>Evolucion<span class="pe-evo-count"></span></h4>
          <ul class="pe-evo"></ul>
          <div class="pe-small">Ultimas citas realizadas (registro de citas)</div>
        </section>
      </div>`;

    const center = root.querySelector(".pe-center");
    SECS.forEach((s) => {
      const card = s.id === "impresiones" ? buildImpresionesCard(shell) : findCard(shell, s);
      const panel = document.createElement("section");
      panel.className = `pe-panel${s.raw ? " pe-raw" : ""}`;
      panel.dataset.peSec = s.id;
      // Nombre de la seccion: solo visible con el menu contraido o en tablet (CSS .pe-sec-title).
      // Impresiones ya trae su propio encabezado.
      const secTitle = `<h3 class="pe-sec-title">${ico(s.icon)}${s.label}</h3>`;
      if (s.raw) {
        if (card && s.id !== "impresiones") card.insertAdjacentHTML("afterbegin", secTitle);
        if (card) panel.appendChild(card);
      } else {
        panel.innerHTML = `
          <div class="pe-card pe-read">
            <div class="pe-read-h">${secTitle}
              <button type="button" class="pe-edit-btn" data-pe-edit="${s.id}">${ico("pen")}Editar</button></div>
            <div class="pe-read-b"></div>
          </div>
          <div class="pe-edit">
            <div class="pe-editbar"><span>Editando: <b>${s.label}</b></span><span class="sp"></span>
              <button type="button" class="pe-bar-btn" data-pe-cancel="${s.id}">Cancelar</button>
              <button type="button" class="pe-bar-btn pri" data-pe-save="${s.id}">Guardar cambios</button></div>
          </div>`;
        if (card) panel.querySelector(".pe-edit").appendChild(card);
      }
      center.appendChild(panel);
    });

    // La foto principal (con su clic para verla) pasa al avatar; su tarjeta queda oculta.
    const fotoCard = shell.querySelector(":scope > .paciente-foto-resumen");
    const fotoImg = el("paciente-foto-principal-img");
    if (fotoImg) root.querySelector(".pe-avatar").prepend(fotoImg);
    if (fotoCard) {
      fotoCard.classList.add("pe-hidden-card");
      root.appendChild(fotoCard);
    }

    // Modales de impresion: salen de la tarjeta del odontograma para abrirse tambien desde
    // Impresiones (dentro de una seccion oculta no se verian). Son position:fixed.
    ["odonto-print-modal", "odonto-print-config-modal", "odonto-multi-print-modal"].forEach((id) => {
      const m = root.querySelector(`#${id}`) || el(id); // root aun no esta en la pagina
      if (m) root.appendChild(m);
    });

    shell.prepend(root);
    root.classList.toggle("is-collapsed", collapsed);
    bindEvents();
    observeAvatar();
    applySec();
  }

  function bindEvents() {
    root.addEventListener("click", onClick);
    // Cualquier cambio en los formularios actualiza perfil, tarjetas de arriba y lecturas.
    const schedule = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 180);
    };
    root.addEventListener("input", schedule);
    root.addEventListener("change", schedule);
    window.addEventListener("resize", () => { moveInk(); syncSearchTab(); });
    // El paciente se carga con la ficha oculta (detras del diente): el resaltado del menu se
    // recalcula cuando el menu obtiene tamaño real.
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => moveInk()).observe(root.querySelector(".pe-nav"));
    }
  }

  async function onClick(e) {
    const t = e.target;
    const secBtn = t.closest("[data-pe-nav]");
    if (secBtn) { sec = secBtn.dataset.peNav; applySec(); return; }
    if (t.closest("[data-pe-collapse]")) { setCollapsed(!collapsed); return; }
    if (t.closest("[data-pe-search-tab]")) { toggleSearch(); return; }
    const copy = t.closest("[data-pe-copy]");
    if (copy) {
      const v = val(copy.dataset.peCopy);
      if (!v) return;
      try { await navigator.clipboard.writeText(v); } catch { /* sin permiso */ }
      window.showToast?.(`Copiado: ${v}`, { type: "success", duration: 1800 });
      return;
    }
    if (t.closest("[data-pe-firma]")) { el("btn-ver-firma-paciente")?.click(); return; }
    const edit = t.closest("[data-pe-edit]");
    if (edit) { startEdit(edit.dataset.peEdit); return; }
    const cancel = t.closest("[data-pe-cancel]");
    if (cancel) { cancelEdit(cancel.dataset.peCancel); return; }
    const save = t.closest("[data-pe-save]");
    if (save) { await saveEdit(save.dataset.peSave, save); return; }
  }

  // ---------- edicion por seccion ----------
  const panelOf = (id) => root?.querySelector(`.pe-panel[data-pe-sec="${id}"]`);
  const controlsOf = (panel) => Array.from(panel.querySelectorAll(".pe-edit input, .pe-edit select, .pe-edit textarea"))
    .filter((c) => c.id && c.type !== "hidden" && !c.classList.contains("autofill-trap"));

  function startEdit(id) {
    const panel = panelOf(id);
    if (!panel || panel.classList.contains("pe-raw")) return;
    editSnapshots.set(id, controlsOf(panel).map((c) => [c, c.value]));
    panel.classList.add("is-editing");
    const first = controlsOf(panel).find((c) => !c.disabled);
    setTimeout(() => first?.focus(), 0);
  }

  function cancelEdit(id) {
    const panel = panelOf(id);
    if (!panel) return;
    const snap = editSnapshots.get(id) || [];
    snap.forEach(([c, v]) => {
      if (c.value === v) return;
      c.value = v;
      c.dispatchEvent(new Event("change", { bubbles: true })); // colores de estado/tratamiento, edad
    });
    editSnapshots.delete(id);
    if (!root.querySelector(".pe-panel.is-editing:not([data-pe-sec='" + id + "'])")) {
      window.__pacienteSetCambiosPendientes?.(false);
    }
    panel.classList.remove("is-editing");
    refresh();
  }

  async function saveEdit(id, btn) {
    if (typeof window.__pacienteGuardar !== "function") return;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Guardando...";
    try {
      const ok = await window.__pacienteGuardar();
      if (ok) {
        editSnapshots.delete(id);
        panelOf(id)?.classList.remove("is-editing");
        refresh();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function exitAllEdits() {
    editSnapshots.clear();
    root?.querySelectorAll(".pe-panel.is-editing").forEach((p) => p.classList.remove("is-editing"));
  }

  // ---------- secciones y disposicion ----------
  // Filiacion e Historia clinica muestran tarjetas de arriba + Evolucion; el resto (odontograma lleno
  // o vacio, endodoncia, diagnostico, fotos, citas) va a lo ancho junto al menu. Para mas espacio en
  // tablets se contrae el panel izquierdo.
  function applySec() {
    if (!root) return;
    root.dataset.peCurrent = sec;
    root.querySelectorAll("[data-pe-nav]").forEach((b) => b.classList.toggle("on", b.dataset.peNav === sec));
    root.querySelectorAll(".pe-panel").forEach((p) => p.classList.toggle("on", p.dataset.peSec === sec));
    root.classList.toggle("is-wide", mode === "exp" && WIDE.has(sec));
    requestAnimationFrame(() => {
      moveInk();
      if (sec === "odontograma") window.dispatchEvent(new Event("odontograma:layout-changed"));
    });
  }

  function observeAvatar() {
    const img = el("paciente-foto-principal-img");
    if (!img || typeof MutationObserver !== "function") return;
    avatarObserver?.disconnect();
    avatarObserver = new MutationObserver(syncAvatar);
    avatarObserver.observe(img, { attributes: true, attributeFilter: ["class", "src"] });
  }

  function syncAvatar() {
    const img = el("paciente-foto-principal-img");
    // paciente.js marca "is-clickable" solo cuando hay foto principal real (no el svg por defecto).
    root?.querySelector(".pe-avatar")?.classList.toggle("has-photo", !!img?.classList.contains("is-clickable"));
  }

  // Sin foto principal: avatar SVG por edad y sexo (js/avatares.js). Solo se redibuja si cambia el avatar,
  // con una pequeña entrada al cambiar (p. ej. al elegir el sexo o corregir la fecha de nacimiento).
  // El id dibujado se guarda en el propio elemento: al volver a la vista, mount() crea un .pe-initials
  // vacio y una variable del modulo decia "ya dibujado" y lo dejaba en blanco.
  function pintarAvatar(edad, sexo) {
    const box = root?.querySelector(".pe-initials");
    const av = window.clinicaAvatares?.paciente(edad, sexo);
    if (!box || !av || av.id === box.dataset.avatar) return;
    const primero = !box.dataset.avatar;
    box.dataset.avatar = av.id;
    box.innerHTML = av.svg;
    box.title = av.label;
    if (primero) return;
    box.classList.remove("cav-in");
    void box.offsetWidth;
    box.classList.add("cav-in");
  }

  // Resaltado del menu: medidas con decimales y origen real (evita la linea blanca al deslizarse).
  function moveInk() {
    const on = root?.querySelector(".pe-nav button.on");
    const ink = root?.querySelector(".pe-nav-ink");
    if (!on || !ink || !on.offsetParent) return;
    const origin = ink.getBoundingClientRect().top - parseFloat(getComputedStyle(ink).top || "0");
    const r = on.getBoundingClientRect();
    const isFirst = !on.previousElementSibling || on.previousElementSibling === ink;
    const top = r.top - origin - (isFirst ? 0 : 1);
    ink.style.top = `${top}px`;
    ink.style.height = `${r.bottom - origin - top}px`;
  }

  function setCollapsed(value) {
    collapsed = value;
    try { localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0"); } catch { /* sin storage */ }
    root.classList.toggle("is-collapsed", value);
    const btn = root.querySelector(".pe-collapse");
    if (btn) {
      btn.title = value ? "Mostrar panel" : "Ocultar panel";
      btn.setAttribute("aria-label", btn.title);
    }
    setTimeout(() => {
      moveInk();
      window.dispatchEvent(new Event("odontograma:layout-changed"));
    }, 380);
  }

  // ---------- pintado de lecturas ----------
  function refresh() {
    if (!root) return;
    const nombre = val("NombreP");
    const edad = val("edadP");
    const idPac = window.pacienteActual?.idPaciente;
    pintarAvatar(edad, val("sexoP"));
    root.querySelector(".pe-name").textContent = nombre || "Paciente";
    root.querySelector(".pe-age").textContent = [edad ? `${edad} años` : "", idPac ? `#${idPac}` : ""].filter(Boolean).join(" · ");
    root.querySelectorAll("[data-pe-copy]").forEach((b) => { b.disabled = !val(b.dataset.peCopy); });
    const firma = val("firmaP");
    const firmaBtn = root.querySelector("[data-pe-firma]");
    if (firmaBtn) {
      firmaBtn.disabled = !firma;
      firmaBtn.title = firma ? "Ver firma" : "Sin firma registrada";
    }
    const dir = val("direccionP");
    root.querySelector(".pe-meta").innerHTML = [
      dir ? `<span class="loc">${ico("pin")}${esc(dir.split(",")[0])}</span>` : "",
      val("fechaRegistroP") ? `<span>Creado ${esc(fecha(val("fechaRegistroP")))}</span>` : "",
    ].join("");
    syncAvatar();

    // Tarjetas de arriba
    const tags = [
      [selText("tipoTratamientoP"), "t3"],
      [selText("estadoP"), val("estadoP") === "1" ? "t4" : "t5"],
      [selText("recomendadoP") ? `Via ${selText("recomendadoP")}` : "", "t2"],
    ].filter(([t]) => t && t !== "Sin registrar");
    root.querySelector(".pe-tags").innerHTML = tags.length
      ? tags.map(([t, c]) => `<span class="pe-tag ${c}">${esc(t)}</span>`).join("")
      : '<span class="muted">Sin etiquetas</span>';
    const notas = val("notasObservacionP");
    refreshNotas();
    const alergiasDe = (t) => String(t || "").split("\n").map((l) => l.trim()).filter((l) => /alergi/i.test(l));
    const alergias = alergiasDe(val("historiaMedicaP")).length ? alergiasDe(val("historiaMedicaP")) : alergiasDe(notas);
    const allergyEl = root.querySelector(".pe-allergies");
    allergyEl.textContent = alergias.length ? alergias.join("\n") : "Sin alergias registradas";
    allergyEl.classList.toggle("muted", !alergias.length);
    allergyEl.closest(".pe-mini").classList.toggle("none", !alergias.length);

    // Lecturas por seccion
    const body = (id) => panelOf(id)?.querySelector(".pe-read-b");
    const firmaExtra = `<button type="button" class="pe-link" data-pe-firma ${firma ? "" : "disabled"}>${firma ? "Ver firma" : ""}</button>`;
    const set = (id, html) => { const b = body(id); if (b) b.innerHTML = html; };
    set("filiacion", `<dl class="pe-fields">
      ${field("Nombre", nombre)}${field("Fecha de nacimiento", fecha(val("fechaNacimientoP")))}
      ${field("Edad", edad ? `${edad} años` : "")}${field("Sexo", selText("sexoP"))}
      ${field("DUI", val("duiP"))}${field("Telefono", val("telefonoP"))}
      ${field("Correo", val("correoP"), { wide: true })}
      ${field("Direccion", val("direccionP"), { wide: true })}
      ${field("Encargado", val("encargadoP"))}${field("Recomendado por", selText("recomendadoP"))}
      ${field("Tipo de tratamiento", selText("tipoTratamientoP"))}${field("Estado", selText("estadoP"))}
      ${field("Fecha de registro", fecha(val("fechaRegistroP")))}
      ${field("Firma paciente / encargado", firma ? "Registrada" : "", { extra: firma ? firmaExtra : "" })}
    </dl>`);
    set("historia", `<dl class="pe-fields">
      ${field("Motivo de consulta", val("motivoConsultaP"), { wide: true })}${field("Ultima visita al dentista", fecha(val("ultimaVisitaP")))}
      ${field("Historia medica", val("historiaMedicaP"))}${field("Historia odontologica", val("historiaOdontologicaP"))}
      ${field("Examen clinico", val("examenClinicoP"), { wide: true })}
      ${field("Examen radiologico", val("examenRadiologicoP"))}${field("Examenes complementarios", val("examenComplementarioP"))}
    </dl>`);
    const endo = ["endodonciaP", "dienteP", "vitalidadP", "percusionP", "medProvisional", "medTrabajoP"];
    set("endodoncia", endo.some(val) ? `<dl class="pe-fields">
      ${field("Endodoncia", val("endodonciaP"))}${field("Diente", val("dienteP"))}
      ${field("Vitalidad", val("vitalidadP"))}${field("Percusion", val("percusionP"))}
      ${field("Med. provisional", val("medProvisional"))}${field("Med. de trabajo", val("medTrabajoP"))}
    </dl>` : blank("endodoncia"));
    set("diagnostico", val("tratamientoP") || notas ? `<dl class="pe-fields">
      ${field("Diagnostico final", val("tratamientoP"), { wide: true })}${field("Notas / observaciones", notas, { wide: true })}
    </dl>` : blank("diagnostico"));
    // Sin datos: la seccion no muestra "Editar" arriba (ya esta el boton Agregar).
    ["endodoncia", "diagnostico"].forEach((id) => {
      const p = panelOf(id);
      p?.querySelector(".pe-read-h .pe-edit-btn")?.toggleAttribute("hidden", !!p.querySelector(".pe-blank"));
    });

    refreshEvolucion();
  }

  // ---------- Tarjeta Notas: nota global + notas para la proxima cita vigentes ----------
  // Con varias notas se van turnando (pausa con el mouse encima). Flechas y puntos para ir a la
  // anterior/siguiente; en tablet tambien deslizando el dedo sobre la nota. Al navegar a mano la
  // rotacion espera un rato para dar tiempo de leer (en tablet no hay "mouse encima").
  const NOTAS_ROTACION_MS = 6000;
  const NOTAS_PAUSA_MANUAL_MS = 15000;
  let notasTimer = null;
  let notasIdx = 0;
  let notasFirma = "";
  let notasItems = [];
  let notasManualAt = 0;

  function notasProximaDelPaciente() {
    const idPac = Number(window.pacienteActual?.idPaciente || 0);
    return (Array.isArray(window.notasProximaCita) ? window.notasProximaCita : [])
      .filter((n) => Number(n.idPaciente) === idPac);
  }

  function notasCard() {
    const notesEl = root?.querySelector(".pe-notes");
    const card = notesEl?.closest(".pe-mini");
    return notesEl && card ? { notesEl, card } : null;
  }

  function pintarNota() {
    const els = notasCard();
    if (!els) return;
    const { notesEl, card } = els;
    const items = notasItems;
    const it = items[notasIdx];
    card.classList.toggle("is-proxima", !!it?.proxima);
    if (!it) {
      notesEl.textContent = "Sin notas / observaciones";
      notesEl.classList.add("muted");
    } else {
      notesEl.classList.remove("muted");
      notesEl.innerHTML = `${it.proxima ? '<span class="pe-note-chip">Antes de la proxima cita</span>' : ""}<span class="pe-note-text">${esc(it.texto)}</span>${it.meta ? `<small class="pe-note-meta">${esc(it.meta)}</small>` : ""}`;
    }
    let nav = card.querySelector(".pe-note-nav");
    if (items.length > 1) {
      if (!nav) {
        nav = document.createElement("div");
        nav.className = "pe-note-nav";
        nav.innerHTML = `<button type="button" class="pe-note-arrow" data-note-step="-1" aria-label="Nota anterior" title="Nota anterior">&lsaquo;</button>`
          + `<span class="pe-note-dots"></span>`
          + `<button type="button" class="pe-note-arrow" data-note-step="1" aria-label="Nota siguiente" title="Nota siguiente">&rsaquo;</button>`;
        card.appendChild(nav);
      }
      nav.querySelector(".pe-note-dots").innerHTML = items.map((x, i) =>
        `<button type="button" class="pe-note-dot${i === notasIdx ? " on" : ""}${x.proxima ? " prox" : ""}" data-note-idx="${i}" aria-label="Nota ${i + 1} de ${items.length}"${i === notasIdx ? ' aria-current="true"' : ""}><span></span></button>`).join("");
    } else {
      nav?.remove();
    }
    notesEl.classList.remove("pe-note-in");
    void notesEl.offsetWidth;
    notesEl.classList.add("pe-note-in");
  }

  function irANota(idx) {
    const n = notasItems.length;
    if (n < 2) return;
    notasIdx = ((idx % n) + n) % n;
    notasManualAt = Date.now();
    pintarNota();
  }

  // Se enlaza una sola vez por tarjeta: clic en flechas/puntos y deslizar con el dedo.
  function bindNotasNav(card, notesEl) {
    if (card.dataset.noteNavBound) return;
    card.dataset.noteNavBound = "1";
    card.addEventListener("click", (e) => {
      const step = e.target.closest("[data-note-step]");
      const dot = e.target.closest("[data-note-idx]");
      if (step) irANota(notasIdx + Number(step.dataset.noteStep));
      else if (dot) irANota(Number(dot.dataset.noteIdx));
    });
    let startX = null;
    let startY = 0;
    notesEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      startX = e.clientX;
      startY = e.clientY;
    });
    notesEl.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) irANota(notasIdx + (dx < 0 ? 1 : -1));
    });
    notesEl.addEventListener("pointercancel", () => { startX = null; });
  }

  function refreshNotas() {
    const els = notasCard();
    if (!els) return;
    const { notesEl, card } = els;
    bindNotasNav(card, notesEl);
    const global = val("notasObservacionP");
    const items = [
      ...(global ? [{ proxima: false, texto: global }] : []),
      ...notasProximaDelPaciente().filter((n) => n.vigente)
        .map((n) => ({ proxima: true, texto: n.notaPC, meta: [fecha(n.fechaNotaPC), n.creadoPor].filter(Boolean).join(" · ") })),
    ];
    // Si las notas no cambiaron se conserva la que se esta viendo (refresh() se llama seguido).
    const firma = JSON.stringify(items);
    if (firma !== notasFirma) { notasFirma = firma; notasIdx = 0; notasManualAt = 0; }
    notasItems = items;
    if (notasIdx >= items.length) notasIdx = 0;

    clearInterval(notasTimer);
    notasTimer = null;
    pintarNota();
    if (items.length > 1) {
      notasTimer = setInterval(() => {
        if (!root?.isConnected) { clearInterval(notasTimer); notasTimer = null; return; }
        if (card.matches(":hover")) return;
        if (Date.now() - notasManualAt < NOTAS_PAUSA_MANUAL_MS) return;
        notasIdx = (notasIdx + 1) % notasItems.length;
        pintarNota();
      }, NOTAS_ROTACION_MS);
    }
  }

  // Notas de proxima cita recien cargadas (paciente.js): tarjeta Notas + Evolucion.
  function refreshNotasProxima() {
    refreshNotas();
    refreshEvolucion();
  }

  // "8. Control..." -> el numero en el circulo rojo, igual que en Registro de citas.
  function procedimientoEvo(texto) {
    const raw = String(texto || "").trim() || "Cita";
    const m = raw.match(/^(\d{1,4})\.\s*(.*)$/s);
    if (!m) return esc(raw);
    return `<span class="rv-cita-num">${esc(m[1])}</span>${m[2] ? ` ${esc(m[2])}` : ""}`;
  }

  function refreshEvolucion() {
    if (!root) return;
    const hoy = new Date();
    const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const citas = (Array.isArray(window.citasPaciente) ? window.citasPaciente : [])
      .map((c) => ({ c, key: citaKey(c.fechaCP) }))
      .filter(({ key }) => key && key <= hoyKey)
      .sort((a, b) => b.key.localeCompare(a.key));
    root.querySelector(".pe-evo-count").textContent = `${citas.length} ${citas.length === 1 ? "cita" : "citas"}`;
    const list = root.querySelector(".pe-evo");
    // Notas para la proxima cita en amarillo, en su fecha: arriba de la cita de ese dia (se
    // escribieron en esa visita para la siguiente). Pendientes resaltadas; cumplidas mas suaves.
    const notas = notasProximaDelPaciente().map((n) => ({ n, key: String(n.fechaNotaPC || "").slice(0, 10) }));
    const items = [
      ...notas.map((x) => ({ ...x, tipo: "nota" })),
      ...citas.map((x) => ({ ...x, tipo: "cita" })),
    ].sort((a, b) => b.key.localeCompare(a.key) || (a.tipo === "nota" ? -1 : 1) - (b.tipo === "nota" ? -1 : 1));
    list.innerHTML = items.length ? items.map((it) => {
      if (it.tipo === "nota") {
        const { n } = it;
        const estado = n.vigente ? "Pendiente para la proxima cita" : `Cumplida · cita del ${fecha(n.cumplidaEnCita)}`;
        return `<li class="pe-evo-nota${n.vigente ? " is-vigente" : " is-cumplida"}"><small><span class="pe-evo-fecha">${esc(fecha(n.fechaNotaPC))}</span><span class="pe-evo-nota-tag">Nota</span>${esc(estado)}${n.creadoPor ? ` · ${esc(n.creadoPor)}` : ""}</small>
          <b>${esc(n.notaPC)}</b></li>`;
      }
      const { c, key } = it;
      return `<li><small><span class="pe-evo-fecha">${esc(fecha(key))}</span>${c.nombreDoctor ? ` · ${esc(c.nombreDoctor)}` : ""}</small>
        <b>${procedimientoEvo(c.ProcedimientoCP)}</b></li>`;
    }).join("") : '<li class="pe-evo-empty">Sin citas realizadas</li>';
  }

  // ---------- Buscador oculto con paciente cargado + pestaña vertical ----------
  // Con paciente cargado el buscador se oculta y aparece una pestaña vertical en el borde derecho;
  // clic en la pestaña lo muestra (sube la pagina y enfoca el campo) o lo vuelve a ocultar.
  // Sin paciente (nuevo / limpiar): el buscador siempre visible y sin pestaña.
  const searchCard = () => document.querySelector(".paciente-busqueda");
  const searchHidden = () => !!searchCard()?.classList.contains("pe-search-hidden");

  function setSearchHidden(hidden) {
    const card = searchCard();
    if (card && searchHidden() !== hidden) card.classList.toggle("pe-search-hidden", hidden);
    syncSearchTab();
  }

  function syncSearchTab() {
    const tab = root?.querySelector(".pe-search-tab");
    if (!tab) return;
    // Pegada al borde derecho del area de vistas, sin tapar la barra de scroll de .content.
    const content = root.closest(".content") || document.querySelector(".content");
    if (content) {
      const r = content.getBoundingClientRect();
      const barra = content.offsetWidth - content.clientWidth;
      root.style.setProperty("--pe-tab-right", `${Math.max(0, window.innerWidth - r.right + barra)}px`);
    }
    const oculto = searchHidden();
    tab.classList.toggle("is-open", !oculto);
    tab.querySelector(".lbl").textContent = oculto ? "Buscar paciente" : "Ocultar buscador";
    tab.title = oculto ? "Buscar otro paciente" : "Ocultar el buscador";
    tab.setAttribute("aria-expanded", oculto ? "false" : "true");
  }

  function toggleSearch() {
    if (mode !== "exp") return;
    const mostrar = searchHidden();
    setSearchHidden(!mostrar);
    if (!mostrar) {
      // No dejar el cursor en un campo oculto.
      if (searchCard()?.contains(document.activeElement)) document.activeElement.blur();
      return;
    }
    const scroller = root.closest(".content") || document.querySelector(".content");
    scroller?.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => document.getElementById("buscar-paciente-p")?.focus(), 380);
  }

  // ---------- API ----------
  function setMode(next) {
    mode = next === "exp" ? "exp" : "form";
    if (!root) return;
    exitAllEdits();
    root.classList.toggle("is-exp", mode === "exp");
    root.classList.toggle("is-form", mode === "form");
    root.querySelector(".pe-head-title").textContent = mode === "exp" ? "Expediente clinico" : "Nuevo paciente";
    root.querySelector(".pe-head-sub").textContent = mode === "exp"
      ? "Historia medica, odontograma, citas y radiografias del paciente"
      : "Complete los datos para crear el expediente";
    setSearchHidden(mode === "exp");
    refresh();
    applySec();
  }

  window.pacienteExpediente = {
    mount,
    setMode,
    refresh,
    refreshEvolucion,
    refreshNotasProxima,
    onPacienteCargado() { setMode("exp"); },
    onGuardado() {
      if (mode === "form" && window.pacienteActual?.idPaciente) setMode("exp");
      else refresh();
    },
  };
})();
