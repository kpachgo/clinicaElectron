# Vista Doctores

## Estandar visual compartido
- Esta vista adopta el patron visual reutilizable:
  - Toolbar: `ui-toolbar`, `ui-control`, `ui-toolbar-btn`.
  - Tabla compacta: `ui-table-wrap-compact`, `ui-table-compact`.
  - Acciones de fila: `ui-action-btn` (icon-only).
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
  - cambio de estado (solo doctor vinculado),
  - vista modal de firma/sello.
- Toolbar:
  - `Registrar Doctor` (texto + icono `plus`).
- Tabla:
  - columnas: `Nombre`, `Telefono`, `Estado`, `Firma`, `Sello`, `Acciones`.
  - estado visual con chip `Activo/Inactivo`.
- Acciones por fila (icon-only):
  - `Ver Firma` -> `document-text` (si existe firma).
  - `Ver Sello` -> `shield-check` (si existe sello).
  - `Subir sello` -> `arrow-up` (cuando no hay sello).
  - `Cambiar estado` -> `arrow-path` (solo para doctor propio vinculado).
  - conservan `title` y `aria-label`.

## Flujo de registro
1. Abre modal `#modal-doctor`.
2. Dibuja firma en canvas (PNG base64) o carga imagen de firma al canvas.
3. `POST /api/doctor` con `nombre`, `telefono`, `firmaBase64`.
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
  - lista doctores completos.
- `POST /api/doctor`
  - crea doctor (inserta doctor y opcional firma en archivo).
- `POST /api/doctor/:id/sello`
  - sube sello y actualiza ruta en BD.
- `GET /api/doctor/select`
  - usado por vista Paciente para seleccionar doctor en citas.
- `GET /api/doctor/select?soloActivos=1`
  - usado por Paciente para mostrar solo doctores activos.
- `PUT /api/doctor/:id/estado`
  - cambia estado activo/inactivo del doctor vinculado (con validacion de contrasena).
- `GET /api/doctor/:id`
  - detalle doctor para modal en Paciente.

## SP y consultas
- SP:
  - `sp_doctor_listar_select`
  - `sp_doctor_get_by_id`
- Query directa en controller:
  - lista de doctores,
  - insert doctor,
  - update firma/sello.

## Reglas de roles
- Lista/crear/sello: `Administrador`, `Doctor`.
- Cambio de estado: `Doctor` (sobre su propio doctor vinculado).
- Select y detalle por id: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
- En `GET /api/doctor/select`, cuando el usuario es `Doctor`:
  - si tiene doctor vinculado, responde solo ese doctor y `doctorVinculado: true`.
  - en fallback (sin vinculo), responde lista general y `doctorVinculado: false`.

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
