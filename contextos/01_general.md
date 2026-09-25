# Contexto general

## Stack y estructura
- Frontend SPA: `frontend/index.html` + modulos JS en `frontend/js/*.js`.
- Backend API: Express en `backend/server.js`.
- Base de datos: MySQL con SP en `backend/sql/*.sql`.
- Auth: JWT por `Authorization: Bearer <token>`.
- UI de alertas/errores:
  - `frontend/js/uiAlerts.js`
  - `frontend/js/serverErrorOverlay.js`
  - `frontend/js/uiSounds.js`

## Cambios recientes documentados (2026-07-30)
- Tema blanco / chrome principal:
  - `light` sigue como tema predeterminado y ahora usa refresh azul clinico del chrome principal.
  - `style.css` agrega variables `--app-*` para topbar, contenido, botones superiores, nav activo y avatar.
  - `theme-light.css` conserva la paleta base clara y ajustes del odontograma por pieza.
  - `web.js` renderiza iniciales en `#top-user-avatar`; `index.html` incluye ese nodo en la topbar.
- Agenda:
  - autocomplete de servicios en `Comentario` reemplaza solo el token actual, evitando duplicar texto como `promo Promo Rellenos`.
- Paciente:
  - `Registro de Citas` puede mostrar firma/sello visibles con checkbox por sesion/usuario.
  - protocolo de seguridad fuerza ese checkbox activo y bloqueado.
  - citas autorizadas con checkbox apagado muestran check verde compacto; con checkbox activo muestran firma/sello sin chip `Autorizado`.
  - si el usuario es `Doctor`, al registrar cita solo puede seleccionar su propio doctor vinculado.
  - `Imprimir Exp` genera expediente completo sin precios, con odontograma, resumen, diagnostico y registro de citas con firma/sello autorizados.
  - engrane de `Resumen de tratamientos` abre configuracion global de impresion para cabecera/logo/marca de agua.
- Doctores:
  - `Administrador` y `Recepcion` ven todos los doctores; `Doctor` solo ve su propio registro; `Asistente` no accede a vista Doctores.
  - `Doctor` ve su firma/sello visibles, puede reemplazarlos, cambiar su estado, cambiar su contrasena y autorizar citas pendientes rapidamente.
- Cobro:
  - con protocolo de seguridad ON, `Cuentas del dia` no muestra cuentas asociadas a pacientes `Ortodoncia`; si solo hay cuentas de ortodoncia, aparece vacio.
- Auth:
  - endpoint autenticado `POST /api/auth/change-password` para rol `Doctor`.
- Release Windows:
  - build local Windows genera `.exe`, `.exe.blockmap` y `latest.yml`; al subir los tres al release, `electron-updater` puede detectar nuevas versiones.

## Rutas API montadas
- `/api/auth`
- `/api/agenda`
- `/api/cola`
- `/api/doctor`
- `/api/servicio`
- `/api/paciente`
- `/api/cuenta`
- `/api/odontograma` (no analizado en este contexto)
- `/api/foto-paciente`
- `/api/mensajes` y `/api/mensajes-view` (vista Mensajes; ver `20_estado_actual_vista_mensajes.md`)

## Navegacion SPA y permisos
- Archivo: `frontend/js/web.js`.
- `loadView(name)` monta vistas y sincroniza menu activo.
- Sistema de limpieza por vista: `window.__setViewCleanup(fn)` y `runCurrentViewCleanup()`.
- Roles y vistas:
  - `Administrador`: Agenda, Paciente, En Cola, Doctores, Servicios, Cobro
  - `Recepcion`: Agenda, Paciente, En Cola, Servicios, Cobro
  - `Doctor`: Paciente, En Cola, Doctores
  - `Asistente`: Paciente, En Cola
- Cambio de vista:
  - el sonido `notebook-tab-changed.ogg` se dispara en click del menu lateral (`.accordion`).
  - el estado visual `active` del menu no se cambia por click directo; se sincroniza solo con `syncActiveAccordion(viewName)` cuando `loadView(name)` si cambia de vista.
  - si un guard de salida cancela la navegacion (ej. cambios sin guardar), el foco visual del menu se mantiene en la vista actual.
  - iconografia actual del topbar/menu: SVG inline estilo `Heroicons outline` (sin CDN), usando `stroke=\"currentColor\"` para respetar tema.

