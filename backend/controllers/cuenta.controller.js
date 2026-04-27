const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { isValidCuentaItems } = require("../utils/validators");

function redondear2(value) {
  return Math.round(Number(value) * 100) / 100;
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

const DETALLE_CUENTA_DOCTOR_COL_CACHE_TTL_MS = 5 * 60 * 1000;
let detalleCuentaDoctorColCache = {
  value: null,
  checkedAt: 0
};
const DETALLE_CUENTA_MONTO_COL_CACHE_TTL_MS = 5 * 60 * 1000;
let detalleCuentaMontoColsCache = {
  value: null,
  checkedAt: 0
};
const DETALLE_CUENTA_CUENTA_FK_COL_CACHE_TTL_MS = 5 * 60 * 1000;
let detalleCuentaCuentaFkColCache = {
  value: null,
  checkedAt: 0
};

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

async function hasDetalleCuentaDoctorCol(force = false) {
  const now = Date.now();
  if (!force && detalleCuentaDoctorColCache.value !== null) {
    const age = now - Number(detalleCuentaDoctorColCache.checkedAt || 0);
    if (age >= 0 && age < DETALLE_CUENTA_DOCTOR_COL_CACHE_TTL_MS) {
      return !!detalleCuentaDoctorColCache.value;
    }
  }

  const [colRows] = await queryReadWithRetry(
    `SELECT COUNT(*) AS total
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'detallecuenta'
       AND COLUMN_NAME = 'idDoctor'`
  );

  const hasCol = Number(colRows?.[0]?.total || 0) > 0;
  detalleCuentaDoctorColCache = {
    value: hasCol,
    checkedAt: now
  };
  return hasCol;
}

function isUnknownDetalleCuentaMontoColError(err) {
  if (!err) return false;
  const code = String(err?.code || "").toUpperCase();
  const errno = Number(err?.errno || 0);
  if (errno !== 1054 && code !== "ER_BAD_FIELD_ERROR") {
    return false;
  }
  const msg = String(err?.sqlMessage || err?.message || "").toLowerCase();
  return (
    msg.includes("dc.cantidaddc") ||
    msg.includes("dc.cantidadd") ||
    msg.includes("dc.preciounitariodc") ||
    msg.includes("dc.preciod") ||
    msg.includes("dc.subtotaldc") ||
    msg.includes("dc.subtotal") ||
    msg.includes("dc.idcuenta") ||
    msg.includes("dc.idc") ||
    msg.includes("dc.cantidad") ||
    msg.includes("dc.precio")
  );
}

async function getDetalleCuentaMontoCols(force = false) {
  const now = Date.now();
  if (!force && detalleCuentaMontoColsCache.value) {
    const age = now - Number(detalleCuentaMontoColsCache.checkedAt || 0);
    if (age >= 0 && age < DETALLE_CUENTA_MONTO_COL_CACHE_TTL_MS) {
      return detalleCuentaMontoColsCache.value;
    }
  }

  const [rows] = await queryReadWithRetry(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'detallecuenta'
       AND COLUMN_NAME IN (
         'cantidadDC', 'cantidad', 'cantidadD',
         'precioUnitarioDC', 'precio', 'precioD',
         'subTotalDC', 'subtotalDC', 'subTotal', 'subtotal'
       )`
  );
  const fields = new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.COLUMN_NAME || "")));
  const cantidadCol = fields.has("cantidadDC")
    ? "cantidadDC"
    : fields.has("cantidad")
      ? "cantidad"
      : fields.has("cantidadD")
        ? "cantidadD"
        : null;
  const precioCol = fields.has("precioUnitarioDC")
    ? "precioUnitarioDC"
    : fields.has("precio")
      ? "precio"
      : fields.has("precioD")
        ? "precioD"
        : null;
  const subtotalCol = fields.has("subTotalDC")
    ? "subTotalDC"
    : fields.has("subtotalDC")
      ? "subtotalDC"
      : fields.has("subTotal")
        ? "subTotal"
        : fields.has("subtotal")
          ? "subtotal"
          : null;

  if (!cantidadCol || (!subtotalCol && !precioCol)) {
    throw new Error(
      "No se encontraron columnas de monto en detallecuenta"
    );
  }

  const value = { cantidadCol, precioCol, subtotalCol };
  detalleCuentaMontoColsCache = {
    value,
    checkedAt: now
  };
  return value;
}

async function getDetalleCuentaCuentaFkCol(force = false) {
  const now = Date.now();
  if (!force && detalleCuentaCuentaFkColCache.value) {
    const age = now - Number(detalleCuentaCuentaFkColCache.checkedAt || 0);
    if (age >= 0 && age < DETALLE_CUENTA_CUENTA_FK_COL_CACHE_TTL_MS) {
      return detalleCuentaCuentaFkColCache.value;
    }
  }

  const [rows] = await queryReadWithRetry(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'detallecuenta'
       AND COLUMN_NAME IN ('idCuenta', 'idC')`
  );
  const fields = new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.COLUMN_NAME || "")));
  const col = fields.has("idCuenta")
    ? "idCuenta"
    : fields.has("idC")
      ? "idC"
      : null;

  if (!col) {
    throw new Error("No se encontro columna de relacion con cuenta en detallecuenta (idCuenta/idC)");
  }

  detalleCuentaCuentaFkColCache = {
    value: col,
    checkedAt: now
  };
  return col;
}

