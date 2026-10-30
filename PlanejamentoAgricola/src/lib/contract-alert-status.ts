/** Mesma data de referência para a tela e os avisos de contratos. */
export function contractToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Mantém compatibilidade com as datas legadas do cadastro. */
export function contractScheduledDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const brazilian = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!brazilian) return null;
  const [, day, month, year] = brazilian;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function contractNeedsAlert(value: unknown, today = contractToday()): boolean {
  const date = contractScheduledDate(value);
  return date != null && date <= today;
}
