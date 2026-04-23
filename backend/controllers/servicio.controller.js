const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { isValidId } = require("../utils/validators");

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

function handleServicioError(res, err, fallbackMessage) {
  if (isTransientDbError(err)) {
    return res.status(503).json({
      ok: false,
      message: "Base de datos temporalmente no disponible. Intente de nuevo."
    });
  }
  return serverError(res, err, fallbackMessage);
}

// =======================
// LISTAR
// =======================
const listar = async (req, res) => {
  try {
    const [rows] = await queryReadWithRetry("CALL sp_servicio_listar()");
    res.json({ ok: true, data: firstResultSet(rows) });
  } catch (err) {
    return handleServicioError(res, err, "Error al listar servicios");
  }
};

// =======================
// LISTAR PRECIOS (SOLO LECTURA PARA VISTAS CLINICAS)
// =======================
const listarPrecios = async (req, res) => {
  try {
    const [rows] = await queryReadWithRetry("CALL sp_servicio_listar()");
    const data = firstResultSet(rows).map((row) => ({
      idServicio: row?.idServicio,
      nombreS: row?.nombreS,
      precioS: row?.precioS
    }));
    res.json({ ok: true, data });
  } catch (err) {
    return handleServicioError(res, err, "Error al listar precios de servicios");
  }
};

// =======================
// CREAR
// =======================
const crear = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || "").trim();
    const precio = Number(req.body?.precio);

    if (!nombre) {
      return badRequest(res, "Nombre invalido");
    }
    if (!Number.isFinite(precio) || precio < 0) {
      return badRequest(res, "Precio invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_servicio_create(?, ?)",
      [nombre, precio]
    );

    res.json({
      ok: true,
      idServicio: firstRow(rows)?.idServicio
    });

  } catch (err) {
    return handleServicioError(res, err, "Error al crear servicio");
  }
};

// =======================
// ACTUALIZAR
// =======================
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return badRequest(res, "ID invalido");
    }

    const keys = Object.keys(req.body || {});
    if (keys.length !== 1) {
      return badRequest(res, "Debe enviar un solo campo");
    }

    const campo = keys[0];
    const valor = req.body[campo];

    if (campo !== "nombre" && campo !== "precio") {
      return badRequest(res, "Campo invalido");
    }

    const [existsRows] = await queryReadWithRetry(
      "SELECT idServicio FROM servicio WHERE idServicio = ? LIMIT 1",
      [id]
    );
    if (!Array.isArray(existsRows) || existsRows.length === 0) {
      return notFound(res, "Servicio no encontrado");
    }

    if (campo === "nombre") {
      const nombre = String(valor || "").trim();
      if (!nombre) {
        return badRequest(res, "Nombre invalido");
      }

      await pool.query(
        "CALL sp_servicio_update_nombre(?, ?)",
        [id, nombre]
      );
    } else {
      const precio = Number(valor);
      if (!Number.isFinite(precio) || precio < 0) {
        return badRequest(res, "Precio invalido");
      }

      await pool.query(
        "CALL sp_servicio_update_precio(?, ?)",
        [id, precio]
      );
    }

    res.json({ ok: true });

  } catch (err) {
    return handleServicioError(res, err, "Error al actualizar servicio");
  }
};

// =======================
// ELIMINAR
// =======================
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return badRequest(res, "ID invalido");
    }

    const [rows] = await pool.query(
      "CALL sp_servicio_delete(?)",
      [id]
    );

    const data = firstResultSet(rows);
    const filasAfectadas = Number(data?.[0]?.filasAfectadas || 0);
    if (filasAfectadas <= 0) {
      return notFound(res, "Servicio no encontrado");
    }

    return res.json({ ok: true });
  } catch (err) {
    if (Number(err?.errno || 0) === 1451) {
      return badRequest(
        res,
        "No se puede eliminar el servicio porque esta asociado a cuentas existentes"
      );
    }
    return handleServicioError(res, err, "Error al eliminar servicio");
  }
};

// =======================
// 🔍 BUSCAR LIGERO (COBRO)
// =======================
const buscarLigero = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (q.length < 2) {
      return res.json({ ok: true, data: [] });
    }

    const [rows] = await queryReadWithRetry(
      "CALL sp_servicio_buscar_ligero(?)",
      [q]
    );

    res.json({ ok: true, data: rows[0] });

  } catch (err) {
    return handleServicioError(res, err, "Error al buscar servicios");
  }
};

// ✅ EXPORTAR TODO
module.exports = {
  listar,
  listarPrecios,
  crear,
  actualizar,
  eliminar,
  buscarLigero
};
