const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");
const authService = require("../services/auth.service");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { parsePngBase64 } = require("../utils/file");
const fileStorage = require("../services/cloudStorage/fileStorage.service");
const { legacyFrontendDir, imgDocsDir, docsDir } = require("../config/storagePaths");

const ESTADO_AUTORIZACION_PENDIENTE = "PENDIENTE";
const ESTADO_AUTORIZACION_OK = "AUTORIZADA";
const METODO_AUTORIZACION_FISICO = "FISICO_ESCANEADO";
const METODO_AUTORIZACION_AUTO_DOCTOR = "AUTO_DOCTOR";
const METODO_AUTORIZACION_VALIDACION = "VALIDACION_CREDENCIAL";
const METODO_AUTORIZACION_SIN_DOCTOR = "SIN_DOCTOR";
const DOCTOR_REGISTRO_FISICO = "registro fisico";
const MAX_PROCEDIMIENTO_CITA = 500;
const MONITOR_SEGMENT_VALUES = new Set(["all", "retrasado", "m2", "m3", "cancelados"]);
const MONITOR_ESTADO_VALUES = new Set(["all", "activo", "inactivo"]);
const MONITOR_TRATAMIENTO_VALUES = new Set(["all", "odontologia", "ortodoncia", "sin_registrar"]);
const MONITOR_PAGE_SIZE_VALUES = new Set([10, 25, 50]);
const MAX_COMENTARIO_SEGUIMIENTO = 500;
const MONITOR_PROXIMA_FILTRO_VALUES = new Set(["all", "con", "sin"]);
const PRINT_BRANDING_LOGO_BASENAME = "print_logo";
const PRINT_BRANDING_LOGO_DIR = imgDocsDir;
const PRINT_BRANDING_LOGO_LEGACY_DIR = path.join(legacyFrontendDir, "img", "docs");
const PRINT_DOC_BASENAME = "print_doc";

