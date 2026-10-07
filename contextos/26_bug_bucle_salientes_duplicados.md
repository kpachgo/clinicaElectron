# Bug pendiente — la IA responde en bucle cuando repite un texto reciente

**Estado:** corregido en la clínica el 2026-10-04 (verificado con los 4 pasos de abajo sobre una base descartable: antes del arreglo el paso 3 daba `duplicate: true` y el paso 4 dejaba 1 sin responder). Encontrado y corregido en WhatChat (el fork) el 2026-10-03, commit `7f36975`. Los dos bugs menores del final siguen sin revisar.
**Gravedad:** alta. Con WhatsApp real, el paciente recibe el mismo mensaje una y otra vez, cada pocos segundos, hasta que alguien pause la IA.

## Qué pasa

En `backend/services/mensajes/mensajesRepository.service.js`, `saveMessage` deduplica los salientes por contenido: **mismo `conversation_id` + mismo `content` + `message_at` a ≤ 180 s** se toma como el mismo mensaje y no se guarda. Ese dedup existe por una buena razón (ver "Salientes duplicados por external_id inestable" en `20_estado_actual_vista_mensajes.md`): el mismo envío llega por varias vías con `external_id` distinto.

El problema es que también descarta una respuesta **nueva y legítima** que coincide en texto con otra reciente:

1. Paciente: "gracias" → IA: "¡Con gusto!" (se guarda).
2. Paciente, menos de 3 min después: "gracias de nuevo" → IA vuelve a responder "¡Con gusto!".
3. `sendAiMessage` **sí lo envía por WhatsApp**, pero `saveOutgoingMessage` → `saveMessage` lo ve como duplicado del paso 1 y sale temprano: no inserta la fila **ni actualiza** `conversations.last_message_direction` (sigue en `incoming`).
4. `tick()` → `enqueueUnansweredAssistantMessages` ve que el último mensaje del paciente no tiene ningún saliente después → encola otro lote → `responseQueueStillEligible` lo acepta (el último evento sigue siendo del paciente) → la IA responde otra vez → mismo texto → mismo descarte → **bucle, un envío cada ~1–5 s**.

Reproducido en WhatChat: 45 lotes y 45 envíos al simulador en 45 segundos para un solo mensaje del paciente. Con un modelo real es menos probable que repita el texto exacto, pero respuestas cortas idénticas ("¡Con gusto!", "Con gusto, que tenga buen día", un emoji) son justo las que se repiten.

## Arreglo (por estado, no por texto)

Dos salientes iguales son el mismo envío **solo si caen en el mismo turno**: ningún mensaje entrante entre ambos. El eco de WhatsApp de un envío de la IA llega sin entrantes en medio y se sigue deduplicando; una respuesta igual a un mensaje **nuevo** del paciente tiene un entrante en medio y se guarda.

En `saveMessage`, la consulta del dedup de salientes pasa de:

```js
const dup = this.db.prepare("SELECT * FROM messages WHERE conversation_id=? AND direction='outgoing' AND content=? AND ABS(strftime('%s', message_at) - strftime('%s', ?)) <= 180 LIMIT 1").get(conversationId, text.trim(), at);
```

a:

```js
const dup = this.db.prepare("SELECT * FROM messages WHERE conversation_id=? AND direction='outgoing' AND content=? AND ABS(strftime('%s', message_at) - strftime('%s', ?)) <= 180 AND id > IFNULL((SELECT MAX(id) FROM messages WHERE conversation_id=? AND direction='incoming'), 0) LIMIT 1").get(conversationId, text.trim(), at, conversationId);
```

Actualizar también el comentario que está encima (explicar la condición del turno) y la sección "Salientes duplicados por external_id inestable" de `20_estado_actual_vista_mensajes.md`.

## Cómo verificarlo (con datos descartables)

Contra una copia de `mensajes.sqlite`, con `MensajesRepository`:

1. `saveIncomingMessage` "gracias" → `saveOutgoingMessage` "¡Con gusto!" (`author: "ai"`) → se guarda.
2. `saveOutgoingMessage` "¡Con gusto!" con otro `externalId` (simula el eco `message_create`) → `duplicate: true`.
3. `saveIncomingMessage` "gracias de nuevo" → `saveOutgoingMessage` "¡Con gusto!" → **se guarda** (`duplicate: false`).
4. `listUnansweredAssistantMessages()` → vacío.

Resultado esperado en WhatChat: los cuatro pasos dieron eso.

## Riesgo del arreglo

Bajo. Solo cambia cuándo un saliente con texto repetido se considera duplicado. Caso límite: si el eco de un envío de la IA llegara **después** de un mensaje nuevo del paciente (eco con más de unos segundos de atraso y el paciente escribiendo muy rápido), ese eco se guardaría como fila duplicada visible en el panel. Es un problema cosmético contra un bucle de envíos reales; además, el `external_id` normalmente sí coincide fuera de los chats `@lid`.

No toca el conector de WhatsApp (solo SQLite), así que no aplica la regla de confirmar en vivo los cambios del conector.

## Otros dos bugs heredados encontrados en WhatChat (menores, revisar también)

1. **Cola de salida: lo encolado durante una pasada no se envía hasta el próximo envío.** `flushOutgoingQueue` (`mensajesRuntime.service.js`) recorre `listPendingOutgoing()` leída al empezar; si mientras envía se encola otro mensaje, el nuevo `sendQueuedMessage` recibe la misma promesa en curso y su mensaje queda `pending` hasta que alguien envíe otra cosa. En la clínica puede pasar con un mensaje manual enviado durante una tanda de recordatorios. Arreglo en WhatChat: repetir la pasada mientras haya avance (`while (progressed)`; lo que vuelve a `pending` por conector desconectado no cuenta como avance, así que no hay bucle).
2. **`listConversations` oculta conversaciones sin `wa_chat_id`.** El filtro `WHERE NOT (c.wa_chat_id LIKE '%@lid' AND NOT EXISTS (...entrantes...))` da `NULL` cuando `wa_chat_id` es `NULL` y la fila desaparece. En la clínica casi todas las conversaciones tienen `wa_chat_id`, pero una creada solo por teléfono (envío a un número sin chat previo) no se vería. Arreglo: `IFNULL(c.wa_chat_id, '') LIKE '%@lid'`.
