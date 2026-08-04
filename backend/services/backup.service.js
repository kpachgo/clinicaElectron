const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const storagePaths = require("../config/storagePaths");
const dbConnectionConfig = require("./dbConnectionConfig.service");
const licenciaService = require("./licencia.service");

const BACKUP_MAGIC = Buffer.from("CLINICBACKUP\n", "ascii");
const BACKUP_VERSION_LEGACY = 1;
const BACKUP_VERSION = 2;
const BACKUP_PLAINTEXT_MAGIC = Buffer.from("CLINICSQLV2\n", "ascii");
const LICENSE_TABLES_EXCLUDED = ["licencias", "licencia_sesiones"];
const KDF_ID_SCRYPT = 1;
const KDF_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
  keyLength: 32
};
const CIPHER_NAME = "aes-256-gcm";
const SALT_BYTES = 24;
const IV_BYTES = 12;
function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore invalid paths.
    }
  }
  return null;
}

function resolveMysqlTool(envName, defaultCommand, fileName) {
  const envPath = String(process.env[envName] || "").trim();
  if (envPath) return envPath;

  const candidates = [];

  if (process.platform === "win32") {
    const roots = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files",
      "C:\\Program Files (x86)"
    ];
    const versions = ["8.4", "8.3", "8.2", "8.1", "8.0", "5.7"];

    roots.forEach((root) => {
      versions.forEach((version) => {
        candidates.push(path.join(root || "", "MySQL", `MySQL Server ${version}`, "bin", fileName));
      });
      candidates.push(path.join(root || "", "MySQL", "MySQL Workbench 8.0 CE", fileName));
      candidates.push(path.join(root || "", "MySQL", "MySQL Workbench 8.0", fileName));
    });
  } else {
    candidates.push(
      path.join("/usr/bin", defaultCommand),
      path.join("/usr/local/bin", defaultCommand),
      path.join("/bin", defaultCommand),
      path.join("/snap/bin", defaultCommand),
      path.join("/opt/homebrew/bin", defaultCommand),
      path.join("/opt/local/bin", defaultCommand),
      path.join("/usr/local/mysql/bin", defaultCommand),
      path.join("/usr/mysql/bin", defaultCommand)
    );
  }

  return firstExistingPath(candidates) || defaultCommand;
}

function getMysqlDumpBin() {
  return resolveMysqlTool("CLINICA_MYSQLDUMP_PATH", "mysqldump", "mysqldump.exe");
}

function getMysqlBin() {
  return resolveMysqlTool("CLINICA_MYSQL_CLI_PATH", "mysql", "mysql.exe");
}

function buildCodedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function safeUnlink(filePath) {
  if (!filePath) return Promise.resolve();
  return fsp.unlink(filePath).catch(() => {});
}

function formatStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function makeTempPath(prefix, ext) {
  const safePrefix = String(prefix || "backup").replace(/[^a-z0-9_-]/gi, "_");
  const stamp = `${Date.now()}-${process.pid}-${crypto.randomBytes(5).toString("hex")}`;
  return path.join(storagePaths.tempDir, `${safePrefix}-${stamp}.${ext}`);
}

function getActiveConnection() {
  const active = dbConnectionConfig.getActiveConfig();
  const connection = active?.connection || {};
  if (!connection.host || !connection.user || !connection.database) {
    throw buildCodedError("DB_CONFIG_INVALID", "Configuracion de base de datos incompleta");
  }
  return connection;
}

function normalizeLicenseCode(value) {
  return String(value || "").trim().toLowerCase();
}

function getLicenseFingerprint(licenseCode) {
  const normalized = normalizeLicenseCode(licenseCode);
  return crypto
    .createHash("sha256")
    .update(`clinica-license:${normalized}`)
    .digest("hex");
}

function getLicenseSecret(licenseCode) {
  const normalized = normalizeLicenseCode(licenseCode);
  return crypto
    .createHash("sha256")
    .update(`clinica-backup-v2-secret:${normalized}`)
    .digest();
}