function quoteSqlIdentifier(identifier) {
  return `\`${String(identifier || "").replace(/`/g, "``")}\``;
}

function handleCuentaError(res, err, fallbackMessage) {
  if (isTransientDbError(err)) {
    return res.status(503).json({
      ok: false,
      message: "Base de datos temporalmente no disponible. Intente de nuevo."
    });
  }
  return serverError(res, err, fallbackMessage);
}

function normalizarFormaPago(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  if (!raw) return null;
  const map = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    igs: "IGS",
    transferencia: "Transferencia"
  };
  return map[raw] || null;
}

function isLegacyStoredProcedureArgsError(err) {
  if (!err) return false;
  if (Number(err?.errno || 0) === 1318) return true;
  if (String(err?.code || "").toUpperCase() === "ER_SP_WRONG_NO_OF_ARGS") return true;
  const msg = String(err?.sqlMessage || err?.message || "").toLowerCase();
  return msg.includes("incorrect number of arguments");
}

async function queryReporteMensualPacientesSP({
  anio,
  mesNumero,
  idServicio,
  formaPago,
  idDoctor,
  requireDoctorFilter = false
}) {
  try {
    return await queryReadWithRetry(
      "CALL sp_cuenta_reporte_mensual_pacientes(?, ?, ?, ?, ?)",
      [anio, mesNumero, idServicio, formaPago, idDoctor]
    );
  } catch (err) {
    if (isUnknownDetalleCuentaMontoColError(err)) {
      return queryReporteMensualPacientesDirect({
        anio,
        mesNumero,
        idServicio,
        formaPago,
        idDoctor
      });
    }

    if (!isLegacyStoredProcedureArgsError(err)) {
      throw err;
    }

    if (requireDoctorFilter || idDoctor !== null) {
      const migrationError = new Error(
        "Falta migracion en base de datos: sp_cuenta_reporte_mensual_pacientes con filtro por doctor"
      );
      migrationError.isDoctorReportMigrationError = true;
      throw migrationError;
    }

    try {
      return await queryReadWithRetry(
        "CALL sp_cuenta_reporte_mensual_pacientes(?, ?, ?, ?)",
        [anio, mesNumero, idServicio, formaPago]
      );
    } catch (legacyErr) {
      if (isUnknownDetalleCuentaMontoColError(legacyErr)) {
        return queryReporteMensualPacientesDirect({
          anio,
          mesNumero,
          idServicio,
          formaPago,
          idDoctor
        });
      }
      throw legacyErr;
    }
  }
}

