# Estado actual — Vista Mensajes

## Aprobación

La vista Mensajes queda aprobada para esta versión.

## Resumen

Mensajes atiende conversaciones de WhatsApp (y un simulador de pruebas). Un **agente IA con herramientas** responde en lenguaje natural, da información y precios, y ejecuta acciones de agenda (crear, consultar, reprogramar, cancelar) siempre validadas por el backend.

SQLite (`mensajes.sqlite`) guarda el estado operativo local: conversaciones, mensajes, colas, identidades de paciente, ajustes. MySQL es la fuente de verdad: pacientes, servicios (`servicio.precioS`), agenda (`agendapersona`, SPs `sp_agenda_*`) y la tabla de auditoría `mensajes_auditoria`.

El motor de intenciones por regex, las máquinas de estado de agenda hechas a mano y los flujos clínicos configurables **fueron eliminados**. El agente hace ese trabajo.

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

## Pendiente

- Probar el path `json` con un modelo local real (hoy solo se probó `cloud`/native con DeepSeek).
- Consola `assistant-console.js`: la llamada real a `createAppointmentForAssistant` se hace vía objeto de módulo (`appointmentActions.x`) para poder mockearla; al probar SIEMPRE mockear o usar datos descartables (ya se crearon citas reales de prueba por error dos veces).
- Suite de pruebas automatizada de extremo a extremo.
- Opcional: distinguir en el panel "identificado automáticamente" vs "por recepción" (`verified_by` queda NULL en el auto).
- Opcional: no hay todavía una herramienta que detecte sola el caso de "vinculación activa apuntando al chat muerto" (ver paciente #748 arriba); hoy se revisa a mano contra `patient_chat_identities`.
