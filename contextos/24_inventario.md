# Vista Inventario (catalogo + pedidos)

Creada 2026-09-30. Reemplaza la hoja de pedido que la clinica hacia a mano.

## Alcance decidido (no ampliar sin preguntar)
- Solo **catalogo** y **pedidos**. NO lleva existencias, minimos ni movimientos de stock.
- Sin proveedor ni precios: cambian seguido y no se conectan con nada.
- Sin relacion con pacientes / citas / cobros. Solo `usuario` (quien crea / genera).
- Roles: `Administrador`, `Recepcion`, `Asistente`. El `Doctor` no ve la vista por ahora.

## Base de datos
- Migracion: `backend/sql/2026-09-30_inventario_catalogo_pedidos.sql` (tablas + SPs + catalogo inicial).
  SPs sueltos en `backend/sql/routines_split/sp_inv_*.sql`.
- `inv_articulo`: `categoriaA` ENUM `Odontologia | Ortodoncia | Instrumento`, `nombreA`, `unidadA`, `activoA`.
  - Unico por (categoria, nombre). Cada variante es su propio articulo (Resina fluida A1/A2/A3, Arco 16x22 Acero Sup/Inf, Ligas por color).
  - Eliminar = `activoA = 0`. Crear uno igual lo reactiva (`sp_inv_articulo_crear`).
- `inv_pedido`: `estadoP` `Borrador | Generado`, `notaP`, creado/generado por y cuando. Un Generado se puede editar (si se olvido anotar algo) y sigue Generado; `2026-09-30b_inventario_pedido_generado_editable.sql` quito el bloqueo en `sp_inv_pedido_guardar`.
- `inv_pedido_detalle`: copia `descripcionD` y `categoriaD` del articulo (el pedido viejo no cambia si el articulo se renombra o desactiva). `idArticulo` NULL = renglon libre. `cantidadD` entero > 0, `unidadD`, `notaD`, `ordenD`.
- Reglas en SP con `SIGNAL SQLSTATE '45000'` (el controller las devuelve como 400 con el mensaje): nombre duplicado, generar sin renglones.

## Backend
- `backend/routes/inventario.routes.js` montado en `/api/inventario`.
- `backend/controllers/inventario.controller.js`.
  - `GET/POST /articulos`, `PUT/DELETE /articulos/:id`.
  - `GET /pedidos`, `GET /pedidos/:id` (con `renglones`).
  - `POST /pedidos` (nuevo borrador) y `PUT /pedidos/:id`: body `{ nota, renglones[], generar }`. Reemplaza el detalle completo en una transaccion; `generar: true` lo cierra en la misma transaccion.
  - `DELETE /pedidos/:id`: borrador lo borra cualquiera de los 3 roles; generado solo `Administrador` (403).
  - Sin migracion aplicada responde 503 con el nombre del archivo SQL.

## Frontend
- `frontend/js/inventario.js` (`window.__mountInventario`), `frontend/css/inventario.css` (solo tokens `--app-*`, sirve para los 4 temas).
- Registrada en `ROLE_VIEWS` / `VIEW_MOUNTERS` de `web.js` y boton `data-view="Inventario"` en `index.html` (ultimo boton del menu, despues de Seguimiento).
- Pestana **Catalogo**: chips por categoria con conteo, buscador (Ctrl+F), modal agregar/editar (doble clic en la fila tambien edita), eliminar.
- Pestana **Pedidos**: lista (borradores primero). Editor:
  - izquierda: catalogo con buscador (Enter agrega el primero) y chips; clic agrega o suma 1; "Renglon libre" para lo que no esta en catalogo.
  - derecha: renglones con cantidad (+/-), unidad, nota; nota general.
  - `Guardar borrador` / `Generar pedido` (confirma).
  - Generado: solo lectura agrupado por categoria, `Copiar texto` (formato WhatsApp) y `Descargar PDF` (jsPDF + autotable).
  - `Editar` en un generado: mismo editor (etiqueta "Editando"), `Guardar cambios` / `Cancelar` (recarga la version guardada). `Eliminar` ahi solo para Administrador.
  - Aviso de cambios sin guardar al salir de la vista, cambiar de pestana o volver a la lista.

## Despliegue
1. Aplicar en la BD `2026-09-30_inventario_catalogo_pedidos.sql` y despues `2026-09-30b_inventario_pedido_generado_editable.sql`.
2. Subir backend + frontend.