async function queryReporteMensualPacientesDirect({
  anio,
  mesNumero,
  idServicio,
  formaPago,
  idDoctor
}) {
  const detalleCuentaFkCol = await getDetalleCuentaCuentaFkCol();
  const { cantidadCol, precioCol, subtotalCol } = await getDetalleCuentaMontoCols();
  const detalleCuentaFkSql = `dc.${quoteSqlIdentifier(detalleCuentaFkCol)}`;
  const cantidadSql = `IFNULL(dc.${quoteSqlIdentifier(cantidadCol)}, 0)`;
  const montoSql = subtotalCol
    ? `IFNULL(dc.${quoteSqlIdentifier(subtotalCol)}, 0)`
    : `(${cantidadSql} * IFNULL(dc.${quoteSqlIdentifier(precioCol)}, 0))`;

  const where = [
    "YEAR(c.fechaC) = ?",
    "MONTH(c.fechaC) = ?",
    "(? IS NULL OR dc.idServicio = ?)",
    "(? IS NULL OR TRIM(?) = '' OR LOWER(TRIM(c.FormaPagoC)) = LOWER(TRIM(?)))"
  ];
  const params = [
    anio,
    mesNumero,
    idServicio,
    idServicio,
    formaPago,
    formaPago,
    formaPago
  ];

  if (idDoctor !== null) {
    where.push("dc.idDoctor = ?");
    params.push(idDoctor);
  }

  const sql = `
    SELECT
      p.idPaciente AS idPaciente,
      p.NombreP AS nombrePaciente,
      SUM(${cantidadSql}) AS cantidadPaciente,
      ROUND(SUM(${montoSql}), 2) AS montoPaciente
    FROM cuenta c
    INNER JOIN paciente p ON p.idPaciente = c.idPaciente
    INNER JOIN detallecuenta dc ON ${detalleCuentaFkSql} = c.idCuenta
    WHERE ${where.join("\n      AND ")}
    GROUP BY p.idPaciente, p.NombreP
    ORDER BY montoPaciente DESC, cantidadPaciente DESC, p.NombreP ASC
  `;

  return queryReadWithRetry(sql, params);
}

const crear = async (req, res) => {
  const { idPaciente, formaPago, fecha, items } = req.body;

  if (!idPaciente || !formaPago || !esFechaISOValida(fecha) || !isValidCuentaItems(items)) {
    return badRequest(res, "Datos incompletos o items invalidos");
  }

  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const itemsNormalizados = items.map((i) => ({
      idServicio: Number(i.idServicio),
      cantidad: Number(i.cantidad),
      precio: redondear2(i.precio)
    }));

    const total = redondear2(itemsNormalizados.reduce(
      (acc, i) => acc + Number(i.cantidad) * Number(i.precio),
      0
    ));

    const [cuentaRes] = await conn.query(
      "CALL sp_cuenta_create(?, ?, ?)",
      [idPaciente, formaPago, total]
    );

    const idCuenta = firstRow(cuentaRes)?.idCuenta;
    if (!idCuenta) {
      throw new Error("No se pudo obtener idCuenta");
    }

    await conn.query(
      "UPDATE cuenta SET fechaC = ? WHERE idCuenta = ?",
      [fecha, idCuenta]
    );

    for (const item of itemsNormalizados) {
      await conn.query(
        "CALL sp_detallecuenta_create(?, ?, ?, ?)",
        [
          idCuenta,
          item.idServicio,
          item.cantidad,
          item.precio
        ]
      );
    }

    await conn.commit();
    res.json({ ok: true, idCuenta });

  } catch (err) {
    if (conn) {
      await conn.rollback();
    }
    return handleCuentaError(res, err, "Error al crear cuenta");
  } finally {
    if (conn) {
      conn.release();
    }
  }
};
// LISTAR CUENTAS POR FECHA
const listarPorFecha = async (req, res) => {
  try {
    const fecha = String(req.query?.fecha || "").trim();

    if (!fecha) {
      return badRequest(res, "Fecha requerida");
    }
    if (!esFechaISOValida(fecha)) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_cuenta_listar_por_fecha(?)",
      [fecha]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });

  } catch (err) {
    return handleCuentaError(res, err, "Error al listar cuentas");
  }
};

