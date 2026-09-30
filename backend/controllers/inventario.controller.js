const pool = require("../config/db");
const { badRequest, notFound, serverError } = require("../utils/http");
const { firstResultSet, firstRow } = require("../utils/dbResult");
const { isValidId } = require("../utils/validators");

// ============================
// INVENTARIO: CATALOGO + PEDIDOS
// ============================
// Solo catalogo y pedidos (sin existencias, minimos, proveedor ni precios).
// Pedido: Borrador (se edita y se borra) -> Generado (se puede seguir editando si falto algo;
// sigue Generado). Un generado solo lo borra un Administrador.
const MIGRACION_INVENTARIO = "2026-09-30_inventario_catalogo_pedidos.sql";
const CATEGORIAS = ["Odontologia", "Ortodoncia", "Instrumento"];
const MAX_NOMBRE = 150;
const MAX_UNIDAD = 30;
const MAX_NOTA_PEDIDO = 500;
const MAX_NOTA_RENGLON = 200;
const MAX_RENGLONES = 300;
const MAX_CANTIDAD = 100000;

function esErrorFaltaMigracion(err) {
  return err?.code === "ER_NO_SUCH_TABLE" || err?.code === "ER_SP_DOES_NOT_EXIST";
}

// SIGNAL SQLSTATE '45000' de los SP: el mensaje ya viene listo para el usuario.
function esErrorDeRegla(err) {
  return err?.sqlState === "45000";
}

function handleInventarioError(res, err, fallbackMessage) {
  if (esErrorFaltaMigracion(err)) {
    console.error(`[inventario] Falta aplicar ${MIGRACION_INVENTARIO}:`, err?.message);
    return res.status(503).json({
      ok: false,
      message: `Falta actualizar la base de datos (${MIGRACION_INVENTARIO})`
    });
  }
  if (esErrorDeRegla(err)) {
    return badRequest(res, err.sqlMessage || err.message || fallbackMessage);
  }
  return serverError(res, err, fallbackMessage);
}

function textoLimitado(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function validarArticulo(body) {
  const categoria = String(body?.categoria || "").trim();
  const nombre = String(body?.nombre ?? "").trim();
  const unidad = String(body?.unidad ?? "").trim();

  if (!CATEGORIAS.includes(categoria)) return { error: "Categoria invalida" };
  if (!nombre) return { error: "El nombre no puede estar vacio" };
  if (nombre.length > MAX_NOMBRE) return { error: `El nombre no puede superar ${MAX_NOMBRE} caracteres` };
  if (unidad.length > MAX_UNIDAD) return { error: `La unidad no puede superar ${MAX_UNIDAD} caracteres` };
  return { categoria, nombre, unidad };
}

function mapArticulo(row) {
  return {
    idArticulo: Number(row.idArticulo),
    categoria: row.categoriaA,
    nombre: String(row.nombreA || ""),
    unidad: row.unidadA || ""
  };
}

// Las fechas vienen en la hora del servidor MySQL (Railway esta en UTC; una BD local en la hora
// del equipo). Se mide su desfase contra UTC y se mandan en ISO UTC: el navegador las muestra
// en la hora local de quien mira. Cache de 1 hora (por si el servidor cambia de horario).
const OFFSET_TTL_MS = 60 * 60 * 1000;
let dbOffsetCache = { minutos: 0, hasta: 0 };

async function obtenerOffsetDbMinutos() {
  if (Date.now() < dbOffsetCache.hasta) return dbOffsetCache.minutos;
  const [rows] = await pool.query("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS minutos");
  // Redondeo a 15 min: TIMESTAMPDIFF puede dar 1 min de menos si el segundo cambia entre llamadas.
  const minutos = Math.round(Number(rows?.[0]?.minutos || 0) / 15) * 15;
  dbOffsetCache = { minutos, hasta: Date.now() + OFFSET_TTL_MS };
  return minutos;
}

function fechaDbAIsoUtc(value, offsetMin) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(value || ""));
  if (!m) return null;
  const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetMin * 60000;
  return new Date(utcMs).toISOString();
}

function mapPedido(row, offsetMin = 0) {
  return {
    idPedido: Number(row.idPedido),
    estado: row.estadoP,
    nota: row.notaP || "",
    creadoEn: fechaDbAIsoUtc(row.creadoEn, offsetMin),
    generadoEn: fechaDbAIsoUtc(row.generadoEn, offsetMin),
    creadoPor: row.creadoPor || null,
    generadoPor: row.generadoPor || null,
    totalRenglones: Number(row.totalRenglones || 0)
  };
}

