# Protocolo de Seguridad Global

## Estado actual
- Estado de referencia: **2026-04-16**.
- Implementado como modo global ON/OFF.
- Objetivo:
  - cuando esta ON, ocultar datos de pacientes `Ortodoncia` en flujos sensibles.
  - los datos no se eliminan ni se modifican: solo se filtran en lectura.

## Alcance funcional real (ON)
- Busqueda ligera de pacientes:
  - solo devuelve pacientes con `tipoTratamientoP = Odontologia`.
- Carga de paciente por ID:
  - si el paciente no es `Odontologia`, no retorna fila.
- Agenda:
  - listados por fecha y por mes devuelven solo registros que se puedan asociar a paciente `Odontologia`.
- Monitor de seguimiento:
  - fuerza filtro de tratamiento a `odontologia` aunque frontend envie `all`.

## Lo que NO hace
- No borra pacientes ni citas.
- No altera datos historicos.
- No cambia permisos de roles existentes.
- No aplica automaticamente sobre todos los modulos del sistema:
  - el filtro activo esta implementado en los SP migrados de este paquete.

## Base de datos y migracion
- Script principal:
  - `backend/sql/2026-04-16_security_protocol_global_sp.sql`
- Crea/ajusta:
  - tabla `seguridad_protocolo_config` (estado global ON/OFF).
  - tabla `paciente_seguimiento_contacto`.
  - columnas e indices idempotentes en `agendapersona` y `paciente`.
- SP incluidos en el script:
  - `sp_seguridad_protocolo_get`
  - `sp_seguridad_protocolo_set`
  - `sp_paciente_buscar_ligero`
  - `sp_paciente_get_by_id`
  - `sp_agenda_create`
  - `sp_agenda_update`
  - `sp_agenda_por_fecha`
  - `sp_agenda_buscar_mes`
  - `sp_paciente_monitor_seguimiento_listar`
  - `sp_paciente_monitor_seguimiento_totales`
  - `sp_paciente_monitor_contacto_guardar`

## Backend (API de control de protocolo)
- Ruta base:
  - `/api/seguridad-protocolo`
- Endpoints:
  - `GET /api/seguridad-protocolo`
    - autenticado (`auth`), sin restriccion extra de rol.
    - retorna estado actual del protocolo.
  - `PUT /api/seguridad-protocolo`
    - autenticado + roles `Administrador` o `Recepcion`.
    - body: `{ enabled: 0|1 }`.
    - persiste estado global via `sp_seguridad_protocolo_set`.
- Archivos:
  - `backend/controllers/seguridadProtocolo.controller.js`
  - `backend/routes/seguridadProtocolo.routes.js`
  - `backend/server.js` (registro de ruta)

## Frontend (control operativo)
- Archivo principal:
  - `frontend/js/web.js`
- Comportamiento:
  - lee estado al iniciar sesion (y al cargar app con sesion activa).
  - muestra chip en topbar con texto `ON`/`OFF`.
  - cuando esta OFF, el chip permanece oculto.
  - no muestra tooltip al pasar el mouse.
  - atajo global:
    - `Ctrl + Shift + P` para alternar ON/OFF.
    - pide confirmacion.
    - guarda en backend.
    - recarga vista actual para reflejar filtro.
- Permiso de alternar por UI:
  - solo `Administrador` y `Recepcion`.
- Integracion login:
  - `frontend/js/login.js` refresca estado de protocolo despues de login exitoso.

## Indicador visual
- `frontend/index.html`:
  - `#security-protocol-wrap`
  - `#security-protocol-chip`
- `frontend/css/style.css`:
  - estilos del chip y variantes por tema (`light/dark/vampire/princess` via variables/base actual).

## Reglas operativas recomendadas
- Activar protocolo (modo discreto):
  - `CALL sp_seguridad_protocolo_set(1, <idUsuario>);`
- Desactivar protocolo (modo normal):
  - `CALL sp_seguridad_protocolo_set(0, <idUsuario>);`
- Consultar estado:
  - `CALL sp_seguridad_protocolo_get();`

## Prueba rapida sugerida
1. Ejecutar migracion `2026-04-16_security_protocol_global_sp.sql`.
2. Validar estado inicial con `sp_seguridad_protocolo_get`.
3. Activar ON.
4. Verificar:
  - `Agenda` (fecha y busqueda mensual) sin ortodoncia.
  - `Paciente` busqueda/autocomplete sin ortodoncia.
  - `Monitor` forzado a odontologia.
5. Desactivar OFF y confirmar retorno a comportamiento normal.

## Relacion con otros contextos
- `02_agenda.md`
- `03_paciente.md`
- `07_login_auth.md`
- `14_monitor_seguimiento.md`