function getActiveLicenseContext() {
  const status = licenciaService.getRuntimeStatus();
  const startupOk = status?.startup?.ok === true;
  const usageOk = status?.usage?.ok === true;
  const codigoLicencia = String(status?.codigoLicencia || "").trim();

  if (!startupOk || !usageOk || !codigoLicencia) {
    throw buildCodedError(
      "LICENSE_NOT_AVAILABLE",
      "La licencia activa es requerida para crear o restaurar copias de seguridad"
    );
  }

  return {
    fingerprint: getLicenseFingerprint(codigoLicencia),
    secret: getLicenseSecret(codigoLicencia)
  };
}

function isRailwayHost(host) {
  return /(?:^|[.])rlwy[.]net$/i.test(String(host || ""));
}

function buildMysqlEnv(connection) {
  return {
    ...process.env,
    MYSQL_PWD: String(connection.password || "")
  };
}

function buildMysqlCommonArgs(connection) {
  const args = [
    `--host=${connection.host}`,
    `--port=${Number(connection.port || 3306)}`,
    `--user=${connection.user}`,
    "--protocol=TCP",
    "--default-character-set=utf8mb4"
  ];

  if (connection.ssl || isRailwayHost(connection.host)) {
    args.push("--ssl-mode=REQUIRED");
  }

  return args;
}

function runProcess(command, args, options = {}) {
  const {
    env = process.env,
    stdoutPath = null,
    stdinPath = null,
    timeoutMs = 0
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
      stdio: [
        stdinPath ? "pipe" : "ignore",
        stdoutPath ? "pipe" : "pipe",
        "pipe"
      ]
    });

    let stderr = "";
    let stdout = "";
    let settled = false;
    let timer = null;
    const streams = [];

    function finish(err, result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    }

    child.on("error", (err) => {
      const code = err?.code === "ENOENT" ? "MYSQL_TOOL_MISSING" : "MYSQL_TOOL_ERROR";
      finish(buildCodedError(code, `No se pudo ejecutar ${command}`));
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    if (stdoutPath) {
      const out = fs.createWriteStream(stdoutPath);
      streams.push(pipeline(child.stdout, out));
    } else {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
    }

    if (stdinPath) {
      const input = fs.createReadStream(stdinPath);
      streams.push(pipeline(input, child.stdin));
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          // noop
        }
        finish(buildCodedError("MYSQL_TOOL_TIMEOUT", `Tiempo agotado ejecutando ${command}`));
      }, timeoutMs);
    }

    child.on("close", async (code) => {
      try {
        await Promise.all(streams);
      } catch (streamErr) {
        finish(streamErr);
        return;
      }

      if (code !== 0) {
        const message = stderr.trim() || `Proceso ${command} finalizo con codigo ${code}`;
        finish(buildCodedError("MYSQL_TOOL_FAILED", message));
        return;
      }

      finish(null, { stdout, stderr });
    });
  });
}

async function testTool(command) {
  try {
    const result = await runProcess(command, ["--version"], { timeoutMs: 8000 });
    return {
      ok: true,
      command,
      version: String(result.stdout || result.stderr || "").trim()
    };
  } catch (err) {
    return {
      ok: false,
      command,
      message: err?.message || `No se encontro ${command}`
    };
  }
}

async function getStatus() {
  const [dump, mysql] = await Promise.all([
    testTool(getMysqlDumpBin()),
    testTool(getMysqlBin())
  ]);

  let connection = null;
  let connectionError = null;
  try {
    const active = dbConnectionConfig.getActiveConfig();
    const activeConnection = active?.connection || {};
    connection = {
      source: active?.source || "",
      host: activeConnection.host || "",
      port: activeConnection.port || 3306,
      database: activeConnection.database || "",
      ssl: Boolean(activeConnection.ssl || isRailwayHost(activeConnection.host))
    };
  } catch (err) {
    connectionError = err?.message || "No se pudo leer la conexion activa";
  }

  return {
    mysqldump: dump,
    mysql,
    ready: dump.ok && mysql.ok,
    connection,
    connectionError
  };
}