## Sesion y usuario
- Token en `localStorage.token`.
- Usuario en `sessionStorage.user`.
- Topbar usa `renderTopUser()` en `web.js`.
- Logout limpia token, user y vuelve a login.

## Utilidades backend comunes
- `middlewares/auth.middleware.js`: valida JWT y carga `req.user`.
- `middlewares/role.middleware.js`: valida rol permitido.
- `utils/http.js`: respuestas `badRequest`, `notFound`, `serverError`.
- `utils/dbResult.js`: helpers `firstResultSet`, `firstRow`.

## Alertas, errores y sonidos (frontend)
- Alertas del sistema:
  - `window.alert` esta parcheado para usar modal propio (`uiAlerts.js`).
  - APIs: `window.showSystemMessage`, `window.showSystemConfirm`, `window.showSystemPrompt`.
  - Estilo "Mensaje": icono grande centrado con pop, entrada/salida bounce (`is-open` / `is-closing`, 420 ms antes de abrir el siguiente de la cola; la promesa resuelve al instante).
  - Titulo por defecto segun tipo/modo (Informacion, Listo, Atencion, Ocurrio un error, Confirmar); `options.title` lo reemplaza.
- Overlay de errores de servidor/red:
  - APIs: `window.notifyServerHttpError`, `window.notifyConnectionError`.
- Spinner de carga "diente" (`frontend/js/toothSpinner.js`, CSS en `animaciones.css`):
  - `window.toothSpinner.html({ label, size, variant })` devuelve el markup; sin `variant` elige al azar entre brillo, llena, dibuja, balanceo, salta, gira, colorea (elegidas por el usuario en `prueba.html`).
  - Color por `--tooth-ld-color` (default `--app-primary`). Usado en: carga de paciente (`#paciente-load-progress`, color `--pac-load-ring-value`, centrado en el area de la ficha; ya no muestra porcentaje; minimo 1,2 s visible SOLO aqui) y overlay "Cargando odontograma..." (`#odontograma-loading-spinner`, sin tiempo minimo, nuevo diente al azar cada vez que aparece, mismo color `--pac-load-ring-value` que la carga de paciente).
  - Tablas: `toothSpinner.tableLoading(tbody, { label })` devuelve `stop()` (llamar en el finally): aparece tras 150 ms, no aparece si la tabla se repinta antes, solo quita su propia fila, sin tiempo minimo. Tablas con fila de carga propia usan `tableRowHtml(tbody, label)` / `cellHtml(label)`. CSS unico `.tooth-ld-row` / `.tooth-ld-cell` en animaciones.css.
  - Aplicado en: agenda (dia, inasistencias), cobro (cuentas, descuentos, reporte mensual, faltantes), citas del paciente, En Cola (por estado `colaCargando` dentro de `draw()`: la tabla vacia muestra el diente en vez de "Sin pacientes en cola" hasta que llega la cola, porque otros draw() durante el montaje pisaban el spinner), doctores, pendientes de autorizacion, servicios, monitor de seguimiento. No en refrescos automaticos en segundo plano.
