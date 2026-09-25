# Vista Doctores

## Estandar visual compartido
- Esta vista adopta el patron visual reutilizable:
  - Toolbar: `ui-toolbar`, `ui-control`, `ui-toolbar-btn`.
  - Tabla compacta: `ui-table-wrap-compact`, `ui-table-compact`.
  - Acciones de fila: `ui-action-btn` (icon-only).
- UX tablas 2026-08-01:
  - tablas principal y `Pendientes por autorizar` migradas al patron compacto unificado,
  - contenedor con borde completo y radio 12px,
  - encabezado sticky uppercase de 10px,
  - filas base de ~34px con padding 5px/7px y zebra blanco/gris suave,
  - colores controlados por tokens `--doctor-table-*` para compatibilidad con `dark`, `vampire` y `princess`,
  - filas con miniaturas de firma/sello pueden crecer sobre 34px por contenido visual.
- Iconos Heroicons inline via `window.__uiIcons` (`frontend/js/uiIcons.js`), sin dependencias externas.
- Vista actualizada con mejoras de robustez en frontend y validaciones extra en backend.

## Frontend
- Archivo: `frontend/js/doctor.js`.
- Funciones clave:
  - listado de doctores,
  - filtro por texto (`#doctor-search`, por nombre),
  - registro de doctor,
  - captura de firma en canvas o carga de firma desde archivo de imagen,
  - subida de sello,
  - reemplazo de firma/sello propio para usuario `Doctor`,
  - cambio de contrasena del usuario doctor logueado,
  - cambio de estado (solo doctor vinculado),
  - pendientes de autorizacion rapida para usuario `Doctor`,
  - vista modal de firma/sello.
- Toolbar:
  - `Registrar Doctor` (texto + icono `plus`) solo para `Administrador` y `Recepcion`.
  - `Cambiar contrasena` solo para `Doctor`.
- Tabla:
  - columnas: `Nombre`, `Telefono`, `Estado`, `Firma`, `Sello`, `Acciones`.
  - estado visual con chip `Activo/Inactivo`.
  - para `Doctor`, firma/sello se muestran por defecto aun si el doctor esta `Inactivo`.
- Acciones por fila (icon-only):
  - `Ver Firma` -> `document-text` (si existe firma; Admin/Recepcion).
  - `Ver Sello` -> `shield-check` (si existe sello; Admin/Recepcion).
  - para `Doctor`, firma/sello se muestran visibles como miniaturas.
  - `Subir sello` -> `arrow-up` (cuando no hay sello y el usuario es `Administrador` o `Recepcion`).
  - para doctor propio vinculado, las acciones ya no son icon-only: se muestran como botones amplios con icono + texto para `Marcar activo/inactivo`, `Actualizar firma` y `Actualizar sello`.
  - conservan `title` y `aria-label`.

## Pendientes de autorizacion rapida
- Solo se muestra para rol `Doctor`.
- Tabla inferior `Pendientes por autorizar`:
  - lista maximo 20 citas pendientes del doctor vinculado,
  - ordena por `fechaCP DESC, idcitasPaciente DESC`,
  - muestra indice, fecha, paciente, procedimiento, valor, abono, saldo y accion.
- Acciones:
  - `Autorizar` por fila reutiliza `POST /api/paciente/cita/:id/autorizar`.
  - `Autorizar todos` ejecuta autorizacion masiva de todas las citas pendientes del doctor, no solo las 20 visibles.
  - Mientras `Autorizar todos` esta en proceso:
    - muestra loader sobre la tabla,
    - deshabilita boton global e individuales,
    - evita doble envio con `isAuthorizingAll`.

## Cambio de contrasena
- Solo se muestra para rol `Doctor`.
- Boton en toolbar superior `Cambiar contrasena`.
- Modal solicita contrasena actual, nueva contrasena y confirmacion.
- Ejecuta `POST /api/auth/change-password`.
- Valida contrasena actual antes de actualizar.

