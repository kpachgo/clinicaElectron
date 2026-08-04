(function () {
  const SHORTCUT_KEY = "q";
  const ADMIN_ROLE = "Administrador";

  let overlay = null;
  let createPasswordInput = null;
  let restorePasswordInput = null;
  let restoreConfirmInput = null;
  let restoreFileInput = null;
  let restoreFileName = null;
  let createBtn = null;
  let restoreBtn = null;
  let pickFileBtn = null;
  let closeBtn = null;
  let statusEl = null;
  let targetEl = null;
  let busyLayer = null;
  let busyTitle = null;
  let busyDetail = null;
  let selectedRestoreFile = null;
  let busy = false;

  function renderIcon(name, className) {
    const registry = window.__uiIcons;
    if (!registry || typeof registry.get !== "function") return "";
    return registry.get(name, { className: className || "ui-toolbar-icon" });
  }

  function getCurrentUserSafe() {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }

  function isAdminSession() {
    return getCurrentUserSafe()?.rol === ADMIN_ROLE;
  }

  function isShortcut(e) {
    return e.ctrlKey && e.shiftKey && String(e.key || "").toLowerCase() === SHORTCUT_KEY;
  }

  async function readJsonResponse(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  function setStatus(message = "", type = "") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `backup-status ${type ? `is-${type}` : ""}`;
  }

  function setTarget(connection = null, error = "") {
    if (!targetEl) return;
    if (connection?.host && connection?.database) {
      const port = connection.port || 3306;
      const ssl = connection.ssl ? " SSL" : "";
      targetEl.textContent = `Destino actual: ${connection.host}:${port} / ${connection.database}${ssl}`;
      targetEl.hidden = false;
      return;
    }

    targetEl.textContent = error || "Destino actual no disponible";
    targetEl.hidden = false;
  }

  function setBusy(value, message = "") {
    busy = Boolean(value);
    createBtn.disabled = busy;
    restoreBtn.disabled = busy;
    pickFileBtn.disabled = busy;
    closeBtn.disabled = busy;
    createPasswordInput.disabled = busy;
    restorePasswordInput.disabled = busy;
    restoreConfirmInput.disabled = busy;
    restoreFileInput.disabled = busy;
    overlay.classList.toggle("is-busy", busy);
    if (busyLayer) busyLayer.hidden = !busy;
    if (busyTitle) busyTitle.textContent = message || "Procesando copia de seguridad...";
    if (busyDetail) {
      busyDetail.textContent = "Mantenga esta ventana abierta. La operacion puede tardar unos minutos.";
    }
    if (message) setStatus(message);
  }

  function filenameFromResponse(res) {
    const exposedName = String(res.headers.get("X-Backup-Filename") || "").trim();
    if (exposedName) return exposedName;

    const disposition = String(res.headers.get("Content-Disposition") || "");
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match?.[1] || `backup_${Date.now()}.clinicbackup`;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function resetRestoreFile() {
    selectedRestoreFile = null;
    if (restoreFileInput) restoreFileInput.value = "";
    if (restoreFileName) restoreFileName.textContent = "Seleccione archivo .clinicbackup";
  }

  function clearFields() {
    if (createPasswordInput) createPasswordInput.value = "";
    if (restorePasswordInput) restorePasswordInput.value = "";
    if (restoreConfirmInput) restoreConfirmInput.value = "";
    resetRestoreFile();
    setStatus("");
  }

  function ensureOverlay() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "backup-overlay";
    overlay.id = "backup-overlay";
    overlay.innerHTML = `
      <div class="backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <div class="backup-header">
          <div>
            <h2 class="backup-title" id="backup-title">Copias de seguridad</h2>
            <p class="backup-subtitle">Base de datos MySQL cifrada y ligada a licencia. No incluye imagenes ni documentos.</p>
          </div>
          <button class="backup-close" id="backup-close" type="button" aria-label="Cerrar">
            ${renderIcon("x-mark", "ui-toolbar-icon")}
          </button>
        </div>
        <div class="backup-body">
          <section class="backup-section">
            <div class="backup-section-head">
              <span class="backup-section-icon is-create">${renderIcon("shield-check", "ui-toolbar-icon")}</span>
              <h3>Crear copia</h3>
            </div>
            <p class="backup-copy">Genera una copia cifrada con contrasena y licencia activa.</p>
            <div class="backup-field">
              <label for="backup-create-password">Contrasena administrador</label>
              <input id="backup-create-password" type="password" autocomplete="current-password">
            </div>
            <button class="backup-action is-create" id="backup-create-btn" type="button">
              ${renderIcon("arrow-down-tray", "ui-toolbar-icon")}
              <span>Crear copia</span>
            </button>
          </section>

          <section class="backup-section">
            <div class="backup-section-head">
              <span class="backup-section-icon is-restore">${renderIcon("arrow-path", "ui-toolbar-icon")}</span>
              <h3>Restaurar copia</h3>
            </div>
            <p class="backup-copy">Reemplaza la base actual con el contenido de una copia cifrada.</p>
            <div class="backup-warning">
              ${renderIcon("exclamation-triangle", "ui-toolbar-icon")}
              <span>Operacion destructiva. Verifique que eligio la copia correcta.</span>
            </div>
            <div class="backup-field">
              <label>Archivo</label>
              <div class="backup-file-row">
                <span class="backup-file-name" id="backup-file-name">Seleccione archivo .clinicbackup</span>
                <button class="backup-pick-file" id="backup-pick-file" type="button">Elegir</button>
              </div>
              <input class="backup-hidden-file" id="backup-file-input" type="file" accept=".clinicbackup">
            </div>
            <div class="backup-field">
              <label for="backup-restore-password">Contrasena administrador</label>
              <input id="backup-restore-password" type="password" autocomplete="current-password">
            </div>
            <div class="backup-field">
              <label for="backup-restore-confirm">Confirmacion</label>
              <input id="backup-restore-confirm" type="text" placeholder="Escriba RESTAURAR">
            </div>
            <button class="backup-action is-restore" id="backup-restore-btn" type="button">
              ${renderIcon("arrow-path", "ui-toolbar-icon")}
              <span>Restaurar copia</span>
            </button>
          </section>

          <div class="backup-target" id="backup-target" hidden></div>
          <div class="backup-status" id="backup-status" aria-live="polite"></div>
        </div>
        <div class="backup-busy-layer" id="backup-busy-layer" hidden>
          <div class="backup-busy-card">
            <div class="backup-spinner" aria-hidden="true"></div>
            <strong id="backup-busy-title">Procesando copia de seguridad...</strong>
            <span id="backup-busy-detail">Mantenga esta ventana abierta. La operacion puede tardar unos minutos.</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    createPasswordInput = overlay.querySelector("#backup-create-password");
    restorePasswordInput = overlay.querySelector("#backup-restore-password");
    restoreConfirmInput = overlay.querySelector("#backup-restore-confirm");
    restoreFileInput = overlay.querySelector("#backup-file-input");
    restoreFileName = overlay.querySelector("#backup-file-name");
    createBtn = overlay.querySelector("#backup-create-btn");
    restoreBtn = overlay.querySelector("#backup-restore-btn");
    pickFileBtn = overlay.querySelector("#backup-pick-file");
    closeBtn = overlay.querySelector("#backup-close");
    statusEl = overlay.querySelector("#backup-status");
    targetEl = overlay.querySelector("#backup-target");
    busyLayer = overlay.querySelector("#backup-busy-layer");
    busyTitle = overlay.querySelector("#backup-busy-title");
    busyDetail = overlay.querySelector("#backup-busy-detail");

    closeBtn?.addEventListener("click", closeBackupModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeBackupModal();
    });
    pickFileBtn.addEventListener("click", () => restoreFileInput.click());
    restoreFileInput.addEventListener("change", () => {
      selectedRestoreFile = restoreFileInput.files?.[0] || null;
      restoreFileName.textContent = selectedRestoreFile?.name || "Seleccione archivo .clinicbackup";
    });
    createBtn.addEventListener("click", () => void createBackup());
    restoreBtn.addEventListener("click", () => void restoreBackup());
  }

  async function openBackupModal() {
    if (!isAdminSession()) {
      if (window.showSystemMessage) {
        await window.showSystemMessage("Solo Administrador puede usar copias de seguridad.", {
          title: "Acceso denegado",
          type: "warning"
        });
      }
      return;
    }

    ensureOverlay();
    clearFields();
    overlay.classList.add("is-open");
    window.setTimeout(() => createPasswordInput?.focus(), 40);
    void refreshBackupStatus();
  }

  function closeBackupModal() {
    if (busy) return;
    if (!overlay) return;
    overlay.classList.remove("is-open");
    clearFields();
  }

  async function refreshBackupStatus() {
    try {
      const res = await fetch("/api/backup/status", {
        cache: "no-store",
        __networkMode: "background",
        __skipConnectionErrorAlert: true
      });
      const data = await readJsonResponse(res);
      if (!res.ok || !data?.ok) {
        setStatus(data?.message || "No se pudo verificar herramientas de backup", "error");
        return;
      }

      setTarget(data?.data?.connection, data?.data?.connectionError);

      if (!data?.data?.ready) {
        setStatus("No se encontro mysqldump o mysql en este equipo.", "error");
      } else {
        setStatus("Herramientas de copia listas.", "ok");
      }
    } catch {
      setStatus("No se pudo verificar herramientas de backup", "error");
    }
  }

  async function createBackup() {
    if (busy) return;
    const passwordActual = String(createPasswordInput?.value || "");
    if (!passwordActual) {
      setStatus("Ingrese la contrasena del administrador.", "error");
      createPasswordInput?.focus();
      return;
    }

    setBusy(true, "Creando copia de seguridad...");
    try {
      const res = await fetch("/api/backup/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        __skipConnectionErrorAlert: true,
        body: JSON.stringify({ passwordActual })
      });

      if (!res.ok) {
        const data = await readJsonResponse(res);
        throw new Error(data?.message || "No se pudo crear la copia de seguridad");
      }

      const fileName = filenameFromResponse(res);
      const blob = await res.blob();
      downloadBlob(blob, fileName);
      createPasswordInput.value = "";
      setStatus("Copia de seguridad creada correctamente.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "No se pudo crear la copia de seguridad", "error");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (busy) return;
    const passwordActual = String(restorePasswordInput?.value || "");
    const confirmacion = String(restoreConfirmInput?.value || "").trim().toUpperCase();

    if (!selectedRestoreFile) {
      setStatus("Seleccione un archivo .clinicbackup.", "error");
      return;
    }
    if (!passwordActual) {
      setStatus("Ingrese la contrasena del administrador.", "error");
      restorePasswordInput?.focus();
      return;
    }
    if (confirmacion !== "RESTAURAR") {
      setStatus("Escriba RESTAURAR para confirmar.", "error");
      restoreConfirmInput?.focus();
      return;
    }

    const confirmed = window.showSystemConfirm
      ? await window.showSystemConfirm(
        "Restaurar reemplazara la base de datos actual. Desea continuar?",
        { title: "Restaurar copia", type: "warning" }
      )
      : window.confirm("Restaurar reemplazara la base de datos actual. Desea continuar?");
    if (!confirmed) return;

    const fd = new FormData();
    fd.append("backup", selectedRestoreFile);
    fd.append("passwordActual", passwordActual);
    fd.append("confirmacion", confirmacion);

    setBusy(true, "Restaurando copia de seguridad...");
    try {
      const res = await fetch("/api/backup/restaurar", {
        method: "POST",
        __skipConnectionErrorAlert: true,
        body: fd
      });
      const data = await readJsonResponse(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || "No se pudo restaurar la copia de seguridad");
      }

      restorePasswordInput.value = "";
      restoreConfirmInput.value = "";
      resetRestoreFile();
      setStatus(data?.message || "Copia restaurada correctamente.", "ok");
      if (window.showSystemMessage) {
        await window.showSystemMessage("Copia restaurada correctamente.", {
          title: "Copias de seguridad",
          type: "success"
        });
      }
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "No se pudo restaurar la copia de seguridad", "error");
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener("keydown", (e) => {
    if (!isShortcut(e)) return;
    e.preventDefault();
    if (overlay?.classList.contains("is-open")) {
      closeBackupModal();
    } else {
      void openBackupModal();
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!overlay?.classList.contains("is-open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeBackupModal();
    }
  }, true);

  window.__openBackupModal = openBackupModal;
})();
