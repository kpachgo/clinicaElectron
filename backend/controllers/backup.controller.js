const bcrypt = require("bcrypt");
const fs = require("fs");

const authService = require("../services/auth.service");
const backupService = require("../services/backup.service");
const { badRequest, serverError } = require("../utils/http");

function normalizePassword(value) {
  return String(value || "");
}

async function validarPasswordActual(req, res) {
  const idUsuario = Number(req.user?.idUsuario || 0);
  const passwordActual = normalizePassword(req.body?.passwordActual);

  if (!idUsuario) {
    res.status(403).json({
      ok: false,
      message: "Usuario no autorizado"
    });
    return null;
  }

  if (!passwordActual) {
    badRequest(res, "Ingrese la contrasena del administrador");
    return null;
  }

  const passwordHashActual = await authService.obtenerPasswordHashPorIdUsuario(idUsuario);
  if (!passwordHashActual) {
    res.status(404).json({
      ok: false,
      message: "Usuario no encontrado"
    });
    return null;
  }

  const passwordOk = await bcrypt.compare(passwordActual, passwordHashActual);
  if (!passwordOk) {
    res.status(401).json({
      ok: false,
      message: "Contrasena de administrador incorrecta"
    });
    return null;
  }

  return passwordActual;
}

function handleBackupError(res, err, fallbackMessage) {
  const code = String(err?.code || "");

  if (code === "MYSQL_TOOL_MISSING") {
    return res.status(503).json({
      ok: false,
      message: err.message || "No se encontro mysqldump o mysql"
    });
  }

  if (code === "LICENSE_NOT_AVAILABLE") {
    return res.status(403).json({
      ok: false,
      message: err.message || "La licencia activa es requerida para copias de seguridad"
    });
  }

  if (code === "LICENSE_MISMATCH") {
    return res.status(403).json({
      ok: false,
      message: err.message || "Esta copia pertenece a otra licencia"
    });
  }

  if (code === "MYSQL_TOOL_FAILED" || code === "MYSQL_TOOL_TIMEOUT" || code === "DB_CONFIG_INVALID") {
    return res.status(500).json({
      ok: false,
      message: err.message || fallbackMessage
    });
  }

  if (code === "BACKUP_FORMAT_INVALID") {
    return res.status(400).json({
      ok: false,
      message: err.message || "La copia de seguridad esta danada o fue modificada"
    });
  }

  if (code === "BACKUP_DECRYPT_FAILED") {
    return res.status(400).json({
      ok: false,
      message: "No se pudo descifrar la copia. Verifique contrasena, licencia y archivo."
    });
  }

  return serverError(res, err, fallbackMessage);
}

async function status(_req, res) {
  try {
    const data = await backupService.getStatus();
    return res.json({
      ok: true,
      data
    });
  } catch (err) {
    return handleBackupError(res, err, "Error consultando estado de backups");
  }
}

async function crear(req, res) {
  let backupResult = null;

  try {
    const passwordActual = await validarPasswordActual(req, res);
    if (!passwordActual) return null;

    backupResult = await backupService.crearBackup({ passwordActual });

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${backupResult.fileName}"`);
    res.setHeader("X-Backup-Filename", backupResult.fileName);

    const stream = fs.createReadStream(backupResult.filePath);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        handleBackupError(res, err, "No se pudo enviar la copia de seguridad");
      } else {
        res.destroy(err);
      }
    });

    res.on("finish", () => {
      backupService.safeUnlink(backupResult.filePath);
    });
    res.on("close", () => {
      backupService.safeUnlink(backupResult.filePath);
    });

    stream.pipe(res);
    return null;
  } catch (err) {
    if (backupResult?.filePath) {
      await backupService.safeUnlink(backupResult.filePath);
    }
    return handleBackupError(res, err, "Error al crear copia de seguridad");
  }
}

async function restaurar(req, res) {
  const uploadedPath = req.file?.path || "";

  try {
    if (!uploadedPath) {
      return badRequest(res, "Seleccione un archivo .clinicbackup");
    }

    const confirmacion = String(req.body?.confirmacion || "").trim().toUpperCase();
    if (confirmacion !== "RESTAURAR") {
      return badRequest(res, "Debe escribir RESTAURAR para confirmar");
    }

    const passwordActual = await validarPasswordActual(req, res);
    if (!passwordActual) return null;

    await backupService.restaurarBackup({
      backupPath: uploadedPath,
      passwordActual
    });

    return res.json({
      ok: true,
      message: "Copia restaurada correctamente"
    });
  } catch (err) {
    return handleBackupError(res, err, "Error al restaurar copia de seguridad");
  } finally {
    if (uploadedPath) {
      await backupService.safeUnlink(uploadedPath);
    }
  }
}

module.exports = {
  crear,
  restaurar,
  status
};
