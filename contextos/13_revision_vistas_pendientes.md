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
- Cobro (`06_cobro.md`)
  - carga robusta en frontend con `abort + seq` (cuentas, descuentos, faltantes, reporte mensual y autocompletes).
  - guardas anti-duplicado en guardar cobro, asignar doctor, eliminar cuenta y flujo de descuentos.
  - cleanup de vista endurecido: aborta requests en vuelo para evitar respuestas tardias al navegar.
  - backend endurecido en `cuenta.controller` (validaciones de fecha/IDs, 404 consistentes y tolerancia a fallos DB transitorios).
- Paciente (`03_paciente.md`)
  - frontend endurecido con `abort + seq` en busqueda, detalle de paciente, citas, fotos, historial y carga de odontograma.
  - cleanup de vista robusto: invalida/aborta requests en vuelo para evitar data tardia al cambiar rapido entre vistas.
  - guardas anti-duplicado en acciones criticas (guardar paciente/cita/firma/odontograma, subir-eliminar foto y autorizar cita).
  - backend endurecido en `paciente.controller` y `odontograma.controller` (validacion de IDs/fechas y tolerancia a errores DB transitorios con `503`).
- Login/Auth (`07_login_auth.md`)
  - frontend login endurecido contra requests duplicados (login y registro oculto) y carreras de estado de licencia en montajes rapidos.
  - carga de catalogos de registro oculto consolidada con promesa en vuelo para evitar llamadas paralelas.
  - backend `auth.controller` endurecido con sanitizacion de correo y respuesta `503` para errores DB transitorios.

## Vistas pendientes por revisar
- Ninguna pendiente en esta ronda.

## Orden sugerido para siguiente ronda
1. Monitorear en QA cambios de concurrencia en Paciente/Login.

## Checklist tecnico sugerido (aplicar en cada vista pendiente)
- Verificar race conditions en cargas `fetch` (seq + abort controller).
- Detectar requests duplicados en botones de guardar/confirmar.
- Detectar duplicados por `Enter + blur` en ediciones inline.
- Revisar cleanup de vista al navegar (`window.__setViewCleanup`).
- Validar manejo de errores: no dejar promesas sin `try/catch`.
- Confirmar consistencia backend (404 en IDs inexistentes, validaciones de input).
