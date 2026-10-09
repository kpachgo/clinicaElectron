// Confiabilidad de dateTimeResolver (fecha/hora que la IA pasa a las herramientas). Correr: node scripts/mensajes-fechas-check.js
// "Hoy" fijo: viernes 2026-10-09, 9:00 AM El Salvador.
const assert = require("assert");
const RealDate = Date;
const FIXED = new RealDate("2026-10-09T15:00:00Z");
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED.getTime(); } };
const { resolveDatePreference, timeFromText } = require("../services/mensajes/dateTimeResolver.service");

const fecha = (t) => resolveDatePreference(t)?.dates?.[0] || null;
const dates = {
  "2026-10-15": "2026-10-15", "15/10/2026": "2026-10-15", hoy: "2026-10-09", "día de hoy": "2026-10-09", mañana: "2026-10-10", MAÑANA: "2026-10-10",
  "pasado mañana": "2026-10-11", "el lunes": "2026-10-12", miercoles: "2026-10-14", sábado: "2026-10-10", viernes: "2026-10-16", "lunes 12": "2026-10-12",
  "martes 13 de octubre": "2026-10-13", "jueves 5 de noviembre": "2026-11-05", "5 de noviembre de 2026": "2026-11-05", "15 de octubre": "2026-10-15",
  "octubre 15": "2026-10-15", "2 de enero": "2027-01-02", "5 de octubre": "2027-10-05", "31 de febrero": null, "la próxima semana": "2026-10-12",
  "hoy en la mañana": "2026-10-09", "hoy por la mañana": "2026-10-09", "el lunes en la mañana": "2026-10-12", "sábado por la mañana": "2026-10-10",
  "mañana por la tarde": "2026-10-10", "mañana en la mañana": "2026-10-10", "de la mañana": null, "el 15": null, "": null,
  "esta mañana": "2026-10-09", "hoy de mañana": "2026-10-09", "jueves 5": "2026-11-05", "lunes 5": null, "lunes 13 de octubre": null, "jueves 1 de enero": null
};
for (const [input, want] of Object.entries(dates)) assert.strictEqual(fecha(input), want, `fecha ${JSON.stringify(input)}`);

// Inválidas: el resolver las deja pasar y searchAvailability las frena con "Fecha invalida" (a propósito).
assert.strictEqual(fecha("2026-02-30"), "2026-02-30");

const semana = [{ start: "09:00", end: "17:00" }];
const sabado = [{ start: "08:00", end: "12:00" }];
const times = [
  ["2:30 PM", semana, "14:30"], ["2:30 p.m.", semana, "14:30"], ["2:30 p. m.", semana, "14:30"], ["9 a. m.", semana, "09:00"], ["las 3", semana, "15:00"], ["9 AM", semana, "09:00"], ["12:00 PM", semana, "12:00"], ["12:30 AM", semana, "00:30"],
  ["3 de la tarde", semana, "15:00"], ["10 de la mañana", semana, "10:00"],
  // Sin AM/PM: la que cae en el horario de ese día.
  ["4:30", semana, "16:30"], ["a las 4", semana, "16:00"], ["1:00", semana, "13:00"], ["10:30", semana, "10:30"], ["8", sabado, "08:00"],
  ["8", semana, "08:00"], // ni 8 AM ni 8 PM abren: queda como vino y la agenda la rechaza
  ["4:30", [], "04:30"], // sin horario conocido: sin cambios
  ["4:30 AM", semana, "04:30"], // AM explícito manda
  ["25:00", semana, null], ["", semana, null]
];
for (const [input, ranges, want] of times) assert.strictEqual(timeFromText(input, ranges), want, `hora ${JSON.stringify(input)}`);

console.log(`OK: ${Object.keys(dates).length + 1} fechas y ${times.length} horas`);
