# Vista Cobro

## Frontend
- Archivo: `frontend/js/cobro.js`.
- Modo POS con 3 pasos:
  1. Seleccionar paciente
  2. Agregar servicios
  3. Confirmar pago

## Flujo de cobro
1. Buscar paciente (`/api/paciente/search`).
2. Buscar servicio (`/api/servicio/search`).
3. Agregar items al carrito (cantidad y precio editables).
4. Elegir forma de pago.
5. Guardar cuenta (`POST /api/cuenta`).

## Integracion con Agenda
- Al abrir Cobro, consume prefill `window.__agendaCobroPrefillPatient`.
- Si viene prefill valido, deja paciente seleccionado automaticamente.

## Cuentas del dia
- Fecha de trabajo en `#cuenta-date`.
- Lista de cuentas por fecha:
  - `GET /api/cuenta?fecha=YYYY-MM-DD`.
- Orden actual de columnas: `#`, `Nombre`, `Total`, `Forma de Pago`, `Cantidad`, `Tratamiento`, `Quitar`.
- `Cantidad` se muestra antes de `Tratamiento` y usa `cantidadTotal`.
- Eliminar cuenta:
  - `DELETE /api/cuenta/:id`.
- Filtro local por nombre/procedimiento.
- Reporte PDF de cobro incluye tambien la columna `Cantidad`.

## Compras y descuentos
- Crear descuento:
  - `POST /api/cuenta/descuento`.
- Listar descuentos por fecha:
  - `GET /api/cuenta/descuento?fecha=...`.
- Eliminar descuento:
  - `DELETE /api/cuenta/descuento/:id`.
- Total final = subtotal cuentas - total descuentos.

## Backend API usada
- `/api/cuenta` (crear, listar, eliminar)
- `/api/cuenta/descuento` (crear, listar, eliminar)

## Backend/SP
- Controller: `backend/controllers/cuenta.controller.js`.
- Creacion de cuenta usa transaccion:
  - `sp_cuenta_create`
  - `sp_detallecuenta_create` (por cada item)
- Listado: `sp_cuenta_listar_por_fecha`
  - devuelve `cantidadTotal` como `SUM(dc.cantidadDC)` por cuenta.
- Eliminacion: `sp_cuenta_eliminar`
- Descuentos:
  - `sp_descuento_crear`
  - `sp_descuento_listar_por_fecha`
  - `sp_descuento_eliminar`

## Roles
- Crear/listar cuenta y descuentos: `Administrador`, `Recepcion`.
- Eliminar cuenta: solo `Administrador`.
