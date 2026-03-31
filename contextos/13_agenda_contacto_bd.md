# Migracion BD - Marcas SMS/Llamada en Agenda

Este proyecto no versiona los `CREATE PROCEDURE` actuales de Agenda, por lo que aqui se documenta el contrato minimo que debes aplicar en tu BD para que el backend/frontend nuevos funcionen.

## 1) Agregar columnas en tabla de agenda

Usa la tabla real que alimenta tus SP de agenda (`sp_agenda_*`):

```sql
ALTER TABLE agenda_ap
  ADD COLUMN smsAP TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN llamadaAP TINYINT(1) NOT NULL DEFAULT 0;
```

Si tu tabla no se llama `agenda_ap`, reemplazala por el nombre correcto.

## 2) Actualizar `sp_agenda_create`

Nueva firma esperada por backend:

```sql
CALL sp_agenda_create(nombre, hora, fecha, contacto, estado, comentario, sms, llamada);
```

Reglas:
- `sms` y `llamada` deben guardarse en `smsAP` y `llamadaAP`.
- Si vienen `NULL`, guardar `0`.

## 3) Actualizar `sp_agenda_update`

Nueva firma esperada por backend:

```sql
CALL sp_agenda_update(idAgenda, nombre, hora, fecha, contacto, estado, comentario, sms, llamada);
```

Reglas:
- Mantener comportamiento parcial actual: parametro `NULL` no debe sobreescribir.
- Para `sms`/`llamada`:
  - `NULL` => no cambiar valor actual.
  - `0`/`1` => actualizar `smsAP`/`llamadaAP`.

## 4) Actualizar SP de lectura de agenda

Debes incluir columnas en los `SELECT` de:
- `sp_agenda_por_fecha`
- `sp_agenda_buscar_mes`

Campos de salida requeridos:
- `smsAP`
- `llamadaAP`

Con eso el frontend podra mostrar y filtrar:
- Sin contacto
- Con SMS
- Con Llamada
- Con ambos
