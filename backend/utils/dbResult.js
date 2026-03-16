function firstResultSet(rows) {
  return Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : [];
}

function firstRow(rows) {
  const data = firstResultSet(rows);
  return data[0] || null;
}

module.exports = {
  firstResultSet,
  firstRow
};
