const multer = require("multer");
const path = require("path");
const { imgDocsDir } = require("../config/storagePaths");

const MIME_EXTENSION = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg"
};

function resolveSelloExtension(file) {
  const mime = String(file?.mimetype || "").trim().toLowerCase();
  if (MIME_EXTENSION[mime]) return MIME_EXTENSION[mime];

  const fromName = path.extname(String(file?.originalname || "")).toLowerCase();
  if (fromName === ".png") return ".png";
  if (fromName === ".jpg" || fromName === ".jpeg") return ".jpg";
  return ".png";
}

function resolveSafeDoctorId(rawId) {
  const id = String(rawId || "").replace(/\D+/g, "");
  return id || "tmp";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imgDocsDir);
  },
  filename: (req, file, cb) => {
    const ext = resolveSelloExtension(file);
    const doctorId = resolveSafeDoctorId(req.params?.id);
    cb(null, `sello_${doctorId}${ext}`);
  }
});

const uploadSello = multer({
  storage,
  limits: {
    fileSize: 4 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file?.mimetype || "").trim().toLowerCase();
    const ok = ["image/png", "image/jpeg", "image/jpg"].includes(mime);
    cb(ok ? null : new Error("Formato de sello invalido. Use PNG o JPG."), ok);
  }
});

module.exports = uploadSello;