async function ensureToolsAvailable() {
  const status = await getStatus();
  if (!status.ready) {
    throw buildCodedError(
      "MYSQL_TOOL_MISSING",
      "No se encontro mysqldump o mysql. Instale MySQL Client o agreguelo al PATH."
    );
  }
  return status;
}

function stripMysqlDefiners(sql) {
  return String(sql || "")
    .replace(/\/\*![0-9]{5}\s+DEFINER=`[^`]+`@`[^`]+`\s*\*\//gi, "")
    .replace(/\bDEFINER=`[^`]+`@`[^`]+`\s*/gi, "");
}

async function sanitizeMysqlDump(sqlPath) {
  const sanitizedPath = makeTempPath("backup-sanitized", "sql");
  const carryLength = 4096;
  let carry = "";

  const transform = new Transform({
    decodeStrings: false,
    transform(chunk, _encoding, callback) {
      try {
        const input = carry + String(chunk);
        const splitAt = Math.max(0, input.length - carryLength);
        const ready = input.slice(0, splitAt);
        carry = input.slice(splitAt);
        this.push(stripMysqlDefiners(ready));
        callback();
      } catch (err) {
        callback(err);
      }
    },
    flush(callback) {
      try {
        this.push(stripMysqlDefiners(carry));
        callback();
      } catch (err) {
        callback(err);
      }
    }
  });

  try {
    await pipeline(
      fs.createReadStream(sqlPath, { encoding: "utf8" }),
      transform,
      fs.createWriteStream(sanitizedPath, { encoding: "utf8" })
    );
    await fsp.rename(sanitizedPath, sqlPath);
  } catch (err) {
    await safeUnlink(sanitizedPath);
    throw err;
  }
}

function deriveKey(password, salt, licenseSecret = null, kdfOptions = KDF_OPTIONS) {
  const passwordBuffer = Buffer.from(String(password || ""), "utf8");
  const keyInput = licenseSecret
    ? Buffer.concat([passwordBuffer, Buffer.from([0]), licenseSecret])
    : passwordBuffer;

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      keyInput,
      salt,
      kdfOptions.keyLength,
      {
        N: kdfOptions.N,
        r: kdfOptions.r,
        p: kdfOptions.p,
        maxmem: kdfOptions.maxmem || KDF_OPTIONS.maxmem
      },
      (err, key) => {
        if (err) {
          reject(err);
        } else {
          resolve(key);
        }
      }
    );
  });
}

async function dumpDatabase(sqlPath) {
  const connection = getActiveConnection();
  const args = [
    ...buildMysqlCommonArgs(connection),
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--hex-blob",
    "--add-drop-table",
    "--no-tablespaces",
    "--set-gtid-purged=OFF"
  ];

  LICENSE_TABLES_EXCLUDED.forEach((tableName) => {
    args.push(`--ignore-table=${connection.database}.${tableName}`);
  });

  args.push(connection.database);

  await runProcess(getMysqlDumpBin(), args, {
    env: buildMysqlEnv(connection),
    stdoutPath: sqlPath,
    timeoutMs: 10 * 60 * 1000
  });
  await sanitizeMysqlDump(sqlPath);
}

async function restoreDatabase(sqlPath) {
  const connection = getActiveConnection();
  const args = [
    ...buildMysqlCommonArgs(connection),
    connection.database
  ];

  await runProcess(getMysqlBin(), args, {
    env: buildMysqlEnv(connection),
    stdinPath: sqlPath,
    timeoutMs: 10 * 60 * 1000
  });
}

