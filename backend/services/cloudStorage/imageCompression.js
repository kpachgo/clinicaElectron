// Compresion de fotos antes de guardarlas (disco o nube): ~300 KB sin perdida visible.
// sharp se carga de forma perezosa: si falta en el paquete, la foto se guarda original en vez de fallar la subida.
const MAX_SIDE_PX = 2560;
const JPEG_QUALITY = 82;

let sharpModule;
function loadSharp() {
  if (sharpModule === undefined) {
    try {
      sharpModule = require("sharp");
    } catch (err) {
      console.error("[Almacenamiento] sharp no disponible, se guardan fotos sin comprimir:", err.message);
      sharpModule = null;
    }
  }
  return sharpModule;
}

// Devuelve { buffer, ext, contentType, compressed }.
async function compressPhoto(buffer, { mimetype = "", originalExt = ".jpg" } = {}) {
  const original = { buffer, ext: originalExt, contentType: mimetype || "application/octet-stream", compressed: false };
  if (!String(mimetype).toLowerCase().startsWith("image/")) return original;

  const sharp = loadSharp();
  if (!sharp) return original;

  try {
    const output = await sharp(buffer, { failOn: "none" })
      .rotate() // aplica la orientacion EXIF antes de descartar metadatos
      .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG con transparencia -> fondo blanco en JPEG
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    // Un JPEG ya optimizado puede quedar mas grande; en ese caso se conserva el original.
    if (output.length >= buffer.length && [".jpg", ".jpeg"].includes(originalExt)) return original;

    return { buffer: output, ext: ".jpg", contentType: "image/jpeg", compressed: true };
  } catch (err) {
    console.error("[Almacenamiento] No se pudo comprimir la foto, se guarda original:", err.message);
    return original;
  }
}

module.exports = { compressPhoto };
