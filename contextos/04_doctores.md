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
  - registro de doctor,
  - captura de firma en canvas,
  - subida de sello,
  - vista modal de firma/sello.
- Toolbar:
  - `Registrar Doctor` (texto + icono `plus`).
- Acciones por fila (icon-only):
  - `Ver Firma` -> `document-text`
  - `Ver Sello` -> `shield-check`
  - conservan `title` y `aria-label`.

## Flujo de registro
1. Abre modal `#modal-doctor`.
2. Dibuja firma en canvas (PNG base64).
3. `POST /api/doctor` con `nombre`, `telefono`, `firmaBase64`.
4. Si se adjunta sello, `POST /api/doctor/:id/sello` con multipart.
5. Actualiza tabla local.

## Backend API usada
- `GET /api/doctor`
  - lista doctores completos.
- `POST /api/doctor`
  - crea doctor (inserta doctor y opcional firma en archivo).
- `POST /api/doctor/:id/sello`
  - sube sello y actualiza ruta en BD.
- `GET /api/doctor/select`
  - usado por vista Paciente para seleccionar doctor en citas.
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
