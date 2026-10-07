# Estado actual — Vista Mensajes

## Aprobación

La vista Mensajes queda aprobada para esta versión.

## Resumen

Mensajes atiende conversaciones de WhatsApp (y un simulador de pruebas). Un **agente IA con herramientas** responde en lenguaje natural, da información y precios, y ejecuta acciones de agenda (crear, consultar, reprogramar, cancelar) siempre validadas por el backend.

SQLite (`mensajes.sqlite`) guarda el estado operativo local: conversaciones, mensajes, colas, identidades de paciente, ajustes. MySQL es la fuente de verdad: pacientes, servicios (`servicio.precioS`), agenda (`agendapersona`, SPs `sp_agenda_*`) y la tabla de auditoría `mensajes_auditoria`.

El motor de intenciones por regex, las máquinas de estado de agenda hechas a mano y los flujos clínicos configurables **fueron eliminados**. El agente hace ese trabajo.

## Regla: no hay interpretador de mensajes — no agregar listas de palabras

**La IA es la única que interpreta lo que escribe el paciente** (qué quiere, si confirma, si cancela, si es un saludo). En el código **no** se agregan listas de palabras, frases ni regex de vocabulario para "entender" al paciente ni para revisar lo que la IA va a enviar. Ya se probó dos veces y falló por las variantes que siempre quedan afuera ("Si primero Dios", "¡Listo! A la orden, cita agendada").

Cuando algo falla:
- **Si la IA entendió mal** → se corrige en el conocimiento de la clínica (Ajustes → Asistente IA) o en `config/assistant-policy.md`, reforzando el razonamiento (ver bloque RECORDÁ más abajo).
- **Si hay que impedir una acción equivocada** → se gatea por **estado** (qué herramientas corrieron, memoria del agente, ids de mensajes, modo de la conversación), nunca por el texto.
- **Si hace falta juzgar un texto** → un juicio corto de la propia IA en contexto (`requestJudgement` en `assistantProvider.service.js`), como la red de seguridad de "cita afirmada sin registrar".

Lo que **sí** queda en código y **no** es un interpretador (no confundir):
- `dateTimeResolver.service.js`: normaliza los **argumentos** de fecha/hora que el modelo pasa a las herramientas ("el lunes" → `2026-10-05`).
- `resolveService` en `aiAvailability.service.js`: empareja el **argumento** `servicio` que manda el modelo con el catálogo (nombre + alias configurados en Servicios IA).
- `messageTriage.service.js`: manda a recepción audio/imagen/documento **por tipo de mensaje**, no por texto.
- `conversationEngine.service.js`: decide si un **evento** dispara la IA (reacción, reconexión, chat en revisión), no lee el texto.

## Arquitectura del flujo de respuesta

```
mensajesRuntime  (conector WhatsApp / simulado)
  └─ onIncomingMessage → saveIncomingMessage → evaluateConversationEvent → enqueueIncomingResponse
        └─ response_queue (SQLite): agrupa mensajes seguidos, aplica delay de agrupación

aiObserver.tick()  (setInterval 500 ms, SERIALIZADO: un tick a la vez)
  └─ claimDueResponseQueue()  → processBatch(batch)
        ├─ guardas: automatización ON, elegibilidad, modo assistant, teléfono permitido
        ├─ triageMessage(messageType)  → audio/imagen/documento: revisión humana, cancelar lote
        └─ runAssistant({ conversation, linkedPatient, cfg, assistantMemory })
              ├─ buildAssistantContext(): system prompt + historial
              │     política + conocimiento de la clínica + catálogo habilitado
              │     + horario general + paciente vinculado + fecha actual (El Salvador)
              │     + memoria (cita ya gestionada en la conversación)
              └─ loop (máx 6 pasos):
                    requestAssistantTurn()  →  ¿tool calls?
                       sí → runTool() por cada una (dedup de llamadas idénticas) → resultados → repetir
                       no → texto final → salir
              └─ devuelve { text, transfer, steps, trace, memoryUpdate }
        ├─ si crear_cita hizo match por teléfono → repo.setPatientLink (vincula la conversación)
        └─ delay humano → recheck elegibilidad → sendHandler → response_queue = completed
```

Si se agotan los 6 pasos pero una acción de agenda quedó `ok`, el cierre confirma la cita (no transfiere).

## Herramientas del agente

Definidas en `assistantTools.service.js`. Cada una envuelve un servicio que ya valida contra el backend.

| Herramienta | Backend | Notas |
|---|---|---|
| `consultar_servicios(consulta?)` | `listAiServices` + `servicio.precioS` | solo servicios habilitados; precio solo si `share_price=1` |
| `consultar_disponibilidad(servicio, fecha, franja?)` | `resolveService` + `searchAvailability` | slots reales; devuelve ambigüedad / sin cupos / `servicio_no_disponible_ese_dia` (fuera de la ventana propia del servicio) |
| `consultar_citas_paciente()` | `queryPatientAppointments` | exige paciente vinculado |
| `crear_cita(servicio, fecha, hora, nombre?, telefono?, usar_telefono_del_chat?, telefono_confirmado?, confirmado)` | `createAppointmentForAssistant` | `confirmado:true` obligatorio; ver "Vinculación de pacientes" abajo |
| `reprogramar_cita(id_cita, nueva_fecha, nueva_hora, confirmado)` | `rescheduleAppointment` | exige paciente vinculado + `confirmado:true` |
| `cancelar_cita(id_cita, confirmado)` | `cancelAppointment` | exige paciente vinculado + `confirmado:true` |
| `transferir_a_recepcion(motivo)` | marca `review_required` | corta el loop |

## Vinculación de pacientes en `crear_cita`

Cuando la conversación NO está vinculada, tras pedir nombre + teléfono (`usar_telefono_del_chat=true` si el paciente dice que es el mismo número del chat), `findExistingPatient` busca expediente en `paciente`:

