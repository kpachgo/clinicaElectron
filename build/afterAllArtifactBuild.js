"use strict";

// electron-builder deja la carpeta de staging sin empaquetar (win-unpacked,
// linux-unpacked, mac, mac-arm64) junto a los instaladores. Solo sirve de paso
// intermedio para armar el instalador; una vez generados los artefactos no
// aporta nada y confunde. La borramos al terminar.
//
// Para conservarla en algun build puntual: CLINICA_KEEP_UNPACKED=1

const fs = require("fs");
const path = require("path");

const UNPACKED_DIRS = [
  "win-unpacked",
  "win-ia32-unpacked",
  "win-arm64-unpacked",
  "linux-unpacked",
  "linux-arm64-unpacked",
  "mac",
  "mac-arm64",
  "mac-universal"
];

exports.default = async function afterAllArtifactBuild(buildResult) {
  if (process.env.CLINICA_KEEP_UNPACKED === "1") return;

  const outDir = buildResult.outDir;
  if (!outDir || !fs.existsSync(outDir)) return;

  for (const name of UNPACKED_DIRS) {
    const target = path.join(outDir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`[afterAllArtifactBuild] Borrada carpeta sin empaquetar: ${name}`);
    }
  }
};
