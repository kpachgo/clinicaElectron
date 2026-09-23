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
7. Gestion de citas (crear/editar inline/listar/autorizar/eliminar).
- UX de carga:
  - al montar la vista solo queda visible el buscador.
  - el resto del contenido vive dentro de `#paciente-detail-shell`.
  - al cargar o crear paciente, el buscador se colapsa para dar espacio al expediente.
  - si el usuario hace scroll hacia arriba dentro de la vista, el buscador vuelve a aparecer.
  - durante la carga se muestra `#paciente-load-progress`, un progress circular SVG sin texto basado en `stroke-dashoffset`.
  - el progreso avanza por hitos conservadores: inicio, datos/fotos/citas, historial, ultimo odontograma y cierre.
  - al seleccionar/cargar paciente, el shell aparece con animacion moderna tipo slide/expand y tarjetas en cascada.
  - el reveal usa `clip-path` + `transform` en lugar de animar `max-height`, para evitar tirones en expedientes largos.
  - `Nuevo Paciente` reutiliza la misma animacion de entrada despues de preparar el formulario.
  - `Limpiar Paciente` ejecuta salida animada y vuelve al estado de solo buscador.
  - la animacion respeta `prefers-reduced-motion`.

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

### Impresiones y documentos
- En `Resumen de tratamientos`, las acciones se agrupan asi:
  - `Impresiones:` botones `Pendiente`, `Asistencia`, `Varios`, `Exp`.
  - `Consentimientos:` botones `Endodoncia`, `Ortodoncia`.
  - boton icono `Configuracion` (`#odonto-summary-config-btn`) para editar cabecera/logo global de impresion.
- Los botones de estos grupos usan estilo compacto, cercano al tamano de las pills del resumen.
- La configuracion global de impresion centraliza sucursal/direccion, telefono, logo y marca de agua.
  - Usa `odonto_print_company_config_v1` y `odonto_print_branding_config_v1`.
  - El logo se reemplaza con `/api/paciente/print-branding/logo`.
  - Aplica a documentos generados (`Pendiente`, `Asistencia`, `Exp`, consentimientos).
  - `Varios` imprime PDFs subidos tal cual, sin modificar cabecera/logo.
  - Ya no existe edicion de cabecera dentro de cada modal de documento.
  - No mueve precios locales; la configuracion de precios sigue dentro de `Pendiente`.

### Impresion de expediente
- En `Resumen de tratamientos`, grupo `Impresiones`, existe boton `Exp`.
- Imprime directo sin modal previo.
- Requiere paciente cargado.
- Usa los valores actuales visibles en pantalla, aunque no se hayan guardado todavia.
- Sincroniza el odontograma actual en memoria antes de generar la hoja imprimible.
- Incluye:
  - datos personales,
  - datos clinicos,
  - endodoncia/cirugia,
  - odontograma visual,
  - resumen de tratamientos pendientes y realizados,
  - diagnostico final y notas,
  - firma del paciente/encargado solo si existe,
  - registro de citas.
- No usa logo de fondo/marca de agua, aunque si mantiene logo en cabecera si esta configurado.
- El odontograma se imprime ampliado y en modo solo lectura.
- El CSS de impresion del expediente evita cortes al inicio de paginas nuevas repitiendo padding/borde de la hoja.
- Registro de citas impreso:
  - columnas: fecha, procedimiento, doctor, firma y sello.
  - no imprime `valor`, `abono` ni `saldo`.
  - aplica la misma regla de notas/observaciones de la tabla visible: fecha repetida + montos en `0` + sin doctor oculta fecha, doctor, firma y sello, dejando solo el procedimiento.
  - las filas del expediente tambien se agrupan por fecha (`cita-grupo-par` / `cita-grupo-impar`) para conservar continuidad visual.
  - firma/sello del doctor solo aparecen para citas autorizadas o autorizadas en fisico.
  - citas pendientes no muestran firma/sello.
