const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

const DEFAULT_SERVER_URL = "http://127.0.0.1:3000";
const SERVER_URL = String(process.env.CLINICA_SERVER_URL || DEFAULT_SERVER_URL).replace(/\/+$/, "");
const HEALTH_PATH = "/health";
const HEALTH_TIMEOUT_MS = 45_000;
const HEALTH_RETRY_MS = 1_000;
const UPDATE_CHECK_DELAY_MS = 4_000;
const ENABLE_CUSTOM_WINDOWS_TITLEBAR = process.env.CLINICA_WIN_CUSTOM_TITLEBAR === "1";
const THEME_CONSOLE_PREFIX = "__CLINICA_THEME__:";
const WINDOWS_TITLEBAR_THEMES = {
  light: { color: "#ffffff", symbolColor: "#0f172a" },
  dark: { color: "#0f172a", symbolColor: "#e2e8f0" },
  vampire: { color: "#252526", symbolColor: "#d4d4d4" },
  princess: { color: "#ffdeef", symbolColor: "#4a2340" }
};

let mainWindow = null;
let backendProcess = null;
let backendStartedByElectron = false;
let isQuitting = false;
let quitForUpdate = false;
let backendReady = false;
let fallbackAttempted = false;
let updaterEnabled = false;
let updateCheckStarted = false;
let updateDownloadedInfo = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

function getLogFilePath() {
  const programData =
    process.env.ProgramData ||
    path.join(process.env.SystemDrive || "C:", "ProgramData");
  return path.join(programData, "ClinicaElectron", "logs", "electron-main.log");
}

function appendLog(line) {
  try {
    const logFile = getLogFilePath();
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // Ignore log write errors.
  }
}

function logLine(prefix, value) {
  const line = String(value || "").trim();
  if (!line) return;
  const out = `${prefix} ${line}`;
  console.log(out);
  appendLog(out);
}

function getRuntimeDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime");
  }
  return path.resolve(__dirname, "..");
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function normalizeThemeForTitleBar(theme) {
  const value = String(theme || "").trim().toLowerCase();
  if (value && WINDOWS_TITLEBAR_THEMES[value]) return value;
  return "light";
}

function getTitleBarPalette(theme) {
  const normalized = normalizeThemeForTitleBar(theme);
  return WINDOWS_TITLEBAR_THEMES[normalized];
}

function applyWindowsTitleBarTheme(theme) {
  if (!ENABLE_CUSTOM_WINDOWS_TITLEBAR) return;
  if (process.platform !== "win32") return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (typeof mainWindow.setTitleBarOverlay !== "function") return;

  const palette = getTitleBarPalette(theme);
  try {
    mainWindow.setTitleBarOverlay({
      color: palette.color,
      symbolColor: palette.symbolColor,
      height: 34
    });
    mainWindow.setBackgroundColor(palette.color);
  } catch (err) {
    logLine("[ELECTRON]", `No se pudo aplicar tema a titlebar: ${err.message}`);
  }
}

function installThemeReporterBridge() {
  if (!ENABLE_CUSTOM_WINDOWS_TITLEBAR) return;
  if (process.platform !== "win32") return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const webContents = mainWindow.webContents;
  if (!webContents || webContents.__clinicaThemeBridgeInstalled) return;
  webContents.__clinicaThemeBridgeInstalled = true;

  webContents.on("console-message", (_event, _level, message) => {
    if (typeof message !== "string") return;
    if (!message.startsWith(THEME_CONSOLE_PREFIX)) return;
    const theme = message.slice(THEME_CONSOLE_PREFIX.length).trim();
    applyWindowsTitleBarTheme(theme);
  });

  webContents.on("did-finish-load", () => {
    const reporterScript = `
      (() => {
        try {
          const MARKER = "${THEME_CONSOLE_PREFIX}";
          const FLAG = "__clinicaThemeReporterInstalled";
          if (window[FLAG]) {
            const current = String((document.body && document.body.dataset && document.body.dataset.theme) || localStorage.getItem("theme") || "light").toLowerCase();
            console.info(MARKER + current);
            return;
          }
          window[FLAG] = true;

          let lastTheme = "";
          const emit = () => {
            const theme = String((document.body && document.body.dataset && document.body.dataset.theme) || localStorage.getItem("theme") || "light").toLowerCase();
            if (!theme || theme === lastTheme) return;
            lastTheme = theme;
            console.info(MARKER + theme);
          };

          const bindObserver = () => {
            emit();
            const target = document.body || document.documentElement;
            if (target && typeof MutationObserver === "function") {
              const observer = new MutationObserver(emit);
              observer.observe(target, { attributes: true, attributeFilter: ["data-theme"] });
            }
            window.addEventListener("storage", (event) => {
              if (!event || event.key === "theme") emit();
            });
            window.setInterval(emit, 1500);
          };

          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", bindObserver, { once: true });
          } else {
            bindObserver();
          }
        } catch (err) {
          console.error(err);
        }
      })();
    `;

    webContents.executeJavaScript(reporterScript).catch((err) => {
      logLine("[ELECTRON]", `No se pudo instalar bridge de tema: ${err.message}`);
    });
  });
}

function getSanitizedEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || key.startsWith("=") || key.includes("\0")) continue;
    if (typeof value !== "string" || value.includes("\0")) continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

function checkServerHealth() {
  return new Promise((resolve) => {
    let settled = false;
    const healthUrl = new URL(HEALTH_PATH, `${SERVER_URL}/`);
    const req = http.get(healthUrl, { timeout: 1_500 }, (res) => {
      if (!settled) {
        settled = true;
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
      res.resume();
    });

    req.on("timeout", () => {
      req.destroy();
    });

    req.on("error", () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });
  });
}

async function waitForServerReady(timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const healthy = await checkServerHealth();
    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_MS));
  }

  return false;
}

function startBackendWithNpm() {
  if (backendProcess) return;

  const runtimeDir = getRuntimeDir();
  const npmCommand = getNpmCommand();
  const env = getSanitizedEnv();
  const spawnCommand =
    process.platform === "win32" ? "cmd.exe" : npmCommand;
  const spawnArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm start"]
      : ["start"];

  try {
    backendProcess = spawn(spawnCommand, spawnArgs, {
      cwd: runtimeDir,
      env,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (err) {
    logLine("[ELECTRON]", `Excepcion al iniciar npm start: ${err.message}`);
    if (!fallbackAttempted) {
      fallbackAttempted = true;
      startBackendWithElectronNode();
    }
    return;
  }
  backendStartedByElectron = true;

  backendProcess.stdout?.on("data", (chunk) => {
    logLine("[BACKEND]", chunk.toString("utf8"));
  });
  backendProcess.stderr?.on("data", (chunk) => {
    logLine("[BACKEND:ERR]", chunk.toString("utf8"));
  });

  backendProcess.on("error", (err) => {
    logLine("[ELECTRON]", `No se pudo iniciar backend con npm start: ${err.message}`);
    backendProcess = null;
    if (!fallbackAttempted && err && err.code === "ENOENT") {
      fallbackAttempted = true;
      startBackendWithElectronNode();
    }
  });

  backendProcess.on("exit", (code, signal) => {
    const shouldFallback = !isQuitting && !backendReady && !fallbackAttempted;
    logLine("[ELECTRON]", `Proceso backend finalizado (code=${code}, signal=${signal || "none"})`);
    backendProcess = null;
    if (shouldFallback) {
      fallbackAttempted = true;
      logLine("[ELECTRON]", "npm start se cerro antes de estar saludable; probando fallback con Node embebido.");
      startBackendWithElectronNode();
    }
  });
}

function startBackendWithElectronNode() {
  if (backendProcess) return;

  const runtimeDir = getRuntimeDir();
  const serverEntry = path.join(runtimeDir, "backend", "server.js");

  try {
    backendProcess = spawn(process.execPath, [serverEntry], {
      cwd: runtimeDir,
      env: getSanitizedEnv({ ELECTRON_RUN_AS_NODE: "1" }),
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (err) {
    logLine("[ELECTRON]", `Excepcion en fallback Node: ${err.message}`);
    return;
  }
  backendStartedByElectron = true;

  backendProcess.stdout?.on("data", (chunk) => {
    logLine("[BACKEND-FALLBACK]", chunk.toString("utf8"));
  });
  backendProcess.stderr?.on("data", (chunk) => {
    logLine("[BACKEND-FALLBACK:ERR]", chunk.toString("utf8"));
  });
  backendProcess.on("exit", (code, signal) => {
    logLine("[ELECTRON]", `Fallback backend finalizado (code=${code}, signal=${signal || "none"})`);
    backendProcess = null;
  });
}

function killBackendProcess() {
  return new Promise((resolve) => {
    if (!backendProcess || !backendStartedByElectron) {
      resolve();
      return;
    }

    const pid = backendProcess.pid;
    backendProcess = null;

    if (!pid) {
      resolve();
      return;
    }

    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
      return;
    }

    try {
      process.kill(-pid, "SIGTERM");
      resolve();
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Ignore kill failures to avoid blocking close.
      }
      resolve();
    }
  });
}

function promptInstallDownloadedUpdate(info) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const nextVersion = String(info?.version || "").trim() || "nueva";
  dialog.showMessageBox(mainWindow, {
    type: "info",
    buttons: ["Reiniciar e instalar", "Despues"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title: "Actualizacion disponible",
    message: `La version ${nextVersion} se descargo correctamente.`,
    detail: "Puede reiniciar ahora para instalarla o continuar trabajando e instalar al cerrar la app."
  }).then(({ response }) => {
    if (response !== 0) return;
    quitForUpdate = true;
    app.quit();
  }).catch((err) => {
    logLine("[AUTOUPDATE]", `No se pudo mostrar dialogo de instalacion: ${err.message}`);
  });
}

function setupAutoUpdater() {
  if (!autoUpdater) {
    logLine("[AUTOUPDATE]", "electron-updater no esta disponible.");
    return;
  }
  if (!app.isPackaged) {
    logLine("[AUTOUPDATE]", "Modo desarrollo detectado; auto-update deshabilitado.");
    return;
  }
  if (updaterEnabled) return;

  updaterEnabled = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    logLine("[AUTOUPDATE]", "Buscando actualizaciones...");
  });

  autoUpdater.on("update-available", (info) => {
    const version = String(info?.version || "").trim() || "desconocida";
    logLine("[AUTOUPDATE]", `Actualizacion disponible: ${version}. Iniciando descarga...`);
  });

  autoUpdater.on("update-not-available", (info) => {
    const version = String(info?.version || app.getVersion() || "").trim();
    logLine("[AUTOUPDATE]", `No hay actualizacion disponible. Version actual: ${version}`);
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Number(progress?.percent || 0).toFixed(1);
    const transferred = Number(progress?.transferred || 0);
    const total = Number(progress?.total || 0);
    logLine("[AUTOUPDATE]", `Descargando actualizacion: ${percent}% (${transferred}/${total} bytes)`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloadedInfo = info || {};
    const version = String(info?.version || "").trim() || "desconocida";
    logLine("[AUTOUPDATE]", `Actualizacion descargada (${version}). Esperando instalacion.`);
    promptInstallDownloadedUpdate(info);
  });

  autoUpdater.on("error", (err) => {
    const message = err && err.message ? err.message : String(err || "Error desconocido");
    logLine("[AUTOUPDATE]", `Error en updater: ${message}`);
  });
}

function scheduleAutoUpdateCheck() {
  if (!updaterEnabled || updateCheckStarted) return;
  updateCheckStarted = true;
  setTimeout(() => {
    if (!updaterEnabled || !autoUpdater) return;
    autoUpdater.checkForUpdates().catch((err) => {
      const message = err && err.message ? err.message : String(err || "Error desconocido");
      logLine("[AUTOUPDATE]", `Fallo al verificar actualizaciones: ${message}`);
    });
  }, UPDATE_CHECK_DELAY_MS);
}

function createWindow() {
  const windowOptions = {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  if (process.platform === "win32" && ENABLE_CUSTOM_WINDOWS_TITLEBAR) {
    const palette = getTitleBarPalette("light");
    windowOptions.titleBarStyle = "hidden";
    windowOptions.titleBarOverlay = {
      color: palette.color,
      symbolColor: palette.symbolColor,
      height: 34
    };
    windowOptions.backgroundColor = palette.color;
  }

  mainWindow = new BrowserWindow(windowOptions);
  installThemeReporterBridge();

  mainWindow.loadURL(SERVER_URL);
  mainWindow.webContents.on("did-finish-load", () => {
    scheduleAutoUpdateCheck();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootApp() {
  logLine("[ELECTRON]", `Boot iniciado. app.isPackaged=${app.isPackaged}`);
  const isAlreadyRunning = await checkServerHealth();
  if (!isAlreadyRunning) {
    startBackendWithNpm();
  } else {
    logLine("[ELECTRON]", "Backend ya estaba saludable en /health.");
  }

  const ready = await waitForServerReady(HEALTH_TIMEOUT_MS);
  backendReady = ready;
  if (!ready) {
    dialog.showErrorBox(
      "No se pudo iniciar el servidor",
      [
        "Electron no logro detectar el backend en /health.",
        `URL esperada: ${SERVER_URL}${HEALTH_PATH}`,
        `Runtime: ${getRuntimeDir()}`,
        `Log: ${getLogFilePath()}`,
        "Verifica Node.js/npm instalados, puerto 3000 libre y firewall."
      ].join("\n")
    );
    await killBackendProcess();
    app.exit(1);
    return;
  }

  setupAutoUpdater();
  createWindow();
}

process.on("uncaughtException", (error) => {
  logLine("[ELECTRON:FATAL]", error && error.stack ? error.stack : String(error));
});

process.on("unhandledRejection", (reason) => {
  logLine("[ELECTRON:FATAL]", reason && reason.stack ? reason.stack : String(reason));
});

if (!gotSingleInstanceLock) {
  appendLog("[ELECTRON] Instancia secundaria detectada; se cierra.");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(bootApp);
}

app.on("before-quit", async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  event.preventDefault();
  await killBackendProcess();
  if (updaterEnabled && autoUpdater && updateDownloadedInfo) {
    const mode = quitForUpdate ? "instalacion inmediata" : "instalacion al cerrar";
    logLine("[AUTOUPDATE]", `Aplicando actualizacion descargada (${mode}).`);
    autoUpdater.quitAndInstall(false, true);
    return;
  }
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length > 0) return;
  const ready = await checkServerHealth();
  if (!ready) return;
  createWindow();
});
