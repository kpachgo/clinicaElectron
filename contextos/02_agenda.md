# Vista Agenda

## Frontend
- Archivo: `frontend/js/agenda.js`.
- Estilos clave: `frontend/css/agenda.css`.
- Render principal: tabla de agenda con filtros por fecha, texto, estado y contacto.
- Columnas: `Contactado` (SMS/Llamada/Presente), `#` (numeracion), Nombre, Hora, Fecha, Contacto (telefono), Estado, Comentario, Acciones.
- Controles de visibilidad:
  - toggle `Numeracion` para mostrar/ocultar columna `#`.
  - toggles `SMS`, `Llamada` y `Presente` para mostrar/ocultar cada marcador dentro de `Contactado`.
  - si SMS + Llamada + Presente estan apagados, se oculta toda la columna `Contactado`.
- Filtro `Contacto`: `Todos`, `Sin contacto`, `Con SMS`, `Con Llamada`, `Con ambos`.
  - Nota: este filtro cruza solo SMS/Llamada; `Presente` no cambia la logica de ese filtro.
- Filtro `Estado` con refuerzo visual:
  - cuando esta activo, muestra estado de filtro.
  - si no hay coincidencias, marca alerta de "sin coincidencias".
- Busqueda mensual fallback:
  - si el texto no encuentra resultados locales del dia, consulta backend del mes (`/api/agenda/buscar-mes`).
  - muestra alerta indicando que se estan viendo resultados del mes.
- Modal `Registrar Cita`:
  - campos: `Nombre`, `Hora`, `Fecha`, `Contacto`, `Estado`, `Comentario`.
  - autocomplete de pacientes en `Nombre`.
  - autocomplete de servicios en `Comentario`.
- Acciones compactas por fila (iconos Heroicons inline, estilo `outline`):
  - `queue-list` enviar a cola
  - `document-duplicate` copiar cita para reprogramar
  - `currency-dollar` cobrar
  - `magnifying-glass` abrir paciente existente
  - `plus` crear paciente
  - `trash` eliminar

## Flujo principal
1. Carga por fecha (`input[type=date]`) via backend.
2. Filtro local por texto/estado/contacto.
3. Si texto no encuentra resultados locales del dia, fallback mensual backend.
4. Crear cita desde modal.
5. Editar inline (nombre, hora, fecha, contacto, estado, comentario).
6. Marcar por fila `SMS`, `Llamada` y `Presente` con checkboxes persistidos en BD.
7. Cambio de marcas de contacto con UI optimista + rollback si falla `PUT /api/agenda/:id`.
8. En modal de Agenda, `Comentario` permite texto libre + sugerencias de servicios (`nombreS`) via autocomplete.
9. La sugerencia se inserta/reemplaza solo en el token actual (cursor o seleccion), permitiendo mezclar texto libre.
10. El autocomplete de comentario usa debounce (`250ms`) y token de busqueda para descartar respuestas viejas.
11. Al hacer click en sugerencia se usa snapshot de rango (`start/end`) para evitar inserciones fuera de posicion.
12. Reprogramacion asistida: `Copiar para reprogramar` guarda nombre/contacto/comentario/hora en buffer temporal.
13. Boton `Pegar Cita` abre modal con datos copiados y fecha destino tomada del datepicker actual.
14. Boton `Cancelar` limpia el buffer de reprogramacion.
15. Al enviar a cola una cita de otra fecha, ofrece crear automaticamente cita para hoy antes de pasarla a `En Cola`.
16. Al salir de la vista (`__setViewCleanup`) limpia buffer de reprogramacion, estado de modal y requests en vuelo.

## Funciones nuevas de Agenda
- Revision de inasistencias (`agenda-review-ina`):
  - abre modal de "Posibles inasistencias" para la fecha actual.
  - cruza agenda del dia (`/api/agenda?fecha=...`) con `En Cola` (`/api/cola?fecha=...`).
  - candidatos: citas `Confirmado` o `Pendiente` que no aparecen como `Atendido` en cola (por `agendaId` o por nombre normalizado).
  - permite seleccionar/deseleccionar candidatos y aplicar cancelacion masiva (`estado = Cancelado`) con `PUT /api/agenda/:id`.
- Resumen del dia (`agenda-day-summary-open`):
  - KPIs: total de tratamientos y franja horaria mas cargada.
  - vista por estado, por tratamiento y por hora.
  - base de calculo: resultados del dia respetando filtros activos.
  - tabla por hora usa solo filas en estado `Confirmado`.

## Integraciones entre vistas
- Agenda -> Cobro:
  - Boton `Cobrar` valida paciente por nombre (y desempata por telefono si hay duplicados).
  - Si resuelve paciente unico, guarda prefill en `window.__agendaCobroPrefillPatient`.
  - Luego llama `window.loadView("Cobro")`.
- Agenda -> Paciente (abrir existente):
  - Boton `Abrir en Paciente` intenta resolver `idPaciente` por nombre exacto (y telefono si hay ambiguedad).
  - Si encuentra match, abre Paciente via `window.__pacienteViewAPI.openById(...)`.
  - Si falla resolucion automatica, intenta `openManualSearch(...)` como fallback.
- Agenda -> Paciente (crear nuevo):
  - Boton `Crear` consulta `/api/paciente/existe?nombre=...&telefono=...`.
  - Si no existe, guarda `window.__agendaPacientePrefill` con:
    - `NombreP` desde `nombre` de agenda.
    - `telefonoP` desde `contacto` de agenda.
    - `motivoConsultaP` desde `comentario` de agenda.
  - Telefono se normaliza a `xxxx xxxx` solo cuando tiene exactamente 8 digitos.
  - Al abrir Paciente con este prefill, `estadoP` se fija en `Activo` (`value = "1"`).
  - Luego llama `window.loadView("Paciente")`.

