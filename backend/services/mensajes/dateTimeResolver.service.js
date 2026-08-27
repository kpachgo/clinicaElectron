const TIMEZONE = "America/El_Salvador";

function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function isoToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date()); }
function isoDateAt(offset) { const date = new Date(`${isoToday()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
function addDays(date, amount) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function weekdayOf(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
function resolveDatePreference(text) {
  const value = String(text || ""); const normalized = normalize(value);
  let match = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return { type: "exact", dates: [`${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`], label: match[0] };
  match = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (match) return { type: "exact", dates: [`${match[3]}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`], label: match[0] };
  if (/\bpasado\s+manana\b/.test(normalized)) return { type: "relative", dates: [isoDateAt(2)], label: "pasado mañana" };
  if (/\bmanana\b/.test(normalized)) return { type: "relative", dates: [isoDateAt(1)], label: "mañana" };
  if (/\b(hoy|dia\s+(de\s+)?hoy)\b/.test(normalized)) return { type: "relative", dates: [isoDateAt(0)], label: "hoy" };
  const weekdays = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const weekdayMatch = normalized.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (weekdayMatch) {
    const weekday = weekdays[weekdayMatch[1]];
    const looksLikeTime = new RegExp(`\\b${weekdayMatch[1]}\\s+\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?|de\\s+la\\s+(?:manana|tarde|noche))\\b`, "i").test(normalized);
    const dayMatch = looksLikeTime ? null : normalized.match(new RegExp(`\\b${weekdayMatch[1]}\\s+(\\d{1,2})(?:\\s+(20\\d{2}))?\\b`));
    if (dayMatch) {
      const current = new Date(`${isoToday()}T12:00:00Z`); const year = Number(dayMatch[2] || current.getUTCFullYear());
      let candidate = `${year}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(dayMatch[1]).padStart(2, "0")}`;
      const parsed = new Date(`${candidate}T12:00:00Z`);
      if (Number.isNaN(parsed.getTime())) return null;
      if (!dayMatch[2] && candidate < isoToday()) candidate = `${year + 1}-${candidate.slice(5)}`;
      if (weekdayOf(candidate) !== weekday) return { type: "exact", dates: [candidate], label: weekdayMatch[1] };
      return { type: "exact", dates: [candidate], label: weekdayMatch[1] + " " + dayMatch[1] };
    }
    const current = weekdayOf(isoToday()); let offset = (weekday - current + 7) % 7;
    if (offset === 0) offset = 7;
    return { type: "weekday", weekday, dates: [isoDateAt(offset)], label: weekdayMatch[1] };
  }
  if (/\b(la\s+)?(proxima|otra|siguiente)\s+semana\b/.test(normalized)) { const today = isoToday(); const day = weekdayOf(today); let offset = (8 - day) % 7; if (!offset) offset = 7; const monday = addDays(today, offset); return { type: "week", dates: Array.from({ length: 6 }, (_, index) => addDays(monday, index)), label: "la próxima semana" }; }
  return null;
}
function timeFromText(text) {
  const value = String(text || "");
  const normalized = normalize(value);
  const match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i) || normalized.match(/\b(?:a\s+la?s?|hora\s*(?:de|:)?\s*)(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la\s+)?(manana|tarde|noche)?\b/i) || normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s+de\s+la\s+(manana|tarde|noche)\b/i) || normalized.match(/\ba[ ]+la[ ]+(\d{1,2})(?::(\d{2}))?/i) || normalized.match(/\ba[ ]+las[ ]+(\d{1,2})(?::(\d{2}))?/i) || normalized.match(/\b(?:a\s+la?s?|hora\s*(?:de|:)?\s*)(\d{1,2})(?::(\d{2}))?/i) || (/^\s*\d{1,2}(?::\d{2})?\s*$/.test(normalized) ? normalized.match(/\b(\d{1,2})(?::(\d{2}))?\b/) : null);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2] || 0); const meridiem = String(match[3] || "").toLowerCase();
  if (hour > 23 || minute > 59 || (!meridiem && hour === 0)) return null;
  if ((meridiem.includes("p") || meridiem === "tarde" || meridiem === "noche") && hour < 12) hour += 12;
  if ((meridiem.includes("a") || meridiem === "manana") && hour === 12) hour = 0;
  if (!meridiem && /\b(mediodia|medio dia)\b/.test(normalized)) hour = 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function sameTimeRequested(text) { return /\b(a\s+la\s+)?misma\s+hora\b/i.test(normalize(text)); }
function timeToMinutes(value) { const [hour, minute] = String(value || "00:00").slice(0, 5).split(":").map(Number); return hour * 60 + minute; }
function formatDate(date) { return new Intl.DateTimeFormat("es-SV", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)); }

module.exports = { TIMEZONE, resolveDatePreference, timeFromText, sameTimeRequested, timeToMinutes, formatDate };
