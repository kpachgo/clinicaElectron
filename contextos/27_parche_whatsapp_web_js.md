# Parche local de `whatsapp-web.js` (actualización WhatsApp, 2026-10-08)

No se actualizó la librería: se quedó en `1.34.7` (fijada exacta en `backend/package.json`, sin `^`) y se le aplica **un parche chico** con `patch-package`. Este documento explica por qué y cómo llevarlo a la laptop u otro equipo.

## Por qué

- En julio 2026 WhatsApp Web (build `2.3000.1043159177` en adelante) renombró la propiedad `_serialized` de los ids de mensaje (`MsgKey`) a `$1`.
- `1.34.7` (última en npm, abril 2026) no lo contempla. Upstream lo arregló en GitHub (commit `58ddf15`, PR #201832, 2026-09-26) pero **no lo publicó en npm**.
- Efecto en nosotros: `window.WWebJS.getChatModel` usa `chat.lastReceivedKey._serialized` (ahora `undefined`) → `Msg.getMessagesById([undefined])` revienta ("No key or key range specified"). Por eso fallaban `message.getChat()`, `client.getChatById()` y `client.getChats()`, y el conector tenía que caer a "metadata mínima" y hacer la recuperación de no leídos sin `getChats`.

## Qué se tomó de upstream y qué no

- **Sí (parche)**: solo el bloque `lastReceivedKey` de `getChatModel` en `node_modules/whatsapp-web.js/src/util/Injected/Utils.js` → `_serialized || $1`. No cambia ningún id que guardemos.
- **Sí (nuestro código)**: `whatsappWebMessagingConnector.js`, recuperación de no leídos: `c.id._serialized || c.id.$1` y se salta el chat si no hay id (defensa por si WhatsApp renombra también los `Wid` de chat).
- **No**: la normalización de `Message.id._serialized` / `getMessageModel`. Cambiaría el formato de `external_id` (hoy `getDirectExternalId` cae a `id.id`, el id corto) y la recuperación re-importaría como nuevos los mensajes ya guardados → duplicados.
- **No**: la reescritura de `inject()` (PR #201653, `ready` duplicados) ni el refactor de AuthStore (PR #201667). Son ~800 líneas de arranque/sesión; lo cubrimos con `startStateProbe`, `cleanupRestoredPages` e `inboundRecoveryStarted`. Riesgo de pedir QR de nuevo.

## Archivos

- `backend/patches/whatsapp-web.js+1.34.7.patch` — el parche (va al repo).
- `backend/package.json` — `"postinstall": "patch-package"`, `patch-package` en `devDependencies`, `whatsapp-web.js` fijado a `1.34.7`.

## Instrucciones para aplicarlo en la laptop

La sesión de WhatsApp **no se pierde** con este cambio (no toca `LocalAuth` ni la carpeta de sesión).

1. Cerrar la app / detener el backend en la laptop (si no, Windows bloquea archivos de `node_modules`).
2. Traer el código:
   ```
   git pull
   ```
3. Reinstalar dependencias del backend (esto aplica el parche solo):
   ```
   npm run install:backend
   ```
   Debe aparecer al final:
   ```
   Applying patches...
   whatsapp-web.js@1.34.7 ✔
   ```
   Si sale `✘` o "patch-package: command not found", correr `cd backend && npm install` de nuevo y revisar el mensaje.
4. Verificar (opcional) que el parche quedó:
   ```
   findstr /C:"Backport de upstream 58ddf15" backend\node_modules\whatsapp-web.js\src\util\Injected\Utils.js
   ```
   Debe imprimir una línea.
5. Arrancar la app normalmente. Si la laptop nunca tuvo WhatsApp vinculado, escanear el QR una vez (queda como otro "dispositivo vinculado"; WhatsApp permite hasta 4).

Si la laptop usa el **instalador** en vez del repo: basta con instalar una versión compilada después de este cambio. `electron-builder` copia `backend/node_modules` ya parchado, y el workflow de release corre `npm run install:backend`, que dispara el `postinstall`.

## Advertencia: no dos equipos a la vez

No hay ningún candado que impida que dos equipos tengan WhatsApp conectado al mismo número. Si escritorio y laptop están conectados a la vez, ambos reciben cada mensaje y **ambos corren el agente IA** (respuestas dobles al paciente), y cada uno guarda su propia copia en su SQLite local. Usar uno a la vez.

## Cuándo quitar el parche

Cuando upstream publique en npm una versión que incluya `58ddf15` (> 1.34.7):
1. Subir la versión de `whatsapp-web.js` en `backend/package.json`.
2. Borrar `backend/patches/whatsapp-web.js+1.34.7.patch` (patch-package avisa con error si la versión no coincide).
3. Revisar si la versión nueva normaliza `Message.id._serialized`: si sí, `getDirectExternalId` empezaría a devolver el id largo y hay que decidir cómo mantener la compatibilidad con los `external_id` cortos ya guardados antes de actualizar.
