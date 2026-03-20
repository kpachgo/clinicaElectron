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
- Orden actual de columnas: `#`, `Nombre`, `Total`, `Forma de Pago`, `Cantidad`, `Tratamiento`, `Doctor`, `Quitar`.
- `Cantidad` se muestra antes de `Tratamiento` y usa `cantidadTotal`.
- La columna `Doctor` se asigna por cuenta y aplica a todos los detalles de la cuenta.
- Toggles visuales en cabecera:
  - `#toggle-numeracion-cuentas` (oculto por defecto)
  - `#toggle-doctor-cuentas` (oculto por defecto)
- Eliminar cuenta:
  - `DELETE /api/cuenta/:id`.
- Asignar/limpiar doctor por cuenta (guardado inmediato):
  - `PUT /api/cuenta/:id/doctor` con `idDoctor` nullable.
- Filtros locales:
  - texto (`#cuenta-search`) por nombre/procedimiento/doctor
  - filtro por doctor (`#cuenta-doctor-filter`).
- Reporte PDF de cobro incluye tambien la columna `Cantidad`.

## Faltantes de cobro (modal En Cola)
- Boton en cabecera de Cuentas del dia: `#btn-abrir-faltantes-cobro`.
- Contenedor modal: `#faltantes-cobro-modal`.
- Fuente de comparacion:
  - Cuentas del dia (`cuentasActuales`) para la fecha activa.
  - En Cola por fecha con `GET /api/cola?fecha=YYYY-MM-DD`.
- Regla de inclusion de En Cola:
  - solo registros con estado `Atendido`.
- Regla de comparacion:
  - por paciente unico.
  - match por nombre normalizado (minusculas, trim y sin acentos).
- Salida en modal:
  - resumen: `Atendidos en cola`, `Cobrados`, `Faltantes`.
  - tabla de faltantes con columnas: `Paciente`, `Hora`, `Contacto`.
- UX:
  - cierra por boton, backdrop y tecla `Escape`.
  - si no hay faltantes, muestra mensaje de lista vacia.
  - maneja error de red sin romper flujo de Cobro.

## Reporte mensual por tratamiento (modal)
- El bloque mensual ya no se muestra directo en la vista principal de Cobro.
- Se abre desde boton junto al reporte diario: `#btn-abrir-reporte-mensual`.
- Contenedor modal: `#reporte-mensual-modal`.
- Filtros en modal:
  - mes (`#reporte-mensual-mes`)
  - tratamiento exacto (`#reporte-mensual-servicio`)
  - `idServicio` es obligatorio para cargar datos.
- Exportacion PDF mensual desde modal: `#btn-reporte-mensual-pdf`.

### Endpoints de reporte mensual
- Resumen agregado por tratamiento:
  - `GET /api/cuenta/reporte-mensual?mes=YYYY-MM&idServicio=<opcional>`
- Detalle por pacientes (endpoint usado por el modal):
  - `GET /api/cuenta/reporte-mensual-pacientes?mes=YYYY-MM&idServicio=ID`

### Contrato de `GET /api/cuenta/reporte-mensual-pacientes`
- Query requerida:
  - `mes` con formato `YYYY-MM`
  - `idServicio` entero positivo
- Respuesta (`ok: true`):
  - `mes`
  - `filtroServicio` (`idServicio`, `nombre`)
  - `data`: lista por paciente con:
    - `idPaciente`
    - `nombrePaciente`
    - `cantidadPaciente` (suma de `detallecuenta.cantidadDC`)
    - `montoPaciente` (suma de `detallecuenta.subTotalDC`)
  - `totales`:
    - `pacientesUnicos`
    - `cantidadTotalMes`
    - `montoTotalMes`
- Render en tabla mensual:
  - columnas: `Paciente`, `Cantidad`, `Monto`.

### Nota de regresion funcional
- El reporte diario/mensual, listado diario de cuentas, flujo de doctor por cuenta y descuentos/cobro no cambian.

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
- `/api/cuenta/reporte-mensual` (resumen mensual por tratamiento)
- `/api/cuenta/reporte-mensual-pacientes` (detalle mensual por paciente y tratamiento)
- `/api/cuenta/descuento` (crear, listar, eliminar)
- `/api/cola` (listar por fecha para modal de faltantes de cobro)

## Backend/SP
- Controller: `backend/controllers/cuenta.controller.js`.
- Creacion de cuenta usa transaccion:
  - `sp_cuenta_create`
  - `sp_detallecuenta_create` (por cada item)
- Listado: `sp_cuenta_listar_por_fecha`
  - devuelve `cantidadTotal` como `SUM(dc.cantidadDC)` por cuenta.
- Reporte mensual (resumen): `sp_cuenta_reporte_mensual`
- Reporte mensual (pacientes): `sp_cuenta_reporte_mensual_pacientes`
- Eliminacion: `sp_cuenta_eliminar`
- Descuentos:
  - `sp_descuento_crear`
  - `sp_descuento_listar_por_fecha`
  - `sp_descuento_eliminar`

## Roles
- Crear/listar cuenta y descuentos: `Administrador`, `Recepcion`.
- Eliminar cuenta: solo `Administrador`.
- Modal de faltantes (consulta `/api/cola`): disponible para `Administrador` y `Recepcion` en Cobro.

## Endurecimiento tecnico aplicado (2026-03-20)
- Frontend (`frontend/js/cobro.js`)
  - Cargas criticas con control `abort + seq`:
    - cuentas por fecha
    - descuentos por fecha
    - faltantes de cobro (cola)
    - reporte mensual
    - catalogo de servicios mensual
    - autocompletes de paciente/servicio
  - Guardas anti-duplicado:
    - `Guardar cobro`
    - asignacion de doctor por cuenta
    - eliminar cuenta
    - crear/eliminar descuento
  - Cleanup de vista fortalece navegacion rapida:
    - invalida y aborta requests en vuelo para evitar respuestas tardias fuera de Cobro.
- Backend (`backend/controllers/cuenta.controller.js`)
  - Validaciones adicionales:
    - `fecha` valida en listados de cuentas/descuentos y creacion de descuento.
    - IDs validos en eliminar cuenta/descuento.
  - Consistencia de respuesta:
    - `404` para cuenta/descuento no encontrado.
  - Tolerancia a DB transitoria:
    - lecturas con reintento corto (`queryReadWithRetry`).
    - errores de conexion (`ETIMEDOUT`/`ECONN*`) responden `503` en lugar de `500`.
