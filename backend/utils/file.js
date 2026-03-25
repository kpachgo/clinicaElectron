const fs = require("fs/promises");
const path = require("path");
const storagePaths = require("../config/storagePaths");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function normalizeStorageUrlPath(relativeUrlPath) {
  const safePath = String(relativeUrlPath || "").replace(/^[/\\]+/, "");
  return safePath.replace(/\\/g, "/");
}

function resolveStorageCandidates(relativeUrlPath) {
  const safePath = normalizeStorageUrlPath(relativeUrlPath);

  if (safePath.startsWith("fotos/")) {
    const relative = safePath.slice("fotos/".length);
    return [
      path.join(storagePaths.fotosDir, relative),
      path.join(storagePaths.legacyFrontendDir, safePath)
    ];
  }

  if (safePath.startsWith("firmas/")) {
    const relative = safePath.slice("firmas/".length);
    return [
      path.join(storagePaths.firmasDir, relative),
      path.join(storagePaths.legacyFrontendDir, safePath)
    ];
  }

  if (safePath.startsWith("img/docs/")) {
    const relative = safePath.slice("img/docs/".length);
    return [
      path.join(storagePaths.imgDocsDir, relative),
      path.join(storagePaths.legacyFrontendDir, safePath)
    ];
  }

  return [path.join(storagePaths.legacyFrontendDir, safePath)];
}

function resolveFrontendPath(relativeUrlPath) {
  return resolveStorageCandidates(relativeUrlPath)[0];
}

function parsePngBase64(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

async function writeBufferFile(dirPath, fileName, buffer) {
  await ensureDir(dirPath);
  const filePath = path.join(dirPath, fileName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function deleteIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = {
  ensureDir,
  resolveFrontendPath,
  resolveStorageCandidates,
  parsePngBase64,
  writeBufferFile,
  deleteIfExists
};
