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
- La deteccion se hace cada vez que se consulta/ejecuta backup, no solo al cargar el backend.
- No es requisito instalar MySQL antes que ClinicaElectron; si MySQL se instala con la app abierta, cerrar y abrir la app para refrescar proceso/PATH.
- En Windows tambien se intenta detectar MySQL Server instalado en `C:\Program Files\MySQL\MySQL Server 8.x\bin`.
- En Linux/macOS tambien se intentan rutas comunes:
  - `/usr/bin`
  - `/usr/local/bin`
  - `/opt/homebrew/bin`
  - `/usr/local/mysql/bin`
- Variables opcionales:
  - `CLINICA_MYSQLDUMP_PATH`
  - `CLINICA_MYSQL_CLI_PATH`
- Si faltan herramientas, la UI muestra error claro.
- El dump usa opciones para MySQL administrado/Railway:
  - `--no-tablespaces`
  - `--set-gtid-purged=OFF`
- Antes de cifrar, el SQL temporal elimina `DEFINER` de procedimientos/triggers para que la restauracion no dependa del usuario/host original.

## Temporales
- SQL temporal se genera en `storagePaths.tempDir`.
- Ruta usual Windows:
  - `C:\ProgramData\ClinicaElectron\tmp`
- El SQL temporal se elimina en `finally`.
- El archivo cifrado temporal generado para descarga tambien se elimina despues de enviarse.

## Protocolo de prueba local
- Atajos:
  - `Ctrl + Shift + C`: cambiar conexion de base de datos desde login.
  - `Ctrl + Shift + Q`: abrir copias de seguridad dentro del sistema con sesion Administrador.
- Verificar en el modal de copias el texto `Destino actual: host:puerto / base`.
- Crear la copia desde una base funcional con:
  - licencia activa,
  - usuario Administrador conocido,
  - misma contrasena que se usara para restaurar esa copia.
- La base destino no debe ser una base vacia sin licencia:
  - la ruta `/api/backup` exige licencia activa antes de permitir restaurar,
  - el backup v2 esta ligado criptograficamente a la licencia activa,
  - las tablas `licencias` y `licencia_sesiones` no se restauran desde la copia.
- Para probar restauracion en otra base local:
  1. Crear/importar una base destino funcional con la misma licencia activa.
  2. Cambiar conexion con `Ctrl + Shift + C` hacia esa base y guardar/reiniciar.
  3. Iniciar sesion como Administrador en esa base destino.
  4. Abrir copias con `Ctrl + Shift + Q`.
  5. Confirmar que `Destino actual` muestra la base destino.
  6. Restaurar el `.clinicbackup` escribiendo `RESTAURAR`.
  7. Validar pacientes, agenda, cobros, doctores, servicios y procedimientos.

## Resultado de prueba local
- Para restaurar sobre una base nueva/blanca, primero debe existir una base funcional minima con:
  - misma licencia activa,
  - usuario Administrador valido,
  - roles requeridos por el sistema.
- La restauracion sobre una base que ya tiene datos funciona como reemplazo de las tablas incluidas en el backup:
  - no duplica registros respaldados,
  - mantiene fuera las tablas de licencia excluidas,
  - deja la instalacion destino con la licencia local existente.
- Interpretacion importante:
  - no es un merge selectivo por registro,
  - `mysqldump --add-drop-table` hace que las tablas respaldadas se eliminen/recreen antes de cargar datos,
  - los datos de tablas excluidas o no incluidas no se reemplazan por el backup.

## Error MySQL 1449 por DEFINER
- Sintoma:
  - `Error Code: 1449. The user specified as a definer ('root'@'%') does not exist`.
- Causa:
  - Las rutinas fueron importadas con `CREATE DEFINER=\`root\`@\`%\`` y ese usuario no existe en el MySQL destino.
- Correccion recomendada:
  - Reimportar rutinas sin `DEFINER`.
  - Usar `backend/sql/routines.sql` actualizado o `backend/sql/routines_clean.sql`.
- Evitar como solucion principal:
  - Crear artificialmente `root`@`%` solo para satisfacer el definer, porque abre acceso remoto innecesario si no se configura con cuidado.
