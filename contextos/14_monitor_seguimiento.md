# Vista Monitor de Seguimiento (en construccion)

## Estado actual
- Esta vista esta en **v1 visual** (mock local), sin integracion backend/SP todavia.
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

## UX y filtros (v1)
- Controles superiores:
  - `Fecha de corte` (editable, default = hoy),
  - buscador por nombre/telefono,
  - boton `Limpiar filtros`.
- Tarjetas KPI interactivas:
  - `Total`
  - `Retrasado`
  - `+2 meses`
  - `+3 meses`
  - `Activos`
  - `Inactivos`
- Tabla read-only:
  - `Paciente`, `Telefono`, `Ultima visita`, `Meses ausencia`, `Estado`, `Segmento`.
- Paginacion visual:
  - tamanos `10/25/50`,
  - botones `Anterior` / `Siguiente`,
  - indicador de pagina y rango mostrado.

## Reglas de clasificacion (v1)
- Fuente usada en maqueta:
  - dataset mock local (`MOCK_ROWS`) dentro de `monitorSeguimiento.js`.
- Regla principal:
  - pacientes con `ultimaVisitaP` `NULL` se excluyen del listado y totales.
- Meses de ausencia:
  - calculo calendario equivalente a `TIMESTAMPDIFF(MONTH, ultimaVisitaP, fechaCorte)`.
- Segmentos excluyentes:
  - `1` mes: `Retrasado`
  - `2` meses: `+2 meses`
  - `>=3` meses: `+3 meses`
  - `0` meses: `Al dia` (se muestra en tabla cuando aplica, no tiene tarjeta dedicada).

## Contrato planeado para fase 2 (backend)
- Endpoint previsto:
  - `GET /api/paciente/monitor-seguimiento?fechaCorte=YYYY-MM-DD&segmento=all|retrasado|m2|m3&estado=all|activo|inactivo&q=&page=1&pageSize=25`
- Respuesta prevista:
  - `rows`, `totales`, `pagination`.
- SP planificados:
  - `sp_paciente_monitor_seguimiento_listar`
  - `sp_paciente_monitor_seguimiento_totales`
- Nota de rutas:
  - al agregar endpoint en `paciente.routes.js`, debe declararse antes de `/:id` para evitar colision.

## Notas de seguridad/no regresion
- v1 no modifica backend ni BD.
- Vista aislada con cleanup via `window.__setViewCleanup`.
- No altera flujos existentes de Agenda/Paciente/En Cola/Doctores/Servicios/Cobro/Login.
