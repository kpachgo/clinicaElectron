# Contrato interno del conector

Todo adaptador de mensajería debe implementar `MessagingConnector` y exponer:

- `connect()`
- `disconnect()`
- `getStatus()`
- `sendMessage(phone, text)`
- `onIncomingMessage(handler)`
- `onMessageStatus(handler)`

Los eventos entrantes deben pasar por `normalizeIncomingMessage()` y los
estados de envío por `normalizeMessageStatus()`. El resto del módulo no debe
depender de objetos propios de WhatsApp Web, Puppeteer u otro proveedor.
