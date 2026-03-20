# Vista Login y Auth

## Frontend Login
- Archivo: `frontend/js/login.js`.
- Login normal:
  - `POST /api/auth/login`
  - guarda token en `localStorage`
  - guarda usuario en `sessionStorage`
  - llama `applyMenuPermissions()` y abre vista default por rol.

## Registro oculto
- Shortcut: `Ctrl + Shift + Space`.
- Carga catalogos:
  - `GET /api/auth/registro-oculto/catalogos`
- Crear usuario:
  - `POST /api/auth/registro-oculto`
- `cargo` ya no se captura en UI; backend lo deriva de `rol.nombreR` usando `idRol`.
- Campos requeridos recomendados: `correo`, `password`, `nombre`, `idRol`.
- Campos opcionales: `idDoctor` y `cargo` (retrocompatibilidad con clientes viejos).
- Tiene validaciones de campos, password y confirmacion.

### Hardening aplicado (2026-03-20)
- Guardas anti-duplicado:
  - login (`#btn-login`) evita requests concurrentes.
  - registro oculto (`#btn-registro-guardar`) evita envios dobles.
- Estado de licencia en login:
  - `mountLogin()` ahora invalida/cancela consulta anterior de licencia.
  - evita que respuestas tardias sobrescriban la UI al refrescar rapido.
- Catalogos de registro oculto:
  - se consolida promesa en vuelo para evitar multiples fetch paralelos.

## Backend Auth
- Rutas: `backend/routes/auth.routes.js`.
- Controller: `backend/controllers/auth.controller.js`.
- Service: `backend/services/auth.service.js`.

### Hardening backend aplicado (2026-03-20)
- `auth.controller`:
  - sanitiza correo de login (`trim + lowercase`) y valida longitud.
  - en fallos DB transitorios (`ETIMEDOUT`, `ECONNRESET`, etc.) responde `503` consistente.

## SP/Auth SQL
- `sp_login_usuario`
- `sp_usuario_crear`

## Comportamiento de seguridad
- JWT firmado con `JWT_SECRET`.
- Expiracion del token: `8h`.
- Registro oculto deshabilitado por defecto.
- Se habilita con env: `AUTH_HIDDEN_REGISTER_ENABLED=true`.

## Middleware
- `auth.middleware.js`:
  - exige `Authorization`,
  - valida JWT,
  - inyecta `req.user`.
- `role.middleware.js`:
  - limita acceso por rol en cada endpoint.
