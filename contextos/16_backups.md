# Sistema de Copias de Seguridad

## Alcance
- Modulo oculto global para crear y restaurar copias cifradas de la base MySQL.
- Atajo: `Ctrl + Shift + Q`.
- Solo rol `Administrador`.
- No respalda imagenes, firmas, sellos, PDFs ni otros archivos multimedia.

## Frontend
- Archivo principal: `frontend/js/backup.js`.
- Estilos: `frontend/css/backup.css`.
- Carga desde `frontend/index.html`.
- UI:
  - modal oculto `Copias de seguridad`.
  - accion `Crear copia`.
  - accion `Restaurar copia`.
  - restauracion exige seleccionar `.clinicbackup`, contrasena y escribir `RESTAURAR`.

## Backend
- Ruta base: `/api/backup`.
- Montada en `backend/server.js` con `licenciaMiddleware.requireLicensedAccess`.
- Rutas:
  - `GET /api/backup/status`
  - `POST /api/backup/crear`
  - `POST /api/backup/restaurar`
- Todas usan:
  - `auth.middleware.js`
  - `role.middleware.js` con `Administrador`.
- Cada operacion valida la contrasena actual del administrador contra `usuario.passwordU`.

## Cifrado portable
- El backup final usa extension `.clinicbackup`.
- Formato actual nuevo: `v2`.
- Formato interno v2:
  - magic header binario minimo,
  - version,
  - parametros publicos del KDF,
  - salt, IV y tag GCM,
  - payload cifrado.
- La metadata descriptiva (`app`, fecha, fingerprint de licencia, tablas excluidas) viaja cifrada dentro del payload, no en JSON visible.
- KDF:
  - `crypto.scrypt`
  - salt aleatorio por backup.
- La clave de cifrado v2 se deriva con:
  - contrasena del Administrador,
  - secreto derivado de la licencia activa,
  - salt aleatorio.
- Cifrado:
  - `AES-256-GCM`
  - IV aleatorio por backup.
  - tag GCM para integridad.
- Portabilidad:
  - el archivo puede restaurarse en otra PC solo si tiene la misma licencia activa y la misma contrasena usada al crear la copia.
  - si la contrasena cambio despues de crear la copia, esa copia requiere la contrasena usada al momento de crearla.
  - backups legacy `v1` aun pueden leerse, pero no tienen amarre criptografico a licencia porque ese dato no existia.

## Licencia
- Las tablas de licencia no se incluyen en el dump:
  - `licencias`
  - `licencia_sesiones`
- El backup no puede activar el sistema por si solo.
- La restauracion mantiene la licencia activa de la instalacion destino.
- Si la licencia actual no coincide con la usada al crear un backup v2, el descifrado falla antes de ejecutar SQL.

## Herramientas MySQL
- Creacion usa `mysqldump`.
- Restauracion usa `mysql`.
- Se detectan desde PATH por defecto.
- Variables opcionales:
  - `CLINICA_MYSQLDUMP_PATH`
  - `CLINICA_MYSQL_CLI_PATH`
- Si faltan herramientas, la UI muestra error claro.

## Temporales
- SQL temporal se genera en `storagePaths.tempDir`.
- Ruta usual Windows:
  - `C:\ProgramData\ClinicaElectron\tmp`
- El SQL temporal se elimina en `finally`.
- El archivo cifrado temporal generado para descarga tambien se elimina despues de enviarse.
