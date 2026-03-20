# Revision de vistas pendientes (rendimiento/bugs)

Fecha de corte: 2026-03-20

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
- En Cola (`08_encola.md`)
  - carga robusta con `abort + seq` y cleanup completo de requests al salir de vista.
  - guardas anti-duplicado en acciones criticas (estado, eliminar, limpiezas masivas).
  - `Borrar todo` acotado por fecha local de la vista (ya no borra todos los dias desde UI).
  - backend endurecido en validaciones de `estado`, `fecha` y `hora`.

## Vistas pendientes por revisar
- Paciente (`03_paciente.md`)
  - incluye subflujo odontograma.
- Cobro (`06_cobro.md`)
- Login/Auth (`07_login_auth.md`) (flujo y UI de acceso/licencias)

## Orden sugerido para siguiente ronda
1. Cobro
2. Paciente (incluye odontograma)
3. Login/Auth

## Checklist tecnico sugerido (aplicar en cada vista pendiente)
- Verificar race conditions en cargas `fetch` (seq + abort controller).
- Detectar requests duplicados en botones de guardar/confirmar.
- Detectar duplicados por `Enter + blur` en ediciones inline.
- Revisar cleanup de vista al navegar (`window.__setViewCleanup`).
- Validar manejo de errores: no dejar promesas sin `try/catch`.
- Confirmar consistencia backend (404 en IDs inexistentes, validaciones de input).
