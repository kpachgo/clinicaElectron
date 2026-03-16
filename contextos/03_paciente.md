# Vista Paciente (incluye odontograma)

> Nota: el nombre del archivo se mantiene por compatibilidad historica, pero este contexto ya documenta odontograma completo.

## Alcance de este contexto
- Flujo de paciente: busqueda, carga, edicion, guardado, citas, fotos, firma.
- Flujo de odontograma: edicion visual, guardado/carga por version, historial y editor por pieza para tablet.

## Frontend principal
- `frontend/js/paciente.js`: monta la vista, renderiza HTML, integra API de paciente/citas/fotos y orquesta odontograma.
- `frontend/js/odontograma.js`: motor completo del odontograma (UI, modos, serializacion JSON, reconstruccion, API global).
- `frontend/css/odontograma.css`: estilos de odontograma normal, menu flotante y modal de seleccion por pieza.

## Estado global usado en Paciente
- `window.pacienteActual`
- `window.citasPaciente`
- `window.fotosPaciente`
- `window.pacienteFotoPrincipalId`
- `window.ultimoOdontogramaId`
- `window.odontogramaData`
- `window.odontogramaBloqueado`
- `window.odontogramaAPI` (`guardar`, `cargar`, `getData`, `setData`, `reset`)

## Flujo principal de paciente
1. Autocomplete de paciente por nombre (`>= 3` chars).
2. Antes de cargar otro paciente desde buscador, valida cambios pendientes y pide confirmacion.
3. Carga detalle completo de paciente.
4. Carga historial de odontogramas y ultimo odontograma del paciente.
5. Edicion y guardado de datos del paciente.
6. Gestion de fotos (subir/listar/eliminar/foto principal).
7. Gestion de citas (crear/editar inline/listar/autorizar).

## Odontograma en la vista Paciente

### Estructura UI
- Toolbar:
  - `Limpiar`
  - `Limpiar pieza`
  - `Seleccion por pieza` (modal amplio para tablet)
  - Toggle `Bloquear odontograma`
  - Label de odontograma actual
  - Select `#fechaO` con historial
- Canvas dental dentro de `#odontograma-wrapper` con 4 filas:
  - permanentes superiores e inferiores
  - temporales superiores e inferiores
- Mensajes de apoyo:
  - `#clean-message`
  - `#ppf-message`
  - `#ppr-message`
  - `#alerta-bloqueo`

### Modos y reglas de edicion
- Modo normal: click/tap en superficie abre menu de tratamientos.
- Modo `Limpiar pieza`: selecciona pieza y ejecuta limpieza focalizada.
- Modo `PPF` y `PPR`: flujo en 2 pasos (inicio/fin) y validacion de misma arcada permanente.
- `PC` (protesis completa): aplica por arcada permanente completa.
- `Realizado` (`RL`): aplica un overlay de circulo + check verde por pieza (tratamiento de pieza completa).
- Bloqueo (`toggle-bloqueo`):
  - impide edicion
  - el toggle se mantiene `disabled` cuando no hay paciente cargado
  - no permite desbloquear si no hay paciente cargado (`pacienteActual.idPaciente`)
  - si se intenta desbloquear sin paciente (evento/manual), revierte a bloqueado automaticamente
  - tambien bloquea inputs del odontograma (`.tooth-note` y `#odonto-piece-input`)
  - al bloquear/desbloquear sincroniza estado visual y funcional de inputs (readOnly/disabled)
  - aplica cursor `not-allowed` en piezas/superficies del odontograma cuando esta bloqueado (`#odontograma-wrapper.odonto-locked`)
  - muestra advertencia: `Debe cargar un paciente para desbloquear el odontograma`
  - muestra alerta de bloqueo
  - cierra modal por pieza si se bloquea durante la edicion

### Menu flotante de tratamientos
- Posicionamiento `fixed` al viewport.
- En resize no se cierra: se reposiciona por ancla de superficie.
- En scroll usa tolerancia (`grace px`) para evitar cierres por micro-movimientos.
- Se cierra cuando la superficie ancla desaparece o queda fuera de viewport.
- `Realizado` se muestra de ultimo en el menu de tratamientos.

