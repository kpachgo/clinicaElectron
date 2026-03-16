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
