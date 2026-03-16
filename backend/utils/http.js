function badRequest(res, message = "Datos incompletos") {
  return res.status(400).json({
    ok: false,
    message
  });
}

function notFound(res, message = "No encontrado") {
  return res.status(404).json({
    ok: false,
    message
  });
}

function serverError(res, err, message = "Error interno del servidor") {
  console.error(err);
  return res.status(500).json({
    ok: false,
    message
  });
}

module.exports = {
  badRequest,
  notFound,
  serverError
};