### Editor "Seleccion por pieza" (tablet/desktop)
- Se abre desde `#btn-piece-editor`.
- Contiene:
  - select de arcada
  - select de pieza
  - navegacion anterior/siguiente
  - boton `Borrar pieza`
  - diente ampliado interactivo (seleccion de superficie)
  - input de nota de pieza
  - menu de tratamientos dentro del modal
- Swipe horizontal en zona de diente para cambiar de pieza.
- `PPF` y `PPR` se muestran deshabilitados en este modal (se aplican en vista completa).
- Se implemento manejo tactil (`pointerup` + supresion de click duplicado) para evitar doble toque en tablet.

### Modelo JSON de odontograma
- Estructura base:
  - `piezas`
  - `tratamientos_globales` (`PC`, `PPF`, `PPR`)
  - `meta`
- Cada pieza guarda:
  - `superficies` (`mesial`, `distal`, `vestibular`, `palatina`, `oclusal`)
  - `pieza_completa` (E, I, C, RL, X, CR, F)
  - `ppfIds`, `pprIds`, `pc`
  - `nota_input` (texto manual del input por pieza)
- Se preserva texto manual al guardar/cargar (`nota_input`).
- Carga compatible para `Realizado`: acepta `RL` y `REALIZADO`.

### Integracion en `paciente.js`
- Historial para select:
  - `cargarHistorialOdontogramas(idPaciente)`
  - `llenarSelectFechasOdontograma(...)`
- Guardado:
  - `guardarOdontogramaEnBD()`
  - ejecuta `window.odontogramaAPI.guardar()`
  - envia JSON serializado a `POST /api/odontograma`
- Carga por version:
  - `cargarOdontogramaPorId(idOdontograma)`
  - usa `GET /api/odontograma/version/:idOdontograma`
- Carga ultimo:
  - `cargarUltimoOdontogramaPaciente()`
  - usa `GET /api/odontograma/ultimo/:idPaciente`
- Limpieza visual al limpiar vista:
  - `window.odontogramaAPI.reset() + cargar()`
  - resetea label y select de historial
  - cierra modal de seleccion por pieza si esta abierto

### Deteccion de cambios sin guardar
- Snapshot base del odontograma:
  - `capturarSnapshotOdontogramaActual()`
  - `sincronizarSnapshotOdontogramaBase()`
- Comparacion normalizada:
  - ignora `meta.fecha_guardado` y `meta.fecha_cargado`
- Contexto de cambios:
  - `getContextoCambiosPendientesPaciente()`
  - determina: `Paciente`, `Odontograma` o `Paciente y Odontograma`
- Confirmacion reutilizable:
  - `confirmarCambioPacienteSinGuardar(accion)`
  - usa `window.showSystemConfirm(...)` y fallback a `confirm(...)`
- Guard de salida de vista:
  - se registra con `window.__setViewLeaveGuard(...)`
  - bloquea cambio de vista si usuario cancela
  - al cancelar, el menu lateral mantiene el item activo en `Paciente` (no cambia el foco visual a otra vista)
- Guard de cambio de paciente en la misma vista:
  - se aplica antes de cargar otro paciente desde autocomplete
  - tambien se aplica en `window.__pacienteViewAPI.openById(...)` si ya estas en vista Paciente
  - mensaje: `Desea cargar otro paciente sin guardar?`

### Estado visual sin paciente seleccionado
- Cuando no hay paciente cargado (`!pacienteActual.idPaciente`), `actualizarAccionesPaciente()` marca `.paciente-container` con `paciente-sin-seleccion`.
- En ese estado, los controles deshabilitados de tarjetas de paciente (`input/select/textarea/button`) usan cursor `not-allowed`.
- `limpiarVistaPaciente()` deja bloqueada la edicion de Paciente (`setPacienteEdicionHabilitada(false)`) y sincroniza acciones con `actualizarAccionesPaciente()`.
- La edicion se habilita de nuevo al cargar un paciente (`cargarPaciente(...)`) o al iniciar alta nueva desde `Nuevo Paciente` (`setPacienteEdicionHabilitada(true)`).

