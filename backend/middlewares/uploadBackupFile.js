const multer = require("multer");
const path = require("path");

const storagePaths = require("../config/storagePaths");

storagePaths.ensureDataDirsSync();

const uploadBackupFile = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, storagePaths.tempDir);
    },
    filename: (_req, file, cb) => {
      const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `restore-upload-${stamp}${path.extname(file.originalname || ".clinicbackup")}`);
    }
  }),
  limits: {
    fileSize: 512 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const originalName = String(file?.originalname || "").trim().toLowerCase();
    const isBackupExt = originalName.endsWith(".clinicbackup");
    cb(isBackupExt ? null : new Error("Formato invalido. Solo se permiten archivos .clinicbackup."), isBackupExt);
  }
});

module.exports = uploadBackupFile;
