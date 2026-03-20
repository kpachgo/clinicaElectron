# Revision de vistas pendientes (rendimiento/bugs)

Fecha de corte: 2026-03-18

## Vistas ya revisadas y corregidas
- Agenda (`02_agenda.md`)
  - race condition en carga por fecha corregida.
  - requests duplicados en guardar y edicion inline corregidos.
- Servicios (`05_servicios.md`)
  - requests duplicados (guardar/inline) corregidos.
  - carga robusta y cleanup con abort.
  - backend endurecido en validaciones de crear/actualizar.
- Doctores (`04_doctores.md`)
  - carga robusta y guardas anti-duplicado en registrar/cambiar estado.
  - cleanup completo de vista y modales.
  - backend endurecido para `subirSello` y `obtenerPorId`.

## Vistas pendientes por revisar
- Paciente (`03_paciente.md`)
  - incluye subflujo odontograma.
- En Cola (`08_encola.md`)
- Cobro (`06_cobro.md`)
- Login/Auth (`07_login_auth.md`) (flujo y UI de acceso/licencias)

## Orden sugerido para siguiente ronda
1. Cobro
2. En Cola
3. Paciente (incluye odontograma)
4. Login/Auth

## Checklist tecnico sugerido (aplicar en cada vista pendiente)
- Verificar race conditions en cargas `fetch` (seq + abort controller).
- Detectar requests duplicados en botones de guardar/confirmar.
- Detectar duplicados por `Enter + blur` en ediciones inline.
- Revisar cleanup de vista al navegar (`window.__setViewCleanup`).
- Validar manejo de errores: no dejar promesas sin `try/catch`.
- Confirmar consistencia backend (404 en IDs inexistentes, validaciones de input).
