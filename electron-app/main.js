const { app, BrowserWindow, Menu, dialog, safeStorage, session } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
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
const BOOL_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const BOOL_FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const THEME_CONSOLE_PREFIX = "__CLINICA_THEME__:";
const DB_CONFIG_KEY_ENV = "CLINICA_DB_CONFIG_KEY";
const DB_CONFIG_REQUIRED_ENV = "CLINICA_DB_CONFIG_PROTECTED_REQUIRED";
const DB_KEY_MAGIC = Buffer.from("CLKEY2", "ascii");
const WINDOWS_TITLEBAR_THEMES = {
  light: { color: "#ffffff", symbolColor: "#0f172a" },
  dark: { color: "#0f172a", symbolColor: "#e2e8f0" },
  vampire: { color: "#252526", symbolColor: "#d4d4d4" },
  princess: { color: "#ffdeef", symbolColor: "#4a2340" }
};
const SERVER_URL_INFO = (() => {
  try {
    const parsed = new URL(`${SERVER_URL}/`);
    return {
      hostname: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || "3000")
    };
  } catch {
    return {
      hostname: "127.0.0.1",
      port: 3000
    };
  }
})();
const SERVER_PORT = Number.isInteger(SERVER_URL_INFO.port) && SERVER_URL_INFO.port > 0
  ? SERVER_URL_INFO.port
  : 3000;

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
let devNoCachePoliciesInstalled = false;
let backendRestartTimer = null;

function readBooleanFlag(name, defaultValue) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return Boolean(defaultValue);
  if (BOOL_TRUE_VALUES.has(raw)) return true;
  if (BOOL_FALSE_VALUES.has(raw)) return false;
  return Boolean(defaultValue);
}

const DEV_DISABLE_CACHE = !app.isPackaged && readBooleanFlag("CLINICA_DEV_DISABLE_CACHE", true);
const DEV_FORCE_BACKEND_RESTART = !app.isPackaged && readBooleanFlag("CLINICA_DEV_FORCE_BACKEND_RESTART", true);

const gotSingleInstanceLock = app.requestSingleInstanceLock();

function getLogFilePath() {
  const programData =
    process.env.ProgramData ||
    path.join(process.env.SystemDrive || "C:", "ProgramData");
  return path.join(programData, "ClinicaElectron", "logs", "electron-main.log");
}

function normalizeEnvPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(raw);
}

function getClinicaDataRootPath() {
  const envOverride = normalizeEnvPath(process.env.CLINICA_DATA_DIR);
  if (envOverride) return envOverride;

  if (process.platform === "win32") {
    const programData = normalizeEnvPath(process.env.ProgramData || "C:\\ProgramData");
    return path.join(programData, "ClinicaElectron");
  }

  if (process.platform === "darwin") {
    return path.join("/Users/Shared", "ClinicaElectron");
  }

  return path.join(require("os").homedir(), ".ClinicaElectron");
}

function getProtectedDbConfigDir() {
  return path.join(getClinicaDataRootPath(), "system", "electrondump");
}

function getProtectedDbKeyPath() {
  return path.join(getProtectedDbConfigDir(), "state.dat");
}

function getProtectedDbConfigPath() {
  return path.join(getProtectedDbConfigDir(), "util.dat");
}

function quarantineProtectedDbFile(filePath, reason) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(dir, `${base}.invalid-${stamp}${ext || ".dat"}`);
    fs.renameSync(filePath, target);
    logLine("[ELECTRON]", `Archivo local protegido puesto en cuarentena: ${target} (${reason})`);
    return target;
  } catch (err) {
    logLine("[ELECTRON]", `No se pudo poner en cuarentena ${filePath}: ${err?.message || err}`);
    return "";
  }
}