function isTransientDbError(err) {
  const code = String(err?.code || "").toUpperCase();
  if (!code) return false;
  return (
    code.includes("ETIMEDOUT") ||
    code.includes("ECONNRESET") ||
    code.includes("ECONNREFUSED") ||
    code.includes("PROTOCOL_CONNECTION_LOST")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMonitorCanceladosMatchSql(leftAlias, rightAlias) {
  const leftNameValue = `LOWER(TRIM(IFNULL(${leftAlias}.nombreAP, ''))) COLLATE utf8mb4_unicode_ci`;
  const rightNameValue = `LOWER(TRIM(IFNULL(${rightAlias}.NombreP, ''))) COLLATE utf8mb4_unicode_ci`;
  const leftName = `${leftNameValue} = ${rightNameValue}`;
  const leftPhone = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(${leftAlias}.contactoAP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') COLLATE utf8mb4_unicode_ci`;
  const rightPhone = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(IFNULL(${rightAlias}.telefonoP, ''))), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') COLLATE utf8mb4_unicode_ci`;
  return `(${leftName} AND ((${leftPhone} <> '' AND ${leftPhone} = ${rightPhone}) OR (${leftPhone} = '' AND (SELECT COUNT(*) FROM paciente p2 WHERE LOWER(TRIM(IFNULL(p2.NombreP, ''))) COLLATE utf8mb4_unicode_ci = ${rightNameValue}) = 1)))`;
}

function buildMonitorCanceladosSql({ fechaCorte, estado, tratamiento, q, mode, page, pageSize }) {
  const inicioMes = `${String(fechaCorte).slice(0, 7)}-01`;
  const matchAgendaPaciente = getMonitorCanceladosMatchSql("a", "p");
  const matchAgendaCandidato = getMonitorCanceladosMatchSql("a2", "c");
  const params = [inicioMes, fechaCorte];
  const filters = [
    "(c.ultimaVisitaP IS NULL OR c.ultimaVisitaP <= c.fechaCancelacion)",
    `NOT EXISTS (SELECT 1 FROM agendapersona a2 WHERE ${matchAgendaCandidato} AND a2.fechaAP > c.fechaCancelacion AND LOWER(TRIM(IFNULL(a2.estadoAP, ''))) NOT IN ('cancelado', 'cancelada'))`,
    "NOT EXISTS (SELECT 1 FROM cola_paciente cp WHERE LOWER(TRIM(IFNULL(cp.nombrePaciente, ''))) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(IFNULL(c.NombreP, ''))) COLLATE utf8mb4_unicode_ci AND BINARY cp.estado = BINARY 'Atendido' AND cp.fechaAgenda > c.fechaCancelacion)",
    "(c.estadoKey = ? OR ? = 'all')",
    "(c.tratamientoKey = ? OR ? = 'all')",
    "(? = '' OR LOWER(IFNULL(c.NombreP, '')) LIKE CONCAT('%', ?, '%') OR c.telefonoNorm LIKE CONCAT('%', ?, '%'))"
  ];
  params.push(estado, estado, tratamiento, tratamiento, q, q, q);

  const selectRows = `c.idPaciente, c.NombreP, c.telefonoP,
      DATE_FORMAT(c.ultimaVisitaP, '%Y-%m-%d') AS ultimaVisitaP,
      DATE_FORMAT(c.fechaCancelacion, '%Y-%m-%d') AS fechaCancelacion,
      0 AS mesesAusencia, 'cancelados' AS segmentoKey, 'Cancelado sin reprogramar' AS segmentoLabel,
      c.estadoKey, c.estadoLabel, c.tipoTratamientoP, c.tratamientoKey, 0 AS sms, 0 AS llamada`;
  const base = `
    WITH candidatos AS (
      SELECT
        p.idPaciente,
        p.NombreP,
        p.telefonoP,
        p.ultimaVisitaP,
        LOWER(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(p.telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', '')) AS telefonoNorm,
        CASE WHEN IFNULL(p.estadoP, 1) = 1 THEN 'activo' ELSE 'inactivo' END AS estadoKey,
        CASE WHEN IFNULL(p.estadoP, 1) = 1 THEN 'Activo' ELSE 'Inactivo' END AS estadoLabel,
        CASE WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'Odontologia' WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'Ortodoncia' ELSE 'Sin registrar' END AS tipoTratamientoP,
        CASE WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'odontologia' WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'ortodoncia' ELSE 'sin_registrar' END AS tratamientoKey,
        MAX(a.fechaAP) AS fechaCancelacion
      FROM paciente p
      INNER JOIN agendapersona a ON ${matchAgendaPaciente}
      WHERE a.fechaAP BETWEEN ? AND ?
        AND LOWER(TRIM(IFNULL(a.estadoAP, ''))) COLLATE utf8mb4_unicode_ci IN ('cancelado', 'cancelada')
      GROUP BY p.idPaciente, p.NombreP, p.telefonoP, p.ultimaVisitaP, p.estadoP, p.tipoTratamientoP
    )
    SELECT ${selectRows}
    FROM candidatos c
    WHERE ${filters.join(" AND ")}
  `;
  const sql = mode === "count"
    ? `${base.replace(`SELECT ${selectRows}`, "SELECT COUNT(*) AS totalRows")} `
    : `${base} ORDER BY c.fechaCancelacion DESC, c.NombreP ASC LIMIT ?, ?`;
  if (mode !== "count") params.push((page - 1) * pageSize, pageSize);
  return { sql, params };
}

async function consultarMonitorCanceladosListado(options) {
  const built = buildMonitorCanceladosSql({ ...options, mode: "list" });
  const [rows] = await queryReadWithRetry(built.sql, built.params);
  return { dataRows: Array.isArray(rows) ? rows : [], totalRows: 0 };
}

async function contarMonitorCancelados(options) {
  const built = buildMonitorCanceladosSql({ ...options, mode: "count" });
  const [rows] = await queryReadWithRetry(built.sql, built.params);
  return Number(Array.isArray(rows) ? rows[0]?.totalRows || 0 : 0);
}

let monitorComentarioColumnaOk = false;

// La columna llega con la migracion 2026-09-24; mientras no exista el monitor sigue
// funcionando solo con SMS/Llamada.
async function existeColumnaComentarioSeguimiento() {
  if (monitorComentarioColumnaOk) return true;
  const [rows] = await queryReadWithRetry(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'paciente_seguimiento_contacto'
        AND COLUMN_NAME = 'comentario'
      LIMIT 1`
  );
  monitorComentarioColumnaOk = Array.isArray(rows) && rows.length > 0;
  return monitorComentarioColumnaOk;
}

// Marcas vigentes por paciente: el registro mas reciente cuya fecha es mayor a la
// ultima visita. Si el paciente ya volvio, sus marcas anteriores dejan de mostrarse.
async function consultarMonitorContactoVigente(idsPacientes) {
  const ids = [...new Set((idsPacientes || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const vigentes = new Map();
  if (!ids.length) return vigentes;

  const conComentario = await existeColumnaComentarioSeguimiento();
  const [rows] = await queryReadWithRetry(
    `SELECT
        psc.idPaciente,
        DATE_FORMAT(psc.fechaCorte, '%Y-%m-%d') AS fechaContacto,
        psc.sms,
        psc.llamada,
        ${conComentario ? "psc.comentario" : "NULL"} AS comentario,
        u.NombreU AS contactoPor,
        DATE_FORMAT(psc.actualizadoEn, '%Y-%m-%d %H:%i') AS contactoEn
      FROM paciente_seguimiento_contacto psc
      INNER JOIN paciente p ON p.idPaciente = psc.idPaciente
      LEFT JOIN usuario u ON u.idUsuario = psc.actualizadoPorUsuarioId
      WHERE psc.idPaciente IN (?)
        AND (p.ultimaVisitaP IS NULL OR psc.fechaCorte > p.ultimaVisitaP)
      ORDER BY psc.idPaciente, psc.fechaCorte DESC`,
    [ids]
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = Number(row.idPaciente);
    if (vigentes.has(id)) continue;
    vigentes.set(id, {
      sms: normalizeBitValue(row.sms, 0),
      llamada: normalizeBitValue(row.llamada, 0),
      comentario: String(row.comentario || "").trim(),
      fechaContacto: row.fechaContacto || null,
      contactoPor: String(row.contactoPor || "").trim(),
      contactoEn: row.contactoEn || null
    });
  }
  return vigentes;
}

function normalizarNombreClave(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Proxima cita por paciente con el mismo criterio de monitorSeguimientoProximaCita:
// agenda por nombre, no cancelada y con fecha/hora futura. Devuelve Map nombreClave -> fechaAP.
async function consultarMonitorProximaCitaPorNombre(nombres) {
  const lista = [...new Set((nombres || []).map((n) => String(n || "").trim()).filter(Boolean))];
  const proximas = new Map();
  if (!lista.length) return proximas;

  const hoyIso = getTodayLocalISO();
  const horaActual = getCurrentLocalHHMM();
  const hora24Expr = `
    COALESCE(
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%l:%i %p'), '%H:%i'),
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%l:%i%p'), '%H:%i'),
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%H:%i'), '%H:%i'),
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%H:%i:%s'), '%H:%i')
    )
  `;

  const [rows] = await queryReadWithRetry(
    `SELECT
        TRIM(IFNULL(a.nombreAP, '')) AS nombreAP,
        DATE_FORMAT(MIN(a.fechaAP), '%Y-%m-%d') AS fechaAP
      FROM agendapersona a
      WHERE LOWER(TRIM(IFNULL(a.nombreAP, ''))) IN (?)
        AND LOWER(TRIM(IFNULL(a.estadoAP, ''))) NOT IN ('cancelado', 'cancelada')
        AND (
          a.fechaAP > ?
          OR (a.fechaAP = ? AND (${hora24Expr} IS NULL OR ${hora24Expr} >= ?))
        )
      GROUP BY TRIM(IFNULL(a.nombreAP, ''))`,
    [lista.map((n) => n.toLowerCase()), hoyIso, hoyIso, horaActual]
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const clave = normalizarNombreClave(row.nombreAP);
    const fecha = String(row.fechaAP || "").trim();
    if (!clave || !fecha) continue;
    const actual = proximas.get(clave);
    if (!actual || fecha < actual) proximas.set(clave, fecha);
  }
  return proximas;
}

// Listado del monitor filtrado por "tiene / no tiene proxima cita". Replica las reglas de
// sp_paciente_monitor_seguimiento_listar/_totales (meses por aniversario vencido, filtros y
// protocolo de seguridad) sin requerir migracion. La agenda futura se lee una sola vez.
async function consultarMonitorConFiltroProxima({
  fechaCorte,
  segmento,
  estado,
  tratamiento,
  q,
  page,
  pageSize,
  proximaFiltro
}) {
  const [protocoloRows] = await queryReadWithRetry(
    "SELECT IFNULL(enabled, 0) AS enabled FROM seguridad_protocolo_config WHERE id = 1 LIMIT 1"
  );
  const tratamientoEfectivo = Number(protocoloRows?.[0]?.enabled || 0) === 1 ? "odontologia" : tratamiento;

  const hoyIso = getTodayLocalISO();
  const horaActual = getCurrentLocalHHMM();
  const hora24Expr = `
    COALESCE(
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%l:%i %p'), '%H:%i'),
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%l:%i%p'), '%H:%i'),
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%H:%i'), '%H:%i'),
      DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%H:%i:%s'), '%H:%i')
    )
  `;
  const mesesExpr = `GREATEST(
    TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, cfg.fc) - (
      cfg.fc <= DATE_ADD(p.ultimaVisitaP, INTERVAL TIMESTAMPDIFF(MONTH, p.ultimaVisitaP, cfg.fc) MONTH)
    ),
    0
  )`;
  const qNorm = String(q || "").trim().toLowerCase();

  const cte = `
    WITH futuras AS (
      SELECT DISTINCT LOWER(TRIM(IFNULL(a.nombreAP, ''))) COLLATE utf8mb4_unicode_ci AS nombreKey
      FROM agendapersona a
      WHERE LOWER(TRIM(IFNULL(a.estadoAP, ''))) NOT IN ('cancelado', 'cancelada')
        AND (a.fechaAP > ? OR (a.fechaAP = ? AND (${hora24Expr} IS NULL OR ${hora24Expr} >= ?)))
    ),
    base AS (
      SELECT
        p.idPaciente,
        p.NombreP,
        p.telefonoP,
        p.ultimaVisitaP,
        LOWER(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(p.telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', '')) AS telefonoNorm,
        ${mesesExpr} AS mesesAusencia,
        CASE WHEN IFNULL(p.estadoP, 1) = 1 THEN 'activo' ELSE 'inactivo' END AS estadoKey,
        CASE
          WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'Odontologia'
          WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'Ortodoncia'
          ELSE 'Sin registrar'
        END AS tipoTratamientoP,
        CASE
          WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'odontologia' THEN 'odontologia'
          WHEN LOWER(TRIM(IFNULL(p.tipoTratamientoP, ''))) = 'ortodoncia' THEN 'ortodoncia'
          ELSE 'sin_registrar'
        END AS tratamientoKey,
        (fz.nombreKey IS NOT NULL) AS tieneProxima
      FROM paciente p
      CROSS JOIN (SELECT CAST(? AS DATE) AS fc) cfg
      LEFT JOIN futuras fz
        ON fz.nombreKey = LOWER(TRIM(IFNULL(p.NombreP, ''))) COLLATE utf8mb4_unicode_ci
      WHERE p.ultimaVisitaP IS NOT NULL
    ),
    f AS (
      SELECT
        b.*,
        CASE
          WHEN b.mesesAusencia >= 3 THEN 'm3'
          WHEN b.mesesAusencia = 2 THEN 'm2'
          WHEN b.mesesAusencia = 1 THEN 'retrasado'
          ELSE 'al_dia'
        END AS segmentoKey
      FROM base b
      WHERE (? = '' OR LOWER(IFNULL(b.NombreP, '')) LIKE CONCAT('%', ?, '%') OR b.telefonoNorm LIKE CONCAT('%', ?, '%'))
        AND (? = 'all' OR b.estadoKey = ?)
        AND (? = 'all' OR b.tratamientoKey = ?)
        AND b.tieneProxima = ?
    )
  `;
  const cteParams = [
    hoyIso, hoyIso, horaActual,
    fechaCorte,
    qNorm, qNorm, qNorm,
    estado, estado,
    tratamientoEfectivo, tratamientoEfectivo,
    proximaFiltro === "con" ? 1 : 0
  ];

  const [dataRows] = await queryReadWithRetry(
    `${cte}
    SELECT
      f.idPaciente, f.NombreP, f.telefonoP,
      DATE_FORMAT(f.ultimaVisitaP, '%Y-%m-%d') AS ultimaVisitaP,
      f.mesesAusencia, f.segmentoKey, f.estadoKey, f.tipoTratamientoP, f.tratamientoKey
    FROM f
    WHERE (? = 'all' OR f.segmentoKey = ?)
    ORDER BY f.mesesAusencia DESC, f.NombreP ASC
    LIMIT ?, ?`,
    [...cteParams, segmento, segmento, (page - 1) * pageSize, pageSize]
  );

  const [totalRowsResult] = await queryReadWithRetry(
    `${cte}
    SELECT
      SUM(CASE WHEN ? = 'all' OR f.segmentoKey = ? THEN 1 ELSE 0 END) AS totalRows,
      SUM(CASE WHEN f.segmentoKey = 'retrasado' THEN 1 ELSE 0 END) AS retrasado,
      SUM(CASE WHEN f.segmentoKey = 'm2' THEN 1 ELSE 0 END) AS m2,
      SUM(CASE WHEN f.segmentoKey = 'm3' THEN 1 ELSE 0 END) AS m3
    FROM f`,
    [...cteParams, segmento, segmento]
  );
  const totales = totalRowsResult?.[0] || {};

  return {
    dataRows: Array.isArray(dataRows) ? dataRows : [],
    totalRows: Number(totales.totalRows || 0),
    totales: {
      retrasado: Number(totales.retrasado || 0),
      m2: Number(totales.m2 || 0),
      m3: Number(totales.m3 || 0)
    }
  };
}

function buildMonitorContactoData(vigente) {
  return {
    sms: vigente ? vigente.sms : 0,
    llamada: vigente ? vigente.llamada : 0,
    comentario: vigente ? vigente.comentario : "",
    fechaContacto: vigente ? vigente.fechaContacto : null,
    contactoPor: vigente ? vigente.contactoPor : "",
    contactoEn: vigente ? vigente.contactoEn : null
  };
}

async function queryReadWithRetry(sql, params = [], options = {}) {
  const attempts = Number.isInteger(Number(options.attempts)) && Number(options.attempts) > 0
    ? Number(options.attempts)
    : 2;
  const baseDelayMs = Number.isInteger(Number(options.baseDelayMs)) && Number(options.baseDelayMs) >= 0
    ? Number(options.baseDelayMs)
    : 120;

  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      lastError = err;
      const hasNextAttempt = i < attempts - 1;
      if (!hasNextAttempt || !isTransientDbError(err)) {
        throw err;
      }
      await sleep(baseDelayMs * (i + 1));
    }
  }

  throw lastError || new Error("Error desconocido en consulta de lectura");
}

function handlePacienteError(res, err, fallbackMessage) {
  if (isTransientDbError(err)) {
    return res.status(503).json({
      ok: false,
      message: "Base de datos temporalmente no disponible. Intente de nuevo."
    });
  }
  return serverError(res, err, fallbackMessage);
}

function esFechaISOValida(fecha) {
  if (typeof fecha !== "string") return false;
  const valor = fecha.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;

  const [anio, mes, dia] = valor.split("-").map(Number);
  const date = new Date(anio, mes - 1, dia);
  return (
    date.getFullYear() === anio &&
    date.getMonth() === mes - 1 &&
    date.getDate() === dia
  );
}

function getTodayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getPrintBrandingLogoCandidates() {
  return [
    `${PRINT_BRANDING_LOGO_BASENAME}.png`,
    `${PRINT_BRANDING_LOGO_BASENAME}.jpg`
  ];
}

function getPrintBrandingLogoSearchDirs() {
  const dirs = [PRINT_BRANDING_LOGO_DIR, PRINT_BRANDING_LOGO_LEGACY_DIR];
  return [...new Set(dirs.filter(Boolean))];
}

async function getLatestPrintBrandingLogoMeta() {
  const candidates = getPrintBrandingLogoCandidates();
  let latest = null;
  const searchDirs = getPrintBrandingLogoSearchDirs();

  for (const dirPath of searchDirs) {
    for (const fileName of candidates) {
      const fullPath = path.join(dirPath, fileName);
      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isFile()) continue;
        if (!latest || stats.mtimeMs > latest.mtimeMs) {
          latest = {
            fileName,
            mtimeMs: stats.mtimeMs,
            updatedAt: stats.mtime.toISOString()
          };
        }
      } catch (err) {
        if (err?.code !== "ENOENT") throw err;
      }
    }
  }

  return latest;
}

async function cleanupAlternatePrintBrandingLogos(activeFileName) {
  const active = String(activeFileName || "").trim().toLowerCase();
  const candidates = getPrintBrandingLogoCandidates();
  const searchDirs = getPrintBrandingLogoSearchDirs();

  await Promise.all(
    searchDirs.flatMap((dirPath) =>
      candidates
        .filter((fileName) => String(fileName).toLowerCase() !== active)
        .map(async (fileName) => {
          try {
            await fs.unlink(path.join(dirPath, fileName));
          } catch (err) {
            if (err?.code !== "ENOENT") throw err;
          }
        })
    )
  );
}

function pad2(num) {
  return String(Number(num || 0)).padStart(2, "0");
}

function buildLocalDateStampParts(date = new Date()) {
  return {
    yyyy: String(date.getFullYear()),
    mm: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    hh: pad2(date.getHours()),
    mi: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds())
  };
}

function slugifyBaseName(rawName) {
  const txt = String(rawName || "").trim().toLowerCase();
  if (!txt) return "documento";
  const noExt = txt.replace(/\.pdf$/i, "");
  const normalized = noExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "documento";
}

function buildPrintDocAutoFileName(originalName) {
  const now = new Date();
  const stamp = buildLocalDateStampParts(now);
  const slug = slugifyBaseName(originalName).slice(0, 32);
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${PRINT_DOC_BASENAME}_${stamp.yyyy}${stamp.mm}${stamp.dd}_${stamp.hh}${stamp.mi}${stamp.ss}${ms}_${slug}.pdf`;
}

function normalizePrintDocFileName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const base = path.basename(raw);
  if (base !== raw) return "";
  if (!/^[a-zA-Z0-9._-]+\.pdf$/i.test(base)) return "";
  return base;
}

function buildPrintDocUrl(fileName, mtimeMs) {
  const safeName = encodeURIComponent(fileName);
  const cacheBust = Number.isFinite(Number(mtimeMs)) ? Math.floor(Number(mtimeMs)) : Date.now();
  return `/docs/${safeName}?v=${cacheBust}`;
}

async function readPrintDocsDirectoryMeta() {
  try {
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const meta = [];

    for (const entry of files) {
      const fileName = normalizePrintDocFileName(entry.name);
      if (!fileName) continue;
      const fullPath = path.join(docsDir, fileName);
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) continue;
      meta.push({
        fileName,
        size: Number(stats.size || 0),
        mtimeMs: Number(stats.mtimeMs || 0),
        updatedAt: stats.mtime.toISOString()
      });
    }

    meta.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return meta;
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

function getResultSet(rows, index = 0) {
  if (!Array.isArray(rows)) return [];
  const resultSet = rows[index];
  return Array.isArray(resultSet) ? resultSet : [];
}

function normalizeMonitorEnum(rawValue, allowedValues, fallback) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return fallback;
  return allowedValues.has(value) ? value : "__INVALID__";
}

function normalizeMonitorPage(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
}

function normalizeMonitorPageSize(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) return 25;
  return MONITOR_PAGE_SIZE_VALUES.has(parsed) ? parsed : 25;
}

function normalizeMonitorQuery(rawValue) {
  return String(rawValue || "").trim();
}

function normalizeDigitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}

function getCurrentLocalHHMM() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeBitValue(rawValue, fallback = "__INVALID__") {
  if (rawValue === undefined || rawValue === null || rawValue === "") return fallback;
  if (rawValue === true || rawValue === 1 || rawValue === "1") return 1;
  if (rawValue === false || rawValue === 0 || rawValue === "0") return 0;
  const txt = String(rawValue).trim().toLowerCase();
  if (txt === "true" || txt === "yes" || txt === "on") return 1;
  if (txt === "false" || txt === "no" || txt === "off") return 0;
  return fallback;
}

function getMonitorSegmentLabel(segmentKey) {
  if (segmentKey === "cancelados") return "Cancelado sin reprogramar";
  if (segmentKey === "retrasado") return "Retrasado";
  if (segmentKey === "m2") return "+2 meses";
  if (segmentKey === "m3") return "+3 meses";
  return "Al dia";
}

function inferSegmentKeyByMonths(months) {
  const safeMonths = Number(months || 0);
  if (safeMonths >= 3) return "m3";
  if (safeMonths === 2) return "m2";
  if (safeMonths === 1) return "retrasado";
  return "al_dia";
}

function normalizeTratamientoLabel(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "Sin registrar";

  const normalized = raw.toLowerCase();
  if (normalized === "odontologia") return "Odontologia";
  if (normalized === "ortodoncia") return "Ortodoncia";
  if (normalized === "sin registrar") return "Sin registrar";
  return raw;
}

function getTratamientoKeyFromLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (normalized === "odontologia") return "odontologia";
  if (normalized === "ortodoncia") return "ortodoncia";
  return "sin_registrar";
}