const actualizarDoctorCuenta = async (req, res) => {
  try {
    const idCuenta = Number(req.params?.id || 0);
    if (!Number.isInteger(idCuenta) || idCuenta <= 0) {
      return badRequest(res, "ID de cuenta invalido");
    }

    const idDoctorRaw = req.body?.idDoctor;
    const idDoctor = (idDoctorRaw === "" || idDoctorRaw === null || idDoctorRaw === undefined)
      ? null
      : Number(idDoctorRaw);

    if (idDoctor !== null && (!Number.isInteger(idDoctor) || idDoctor <= 0)) {
      return badRequest(res, "idDoctor invalido");
    }

    const [cuentaRows] = await queryReadWithRetry(
      "SELECT idCuenta FROM cuenta WHERE idCuenta = ? LIMIT 1",
      [idCuenta]
    );
    if (!Array.isArray(cuentaRows) || !cuentaRows[0]) {
      return notFound(res, "Cuenta no encontrada");
    }

    if (idDoctor !== null) {
      const [doctorRows] = await queryReadWithRetry(
        "SELECT idDoctor FROM doctor WHERE idDoctor = ? LIMIT 1",
        [idDoctor]
      );
      if (!Array.isArray(doctorRows) || !doctorRows[0]) {
        return badRequest(res, "Doctor no encontrado");
      }
    }

    const hasDoctorCol = await hasDetalleCuentaDoctorCol();
    if (!hasDoctorCol) {
      return badRequest(
        res,
        "Falta migracion en base de datos: detallecuenta.idDoctor"
      );
    }

    await pool.query(
      "CALL sp_cuenta_asignar_doctor_por_cuenta(?, ?)",
      [idCuenta, idDoctor]
    );

    res.json({
      ok: true,
      idCuenta,
      idDoctor
    });
  } catch (err) {
    return handleCuentaError(res, err, "Error al asignar doctor en cuenta");
  }
};

const listarReporteMensual = async (req, res) => {
  try {
    const mes = String(req.query?.mes || "").trim();
    const idServicioRaw = String(req.query?.idServicio || "").trim();
    const mesMatch = mes.match(/^(\d{4})-(0[1-9]|1[0-2])$/);

    if (!mesMatch) {
      return badRequest(res, "mes invalido (formato requerido: YYYY-MM)");
    }

    const anio = Number(mesMatch[1]);
    const mesNumero = Number(mesMatch[2]);
    let idServicio = null;
    let filtroServicio = null;

    if (idServicioRaw) {
      idServicio = Number(idServicioRaw);
      if (!Number.isInteger(idServicio) || idServicio <= 0) {
        return badRequest(res, "idServicio invalido");
      }

      const [servicioRows] = await queryReadWithRetry(
        "SELECT idServicio, nombreS FROM servicio WHERE idServicio = ? LIMIT 1",
        [idServicio]
      );
      const servicio = Array.isArray(servicioRows) ? servicioRows[0] : null;
      if (!servicio) {
        return badRequest(res, "Servicio no encontrado");
      }
      filtroServicio = {
        idServicio: Number(servicio.idServicio),
        nombre: String(servicio.nombreS || "")
      };
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_cuenta_reporte_mensual(?, ?, ?)",
      [anio, mesNumero, idServicio]
    );

    const data = firstResultSet(rows).map((row) => ({
      idServicio: Number(row.idServicio),
      tratamiento: String(row.tratamiento || ""),
      cantidadTotalMes: Number(row.cantidadTotalMes || 0),
      montoTotalMes: Number(row.montoTotalMes || 0)
    }));

    const totales = data.reduce(
      (acc, row) => {
        acc.cantidadTotalMes += Number(row.cantidadTotalMes || 0);
        acc.montoTotalMes += Number(row.montoTotalMes || 0);
        return acc;
      },
      { cantidadTotalMes: 0, montoTotalMes: 0 }
    );

    res.json({
      ok: true,
      mes,
      filtroServicio,
      data,
      totales
    });
  } catch (err) {
    return handleCuentaError(res, err, "Error al listar reporte mensual");
  }
};

