# Vista Servicios

## Estandar visual compartido
- La vista usa el mismo patron visual de Agenda para componentes base:
  - Toolbar: `ui-toolbar`, `ui-control`, `ui-toolbar-btn`.
  - Tabla: `ui-table-wrap-compact`, `ui-table-compact`.
  - Acciones por fila: `ui-action-btn` (icon-only).
- Iconos Heroicons inline desde `window.__uiIcons` (`frontend/js/uiIcons.js`), sin CDN.
- Sin cambios en logica, endpoints, SQL ni payloads.

## Frontend
- Archivo: `frontend/js/servicios.js`.
- Funciones principales:
  - listar servicios,
  - crear servicio (modal),
  - editar nombre inline,
  - editar precio inline,
  - eliminar servicio,
  - filtrar por texto.
- Tabla:
  - columnas `Nombre`, `Precio`, `Acciones`.
  - accion por fila icon-only: `Eliminar` (`trash`).
- Toolbar:
  - `Agregar Servicio` (texto + icono `plus`).

## Flujo
1. Carga lista con `GET /api/servicio`.
2. Crear con modal:
  - valida nombre y precio >= 0,
  - `POST /api/servicio`.
3. Editar nombre:
  - doble click en celda,
  - `PUT /api/servicio/:id` con `{ nombre }`.
4. Editar precio:
  - doble click en celda,
  - `PUT /api/servicio/:id` con `{ precio }`.
5. Eliminar:
  - boton `Eliminar` por fila,
  - `DELETE /api/servicio/:id`.

## Backend API usada
- `GET /api/servicio`
- `POST /api/servicio`
- `PUT /api/servicio/:id`
- `DELETE /api/servicio/:id`
- `GET /api/servicio/search` (autocomplete en Cobro)

## SP esperados
- `sp_servicio_listar`
- `sp_servicio_create`
- `sp_servicio_buscar_ligero`
- `sp_servicio_update_nombre`
- `sp_servicio_update_precio`
- `sp_servicio_delete`

## Nota tecnica
- `controllers/servicio.controller.js` actualiza por campo usando:
  - `sp_servicio_update_nombre`
  - `sp_servicio_update_precio`
- Eliminacion:
  - usa `sp_servicio_delete`.
  - si el servicio esta referenciado por cuentas/detalles, backend responde `400` con mensaje de bloqueo por relacion existente.

## Correcciones recientes (2026-03-18)
- Frontend (`frontend/js/servicios.js`):
  - Carga robusta de lista con `AbortController` + secuencia para evitar respuestas viejas al cambiar de vista.
  - Alta de servicio idempotente:
    - guarda `isCreatingServicio`
    - boton guardar deshabilitado durante `POST /api/servicio`.
  - Edicion inline de nombre y precio sin duplicados:
    - guardas `isSaving` + `isClosed`.
    - evita doble request por `Enter + blur`.
  - Cleanup de vista:
    - aborta request en vuelo,
    - limpia estado local y modal.
- Backend (`backend/controllers/servicio.controller.js`):
  - `crear`: valida `nombre` no vacio y `precio` numerico >= 0.
  - `actualizar`: valida existencia de `idServicio` antes de `UPDATE`; responde `404` si no existe.
