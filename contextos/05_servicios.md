# Vista Servicios

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
  - accion por fila: boton `Eliminar`.

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
