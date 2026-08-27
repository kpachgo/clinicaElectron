"use strict";

// Presentación de horas en 12h con AM/PM. El almacenamiento interno sigue siendo
// "HH:mm" de 24 horas; esto es solo para el texto que ve el paciente (recordatorios,
// respuestas de la IA) y para los horarios que la IA le muestra.

function to12h(value) {
  const match = String(value == null ? "" : value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value == null ? "" : value);
  let hour = Number(match[1]);
  if (hour > 23) return String(value);
  const minute = match[2];
  const period = hour < 12 ? "AM" : "PM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${period}`;
}

module.exports = { to12h };
