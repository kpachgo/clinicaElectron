const fs = require("fs");
const os = require("os");
const path = require("path");

const APP_DATA_DIR_NAME = "ClinicaElectron";
const legacyFrontendDir = path.join(__dirname, "../../frontend");

function normalizeEnvPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.isAbsolute(raw) ? raw : path.resolve(raw);
}

function resolveDataRoot() {
  const envOverride = normalizeEnvPath(process.env.CLINICA_DATA_DIR);
  if (envOverride) return envOverride;

  if (process.platform === "win32") {
    const programData = normalizeEnvPath(process.env.ProgramData || "C:\\ProgramData");
    return path.join(programData, APP_DATA_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return path.join("/Users/Shared", APP_DATA_DIR_NAME);
  }

  return path.join(os.homedir(), `.${APP_DATA_DIR_NAME}`);
}

const dataRootDir = resolveDataRoot();
const fotosDir = path.join(dataRootDir, "fotos");
const firmasDir = path.join(dataRootDir, "firmas");
const imgDocsDir = path.join(dataRootDir, "img-docs");

function ensureDataDirsSync() {
  for (const dir of [dataRootDir, fotosDir, firmasDir, imgDocsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

module.exports = {
  dataRootDir,
  fotosDir,
  firmasDir,
  imgDocsDir,
  legacyFrontendDir,
  ensureDataDirsSync
};
