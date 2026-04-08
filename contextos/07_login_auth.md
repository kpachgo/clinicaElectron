# Vista Login y Auth

## Alcance de este contexto
- Pantalla de login y registro oculto en frontend.
- Gateo por licencia antes de permitir autenticacion.
- Sesion cliente (token/usuario), permisos de menu y logout.
- Endpoints y validaciones backend de auth/licencia.

## Frontend involucrado
- `frontend/js/login.js`: flujo visual de licencia + login + registro oculto.
- `frontend/js/web.js`: estado de sesion, permisos por rol, navegacion inicial y logout.
- `frontend/css/login.css`: estilos de login, activacion y bloqueos por licencia.

## Flujo real de entrada al sistema
1. En `DOMContentLoaded`, `web.js` valida sesion:
  - si hay `token` y `user`, aplica permisos y abre vista default por rol.
  - si hay `token` sin `user`, limpia token y fuerza login limpio.
2. `mountLogin()` (`web.js`) oculta topbar/sidebar funcional y monta `window.__mountLogin`.
3. `__mountLogin` (`login.js`) consulta estado de licencia:
  - `GET /api/licencia/estado?_ts=...` (opcional `force=1`).
4. Segun licencia:
  - `startup.ok = false` -> pantalla de activacion inicial.
  - `startup.ok = true` y `usage.ok = false` -> pantalla "Sistema bloqueado".
  - `startup.ok = true` y `usage.ok = true` -> formulario de login normal.

## Pantallas de licencia en Login

### Activacion inicial
- Se muestra cuando `startup.ok` es falso.
- UI incluye:
  - estado de arranque/suscripcion,
  - licencia enmascarada,
  - `deviceId`,
  - input de codigo.
- Acciones:
  - activar equipo: `POST /api/licencia/activar-inicial`.
  - revalidar: vuelve a montar login con `forceStatus=true`.
- Atajos:
  - `Enter` en codigo dispara activacion.

### Sistema bloqueado por suscripcion
- Se muestra cuando arranque esta OK pero `usage.ok` es falso.
- Solo permite revalidar estado (`/api/licencia/estado?force=1`).

## Login normal
- Endpoint:
  - `POST /api/auth/login`.
- Payload:
  - `correo`, `password`.
- Respuesta exitosa:
  - `token` JWT (expira en `8h`),
  - `usuario` (`idUsuario`, `correo`, `nombre`, `cargo`, `idRol`, `rol`).
- Persistencia cliente:
  - `localStorage["token"]`,
  - `sessionStorage["user"]`.
- Despues de login:
  - renderiza usuario en topbar,
  - muestra chrome app,
  - aplica permisos de menu (`applyMenuPermissions`),
  - refresca aviso de suscripcion,
  - abre vista default por rol (`getDefaultViewByRole`).

## Registro oculto
- Shortcut global en login:
  - `Ctrl + Shift + Space` abre/cierra panel.
  - `Escape` lo oculta si esta abierto.
- Catalogos:
  - `GET /api/auth/registro-oculto/catalogos`.
- Crear usuario:
  - `POST /api/auth/registro-oculto`.
- Campos enviados:
  - `correo`, `password`, `nombre`, `idRol`, `idDoctor` (nullable).
- Reglas UI:
  - exige campos obligatorios,
  - valida confirmacion de password,
  - minimo 6 caracteres.

## Sesion y permisos (web.js)
- Mapa de vistas por rol:
  - `Administrador`: `Agenda`, `Paciente`, `En Cola`, `Doctores`, `Servicios`, `Cobro`.
  - `Recepcion`: `Agenda`, `Paciente`, `En Cola`, `Servicios`, `Cobro`.
  - `Doctor`: `Paciente`, `En Cola`, `Doctores`.
  - `Asistente`: `Paciente`, `En Cola`.
- Vista default:
  - `Administrador/Recepcion`: `Agenda`.
  - `Doctor/Asistente`: `Paciente`.
- `window.fetch` global:
  - agrega `Authorization: Bearer <token>` si existe token,
  - notifica errores HTTP y de conexion en UI.
- Logout:
  - limpia token y usuario,
  - limpia topbar/alerta de licencia,
  - vuelve a `mountLogin()`.

## Backend Auth
- Rutas: `backend/routes/auth.routes.js`.
  - `POST /api/auth/login`
  - `POST /api/auth/registro-oculto`
  - `GET /api/auth/registro-oculto/catalogos`
- Controller: `backend/controllers/auth.controller.js`.
- Service: `backend/services/auth.service.js`.

### Login backend (`auth.controller.login`)
- Sanitiza correo (`trim + lowercase`) y valida longitud.
- Antes de autenticar, valida licencia:
  - `licenciaService.getRuntimeStatus().startup`
  - `licenciaService.validateSystemUsageConfigured({ force: true })`
- Si licencia bloquea:
  - responde `403` o `503` segun `code`.
- Si credenciales validas:
  - firma JWT con `JWT_SECRET`,
  - payload: `idUsuario`, `rol`,
  - `expiresIn: "8h"`.

### Registro oculto backend
- Disponible solo si `AUTH_HIDDEN_REGISTER_ENABLED=true` (si no, `404`).
- Validaciones:
  - `correo`, `nombre`, `idRol` validos,
  - `password` minimo 6,
  - `idDoctor` opcional valido.
- `cargo` no se captura desde frontend:
  - se deriva de `rol.nombreR` via `idRol`.
- Conflicto de correo:
  - responde `409` cuando SP devuelve `EL_CORREO_YA_EXISTE`.

## Backend Licencia relacionado al login
- Rutas publicas:
  - `GET /api/licencia/estado`
  - `POST /api/licencia/activar-inicial`
- Controller: `backend/controllers/licencia.controller.js`.
- Service: `backend/services/licencia.service.js`.
- En arranque del servidor (`backend/server.js`):
  - ejecuta `initializeRuntimeValidation()`.
- Proteccion de APIs funcionales:
  - rutas de negocio (`agenda`, `doctor`, `servicio`, `paciente`, `cuenta`, `odontograma`, `foto-paciente`, `cola`) usan `licencia.middleware.requireLicensedAccess`.

## SP/Auth y licencia usados
- Auth:
  - `sp_login_usuario`
  - `sp_usuario_crear`
- Registro catalogos:
  - `rol` (SELECT directo)
  - `sp_doctor_listar_select`
- Licencia:
  - `sp_licencia_resolver_por_device`
  - `sp_licencia_validar_arranque`
  - `sp_licencia_validar_uso_sistema`
  - `sp_licencia_activar_inicial`

## Middleware de seguridad
- `backend/middlewares/auth.middleware.js`:
  - exige header `Authorization`,
  - valida JWT,
  - inyecta `req.user`.
- `backend/middlewares/role.middleware.js`:
  - valida `req.user.rol`,
  - restringe endpoints por lista de roles.
- `backend/middlewares/licencia.middleware.js`:
  - bloquea acceso cuando licencia/suscripcion no estan autorizadas.

## Endurecimiento aplicado
- Frontend (`frontend/js/login.js`)
  - guardas anti-duplicado:
    - login (`loginInFlight`),
    - registro oculto (`registroInFlight`).
  - estado de licencia robusto:
    - `loginMountSeq` para ignorar respuestas viejas,
    - `AbortController` para cancelar consulta previa.
  - catalogos de registro:
    - deduplicacion de request en vuelo (`registroCatalogosPromise`).
- Backend (`backend/controllers/auth.controller.js`)
  - manejo uniforme de errores DB transitorios con `503`.
  - validaciones estrictas de correo/rol/cargo derivado.