- Borrado de citas:
  - existe endpoint `DELETE /api/paciente/cita/:id`.
  - solo rol `Administrador` puede eliminar; Doctor, Asistente y Recepcion no deben ver la accion y el backend responde `403` si fuerzan la llamada.
  - en UI el Administrador debe activar manualmente el checkbox `Borrar` en el encabezado de Registro de Citas; inicia apagado por defecto y no se persiste entre sesiones.
  - mientras `Borrar` esta apagado, los iconos de eliminar no se renderizan aunque el usuario sea Administrador.
  - usa `sp_cita_paciente_eliminar` y borra el registro real de `citaspaciente`.
  - al eliminar, la tabla visible recalcula grupos por fecha para mantener el zebra por grupo.
  - las notas/observaciones de fecha repetida tambien pueden eliminarse por admin, pero siguen sin mostrar `$0`, `-` ni chip `Sin doctor`.
- Firma/sello en expediente:
  - usa la firma/sello actuales del registro del doctor devueltos por el listado de citas.
  - si el doctor reemplaza firma o sello, las citas historicas autorizadas mostraran el archivo nuevo al volver a listar/imprimir.
- No incluye Registro de Fotografias.

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
- API publica de navegacion usada por otras vistas:
  - `window.__pacienteViewAPI.openById(idPaciente)`:
    - si no estas en vista Paciente, deja `window.__pacienteAbrirPendienteId` y navega.
    - si ya estas en Paciente, respeta guard de cambios antes de cargar.
  - `window.__pacienteViewAPI.openManualSearch({ query, contacto, message })`:
    - precarga buscador de Paciente para seleccion manual.
    - permite mostrar mensaje contextual (usado por Agenda/En Cola cuando no se puede resolver paciente unico).

### Estado visual sin paciente seleccionado
- Cuando no hay paciente cargado (`!pacienteActual.idPaciente`), `actualizarAccionesPaciente()` marca `.paciente-container` con `paciente-sin-seleccion`.
- En ese estado, los controles deshabilitados de tarjetas de paciente (`input/select/textarea/button`) usan cursor `not-allowed`.
- `limpiarVistaPaciente()` deja bloqueada la edicion de Paciente (`setPacienteEdicionHabilitada(false)`) y sincroniza acciones con `actualizarAccionesPaciente()`.
- La edicion se habilita de nuevo al cargar un paciente (`cargarPaciente(...)`) o al iniciar alta nueva desde `Nuevo Paciente` (`setPacienteEdicionHabilitada(true)`).

## Citas de paciente
- UX tabla 2026-08-01:
  - solo `Registro de Citas` (`.citas-table`) fue migrada al patron compacto unificado,
  - contenedor con borde completo y radio 12px,
  - encabezado sticky uppercase de 10px,
  - filas de ~34px con padding 5px/7px y zebra blanco/gris suave,
  - colores controlados por tokens `--pac-table-*` para compatibilidad con `dark`, `vampire` y `princess`,
  - el zebra se agrupa por fecha (`cita-grupo-par` / `cita-grupo-impar`) para que citas/notas del mismo dia compartan fondo,
  - una fila de fecha repetida con `valorCP`, `abonoCP`, `saldoCP` en `0` y sin doctor se trata como nota/observacion: oculta valor, abono, saldo, doctor y accion, pero conserva el procedimiento,
  - intencion: si una asistente registra una cita cobrable y luego se agrega otra fila el mismo dia solo como observacion clinica (ej. pieza queda en observacion), esa segunda fila debe sentirse visualmente como continuacion de la cita original, no como cobro ni cita independiente,
  - las notas/observaciones de fecha repetida no muestran `$0`, `$0.00`, `-`, `Sin doctor`, firma ni sello; internamente conservan la fecha y los ceros para trazabilidad,
  - si una fila de fecha repetida tiene precio, abono, saldo o doctor asignado, se renderiza como cita normal y no se ocultan sus columnas,
  - no tocar seccion de odontograma, `odontograma.css`, selectores `odonto*`, `tooth*` ni `#odontograma-wrapper` al hacer ajustes de tablas.