| Situación | Cita (`agendapersona`) | Conversación (panel) | `comentarioAP` |
|---|---|---|---|
| Teléfono exacto + nombre consistente | `pacienteIdAP` seteado | **"Paciente identificado"** (`setPatientLink`) | limpio |
| Nombre exacto único, teléfono coincide o no dado | `pacienteIdAP` seteado | sin identificar (lo hace recepción) | limpio |
| Nombre exacto, teléfono **distinto** al del expediente | `crear_cita` devuelve `verificar_cambio_telefono` → la IA pregunta si cambió de número (solo últimos 4 dígitos) → re-llama con `telefono_confirmado=true` | sin identificar | `— teléfono nuevo, confirmar en recepción` |
| Teléfono de otro paciente + nombre distinto (familiar) | provisional (`pacienteIdAP` NULL) | sin identificar | `— verificar` |
| Varios homónimos | provisional | sin identificar | `— verificar` |
| Sin coincidencia (paciente nuevo real) | provisional | sin identificar | `— verificar` |

Reglas: la IA **no** actualiza `paciente.telefonoP`; solo pone el número en `contactoAP` y marca el comentario. Solo el match por teléfono verificado vincula la conversación (equivale a la identificación manual de recepción — a partir de ahí la IA puede consultar/cancelar/reprogramar en ese chat). Al paciente **nunca** se le menciona verificación ni registro pendiente. La marca `— …` del comentario se limpia en los recordatorios (`{{tratamiento}}`).

## Garantías contra acciones erróneas

La interpretación puede perdonar typos; **las acciones se gatean por estado, no por frases**. Una interpretación errónea produce una pregunta equivocada, nunca una acción equivocada.

Capas contra la doble reserva / acción indebida:
1. `confirmado:true` obligatorio en crear/reprogramar/cancelar + regla de prompt (confirmar en el turno previo).
2. Revalidación de backend: disponibilidad real, propiedad de la cita (`getOwnedAppointment`), estado del paciente.
3. Llave de idempotencia `ai-create-{conversación}-{fecha}-{hora}-{servicio}-{paciente}` en `mensajes_auditoria`, re-chequeada **dentro del `GET_LOCK`**. El paciente (`patientId` o nombre normalizado) es parte de la llave: sin él, una reserva grupal (misma conversación/día/hora/servicio, distinta persona) colisionaba y las citas 2ª en adelante se leían como duplicado de la 1ª — reportaban "ok" sin crearse (bug encontrado 2026-08-31, caso real: 3 personas pidieron limpieza el mismo día/hora, solo se creó la primera).
4. Memoria `conversation_state.collected._assistant.lastAppointment`: inyectada en el prompt y usada por `crear_cita` para cortar con `ya_registrada` si coincide fecha+hora.
5. Dedup de tool calls idénticas dentro de un mismo turno del agente.

Fix de carrera en la cola: `setInterval(tick,500)` disparaba ticks encimados que reprocesaban el mismo lote `generating` (creó 3 citas iguales una vez). Resuelto con la guarda `ticking` (un tick a la vez), cap `attempts>=8→failed`, y reencolar mensajes que entran durante un lote.

## Proveedor IA

`assistantProvider.service.js`. `ai_provider_settings` en SQLite (local o nube, base URL, modelo, API key, timeout). Dos estrategias normalizadas a `{ replyText, toolCalls }`:
- **native**: envía `tools` en formato OpenAI, parsea `message.tool_calls`. Se usa con `provider_mode='cloud'`.
- **json**: no envía `tools`; instruye un protocolo JSON en el prompt y parsea el contenido. Se usa con `provider_mode='local'`.

Probado con DeepSeek (`cloud` / native). El path `json` (modelos locales) aún no probado end-to-end.

## Configuración por clínica (para venta a varias clínicas)

- **Conocimiento de la clínica**: un solo textarea (`ai_assistant_knowledge.knowledge`) que la IA usa **tal cual** — identidad, promociones, información que puede dar, ubicación, formas de pago, política de cancelación. Ajustes → Asistente IA.
- **Precio por servicio**: switch "La IA puede decir el precio" (`ai_service_settings.share_price`). El precio sale de `servicio.precioS` (se mantiene en la vista Servicios). Si está apagado, la IA deriva el precio a recepción. Ajustes → Servicios IA.
- **Servicios habilitados**: checkbox "Permitir que la IA ofrezca este servicio" (`ai_service_settings.enabled`). Apagado = la IA no menciona ni agenda ese servicio. Por defecto todos apagados; la clínica habilita los que quiere.
- **Horario general**: editor visual por día + pausas (`ai_clinic_schedule`). Aplica a todos los servicios de la IA. En Ajustes → Servicios IA, "Horario general de la clínica" y "Pausas generales" son dos `<details>` (clase `.ai-collapse`) contraídos por defecto; el botón "Guardar horario general" queda fuera y guarda ambos (los valores viven en el DOM aunque estén contraídos).
- **Horario propio por servicio**: checkbox "Este servicio tiene su propio horario" + editor semanal (`ai_service_settings.weekly_hours_json`). Ajustes → Servicios IA. Desplegable "Reutilizar horario de otro servicio" que lista los servicios con ventana ya definida y su resumen (`summarizeWeek`) para copiarlo de un clic. Con ventana activa, la IA solo ofrece/agenda ese servicio en esas franjas (intersectadas con el horario general); **un día sin franjas queda cerrado para ese servicio**. `{}` = sin restricción (usa el horario general). Se aplica **dentro de `searchAvailability`**, así que `consultar_disponibilidad`, `crear_cita` y `reprogramar_cita` quedan gateados de forma determinista, no por criterio del modelo. La IA también recibe la ventana en el catálogo (`describeCatalog`) y en `consultar_servicios` para explicarla. Caso de uso: ortodoncia (Control Mensual / Inicio Ortodoncia / Evaluación Ortodoncia) L–V 13:00–16:30, Sáb 08:00–11:30.
- **Revisión humana**: un solo textarea (`human_review_rules.instructions`) que describe cuándo el asistente debe transferir a recepción. Se inyecta tal cual en el system prompt (`buildAssistantContext`) y el agente decide llamar `transferir_a_recepcion`. Ajustes → Asistente IA. Aparte, `messageTriage` manda a revisión humana de forma determinista los mensajes que la IA no puede procesar: audio, imagen, documento, video, sticker (regla fija, no configurable por ahora).
- **Política base**: `config/assistant-policy.md`, agnóstica de clínica.

## Controles globales de la IA (barra de herramientas)

`POST /api/mensajes-view/global-ai-mode` con `{ mode }`. Todos escriben `automation_settings.enabled`.

