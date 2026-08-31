// Defensive parsing for values coming straight out of spreadsheet cells —
// empty strings and stray "%" signs are normal there and must not crash the
// page. Cells are fetched with UNFORMATTED_VALUE (see google-sheets.ts), so
// numbers arrive as plain "90" / "90.5", never locale-formatted.
export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/%/g, "").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function requireText(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

// A duration column formatted as a spreadsheet TIME (e.g. "DURASI GGN
// (MENIT)" shows "17:17:56") comes back in one of two shapes depending on
// provider: the apps-script gateway formats it as "yyyy-MM-dd HH:mm:ss"
// (see spreadsheet-service.gs's formatCellValue) — extract the HH:mm:ss
// part directly, sidestepping any date/timezone confusion since only the
// time-of-day component is meaningful for a duration cell. The google-api
// provider's UNFORMATTED_VALUE instead returns the raw day-fraction (e.g.
// 0.72 = 17.3 hours) — detected as a small decimal and scaled accordingly.
export function parseDurationMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const timeMatch = /(\d{1,2}):(\d{2}):(\d{2})/.exec(raw);
  if (timeMatch) {
    const [, hours, minutes, seconds] = timeMatch;
    return Math.round(Number(hours) * 60 + Number(minutes) + Number(seconds) / 60);
  }
  const value = parseNumber(raw);
  if (value !== null && value > 0 && value < 10) {
    return Math.round(value * 24 * 60); // bare day-fraction, not yet in minutes
  }
  return value;
}