- Crear cita: modal `#modal-cita-paciente` y `POST /api/paciente/cita`.
- Editar cita inline: `PUT /api/paciente/cita/:id`.
- Listar citas: `GET /api/paciente/:id/citas`.
- Autorizar cita: `POST /api/paciente/cita/:id/autorizar`.
- Reglas UI relevantes:
  - `Procedimiento` en cita tiene limite de `500` caracteres (validado frontend/backend).
  - Select de doctor se llena con `GET /api/doctor/select?soloActivos=1`.
  - Si usuario logueado es `Doctor`, el select usa `soloVinculado=1`; si tiene doctor vinculado unico, queda preseleccionado y bloqueado.
  - Backend blinda la creacion de cita:
    - rol `Doctor` solo puede registrar con su propio doctor vinculado,
    - si no envia doctor, backend asigna automaticamente su doctor vinculado,
    - si intenta enviar otro `doctorId`, responde `403`,
    - `Administrador`, `Recepcion` y `Asistente` pueden seleccionar cualquier doctor activo.
  - Checkbox `Ver firma/sello` en encabezado de Registro de Citas:
    - inicia activo por defecto; si el usuario lo apaga, esa preferencia se guarda por sesion/usuario en `sessionStorage`.
    - cuando esta activo, la columna `Accion` muestra firma y sello para citas autorizadas sin chip `Autorizado`.
    - citas pendientes siguen mostrando solo `Pendiente` + `Autorizar`.
    - si el Protocolo de Seguridad global esta activo, queda marcado y bloqueado como visible mientras dure el protocolo, sin sobrescribir la preferencia guardada de sesion.
  - Checkbox `Borrar` en encabezado de Registro de Citas:
    - solo se muestra a `Administrador`.
    - activa/desactiva los iconos de eliminar de todas las filas.
    - siempre inicia apagado para reducir borrados accidentales.
  - La columna `Accion` muestra estado:
    - `Sin doctor`
    - check verde compacto para `Autorizado` y `Autorizado en fisico` cuando `Ver firma/sello` esta apagado
    - `Pendiente` + boton `Autorizar`
  - Boton `Ver` (firma/sello del doctor) queda deshabilitado mientras la cita no este autorizada.
  - Boton `Ver` consulta `/api/doctor/:id?contexto=paciente`, permitiendo que un doctor logueado vea la ficha del doctor asociado a una cita/expediente aunque no sea su propio registro.
  - Boton `Ver` se oculta cuando `Ver firma/sello` esta activo para evitar duplicar firma/sello.
  - La firma/sello visible usa los archivos actuales del doctor, aunque el doctor este inactivo.

## Regla de autorizacion (backend)
- Si la cita se crea sin doctor asignado, queda autorizada automaticamente (`SIN_DOCTOR`).
- Si doctor es "registro fisico", queda autorizada automaticamente.
- Si usuario logueado es Doctor y coincide con doctor asignado, autoriza directo.
- Si no, solicita password del doctor para validar.

## Fotos de paciente
- Subir foto: `POST /api/foto-paciente` (multipart `foto`).
- Listar fotos: `GET /api/foto-paciente/:pacienteId`.
- Eliminar foto: `DELETE /api/foto-paciente/:idFotoPaciente`.
- Guardar foto principal: `POST /api/foto-paciente/principal`.
- Permisos de borrado (`DELETE /api/foto-paciente/:idFotoPaciente`):
  - permitido para `Administrador`, `Asistente`, `Doctor`.
  - `Recepcion` no tiene permiso de borrado.
- UX de borrado:
  - frontend captura `403` y muestra mensaje claro (`No tiene acceso para borrar la fotografia`).
  - si se elimina la foto principal actual, se limpia `fotoPrincipalId` en estado local/UI.