function mapRenglon(row) {
  return {
    idDetalle: Number(row.idDetalle),
    idArticulo: row.idArticulo ? Number(row.idArticulo) : null,
    categoria: row.categoriaD || "",
    descripcion: String(row.descripcionD || ""),
    cantidad: Number(row.cantidadD || 0),
    unidad: row.unidadD || "",
    nota: row.notaD || ""
  };
}

// Renglones del body -> lista validada. El nombre/categoria se copia al pedido (historial).
function validarRenglones(items) {
  if (!Array.isArray(items)) return { error: "Renglones invalidos" };
  if (items.length > MAX_RENGLONES) return { error: `El pedido no puede superar ${MAX_RENGLONES} renglones` };

  const renglones = [];
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i] || {};
    const descripcion = String(it.descripcion ?? "").trim();
    const cantidad = Number(it.cantidad);
    const categoria = String(it.categoria || "").trim();

    if (!descripcion) return { error: `El renglon ${i + 1} no tiene descripcion` };
    if (descripcion.length > MAX_NOMBRE) return { error: `La descripcion del renglon ${i + 1} es muy larga` };
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > MAX_CANTIDAD) {
      return { error: `Cantidad invalida en "${descripcion}"` };
    }
    if (categoria && !CATEGORIAS.includes(categoria)) return { error: `Categoria invalida en "${descripcion}"` };

    renglones.push({
      idArticulo: isValidId(it.idArticulo) ? Number(it.idArticulo) : null,
      categoria: categoria || null,
      descripcion,
      cantidad,
      unidad: textoLimitado(it.unidad, MAX_UNIDAD),
      nota: textoLimitado(it.nota, MAX_NOTA_RENGLON)
    });
  }
  return { renglones };
}

// =======================
// CATALOGO
// =======================
const listarArticulos = async (req, res) => {
  try {
    const [rows] = await pool.query("CALL sp_inv_articulo_listar()");
    res.json({ ok: true, data: firstResultSet(rows).map(mapArticulo) });
  } catch (err) {
    return handleInventarioError(res, err, "Error al listar el catalogo");
  }
};

const crearArticulo = async (req, res) => {
  try {
    const v = validarArticulo(req.body);
    if (v.error) return badRequest(res, v.error);

    const [rows] = await pool.query("CALL sp_inv_articulo_crear(?,?,?)", [v.categoria, v.nombre, v.unidad]);
    res.json({ ok: true, idArticulo: Number(firstRow(rows)?.idArticulo || 0) });
  } catch (err) {
    return handleInventarioError(res, err, "Error al crear el articulo");
  }
};

const actualizarArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return badRequest(res, "ID de articulo invalido");
    const v = validarArticulo(req.body);
    if (v.error) return badRequest(res, v.error);

    const [rows] = await pool.query("CALL sp_inv_articulo_actualizar(?,?,?,?)", [Number(id), v.categoria, v.nombre, v.unidad]);
    if (Number(firstRow(rows)?.filasAfectadas || 0) === 0) {
      // ROW_COUNT = 0 tambien cuando no cambio nada: se confirma que exista.
      const [existe] = await pool.query("SELECT 1 FROM inv_articulo WHERE idArticulo = ? AND activoA = 1 LIMIT 1", [Number(id)]);
      if (!existe?.length) return notFound(res, "Articulo no encontrado");
    }
    res.json({ ok: true });
  } catch (err) {
    return handleInventarioError(res, err, "Error al actualizar el articulo");
  }
};

const eliminarArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return badRequest(res, "ID de articulo invalido");

    const [rows] = await pool.query("CALL sp_inv_articulo_eliminar(?)", [Number(id)]);
    if (Number(firstRow(rows)?.filasAfectadas || 0) === 0) return notFound(res, "Articulo no encontrado");
    res.json({ ok: true });
  } catch (err) {
    return handleInventarioError(res, err, "Error al eliminar el articulo");
  }
};