function readProtectedDbConfigKey() {
  const keyPath = getProtectedDbKeyPath();
  if (!fs.existsSync(keyPath)) return "";

  const data = fs.readFileSync(keyPath);
  if (data.length <= DB_KEY_MAGIC.length || !data.subarray(0, DB_KEY_MAGIC.length).equals(DB_KEY_MAGIC)) {
    throw new Error("Archivo de clave local no compatible o modificado");
  }

  const encrypted = data.subarray(DB_KEY_MAGIC.length);
  const keyBase64 = safeStorage.decryptString(encrypted);
  const key = Buffer.from(String(keyBase64 || ""), "base64");
  if (key.length !== 32) {
    throw new Error("Clave local invalida");
  }
  return key.toString("base64");
}

function writeProtectedDbConfigKey(keyBase64) {
  const keyPath = getProtectedDbKeyPath();
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const encrypted = safeStorage.encryptString(keyBase64);
  const payload = Buffer.concat([DB_KEY_MAGIC, encrypted]);
  const tempPath = path.join(path.dirname(keyPath), `state.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, payload);
  fs.renameSync(tempPath, keyPath);
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Windows ACLs are managed by the OS/DPAPI; chmod may be ignored.
  }
}

function ensureProtectedDbConfigKey() {
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== "function") {
    throw new Error("safeStorage no esta disponible en Electron");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("El cifrado local del sistema no esta disponible");
  }

  let existing = "";
  try {
    existing = readProtectedDbConfigKey();
  } catch (err) {
    const reason = err?.message || String(err || "clave local invalida");
    logLine("[ELECTRON]", `Clave local protegida invalida; se regenerara: ${reason}`);
    quarantineProtectedDbFile(getProtectedDbKeyPath(), reason);
    quarantineProtectedDbFile(getProtectedDbConfigPath(), "conexion cifrada dependia de clave local invalida");
  }
  if (existing) return existing;

  const keyBase64 = crypto.randomBytes(32).toString("base64");
  writeProtectedDbConfigKey(keyBase64);
  return keyBase64;
}

function getBackendRuntimeEnv(extra = {}) {
  const env = { ...extra };
  try {
    env[DB_CONFIG_KEY_ENV] = ensureProtectedDbConfigKey();
    env[DB_CONFIG_REQUIRED_ENV] = app.isPackaged ? "1" : "0";
  } catch (err) {
    logLine("[ELECTRON]", `No se pudo preparar clave local de conexion: ${err.message}`);
    if (app.isPackaged) {
      throw err;
    }
    env[DB_CONFIG_REQUIRED_ENV] = "0";
  }
  return env;
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

function resolveWindowIconPath() {
  if (process.platform !== "win32" && process.platform !== "linux") return null;

  const candidates = [
    path.join(__dirname, "incisoft.ico"),
    path.join(path.resolve(__dirname, ".."), "incisoft.ico"),
    path.join(process.resourcesPath || "", "incisoft.ico"),
    path.join(process.resourcesPath || "", "runtime", "incisoft.ico")
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
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

async function waitForServerDown(timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const healthy = await checkServerHealth();
    if (!healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function runNodeScript(scriptPath, args = [], timeoutMs = 20_000) {
  return new Promise((resolve) => {
    const env = getSanitizedEnv({ ELECTRON_RUN_AS_NODE: "1" });
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: getRuntimeDir(),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            windowsHide: true,
            stdio: "ignore"
          });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
      resolve({ ok: false, code: "timeout", stdout, stderr });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        code: "spawn_error",
        stdout,
        stderr: `${stderr}\n${err?.message || err}`
      });
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        code: String(code),
        stdout,
        stderr
      });
    });
  });
}

async function stopExistingBackendOnPort(reasonLabel) {
  const healthy = await checkServerHealth();
  if (!healthy) return true;

  const stopScript = path.join(getRuntimeDir(), "backend", "scripts", "stop-server.js");
  if (!fs.existsSync(stopScript)) {
    logLine("[ELECTRON]", `No se encontro script de stop para liberar puerto ${SERVER_PORT}: ${stopScript}`);
    return false;
  }

  logLine("[ELECTRON]", `${reasonLabel} en puerto ${SERVER_PORT}.`);
  const result = await runNodeScript(stopScript, [String(SERVER_PORT)], 25_000);
  const out = String(result.stdout || "").trim();
  const err = String(result.stderr || "").trim();
  if (out) logLine("[ELECTRON]", `stop-server stdout: ${out}`);
  if (err) logLine("[ELECTRON]", `stop-server stderr: ${err}`);

  const down = await waitForServerDown(12_000);
  if (!down) {
    logLine("[ELECTRON]", `Backend previo sigue respondiendo en /health tras stop-server; no se libero el puerto ${SERVER_PORT}.`);
    return false;
  }
  return true;
}

async function stopExistingBackendOnPortInDev() {
  if (!DEV_FORCE_BACKEND_RESTART) return true;

  return stopExistingBackendOnPort("Modo dev: reinicio forzado backend");
}

async function stopExternalBackendOnPortInPackaged() {
  if (!app.isPackaged) return true;

  return stopExistingBackendOnPort(
    "Modo empaquetado: backend existente detectado; deteniendo para arranque seguro"
  );
}

function startBackendWithNpm() {
  if (backendProcess) return;
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }

  const runtimeDir = getRuntimeDir();
  const npmCommand = getNpmCommand();
  const env = getSanitizedEnv(getBackendRuntimeEnv());
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
    const shouldRestart = !isQuitting && backendReady && backendStartedByElectron;
    logLine("[ELECTRON]", `Proceso backend finalizado (code=${code}, signal=${signal || "none"})`);
    backendProcess = null;
    if (shouldFallback) {
      fallbackAttempted = true;
      logLine("[ELECTRON]", "npm start se cerro antes de estar saludable; probando fallback con Node embebido.");
      startBackendWithElectronNode();
      return;
    }
    if (shouldRestart) {
      logLine("[ELECTRON]", "Backend finalizo despues del arranque; reiniciando.");
      backendReady = false;
      backendRestartTimer = setTimeout(() => {
        backendRestartTimer = null;
        fallbackAttempted = false;
        startBackendWithNpm();
        waitForServerReady(HEALTH_TIMEOUT_MS).then((ready) => {
          backendReady = ready;
          if (ready) {
            logLine("[ELECTRON]", "Backend reiniciado y saludable.");
            return;
          }
          logLine("[ELECTRON]", "Backend reiniciado pero no respondio en /health.");
        });
      }, 900);
    }
  });
}

function startBackendWithElectronNode() {
  if (backendProcess) return;
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }

  const runtimeDir = getRuntimeDir();
  const serverEntry = path.join(runtimeDir, "backend", "server.js");

  try {
    backendProcess = spawn(process.execPath, [serverEntry], {
      cwd: runtimeDir,
      env: getSanitizedEnv(getBackendRuntimeEnv({ ELECTRON_RUN_AS_NODE: "1" })),
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
    const shouldRestart = !isQuitting && backendReady && backendStartedByElectron;
    logLine("[ELECTRON]", `Fallback backend finalizado (code=${code}, signal=${signal || "none"})`);
    backendProcess = null;
    if (shouldRestart) {
      logLine("[ELECTRON]", "Fallback backend finalizo despues del arranque; reiniciando.");
      backendReady = false;
      backendRestartTimer = setTimeout(() => {
        backendRestartTimer = null;
        startBackendWithElectronNode();
        waitForServerReady(HEALTH_TIMEOUT_MS).then((ready) => {
          backendReady = ready;
          if (ready) {
            logLine("[ELECTRON]", "Fallback backend reiniciado y saludable.");
            return;
          }
          logLine("[ELECTRON]", "Fallback backend reiniciado pero no respondio en /health.");
        });
      }, 900);
    }
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

function buildNoCacheResponseHeaders(originalHeaders = {}) {
  const headers = { ...originalHeaders };
  headers["Cache-Control"] = ["no-store, no-cache, must-revalidate, max-age=0"];
  headers["Pragma"] = ["no-cache"];
  headers["Expires"] = ["0"];
  return headers;
}

async function installDevNoCachePolicies() {
  if (!DEV_DISABLE_CACHE || devNoCachePoliciesInstalled) return;
  if (!session?.defaultSession) return;

  const ses = session.defaultSession;
  devNoCachePoliciesInstalled = true;

  try {
    await ses.clearCache();
    await ses.clearStorageData({
      storages: ["appcache", "serviceworkers", "cachestorage", "shadercache"]
    });
    logLine("[ELECTRON]", "Modo dev: cache web limpiado para evitar assets viejos.");
  } catch (err) {
    logLine("[ELECTRON]", `No se pudo limpiar cache dev: ${err?.message || err}`);
  }

  const urls = [
    `${SERVER_URL}/*`,
    `http://127.0.0.1:${SERVER_PORT}/*`,
    `http://localhost:${SERVER_PORT}/*`
  ];

  ses.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const requestHeaders = {
      ...(details.requestHeaders || {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    };
    callback({ requestHeaders });
  });

  ses.webRequest.onHeadersReceived({ urls }, (details, callback) => {
    callback({
      responseHeaders: buildNoCacheResponseHeaders(details.responseHeaders || {})
    });
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

  const windowIcon = resolveWindowIconPath();
  if (windowIcon) {
    windowOptions.icon = windowIcon;
  }

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
  Menu.setApplicationMenu(null);
  mainWindow.setMenu(null);
  installThemeReporterBridge();

  const launchUrl = DEV_DISABLE_CACHE
    ? `${SERVER_URL}/?_ts=${Date.now()}`
    : SERVER_URL;
  mainWindow.loadURL(launchUrl);
  mainWindow.webContents.on("did-finish-load", () => {
    scheduleAutoUpdateCheck();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function bootApp() {
  logLine("[ELECTRON]", `Boot iniciado. app.isPackaged=${app.isPackaged}`);

  if (DEV_FORCE_BACKEND_RESTART) {
    await stopExistingBackendOnPortInDev();
  }

  if (app.isPackaged && await checkServerHealth()) {
    const stopped = await stopExternalBackendOnPortInPackaged();
    if (!stopped) {
      dialog.showErrorBox(
        "No se pudo preparar el servidor",
        [
          `La app instalada detecto otro backend activo en ${SERVER_URL}${HEALTH_PATH}.`,
          "No se pudo detener ese proceso para iniciar el backend seguro con la clave local de configuracion.",
          `Puerto: ${SERVER_PORT}`,
          `Log: ${getLogFilePath()}`,
          "Cierre procesos node/backend abiertos y vuelva a abrir ClinicaElectron."
        ].join("\n")
      );
      app.exit(1);
      return;
    }
  }

  const isAlreadyRunning = await checkServerHealth();
  if (!isAlreadyRunning) {
    startBackendWithNpm();
  } else if (app.isPackaged) {
    logLine("[ELECTRON]", `Puerto ${SERVER_PORT} sigue ocupado en modo empaquetado; se aborta arranque seguro.`);
    dialog.showErrorBox(
      "No se pudo preparar el servidor",
      [
        `El puerto ${SERVER_PORT} sigue respondiendo antes de iniciar el backend seguro.`,
        "Cierre procesos node/backend abiertos y vuelva a abrir ClinicaElectron.",
        `Log: ${getLogFilePath()}`
      ].join("\n")
    );
    app.exit(1);
    return;
  } else {
    logLine("[ELECTRON]", "Backend ya estaba saludable en /health (reuso habilitado solo en desarrollo).");
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
  await installDevNoCachePolicies();
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

  app.whenReady().then(bootApp).catch((err) => {
    const message = err?.message || String(err || "Error desconocido");
    logLine("[ELECTRON:FATAL]", `No se pudo iniciar la app: ${message}`);
    dialog.showErrorBox(
      "No se pudo iniciar la aplicacion",
      [
        "No se pudo preparar la configuracion local protegida.",
        message,
        `Log: ${getLogFilePath()}`
      ].join("\n")
    );
    app.exit(1);
  });
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
