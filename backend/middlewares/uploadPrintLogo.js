const fs = require("fs");
const multer = require("multer");
const { imgDocsDir } = require("../config/storagePaths");

const PRINT_LOGO_BASENAME = "print_logo";
const PRINT_LOGO_DIR = imgDocsDir;
const MIME_EXTENSION = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg"
};

function resolveLogoExtension(file) {
  const mime = String(file?.mimetype || "").trim().toLowerCase();
  if (MIME_EXTENSION[mime]) return MIME_EXTENSION[mime];

  const fromName = path.extname(String(file?.originalname || "")).toLowerCase();
  if (fromName === ".png") return ".png";
  if (fromName === ".jpg" || fromName === ".jpeg") return ".jpg";
  return ".png";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      fs.mkdirSync(PRINT_LOGO_DIR, { recursive: true });
      cb(null, PRINT_LOGO_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = resolveLogoExtension(file);
    cb(null, `${PRINT_LOGO_BASENAME}${ext}`);
  }
});

const uploadPrintLogo = multer({
  storage,
  limits: {
    fileSize: 4 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file?.mimetype || "").trim().toLowerCase();
    const ok = ["image/png", "image/jpeg", "image/jpg"].includes(mime);
    cb(ok ? null : new Error("Formato de logo invalido. Use PNG o JPG."), ok);
  }
});

module.exports = uploadPrintLogo;
