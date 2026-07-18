const mysql = require("mysql2/promise");
const dbConnectionConfig = require("../services/dbConnectionConfig.service");

const pool = mysql.createPool(dbConnectionConfig.buildMysqlOptions(undefined, { allowInvalid: true }));

module.exports = pool;
