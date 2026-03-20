const pool = require("../config/db");
const { badRequest, serverError } = require("../utils/http");
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
    return serverError(res, err, "Error al crear cuenta");
  } finally {
    if (conn) {
      conn.release();
    }
  }
};
// LISTAR CUENTAS POR FECHA
const listarPorFecha = async (req, res) => {
  try {
    const { fecha } = req.query;

    if (!fecha) {
      return badRequest(res, "Fecha requerida");
    }

    const [rows] = await pool.query(
      "CALL sp_cuenta_listar_por_fecha(?)",
      [fecha]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });

  } catch (err) {
    return serverError(res, err, "Error al listar cuentas");
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

    const [cuentaRows] = await pool.query(
      "SELECT idCuenta FROM cuenta WHERE idCuenta = ? LIMIT 1",
      [idCuenta]
    );
    if (!Array.isArray(cuentaRows) || !cuentaRows[0]) {
      return badRequest(res, "Cuenta no encontrada");
    }

    if (idDoctor !== null) {
      const [doctorRows] = await pool.query(
        "SELECT idDoctor FROM doctor WHERE idDoctor = ? LIMIT 1",
        [idDoctor]
      );
      if (!Array.isArray(doctorRows) || !doctorRows[0]) {
        return badRequest(res, "Doctor no encontrado");
      }
    }

    const [colRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'detallecuenta'
         AND COLUMN_NAME = 'idDoctor'`
    );
    const hasDoctorCol = Number(colRows?.[0]?.total || 0) > 0;
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
    return serverError(res, err, "Error al asignar doctor en cuenta");
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

      const [servicioRows] = await pool.query(
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

    const [rows] = await pool.query(
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
    return serverError(res, err, "Error al listar reporte mensual");
  }
};

const listarReporteMensualPacientes = async (req, res) => {
  try {
    const mes = String(req.query?.mes || "").trim();
    const idServicioRaw = String(req.query?.idServicio || "").trim();
    const mesMatch = mes.match(/^(\d{4})-(0[1-9]|1[0-2])$/);

    if (!mesMatch) {
      return badRequest(res, "mes invalido (formato requerido: YYYY-MM)");
    }

    const idServicio = Number(idServicioRaw);
    if (!Number.isInteger(idServicio) || idServicio <= 0) {
      return badRequest(res, "idServicio es requerido y debe ser entero positivo");
    }

    const [servicioRows] = await pool.query(
      "SELECT idServicio, nombreS FROM servicio WHERE idServicio = ? LIMIT 1",
      [idServicio]
    );
    const servicio = Array.isArray(servicioRows) ? servicioRows[0] : null;
    if (!servicio) {
      return badRequest(res, "Servicio no encontrado");
    }

    const anio = Number(mesMatch[1]);
    const mesNumero = Number(mesMatch[2]);

    const [rows] = await pool.query(
      "CALL sp_cuenta_reporte_mensual_pacientes(?, ?, ?)",
      [anio, mesNumero, idServicio]
    );

    const data = firstResultSet(rows).map((row) => ({
      idPaciente: Number(row.idPaciente),
      nombrePaciente: String(row.nombrePaciente || ""),
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

    res.json({
      ok: true,
      mes,
      filtroServicio: {
        idServicio: Number(servicio.idServicio),
        nombre: String(servicio.nombreS || "")
      },
      data,
      totales
    });
  } catch (err) {
    return serverError(res, err, "Error al listar reporte mensual por pacientes");
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return badRequest(res, "ID de cuenta requerido");
    }

    await pool.query(
      "CALL sp_cuenta_eliminar(?)",
      [id]
    );

    res.json({
      ok: true,
      message: "Cuenta eliminada correctamente"
    });

  } catch (err) {
    return serverError(res, err, "Error al eliminar cuenta");
  }
};

// PARTE DE DESCUENTOS
const crearDescuento = async (req, res) => {
  try {
    const { nombre, fecha, cantidad } = req.body;
    if (!nombre || !fecha || cantidad == null) {
      return badRequest(res, "Datos incompletos");
    }

    const [rows] = await pool.query(
      "CALL sp_descuento_crear(?, ?, ?)",
      [nombre, fecha, cantidad]
    );

    res.json({
      ok: true,
      idDescuento: firstRow(rows)?.idDescuento
    });

  } catch (err) {
    return serverError(res, err, "Error al crear descuento");
  }
};
const listarDescuentoPorFecha = async (req, res) => {
  try {
    const { fecha } = req.query;
    if (!fecha) {
      return badRequest(res, "Fecha requerida");
    }

    const [rows] = await pool.query(
      "CALL sp_descuento_listar_por_fecha(?)",
      [fecha]
    );

    res.json({
      ok: true,
      data: firstResultSet(rows)
    });

  } catch (err) {
    return serverError(res, err, "Error al listar descuentos");
  }
};
const eliminarDescuento = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return badRequest(res, "ID de descuento requerido");
    }

    await pool.query(
      "CALL sp_descuento_eliminar(?)",
      [id]
    );

    res.json({ ok: true });

  } catch (err) {
    return serverError(res, err, "Error al eliminar descuento");
  }
};


module.exports = {
  crear,
  listarPorFecha,
  actualizarDoctorCuenta,
  listarReporteMensual,
  listarReporteMensualPacientes,
  eliminar,
  crearDescuento,
  listarDescuentoPorFecha,
  eliminarDescuento
};