async function buildEncryptedPayload({ sqlPath, payloadPath, licenseContext }) {
  const metadata = {
    version: BACKUP_VERSION,
    app: "clinicaElectron",
    createdAt: new Date().toISOString(),
    licenseFingerprint: licenseContext.fingerprint,
    excludedTables: LICENSE_TABLES_EXCLUDED
  };
  const metadataBuffer = Buffer.from(JSON.stringify(metadata), "utf8");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(metadataBuffer.length, 0);

  await fsp.writeFile(
    payloadPath,
    Buffer.concat([BACKUP_PLAINTEXT_MAGIC, lengthBuffer, metadataBuffer])
  );
  await pipeline(
    fs.createReadStream(sqlPath),
    fs.createWriteStream(payloadPath, { flags: "a" })
  );
}

function buildV2Header({ salt, iv, tag }) {
  const fixed = Buffer.alloc(1 + 1 + 4 + 4 + 4 + 4 + 1 + 1 + 1);
  let offset = 0;
  fixed.writeUInt8(BACKUP_VERSION, offset);
  offset += 1;
  fixed.writeUInt8(KDF_ID_SCRYPT, offset);
  offset += 1;
  fixed.writeUInt32BE(KDF_OPTIONS.N, offset);
  offset += 4;
  fixed.writeUInt32BE(KDF_OPTIONS.r, offset);
  offset += 4;
  fixed.writeUInt32BE(KDF_OPTIONS.p, offset);
  offset += 4;
  fixed.writeUInt32BE(KDF_OPTIONS.keyLength, offset);
  offset += 4;
  fixed.writeUInt8(salt.length, offset);
  offset += 1;
  fixed.writeUInt8(iv.length, offset);
  offset += 1;
  fixed.writeUInt8(tag.length, offset);

  return Buffer.concat([BACKUP_MAGIC, fixed, salt, iv, tag]);
}

async function encryptSqlFile({ sqlPath, outputPath, passwordActual, licenseContext }) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = await deriveKey(passwordActual, salt, licenseContext.secret);
  const cipher = crypto.createCipheriv(CIPHER_NAME, key, iv);
  const payloadPath = makeTempPath("backup-payload", "bin");
  const ciphertextPath = makeTempPath("backup-ciphertext", "bin");

  try {
    await buildEncryptedPayload({ sqlPath, payloadPath, licenseContext });
    await pipeline(
      fs.createReadStream(payloadPath),
      cipher,
      fs.createWriteStream(ciphertextPath)
    );

    const tag = cipher.getAuthTag();
    await fsp.writeFile(outputPath, buildV2Header({ salt, iv, tag }));
    await pipeline(
      fs.createReadStream(ciphertextPath),
      fs.createWriteStream(outputPath, { flags: "a" })
    );
  } finally {
    await safeUnlink(payloadPath);
    await safeUnlink(ciphertextPath);
  }
}

