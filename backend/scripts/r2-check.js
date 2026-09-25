// Prueba de conexion con Cloudflare R2: subir, leer, listar y borrar un archivo de prueba.
// Uso: node backend/scripts/r2-check.js [ruta-al-archivo.env]
// Por defecto lee C:\ProgramData\ClinicaElectron\config\r2.env (o equivalente segun SO).
// Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const storagePaths = require("../config/storagePaths");
const { createR2Client } = require("../services/cloudStorage/r2Client");

const envFile = process.argv[2] || path.join(storagePaths.configDir, "r2.env");
if (!fs.existsSync(envFile)) {
  console.error(`No existe el archivo de credenciales: ${envFile}`);
  process.exit(1);
}
const env = dotenv.parse(fs.readFileSync(envFile));

function mask(value) {
  const v = String(value || "");
  return v.length > 8 ? `${v.slice(0, 4)}...${v.slice(-4)}` : "(vacio)";
}

async function step(label, fn) {
  process.stdout.write(`- ${label}... `);
  try {
    const result = await fn();
    console.log("OK");
    return result;
  } catch (err) {
    console.log(`FALLO\n    ${err.message}`);
    throw err;
  }
}

(async () => {
  console.log(`Credenciales: ${envFile}`);
  console.log(`  cuenta: ${mask(env.R2_ACCOUNT_ID)}  access key: ${mask(env.R2_ACCESS_KEY_ID)}  bucket: ${env.R2_BUCKET || "(vacio)"}`);

  const client = createR2Client({
    accountId: String(env.R2_ACCOUNT_ID || "").trim(),
    accessKeyId: String(env.R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY || "").trim(),
    bucket: String(env.R2_BUCKET || "").trim()
  });

  try {
    const buckets = await client.listBuckets();
    console.log(`- Buckets de la cuenta (token Admin): ${buckets.join(", ") || "(ninguno)"}`);
  } catch (err) {
    console.log(`- Listar buckets no permitido con este token (normal si esta limitado a un bucket): ${err.code}`);
  }

  if (!client.bucket) {
    console.error("Falta R2_BUCKET para probar lectura/escritura.");
    process.exit(1);
  }

  const key = `_prueba-conexion/${Date.now()}.txt`;
  const contenido = `ClinicaElectron prueba R2 ${new Date().toISOString()}`;
  try {
    await step(`Acceso al bucket "${client.bucket}"`, () => client.headBucket());
    await step(`Subir ${key}`, () => client.putObject(key, contenido, "text/plain"));
    const leido = await step("Descargar y comparar", async () => {
      const buf = await client.getObject(key);
      if (buf.toString("utf8") !== contenido) throw new Error("El contenido descargado no coincide");
      return buf;
    });
    await step("Listar prefijo", async () => {
      const keys = await client.listObjects("_prueba-conexion/");
      if (!keys.includes(key)) throw new Error("El archivo no aparece en el listado");
    });
    await step("Borrar archivo de prueba", () => client.deleteObject(key));
    console.log(`\nConexion R2 OK (${leido.length} bytes ida y vuelta).`);
  } catch {
    console.log("\nLa prueba fallo. Revise credenciales, nombre del bucket y permisos del token (Object Read & Write).");
    process.exit(1);
  }
})();
