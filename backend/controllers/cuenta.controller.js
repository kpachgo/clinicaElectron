const pool = require("../config/db");
const { badRequest, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { isValidCuentaItems } = require("../utils/validators");

function redondear2(value) {
  return Math.round(Number(value) * 100) / 100;
}

const crear = async (req, res) => {
  const { idPaciente, formaPago, items } = req.body;

  if (!idPaciente || !formaPago || !isValidCuentaItems(items)) {
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


module.exports = { crear, listarPorFecha,eliminar,crearDescuento, listarDescuentoPorFecha, eliminarDescuento };
