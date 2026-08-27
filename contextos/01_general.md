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
- Overlay de errores de servidor/red:
  - APIs: `window.notifyServerHttpError`, `window.notifyConnectionError`.
- Motor de sonido:
  - archivo: `frontend/js/uiSounds.js`
  - API global: `window.playUiSound(tipo, opciones)` y `window.uiSound`.
  - sonidos registrados: `info`, `success`, `warning`, `error`, `question`, `bell`, `trash`, `tab`.
- Sonidos automaticos ya integrados:
  - `uiAlerts.js`: sonido segun tipo de alerta.
  - `serverErrorOverlay.js`: sonido de error al mostrar overlay.
  - `web.js` (fetch global):
    - `POST/PUT/PATCH` exitosos -> `success`
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
