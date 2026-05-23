const multer = require("multer");

const uploadPrintDocPdf = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file?.mimetype || "").trim().toLowerCase();
    const originalName = String(file?.originalname || "").trim().toLowerCase();
    const isPdfMime = mime === "application/pdf";
    const isPdfExt = originalName.endsWith(".pdf");
    const ok = isPdfMime || isPdfExt;
    cb(ok ? null : new Error("Formato invalido. Solo se permiten archivos PDF."), ok);
  }
});

module.exports = uploadPrintDocPdf;
