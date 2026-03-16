const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { isValidId } = require("../utils/validators");

// =======================
// LISTAR
// =======================
const listar = async (req, res) => {
  try {
    const [rows] = await pool.query("CALL sp_servicio_listar()");
    res.json({ ok: true, data: firstResultSet(rows) });
  } catch (err) {
    return serverError(res, err, "Error al listar servicios");
  }
};

// =======================
// CREAR
// =======================
const crear = async (req, res) => {
  try {
    const { nombre, precio } = req.body;

    if (!nombre || precio == null) {
      return badRequest(res, "Datos incompletos");
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
    return serverError(res, err, "Error al crear servicio");
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
    return serverError(res, err, "Error al actualizar servicio");
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
    return serverError(res, err, "Error al eliminar servicio");
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

    const [rows] = await pool.query(
      "CALL sp_servicio_buscar_ligero(?)",
      [q]
    );

    res.json({ ok: true, data: rows[0] });

  } catch (err) {
    return serverError(res, err, "Error al buscar servicios");
  }
};

// ✅ EXPORTAR TODO
module.exports = {
  listar,
  crear,
  actualizar,
  eliminar,
  buscarLigero
};
