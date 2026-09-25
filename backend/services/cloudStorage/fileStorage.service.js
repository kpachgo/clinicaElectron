// Punto unico para guardar, servir y borrar archivos de usuario (fotos, firmas, sellos, docs).
// Mismas rutas en disco y en R2: /fotos/x.jpg <-> objeto "fotos/x.jpg". Asi cambiar de modo no rompe nada:
// el modo solo decide donde se escribe lo nuevo; la lectura busca en disco y, si falta, en R2.
const fs = require("fs");
const path = require("path");
const storagePaths = require("../../config/storagePaths");
const { writeBufferFile, deleteIfExists, resolveStorageCandidates } = require("../../utils/file");
const cloudConfig = require("./cloudStorageConfig.service");
const backupState = require("./cloudBackupState");

// followsMode=false: siempre en disco (docs PDF no estan en MySQL; se listan leyendo la carpeta).
// immutable: el nombre nunca se reutiliza (lleva timestamp), se puede cachear para siempre en el navegador.
const CATEGORIES = {
  fotos: {
    urlPrefix: "/fotos/",
    keyPrefix: "fotos",
    dir: storagePaths.fotosDir,
    legacyDir: path.join(storagePaths.legacyFrontendDir, "fotos"),
    followsMode: true,
    immutable: true
  },
  firmas: {
    urlPrefix: "/firmas/",
    keyPrefix: "firmas",
    dir: storagePaths.firmasDir,
    legacyDir: path.join(storagePaths.legacyFrontendDir, "firmas"),
    followsMode: true,
    immutable: true
  },
  // firma_<idDoctor>.png, sello_<idDoctor>.ext y print_logo.* se sobrescriben con el mismo nombre.
  imgDocs: {
    urlPrefix: "/img/docs/",
    keyPrefix: "img-docs",
    dir: storagePaths.imgDocsDir,
    legacyDir: path.join(storagePaths.legacyFrontendDir, "img", "docs"),
    followsMode: true,
    immutable: false
  },
  docs: {
    urlPrefix: "/docs/",
    keyPrefix: "docs",
    dir: storagePaths.docsDir,
    legacyDir: null,
    followsMode: false,
    immutable: false
  }
};

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf"
};

function contentTypeFor(name) {
  return CONTENT_TYPES[path.extname(String(name || "")).toLowerCase()] || "application/octet-stream";
}

function getCategory(categoryId) {
  const category = CATEGORIES[categoryId];
  if (!category) throw new Error(`Categoria de almacenamiento desconocida: ${categoryId}`);
  return category;
}

// Solo nombres planos: nada de subcarpetas ni "..".
function safeName(name) {
  const clean = path.basename(String(name || "").replace(/\\/g, "/"));
  if (!clean || clean === "." || clean === "..") return "";
  return clean;
}

function objectKey(categoryId, name) {
  return `${getCategory(categoryId).keyPrefix}/${safeName(name)}`;
}

// "/fotos/paciente_1.jpg?v=2" -> { categoryId: "fotos", name: "paciente_1.jpg" }
function parsePublicPath(publicPath) {
  const clean = String(publicPath || "").split("?")[0].replace(/\\/g, "/");
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  for (const [categoryId, category] of Object.entries(CATEGORIES)) {
    if (withSlash.startsWith(category.urlPrefix)) {
      let rest = withSlash.slice(category.urlPrefix.length);
      try {
        rest = decodeURIComponent(rest);
      } catch {
        // nombre sin codificar
      }
      const name = safeName(rest);
      if (name && name === rest) return { categoryId, name };
    }
  }
  return null;
}

function localCandidates(categoryId, name) {
  const category = getCategory(categoryId);
  const clean = safeName(name);
  if (!clean) return [];
  return [category.dir, category.legacyDir].filter(Boolean).map((dir) => path.join(dir, clean));
}

function findLocal(categoryId, name) {
  return localCandidates(categoryId, name).find((candidate) => fs.existsSync(candidate)) || null;
}

function writesToCloud(categoryId) {
  return getCategory(categoryId).followsMode && cloudConfig.getMode() === "nube";
}

async function saveFile(categoryId, name, buffer, contentType = contentTypeFor(name)) {
  const category = getCategory(categoryId);
  const clean = safeName(name);
  if (!clean) throw new Error("Nombre de archivo invalido");

  if (writesToCloud(categoryId)) {
    await cloudConfig.getClient().putObject(objectKey(categoryId, clean), buffer, contentType);
    return { location: "nube" };
  }

  await writeBufferFile(category.dir, clean, buffer);
  return { location: "local" };
}

// Borra en disco (incluida la ruta legacy) y en R2 si hay credenciales: no deja huerfanos en la nube.
async function deleteFile(categoryId, name) {
  const clean = safeName(name);
  if (!clean) return;

  for (const candidate of localCandidates(categoryId, clean)) {
    await deleteIfExists(candidate);
  }

  const client = cloudConfig.getClient();
  if (client) {
    const key = objectKey(categoryId, clean);
    await client.deleteObject(key);
    backupState.forget(key);
  }
}

async function deleteByPublicPath(publicPath) {
  const parsed = parsePublicPath(publicPath);
  if (!parsed) {
    // Rutas historicas con formato raro: solo existen en disco.
    for (const candidate of resolveStorageCandidates(publicPath)) {
      await deleteIfExists(candidate);
    }
    return;
  }
  await deleteFile(parsed.categoryId, parsed.name);
}

// Middleware que va DESPUES de express.static: si el archivo no esta en disco, lo pide a R2.
function cloudFallback(categoryId) {
  const category = getCategory(categoryId);
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    let requested = String(req.path || "").replace(/^\/+/, "");
    try {
      requested = decodeURIComponent(requested);
    } catch {
      return next();
    }
    const name = safeName(requested);
    if (!name || name !== requested) return next();

    const client = cloudConfig.getClient();
    if (!client) return next();

    try {
      const buffer = await client.getObjectOrNull(objectKey(categoryId, name));
      if (!buffer) return next();

      res.set("Content-Type", contentTypeFor(name));
      res.set(
        "Cache-Control",
        category.immutable ? "private, max-age=31536000, immutable" : "private, no-cache"
      );
      return res.send(buffer);
    } catch (err) {
      console.error(`[Almacenamiento] Error leyendo ${category.keyPrefix}/${name} desde R2:`, err.message);
      return res.status(502).send("No se pudo obtener el archivo desde la nube");
    }
  };
}

module.exports = {
  CATEGORIES,
  cloudFallback,
  contentTypeFor,
  deleteByPublicPath,
  deleteFile,
  findLocal,
  getCategory,
  objectKey,
  parsePublicPath,
  safeName,
  saveFile
};