## Firma y sello propios
- Solo el doctor vinculado puede reemplazar su propia firma/sello desde la vista Doctores.
- No pide contrasena adicional; basta la sesion activa del usuario `Doctor`.
- Reemplazar firma/sello actualiza el archivo/ruta del registro `doctor`.
- Almacenamiento persistente (no se pierde al actualizar): firma (`firma_<idDoctor>.png`) y sello (`sello_<idDoctor>.png|jpg`, multer en memoria en `middlewares/uploadSello.js`) se guardan desde `doctor.controller.js` via `fileStorage.saveFile("imgDocs", ...)`: en `imgDocsDir` (Windows `C:\ProgramData\ClinicaElectron\img-docs`) o en R2 segun el modo, servidos como `/img/docs/...`. Detalle en `23_almacenamiento_nube.md`.
- La firma viaja como PNG base64 en JSON; el backend acepta hasta `10mb` y responde JSON claro si la imagen excede el limite.
- Canvas de firma (registro y actualizar firma):
  - al cambiar tamano (girar tablet, abrir teclado) se conserva el trazo: se copia y se vuelve a pintar tras redimensionar (`prepararCanvasFirmaHD`).
  - no se guarda firma en blanco: al registrar sin trazo se envia `firmaBase64` vacio (doctor queda sin firma); en `Actualizar firma` sin trazo se bloquea con aviso.
- Las citas y expedientes que muestran firma/sello usan el archivo actual del doctor:
  - si se reemplaza firma/sello, los historicos autorizados muestran la version nueva al volver a consultar/imprimir.
  - el estado `Inactivo` no oculta firma/sello.

## Flujo de registro
1. Abre modal `#modal-doctor`.
2. Dibuja firma en canvas (PNG base64) o carga imagen de firma al canvas.
3. `POST /api/doctor` con `nombre`, `telefono`, `firmaBase64`; si existe `doctor.estadoD`, se inserta activo (`estadoD = 1`).
4. Si se adjunta sello, `POST /api/doctor/:id/sello` con multipart.
5. Si el sello falla, mantiene alta del doctor y muestra mensaje parcial.
6. Actualiza tabla local.

## Flujo de estado (activo/inactivo)
1. Solo el usuario `Doctor` con doctor vinculado puede ver accion de estado en su propia fila.
2. Abre modal de confirmacion con password.
3. Ejecuta `PUT /api/doctor/:id/estado` con `{ estadoD, password }`.
4. Si valida credenciales y vinculo, actualiza chip de estado en tabla.

## Backend API usada
- `GET /api/doctor`
  - `Administrador` y `Recepcion`: lista doctores completos.
  - `Doctor`: lista solo el doctor vinculado a su usuario; sin vinculo responde lista vacia.
- `POST /api/doctor`
  - crea doctor (inserta doctor y opcional firma en archivo).
- `POST /api/doctor/:id/sello`
  - sube sello y actualiza ruta en BD.
- `POST /api/doctor/:id/firma`
  - reemplaza firma PNG del doctor.
- `GET /api/doctor/pendientes-autorizacion?limit=20`
  - lista citas pendientes del doctor vinculado.
- `POST /api/doctor/pendientes-autorizacion/autorizar-todos`
  - autoriza todas las citas pendientes del doctor vinculado.
- `POST /api/auth/change-password`
  - cambia la contrasena del usuario doctor logueado.
- `GET /api/doctor/select`
  - usado por vistas clinicas como En Cola para mostrar/asignar doctores.
- `GET /api/doctor/select?soloActivos=1`
  - usado para mostrar solo doctores activos.
- `GET /api/doctor/select?soloActivos=1&soloVinculado=1`
  - usado por Paciente al registrar cita cuando el usuario logueado es `Doctor`.
- `GET /api/doctor/select?soloVinculado=1`
  - usado por Doctores para resolver la fila propia del usuario `Doctor`, incluso si esta inactivo.
- `PUT /api/doctor/:id/estado`
  - cambia estado activo/inactivo del doctor vinculado (con validacion de contrasena).
- `GET /api/doctor/:id`
  - detalle doctor para modal en Paciente.

## SP y consultas
- SP:
  - `sp_doctor_listar_select`
  - `sp_doctor_get_by_id`
  - `sp_doctor_citas_pendientes_autorizacion`
  - `sp_doctor_citas_pendientes_autorizar_todos`
- Migracion:
  - `backend/sql/2026-07-30_doctor_pendientes_autorizacion.sql`
- Query directa en controller:
  - lista de doctores,
  - insert doctor,
  - update firma/sello.

## Reglas de roles
- Menu de vista `Doctores`:
  - `Administrador`, `Recepcion`, `Doctor`.
  - `Asistente` no tiene acceso a esta vista; solo `Paciente` y `En Cola`.
- Lista:
  - `Administrador`, `Recepcion`: ven todos los doctores.
  - `Doctor`: ve solo su propio doctor vinculado.
