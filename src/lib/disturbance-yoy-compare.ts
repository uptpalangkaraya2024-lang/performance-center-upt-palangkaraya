// Year-on-year comparison table (per user's own reference screenshot) —
// current year vs. the year right before it, one row per category
// (cause or kind), with a % change. Pure, reused for both the "per
// Penyebab" and "per Kinerja" tables on the Gangguan page.
//
// Both years are truncated to the SAME cutoff month (today's own month)
// before counting — per user correction: comparing a full previous year
// against a still-in-progress current year is apples-to-oranges, so this
// is a cumulative-to-date comparison (Jan-Okt 2025 vs Jan-Okt 2026, not
// full-year 2025 vs partial 2026), same "s.d. bulan ini" framing RENUS/CE
// already use elsewhere in this app.
export interface YoyCompareRow {
  category: string;
  current: number;
  previous: number;
  /** ((current-previous)/previous)*100, except when previous is 0: shown
   *  as 0 when current is also 0 (no change, nothing to report) or 100
   *  when current > 0 (a brand-new category this year — true % change is
   *  undefined/infinite, so this is a capped "it's new" signal, not a
   *  literal percentage). */
  pctChange: number;
}

/** `items` is every individual event already reduced to just the fields
 *  this needs (category label, year, and ISO date for the cutoff check) —
 *  callers build that list from whatever source they have (cause, kind,
 *  ...). Only events in `currentYear`/`previousYear`, AND at or before
 *  `cutoffMonth` (1-12) in their own year, count. Sorted by current-year
 *  count descending, same convention as causePareto. */
export function buildYoyCompareRows(
  items: { category: string; year: string; dateISO: string }[],
  currentYear: string,
  previousYear: string,
  cutoffMonth: number,
): YoyCompareRow[] {
  const counts = new Map<string, { current: number; previous: number }>();
  for (const item of items) {
    if (item.year !== currentYear && item.year !== previousYear) continue;
    const month = Number(item.dateISO.slice(5, 7));
    if (!Number.isFinite(month) || month > cutoffMonth) continue;
    const entry = counts.get(item.category) ?? { current: 0, previous: 0 };
    if (item.year === currentYear) entry.current += 1;
    else entry.previous += 1;
    counts.set(item.category, entry);
  }

  const rows: YoyCompareRow[] = [...counts.entries()].map(([category, { current, previous }]) => ({
    category,
    current,
    previous,
    pctChange: previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / previous) * 100,
  }));

  return rows.sort((a, b) => b.current - a.current);
}