async function readBackupFile(filePath) {
  const handle = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(BACKUP_MAGIC.length + 4);
    const headerRead = await handle.read(header, 0, header.length, 0);
    if (headerRead.bytesRead !== header.length || !header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    const versionByte = header.readUInt8(BACKUP_MAGIC.length);
    if (versionByte === BACKUP_VERSION) {
      const fixedHeaderLength = 1 + 1 + 4 + 4 + 4 + 4 + 1 + 1 + 1;
      const fixedHeader = Buffer.alloc(fixedHeaderLength);
      const fixedRead = await handle.read(fixedHeader, 0, fixedHeaderLength, BACKUP_MAGIC.length);
      if (fixedRead.bytesRead !== fixedHeaderLength) {
        throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
      }

      let offset = 0;
      const version = fixedHeader.readUInt8(offset);
      offset += 1;
      const kdfId = fixedHeader.readUInt8(offset);
      offset += 1;
      const N = fixedHeader.readUInt32BE(offset);
      offset += 4;
      const r = fixedHeader.readUInt32BE(offset);
      offset += 4;
      const p = fixedHeader.readUInt32BE(offset);
      offset += 4;
      const keyLength = fixedHeader.readUInt32BE(offset);
      offset += 4;
      const saltLength = fixedHeader.readUInt8(offset);
      offset += 1;
      const ivLength = fixedHeader.readUInt8(offset);
      offset += 1;
      const tagLength = fixedHeader.readUInt8(offset);

      if (version !== BACKUP_VERSION || kdfId !== KDF_ID_SCRYPT || saltLength < 16 || ivLength !== IV_BYTES || tagLength !== 16) {
        throw buildCodedError("BACKUP_FORMAT_INVALID", "Formato de copia de seguridad no compatible");
      }

      const variableLength = saltLength + ivLength + tagLength;
      const variableHeader = Buffer.alloc(variableLength);
      const variableOffset = BACKUP_MAGIC.length + fixedHeaderLength;
      const variableRead = await handle.read(variableHeader, 0, variableLength, variableOffset);
      if (variableRead.bytesRead !== variableLength) {
        throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
      }

      return {
        version,
        kdf: {
          name: "scrypt",
          N,
          r,
          p,
          keyLength,
          maxmem: Math.max(KDF_OPTIONS.maxmem, 128 * 1024 * 1024)
        },
        salt: variableHeader.subarray(0, saltLength),
        iv: variableHeader.subarray(saltLength, saltLength + ivLength),
        tag: variableHeader.subarray(saltLength + ivLength),
        dataOffset: variableOffset + variableLength
      };
    }

    const metadataLength = header.readUInt32BE(BACKUP_MAGIC.length);
    if (metadataLength <= 0 || metadataLength > 64 * 1024) {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    const metadataBuffer = Buffer.alloc(metadataLength);
    const metadataOffset = BACKUP_MAGIC.length + 4;
    const metadataRead = await handle.read(metadataBuffer, 0, metadataLength, metadataOffset);
    if (metadataRead.bytesRead !== metadataLength) {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    let metadata = null;
    try {
      metadata = JSON.parse(metadataBuffer.toString("utf8"));
    } catch {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    if (metadata?.version !== BACKUP_VERSION_LEGACY || metadata?.cipher?.name !== CIPHER_NAME || metadata?.kdf?.name !== "scrypt") {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "Formato de copia de seguridad no compatible");
    }

    return {
      version: BACKUP_VERSION_LEGACY,
      metadata,
      dataOffset: metadataOffset + metadataLength
    };
  } finally {
    await handle.close().catch(() => {});
  }
}

async function parseV2Payload({ payloadPath, outputSqlPath, licenseContext }) {
  const handle = await fsp.open(payloadPath, "r");
  try {
    const header = Buffer.alloc(BACKUP_PLAINTEXT_MAGIC.length + 4);
    const headerRead = await handle.read(header, 0, header.length, 0);
    if (headerRead.bytesRead !== header.length || !header.subarray(0, BACKUP_PLAINTEXT_MAGIC.length).equals(BACKUP_PLAINTEXT_MAGIC)) {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    const metadataLength = header.readUInt32BE(BACKUP_PLAINTEXT_MAGIC.length);
    if (metadataLength <= 0 || metadataLength > 64 * 1024) {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    const metadataBuffer = Buffer.alloc(metadataLength);
    const metadataOffset = BACKUP_PLAINTEXT_MAGIC.length + 4;
    const metadataRead = await handle.read(metadataBuffer, 0, metadataLength, metadataOffset);
    if (metadataRead.bytesRead !== metadataLength) {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    let metadata = null;
    try {
      metadata = JSON.parse(metadataBuffer.toString("utf8"));
    } catch {
      throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
    }

    if (metadata?.licenseFingerprint !== licenseContext.fingerprint) {
      throw buildCodedError(
        "LICENSE_MISMATCH",
        "Esta copia pertenece a otra licencia. No se puede restaurar en esta instalacion."
      );
    }

    await pipeline(
      fs.createReadStream(payloadPath, { start: metadataOffset + metadataLength }),
      fs.createWriteStream(outputSqlPath)
    );
  } finally {
    await handle.close().catch(() => {});
  }
}

async function decryptBackupFile({ backupPath, outputSqlPath, passwordActual, licenseContext }) {
  const backupInfo = await readBackupFile(backupPath);
  const { metadata, dataOffset, version } = backupInfo;

  if (version === BACKUP_VERSION) {
    const payloadPath = makeTempPath("restore-payload", "bin");
    try {
      const key = await deriveKey(passwordActual, backupInfo.salt, licenseContext.secret, backupInfo.kdf);
      const decipher = crypto.createDecipheriv(CIPHER_NAME, key, backupInfo.iv);
      decipher.setAuthTag(backupInfo.tag);

      await pipeline(
        fs.createReadStream(backupPath, { start: dataOffset }),
        decipher,
        fs.createWriteStream(payloadPath)
      );

      await parseV2Payload({ payloadPath, outputSqlPath, licenseContext });
      return;
    } catch (err) {
      await safeUnlink(outputSqlPath);
      if (err?.code === "LICENSE_MISMATCH" || err?.code === "BACKUP_FORMAT_INVALID") {
        throw err;
      }
      throw buildCodedError(
        "BACKUP_DECRYPT_FAILED",
        "No se pudo descifrar la copia de seguridad"
      );
    } finally {
      await safeUnlink(payloadPath);
    }
  }

  const salt = Buffer.from(String(metadata.kdf.salt || ""), "base64");
  const iv = Buffer.from(String(metadata.cipher.iv || ""), "base64");
  const tag = Buffer.from(String(metadata.cipher.tag || ""), "base64");

  if (salt.length < 16 || iv.length !== IV_BYTES || tag.length !== 16) {
    throw buildCodedError("BACKUP_FORMAT_INVALID", "La copia de seguridad esta danada o fue modificada");
  }

  try {
    const key = await deriveKey(passwordActual, salt, null, {
      N: Number(metadata.kdf.N || 16384),
      r: Number(metadata.kdf.r || 8),
      p: Number(metadata.kdf.p || 1),
      keyLength: Number(metadata.kdf.keyLength || 32),
      maxmem: KDF_OPTIONS.maxmem
    });
    const decipher = crypto.createDecipheriv(CIPHER_NAME, key, iv);
    decipher.setAuthTag(tag);

    await pipeline(
      fs.createReadStream(backupPath, {
        start: dataOffset
      }),
      decipher,
      fs.createWriteStream(outputSqlPath)
    );
  } catch (err) {
    await safeUnlink(outputSqlPath);
    throw buildCodedError(
      err?.code === "BACKUP_FORMAT_INVALID" ? err.code : "BACKUP_DECRYPT_FAILED",
      "No se pudo descifrar la copia de seguridad"
    );
  }
}

async function crearBackup({ passwordActual }) {
  await ensureToolsAvailable();
  storagePaths.ensureDataDirsSync();
  const licenseContext = getActiveLicenseContext();

  const stamp = formatStamp();
  const fileName = `backup_${stamp}.clinicbackup`;
  const sqlPath = makeTempPath("backup-temporal", "sql");
  const encryptedPath = makeTempPath("backup-cifrado", "clinicbackup");

  try {
    await dumpDatabase(sqlPath);
    await encryptSqlFile({ sqlPath, outputPath: encryptedPath, passwordActual, licenseContext });
    return {
      fileName,
      filePath: encryptedPath
    };
  } finally {
    await safeUnlink(sqlPath);
  }
}

async function restaurarBackup({ backupPath, passwordActual }) {
  await ensureToolsAvailable();
  storagePaths.ensureDataDirsSync();
  const licenseContext = getActiveLicenseContext();

  const sqlPath = makeTempPath("restore-temporal", "sql");
  try {
    await decryptBackupFile({ backupPath, outputSqlPath: sqlPath, passwordActual, licenseContext });
    await restoreDatabase(sqlPath);
    return { ok: true };
  } finally {
    await safeUnlink(sqlPath);
  }
}

module.exports = {
  crearBackup,
  getStatus,
  restaurarBackup,
  safeUnlink
};