const listarReporteMensualPacientes = async (req, res) => {
  try {
    const mes = String(req.query?.mes || "").trim();
    const idServicioRaw = String(req.query?.idServicio || "").trim();
    const formaPagoRaw = String(req.query?.formaPago || "").trim();
    const idDoctorRaw = String(req.query?.idDoctor || "").trim();
    const mesMatch = mes.match(/^(\d{4})-(0[1-9]|1[0-2])$/);

    if (!mesMatch) {
      return badRequest(res, "mes invalido (formato requerido: YYYY-MM)");
    }

    let idServicio = null;
    let servicio = null;
    if (idServicioRaw) {
      idServicio = Number(idServicioRaw);
      if (!Number.isInteger(idServicio) || idServicio <= 0) {
        return badRequest(res, "idServicio invalido");
      }

      const [servicioRows] = await queryReadWithRetry(
        "SELECT idServicio, nombreS FROM servicio WHERE idServicio = ? LIMIT 1",
        [idServicio]
      );
      servicio = Array.isArray(servicioRows) ? servicioRows[0] : null;
      if (!servicio) {
        return badRequest(res, "Servicio no encontrado");
      }
    }

    const anio = Number(mesMatch[1]);
    const mesNumero = Number(mesMatch[2]);
    let formaPago = null;
    if (formaPagoRaw) {
      formaPago = normalizarFormaPago(formaPagoRaw);
      if (!formaPago) {
        return badRequest(
          res,
          "formaPago invalido (permitidos: efectivo, tarjeta, igs, transferencia)"
        );
      }
    }

    let idDoctor = null;
    let doctor = null;
    if (idDoctorRaw) {
      idDoctor = Number(idDoctorRaw);
      if (!Number.isInteger(idDoctor) || idDoctor <= 0) {
        return badRequest(res, "idDoctor invalido");
      }

      const hasDoctorCol = await hasDetalleCuentaDoctorCol();
      if (!hasDoctorCol) {
        return badRequest(
          res,
          "Falta migracion en base de datos: detallecuenta.idDoctor"
        );
      }

      const [doctorRows] = await queryReadWithRetry(
        "SELECT idDoctor, nombreD FROM doctor WHERE idDoctor = ? LIMIT 1",
        [idDoctor]
      );
      doctor = Array.isArray(doctorRows) ? doctorRows[0] : null;
      if (!doctor) {
        return badRequest(res, "Doctor no encontrado");
      }
    }

    const [rows] = await queryReporteMensualPacientesSP({
      anio,
      mesNumero,
      idServicio,
      formaPago,
      idDoctor,
      requireDoctorFilter: idDoctor !== null
    });

    const data = firstResultSet(rows).map((row) => ({
      idPaciente: Number(row.idPaciente),
      nombrePaciente: String(row.nombrePaciente || ""),
      cantidadPaciente: Number(row.cantidadPaciente || 0),
      montoPaciente: Number(row.montoPaciente || 0)
    }));

    const [rowsGlobal] = await queryReporteMensualPacientesSP({
      anio,
      mesNumero,
      idServicio: null,
      formaPago: null,
      idDoctor: null,
      requireDoctorFilter: false
    });

    const dataGlobal = firstResultSet(rowsGlobal).map((row) => ({
      idPaciente: Number(row.idPaciente),
      cantidadPaciente: Number(row.cantidadPaciente || 0),
      montoPaciente: Number(row.montoPaciente || 0)
    }));

    const totales = data.reduce(
      (acc, row) => {
        acc.cantidadTotalMes += Number(row.cantidadPaciente || 0);
        acc.montoTotalMes += Number(row.montoPaciente || 0);
        return acc;
      },
      { pacientesUnicos: data.length, cantidadTotalMes: 0, montoTotalMes: 0 }
    );

    const totalesGlobalMes = dataGlobal.reduce(
      (acc, row) => {
        acc.cantidadTotalMes += Number(row.cantidadPaciente || 0);
        acc.montoTotalMes += Number(row.montoPaciente || 0);
        return acc;
      },
      { pacientesUnicos: dataGlobal.length, cantidadTotalMes: 0, montoTotalMes: 0 }
    );

    res.json({
      ok: true,
      mes,
      filtroServicio: servicio
        ? {
            idServicio: Number(servicio.idServicio),
            nombre: String(servicio.nombreS || "")
          }
        : null,
      filtroFormaPago: formaPago
        ? { valor: formaPago }
        : null,
      filtroDoctor: doctor
        ? {
            idDoctor: Number(doctor.idDoctor),
            nombre: String(doctor.nombreD || "")
          }
        : null,
      data,
      totales,
      totalesGlobalMes
    });
  } catch (err) {
    if (err?.isDoctorReportMigrationError) {
      return badRequest(res, err.message || "Falta migracion para reporte mensual por doctor");
    }
    return handleCuentaError(res, err, "Error al listar reporte mensual por pacientes");
  }
};