## Citas de paciente
- Crear cita: modal `#modal-cita-paciente` y `POST /api/paciente/cita`.
- Editar cita inline: `PUT /api/paciente/cita/:id`.
- Listar citas: `GET /api/paciente/:id/citas`.
- Autorizar cita: `POST /api/paciente/cita/:id/autorizar`.

## Regla de autorizacion (backend)
- Si doctor es "registro fisico", queda autorizada automaticamente.
- Si usuario logueado es Doctor y coincide con doctor asignado, autoriza directo.
- Si no, solicita password del doctor para validar.

## Fotos de paciente
- Subir foto: `POST /api/foto-paciente` (multipart `foto`).
- Listar fotos: `GET /api/foto-paciente/:pacienteId`.
- Eliminar foto: `DELETE /api/foto-paciente/:idFotoPaciente`.
- Guardar foto principal: `POST /api/foto-paciente/principal`.

## Firma de paciente
- Guardado: `POST /api/paciente/firma`.
- Backend escribe archivo en `frontend/firmas` y guarda ruta en BD.
- UI:
  - la ruta de firma ya no se muestra al usuario.
  - se guarda en input oculto `#firmaP`.
  - se muestra estado visual en `#firmaEstadoP`:
    - `Firma` (verde)
    - `Sin Firma` (rojo)

## Prefill desde Agenda hacia Paciente
- Fuente: `window.__agendaPacientePrefill`.
- Al abrir Paciente desde Agenda con "Crear":
  - precarga `NombreP` y `telefonoP`
  - precarga `motivoConsultaP` desde comentario de Agenda
  - fuerza `estadoP = Activo (1)` para alta nueva

## Guardado de datos de paciente
- Endpoint: `POST /api/paciente/guardar`.
- Controller: `paciente.controller.guardarPaciente`.
- SP: `sp_paciente_guardar`.

## Validacion de duplicados (Agenda + Paciente)
- Endpoint: `GET /api/paciente/existe`.
- Match por nombre normalizado y opcionalmente por telefono (raw o solo digitos).

## Backend odontograma
- Rutas: `backend/routes/odontograma.routes.js`.
- Controller: `backend/controllers/odontograma.controller.js`.
- Roles permitidos: `Administrador`, `Doctor`, `Asistente`.
- Endpoints:
  - `POST /api/odontograma`
  - `GET /api/odontograma/ultimo/:idPaciente`
  - `GET /api/odontograma/historial/:idPaciente`
  - `GET /api/odontograma/version/:idOdontograma`
- SP usadas:
  - `sp_odontograma_guardar`
  - `sp_odontograma_ultimo`
  - `sp_odontograma_historial`
  - `sp_odontograma_get_by_id`

## Limpieza de vista
- Funcion: `limpiarVistaPaciente()`.
- Resetea estado global, UI, modales, citas, fotos, firma, odontograma y buscadores.
- En mount se registra cleanup:
  - `window.__setViewCleanup(() => limpiarVistaPaciente())`.

## Backend API usada por Paciente (incluyendo odontograma)
- `GET /api/paciente/search`
- `GET /api/paciente/existe`
- `GET /api/paciente/:id`
- `POST /api/paciente/firma`
- `POST /api/paciente/guardar`
- `POST /api/paciente/cita`
- `PUT /api/paciente/cita/:id`
- `POST /api/paciente/cita/:id/autorizar`
- `GET /api/paciente/:id/citas`
- `GET/POST/DELETE /api/foto-paciente/*`
- `POST /api/odontograma`
- `GET /api/odontograma/ultimo/:idPaciente`
- `GET /api/odontograma/historial/:idPaciente`
- `GET /api/odontograma/version/:idOdontograma`