| Botón | `mode` | Efecto |
|---|---|---|
| **Pausar IA** | `paused` | `enabled=false` + cancela los lotes en curso (`response_queue` generating/ready_to_send/sending). No cambia el modo de las conversaciones. |
| **Reanudar IA** (mismo botón cuando está pausada) | `resume` | `enabled=true` y nada más. No toca conversaciones ni reencola mensajes viejos. La IA retoma solo con los mensajes que lleguen después (que ya se analizan con el chat completo vía `buildAssistantContext`). |
| **Pasar todo a IA** | `assistant` | `enabled=true` + fuerza cada conversación `manual`/`paused`/`review_required` → `assistant` + `resumeAssistantQueue()` reencola todo lo pendiente. Es el override agresivo. |

`updateAutomationSettings` (checkbox "Activar automatizaciones" en Ajustes) también hace `resumeAssistantQueue()` al encender — comportamiento como "Pasar todo a IA" pero sin cambiar modos de conversación.

## Responsabilidades por archivo

- `frontend/js/mensajes.js`: vista, conversaciones, simulador, panel de paciente, recordatorios, Ajustes.
- `backend/routes/mensajesView.routes.js` + `controllers/mensajesView.controller.js`: API de la vista (rol `Administrador` / `Recepcion`).
- `backend/routes/mensajes.routes.js` + `controllers/mensajes.controller.js`: endpoints "duros" de herramienta con auditoría (no los llama la IA por ahora; disponibles para integraciones).
- `backend/services/mensajes/mensajesRuntime.service.js`: conectores, ciclo de vida, colas de envío, recordatorios.
- `backend/services/mensajes/aiObserver.service.js`: cola de respuestas (tick serializado), triage y orquestación del turno.
- `backend/services/mensajes/messageTriage.service.js`: guardia determinista de revisión humana para mensajes no procesables (audio/imagen/documento).
- `backend/services/mensajes/assistantAgent.service.js`: el loop del agente.
- `backend/services/mensajes/assistantContext.service.js`: system prompt + historial.
- `backend/services/mensajes/assistantTools.service.js`: las 7 herramientas.
- `backend/services/mensajes/assistantProvider.service.js`: transporte native / json.
- `backend/services/mensajes/aiAvailability.service.js`: catálogo, horario, cálculo de slots.
- `backend/services/mensajes/agendaAiQuery.service.js`: lectura de citas del paciente.
- `backend/services/mensajes/aiAppointmentAction.service.js`: crear / cancelar / reprogramar con lock, validación y auditoría.
- `backend/services/mensajes/conversationEngine.service.js`: solo `evaluateConversationEvent` (¿el evento entrante dispara análisis?).
- `backend/services/mensajes/dateTimeResolver.service.js`: normaliza fechas/horas para los argumentos de las herramientas.
- `backend/services/mensajesDatabase.service.js`: SQLite y migraciones.
- `backend/assistant-console.js`: consola offline para probar el agente sin WhatsApp (`--live` ejecuta las mutaciones de verdad; sin flag, simuladas).

## Eliminado

- Motor de intenciones por regex, extracción de hechos, `getRequirementsForContext`, `shouldRequireHumanReview` (reemplazado por `messageTriage`).
- `prepareAvailability`, `handlePatientAgendaAction`, `obsoletePrepareAvailability` y sus helpers.
- `clinicalWorkflow.service.js`, `conversation-engine-console.js`, `confirmationIntent.service.js`.
- `clinical_rules` (UI, rutas, controller, repo). La tabla queda huérfana e inofensiva.
- Frontend: `enrichIaSettings`, `enrichAiServicesSettings`, `enrichAiServicesSettingsV2`, `enrichClinicalWorkflowsSettings`; pestaña "General" fantasma y controles Identidad/Tono/Transferir sin uso.
- 2026-10-03, restos del interpretador que seguían en el código sin uso: `AGENDA_TERMS` / `shouldConsultAgenda` / `getAgendaContextForConversation` / `queryAgenda` / `formatAgendaContext` / `formatPatientAppointments` (`agendaAiQuery.service.js`, queda solo `queryPatientAppointments`), `sameTimeRequested` y `timeToMinutes` (`dateTimeResolver.service.js`), y el campo `intent` del estado de conversación (la columna `conversation_state.intent` queda en la tabla, siempre NULL; ya no se lee ni se escribe).
- Flag `MENSAJES_AGENTE_NUEVO`. Los frenos globales son "Pausar IA" / "Reanudar IA" / "Pasar todo a IA" (ver "Controles globales de la IA").

## Probado

- Simulador real: agendar, consultar, cancelar, reprogramar — OK con paciente vinculado y sin vincular.
- Typos pesados ("kiero sita pa la limpiez el viernes tempranito") — el agente los entiende.
- "no gracias" tras agendar — no re-dispara `crear_cita`.
- Fix de la cola verificado en producción: lotes nuevos con `attempts: 1` (antes 20-34), una fila por cita.
- Vinculación automática: match por teléfono → `pacienteIdAP` en la cita + conversación identificada. Match por nombre con teléfono distinto → flujo `verificar_cambio_telefono`. Familiar (teléfono de otro nombre) → provisional, no se mal-vincula.
- La IA pide el teléfono de forma normal (no pregunta "¿es el mismo número del chat?"); solo lo toma si el paciente lo dice.
- Ventana horaria por servicio: con "Control Mensual" configurado L–V 13:00–16:30 / Sáb 08:00–11:30, el paciente pidió su control "mañana a las 9 am" → la IA citó el horario de atención, rechazó las 9am y ofreció solo slots dentro de ventana. `crear_cita`/`reprogramar_cita` fuera de ventana → rechazadas antes del insert (verificado con node contra la DB real).

## Prompt: adherencia del modelo, no siempre lógica de código

