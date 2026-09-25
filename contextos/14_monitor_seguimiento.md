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
- Rediseño visual 2026-08-01:
  - adopta el mismo patron compacto del tema blanco aplicado en Agenda.
  - estructura: titulo limpio, banda de filtros, KPIs bajos, chips de filtros, tabla densa y paginacion compacta.
  - mantiene compatibilidad con `light`, `dark`, `vampire` y `princess` usando variables `--ms-*`.
  - la tabla conserva columnas/toggles existentes, pero reduce altura de filas y botones de accion para alinear densidad visual.
  - ajuste posterior: tabla con filas de aprox. `34px`, zebra blanco/gris suave y columna `Paciente` sin bold forzado.
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
  - `Contactado` usa checkboxes `SMS` y `Llamada` por fila (vigentes mientras sean posteriores a la ultima visita; ver seccion 2026-09-24).
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

## Marcas vigentes y comentario de seguimiento (2026-09-24)
- Problema que resuelve: las marcas `SMS/Llamada` quedaban atadas a la `fechaCorte` de pantalla
  (default hoy), y al dia siguiente ya no aparecian marcadas.
- Regla nueva:
  - `SMS`, `Llamada` y `Comentario` se siguen mostrando mientras la fecha del registro sea
    **mayor** a `paciente.ultimaVisitaP`.
  - cuando el paciente vuelve (`ultimaVisitaP` se actualiza) el registro queda viejo y deja de
    mostrarse solo; ademas el paciente pasa a `Al dia`.
  - se muestra el registro mas reciente del paciente que cumpla la regla (el mas nuevo gana).
- Guardado:
  - el backend fecha cada marca con el **dia real** (`getTodayLocalISO()`), ignora la
    `fechaCorte` del body; la columna `fechaCorte` de la tabla pasa a significar "fecha del contacto".
  - el frontend envia siempre las 3 marcas juntas (`sms`, `llamada`, `comentario`) con el estado
    heredado, asi el registro de hoy arrastra lo marcado en dias anteriores.
  - body: `{ "idPaciente": 123, "sms": 1, "llamada": 0, "comentario": "Dijo que viene en octubre" }`.
  - comentario vacio = borrar; maximo 500 caracteres.
  - si el body no trae `comentario` (cliente viejo) se conserva el comentario vigente.
- Lectura:
  - `consultarMonitorContactoVigente()` en `paciente.controller.js` consulta solo los ids de la
    pagina actual; se aplica tambien al segmento `cancelados`.
  - el SP `sp_paciente_monitor_seguimiento_listar` no se modifico (sus `sms/llamada` se ignoran).
  - respuesta por fila: `sms`, `llamada`, `comentario`, `fechaContacto`, `contactoPor` (NombreU), `contactoEn`.
- UI:
  - boton de comentario en columna `Accion` (amarillo cuando hay comentario) -> `showSystemPrompt`.
  - icono junto al nombre y globo flotante al pasar el mouse sobre `Paciente`
    (comentario, fecha/hora, usuario y marcas SMS/Llamada).
- Migracion: `backend/sql/2026-09-24_seguimiento_comentario.sql`
  - `ALTER TABLE paciente_seguimiento_contacto ADD COLUMN comentario VARCHAR(500) NULL`.
  - `sp_paciente_monitor_contacto_guardar_v2` (6 params); el SP original de 5 params se conserva
    para instancias sin actualizar.
  - sin la migracion el monitor sigue funcionando con SMS/Llamada vigentes; guardar un comentario
    devuelve 400 pidiendo aplicar la migracion.

## Columna Proxima cita (2026-09-24)
- Toggle `Proxima cita` junto a `Numeracion/SMS/Llamada` (persistido en `showProximaCita`).
- Atajos de teclado (como Agenda): `Alt+1` Numeracion, `Alt+2` SMS, `Alt+3` Llamada, `Alt+4` Proxima cita
  (se ignoran mientras se escribe en un campo de texto o hay un dialogo del sistema abierto).
- Columna junto a `Contactado`: check verde si tiene proxima cita agendada (title con la fecha),
  X roja si no.
- Criterio igual al boton `Ver proxima cita`: agenda por nombre, no cancelada, fecha futura
  (o hoy con hora pendiente/sin hora).
- El frontend envia `proximaCita=1` solo con el toggle activo; el backend
  (`consultarMonitorProximaCitaPorNombre`) consulta `agendapersona` solo para los nombres de la
  pagina actual y agrega `proximaCita: "YYYY-MM-DD" | null` a cada fila.
- Al activar el toggle NO se recarga el listado: se llama
  `GET /api/paciente/monitor-seguimiento/proximas-citas?ids=1,2,3` (max 50) solo para las filas visibles.
- El boton `Ver proxima cita` no cambia (sigue con su endpoint y cache propios).
- Filtro rapido en el encabezado `Proxima cita` (clic): `Todos` -> `Con cita` (check) -> `Sin cita` (X) -> `Todos`.
  - estado `proximaFiltro` persistido en sesion; chip en filtros activos; `Limpiar filtros` lo reinicia;
    ocultar la columna (toggle / Alt+4) tambien lo quita.
  - query `proximaFiltro=con|sin` (solo si la columna esta visible). Se filtra en el servidor sobre todos
    los pacientes, asi paginacion, `Total` y KPIs `Retrasado/+2/+3` quedan consistentes.
  - backend `consultarMonitorConFiltroProxima()`: SQL inline que replica las reglas de
    `sp_paciente_monitor_seguimiento_listar/_totales` (meses por aniversario vencido, busqueda, estado,
    tratamiento y protocolo de seguridad). La agenda futura se lee una vez (CTE `futuras`) y se une por
    nombre. Si se cambian las reglas de esos SP, actualizar tambien esta funcion.
  - no aplica al segmento `cancelados` (por definicion no tienen cita futura).

## Recarga suave y pagina persistida (2026-09-24)
- En recargas (cambio de pagina/filtro) las filas actuales se mantienen atenuadas (`.ms-table.is-refreshing`)
  en lugar de reemplazar la tabla por "Cargando..."; ese aviso solo sale si aun no hay filas.
- La pagina actual se guarda en el estado de sesion (`page`) junto a los filtros: al volver a la vista se
  retoma donde iba. Cambiar un filtro sigue volviendo a pagina 1; el backend ajusta la pagina si ya no existe.
- Costo de la consulta: el SP de listado evalua todos los pacientes (necesita clasificar y ordenar por
  meses de ausencia) pero devuelve solo la pagina; marcas vigentes y proxima cita se consultan solo para
  las filas de la pagina.

## Notas de seguridad/no regresion
- Mantiene permisos de vista por rol (`Administrador`, `Recepcion`).
- Vista aislada con cleanup via `window.__setViewCleanup`.
- No altera flujos existentes de Agenda/Paciente/En Cola/Doctores/Servicios/Cobro/Login.

## Protocolo de seguridad global (2026-04-16)
- El monitor queda integrado al modo global ON/OFF.
- Cuando el protocolo esta ON:
  - backend fuerza `v_tratamiento = 'odontologia'` en:
    - `sp_paciente_monitor_seguimiento_listar`
    - `sp_paciente_monitor_seguimiento_totales`
  - aunque frontend envie `tratamiento=all`, el resultado llega solo de `Odontologia`.
- Referencia completa:
  - `contextos/15_protocolo_seguridad.md`.
