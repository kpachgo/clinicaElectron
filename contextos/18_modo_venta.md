# Modo Venta

## Objetivo
- Preparar una variante comercial del sistema sin datos ni reglas propias de una clinica especifica.
- El modo es reversible: no elimina funcionalidades ni datos, solo cambia presentacion/visibilidad mientras esta activo.
- Activacion:
  - variable de runtime/build: `CLINICA_MODO_VENTA=1`.
  - sin variable, `0`, `false`, vacio o ausente: modo normal.

## Configuracion publica
- Backend expone:
  - `GET /api/app-config/public`
  - respuesta: `{ ok: true, data: { modoVenta: true|false } }`
- Frontend:
  - carga la configuracion al iniciar desde `frontend/js/web.js`.
  - expone `window.__clinicaAppConfig`.
  - helper global: `window.isModoVenta()`.

## Paciente / Impresion de odontograma
- En modo venta no se muestran promociones del mes:
  - presets de promociones,
  - input de promocion personalizada,
  - boton `Agregar promocion`.
- En modo venta no se muestran consentimientos:
  - `Endodoncia`,
  - `Ortodoncia`.
- La apertura programatica de consentimientos tambien queda bloqueada si `modoVenta=true`.
- La configuracion de impresion usa storage separado:
  - modo normal: `odonto_print_company_config_v1`.
  - modo venta: `odonto_print_company_config_sale_v1`.
- Defaults en modo venta:
  - `sucursal`: vacio.
  - `telefono`: vacio.
- Defaults normales se conservan para la clinica especifica y no se borran al alternar el modo.

## Cobro
- En modo venta, Cobro muestra `Seguro` donde internamente existe `IGS`.
- Valores internos y datos persistidos se mantienen compatibles:
  - select principal sigue enviando `IGS`.
  - filtros siguen enviando `igs`.
  - BD y reportes backend no cambian.
- Superficies visuales afectadas:
  - KPI de forma de pago,
  - select de forma de pago,
  - filtros de cuentas/reporte mensual,
  - chips de cuentas del dia,
  - PDFs generados desde Cobro.

## Agenda
- En modo venta, Agenda muestra `Seguro` donde internamente existe el estado `IGS`.
- Valores internos y datos persistidos se mantienen compatibles:
  - select/modal de estado sigue enviando `IGS`.
  - filtros y metricas siguen usando `igs` como llave interna.
- Superficies visuales afectadas:
  - metrica de citas de seguro,
  - filtro de estado,
  - select de estado por fila,
  - modal de registro/edicion de cita,
  - resumen del dia,
  - tabla de posibles inasistencias.

## No aplica por ahora
- No se modifica la logica de protocolo de seguridad.
- No se eliminan consentimientos ni promociones del codigo; solo se ocultan en modo venta.

## Validacion rapida
1. Definir `CLINICA_MODO_VENTA=1` en `backend/.env` antes de iniciar/build.
2. Abrir Paciente:
   - no debe verse `Promociones del mes`.
   - no debe verse `Consentimientos`.
   - configuracion de impresion debe iniciar con sucursal/telefono vacios en storage limpio.
3. Abrir Cobro:
   - debe verse `Seguro` en lugar de `IGS`.
   - guardar cobro con seguro debe persistir el valor compatible `IGS`.
4. Abrir Agenda:
   - debe verse `Seguro` en metricas, filtros, selects y resumenes donde antes aparecia `IGS`.
   - guardar cita con seguro debe persistir el valor compatible `IGS`.
5. Quitar la variable y reiniciar:
   - vuelve modo normal,
   - promociones/consentimientos aparecen,
   - defaults normales siguen disponibles.