- Crear: `Administrador`, `Recepcion`.
- Sello/firma: `Administrador`, `Recepcion`; `Doctor` solo sobre su propio doctor vinculado.
- Cambio de estado: `Doctor` (sobre su propio doctor vinculado).
- El frontend resuelve el doctor propio con `GET /api/doctor/select?soloVinculado=1`; sin esa bandera el catalogo general no marca `doctorVinculado`.
- Pendientes de autorizacion: `Doctor` (solo su propio doctor vinculado).
- Cambio de contrasena: `Doctor` (solo usuario logueado).
- Select y detalle por id: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
- En `GET /api/doctor/select`, cuando el usuario es `Doctor`:
  - por defecto responde el catalogo de doctores para usos clinicos como En Cola.
  - con `soloVinculado=1`, responde solo su doctor vinculado y `doctorVinculado: true`.
  - con `soloVinculado=1` y sin vinculo, responde lista vacia y `doctorVinculado: false`.
- En `GET /api/doctor/:id`, cuando el usuario es `Doctor`:
  - sin contexto clinico, solo puede consultar su propio doctor vinculado.
  - con `contexto=paciente` puede consultar la ficha del doctor asociado a una cita/expediente.

## Validaciones de sello (backend)
- Middleware `uploadSello`:
  - formatos permitidos: `image/png`, `image/jpeg`, `image/jpg`.
  - tamano maximo: `4 MB`.
  - nombre estable: `sello_<idDoctor>.<ext>`.
- Wrapper de ruta `uploadSelloWithJsonErrors`:
  - estandariza errores de multer/fileFilter en JSON `400 { ok:false, message }`.
  - evita respuestas no-JSON para que frontend muestre mensaje claro.

## Correcciones recientes (2026-03-18)
- Frontend (`frontend/js/doctor.js`):
  - Carga de doctores con `AbortController` + secuencia (`doctorFetchSeq`) para evitar estados viejos.
  - Registro de doctor idempotente:
    - guarda `isCreatingDoctor`,
    - deshabilita boton guardar durante `POST /api/doctor`.
  - Cambio de estado robusto:
    - guarda `isUpdatingEstado`,
    - evita doble `PUT` por clicks repetidos.
  - Cleanup de vista:
    - aborta requests en vuelo,
    - limpia estado local/modales,
    - remueve handler `Escape` de la vista.
- Backend (`backend/controllers/doctor.controller.js`):
  - `crear`: normaliza/valida `nombre` y `telefono`.
  - `subirSello`: valida `id` numerico y responde `404` si doctor no existe.
  - `obtenerPorId`: valida `id` numerico antes de ejecutar SP.

## Ajustes recientes (2026-04-07)
- Backend (`backend/routes/doctor.routes.js`):
  - se agrega wrapper para convertir errores de upload de sello a JSON uniforme.
- Frontend (`frontend/js/doctor.js`):
  - `subirSelloDoctor` robustecido para manejar respuestas no JSON sin romper flujo.
  - mensajes de error de sello ahora usan texto devuelto por backend cuando exista.

## Ajustes recientes (2026-09-23) - firma desde tablet
- Incidente: desde la tablet no se veia la firma/sello del doctor en Registro de Citas; desde la PC si.
- Diagnostico:
  - rutas en BD correctas (`/img/docs/firma_ID.png`, `/img/docs/sello_ID.jpg|png`); `/img/docs` es estatico sin auth y funciona igual por `localhost:3000` y por IP LAN.
  - `sello_15.jpeg` es legitimo: versiones antiguas conservaban la extension original; hoy multer guarda `.jpg`/`.png`.
  - bug 1: el canvas de firma (`width: 100%`) se re-inicializaba en `resize`/`orientationchange`; en tablet (girar pantalla o abrir teclado) se borraba el trazo y se guardaba un PNG en blanco.
  - bug 2: se guardaba firma aunque el canvas estuviera vacio, por eso todos los doctores tienen `firma_X.png` aunque alguna pueda ser un rectangulo blanco.
- Correccion (`frontend/js/doctor.js`):
  - helper `prepararCanvasFirmaHD(canvas, ctx, conservarTrazo)` compartido por `setupCanvasHD` y `setupFirmaUpdateCanvasHD`: si hay trazo, copia el canvas antes de redimensionar y lo repinta centrado (contain).
  - flags `firmaTieneTrazo` / `firmaUpdateTieneTrazo`: se activan al dibujar o cargar imagen y se reinician al limpiar.
  - registro de doctor sin trazo envia `firmaBase64` vacio (doctor queda sin firma).
  - `Actualizar firma` sin trazo muestra aviso "Debe firmar o cargar una imagen antes de guardar." y no envia.
- Firmas historicas en blanco no se corrigen solas: verificar abriendo `http://<IP>:3000/img/docs/firma_ID.png` y, si sale vacia, volver a firmar desde `Actualizar firma`.
