# Almacenamiento de archivos: local / respaldo / nube (Cloudflare R2)

Estado: implementado 2026-09-23. Probado e2e contra bucket real `clinicasonsonate` (script en scratchpad, no en repo).

## Modos (Ctrl+Shift+C -> seccion "Almacenamiento de archivos")
| Modo | Donde se escribe lo nuevo | Nube |
|---|---|---|
| `local` (default) | ProgramData | no se usa |
| `respaldo` | ProgramData | cada N dias: sube lo nuevo y baja lo que falte en disco |
| `nube` | R2 directo (fotos, firmas paciente, firma/sello doctor) | unica copia; docs PDF y logo siguen en disco y se respaldan |

- El modo solo decide donde se ESCRIBE. La LECTURA siempre busca en disco y, si falta, en R2 (si hay credenciales). Cambiar de modo en cualquier sentido no rompe fotos.
- Mismas rutas en ambos lados: `/fotos/x.jpg` <-> objeto `fotos/x.jpg`; `/firmas/` -> `firmas/`; `/img/docs/` -> `img-docs/`; `/docs/` -> `docs/`. En MySQL no cambio nada.
- Una foto "rota" casi siempre = esta en R2 y no hay credenciales/internet, o no esta en ningun lado (el respaldo la reporta como "no encontrada").

## Reglas de costo (pedidas por el usuario)
1. Comprimir antes de guardar: sharp, lado max 2560 px, JPEG q82 mozjpeg, rota por EXIF, PNG transparente -> fondo blanco. En TODOS los modos. Si sharp falla o no esta en el paquete, se guarda el original (no falla la subida).
2. Nunca ListObjects para mostrar: la lista sale de MySQL. `listObjects` del cliente solo lo usa `scripts/r2-check.js`.
3. Sin `StorageClass` (R2 usa STANDARD). Nunca STANDARD_IA.
4. Borrar registro = borrar archivo en disco (incl. legacy) y en R2. Tambien: firma de paciente reemplazada, sello con otra extension, y foto cuyo INSERT en BD fallo.

## Archivos
- `backend/services/cloudStorage/r2Client.js`: cliente S3/SigV4 propio (fetch + crypto, sin SDK). Timeout 60 s.
- `backend/services/cloudStorage/cloudStorageConfig.service.js`: modo, frecuencia (1-30 dias) y credenciales. Cifrado en `system/electrondump/storage.dat` con la misma clave local que la conexion BD (`CLINICA_DB_CONFIG_KEY`, la da Electron via safeStorage). Sin clave o archivo danado -> modo local. Solo dev: `CLINICA_R2_ENV_FILE=<archivo .env con R2_*>` evita el archivo cifrado.
- `backend/services/cloudStorage/fileStorage.service.js`: `saveFile`, `deleteFile`, `deleteByPublicPath`, `cloudFallback` (middleware despues de `express.static` en `server.js`). Fotos/firmas se sirven con `Cache-Control: immutable` (nombre con timestamp); img/docs con `no-cache` (firma/sello de doctor reusan nombre).
- `backend/services/cloudStorage/imageCompression.js`: compresion con sharp (carga perezosa).
- `backend/services/cloudStorage/cloudBackup.service.js`: respaldo + programador (primer chequeo a los 2 min, luego cada hora; corre si paso la frecuencia desde el ultimo respaldo OK). Uno a la vez, 4 transferencias en paralelo.
- `backend/services/cloudStorage/cloudBackupState.js`: `config/cloud-backup-state.json` = manifiesto de lo subido (size+mtime por objeto), ultimo resultado. Si cambia cuenta/bucket se reinicia.
- `backend/controllers/cloudStorage.controller.js` + rutas en `routes/dbConnectionConfig.routes.js`: `GET /api/configuracion-db/almacenamiento`, `POST .../probar`, `.../guardar`, `.../respaldar`. Todas con `requireConfigSession` (misma sesion de Ctrl+Shift+C).
- UI: `renderStorageSection` en `frontend/js/login.js`, estilos `.db-config-storage` en `frontend/css/login.css`.

## Respaldo (que hace cada corrida)
- Subida (modos respaldo y nube): recorre fotos, firmas, img-docs, docs (y carpetas legacy `frontend/...`) y sube lo que no este en el manifiesto. En modo nube esto migra lo viejo de ProgramData.
- Bajada (solo modo respaldo): toma rutas de MySQL (`fotopaciente.rutaFP`, `paciente.firmaP`, `doctor.FirmaD`, `doctor.SelloD`); las que no estan en disco se descargan de R2; si tampoco estan en R2 -> "no encontrados" (primeros 20 nombres en el informe).
- Manual: boton "Respaldar ahora" (en modo local con credenciales solo sube).
- Guardar con modo respaldo/nube exige que la prueba de conexion pase (sube/lee/borra un objeto `_prueba-conexion/...`).

## Credenciales R2
- Por clinica: un bucket y un token R2 "Object Read & Write" limitado a ese bucket (Access Key ID + Secret; el Account ID sale del endpoint). Nunca el token de cuenta.
- `backend/cloud/` (credenciales temporales de desarrollo) esta en `.gitignore` y excluido del instalador (`!cloud{,/**}` en extraResources de backend).

## Build
- sharp 0.34.5 en `backend/package.json`. Binarios precompilados N-API (`@img/sharp-<plataforma>`), no depende del ABI de Electron: `afterPack` solo recompila better-sqlite3. Verificado `require("sharp")` con `ELECTRON_RUN_AS_NODE` en Electron 37.10.3.
- Pendiente validar un instalador Windows real y el build Linux de GitHub Actions con sharp dentro.

## Pendientes
- Docs PDF (`docs/`) no estan en MySQL: se listan con `readdir` de la carpeta (`readPrintDocsDirectoryMeta` en `paciente.controller.js`). Por eso siempre viven en disco. Para que puedan ser "solo nube" hay que registrarlos en una tabla.
- Logo de impresion (`print_logo.*`) siempre en disco (su meta se lee con `fs.stat`). Si una PC nueva no lo tiene, el respaldo no lo baja (no esta en MySQL).
- Radiografias: usan la misma compresion que las fotos (2560 px, q82). Si se necesita mas resolucion, separar perfil de compresion.
- Validar instalador Windows y build Linux con sharp.