- Llenado de tablas animado (`frontend/js/tableFx.js`, CSS "LLENADO DE TABLAS" en `animaciones.css`; diseno aprobado en `prueba.html`, seccion "Tabla combinada"):
  - `window.tableFx.render(tbody, () => repintadoExistente())`: envuelve el repintado sincronico que ya tenga la vista (vaciar + reconstruir el tbody). O en dos pasos para repintados con varios `return`: `const fx = window.tableFx?.begin(tbody);` antes de vaciar y `fx?.end();` al final y antes de cada `return` (patron usado en todas las vistas). Cada `<tr>` necesita `data-fx-key` (id estable) y opcional `data-fx-sig` (resumen del contenido; `JSON.stringify(item)` sirve; no incluir estados transitorios como "guardando" o "marcado" para que no destelle dos veces).
  - Repintado doble seguido (Cobro cuentas: `drawCuentaRows` + `aplicarFiltroCuenta`; En Cola en el montaje): la fila que seguia cayendo continua su animacion en la nueva (`data-fx-enter`/`data-fx-t0`, delay negativo) en vez de aparecer de golpe.
  - Filas que entran fuera de pantalla (tabla bajo el borde como Cuentas del dia, o abajo en su scroll): quedan `tr.fx-pending` (opacity 0) y caen en cascada al aparecer (IntersectionObserver `revealLater`); siguen pendientes si la tabla se repinta; en `@media print` se muestran.
  - Si antes no habia filas con clave (carga del dia / tras el diente) las filas caen en 3D escalonadas (`fx-in-load`, T8). Si ya habia: las que siguen se deslizan a su nuevo lugar (FLIP), las que entran caen (`fx-in-drop`), las que salen se van por la derecha en una capa fija recortada al area visible y bajo el thead (`.fx-ghost-layer`), y las de `data-fx-sig` distinto destellan (`fx-changed`) (T9). Como en la prueba, primero salen (200 ms) y luego se deslizan/entran; mientras tanto el contenedor de la tabla (`table.parentElement`) sostiene su altura previa con `min-height` y despues se encoge suave (si se encogia de golpe, recortaba las filas que suben y la busqueda "no se veia"). El area visible se mide antes (salidas) y despues (entradas) del repintado. Solo anima filas visibles; respeta `prefers-reduced-motion`.
  - `window.tableFx.toggle(table, () => cambiarClasesQueOcultan(), { selector })`: para checkboxes que muestran/ocultan columnas o elementos (display:none por clase). `apply()` solo debe cambiar clases de la tabla: si algo se oculta, la tabla vuelve COMPLETA a sus clases anteriores mientras eso sale (`fx-cell-out`, 200 ms) y luego se aplican las nuevas (re-mostrar solo las celdas que salen dejaba los anchos nuevos y las columnas "retrocedian"), las demas celdas se deslizan en X a su nuevo lugar y lo que aparece cae en cascada por fila (`fx-cell-in`). Si una celda entera entra/sale, sus hijos no se animan aparte.
  - Aplicado en: agenda (piloto, `drawRows` -> `drawRowsNow`, clave `idAgendaAP`; checkboxes Numeracion/SMS/Llamada/Presente via `animarColumnasAgenda`, selector `.agenda-col-num, .agenda-col-contacto, .agenda-contacto-flag`). Vista Mes de agenda con el mismo patron (`animarCalendarioMes` en agenda.js, sin tableFx porque es grid): `.agenda-month-day` ya NO tiene animacion fija (se animaba en cada pintado = doble pop). Modos segun `agendaMonthLastRender`/`agendaMonthFxEnter`: `skeleton` (mes sin datos cargando: dias caen con `.agenda-month-sk` en vez de "0 tratamientos"), `fill` (llegan datos tras skeleton: conteo/etiqueta/muestras caen en cascada), `enter` (entrar a la vista o cambiar de mes con cache: dias caen), `update` (busqueda/filtros: solo "pop" `fx-month-changed` en conteos que cambian, via `data-fx-sig`). Agenda tambien en el modal de posibles inasistencias (clave `idAgendaAP`, sig sin el checkbox).
    - En Cola (`draw`, clave `idColaPaciente`; checkbox Numeracion via `tableFx.toggle` selector `.cola-col-num`, ya no repinta filas salvo tabla vacia por el colspan).
    - Servicios (`drawRows`, clave `id`), Doctores (`drawRows` clave `id`; `drawPendientes` clave `idCita`).
    - Monitor de Seguimiento (`renderTableRows`, clave `idPaciente` en el HTML; checkboxes Numeracion/SMS/Llamada/Proxima via `animarColumnasMonitor`, selector `.ms-col-num, .ms-col-contacto, .ms-contacto-flag, .ms-col-proxima`; ocultar Proxima con filtro activo recarga, sin toggle animado).
    - Cobro: carrito (`refrescarTabla`, clave id del servicio), faltantes (clave idPaciente|nombre|hora), reporte mensual (clave idPaciente o nombre), cuentas (`drawCuentaRows`, clave `idCuenta`; checkboxes #/Doctor via `animarColumnasCuenta`, ya no repinta salvo tabla vacia), descuentos (clave `idDescuento`).
    - Paciente: citas (`renderCitasPaciente`, clave `idCita` si no es 0).
- Modales con bounce (apertura/cierre), solo CSS al final de `frontend/css/animaciones.css`:
  - Familias cubiertas: `.modal` (abre con `.show` o `style.display = "flex"`), `[hidden]` (agenda resumen/INA, cobro, mensajes settings, odonto print) e `.is-open` (backup, odonto pieza/dictado); `.db-config-modal` solo entrada.
  - Salida via `transition: display allow-discrete` (Chromium 117+, Electron 37 ok): el overlay sigue visible ~0.42 s con `pointer-events: none` mientras el panel sale.
  - Solo los modales con `<canvas>` (firmas) usan fundido. Los del odontograma (pieza, dictado, impresion con consentimientos, config de impresion, multi-PDF) usan bounce: revisados, no miden dentro de la tarjeta y la impresion oculta todo con `@media print` + `display:none !important`: miden con `getBoundingClientRect` al abrir y el `scale()` del bounce romperia el tamano del canvas/puentes.
  - Un modal nuevo que abra con otro mecanismo (ej. `display: grid`) debe agregarse a esos selectores o quedaria con `opacity: 0`.
- Toasts (avisos no bloqueantes):
  - API: `window.showToast(mensaje, { type, title, duration })` en `uiAlerts.js`, CSS en `uiAlerts.css` (temas dark/vampire/princess).
  - `type`: `info|success|warning|error` (si falta se infiere del texto igual que `alert`). Se cierra solo, pausa con hover, clic cierra; mensajes iguales no se apilan (se reinicia el existente); maximo 4 visibles.
  - `success` no suena (ya suena el fetch global); el resto usa `playUiSound` segun tipo.
  - Agenda usa `agendaToast(msg, tipo)` para validaciones y errores de edicion. Siguen como `alert` modal solo los criticos: verificacion de guardado de cita, error interno del modal, busqueda manual de paciente y los fallback de conexion.
- Botones de guardar animados (spinner -> check / error):
  - archivo: `frontend/js/saveFeedback.js`, CSS al final de `frontend/css/animaciones.css`.
  - API: `window.saveFx.start(btn)` antes del fetch, `await window.saveFx.success(btn)` antes de cerrar modal/alert, `window.saveFx.error(btn)` en el catch y `window.saveFx.stop(btn)` en el finally.
  - Colores desde el tema activo (`--success`, `--danger`); spinner/check usan `currentColor`. Sin sonido propio (el fetch global de `web.js` ya suena). Si ademas se muestra un dialogo de exito, usar `showSystemMessage(msg, { type: "success", silent: true })`: con la espera del check ya no coincide con el sonido del fetch y se oirian dos. Guardar Paciente muestra el dialogo de exito por preferencia del usuario.
  - Aplicado en: agenda (Guardar cita), paciente (Guardar Paciente, Guardar cita), cobro (Guardar cobro), doctor (registrar, firma, contrasena), servicios.
- Motor de sonido:
  - archivo: `frontend/js/uiSounds.js`
  - API global: `window.playUiSound(tipo, opciones)` y `window.uiSound`.
  - sonidos registrados: `info`, `success`, `warning`, `error`, `question`, `bell`, `trash`, `tab`.
- Sonidos automaticos ya integrados:
  - `uiAlerts.js`: sonido segun tipo de alerta.
  - `serverErrorOverlay.js`: sonido de error al mostrar overlay.
  - `web.js` (fetch global):
    - `POST/PUT/PATCH` exitosos -> `success`
    - `fetch(url, { __silent: true })` evita el sonido en POST de solo consulta (ej. `/api/agenda/precheck-registro`).
    - `DELETE` exitoso -> `trash`
    - si respuesta JSON trae `ok: false`, no suena exito.

## Notas tecnicas detectadas
- `backend/routes/cobro.routes.js` existe como placeholder y no se monta en `server.js`.
- `backend/config/db.js` tiene `module.exports = pool` duplicado (no rompe, pero esta repetido).

## Estado de revision de vistas (rendimiento/bugs)
- Revisadas y corregidas en esta ronda:
  - Agenda
  - Servicios
  - Doctores
  - En Cola
  - Cobro
- Pendientes para siguiente ronda:
  - Paciente (incluye odontograma)
  - Login/Auth
- Referencia de seguimiento: `contextos/13_revision_vistas_pendientes.md`.