const buscarPorMes = async (req, res) => {
  try {
    const fecha = String(req.query?.fecha || "").trim();
    const qRaw = String(req.query?.q || "").trim();

    if (!fecha) {
      return badRequest(res, "Fecha requerida");
    }
    if (!esFechaISOValida(fecha)) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }
    if (qRaw.length < 1) {
      return res.json({ ok: true, data: [] });
    }

    const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const desde = `${m[1]}-${m[2]}-01`;
    const ultimoDia = String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, "0");
    const hasta = `${m[1]}-${m[2]}-${ultimoDia}`;
    const qLike = `%${qRaw.toLowerCase()}%`;

    const { cantidadCol } = await getDetalleCuentaMontoCols();
    const detalleCuentaFkCol = await getDetalleCuentaCuentaFkCol();
    const cantidadSql = `IFNULL(dc.${quoteSqlIdentifier(cantidadCol)}, 0)`;
    const detalleCuentaFkSql = `dc.${quoteSqlIdentifier(detalleCuentaFkCol)}`;
    const detalleCuentaFkSql2 = `dc2.${quoteSqlIdentifier(detalleCuentaFkCol)}`;
    const detalleCuentaFkSql3 = `dc3.${quoteSqlIdentifier(detalleCuentaFkCol)}`;
    const hasDoctorCol = await hasDetalleCuentaDoctorCol();
    const sql = hasDoctorCol
      ? `
        SELECT
          c.idCuenta,
          p.NombreP AS nombrePaciente,
          ROUND(IFNULL(c.totalC, 0), 2) AS totalC,
          c.FormaPagoC,
          DATE_FORMAT(c.fechaC, '%Y-%m-%d') AS fechaC,
          SUM(${cantidadSql}) AS cantidadTotal,
          GROUP_CONCAT(
            CONCAT(
              IFNULL(s.nombreS, ''),
              CASE
                WHEN ${cantidadSql} > 1 THEN CONCAT(' x', CAST(${cantidadSql} AS UNSIGNED))
                ELSE ''
              END
            )
            ORDER BY s.nombreS
            SEPARATOR ', '
          ) AS procedimientos,
          CASE
            WHEN COUNT(DISTINCT COALESCE(dc.idDoctor, 0)) = 1
            THEN NULLIF(MAX(COALESCE(dc.idDoctor, 0)), 0)
            ELSE NULL
          END AS idDoctorCuenta,
          CASE
            WHEN COUNT(DISTINCT COALESCE(dc.idDoctor, 0)) = 1
            THEN COALESCE(MAX(d.nombreD), '')
            ELSE ''
          END AS nombreDoctorCuenta
        FROM cuenta c
        INNER JOIN paciente p ON p.idPaciente = c.idPaciente
        INNER JOIN detallecuenta dc ON ${detalleCuentaFkSql} = c.idCuenta
        LEFT JOIN servicio s ON s.idServicio = dc.idServicio
        LEFT JOIN doctor d ON d.idDoctor = dc.idDoctor
        WHERE c.fechaC BETWEEN ? AND ?
          AND c.fechaC <> ?
          AND (
            LOWER(TRIM(IFNULL(p.NombreP, ''))) LIKE ?
            OR EXISTS (
              SELECT 1
              FROM detallecuenta dc2
              INNER JOIN servicio s2 ON s2.idServicio = dc2.idServicio
              WHERE ${detalleCuentaFkSql2} = c.idCuenta
                AND LOWER(TRIM(IFNULL(s2.nombreS, ''))) LIKE ?
            )
            OR EXISTS (
              SELECT 1
              FROM detallecuenta dc3
              INNER JOIN doctor d3 ON d3.idDoctor = dc3.idDoctor
              WHERE ${detalleCuentaFkSql3} = c.idCuenta
                AND LOWER(TRIM(IFNULL(d3.nombreD, ''))) LIKE ?
            )
          )
        GROUP BY c.idCuenta, p.NombreP, c.totalC, c.FormaPagoC, c.fechaC
        ORDER BY c.fechaC DESC, c.idCuenta DESC
        LIMIT 250
      `
      : `
        SELECT
          c.idCuenta,
          p.NombreP AS nombrePaciente,
          ROUND(IFNULL(c.totalC, 0), 2) AS totalC,
          c.FormaPagoC,
          DATE_FORMAT(c.fechaC, '%Y-%m-%d') AS fechaC,
          SUM(${cantidadSql}) AS cantidadTotal,
          GROUP_CONCAT(
            CONCAT(
              IFNULL(s.nombreS, ''),
              CASE
                WHEN ${cantidadSql} > 1 THEN CONCAT(' x', CAST(${cantidadSql} AS UNSIGNED))
                ELSE ''
              END
            )
            ORDER BY s.nombreS
            SEPARATOR ', '
          ) AS procedimientos,
          NULL AS idDoctorCuenta,
          '' AS nombreDoctorCuenta
        FROM cuenta c
        INNER JOIN paciente p ON p.idPaciente = c.idPaciente
        INNER JOIN detallecuenta dc ON ${detalleCuentaFkSql} = c.idCuenta
        LEFT JOIN servicio s ON s.idServicio = dc.idServicio
        WHERE c.fechaC BETWEEN ? AND ?
          AND c.fechaC <> ?
          AND (
            LOWER(TRIM(IFNULL(p.NombreP, ''))) LIKE ?
            OR EXISTS (
              SELECT 1
              FROM detallecuenta dc2
              INNER JOIN servicio s2 ON s2.idServicio = dc2.idServicio
              WHERE ${detalleCuentaFkSql2} = c.idCuenta
                AND LOWER(TRIM(IFNULL(s2.nombreS, ''))) LIKE ?
            )
          )
        GROUP BY c.idCuenta, p.NombreP, c.totalC, c.FormaPagoC, c.fechaC
        ORDER BY c.fechaC DESC, c.idCuenta DESC
        LIMIT 250
      `;

    const params = hasDoctorCol
      ? [desde, hasta, fecha, qLike, qLike, qLike]
      : [desde, hasta, fecha, qLike, qLike];
    const [rows] = await queryReadWithRetry(sql, params);
    const data = (Array.isArray(rows) ? rows : []).map((row) => ({
      idCuenta: Number(row.idCuenta || 0),
      nombrePaciente: String(row.nombrePaciente || ""),
      totalC: Number(row.totalC || 0),
      FormaPagoC: String(row.FormaPagoC || ""),
      cantidadTotal: Number(row.cantidadTotal || 0),
      procedimientos: String(row.procedimientos || ""),
      idDoctorCuenta: row.idDoctorCuenta == null ? null : Number(row.idDoctorCuenta || 0),
      nombreDoctorCuenta: String(row.nombreDoctorCuenta || ""),
      fechaC: String(row.fechaC || "")
    }));

    res.json({
      ok: true,
      fechaBase: fecha,
      desde,
      hasta,
      data
    });
  } catch (err) {
    return handleCuentaError(res, err, "Error al buscar cuentas del mes");
  }
};