## Firma de paciente
- Guardado: `POST /api/paciente/firma`.
- Backend escribe el archivo en `firmasDir` (`storagePaths`, compatible con persistencia externa de Electron) y guarda ruta publica `/firmas/...` en BD.
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
 - Hardening 2026-03-20:
  - cleanup invalida y aborta requests en vuelo para evitar respuestas tardias al cambiar de vista.

## Hardening aplicado (2026-03-20)
- Frontend (`frontend/js/paciente.js`)
  - control unificado `abort + seq` para:
    - autocomplete de paciente
    - carga de detalle de paciente
    - carga de citas y fotos
    - historial/carga de odontograma
    - selects de doctor y modal "Ver doctor"
  - guardas anti-duplicado para acciones criticas:
    - guardar paciente, cita, firma y odontograma
    - subir/eliminar foto y cambiar foto principal
    - autorizar cita
- Backend
  - `backend/controllers/paciente.controller.js`:
    - validaciones adicionales de IDs y fechas ISO.
    - lecturas con retry en errores transitorios de DB.
    - respuesta `503` para fallos transitorios (`ETIMEDOUT`, `ECONNRESET`, etc).
  - `backend/controllers/odontograma.controller.js`:
    - validaciones de IDs/fecha y JSON de odontograma.
    - lecturas con retry y respuesta `503` en fallos transitorios.

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
- `POST /api/foto-paciente`
- `GET /api/foto-paciente/:pacienteId`
- `DELETE /api/foto-paciente/:idFotoPaciente`
- `POST /api/foto-paciente/principal`
- `GET /api/doctor/select?soloActivos=1` (soporte para modal de cita)
- `GET /api/doctor/:id` (modal "Ver doctor" en tabla de citas)
- `POST /api/odontograma`
- `GET /api/odontograma/ultimo/:idPaciente`
- `GET /api/odontograma/historial/:idPaciente`
- `GET /api/odontograma/version/:idOdontograma`

## Migraciones recientes de citas
- `backend/sql/2026-08-01_cita_paciente_eliminar.sql`
  - crea `sp_cita_paciente_eliminar`.
  - habilita borrado real de citas desde backend solo para flujo Administrador.
- `backend/sql/2026-07-30_cita_firma_sello_visible.sql`
  - actualiza `sp_cita_paciente_listar`.
  - devuelve `FirmaD` y `SelloD` solo cuando la cita tiene doctor y esta autorizada o es `registro fisico`.
  - citas sin doctor o pendientes devuelven esos campos en `NULL`.

## Protocolo de seguridad global (2026-04-16)
- Esta vista queda afectada en los endpoints de lectura de paciente.
- Cuando el protocolo esta ON:
  - `GET /api/paciente/search` (SP `sp_paciente_buscar_ligero`) solo retorna `Odontologia`.
  - `GET /api/paciente/:id` (SP `sp_paciente_get_by_id`) no devuelve fila para pacientes fuera de `Odontologia`.
- Impacto UX:
  - pacientes de `Ortodoncia` dejan de aparecer en busquedas/carga durante el modo ON.
  - al volver OFF, reaparecen sin perder datos.
- Referencia completa:
  - `contextos/15_protocolo_seguridad.md`.

## Ajustes recientes (2026-09-23) - Registro de Citas
- Checkbox `Ver firma/sello` ahora inicia activo por defecto:
  - `restoreCitasFirmaSelloToggle()` usa `citasFirmaSelloVisible !== false` (antes `=== true`) y el input se renderiza con `checked`.
  - si el usuario lo apaga, se respeta por sesion/usuario en `sessionStorage`; el Protocolo de Seguridad sigue forzandolo activo.
  - con el checkbox activo el boton `Ver` se oculta (comportamiento existente), por lo que por defecto la firma/sello se ven directo en la columna `Accion`.
- Motivo: desde la tablet no se veia la firma/sello; la sesion de la tablet arrancaba con el checkbox apagado mientras en la PC estaba activo.
- Relacionado: bug de canvas de firma en tablet corregido en `contextos/04_doctores.md` (Ajustes recientes 2026-09-23).
