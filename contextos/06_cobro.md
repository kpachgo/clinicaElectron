# Vista Cobro

## Frontend
- Archivos:
  - `frontend/js/cobro.js`
  - `frontend/css/cobro.css`
- Montaje SPA:
  - `loadView("Cobro")` llama `window.__mountCobro`.
- Flujo POS de 3 pasos:
  1. Seleccionar paciente.
  2. Agregar servicios.
  3. Confirmar pago.

## Flujo principal de cobro
1. Buscar paciente por autocomplete (`GET /api/paciente/search?q=...`).
2. Buscar servicio por autocomplete (`GET /api/servicio/search?q=...`).
3. Agregar al carrito (cantidad y precio unitario editables).
4. Elegir forma de pago (`Efectivo`, `Tarjeta`, `IGS`, `Transferencia`).
5. Guardar cuenta (`POST /api/cuenta` con fecha explicita del selector `#cuenta-date`).
6. Al guardar correctamente, la vista se re-renderiza y conserva la fecha activa para recargar cuentas/descuentos del mismo dia.

## Integracion con Agenda
- Al abrir Cobro, consume `window.__agendaCobroPrefillPatient`.
- Si el prefill trae `idPaciente` valido:
  - selecciona paciente automaticamente,
  - limpia el buscador,
  - deja lista la captura de servicios.
- Despues de usarlo, limpia el puente: `window.__agendaCobroPrefillPatient = null`.

## Dashboard, KPIs y caja
- Dashboard superior unificado en 3 bloques:
  - grafico anillo de distribucion de ingresos del dia,
  - tarjetas KPI de totales,
  - conteo de billetes.
- KPIs mostrados:
  - `Total del dia` (neto),
  - `Bruto del dia`,
  - `Efectivo`,
  - `Efectivo en caja` (`efectivo - descuentos`),
  - `Tarjeta`,
  - `IGS`,
  - `Transferencia`,
  - `Descuentos`.
- Anillo de distribucion (conic-gradient):
  - `Efectivo` verde,
  - `Tarjeta` rojo,
  - `IGS` naranja,
  - `Transferencia` azul.
- Interaccion KPI:
  - `Total del dia` queda como estado visual base.
  - hover/focus en otra tarjeta usa `is-kpi-active` y suspende temporalmente `Total del dia` con `kpi-total-dia-suspended`.
- Conteo de billetes (`Q1`, `Q5`, `Q10`, `Q20`, `Q50`, `Q100`):
  - `Q1` permite decimal (`step=0.01`),
  - resto de denominaciones se normalizan a entero,
  - el total de caja se calcula solo en frontend (no persiste en backend).

## Cuentas del dia
- Fecha de trabajo en `#cuenta-date`.
- Lista por fecha:
  - `GET /api/cuenta?fecha=YYYY-MM-DD`.
- Columnas actuales:
  - `#`, `Nombre`, `Total`, `Forma de Pago`, `Cantidad`, `Tratamiento`, `Doctor`, `Quitar`.
- Toggles visuales en cabecera:
  - `#toggle-numeracion-cuentas` (numeracion),
  - `#toggle-doctor-cuentas` (columna doctor).
- Filtros locales (logica AND):
  - texto `#cuenta-search` (nombre, tratamiento, doctor),
  - doctor `#cuenta-doctor-filter` (`Todos`, `Sin doctor`, doctor especifico),
  - forma de pago `#cuenta-forma-pago-filter` (`Efectivo`, `Tarjeta`, `IGS`, `Transferencia`).
- Asignacion de doctor por cuenta:
  - `PUT /api/cuenta/:id/doctor` con `idDoctor` nullable,
  - selector por fila con opcion `Sin doctor`,
  - catalogo de doctores via `GET /api/doctor/select`.
- Eliminacion de cuenta:
  - `DELETE /api/cuenta/:id` (con confirmacion previa).
- Si el modal de faltantes esta abierto y se recargan cuentas, Cobro recalcula faltantes automaticamente.

## Persistencia de estado UI (sesion)
- Cobro guarda preferencias/filtros en `sessionStorage` por usuario:
  - key: `ui_state_cobro_<userId>`.
- Estado persistido:
  - toggle numeracion,
  - toggle doctor,
  - texto de busqueda,
  - filtro de doctor,
  - filtro de forma de pago.

## Atajos de teclado
- Navegacion de fecha en Cobro:
  - `Alt + ArrowLeft`: dia anterior.
  - `Alt + ArrowRight`: dia siguiente.
- Guardas:
  - no aplica si hay modal abierto (mensual/faltantes),
  - no aplica mientras se edita otro control de entrada.

## Faltantes de cobro (modal En Cola)
- Apertura: `#btn-abrir-faltantes-cobro`.
- Contenedor: `#faltantes-cobro-modal`.
- Fuente de datos:
  - cuentas actuales del dia (`cuentasActuales`),
  - `GET /api/cola?fecha=YYYY-MM-DD`.
- Regla:
  - toma solo cola en estado `Atendido`,
  - compara por nombre normalizado (minusculas, trim, sin acentos),
  - faltante = atendido en cola que no aparece en cuentas cobradas.
- Salida:
  - resumen `Atendidos en cola`, `Cobrados`, `Faltantes`,
  - tabla con `Paciente`, `Hora`, `Contacto`.
- UX:
  - cierre por boton, backdrop y `Escape`,
  - mensajes explicitos para vacio/cargando/error de red.