## Restricciones por rol en UI
- En backend, Agenda permite roles: `Administrador`, `Recepcion`, `Redes`.
- Cuando el rol actual es `Redes` en frontend:
  - no se muestra accion `Enviar a cola`.
  - no se muestra accion `Cobrar`.
  - no se muestra accion `Crear` (paciente nuevo).
  - se mantienen visibles `Reprogramar`, `Abrir en Paciente` y `Eliminar`.

## Estado UI por sesion
- Agenda persiste estado en `sessionStorage` por usuario (`ui_state_agenda_<userId>`):
  - toggles `Numeracion`, `SMS`, `Llamada`, `Presente`.
  - buscador.
  - filtro de estado.
  - filtro de contacto.
- Al reabrir la vista dentro de la sesion, restaura esos valores.

## Atajos de teclado
- `Alt + Flecha izquierda`: mueve agenda al dia anterior.
- `Alt + Flecha derecha`: mueve agenda al dia siguiente.
- Se desactiva el atajo cuando:
  - la vista Agenda no esta activa,
  - hay modal de Agenda abierto,
  - el foco esta en un control de edicion (input/textarea/select/contenteditable), excepto el datepicker de agenda.

## Manejo de autofill navegador
- El buscador `#agenda-search` usa:
  - nombre dinamico (`name` con timestamp),
  - `readonly` temporal,
  - limpieza de valor con `setTimeout` cuando aplica.
- Tambien se agregan inputs "trampa" ocultos para username/password en el header de agenda.

## Autocomplete en Comentario (Agenda)
- Campo: `#modal-comentario`.
- Fuente de sugerencias: `GET /api/servicio/search?q=...`.
- Solo usa `nombreS` (texto), sin precio.
- Reglas:
  - requiere al menos 2 caracteres del token actual.
  - no reemplaza todo el comentario; solo el token actual en cursor/seleccion.
  - `Enter` inserta la primera sugerencia visible.
  - `Escape` cierra la lista.
  - click fuera del campo/lista cierra la lista.

## Backend API usada por Agenda
- `GET /api/agenda?fecha=YYYY-MM-DD`
  - Controller: `agenda.controller.listarPorFecha`
  - SP: `sp_agenda_por_fecha`
- `GET /api/agenda/buscar-mes?q=texto&fecha=YYYY-MM-DD`
  - Controller: `agenda.controller.buscarPorMes`
  - SP: `sp_agenda_buscar_mes`
- `POST /api/agenda`
  - Controller: `agenda.controller.crear`
  - SP: `sp_agenda_create`
- `PUT /api/agenda/:id`
  - Controller: `agenda.controller.actualizar`
  - SP: `sp_agenda_update`
  - si viene `comentario`, sincroniza tambien `cola_paciente.tratamiento` por `agendaId` dentro de transaccion.
  - si cambia `contacto`, intenta sincronizar telefono en `paciente` cuando puede resolver un match seguro.
- `DELETE /api/agenda/:id`
  - Controller: `agenda.controller.eliminar`
  - SP: `sp_agenda_delete`
- `GET /api/servicio/search?q=...`
  - Controller: `servicio.controller.buscarLigero`
  - SP: `sp_servicio_buscar_ligero`
  - Uso: autocomplete del campo `Comentario` en modal de Agenda.

## Contrato de banderas contacto
- En `POST/PUT` se aceptan banderas: `sms`, `llamada`, `presente`.
- Valores permitidos: `0/1`, boolean, o texto equivalente (`true/false`, `si/no`, etc).
- En `GET` de agenda se reciben: `smsAP`, `llamadaAP`, `presenteAP`.

## Reglas relevantes
- Roles permitidos backend en Agenda: `Administrador`, `Recepcion`, `Redes`.
- Para `GET /api/servicio/search`: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
- `DELETE` elimina registro de agenda en backend y actualiza la tabla local.
- Busqueda mensual toma todo el mes de la fecha seleccionada.

## Correcciones y ajustes recientes
- Se corrigio race condition en carga por fecha:
  - `cargarAgendaPorFecha` usa `AbortController` + secuencia (`agendaFetchSeq`) para abortar/ignorar respuestas viejas.
  - solo pinta resultados si la fecha actual del datepicker coincide con el request en vuelo.
- Se corrigieron requests duplicados al crear cita:
  - guardas con `isCreatingAgenda`.
  - boton guardar deshabilitado mientras se procesa `POST /api/agenda`.
- Se corrigieron requests duplicados en edicion inline (nombre/contacto/comentario):
  - guardas por editor (`isSaving` + `isClosed`).
  - `Enter` + `blur` ya no dispara doble `PUT`.
- En cleanup de vista se aborta fetch activo y se cierran modales de inasistencia/resumen para evitar pintar DOM desmontado.
- Persistencia de estado UI por sesion/usuario (filtros y toggles).

## Protocolo de seguridad global (2026-04-16)
- Esta vista queda afectada por el modo global ON/OFF.
- Cuando esta ON:
  - `GET /api/agenda?fecha=...` (SP `sp_agenda_por_fecha`) filtra y oculta registros asociados a `Ortodoncia`.
  - `GET /api/agenda/buscar-mes?...` (SP `sp_agenda_buscar_mes`) aplica el mismo filtro.
- Control operativo (frontend):
  - atajo `Ctrl + Shift + P` desde `frontend/js/web.js`.
  - recarga la vista actual despues de cambiar estado.
- Referencia completa:
  - `contextos/15_protocolo_seguridad.md`.
