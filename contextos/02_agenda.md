# Vista Agenda

## Frontend
- Archivo: `frontend/js/agenda.js`.
- Estilos clave: `frontend/css/agenda.css`.
- Render principal: tabla de agenda con filtros por fecha, texto y estado.
- Columnas: `#` (numeracion), Nombre, Hora, Fecha, Contacto, Estado, Comentario, Acciones.
- Control adicional: toggle `Numeracion` para mostrar/ocultar la columna `#`.
- Modal `Registrar Cita`:
  - campos: `Nombre`, `Hora`, `Fecha`, `Contacto`, `Estado`, `Comentario`.
  - autocomplete de pacientes en `Nombre`.
  - autocomplete de servicios en `Comentario`.
- Acciones compactas por fila (iconos Heroicons inline, estilo `outline`):
  - `queue-list` enviar a cola
  - `document-duplicate` copiar cita para reprogramar
  - `currency-dollar` cobrar
  - `trash` eliminar
  - `plus` crear paciente

## Flujo principal
1. Carga por fecha (`input[type=date]`) via backend.
2. Filtro local por texto/estado.
3. Si texto no encuentra resultados locales del dia, hace fallback a busqueda mensual backend.
4. Soporta crear cita desde modal.
5. Soporta editar inline (nombre, hora, fecha, contacto, estado, comentario).
6. En modal de Agenda, `Comentario` permite texto libre + sugerencias de servicios (`nombreS`) via autocomplete.
7. La sugerencia se inserta/reemplaza solo en el token actual (cursor o seleccion), permitiendo mezclar texto libre en cualquier parte.
8. El autocomplete de comentario usa debounce (`250ms`) y token de busqueda para descartar respuestas viejas.
9. Al hacer click en una sugerencia se usa snapshot de rango (`start/end`) para evitar inserciones en posicion incorrecta.
10. Reprogramacion asistida: desde accion `Copiar para reprogramar` (`document-duplicate`) copia nombre/contacto/comentario/hora a un buffer temporal.
11. Boton `Pegar Cita` abre modal con datos copiados y fecha destino tomada del datepicker actual.
12. Boton `Cancelar` limpia el buffer de reprogramacion.
13. Al salir de la vista Agenda (`__setViewCleanup`) se limpia buffer y estado del modal para evitar residuos entre vistas.

## Integraciones entre vistas
- Agenda -> Cobro:
  - Boton `Cobrar` (`currency-dollar`) valida paciente por nombre (y desempata por telefono si hay duplicados).
  - Si resuelve un paciente unico, guarda prefill en `window.__agendaCobroPrefillPatient`.
  - Luego llama `window.loadView("Cobro")`.
- Agenda -> Paciente:
  - Boton `Crear` (`plus`) consulta `/api/paciente/existe?nombre=...&telefono=...`.
  - Si no existe, guarda `window.__agendaPacientePrefill` con:
    - `NombreP` desde `nombre` de agenda.
    - `telefonoP` desde `contacto` de agenda.
    - `motivoConsultaP` desde `comentario` de agenda.
  - Telefono se normaliza a `xxxx xxxx` solo cuando tiene exactamente 8 digitos.
  - Al abrir Paciente con este prefill, `estadoP` se fija en `Activo` (`value = "1"`).
  - Luego llama `window.loadView("Paciente")`.

## Manejo de autofill navegador
- El buscador `#agenda-search` usa:
  - nombre dinamico (`name` con timestamp),
  - `readonly` temporal,
  - limpieza de valor con `setTimeout`.
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
  - permite composiciones como:
    - `Posible Control Mensual`
    - `Control Mensual + Posible Relleno`

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
- `DELETE /api/agenda/:id`
  - Controller: `agenda.controller.eliminar`
  - SP: `sp_agenda_delete`
- `GET /api/servicio/search?q=...`
  - Controller: `servicio.controller.buscarLigero`
  - SP: `sp_servicio_buscar_ligero`
  - Uso: autocomplete del campo `Comentario` en modal de Agenda.

## Reglas relevantes
- Roles permitidos backend: `Administrador`, `Recepcion`.
- Para `GET /api/servicio/search`: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
- `DELETE` elimina registro de agenda en backend y actualiza la tabla local.
- Busqueda mensual toma todo el mes de la fecha seleccionada.

## Correcciones recientes (2026-03-18)
- Se corrigio race condition en carga por fecha:
  - `cargarAgendaPorFecha` ahora usa `AbortController` + secuencia (`agendaFetchSeq`) para abortar/ignorar respuestas viejas.
  - Solo pinta resultados si la fecha actual del datepicker sigue coincidiendo con el request en vuelo.
- Se corrigieron requests duplicados al crear cita:
  - guardas con `isCreatingAgenda`.
  - boton guardar deshabilitado mientras se procesa `POST /api/agenda`.
- Se corrigieron requests duplicados en edicion inline (nombre/contacto/comentario):
  - guardas por editor (`isSaving` + `isClosed`).
  - `Enter` + `blur` ya no dispara doble `PUT`.
- En cleanup de vista se aborta fetch activo para evitar que una respuesta tardia pinte DOM desmontado.
