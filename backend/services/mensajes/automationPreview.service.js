const { MensajesRepository } = require("./mensajesRepository.service");
const { normalizePhone } = require("./connectors/messagingConnector");
const repository = new MensajesRepository();

const templates = {
  appointment_confirmation: "Confirmación: su cita ha sido registrada correctamente.",
  appointment_reminder: "Recordatorio: tiene una cita próxima con la clínica.",
  appointment_change_notice: "Aviso: su cita fue cancelada o reprogramada. Puede comunicarse con la clínica para más información.",
  after_hours_reply: "Gracias por escribirnos. En este momento estamos fuera del horario de atención.",
  human_intervention_pause: "Su conversación será atendida por una persona de recepción."
};

function previewAutomation({ jobId, jobType, phone, text }) {
  const normalizedPhone = normalizePhone(phone);
  const content = String(text || templates[jobType] || "Mensaje automático de prueba.").trim();
  return repository.saveAutomationMessage({ phone: normalizedPhone, externalId: `automation-preview-${jobId}-${Date.now()}`, text: content, messageAt: new Date().toISOString() });
}

module.exports = { previewAutomation, templates };
