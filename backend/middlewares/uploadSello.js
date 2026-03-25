const multer = require("multer");
const { imgDocsDir } = require("../config/storagePaths");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imgDocsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `sello_${req.params.id}${ext}`);
  }
});

const uploadSello = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/jpg"].includes(file.mimetype);
    cb(ok ? null : new Error("Formato inválido"), ok);
  }
});

module.exports = uploadSello;
