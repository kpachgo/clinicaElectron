# Contextos del proyecto (por vistas)

Este directorio resume el estado actual del proyecto por vista para continuar cambios por modulo.

## Vistas documentadas
- `01_general.md`
- `02_agenda.md`
- `03_paciente.md`
- `04_doctores.md`
- `05_servicios.md`
- `06_cobro.md`
- `07_login_auth.md`
- `08_encola.md`
- `09_temas.md`
- `10_electron.md`
- `11_build_mac.md`
- `12_release_github_actions.md`
- `13_agenda_contacto_bd.md`
- `14_monitor_seguimiento.md`
- `15_protocolo_seguridad.md`
- `16_backups.md`
- `16_release_mac_runner_issue.md`
- `17_release_linux_github_actions.md`
- `18_modo_venta.md`
- `20_estado_actual_vista_mensajes.md`
- `21_build_win_local.md`
- `22_whatsapp_acoplamiento_libreria.md`
- `23_almacenamiento_nube.md`
- `24_inventario.md`
- `25_migracion_conexion_whatsapp.md`

## Nota
- `01_general.md` incluye un resumen fechado de cambios recientes para reubicarse rapido entre sesiones.
- El contexto de Paciente (`03_paciente.md`) incluye la parte de odontograma.
- `13_agenda_contacto_bd.md` documenta la migracion de BD/SP para las marcas `SMS/Llamada` de Agenda.
- `14_monitor_seguimiento.md` documenta la vista nueva en construccion (v1 visual con mock).
- `15_protocolo_seguridad.md` documenta el modo global ON/OFF para ocultar Ortodoncia en SPs/vistas afectadas.
- `16_backups.md` documenta el modulo oculto de copias de seguridad cifradas y restauracion portable por credenciales de Administrador.
- `16_release_mac_runner_issue.md` documenta la incidencia recurrente donde macOS queda en cola por publicar el workflow con `macos-13` en lugar de `macos-latest`.
- `17_release_linux_github_actions.md` documenta el flujo oficial de Linux, errores ya resueltos y el procedimiento correcto para relanzar builds nuevas.
- `18_modo_venta.md` documenta la variante comercial activada por `CLINICA_MODO_VENTA=1`.
- `20_estado_actual_vista_mensajes.md` documenta la Vista Mensajes: agente IA con herramientas, agenda, identidad de pacientes y configuración por clínica.
- `21_build_win_local.md` guia del instalador Windows local: pasos, validacion del paquete y los 3 errores conocidos (self-link `clinica` -> recursion de 7za, ABI de `better-sqlite3` vs Electron, `node_modules` del backend vacio en el paquete).
- `23_almacenamiento_nube.md` documenta los modos local / respaldo / solo nube (Cloudflare R2) para fotos, firmas y sellos, reglas de costo y pendientes.
- `24_inventario.md` documenta la vista Inventario: catalogo (Odontologia / Ortodoncia / Instrumentos) y pedidos borrador -> generado, sin stock ni precios.
- `22_whatsapp_acoplamiento_libreria.md` evalua que tan atada esta la Vista Mensajes a `whatsapp-web.js` de cara a una eventual migracion a la API oficial de Meta u otra libreria; nota de evaluacion, no un plan aprobado. Incluye el parche local de `whatsapp-web.js` 1.34.7 (por que, que no tomar de upstream, como instalarlo) y la advertencia de no tener dos equipos conectados a la vez.
- `25_migracion_conexion_whatsapp.md` complementa al 22 (2026-10-03): que se conserva al cambiar de conexion, la logica `@lid` que salio del conector, la recomendacion de mantener `waChatId` como `numero@c.us`, contrato que debe respetar un conector nuevo y lo no trivial de Meta (webhook publico, plantillas 24 h).