// =======================
// PEDIDOS
// =======================
const listarPedidos = async (req, res) => {
  try {
    const [rows] = await pool.query("CALL sp_inv_pedido_listar()");
    const offsetMin = await obtenerOffsetDbMinutos();
    res.json({ ok: true, data: firstResultSet(rows).map((row) => mapPedido(row, offsetMin)) });
  } catch (err) {
    return handleInventarioError(res, err, "Error al listar pedidos");
  }
};

async function leerPedido(db, idPedido) {
  const [rows] = await db.query("CALL sp_inv_pedido_listar()");
  const row = firstResultSet(rows).find((p) => Number(p.idPedido) === Number(idPedido));
  if (!row) return null;
  const [det] = await db.query("CALL sp_inv_pedido_detalle_listar(?)", [Number(idPedido)]);
  const offsetMin = await obtenerOffsetDbMinutos();
  return { ...mapPedido(row, offsetMin), renglones: firstResultSet(det).map(mapRenglon) };
}

const obtenerPedido = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return badRequest(res, "ID de pedido invalido");

    const pedido = await leerPedido(pool, id);
    if (!pedido) return notFound(res, "Pedido no encontrado");
    res.json({ ok: true, data: pedido });
  } catch (err) {
    return handleInventarioError(res, err, "Error al obtener el pedido");
  }
};

// Crea (POST, sin id) o reemplaza (PUT /:id) un borrador completo: nota + renglones.
// Con generar = true lo cierra en la misma transaccion.
async function guardarPedido(req, res, idPedidoParam) {
  const nota = String(req.body?.nota ?? "").trim();
  if (nota.length > MAX_NOTA_PEDIDO) return badRequest(res, `La nota no puede superar ${MAX_NOTA_PEDIDO} caracteres`);
  const v = validarRenglones(req.body?.renglones);
  if (v.error) return badRequest(res, v.error);
  const generar = req.body?.generar === true;
  if (generar && v.renglones.length === 0) return badRequest(res, "Agrega al menos un articulo antes de generar el pedido");

  const usuarioId = Number(req.user?.idUsuario || 0) || null;
  let conn = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query("CALL sp_inv_pedido_guardar(?,?,?)", [idPedidoParam || 0, nota, usuarioId]);
    const idPedido = Number(firstRow(rows)?.idPedido || 0);
    if (!idPedido) throw new Error("No se obtuvo el id del pedido");

    await conn.query("CALL sp_inv_pedido_detalle_limpiar(?)", [idPedido]);
    for (let i = 0; i < v.renglones.length; i += 1) {
      const r = v.renglones[i];
      await conn.query(
        "CALL sp_inv_pedido_detalle_agregar(?,?,?,?,?,?,?,?)",
        [idPedido, r.idArticulo || 0, r.categoria, r.descripcion, r.cantidad, r.unidad, r.nota, i + 1]
      );
    }

    if (generar) {
      await conn.query("CALL sp_inv_pedido_generar(?,?)", [idPedido, usuarioId]);
    }

    await conn.commit();
    const pedido = await leerPedido(pool, idPedido);
    res.json({ ok: true, idPedido, data: pedido });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch { /* ignore rollback failures */ }
    }
    return handleInventarioError(res, err, "Error al guardar el pedido");
  } finally {
    if (conn) conn.release();
  }
}

const crearPedido = (req, res) => guardarPedido(req, res, 0);

const actualizarPedido = (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return badRequest(res, "ID de pedido invalido");
  return guardarPedido(req, res, Number(id));
};

const eliminarPedido = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return badRequest(res, "ID de pedido invalido");

    const [rows] = await pool.query("SELECT estadoP FROM inv_pedido WHERE idPedido = ? LIMIT 1", [Number(id)]);
    const pedido = rows?.[0];
    if (!pedido) return notFound(res, "Pedido no encontrado");
    if (pedido.estadoP !== "Borrador" && req.user?.rol !== "Administrador") {
      return res.status(403).json({ ok: false, message: "Solo un Administrador puede eliminar un pedido ya generado" });
    }

    await pool.query("CALL sp_inv_pedido_eliminar(?)", [Number(id)]);
    res.json({ ok: true });
  } catch (err) {
    return handleInventarioError(res, err, "Error al eliminar el pedido");
  }
};

module.exports = {
  listarArticulos,
  crearArticulo,
  actualizarArticulo,
  eliminarArticulo,
  listarPedidos,
  obtenerPedido,
  crearPedido,
  actualizarPedido,
  eliminarPedido
};