const eliminar = async (req, res) => {
  try {
    const idCuenta = Number(req.params?.id || 0);
    if (!Number.isInteger(idCuenta) || idCuenta <= 0) {
      return badRequest(res, "ID de cuenta requerido");
    }

    const [rowsCuenta] = await queryReadWithRetry(
      "SELECT idCuenta FROM cuenta WHERE idCuenta = ? LIMIT 1",
      [idCuenta]
    );
    if (!Array.isArray(rowsCuenta) || !rowsCuenta[0]) {
      return notFound(res, "Cuenta no encontrada");
    }

    await pool.query(
      "CALL sp_cuenta_eliminar(?)",
      [idCuenta]
    );

    res.json({
      ok: true,
      message: "Cuenta eliminada correctamente"
    });

  } catch (err) {
    return handleCuentaError(res, err, "Error al eliminar cuenta");
  }
};

// PARTE DE DESCUENTOS
const crearDescuento = async (req, res) => {
  try {
    const { nombre, fecha, cantidad } = req.body;
    const nombreSafe = String(nombre || "").trim();
    const cantidadNum = Number(cantidad);
    if (!nombreSafe || !fecha || cantidad == null) {
      return badRequest(res, "Datos incompletos");
    }
    if (!esFechaISOValida(String(fecha || "").trim())) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      return badRequest(res, "Cantidad invalida");
    }

    const [rows] = await pool.query(
      "CALL sp_descuento_crear(?, ?, ?)",
      [nombreSafe, fecha, cantidadNum]
    );

    res.json({
      ok: true,
      idDescuento: firstRow(rows)?.idDescuento
    });

  } catch (err) {
    return handleCuentaError(res, err, "Error al crear descuento");
  }
};
const listarDescuentoPorFecha = async (req, res) => {
  try {
    const fecha = String(req.query?.fecha || "").trim();
    if (!fecha) {
      return badRequest(res, "Fecha requerida");
    }
    if (!esFechaISOValida(fecha)) {
      return badRequest(res, "Fecha invalida, use YYYY-MM-DD");
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_descuento_listar_por_fecha(?)",
      [fecha]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });

  } catch (err) {
    return handleCuentaError(res, err, "Error al listar descuentos");
  }
};
const eliminarDescuento = async (req, res) => {
  try {
    const idDescuento = Number(req.params?.id || 0);
    if (!Number.isInteger(idDescuento) || idDescuento <= 0) {
      return badRequest(res, "ID de descuento requerido");
    }

    const [rowsDescuento] = await queryReadWithRetry(
      "SELECT idDescuento FROM descuento WHERE idDescuento = ? LIMIT 1",
      [idDescuento]
    );
    if (!Array.isArray(rowsDescuento) || !rowsDescuento[0]) {
      return notFound(res, "Descuento no encontrado");
    }

    await pool.query(
      "CALL sp_descuento_eliminar(?)",
      [idDescuento]
    );

    res.json({ ok: true });

  } catch (err) {
    return handleCuentaError(res, err, "Error al eliminar descuento");
  }
};


module.exports = {
  crear,
  listarPorFecha,
  buscarPorMes,
  actualizarDoctorCuenta,
  listarReporteMensual,
  listarReporteMensualPacientes,
  eliminar,
  crearDescuento,
  listarDescuentoPorFecha,
  eliminarDescuento
};
