# Migración de conexión WhatsApp — a tomar en cuenta

Nota de evaluación del 2026-10-03 (no es un plan aprobado, no se cambió código). Complementa y actualiza `22_whatsapp_acoplamiento_libreria.md` (escrito el 2026-08-31, antes de toda la lógica `@lid` de septiembre). Pregunta que responde: si algún día se deja `whatsapp-web.js` (otra librería o canal oficial de Meta), ¿se conserva el trabajo de la vista Mensajes y solo cambia la conexión?

## Conclusión

Sí. La migración es **un conector nuevo + ajustes menores**, no una reescritura de la vista. Las excepciones no triviales son reglas del canal oficial de Meta (ver "Lo que NO es trabajo menor"), no del código actual.

## Qué está aislado (verificado en el código el 2026-10-03)

- `require("whatsapp-web.js")` aparece **solo** en `backend/services/mensajes/connectors/whatsappWebMessagingConnector.js` (766 líneas). Ningún otro archivo importa la librería.
- Contrato común en `connectors/messagingConnector.js`: `connect`, `disconnect`, `getStatus`, `sendMessage(phone, text, { waChatId, author })`, `onIncomingMessage`, `onOutgoingMessage`, `onMessageStatus`, y el sobre normalizado `normalizeIncomingMessage()` (`externalId, phone, waChatId, waContactNumber, waDisplayName, author, text, direction, messageAt, rawType, reactionTargetId, source`).
- `simulatedMessagingConnector.js` ya es una segunda implementación del contrato.
- La elección del conector está en un solo lugar: `mensajesRuntime.service.js` líneas 7-9 (`MENSAJES_CONNECTOR`). Los métodos opcionales se detectan con `typeof connector.x === "function"`: `onStatus`, `setTyping`, `resolvePhoneForChatId`, `shutdown`, `clearSession`.
- No dependen de la librería: agente IA y herramientas, agenda, vinculación de pacientes, `response_queue`, red de seguridad de citas, "Sin responder", Ajustes, copia de configuración por módulos, SQLite y casi todo el frontend.

## Cambio respecto al contexto 22: lógica `@lid` fuera del conector

Desde septiembre hay lógica `@lid` fuera del conector:

- `mensajesRepository.service.js` (~27 referencias): `lid_phone_map`, `rememberLidPhone`, `isAbsorbable`, `mergeConversationsForSamePatient` (puntaje que prefiere `@c.us`), `wa_chat_aliases`, filtros en `listConversations`.
- `aiObserver.service.js`: `isContextUnclear` / `resolveUnlinkedLid` (espera de la IA con `@lid` sin resolver).
- `mensajesRuntime.service.js`: `refreshLidConversations` (cada 60 s + ráfagas al conectar).
- `mensajesDatabase.service.js`: tabla `lid_phone_map`.

**No estorba a una migración**: todo está guardado con `endsWith("@lid")` o con la existencia de `connector.resolvePhoneForChatId`. Con un conector que nunca emita `@lid`, ese código queda inactivo. Se puede limpiar después, sin urgencia.

## Decisión clave: formato de `waChatId`

Las conversaciones se llavean por `wa_chat_id`, y el repositorio asume el formato `503XXXXXXXX@c.us` (p. ej. `mensajesRepository.service.js` línea 78: `` `${waContactNumber}@c.us` ``; el puntaje de fusión también premia `@c.us`).

**Recomendación**: que el conector nuevo emita `waChatId = "<numero>@c.us"` aunque el proveedor mande solo el número (Meta manda `wa_id` en E.164 sin sufijo). Así:
- las conversaciones existentes siguen en el mismo hilo (historial continuo),
- vinculaciones de paciente (`patient_chat_identities`) y `wa_chat_aliases` siguen válidas,
- cero cambios en el repositorio.

Si se usa otro formato (solo el número), cada paciente abriría conversación nueva y habría que migrar `conversations.wa_chat_id`, `patient_chat_identities`, `wa_chat_aliases` y revisar las comparaciones con `@c.us`.

## Detalles del contrato que el conector nuevo debe respetar

- **`rawType`** con los nombres que ya usa el código (vienen de whatsapp-web.js): `text`, `ptt`, `audio`, `image`, `video`, `document`, `sticker`, `reaction`. El runtime marca audio por `ptt`/`audio` y `messageTriage` manda a revisión humana por tipo.
- **`externalId` estable y determinista**: es la llave de dedup de `saveMessage` (los salientes además deduplican por contenido ≤ 180 s).
- **`reactionTargetId`** en reacciones.
- **`source: "recovery"`** para mensajes históricos importados (no disparan la IA). Con webhooks probablemente no se use.
- **`author: "human"`** para salientes escritos por recepción fuera del sistema (vía `onOutgoingMessage`).
- **Estados** de `CONNECTOR_STATUSES`; `qr` se puede dejar sin uso.

## Ajustes menores esperados

- UI de conexión en `frontend/js/mensajes.js` (líneas ~94-131): botones Iniciar / Cerrar / Quitar sesión y la etiqueta "QR en ventana de WhatsApp" asumen QR. Con Meta serían un formulario de credenciales (token, `phone_number_id`, verify token).
- `setTyping` es opcional; si el proveedor no lo soporta, no se implementa.
- Comentarios y textos que mencionan `@lid`/whatsapp-web.js (`configTransfer.service.js`, `frontend/js/mensajes.js` línea ~533).

## Lo que NO es trabajo menor (solo si se va al canal oficial de Meta)

1. **Webhook necesita URL pública.** La app es Electron en la PC de la clínica; Meta entrega los entrantes por webhook a una URL de internet. El Express local no es alcanzable desde afuera → hace falta un relé en la nube o un túnel. Es la pieza de infraestructura más grande (el contexto 22 no lo mencionaba).
2. **Ventana de 24 h y plantillas aprobadas.** Fuera de 24 h desde el último mensaje del paciente solo se puede escribir con plantilla aprobada por Meta → los recordatorios de citas (`processReminder`, hoy texto libre) deben rediseñarse como plantillas.
3. **Mensajes que recepción escribe desde el celular.** Hoy `onOutgoingMessage` los captura vía `message_create`. Con Meta depende de cómo se use el número (API sola vs. coexistencia con la app WhatsApp Business). Validar en su momento, no asumir.
4. **Trámite y costo**: alta/verificación del número como WhatsApp Business; Meta cobra por conversación/plantilla.
5. La recuperación de no leídos al conectar (`startInboundRecovery`) desaparece como concepto con webhooks; no hay que migrarla.

Si el cambio es a otra librería no oficial (p. ej. Baileys), los puntos 1, 2 y 4 no aplican: queda el conector nuevo + revisar cómo esa librería identifica contactos (`@lid` u otro).

## Checklist para cuando se haga

1. Escribir `connectors/<nuevo>MessagingConnector.js` implementando el contrato y emitiendo el sobre normalizado.
2. Emitir `waChatId` en formato `<numero>@c.us` (ver arriba) y `rawType` con los nombres actuales.
3. Agregar la opción en `mensajesRuntime.service.js` (líneas 7-9).
4. Probar primero con el simulador / `assistant-console.js` y luego en vivo; confirmar causa raíz en vivo antes de tocar el conector en producción.
5. Ajustar la UI de conexión.
6. (Meta) Relé/túnel para el webhook, plantillas para recordatorios, trámite del número.
7. Opcional después: limpiar la lógica `@lid` inactiva.