- **Caso 2026-09-05 (paciente ya identificado, la IA igual pidió el nombre):** recepción identificó y liberó una conversación con un servicio `requiresIdentifiedPatient` (Control Mensual de ortodoncia); el flujo de datos fue correcto (identidad vinculada a tiempo, `consultar_disponibilidad` encontró el horario, lo que confirma que `identityGuard` sí reconoció al paciente), pero el modelo igual preguntó "¿me confirma su nombre completo?" — algo que el prompt ya prohibía explícitamente en el bloque `describePatient`. No fue un bug de código: fue el modelo no siguiendo una instrucción que competía por atención con el resto del prompt (política + conocimiento de la clínica, que es largo).
  - Fix: se reforzó la misma regla en dos lugares de bajo riesgo — `assistant-policy.md` regla 5 (archivo de texto, se lee del disco en cada turno, sin necesidad de reiniciar) y el bloque RECORDÁ de `assistantContext.service.js` (repite la regla con el nombre real del paciente vinculado; requiere reinicio de la app). Verificado reproduciendo el caso exacto con `runAssistant` en aislado contra el proveedor real (3 corridas seguidas, ninguna volvió a pedir el nombre).
  - **Lección para evaluar a futuro:** si el modelo vuelve a "olvidar" una instrucción puntual, el conocimiento de la clínica (`ai_assistant_knowledge.knowledge`) es un solo bloque de texto libre bastante largo (todas las promociones y precios de la clínica) que compite por atención con reglas cortas. La solución que ya funcionó dos veces es repetir la regla puntual en el bloque RECORDÁ (el más cercano al final del prompt, antes de la respuesta) en vez de acortar o reescribir el conocimiento de la clínica.
  - **Riesgo de deriva ya identificado, sin resolver a propósito (el usuario ya lo tiene en cuenta):** el horario de ortodoncia (L–V 1:00–4:30pm, sáb 8:00–11:30am) está escrito dos veces — una vez en el conocimiento de la clínica (texto libre, es lo que la IA *dice*) y otra vez en `ai_service_settings.weekly_hours_json` (configuración real, es lo que *bloquea* la agenda en `searchAvailability`). Hoy coinciden. Si algún día se cambia el horario en Ajustes → Servicios IA sin actualizar el texto (o viceversa), la IA va a decir un horario distinto al que realmente agenda. No se tocó porque el usuario ya está al tanto de la relación entre ambos y lo maneja manualmente.

## Identidad de conversaciones `@lid` vs `@c.us` — resuelto 2026-09-04/05

