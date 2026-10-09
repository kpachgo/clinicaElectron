// Normaliza los ARGUMENTOS de fecha/hora que el modelo pasa a las herramientas
// (consultar_disponibilidad, crear_cita, reprogramar_cita): a veces manda
// "el lunes" o "10:00 AM" en vez de "2026-10-05" / "10:00". NO interpreta los
// mensajes del paciente ni decide intenciones: eso lo hace la IA. No agregar acá
// vocabulario para "entender" al paciente.
const TIMEZONE = "America/El_Salvador";

function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function isoToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date()); }
function isoDateAt(offset) { const date = new Date(`${isoToday()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
function addDays(date, amount) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function weekdayOf(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MONTH_RE = Object.keys(MONTHS).join("|");
// "5 de noviembre", "jueves 5 de noviembre de 2026", "noviembre 5". Sin año: la próxima vez que caiga.
function dayMonthDate(normalized) {
  const match = normalized.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_RE})(?:\\s+(?:de|del)\\s+(20\\d{2}))?\\b`));
  const swapped = match ? null : normalized.match(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:\\s+(?:de|del)?\\s*(20\\d{2}))?\\b`));
  if (!match && !swapped) return undefined;
  const [day, month, year] = match ? [match[1], match[2], match[3]] : [swapped[2], swapped[1], swapped[3]];
  const today = isoToday();
  let candidate = `${year || today.slice(0, 4)}-${String(MONTHS[month]).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!year && candidate < today) candidate = `${Number(today.slice(0, 4)) + 1}${candidate.slice(4)}`;
  if (new Date(`${candidate}T12:00:00Z`).toISOString().slice(0, 10) !== candidate) return null; // 31 de febrero -> null
  return weekdayContradicts(normalized, candidate) ? null : candidate;
}
// "lunes 13 de octubre" cuando el 13 es martes: no se elige ninguno de los dos, la IA vuelve a preguntar.
function weekdayContradicts(normalized, date) {
  const named = normalized.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  return Boolean(named) && ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"].indexOf(named[1]) !== weekdayOf(date);
}
function resolveDatePreference(text) {
  const value = String(text || ""); const normalized = normalize(value);
  let match = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return { type: "exact", dates: [`${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`], label: match[0] };
  match = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (match) return { type: "exact", dates: [`${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`], label: match[0] };
  const withMonth = dayMonthDate(normalized);
  if (withMonth !== undefined) return withMonth ? { type: "exact", dates: [withMonth], label: withMonth } : null;
  if (/\bpasado\s+manana\b/.test(normalized)) return { type: "relative", dates: [isoDateAt(2)], label: "pasado mañana" };
  // "en/por/de la mañana", "esta mañana", "hoy de mañana" son la franja del día, no "mañana" (día siguiente).
  if (/(?<!\b(?:la|esta|de) )\bmanana\b/.test(normalized)) return { type: "relative", dates: [isoDateAt(1)], label: "mañana" };
  if (/\b(hoy|dia\s+(de\s+)?hoy|esta\s+manana)\b/.test(normalized)) return { type: "relative", dates: [isoDateAt(0)], label: "hoy" };
  const weekdays = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const weekdayMatch = normalized.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (weekdayMatch) {
    const weekday = weekdays[weekdayMatch[1]];
    const looksLikeTime = new RegExp(`\\b${weekdayMatch[1]}\\s+\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?|de\\s+la\\s+(?:manana|tarde|noche))\\b`, "i").test(normalized);
    const dayMatch = looksLikeTime ? null : normalized.match(new RegExp(`\\b${weekdayMatch[1]}\\s+(\\d{1,2})(?:\\s+(20\\d{2}))?\\b`));
    if (dayMatch) {
      // "jueves 5" sin mes: este mes, o el siguiente si el 5 ya pasó. Si ese día no es jueves, null (que pregunte).
      const today = isoToday(); let year = Number(dayMatch[2] || today.slice(0, 4)); let month = Number(today.slice(5, 7));
      const build = () => `${year}-${String(month).padStart(2, "0")}-${String(dayMatch[1]).padStart(2, "0")}`;
      let candidate = build();
      if (!dayMatch[2] && candidate < today) { month += 1; if (month > 12) { month = 1; year += 1; } candidate = build(); }
      if (new Date(`${candidate}T12:00:00Z`).toISOString().slice(0, 10) !== candidate || weekdayOf(candidate) !== weekday) return null;
      return { type: "exact", dates: [candidate], label: weekdayMatch[1] + " " + dayMatch[1] };
    }
    const current = weekdayOf(isoToday()); let offset = (weekday - current + 7) % 7;
    if (offset === 0) offset = 7;
    return { type: "weekday", weekday, dates: [isoDateAt(offset)], label: weekdayMatch[1] };
  }
  if (/\b(la\s+)?(proxima|otra|siguiente)\s+semana\b/.test(normalized)) { const today = isoToday(); const day = weekdayOf(today); let offset = (8 - day) % 7; if (!offset) offset = 7; const monday = addDays(today, offset); return { type: "week", dates: Array.from({ length: 6 }, (_, index) => addDays(monday, index)), label: "la próxima semana" }; }
  return null;
}
// ranges: horario de la clínica ese día ([{start,end}] "HH:mm"). Sin AM/PM, "4:30" es la que cae dentro
// del horario (4:30 PM), como lo entiende recepción; si ninguna o ambas caen, queda como vino.
function timeFromText(text, ranges = []) {
  const value = String(text || "");
  const normalized = normalize(value).replace(/\b([ap])\. m\./g, "$1.m.").replace(/^las?\s+(?=\d)/, "a las "); // "2:30 p. m.", "las 3"
  const match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i) || normalized.match(/\b(?:a\s+la?s?|hora\s*(?:de|:)?\s*)(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la\s+)?(manana|tarde|noche)?\b/i) || normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s+de\s+la\s+(manana|tarde|noche)\b/i) || normalized.match(/\ba[ ]+la[ ]+(\d{1,2})(?::(\d{2}))?/i) || normalized.match(/\ba[ ]+las[ ]+(\d{1,2})(?::(\d{2}))?/i) || normalized.match(/\b(?:a\s+la?s?|hora\s*(?:de|:)?\s*)(\d{1,2})(?::(\d{2}))?/i) || (/^\s*\d{1,2}(?::\d{2})?\s*$/.test(normalized) ? normalized.match(/\b(\d{1,2})(?::(\d{2}))?\b/) : null);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] || 0); const meridiem = String(match[3] || "").toLowerCase();
  if (hour > 23 || minute > 59 || (!meridiem && hour === 0)) return null;
  if ((meridiem.includes("p") || meridiem === "tarde" || meridiem === "noche") && hour < 12) hour += 12;
  if ((meridiem.includes("a") || meridiem === "manana") && hour === 12) hour = 0;
  if (!meridiem && /\b(mediodia|medio dia)\b/.test(normalized)) hour = 12;
  if (!meridiem && hour >= 1 && hour < 12) {
    const open = (h) => ranges.some((r) => { const at = h * 60 + minute; const [sh, sm] = String(r.start).split(":").map(Number); const [eh, em] = String(r.end).split(":").map(Number); return at >= sh * 60 + sm && at < eh * 60 + em; });
    if (!open(hour) && open(hour + 12)) hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function formatDate(date) { return new Intl.DateTimeFormat("es-SV", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)); }

module.exports = { TIMEZONE, resolveDatePreference, timeFromText, formatDate };