function validarLongitudProcedimientoCita(procedimientoTxt) {
  const length = String(procedimientoTxt || "").length;
  if (length > MAX_PROCEDIMIENTO_CITA) {
    return `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres (actual: ${length}).`;
  }
  return "";
}

function textoNormalizado(value) {
  return String(value ?? "").trim().toLowerCase();
}

function esRegistroFisico(nombreDoctor) {
  return textoNormalizado(nombreDoctor) === DOCTOR_REGISTRO_FISICO;
}

function normalizarEstadoDoctor(value) {
  const txt = String(value ?? "").trim().toLowerCase();
  if (txt === "0" || txt === "inactivo" || txt === "inactive" || txt === "false") return 0;
  if (txt === "1" || txt === "activo" || txt === "active" || txt === "true") return 1;
  return Number(value) === 0 ? 0 : 1;
}

async function existeColumnaEstadoDoctor() {
  const [rows] = await queryReadWithRetry(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'doctor'
        AND COLUMN_NAME = 'estadoD'
      LIMIT 1`
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function obtenerVinculoDoctorPorUsuario(idUsuario) {
  const [rows] = await queryReadWithRetry(
    "SELECT idDoctor FROM usuario WHERE idUsuario = ? LIMIT 1",
    [idUsuario]
  );
  return Number(rows?.[0]?.idDoctor || 0);
}

async function obtenerMetaCita(idCitaPaciente) {
  const [rows] = await queryReadWithRetry(
    `SELECT c.idcitasPaciente, c.doctorId, c.estadoAutorizacionCP, d.nombreD AS nombreDoctor
     FROM citaspaciente c
     LEFT JOIN doctor d ON d.idDoctor = c.doctorId
     WHERE c.idcitasPaciente = ?
     LIMIT 1`,
    [idCitaPaciente]
  );
  return rows?.[0] || null;
}

async function obtenerMetaDoctor(idDoctor) {
  const tieneColumnaEstado = await existeColumnaEstadoDoctor();
  const [rows] = await queryReadWithRetry(
    tieneColumnaEstado
      ? "SELECT idDoctor, nombreD, estadoD FROM doctor WHERE idDoctor = ? LIMIT 1"
      : "SELECT idDoctor, nombreD FROM doctor WHERE idDoctor = ? LIMIT 1",
    [idDoctor]
  );
  const doctor = rows?.[0] || null;
  if (!doctor) return null;
  if (tieneColumnaEstado) {
    doctor.estadoD = normalizarEstadoDoctor(doctor.estadoD);
  }
  return doctor;
}
async function obtenerCorreoUsuarioDoctorPorIdDoctor(idDoctor) {
  const [rows] = await queryReadWithRetry(
    `SELECT correoU
     FROM usuario
     WHERE idDoctor = ?
     ORDER BY idUsuario ASC
     LIMIT 1`,
    [idDoctor]
  );
  return String(rows?.[0]?.correoU || "").trim();
}
// ============================
// 🔍 BUSCAR PACIENTES (AUTOCOMPLETE)
// ============================
function esBusquedaTelefono(texto) {
  const q = String(texto || "").trim();
  if (!q) return false;

  const soloCaracteresTelefono = q.replace(/[0-9\s()+\-./]/g, "") === "";
  if (!soloCaracteresTelefono) return false;

  const digitos = q.replace(/\D+/g, "");
  return digitos.length >= 3;
}

const buscar = async (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();

    if (q.length < 3) {
      return badRequest(res, "Minimo 3 caracteres");
    }

    let data = [];
    if (esBusquedaTelefono(q)) {
      const qDigitos = q.replace(/\D+/g, "");
      const [rows] = await queryReadWithRetry(
        `SELECT idPaciente, NombreP, telefonoP
         FROM paciente
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(telefonoP, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') LIKE ?
         ORDER BY NombreP ASC
         LIMIT 25`,
        [`%${qDigitos}%`]
      );
      data = Array.isArray(rows) ? rows : [];
    } else {
      const [rows] = await queryReadWithRetry(
        "CALL sp_paciente_buscar_ligero(?)",
        [q]
      );
      data = firstResultSet(rows);
    }

    res.json({
      ok: true,
      data
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al buscar pacientes");
  }
};

// ============================
// 🧍 OBTENER PACIENTE COMPLETO
// ============================
const obtenerPorId = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de paciente invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_paciente_get_by_id(?)",
      [id]
    );

    const paciente = firstRow(rows);
    if (!paciente) {
      return notFound(res, "Paciente no encontrado");
    }

    res.json({
      ok: true,
      data: paciente
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al obtener paciente");
  }
};

async function consultarMonitorSeguimientoListado({
  fechaCorte,
  segmento,
  estado,
  tratamiento,
  q,
  page,
  pageSize
}) {
  const [rows] = await queryReadWithRetry(
    "CALL sp_paciente_monitor_seguimiento_listar(?,?,?,?,?,?,?)",
    [fechaCorte, segmento, estado, tratamiento, q, page, pageSize]
  );

  const dataRows = getResultSet(rows, 0);
  const countRow = getResultSet(rows, 1)[0] || {};
  const totalRows = Number(countRow.totalRows || 0);

  return {
    dataRows: Array.isArray(dataRows) ? dataRows : [],
    totalRows: Number.isFinite(totalRows) && totalRows >= 0 ? totalRows : 0
  };
}

const monitorSeguimiento = async (req, res) => {
  try {
    const fechaCorteRaw = String(req.query?.fechaCorte || "").trim();
    const fechaCorte = fechaCorteRaw || getTodayLocalISO();
    if (!esFechaISOValida(fechaCorte)) {
      return badRequest(res, "fechaCorte invalida, use YYYY-MM-DD");
    }

    const segmento = normalizeMonitorEnum(req.query?.segmento, MONITOR_SEGMENT_VALUES, "all");
    if (segmento === "__INVALID__") {
      return badRequest(res, "segmento invalido. Use all|retrasado|m2|m3|cancelados");
    }

    const estado = normalizeMonitorEnum(req.query?.estado, MONITOR_ESTADO_VALUES, "all");
    if (estado === "__INVALID__") {
      return badRequest(res, "estado invalido. Use all|activo|inactivo");
    }

    const tratamiento = normalizeMonitorEnum(req.query?.tratamiento, MONITOR_TRATAMIENTO_VALUES, "all");
    if (tratamiento === "__INVALID__") {
      return badRequest(res, "tratamiento invalido. Use all|odontologia|ortodoncia|sin_registrar");
    }

    const q = normalizeMonitorQuery(req.query?.q);
    let page = normalizeMonitorPage(req.query?.page);
    const pageSize = normalizeMonitorPageSize(req.query?.pageSize);
    const proximaFiltro = normalizeMonitorEnum(req.query?.proximaFiltro, MONITOR_PROXIMA_FILTRO_VALUES, "all");
    if (proximaFiltro === "__INVALID__") {
      return badRequest(res, "proximaFiltro invalido. Use all|con|sin");
    }
    // "Cancelados sin reprogramar" ya implica no tener cita futura: ahi no aplica el filtro.
    const usarFiltroProxima = proximaFiltro !== "all" && segmento !== "cancelados";
    const canceladosTotal = await contarMonitorCancelados({ fechaCorte, estado, tratamiento, q });

    const listarPagina = async (pageArg) => {
      if (segmento === "cancelados") {
        const cancelados = await consultarMonitorCanceladosListado({ fechaCorte, estado, tratamiento, q, page: pageArg, pageSize });
        cancelados.totalRows = canceladosTotal;
        return cancelados;
      }
      if (usarFiltroProxima) {
        return consultarMonitorConFiltroProxima({
          fechaCorte, segmento, estado, tratamiento, q, page: pageArg, pageSize, proximaFiltro
        });
      }
      return consultarMonitorSeguimientoListado({ fechaCorte, segmento, estado, tratamiento, q, page: pageArg, pageSize });
    };

    let listado = await listarPagina(page);
    let total = Number(listado.totalRows || 0);
    let totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (total > 0 && page > totalPages) {
      page = totalPages;
      listado = await listarPagina(page);
      total = Number(listado.totalRows || 0);
      totalPages = Math.max(1, Math.ceil(total / pageSize));
    }

    const contactosVigentes = await consultarMonitorContactoVigente(
      listado.dataRows.map((row) => row.idPaciente)
    );
    // Solo se consulta la agenda cuando la columna "Proxima cita" esta visible.
    const incluirProximaCita = normalizeBitValue(req.query?.proximaCita, 0) === 1;
    const proximasCitas = incluirProximaCita
      ? await consultarMonitorProximaCitaPorNombre(listado.dataRows.map((row) => row.NombreP))
      : null;

    const rows = listado.dataRows.map((row) => {
      const idPaciente = Number(row.idPaciente || 0);
      const mesesAusencia = Number(row.mesesAusencia || 0);
      const segmentKeyRaw = String(row.segmentoKey || "").trim().toLowerCase();
      const segmentoKey = MONITOR_SEGMENT_VALUES.has(segmentKeyRaw)
        ? segmentKeyRaw
        : inferSegmentKeyByMonths(mesesAusencia);
      const estadoKeyRaw = String(row.estadoKey || "").trim().toLowerCase();
      const estadoKey = estadoKeyRaw === "inactivo" ? "inactivo" : "activo";

      const tratamientoLabel = normalizeTratamientoLabel(row.tipoTratamientoP || row.tratamientoLabel);
      const tratamientoKey = getTratamientoKeyFromLabel(tratamientoLabel);

      return {
        idPaciente: Number.isInteger(idPaciente) ? idPaciente : 0,
        NombreP: String(row.NombreP || "").trim(),
        telefonoP: String(row.telefonoP || "").trim(),
        ultimaVisitaP: row.ultimaVisitaP ? String(row.ultimaVisitaP).trim() : null,
        fechaCancelacion: row.fechaCancelacion ? String(row.fechaCancelacion).trim() : null,
        mesesAusencia: Number.isFinite(mesesAusencia) && mesesAusencia >= 0 ? mesesAusencia : 0,
        segmentoKey,
        segmentoLabel: getMonitorSegmentLabel(segmentoKey),
        estadoKey,
        estadoLabel: estadoKey === "activo" ? "Activo" : "Inactivo",
        tipoTratamientoP: tratamientoLabel,
        tratamientoKey,
        ...buildMonitorContactoData(contactosVigentes.get(idPaciente)),
        ...(proximasCitas
          ? { proximaCita: proximasCitas.get(normalizarNombreClave(row.NombreP)) || null }
          : {})
      };
    });

    const totalesRow = segmento === "cancelados" ? {} : usarFiltroProxima ? listado.totales : await (async () => {
      const [rowsTotales] = await queryReadWithRetry(
        "CALL sp_paciente_monitor_seguimiento_totales(?,?,?,?)",
        [fechaCorte, estado, tratamiento, q]
      );
      return firstRow(rowsTotales) || {};
    })();

    totalPages = Math.max(1, Math.ceil(total / pageSize));
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = total === 0 ? 0 : Math.min((page - 1) * pageSize + rows.length, total);

    return res.json({
      ok: true,
      rows,
      totales: {
        total,
        retrasado: Number(totalesRow.retrasado || 0),
        m2: Number(totalesRow.m2 || 0),
        m3: Number(totalesRow.m3 || 0),
        cancelados: canceladosTotal
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        from,
        to
      }
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al listar monitor de seguimiento");
  }
};

// Proxima cita en lote para las filas visibles (activar la columna sin recargar el listado).
const monitorSeguimientoProximasCitas = async (req, res) => {
  try {
    const ids = [...new Set(
      String(req.query?.ids || "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];
    if (!ids.length) return res.json({ ok: true, data: {} });
    if (ids.length > 50) return badRequest(res, "Maximo 50 pacientes por consulta");

    const [pacientes] = await queryReadWithRetry(
      "SELECT idPaciente, NombreP FROM paciente WHERE idPaciente IN (?)",
      [ids]
    );
    const lista = Array.isArray(pacientes) ? pacientes : [];
    const proximas = await consultarMonitorProximaCitaPorNombre(lista.map((p) => p.NombreP));

    const data = {};
    for (const p of lista) {
      data[p.idPaciente] = proximas.get(normalizarNombreClave(p.NombreP)) || null;
    }
    return res.json({ ok: true, data });
  } catch (err) {
    return handlePacienteError(res, err, "Error al consultar proximas citas de monitor");
  }
};

const monitorSeguimientoProximaCita = async (req, res) => {
  try {
    const idPaciente = Number(req.query?.idPaciente || 0);
    if (!Number.isInteger(idPaciente) || idPaciente <= 0) {
      return badRequest(res, "idPaciente invalido");
    }

    const [pacienteRows] = await queryReadWithRetry(
      `SELECT idPaciente, NombreP, telefonoP
       FROM paciente
       WHERE idPaciente = ?
       LIMIT 1`,
      [idPaciente]
    );

    const paciente = Array.isArray(pacienteRows) ? pacienteRows[0] : null;
    if (!paciente) {
      return notFound(res, "Paciente no encontrado");
    }

    const nombrePaciente = String(paciente.NombreP || "").trim();
    if (!nombrePaciente) {
      return res.json({ ok: true, data: null });
    }

    const telefonoPacienteDig = normalizeDigitsOnly(paciente.telefonoP);
    const hoyIso = getTodayLocalISO();
    const horaActual = getCurrentLocalHHMM();
    const hora24Expr = `
      COALESCE(
        DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%l:%i %p'), '%H:%i'),
        DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%l:%i%p'), '%H:%i'),
        DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%H:%i'), '%H:%i'),
        DATE_FORMAT(STR_TO_DATE(TRIM(IFNULL(a.horaAP, '')), '%H:%i:%s'), '%H:%i')
      )
    `;
    const contactoDigExpr = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(a.contactoAP, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')";

    const [agendaRows] = await queryReadWithRetry(
      `SELECT
         a.idAgendaAP,
         DATE_FORMAT(a.fechaAP, '%Y-%m-%d') AS fechaAP,
         TRIM(IFNULL(a.horaAP, '')) AS horaAP,
         ${hora24Expr} AS hora24,
         TRIM(IFNULL(a.estadoAP, '')) AS estadoAP,
         TRIM(IFNULL(a.nombreAP, '')) AS nombreAP,
         TRIM(IFNULL(a.contactoAP, '')) AS contactoAP,
         CASE
           WHEN ? <> '' AND ${contactoDigExpr} = ? THEN 1
           ELSE 0
         END AS telefonoMatch
       FROM agendapersona a
       WHERE LOWER(TRIM(IFNULL(a.nombreAP, ''))) = LOWER(TRIM(?))
         AND LOWER(TRIM(IFNULL(a.estadoAP, ''))) NOT IN ('cancelado', 'cancelada')
         AND (
           a.fechaAP > ?
           OR (
             a.fechaAP = ?
             AND (
               ${hora24Expr} IS NULL
               OR ${hora24Expr} >= ?
             )
           )
         )
       ORDER BY
         telefonoMatch DESC,
         a.fechaAP ASC,
         (${hora24Expr} IS NULL) ASC,
         ${hora24Expr} ASC,
         a.idAgendaAP ASC
       LIMIT 1`,
      [
        telefonoPacienteDig,
        telefonoPacienteDig,
        nombrePaciente,
        hoyIso,
        hoyIso,
        horaActual
      ]
    );

    const agenda = Array.isArray(agendaRows) && agendaRows.length > 0
      ? agendaRows[0]
      : null;

    if (!agenda) {
      return res.json({
        ok: true,
        data: null
      });
    }

    const telefonoMatch = Number(agenda.telefonoMatch || 0) === 1;
    return res.json({
      ok: true,
      data: {
        idAgendaAP: Number(agenda.idAgendaAP || 0),
        fechaAP: String(agenda.fechaAP || "").trim(),
        horaAP: String(agenda.horaAP || "").trim(),
        hora24: String(agenda.hora24 || "").trim() || null,
        estadoAP: String(agenda.estadoAP || "").trim(),
        nombreAP: String(agenda.nombreAP || "").trim(),
        contactoAP: String(agenda.contactoAP || "").trim(),
        matchBy: telefonoMatch ? "nombre_y_telefono" : "nombre"
      }
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al consultar proxima cita de monitor");
  }
};

const guardarMonitorContacto = async (req, res) => {
  try {
    const idPaciente = Number(req.body?.idPaciente || 0);
    const sms = normalizeBitValue(req.body?.sms);
    const llamada = normalizeBitValue(req.body?.llamada);
    const comentarioEnviado = req.body?.comentario !== undefined && req.body?.comentario !== null;
    const actualizadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;
    // La marca se fecha con el dia real del contacto (no la fecha de corte de la
    // pantalla): se sigue mostrando mientras sea posterior a la ultima visita.
    const fechaContacto = getTodayLocalISO();

    if (!Number.isInteger(idPaciente) || idPaciente <= 0) {
      return badRequest(res, "idPaciente invalido");
    }
    if (sms === "__INVALID__" || llamada === "__INVALID__") {
      return badRequest(res, "sms/llamada invalidos. Use 0|1 o boolean");
    }

    let comentario = comentarioEnviado ? String(req.body.comentario).trim() : "";
    if (comentario.length > MAX_COMENTARIO_SEGUIMIENTO) {
      return badRequest(res, `El comentario no puede superar ${MAX_COMENTARIO_SEGUIMIENTO} caracteres`);
    }

    if (await existeColumnaComentarioSeguimiento()) {
      if (!comentarioEnviado) {
        // Cliente sin comentario: se conserva el comentario vigente del paciente.
        const vigentes = await consultarMonitorContactoVigente([idPaciente]);
        comentario = vigentes.get(idPaciente)?.comentario || "";
      }
      await pool.query(
        "CALL sp_paciente_monitor_contacto_guardar_v2(?,?,?,?,?,?)",
        [idPaciente, fechaContacto, sms, llamada, comentario, actualizadoPorUsuarioId]
      );
    } else {
      if (comentario) {
        return badRequest(
          res,
          "Falta aplicar la migracion 2026-09-24_seguimiento_comentario.sql para guardar comentarios"
        );
      }
      await pool.query(
        "CALL sp_paciente_monitor_contacto_guardar(?,?,?,?,?)",
        [idPaciente, fechaContacto, sms, llamada, actualizadoPorUsuarioId]
      );
    }

    const vigentes = await consultarMonitorContactoVigente([idPaciente]);

    return res.json({
      ok: true,
      data: {
        idPaciente,
        ...buildMonitorContactoData(vigentes.get(idPaciente))
      }
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al guardar contacto de monitor");
  }
};
// ============================
// ✍️ GUARDAR FIRMA PACIENTE
// ============================
const guardarFirma = async (req, res) => {
  try {
    const idPaciente = Number(req.body?.idPaciente || 0);
    const imagenBase64 = req.body?.imagenBase64;

    if (!Number.isInteger(idPaciente) || idPaciente <= 0 || !imagenBase64) {
      return badRequest(res, "Datos incompletos");
    }

    const buffer = parsePngBase64(imagenBase64);
    if (!buffer) {
      return badRequest(res, "Formato de firma invalido");
    }

    const [anteriorRows] = await pool.query(
      "SELECT firmaP FROM paciente WHERE idPaciente = ? LIMIT 1",
      [idPaciente]
    );
    const firmaAnterior = String(anteriorRows?.[0]?.firmaP || "").trim();

    const nombre = `firma_${idPaciente}_${Date.now()}.png`;
    const rutaRelativa = `/firmas/${nombre}`;
    await fileStorage.saveFile("firmas", nombre, buffer, "image/png");

    // 💾 guardar ruta en paciente
    await pool.query(
      "UPDATE paciente SET firmaP = ? WHERE idPaciente = ?",
      [rutaRelativa, idPaciente]
    );

    // La firma reemplazada ya no la referencia nadie: se borra en disco y en R2.
    if (firmaAnterior && firmaAnterior !== rutaRelativa) {
      await fileStorage.deleteByPublicPath(firmaAnterior).catch((err) => {
        console.error("[Firma paciente] No se pudo borrar la firma anterior:", err.message);
      });
    }

    res.json({
      ok: true,
      ruta: rutaRelativa
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al guardar firma");
  }
};
// ============================
// 💾 GUARDAR / ACTUALIZAR PACIENTE
// ============================
const obtenerPrintBrandingLogo = async (req, res) => {
  try {
    const logoMeta = await getLatestPrintBrandingLogoMeta();
    if (!logoMeta) {
      return res.json({
        ok: true,
        logoUrl: null
      });
    }

    const cacheBust = Math.floor(logoMeta.mtimeMs);
    return res.json({
      ok: true,
      logoUrl: `/img/docs/${logoMeta.fileName}?v=${cacheBust}`,
      updatedAt: logoMeta.updatedAt
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al obtener logo de impresion");
  }
};

const subirPrintBrandingLogo = async (req, res) => {
  try {
    if (!req.file) {
      return badRequest(res, "Archivo de logo requerido");
    }

    const fileName = String(req.file?.filename || "").trim();
    if (!fileName) {
      return badRequest(res, "No se pudo procesar el nombre del logo");
    }

    await cleanupAlternatePrintBrandingLogos(fileName);
    const logoMeta = await getLatestPrintBrandingLogoMeta();

    return res.json({
      ok: true,
      logoUrl: `/img/docs/${fileName}?v=${Date.now()}`,
      updatedAt: logoMeta?.updatedAt || new Date().toISOString()
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al subir logo de impresion");
  }
};

const listarPrintDocs = async (req, res) => {
  try {
    const docs = await readPrintDocsDirectoryMeta();
    return res.json({
      ok: true,
      data: docs.map((doc) => ({
        fileName: doc.fileName,
        name: doc.fileName,
        size: doc.size,
        updatedAt: doc.updatedAt,
        mtimeMs: doc.mtimeMs,
        url: buildPrintDocUrl(doc.fileName, doc.mtimeMs)
      }))
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al listar documentos PDF");
  }
};

const subirPrintDoc = async (req, res) => {
  try {
    if (!req.file) {
      return badRequest(res, "Archivo PDF requerido");
    }

    const buffer = req.file.buffer;
    if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
      return badRequest(res, "No se pudo procesar el archivo PDF");
    }

    const autoFileName = buildPrintDocAutoFileName(req.file.originalname || "documento.pdf");
    const fullPath = path.join(docsDir, autoFileName);
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
    const stats = await fs.stat(fullPath);

    return res.json({
      ok: true,
      fileName: autoFileName,
      name: autoFileName,
      size: Number(stats.size || buffer.length || 0),
      updatedAt: stats.mtime.toISOString(),
      mtimeMs: Number(stats.mtimeMs || Date.now()),
      url: buildPrintDocUrl(autoFileName, stats.mtimeMs)
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al subir documento PDF");
  }
};

const eliminarPrintDoc = async (req, res) => {
  try {
    const fileName = normalizePrintDocFileName(req.params?.fileName);
    if (!fileName) {
      return badRequest(res, "Nombre de archivo invalido");
    }

    const fullPath = path.join(docsDir, fileName);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      if (err?.code === "ENOENT") {
        return notFound(res, "Documento no encontrado");
      }
      throw err;
    }

    return res.json({ ok: true, fileName });
  } catch (err) {
    return handlePacienteError(res, err, "Error al eliminar documento PDF");
  }
};

const guardarPaciente = async (req, res) => {
  try {
    const p = req.body;
    const idPacienteNum = p?.idPaciente === null || p?.idPaciente === undefined || p?.idPaciente === ""
      ? null
      : Number(p.idPaciente);
    const nombre = String(p?.NombreP || "").trim();

    if (idPacienteNum !== null && (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0)) {
      return badRequest(res, "idPaciente invalido");
    }
    if (!nombre) {
      return badRequest(res, "Nombre de paciente requerido");
    }
    if (p?.fechaRegistroP && !esFechaISOValida(String(p.fechaRegistroP))) {
      return badRequest(res, "fechaRegistroP invalida");
    }
    if (p?.fechaNacimientoP && !esFechaISOValida(String(p.fechaNacimientoP))) {
      return badRequest(res, "fechaNacimientoP invalida");
    }
    if (p?.ultimaVisitaP && !esFechaISOValida(String(p.ultimaVisitaP))) {
      return badRequest(res, "ultimaVisitaP invalida");
    }

    const correoP = String(p?.correoP || "").trim();
    if (correoP && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoP)) {
      return badRequest(res, "correoP invalido");
    }
    if (correoP.length > 40) {
      return badRequest(res, "correoP permite maximo 40 caracteres");
    }

    const [rows] = await pool.query(
      "CALL sp_paciente_guardar_v2(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        idPacienteNum,
        nombre,
        p.direccionP,
        p.telefonoP,
        p.fechaRegistroP,
        p.estadoP ?? 1,
        p.fechaNacimientoP,
        p.recomendadoP,
        p.encargadoP,
        p.motivoConsultaP,
        p.ultimaVisitaP,
        p.duiP,
        p.firmaP || null,
        correoP || null,
        p.tipoMordidaP,
        p.tipoTratamientoP,
        p.endodonciaP,
        p.dienteP,
        p.vitalidadP,
        p.percusionP,
        p.medProvisional,
        p.medTrabajoP,
        p.historiaMedicaP,
        p.historiaOdontologicaP,
        p.examenClinicoP,
        p.examenRadiologicoP,
        p.examenComplementarioP,
        p.tratamientoP,
        p.notasObservacionP
      ]
    );

    res.json({
      ok: true,
      idPaciente: rows[0][0].idPaciente
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al guardar paciente");
  }
};
// ============================
// ➕ CREAR CITA PACIENTE
// ============================
const crearCitaPaciente = async (req, res) => {
  try {
    const {
      idPaciente,
      fecha,
      procedimiento,
      valor,
      abono,
      doctorId
    } = req.body;
    const idPacienteNum = Number(idPaciente || 0);

    const procedimientoTxt = String(procedimiento || "").trim();
    if (!Number.isInteger(idPacienteNum) || idPacienteNum <= 0 || !fecha || !procedimientoTxt) {
      return badRequest(res, "Datos incompletos");
    }
    const errorLongitudProcedimiento = validarLongitudProcedimientoCita(procedimientoTxt);
    if (errorLongitudProcedimiento) {
      return badRequest(res, errorLongitudProcedimiento);
    }
    if (!esFechaISOValida(String(fecha))) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const valorNum = valor === "" || valor === null || valor === undefined
      ? 0
      : Number(valor);
    const abonoNum = abono === "" || abono === null || abono === undefined
      ? 0
      : Number(abono);
    let doctorIdNum = doctorId === "" || doctorId === null || doctorId === undefined
      ? null
      : Number(doctorId);

    if (
      !Number.isFinite(valorNum) ||
      !Number.isFinite(abonoNum) ||
      valorNum < 0 ||
      abonoNum < 0 ||
      (doctorIdNum !== null && (!Number.isInteger(doctorIdNum) || doctorIdNum <= 0))
    ) {
      return badRequest(res, "Datos de cita invalidos");
    }

    const creadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;
    if (req.user?.rol === "Doctor") {
      if (!creadoPorUsuarioId) {
        return res.status(403).json({
          ok: false,
          message: "Usuario no autorizado"
        });
      }

      const doctorVinculado = await obtenerVinculoDoctorPorUsuario(creadoPorUsuarioId);
      if (!doctorVinculado) {
        return res.status(403).json({
          ok: false,
          message: "Doctor no vinculado"
        });
      }

      if (doctorIdNum !== null && doctorIdNum !== doctorVinculado) {
        return res.status(403).json({
          ok: false,
          message: "Solo puede registrar citas con su propio doctor"
        });
      }

      doctorIdNum = doctorVinculado;
    }

    let doctor = null;
    if (doctorIdNum !== null) {
      doctor = await obtenerMetaDoctor(doctorIdNum);
      if (!doctor) {
        return notFound(res, "Doctor no encontrado");
      }
      if (Object.prototype.hasOwnProperty.call(doctor, "estadoD") && doctor.estadoD !== 1) {
        return badRequest(res, "El doctor seleccionado esta inactivo");
      }
    }

    let estadoAutorizacion = ESTADO_AUTORIZACION_PENDIENTE;
    let metodoAutorizacion = null;
    let autorizadoPorUsuarioId = null;

    if (doctorIdNum === null) {
      estadoAutorizacion = ESTADO_AUTORIZACION_OK;
      metodoAutorizacion = METODO_AUTORIZACION_SIN_DOCTOR;
    } else if (esRegistroFisico(doctor.nombreD)) {
      estadoAutorizacion = ESTADO_AUTORIZACION_OK;
      metodoAutorizacion = METODO_AUTORIZACION_FISICO;
    } else if (req.user?.rol === "Doctor" && req.user?.idUsuario) {
      const doctorVinculado = await obtenerVinculoDoctorPorUsuario(req.user.idUsuario);
      if (doctorVinculado && doctorVinculado === doctorIdNum) {
        estadoAutorizacion = ESTADO_AUTORIZACION_OK;
        metodoAutorizacion = METODO_AUTORIZACION_AUTO_DOCTOR;
        autorizadoPorUsuarioId = Number(req.user.idUsuario);
      }
    }

    const [rows] = await pool.query(
      "CALL sp_cita_paciente_crear(?,?,?,?,?,?,?,?,?,?)",
      [
        idPacienteNum,
        fecha,
        procedimientoTxt,
        valorNum,
        abonoNum,
        doctorIdNum,
        creadoPorUsuarioId,
        estadoAutorizacion,
        metodoAutorizacion,
        autorizadoPorUsuarioId
      ]
    );

    res.json({
      ok: true,
      idCitaPaciente: rows[0][0].idCitaPaciente,
      estadoAutorizacion,
      metodoAutorizacion
    });

  } catch (err) {
    if (String(err?.code || "").toUpperCase() === "ER_DATA_TOO_LONG") {
      return badRequest(
        res,
        `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres.`
      );
    }
    return handlePacienteError(res, err, "Error al crear cita");
  }
};
// ============================
// ✏️ ACTUALIZAR CITA PACIENTE
// ============================
const actualizarCitaPaciente = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    const { fecha, procedimiento, valor, abono } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de cita invalido");
    }
    if (!fecha || !procedimiento || valor === undefined || valor === null) {
      return badRequest(res, "Datos incompletos");
    }
    if (!esFechaISOValida(String(fecha))) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const procedimientoTxt = String(procedimiento || "").trim();
    if (!procedimientoTxt) {
      return badRequest(res, "Procedimiento invalido");
    }
    const errorLongitudProcedimiento = validarLongitudProcedimientoCita(procedimientoTxt);
    if (errorLongitudProcedimiento) {
      return badRequest(res, errorLongitudProcedimiento);
    }

    const valorNum = Number(valor);
    const abonoNum = Number(abono ?? 0);

    if (!Number.isFinite(valorNum) || !Number.isFinite(abonoNum) || valorNum < 0 || abonoNum < 0) {
      return badRequest(res, "Valor o abono invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_cita_paciente_actualizar(?,?,?,?,?)",
      [id, fecha, procedimientoTxt, valorNum, abonoNum]
    );

    const out = firstRow(rows);
    if (!out || !out.affectedRows) {
      return notFound(res, "Cita no encontrada");
    }

    res.json({ ok: true });

  } catch (err) {
    if (String(err?.code || "").toUpperCase() === "ER_DATA_TOO_LONG") {
      return badRequest(
        res,
        `El procedimiento permite maximo ${MAX_PROCEDIMIENTO_CITA} caracteres.`
      );
    }
    return handlePacienteError(res, err, "Error al actualizar cita");
  }
};

const eliminarCitaPaciente = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);

    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de cita invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_cita_paciente_eliminar(?)",
      [id]
    );

    const out = firstRow(rows);
    if (!out || !out.affectedRows) {
      return notFound(res, "Cita no encontrada");
    }

    res.json({ ok: true, idCitaPaciente: id });

  } catch (err) {
    return handlePacienteError(res, err, "Error al eliminar cita");
  }
};
// ============================
// 📋 LISTAR CITAS DEL PACIENTE
// ============================
const autorizarCitaPaciente = async (req, res) => {
  try {
    const idCitaPaciente = Number(req.params.id);
    if (!Number.isInteger(idCitaPaciente) || idCitaPaciente <= 0) {
      return badRequest(res, "ID de cita invalido");
    }

    const cita = await obtenerMetaCita(idCitaPaciente);
    if (!cita) {
      return notFound(res, "Cita no encontrada");
    }

    const doctorIdCita = Number(cita.doctorId || 0);
    if (!doctorIdCita) {
      return badRequest(res, "La cita no tiene doctor asignado");
    }

    if (
      textoNormalizado(cita.estadoAutorizacionCP) === textoNormalizado(ESTADO_AUTORIZACION_OK)
      || esRegistroFisico(cita.nombreDoctor)
    ) {
      if (
        esRegistroFisico(cita.nombreDoctor)
        && textoNormalizado(cita.estadoAutorizacionCP) !== textoNormalizado(ESTADO_AUTORIZACION_OK)
      ) {
        await pool.query(
          "CALL sp_cita_paciente_autorizar(?,?,?)",
          [idCitaPaciente, null, METODO_AUTORIZACION_FISICO]
        );
      }

      return res.json({
        ok: true,
        alreadyAuthorized: true,
        estadoAutorizacion: ESTADO_AUTORIZACION_OK,
        metodoAutorizacion: esRegistroFisico(cita.nombreDoctor)
          ? METODO_AUTORIZACION_FISICO
          : (cita.metodoAutorizacionCP || null)
      });
    }

    const ejecutadoPorUsuarioId = Number(req.user?.idUsuario || 0) || null;
    const esDoctorLogueado = req.user?.rol === "Doctor";
    if (esDoctorLogueado && ejecutadoPorUsuarioId) {
      const idDoctorLogueado = await obtenerVinculoDoctorPorUsuario(ejecutadoPorUsuarioId);
      if (idDoctorLogueado && idDoctorLogueado === doctorIdCita) {
        await pool.query(
          "CALL sp_cita_paciente_autorizar(?,?,?)",
          [idCitaPaciente, ejecutadoPorUsuarioId, METODO_AUTORIZACION_AUTO_DOCTOR]
        );

        return res.json({
          ok: true,
          estadoAutorizacion: ESTADO_AUTORIZACION_OK,
          metodoAutorizacion: METODO_AUTORIZACION_AUTO_DOCTOR
        });
      }
    }

    let correo = String(req.body?.correo || "").trim();
    const password = String(req.body?.password || "");
    if (!password) {
      return badRequest(res, "Contrasena del doctor requerida");
    }

    if (!correo) {
      correo = await obtenerCorreoUsuarioDoctorPorIdDoctor(doctorIdCita);
    }

    if (!correo) {
      return badRequest(
        res,
        "No hay correo de usuario vinculado al doctor del procedimiento"
      );
    }

    const doctorUsuario = await authService.login(correo, password);
    if (!doctorUsuario || doctorUsuario.rol !== "Doctor") {
      return res.status(401).json({
        ok: false,
        message: "Credenciales invalidas del doctor"
      });
    }

    const doctorUsuarioId = Number(doctorUsuario.idUsuario || 0);
    if (!doctorUsuarioId) {
      return res.status(401).json({
        ok: false,
        message: "No se pudo validar el usuario doctor"
      });
    }

    const doctorVinculado = await obtenerVinculoDoctorPorUsuario(doctorUsuarioId);
    if (doctorVinculado && doctorVinculado !== doctorIdCita) {
      return res.status(403).json({
        ok: false,
        message: "El doctor autenticado no corresponde al procedimiento"
      });
    }

    await pool.query(
      "CALL sp_cita_paciente_autorizar(?,?,?)",
      [idCitaPaciente, doctorUsuarioId, METODO_AUTORIZACION_VALIDACION]
    );

    return res.json({
      ok: true,
      estadoAutorizacion: ESTADO_AUTORIZACION_OK,
      metodoAutorizacion: METODO_AUTORIZACION_VALIDACION
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al autorizar cita");
  }
};

const listarCitasPaciente = async (req, res) => {
  try {
    const id = Number(req.params?.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, "ID de paciente invalido");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_cita_paciente_listar(?)",
      [id]
    );

    const data = firstResultSet(rows);
    const doctorIds = [...new Set(
      data
        .map(item => Number(item.idDoctor || 0))
        .filter(idDoctor => Number.isInteger(idDoctor) && idDoctor > 0)
    )];

    const correoPorDoctor = new Map();
    if (doctorIds.length > 0) {
      const [usuariosRows] = await queryReadWithRetry(
        `SELECT idDoctor, correoU, idUsuario
         FROM usuario
         WHERE idDoctor IN (?)
         ORDER BY idUsuario ASC`,
        [doctorIds]
      );

      for (const u of usuariosRows || []) {
        const idDoctor = Number(u.idDoctor || 0);
        if (!idDoctor || correoPorDoctor.has(idDoctor)) continue;
        correoPorDoctor.set(idDoctor, String(u.correoU || "").trim());
      }
    }

    const dataConCorreo = data.map(item => ({
      ...item,
      correoDoctor: correoPorDoctor.get(Number(item.idDoctor || 0)) || null
    }));

    res.json({
      ok: true,
      data: dataConCorreo
    });

  } catch (err) {
    return handlePacienteError(res, err, "Error al listar citas");
  }
};

const existePaciente = async (req, res) => {
  try {
    const nombreRaw = String(req.query?.nombre || "").trim();
    const telefonoRaw = String(req.query?.telefono || "").trim();

    if (!nombreRaw) {
      return badRequest(res, "Nombre requerido");
    }

    const nombreNorm = nombreRaw.toLowerCase();
    const telefonoNorm = telefonoRaw.toLowerCase();
    const telefonoDigitos = telefonoRaw.replace(/\D+/g, "");

    const [rows] = await queryReadWithRetry(
      `SELECT idPaciente, NombreP, telefonoP
       FROM paciente
       WHERE LOWER(TRIM(NombreP)) = ?
       ORDER BY idPaciente ASC`,
      [nombreNorm]
    );

    const lista = Array.isArray(rows) ? rows : [];
    let coincidencia = null;
    let matchBy = null;

    if (telefonoRaw) {
      coincidencia = lista.find((p) => {
        const telDbRaw = String(p?.telefonoP || "").trim();
        const telDbNorm = telDbRaw.toLowerCase();
        const telDbDig = telDbRaw.replace(/\D+/g, "");
        const matchRaw = telDbNorm && telDbNorm === telefonoNorm;
        const matchDig = telefonoDigitos && telDbDig && telDbDig === telefonoDigitos;
        return matchRaw || matchDig;
      }) || null;

      if (coincidencia) {
        const telDbRaw = String(coincidencia?.telefonoP || "").trim();
        const telDbNorm = telDbRaw.toLowerCase();
        const telDbDig = telDbRaw.replace(/\D+/g, "");
        const matchRaw = telDbNorm && telDbNorm === telefonoNorm;
        const matchDig = telefonoDigitos && telDbDig && telDbDig === telefonoDigitos;
        matchBy = (matchRaw || matchDig) ? "nombre_y_telefono" : "nombre";
      }
    }

    if (!coincidencia && lista.length > 0) {
      coincidencia = lista[0];
      matchBy = "nombre";
    }

    return res.json({
      ok: true,
      exists: !!coincidencia,
      matchBy,
      data: coincidencia
        ? {
            idPaciente: coincidencia.idPaciente,
            NombreP: coincidencia.NombreP,
            telefonoP: coincidencia.telefonoP
          }
        : null
    });
  } catch (err) {
    return handlePacienteError(res, err, "Error al validar paciente existente");
  }
};

module.exports = {
  buscar,
  existePaciente,
  monitorSeguimiento,
  monitorSeguimientoProximaCita,
  monitorSeguimientoProximasCitas,
  guardarMonitorContacto,
  obtenerPorId,
  obtenerPrintBrandingLogo,
  subirPrintBrandingLogo,
  listarPrintDocs,
  subirPrintDoc,
  eliminarPrintDoc,
  guardarFirma,
  guardarPaciente,
  crearCitaPaciente,
  actualizarCitaPaciente,
  eliminarCitaPaciente,
  autorizarCitaPaciente,
  listarCitasPaciente
};
