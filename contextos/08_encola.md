# Vista En Cola

## Estandar visual compartido
- Esta vista ahora usa el patron compartido de UI con Agenda como base:
  - Toolbar: clases `ui-toolbar`, `ui-control`, `ui-toolbar-btn` (texto + icono).
  - Tabla: `ui-table-wrap-compact` + `ui-table-compact`.
  - Acciones por fila: `ui-action-group` + `ui-action-btn` (icon-only).
- Iconos (Heroicons inline) se obtienen desde `window.__uiIcons` (`frontend/js/uiIcons.js`), sin CDN.
- No cambia la logica de negocio ni contratos de backend.

## Frontend
- Archivos:
  - `frontend/js/encola.js`
  - `frontend/css/encola.css`
- Montaje SPA:
  - `loadView("En Cola")` llama `window.__mountEnCola` (definido en `encola.js`).
- Render principal:
  - Header con KPIs (`Total`, `En espera`, `Atendidos`).
  - Toolbar con buscador (`#cola-search`), filtro por estado, filtro por doctor y botones:
    - `Limpiar atendidos` + icono `check-circle`
    - `Borrar todo` + icono `trash`
  - Tabla con columnas: Paciente, Tratamiento, Hora, Fecha agenda, Doctor, Estado, Acciones.
  - El dato `Ingreso` (hora de `creadoEn`) se mantiene oculto en UI por ahora.

## Flujo principal
1. Al montar, carga datos del dia actual local (`YYYY-MM-DD`) via `GET /api/cola?fecha=...`.
2. Auto refresh cada `15000 ms` (15s) con recarga silenciosa.
3. Ordena mostrando primero `En espera` y luego `Atendido`, por `creadoEn` ascendente.
4. Permite filtrar por texto (nombre/tratamiento) y estado.
5. Permite asignar doctor por fila (select) con datos cargados desde `/api/doctor/select`.
6. Permite filtrar por doctor desde la barra superior.
7. Los selects de doctor (fila y filtro) usan color por `doctorId` para diferenciacion visual rapida.
8. Permite cambiar estado:
   - Select por fila (`En espera` / `Atendido`).
   - Boton rapido icon-only:
     - `Atender` -> icono `check`
     - `Reabrir` -> icono `arrow-path`
9. Permite eliminar fila individual y limpiezas masivas.
10. Acciones icon-only por fila:
   - `Buscar` -> `magnifying-glass`
   - `Eliminar` -> `trash`
   - Todos los botones mantienen `title` y `aria-label`.
11. Sonido de ingreso nuevo:
   - cuando `recargar()` detecta `idColaPaciente` nuevo respecto a la ultima carga, reproduce `bell.ogg`.
   - no suena en la primera carga de la vista (evita ruido inicial).
   - usa `window.playUiSound("bell", { minIntervalMs: 450 })`.

## Integraciones entre vistas
- Agenda -> En Cola:
  - En Agenda, el boton `Enviar a cola` (icono `queue-list`) usa `window.__colaPacienteAPI.addFromAgenda(payload)`.
  - Payload enviado desde Agenda:
    - `agendaId`
    - `nombrePaciente`
    - `tratamiento` (desde `comentario`; si vacio, se solicita por `prompt`)
    - `horaAgenda`
    - `fechaAgendaISO`
    - `contacto`
  - Si backend responde duplicado, Agenda muestra "Este paciente ya esta en cola".
- En Cola -> Paciente:
  - Boton `Buscar` intenta abrir paciente por:
    - `idPaciente` directo si existe.
    - si no existe, busca por nombre exacto en `/api/paciente/search?q=...`.
    - si hay multiples, desempata por telefono (si hay contacto).
  - Si no puede resolver unico, usa apertura manual en Paciente con query precargada.
  - APIs frontend usadas:
    - `window.__pacienteViewAPI.openById(idPaciente)`
    - `window.__pacienteViewAPI.openManualSearch({ query, contacto, message })`

## Backend API usada por En Cola
- `GET /api/cola?fecha=YYYY-MM-DD`
  - Controller: `cola.controller.listar`
- `POST /api/cola`
  - Controller: `cola.controller.crear`
- `PUT /api/cola/:id/estado`
  - Controller: `cola.controller.actualizarEstado`
- `PUT /api/cola/:id/doctor`
  - Controller: `cola.controller.actualizarDoctor`
- `DELETE /api/cola/:id`
  - Controller: `cola.controller.eliminar`
- `DELETE /api/cola/atendidos?fecha=YYYY-MM-DD`
  - Controller: `cola.controller.limpiarAtendidos`
- `DELETE /api/cola/todo?fecha=YYYY-MM-DD`
  - Controller: `cola.controller.borrarTodo`

## Reglas backend relevantes
- Roles permitidos: `Administrador`, `Recepcion`, `Doctor`, `Asistente`.
- Validaciones:
  - `fecha` en formato `YYYY-MM-DD`.
  - `horaAgenda` en formato `HH:mm`.
  - `nombrePaciente` requerido en creacion.
- Normalizacion de estado:
  - Solo se persisten `En espera` o `Atendido`.
- Doctor en cola:
  - Campo `doctorId` nullable en `cola_paciente`.
  - Asignacion editable desde la vista En Cola.
  - `actualizarDoctor` valida que el doctor exista cuando se envia `doctorId`.
- Duplicados al crear:
  - Si llega `agendaId`: evita duplicado por `agendaId + fechaAgenda + estado=En espera`.
  - Si no llega `agendaId` y hay fecha: evita duplicado por `nombrePaciente (case-insensitive, trim) + fechaAgenda + estado=En espera`.
- `limpiarAtendidos` borra solo estado `Atendido` (opcionalmente por fecha).
- `borrarTodo` borra toda la cola (o solo una fecha si se envia query `fecha`).

## Base de datos
- Script: `backend/sql/create_cola_paciente_table.sql`.
- Migracion para instalaciones existentes: `backend/sql/alter_cola_paciente_add_doctor.sql`.
- Tabla: `cola_paciente`.
- Campos clave:
  - `idColaPaciente` (PK)
  - `agendaId` (nullable)
  - `doctorId` (nullable)
  - `nombrePaciente`
  - `tratamiento`
  - `horaAgenda`
  - `fechaAgenda`
  - `contacto`
  - `estado` (`En espera` | `Atendido`)
  - `creadoPorUsuarioId`
  - `creadoEn`, `actualizadoEn`
- Indices:
  - `(fechaAgenda, estado)`
  - `(agendaId, estado)`
  - `(doctorId, estado)`
  - `(creadoEn)`

## Notas operativas
- En la vista En Cola, las recargas y el boton `Limpiar atendidos` trabajan sobre la fecha del dia local.
- El boton `Borrar todo` en la UI actualmente llama `DELETE /api/cola/todo` sin fecha, por lo que borra todos los dias.
- `encola.js` registra cleanup con `window.__setViewCleanup` para limpiar el `setInterval` al salir de la vista.
- El sonido de campana requiere que el sistema de sonidos este cargado (`frontend/js/uiSounds.js`).
