function isValidId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

function isPositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
}

function isNonNegativeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCuentaItems(items) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.every((item) =>
      item &&
      isValidId(item.idServicio) &&
      isPositiveNumber(item.cantidad) &&
      isNonNegativeNumber(item.precio)
    )
  );
}

module.exports = {
  isValidId,
  isPositiveNumber,
  isNonNegativeNumber,
  isNonEmptyString,
  isValidCuentaItems
};
