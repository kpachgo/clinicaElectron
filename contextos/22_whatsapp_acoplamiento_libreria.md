# Acoplamiento de Vista Mensajes a `whatsapp-web.js`

Nota de evaluación (no es un plan aprobado). Responde a la pregunta: si más adelante se quiere dejar `whatsapp-web.js` y usar la API oficial de Meta (Cloud API / Business API) u otra librería, ¿qué tan atado está el resto de la vista Mensajes a esta librería puntual? Contexto: investigación de 2026-08-31 sobre mensajes salientes no capturados y teléfono corrupto en chats `@lid` (ver "Pendiente" en `20_estado_actual_vista_mensajes.md`), que expuso varias de estas costuras.

## Resumen

El acoplamiento real a `whatsapp-web.js` es **bajo-moderado** gracias a que ya existe un patrón adaptador. La mayor parte de la vista (SQLite, repositorio, agente IA, frontend) trabaja contra un "sobre" de mensaje normalizado y una interfaz abstracta, no contra objetos de la librería. Lo específico de `whatsapp-web.js` está concentrado casi todo en **un solo archivo**.

## Lo que ya está bien aislado

- `backend/services/mensajes/connectors/messagingConnector.js`: interfaz abstracta (`MessagingConnector`) con los métodos que cualquier conector debe implementar — `connect`, `disconnect`, `getStatus`, `sendMessage`, `onIncomingMessage`, `onOutgoingMessage`, `onMessageStatus` — más una función `normalizeIncomingMessage()` que define el "sobre" común: `externalId, phone, waChatId, waContactNumber, waDisplayName, author, text, direction, messageAt, rawType, source`.
- `backend/services/mensajes/connectors/simulatedMessagingConnector.js`: segunda implementación real de esa interfaz (usada por el simulador y por defecto en pruebas). Prueba que el contrato funciona con más de un backend.
- `backend/services/mensajes/mensajesRuntime.service.js`: el único punto donde se elige la implementación concreta (línea 7-9, por `process.env.MENSAJES_CONNECTOR`). El resto del archivo llama solo a los métodos de la interfaz (más unos pocos opcionales detectados con `typeof x === "function"`: `onStatus`, `setTyping`, `shutdown`, `clearSession`, `resolvePhoneForChatId`).
- Controladores/rutas (`mensajesView.controller.js`): `whatsappStart/Stop/ClearSession/Status` llaman a `connectConnector()/disconnectConnector()/clearConnectorSession()/getMetrics()` — genéricos, no tocan la librería.
- Todo el resto del dominio (repositorio SQLite, `aiObserver`, `assistantContext`, herramientas del agente, frontend) trabaja con el sobre normalizado (`phone`, `waChatId`, etc.), no con tipos de `whatsapp-web.js`. Se usan esos nombres de campo en ~74 lugares fuera del conector, pero son solo datos — cualquier conector nuevo los llenaría igual.

## Lo que SÍ está fuertemente atado a `whatsapp-web.js`

Todo concentrado en `backend/services/mensajes/connectors/whatsappWebMessagingConnector.js`:

- Uso directo de `Client`/`LocalAuth` de la librería (Puppeteer + navegador real cargando `web.whatsapp.com`).
- Escucha de eventos propios de la librería: `qr`, `message`, `message_create`, `message_reaction`, `authenticated`, `ready`, etc.
- El QR de vinculación **no se muestra dentro de la vista** — se ve en la ventana del navegador que abre Puppeteer (el frontend solo muestra el texto "QR en ventana de WhatsApp", ver `formatWhatsappStatus` en `frontend/js/mensajes.js`).
- La sesión se persiste en disco (`whatsapp-auth/`, carpeta de perfil de Chromium) — es lo que da los `EBUSY`/bloqueos de archivo que vimos hoy al reiniciar.
- Toda la lógica de resolución `@lid` → teléfono (`getContactLidAndPhone`, `getIndividualMeta`) es exclusiva de cómo `whatsapp-web.js` modela contactos — no existe en otras librerías ni en la API de Meta.

## Qué cambia conceptualmente si se pasa a la API oficial de Meta

- **Transporte**: deja de ser navegador+Puppeteer. Pasa a ser HTTP REST (enviar) + webhook (recibir) — se elimina toda la inestabilidad de sesión/QR/`@lid` que investigamos hoy.
- **Identidad**: Meta identifica cada conversación por el número de teléfono (`wa_id`, formato E.164) directamente en el payload del webhook — no existe el problema de identificadores distintos para el mismo contacto que tuvimos con `@lid`. Esto **simplifica** el modelo de identidad actual, no lo complica.
- **Autenticación**: token permanente + `phone_number_id` de Meta, no QR ni sesión de navegador. La UI de "Iniciar/Cerrar/Quitar sesión" se reemplazaría por un formulario de Ajustes con esas credenciales.
- **Requisito de negocio, no técnico**: el número debe ser dado de alta y verificado como número de WhatsApp Business con Meta (no puede ser un WhatsApp personal que ya se usa tal cual). Esto es trámite/aprobación, no código.
- **Ventana de 24 horas y plantillas**: Meta exige usar plantillas de mensaje pre-aprobadas para escribirle a un paciente fuera de una ventana de 24h desde su último mensaje. Esto **sí afecta lógica de negocio**, no solo el conector — los recordatorios de citas (`mensajesRuntime.processReminder`, plantilla libre hoy) probablemente necesiten reescribirse como plantilla aprobada por Meta si el paciente no escribió en las últimas 24h. Esta es la pieza de mayor esfuerzo real de una migración, más que el código del conector en sí.
- **Costo**: Meta cobra por conversación/plantilla iniciada por la clínica; `whatsapp-web.js` es gratis pero no oficial (riesgo de baneo del número, como cualquier automatización no soportada por WhatsApp).

## Esfuerzo estimado (orden de magnitud, sin comprometerse a nada)

1. Escribir `metaCloudApiMessagingConnector.js` implementando la misma interfaz de `MessagingConnector` (enviar por REST, recibir por webhook, mapear al mismo sobre normalizado). Tamaño comparable al conector actual.
2. Nueva ruta Express para el webhook de Meta (verificación de token + recepción de eventos).
3. Nueva UI de Ajustes para configurar token/`phone_number_id`/verify token (reemplaza el flujo QR).
4. Revisar y rediseñar recordatorios/mensajes fuera de la ventana de 24h como plantillas aprobadas — el trabajo no trivial real.
5. Trámite de alta/verificación del número con Meta (fuera del código).
6. El resto de la vista (SQLite, agente IA, frontend de conversaciones) no debería necesitar cambios más allá de que `wa_chat_id` pase a ser simplemente el número — de hecho se simplifica.

**Conclusión**: no es una reescritura de la vista Mensajes. Es un conector nuevo + una revisión de la política de recordatorios/plantillas + trámite de negocio con Meta. La arquitectura actual (interfaz + sobre normalizado) ya está pensada para esto.
