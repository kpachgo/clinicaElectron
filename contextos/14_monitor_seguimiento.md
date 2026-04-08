# Vista Monitor de Seguimiento (implementada)

## Estado actual
- Estado de referencia: **2026-04-08**.
- Esta vista esta en **v2 conectada a backend/SP**.
- Objetivo del modulo:
  - seguimiento de pacientes por ausencia usando `paciente.ultimaVisitaP`,
  - clasificacion visual por retraso y estado activo/inactivo.

## Frontend
- Archivos:
  - `frontend/js/monitorSeguimiento.js`
  - `frontend/css/monitorSeguimiento.css`
- Montaje SPA:
  - `loadView("Monitor de Seguimiento")` llama `window.__mountMonitorSeguimiento`.
- Integracion en shell:
  - menu topbar en `frontend/index.html`,
  - script y css incluidos en `index.html`,
  - permisos por rol definidos en `frontend/js/web.js`.

## Roles
- Permitidos:
  - `Administrador`
  - `Recepcion`
- No visible para:
  - `Doctor`
  - `Asistente`

## UX y filtros (v2)
- Controles superiores:
  - `Fecha de corte` (editable, default = hoy),
  - buscador por nombre/telefono,
  - selector por tratamiento (`tipoTratamientoP`: `Todos`, `Odontologia`, `Ortodoncia`, `Sin registrar`),
  - selector por estado (`Todos`, `Activos`, `Inactivos`),
  - toggles de columnas/flags tipo Agenda: `Numeracion`, `SMS`, `Llamada`,
  - boton `Limpiar filtros`.
- Tarjetas KPI interactivas:
  - `Total`
  - `Retrasado`
  - `+2 meses`
  - `+3 meses`
- Comportamiento de `Total`:
  - refleja el total visible con filtros aplicados (`fecha`, `busqueda`, `tratamiento`, `estado` y tambien segmento KPI cuando este activo).
- Claridad de filtros:
  - estado explicito de KPI por segmento (`sin filtro de segmento` o segmento aplicado),
  - chips de filtros activos con contador de filtros adicionales.
- Tabla:
  - columnas: `Contactado`, `#`, `Paciente`, `Telefono`, `Ultima visita`, `Meses ausencia`, `Tratamiento`, `Estado`, `Segmento`.
  - `Contactado` usa checkboxes `SMS` y `Llamada` por fila (persisten en BD por `idPaciente + fechaCorte`).
- Paginacion visual:
  - tamanos `10/25/50`,
  - botones `Anterior` / `Siguiente`,
  - indicador de pagina y rango mostrado.

## Reglas de clasificacion
- Regla principal:
  - pacientes con `ultimaVisitaP` `NULL` se excluyen del listado y totales.
- Meses de ausencia:
  - calculo por **aniversario vencido estricto** (fechaCorte debe ser mayor al aniversario mensual).
  - ejemplo base: ultima visita `06-03-2026`
    - `06-04-2026` -> aun no supera 1 mes (no retrasado),
    - `07-04-2026` -> supera 1 mes -> `Retrasado`,
    - `07-05-2026` -> supera 2 meses -> `+2 meses`,
    - `07-06-2026` -> supera 3 meses -> `+3 meses`.
- Segmentos excluyentes:
  - `>1` y `<=2` meses: `Retrasado`
  - `>2` y `<=3` meses: `+2 meses`
  - `>3` meses: `+3 meses` (incluye `4,5,6...`)
  - `0` meses: `Al dia` (se muestra en tabla cuando aplica, no tiene tarjeta dedicada).

## Backend y SP implementados
- Endpoints:
  - `GET /api/paciente/monitor-seguimiento?fechaCorte=YYYY-MM-DD&segmento=all|retrasado|m2|m3&estado=all|activo|inactivo&tratamiento=all|odontologia|ortodoncia|sin_registrar&q=&page=1&pageSize=25`
- `PUT /api/paciente/monitor-seguimiento/contacto` con body:
  - `{ "idPaciente": 123, "fechaCorte": "2026-04-08", "sms": 1, "llamada": 0 }`
- Respuesta:
  - `rows`, `totales`, `pagination`.
- SP:
  - `sp_paciente_monitor_seguimiento_listar`
  - `sp_paciente_monitor_seguimiento_totales`
  - `sp_paciente_monitor_contacto_guardar`
- Tabla:
  - `paciente_seguimiento_contacto` (PK: `idPaciente, fechaCorte`)
- Script SQL versionado:
  - `backend/sql/2026-04-08_monitor_seguimiento.sql`
- Nota de rutas:
  - `monitor-seguimiento` esta declarado antes de `/:id` para evitar colision.

## Notas de seguridad/no regresion
- Mantiene permisos de vista por rol (`Administrador`, `Recepcion`).
- Vista aislada con cleanup via `window.__setViewCleanup`.
- No altera flujos existentes de Agenda/Paciente/En Cola/Doctores/Servicios/Cobro/Login.
