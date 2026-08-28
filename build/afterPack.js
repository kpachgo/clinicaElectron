"use strict";

// Recompila los modulos nativos del backend (better-sqlite3) para el ABI del
// Node embebido de Electron. El backend se copia crudo via extraResources, asi
// que electron-builder no lo toca; sin este paso, el binario .node queda
// compilado para el Node del sistema del equipo de build y falla al cargar en
// el equipo destino (o en el Node de Electron). Operamos sobre la copia ya
// empaquetada, no sobre backend/node_modules del repo (que sigue sirviendo para
// desarrollo con el Node del sistema).

const path = require("path");
const fs = require("fs");

const NATIVE_MODULES = ["better-sqlite3"];

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const { Arch } = require("electron-builder");
  const archName = Arch[context.arch] || "x64";
  let electronVersion;
  try {
    electronVersion = require("electron/package.json").version;
  } catch {
    electronVersion = String(
      (packager.info.metadata.devDependencies || {}).electron || ""
    ).replace(/^[^\d]*/, "");
  }

  const resourcesDir =
    electronPlatformName === "darwin"
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");

  const backendDir = path.join(resourcesDir, "runtime", "backend");
  if (!fs.existsSync(path.join(backendDir, "node_modules"))) {
    console.log(`[afterPack] No hay node_modules en ${backendDir}; se omite rebuild nativo.`);
    return;
  }

  // @electron/rebuild se resuelve desde node_modules del proyecto (devDependency).
  const { rebuild } = require("@electron/rebuild");

  console.log(
    `[afterPack] Recompilando [${NATIVE_MODULES.join(", ")}] para Electron ${electronVersion} (${archName}) en ${backendDir}`
  );

  await rebuild({
    buildPath: backendDir,
    electronVersion,
    arch: archName,
    onlyModules: NATIVE_MODULES,
    force: true
  });

  console.log("[afterPack] Rebuild nativo del backend completado.");
};