## Reporte mensual por pacientes (modal)
- Apertura: `#btn-abrir-reporte-mensual`.
- Contenedor: `#reporte-mensual-modal`.
- Filtros:
  - `mes` (`#reporte-mensual-mes`),
  - `tratamiento` (`#reporte-mensual-servicio`, opcional),
  - `formaPago` (`#reporte-mensual-forma-pago`, opcional).
- Catalogo de tratamientos mensual:
  - `GET /api/servicio` (no usa endpoint search).
- Datos del reporte mensual:
  - `GET /api/cuenta/reporte-mensual-pacientes?mes=YYYY-MM&idServicio=<opcional>&formaPago=<opcional>`.
- Tabla mensual:
  - `Paciente`, `Cantidad`, `Monto`.
- Totales renderizados:
  - pacientes unicos,
  - cantidad total mes,
  - monto total mes,
  - monto global mes (sin filtros).

### Contrato de `GET /api/cuenta/reporte-mensual-pacientes`
- Query requerida:
  - `mes` (`YYYY-MM`).
- Query opcional:
  - `idServicio` entero positivo,
  - `formaPago` (`efectivo`, `tarjeta`, `igs`, `transferencia`).
- Respuesta:
  - `ok`, `mes`,
  - `filtroServicio` o `null`,
  - `filtroFormaPago` o `null`,
  - `data` por paciente (`idPaciente`, `nombrePaciente`, `cantidadPaciente`, `montoPaciente`),
  - `totales`,
  - `totalesGlobalMes`.

## Exportacion PDF
- Diario:
  - boton `#btn-reporte-cobro`,
  - usa `jsPDF + autoTable`,
  - incluye resumen diario y tabla de cuentas con columna `Cantidad`.
- Mensual:
  - boton `#btn-reporte-mensual-pdf`,
  - usa `jsPDF + autoTable`,
  - incluye filtros aplicados y resumen mensual + detalle por paciente.

## Compras y descuentos
- Crear:
  - `POST /api/cuenta/descuento`.
- Listar por fecha:
  - `GET /api/cuenta/descuento?fecha=YYYY-MM-DD`.
- Eliminar:
  - `DELETE /api/cuenta/descuento/:id`.
- Regla de total final:
  - `TOTAL = subtotal cuentas - total descuentos`.

## Backend API usada por Cobro
- `GET /api/paciente/search`
- `GET /api/servicio/search`
- `GET /api/servicio` (catalogo mensual)
- `GET /api/doctor/select`
- `POST /api/cuenta`
- `GET /api/cuenta?fecha=YYYY-MM-DD`
- `PUT /api/cuenta/:id/doctor`
- `DELETE /api/cuenta/:id`
- `GET /api/cuenta/reporte-mensual-pacientes`
- `POST /api/cuenta/descuento`
- `GET /api/cuenta/descuento?fecha=YYYY-MM-DD`
- `DELETE /api/cuenta/descuento/:id`
- `GET /api/cola?fecha=YYYY-MM-DD`
- `GET /api/cuenta/reporte-mensual` (disponible en backend para resumen por tratamiento)

## Backend/SP y reglas
- Controller principal: `backend/controllers/cuenta.controller.js`.
- Creacion de cuenta en transaccion:
  - `sp_cuenta_create`
  - `sp_detallecuenta_create` (por item)
  - update de `fechaC` en cuenta.
- Listado por fecha:
  - `sp_cuenta_listar_por_fecha`
  - retorna `cantidadTotal` y consolidado de tratamiento,
  - contempla `idDoctorCuenta`, `nombreDoctorCuenta` y bandera `doctorMixto`.
- Asignacion de doctor:
  - valida cuenta y doctor,
  - exige migracion `detallecuenta.idDoctor`,
  - persiste con `sp_cuenta_asignar_doctor_por_cuenta`.
- Reportes:
  - `sp_cuenta_reporte_mensual`
  - `sp_cuenta_reporte_mensual_pacientes`
- Eliminacion:
  - `sp_cuenta_eliminar`.
- Descuentos:
  - `sp_descuento_crear`
  - `sp_descuento_listar_por_fecha`
  - `sp_descuento_eliminar`.

## Roles
- Cuenta y descuentos (crear/listar) y reportes: `Administrador`, `Recepcion`.
- Asignar doctor en cuenta: `Administrador`, `Recepcion`.
- Eliminar cuenta: solo `Administrador`.
- Endpoints auxiliares consumidos por Cobro:
  - `/api/doctor/select`: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
  - `/api/paciente/search`: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
  - `/api/servicio/search`: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
  - `/api/servicio`: `Administrador`, `Recepcion`.
  - `/api/cola`: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.

## Endurecimiento tecnico aplicado
- Frontend (`frontend/js/cobro.js`)
  - control `abort + seq` para:
    - autocomplete paciente/servicio,
    - cuentas por fecha,
    - descuentos por fecha,
    - doctores para cuenta,
    - servicios del reporte mensual,
    - reporte mensual,
    - faltantes de cobro.
  - guardas anti-duplicado en:
    - guardar cobro,
    - asignar doctor por cuenta,
    - eliminar cuenta,
    - crear/eliminar descuento.
  - cleanup de vista con `window.__setViewCleanup`:
    - invalida/aborta requests en vuelo,
    - limpia handlers (`keydown` de atajos) y estado temporal.
- Backend (`backend/controllers/cuenta.controller.js`)
  - validaciones de fecha/IDs y parametros de reporte.
  - `404` para cuenta/descuento no encontrado.
  - retry corto para lecturas (`queryReadWithRetry`).
  - errores transitorios DB (`ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, `PROTOCOL_CONNECTION_LOST`) retornan `503`.