- **Root-caused 2026-08-31, arreglado 2026-09-04/05:** al mandar un recordatorio a un paciente con el que la cuenta nunca había chateado, el saliente queda en un chat `@c.us` (teléfono real) pero la respuesta del paciente a veces llega identificada por WhatsApp con un `@lid` distinto que no se resuelve a tiempo — resultado: dos conversaciones separadas para la misma persona (el recordatorio en una, la respuesta real en la otra). Confirmado con datos reales el 2026-09-04: ~20 pares divididos en una sola tanda de recordatorios, incluyendo un caso con una reprogramación completa hecha a mano por recepción en el chat "equivocado".
- Ya existía el mecanismo correcto (`refreshLidConversations` + `resolvePhoneForChatId`), pero (a) solo corría una vez al reconectar, no de forma continua, y (b) `isAbsorbable` en `mensajesRepository.service.js` se negaba a fusionar un chat `@lid` recién resuelto con el chat `@c.us` del recordatorio porque lo trataba como "otro chat real" (por tener su propio `wa_chat_id`).
- Fix aplicado: `isAbsorbable` ahora también considera absorbible un chat `@c.us` que **nunca recibió respuesta** (el cascarón que deja un recordatorio) — condición segura porque solo aplica cuando no hay ningún mensaje `incoming` en ese chat. `mergeConversation` ahora también arrastra el `patient_id` del chat absorbido si el destino no tenía uno. `refreshLidConversations` pasó de correr solo al reconectar a correr cada 3 minutos mientras esté conectado (`mensajesRuntime.service.js`), y solo repasa conversaciones aún no resueltas (`conversation.phoneResolved`).
- No se tocó nada del conector en vivo (envío/recepción de `whatsappWebMessagingConnector.js`), solo lógica de fusión en SQLite — bajo riesgo, consistente con [[feedback-whatsapp-connector-changes]].
- **Hallazgo importante para "borrar conversaciones":** ese botón (`deleteAllConversations`) borra físicamente `conversations`/`messages`/etc, pero **no borra `patient_chat_identities`** (a propósito, para no perder la vinculación paciente↔chat de un día a otro). Consecuencia real observada el 2026-09-04: si recepción vincula al mismo paciente dos veces el mismo día en los dos chats divididos (primero el `@lid` real, después por error el `@c.us` cascarón), la regla "solo una vinculación activa por paciente" deja activa la **última**, que puede ser el chat muerto — el paciente queda con vinculación activa apuntando a un chat que nunca va a recibir otro mensaje suyo. Se detectó y corrigió un caso puntual (paciente #748) revisando `patient_chat_identities` a mano; no hay todavía una herramienta que lo detecte solo. Con el fix de arriba ya en producción, este escenario debería dejar de generarse desde el 2026-09-05 en adelante.

## Recuperación de mensajes no leídos al conectar — 2026-09-08

Al conectar (`ready` / state-probe `CONNECTED`), `whatsappWebMessagingConnector.startInboundRecovery()` hace **una sola pasada** (agendada a 0/5/15/30 s por si WhatsApp Web aún sincroniza historial) que trae **solo los chats con `unreadCount > 0`** (tope 50 msgs/chat, sin grupos/newsletter/`status@broadcast`). Cada mensaje entra con `source: "recovery"` → `saveIncomingMessage` deduplica por `externalId` y `evaluateConversationEvent` lo marca `isReconnect` (entra a la vista, **no dispara la IA**).

Antes esta función existía pero **nunca se llamaba** (solo `stopInboundRecovery` estaba cableado); por eso al conectar no aparecía nada de lo pendiente. La versión previa era un poll `setInterval` cada 3 s de por vida; se cambió a pasadas acotadas. `stopInboundRecovery` (en `disconnected`/`disconnect()`) resetea `inboundRecoveryStarted` para que un reconecte vuelva a correr.

Trae las **últimas 40 líneas** (`HISTORY_LIMIT`) de cada chat no leído — entrantes **y salientes** (las salientes se emiten como `outgoingMessage` con `author: "human"`, `source: "recovery"`; no disparan IA) — para que recepción / la IA tengan el hilo con contexto, no solo el mensaje pendiente suelto.

**Por qué no usa `client.getChats()`, `client.getChatById()` ni `client.getMessageById()`:** los dos primeros pasan por `WWebJS.getChatModel()` / `findOrCreateLatestChat`, que en la versión actual de WhatsApp Web + whatsapp-web.js 1.34.7 **revienta con error minificado `'r'` para los chats `@lid`** (casi todos los no leídos). `getMessageById` tampoco: el `_serialized` del `MsgKey` de esos mensajes viene `null`. La pasada, dentro del Store: por cada chat no leído (incluye `unreadCount === -1` / `markedAsUnread`, que es como WhatsApp marca "no leído a mano") llama `WAWebChatLoadMessages.loadEarlierMsgs({ chat })` sobre el **chat crudo** (no el serializado que revienta) hasta juntar 40 líneas, serializa cada mensaje con `WWebJS.getMessageModel(m)` y devuelve los modelos planos; acá se envuelven en `new Message(client, model)`. El log `detalle: [{ enCacheInicial, enCache }]` muestra cuánto había en memoria vs cuánto se cargó. Respaldo para lo que no alcance: el path en vivo (`message`/`message_create`, que ya usa metadata mínima cuando `message.getChat()` falla para `@lid`).

## Duplicados por migración LID de WhatsApp — 2026-09-08

WhatsApp migra contactos de teléfono (`@c.us`) a LID (`@lid`) **a mitad de conversación**; whatsapp-web.js entonces entrega dos "chats" para la misma persona y, como las conversaciones se llavean por `wa_chat_id`, quedaban **dos conversaciones** (una con historial viejo `@c.us`, otra con lo nuevo `@lid`). `isAbsorbable` se negaba a fusionarlas porque ambas tienen mensajes entrantes (guarda anti-familiares que comparten número). La recuperación de no leídos lo destapó de golpe (importa muchos `@lid` juntos).

Fix (solo lógica de fusión en SQLite, `mensajesRepository.service.js`):

- **A — fusión por paciente / teléfono compartido.** `mergeConversationsForSamePatient()` corre en cada `saveIncomingMessage`/`saveOutgoingMessage`. `resolvePatientForConversation()` decide el paciente: el vínculo directo, o —si la conversación no tiene— el de una conversación vinculada que comparta un teléfono real de 8 dígitos (propio o el de su `patient_chat_identities`), **solo si hay un único candidato** (no mezcla familiares homónimos). Esto cubre el caso en que WhatsApp migra a un chat id nuevo `@c.us`/`@lid` que todavía no tiene identidad — la vieja sí. Sobrevive la que tiene teléfono real / es `@c.us`; a igualdad, la más antigua. `mergeConversation` mueve la identidad de paciente al chat id superviviente si este no tenía una. `reconcilePatientDuplicates()` corre al arrancar (`mensajesRuntime.start`): junta por paciente compartido y repasa cada conversación sin paciente por si comparte teléfono con una vinculada.
- **B — `isAbsorbable` relajado para `@lid`.** Cuando WhatsApp resuelve un `@lid` a un teléfono que ya tiene chat `@c.us`, se permite la fusión **salvo** que cada lado esté vinculado a un paciente **distinto** (familiares). Firma nueva: `isAbsorbable(candidate, waChatId, resolvingPatientId)`.
- **Tabla `wa_chat_aliases` (`wa_chat_id` → `conversation_id`).** Al fusionar, el chat id del absorbido pasa a resolver a la conversación sobreviviente. `findOrCreateConversation` la consulta antes de crear: sin esto, cada mensaje nuevo por el id viejo volvía a partir la conversación. `mergeConversation` también desactiva `conversation_patient_links` del absorbido.
- `getPatientLink` es **tolerante a fusiones** (3 caídas): (1) identidad activa por el `wa_chat_id` de la conversación; (2) identidad activa en un chat id que sea **alias** de esta conversación; (3) la identidad activa más reciente del `conversations.patient_id`. Sin esto, tras una fusión el panel mostraba "Paciente no identificado" aunque la columna `patient_id` estuviera puesta. `mergeConversation` además consolida la identidad activa al `wa_chat_id` del superviviente.
- **Resolución `@lid` → teléfono, más rápida y persistente:**
  - `resolveLidPhoneLocal()` (nuevo): lookup **sincrónico en la página** con `WAWebApiContact.getPhoneNumber` — instantáneo cuando WhatsApp ya tiene el mapeo (casi siempre para alguien que ya escribió). Se prueba **antes** de `getContactLidAndPhone`, que hace una consulta de red y puede tardar minutos. `getIndividualMeta` y `resolvePhoneForChatId` lo usan primero.
  - La recuperación de no leídos resuelve el teléfono de cada chat `@lid` **en la misma pasada** (`WAWebApiContact.getPhoneNumber` sobre el chat crudo) y lo adjunta al mensaje (`__lidPhone`), así la fusión ocurre al importar, sin ventana de duplicado.
  - Tabla **`lid_phone_map`** (`lid` → `phone`, persistente, sobrevive "Borrar todo"): cada resolución exitosa se guarda. `findOrCreateConversation`, si el conector no trajo el teléfono de un `@lid` pero el mapa lo conoce, lo usa → el `@lid` rutea a la conversación `@c.us` existente (el `@lid` pasa a ser el chat id vigente, el `@c.us` queda de alias). Una vez resuelto un contacto, **no se vuelve a partir nunca**.
  - `refreshLidConversations` corre cada **60 s** (antes 3 min) + ráfagas a los 3/15/40/90 s de conectar.
  - Logs: `LID -> telefono (local)` / `(red)` / `refresh LID -> telefono (red)`.
- No implementado (era la opción C): fusión por nombre de WhatsApp idéntico + líneas de tiempo sin solape, para duplicados **sin paciente vinculado ni teléfono resoluble** (p. ej. "Karen" / `9109927637216@lid` + `50360361332@c.us`). Esos solo se juntan si el `@lid` logra resolver su teléfono.

Verificado con `node` contra copia de la DB real: A fusiona y preserva los 35 mensajes en el superviviente, crea el alias, y un mensaje nuevo por el id absorbido rutea al superviviente (no re-split). B fusiona sin paciente y **no** fusiona con pacientes distintos.

## Reloj del paciente adelantado — bucle de la cola de respuestas (2026-09-08)

El `message_at` de los mensajes **entrantes** lo pone el teléfono del paciente y puede venir minutos adelantado o atrasado. Varias comprobaciones de "¿ya respondimos?" comparaban ese timestamp con el de las respuestas de la IA (reloj del servidor): con un reloj adelantado, ninguna respuesta quedaba "después" del mensaje → `listUnansweredAssistantMessages` lo devolvía como pendiente → `tick()` reencolaba → `processBatch` lo cancelaba (por `last_message_direction='outgoing'`) → **bucle: un `response_queue` nuevo cada ~5 s**. Síntomas: "La IA está preparando una respuesta…" perpetuo en el panel, y salientes duplicados (ver abajo).

Fix (todo por **id de mensaje**, que es orden de inserción / reloj del servidor, nunca `message_at`):
- `listUnansweredAssistantMessages`: "último mensaje del paciente" y "¿hay saliente después?" por `o.id > m.id`.
- `getLatestMessage` (lo usa `responseQueueStillEligible`): `ORDER BY id DESC`.

## Salientes duplicados por external_id inestable

El mismo mensaje saliente llega por varias vías con `external_id` distinto: el envío directo de la IA (`sendAiMessage`), el evento `message_create`, y la recuperación de no leídos. Para `@lid` el `_serialized` real viene `null` y cada camino sintetiza un id distinto (no determinista) → `saveMessage` no los reconocía como el mismo → fila duplicada (visible en el panel; WhatsApp recibía uno solo).

Fix: `saveMessage`, para `direction='outgoing'`, además del match por `external_id` deduplica por **mismo `conversation_id` + mismo `content` + `message_at` a ≤ 180 s**. Los entrantes NO se deduplican por contenido (el paciente sí manda "?" dos veces). Un mismo template saliente en días distintos se guarda (fuera de la ventana).

**Condición de turno (2026-10-04):** además, solo es duplicado si no hay ningún entrante después del saliente previo (`id > MAX(id) entrante`). Sin esto, una respuesta nueva igual a la anterior ("¡Con gusto!") se descartaba sin actualizar `last_message_direction` → el paciente quedaba "sin responder" → la IA reenviaba en bucle. Ver `26_bug_bucle_salientes_duplicados.md`.

## Respuesta a un recordatorio desde un `@lid` sin resolver — 2026-09-18

- **Caso real (conv 648, Eris David Mira Orellana):** recordatorio enviado 20:54:22 UTC al chat `@c.us`; la paciente contestó "Si primero Dios" a las 20:55:32 desde un `@lid` que WhatsApp todavía no resolvía → conversación nueva **sin el recordatorio** → la IA respondió un saludo genérico ("¿En qué puedo asistirle hoy?") a las 20:55:45 y la cita no se confirmó. El log muestra que a las 20:55:45 el conector ya podía resolver el `@lid`, pero la fusión con el chat del recordatorio recién ocurrió a las 20:56:06 (ciclo de 60 s de `refreshLidConversations`).
- **Por qué no la frenó la guarda anterior:** `messageTriage` solo retenía respuestas breves de una lista de frases exactas ("si", "primero dios"…) y "Si primero Dios" no estaba. Cualquier guarda por frases deja variantes afuera ("No podré ir mañana, tengo un compromiso"). La IA no falló: la regla del prompt para confirmar asistencia ya cubre "primero dios"; le faltaba el recordatorio en el hilo.
- **Acuerdo (criterio por estado, no por frases):** chat `@lid` sin resolver (`!phoneResolved`) **y** sin ningún saliente nuestro (`!lastOutboundAt`) → la IA no responde hasta tener el contexto, para no contradecirse ni decir cosas sin sentido.
- **Implementación** (`aiObserver.processBatch`, antes del triage):
  1. `resolveUnlinkedLid`: intenta resolver el teléfono con `connector.resolvePhoneForChatId` (inyectado con `setLidResolver` desde el runtime; tope de 3 s porque el tick es serial y la consulta de red puede tardar minutos) y `updateWhatsAppContact` fusiona con el chat del recordatorio → el agente ve el hilo completo.
  2. Si sigue sin contexto, se **difiere** el lote (`generating`, `attempts=0`, `due_at` +5 s; los mensajes nuevos se siguen agrupando en él y no se gastan los 8 reintentos) hasta `LID_HOLD_MAX_MS` (60 s desde que se creó el lote).
  3. Vencido el plazo → `review_required` con motivo; nunca responde a ciegas. Un chat con saliente propio (recepción o IA ya hablaron ahí) o con teléfono resuelto responde normal.
  - Mientras espera, el panel muestra "La IA está preparando una respuesta…" (máx. 60 s).
- `messageTriage` dejó de tener la regla por frases (`bare_reply_unlinked_chat`): queda solo audio/media.
- **Verificado offline:** replay del caso sobre una copia de la BD con el `aiObserver` real (LLM y envío stubbeados): resuelve al 2º intento → la IA ve [recordatorio, "Si primero Dios"] con el teléfono real y responde una sola vez; nunca resuelve → `review_required` sin respuesta; espera acotada dentro del plazo; un resolver colgado no traba la cola; chat resuelto o con saliente propio → sin cambios. **Pendiente: confirmar en vivo** con la próxima tanda de recordatorios (logs `Respuesta en espera: chat @lid…`, `LID resuelto antes de responder`, `Revisión humana: LID sin resolver tras la espera`).
- Riesgo asumido: un paciente nuevo cuyo `@lid` nunca resuelve (contacto sin teléfono visible) ahora pasa a recepción a los 60 s en vez de recibir respuesta de la IA.

## Cambios 2026-10-03

- **Copia de configuración por módulos** (`configTransfer.service.js`, `MODULES`): los 6 módulos son las pestañas de Ajustes (Respuestas automáticas, Asistente IA, Vinculaciones, Configuración IA, Servicios IA, Agenda IA). Exportar y borrar usan las casillas de arriba; importar es en dos pasos (elegir archivo → se marcan solo los módulos que trae → "Aplicar importación"). Importar reemplaza cada módulo (Servicios IA reemplaza la lista completa: lo que no viene queda deshabilitado), salvo Vinculaciones, que suma. **Borrar configuración** (`POST /config-reset`, doble confirmación: escribir BORRAR + confirm) vuelve a valores de fábrica; no toca conversaciones, mensajes ni citas.
- **Import lento**: la revalidación de vinculaciones hacía una consulta MySQL por vinculación (~28 s con 197 contra MySQL remoto > 20 s del timeout del frontend; el import terminaba en el servidor pero la pantalla decía "tardó demasiado"). Ahora es una sola consulta `IN (...)`.
- **Corte duro de historial a 48 h** (`mapHistory`): si hubo un vacío ≥ 48 h, a la IA solo le llega lo posterior al último vacío (más una línea "contacto nuevo"). Antes se mandaba todo con una nota y el modelo a veces retomaba un pedido viejo sin responder (1 de 3 corridas en la prueba). La cita ya gestionada sigue en la memoria del agente.
- **Red de seguridad "cita afirmada sin registrar"** (`assistantAgent.service.js`): por estado + contexto, no por frases. Si en la conversación no hay acción de agenda respaldada (herramienta exitosa en el turno o `lastAppointment` en memoria), un juicio corto del modelo (`requestJudgement`) decide si la respuesta le da a entender al paciente que la cita ya quedó hecha. Si sí: se le devuelve al modelo una vez para que llame la herramienta o corrija; si insiste, no se envía, va "Permíteme confirmar ese dato con recepción…" y pasa a revisión. Si el juicio falla, la respuesta sale igual.
- **Etiqueta "Sin responder"** (filtro ⏳ en la lista): el último mensaje del paciente (sin reacciones) no tiene ningún saliente después, no fue marcado como atendido y lleva ≥ 10 min (`awaitingSince` en `listConversations`, por id de mensaje). Vale para todos los modos y abrir el chat no la quita. Botón **"✓ Atendido"** (`POST /conversations/:id/attended`, columna `conversations.attended_message_id`): quita la etiqueta sin cambiar el modo (≠ "Tomar"); si el paciente vuelve a escribir, la etiqueta vuelve. No dispara la IA: respeta Pausar / Reanudar.
- **Nombre del paciente vinculado en la lista** (`linkedPatientName`): lo calcula el backend con las mismas caídas que `getPatientLink` (chat id, alias tras fusión, `patient_id`). Antes salía de cruzar `waChatId` con `/patient-identities`, que tiene tope de 200 y no seguía fusiones. La búsqueda también busca por ese nombre.
- **Diálogos: nunca `confirm()` / `prompt()` nativos en Mensajes.** Se usa `askConfirm()` (envuelve `showSystemConfirm` de `uiAlerts.js`, mismo patrón que Agenda/Paciente/Cobro). En Electron/Windows el diálogo nativo deja la ventana sin foco de teclado al cerrarse: todo se ve terminado pero los inputs (chat, simulador, Ajustes) no aceptan escritura hasta cambiar de ventana — era el síntoma de "Borrar todo". `prompt()` además no está soportado en Electron (se quitó `openPatientSearch`, código muerto que lo usaba).
- **"Borrar todo"** ahora deja el panel del chat en "Selecciona una conversación" (`resetChatPanel`); antes quedaba la conversación borrada en pantalla con el compose activo, y escribir ahí no hacía nada (`selectedId` era null). La guarda `deletingAll` se toma antes de preguntar (sin doble confirmación encolada ni poll a mitad del borrado).
- **`.sys-alert-overlay` con `z-index: 200000`** (`uiAlerts.css`, afecta a toda la app): con 5200 quedaba detrás de Ajustes de Mensajes (6000) y de los modales del odontograma (~100071) — el aviso era invisible pero tomaba el foco y capturaba Enter/Escape.
- **Migraciones 51 y 52 reservadas** (`SELECT 1;`): eran `media_path` e `image_triage_enabled` (descartadas en eeaa207) y se quitaron del código después de aplicarse en el equipo de desarrollo; como la versión es la posición en el arreglo, una migración nueva en la 51 se saltaba ahí. No borrar esos huecos.

## Pendiente

- **URGENTE — bucle de respuestas por dedup de salientes** (encontrado en WhatChat el 2026-10-03): una respuesta de la IA con el mismo texto que otra de hace ≤ 3 min se descarta como duplicada, el mensaje del paciente queda "sin responder" y la IA lo vuelve a contestar cada pocos segundos sin fin. Ver `26_bug_bucle_salientes_duplicados.md` (arreglo de una línea en `saveMessage`).

Plan acordado el 2026-10-03 (1 y 2 hechos, ver "Cambios 2026-10-03"):
- **3. Conector caído al enviar.** Hoy `processBatch` corre el turno completo (a veces con `crear_cita`), falla en `sendAiMessage` por "Conector no conectado", reintenta a los 3 s **regenerando con la IA** y al 3er intento queda `failed` en silencio; si la cita se creó, el paciente nunca recibe la confirmación (~290 lotes así en el log entre ago y oct). Propuesta: mirar el estado del conector antes de llamar a la IA (si está reconectando, diferir sin gastar intentos, como el hold de `@lid`); si la respuesta ya estaba generada, reenviar ese mismo texto sin regenerar; antes de enviar, no mandar nada si recepción ya escribió en el chat; plazo (propuesto 5 min) y luego `review_required` con motivo "No se pudo enviar: WhatsApp desconectado" + "cita creada, falta confirmarle" si aplica. Respeta Pausar/Reanudar. Pendiente de definir con el usuario: plazo y si la confirmación de una cita creada se envía sola al reconectar aunque pase el plazo.
- **4. Pasadas extra de recuperación de no leídos.** `startInboundRecovery` solo pasa a los 0/5/15/30 s de conectar; WhatsApp Web sigue sincronizando después (log 2026-10-02: 2 → 3 → 4 chats entre pasadas) y lo que aparece tarde no se importa hasta reiniciar. Propuesta: pasadas a 1/2/5/10 min o al cambiar el conteo de no leídos (dedup por `externalId`, no dispara IA). Toca el conector: confirmar en vivo antes de aplicar.
- "Marcar respuesta como incorrecta" + nota (tabla que no se borre con las conversaciones) para armar un set de regresión con casos reales; `ai_runs` existe pero nunca se escribe (0 filas).
- Soportar modelos "thinking" (devolver `reasoning_content` en el historial): con uno configurado, cada turno con herramientas falla con HTTP 400 (222 lotes el 11–14 sep).
- Búsqueda de chats: hoy filtra solo las 100 conversaciones cargadas; pasarla al backend si hace falta encontrar chats viejos.
- Probar el path `json` con un modelo local real (hoy solo se probó `cloud`/native con DeepSeek).
- Consola `assistant-console.js`: la llamada real a `createAppointmentForAssistant` se hace vía objeto de módulo (`appointmentActions.x`) para poder mockearla; al probar SIEMPRE mockear o usar datos descartables (ya se crearon citas reales de prueba por error dos veces).
- Suite de pruebas automatizada de extremo a extremo.
- Opcional: distinguir en el panel "identificado automáticamente" vs "por recepción" (`verified_by` queda NULL en el auto).
- Opcional: no hay todavía una herramienta que detecte sola el caso de "vinculación activa apuntando al chat muerto" (ver paciente #748 arriba); hoy se revisa a mano contra `patient_chat_identities`.

## Promociones por bloques — 2026-10-06
- Botón `📣 Promociones` (junto a Recordatorios). Una **campaña** = nombre + texto (`{{nombre}}`). Se elige a quién con los filtros del Seguimiento (tratamiento, estado, ausencia incl. "Al día", próxima cita) y se manda un **bloque** de N (default 50). El bloque siguiente solo toma pacientes que aún no tienen esa campaña.
- Registro en SQLite: `promo_campaigns`, `promo_batches`, `promo_batch_items`. "Ya la recibió" = item `sent` o en curso, por `patient_id` **o** teléfono (hermanos con el número de la mamá reciben una sola). `failed`/`cancelled` vuelven a entrar en el próximo bloque.
- Pacientes: `listarPacientesSeguimiento()` en `paciente.controller.js` reutiliza `consultarMonitorConFiltroProxima` sin paginar (ahora acepta `proximaFiltro=all`). Excluye pacientes sin `ultimaVisitaP` (igual que el Seguimiento). Teléfono: primer número de `telefonoP` (8–15 dígitos).
- Envío: `processPromo` en el runtime, mismo ritmo que los recordatorios (pausa aleatoria `reminder_min/max_delay_seconds`), por `outgoing_queue` con clave `promo-<lote>-<item>` → se guarda con `author="system"` (no cuenta como mensaje de recepción). Un bloque a la vez. Si WhatsApp se cae o se reinicia la app, el bloque queda a medias → botón "Reanudar bloque".
- Si el paciente responde, la IA atiende como cualquier chat (la promoción no se correlaciona con citas como los recordatorios).
- **Envío seguro (2026-10-06, tras un incidente):** el bloque se crea solo con los `patientIds` que el usuario vio en la lista cargada (intersección con los pendientes); cambiar un filtro borra la lista. Enviar guarda antes la campaña si el texto cambió y la confirmación muestra el mensaje real. La campaña guarda sus filtros (`filters_json`). Se puede borrar una campaña (borra también su registro de envíos).
- **Lista importada:** `promo_campaigns.source = seguimiento | lista`. Con `lista`, los destinatarios salen de `promo_campaign_contacts` (UNIQUE campaña+teléfono) y `promo_batch_items.patient_id` guarda el id del contacto. El navegador lee el `.xlsx` (ZIP + XML con `DecompressionStream`/`DOMParser`, primera hoja, sin librerías) o el `.csv` (`;`, `,` o tab; cae a windows-1252) y detecta columnas: teléfono = la que más celdas con 8-15 dígitos tiene; nombre = encabezado Nombre/Cliente/Paciente/Usuario o la columna con más texto. Sin nombre, `{{nombre}}` se quita con el espacio previo.
- **Robustez de envío (2026-10-06):** `processPromo` reintenta el vaciado de la cola hasta ~12 s (el vaciado en curso puede no incluir la fila); si sigue pendiente la cancela en `outgoing_queue` antes de marcar `failed` (nunca `failed` algo que todavía puede salir → evitaba reenvíos duplicados). `reconcilePromoItems` ajusta items `sending/queued` contra `outgoing_queue` (clave `promo-<lote>-<item>`) al reanudar tras reinicio. Cancelar retira de la cola lo pendiente. `sendPromoBlock` revisa de nuevo bloque activo y registro en la parte síncrona (doble clic / dos equipos). Teléfono: se prefiere el primer celular (6/7) y `503`+8 se guarda como 8. Los `failed` no se reintentan salvo la casilla "Reintentar los que fallaron" (bloqueo por teléfono, no por paciente).
- **Duplicado al fusionar chats (2026-10-06):** `mergeConversation` llama `dedupeOutgoingMessages` (mismo texto, ≤3 min, sin entrante entre medio; conserva el primero con el external_id real). Caso: conv 1452, promo guardada en `@c.us` + eco sincronizado en `@lid`.
- **La IA conoce las promociones (2026-10-06):** `assistantContext` busca promos `sent` de los últimos 15 días para el chat (`repo.getRecentSentPromos`, por teléfono o por texto exacto de un saliente `system`, para cubrir `@lid` sin resolver). (1) En el historial el saliente se etiqueta "[Promoción enviada por la clínica a varios pacientes…]". (2) Bloque `PROMOCIÓN QUE LA CLÍNICA LE ENVIÓ A ESTE PACIENTE` (sección fija por conversación): intención = que la aproveche y agende; responder normal; si escribe por otro motivo atender ese motivo; no suponer por qué la recibió (activos/inactivos/nuevos); la INFORMACIÓN DE LA CLÍNICA manda sobre precio/vigencia. El bloque existe aunque el corte de 48h saque la promo del historial (paciente que vuelve días después). No aplica en modo venta.
  - Vigencia: `promo_campaigns.valid_until` (campo "Válida hasta" del modal). Con fecha, la IA la tiene en cuenta hasta ese día; sin fecha, 15 días desde el envío. Precio: para lo que ofrece la promo vale el precio/condición del mensaje (aunque no esté o difiera en INFORMACIÓN DE LA CLÍNICA o el catálogo), solo en chats que la recibieron; prohibido extenderla a otros servicios o inventar condiciones (si no lo aclara el mensaje → recepción).
