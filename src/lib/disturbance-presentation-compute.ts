// Pure period-math for the Gangguan "Mode Presentasi" view — deliberately
// NOT "server-only" so the client component owning the month/year filter
// state can call it directly, same "load once in the service, derive many
// things here" split already used by src/lib/four-dx-compute.ts and
// src/lib/ce-compute.ts. src/services/disturbances.ts does the one-time
// sheet parse and hands over a DisturbanceCategoryResult per category;
// everything here just re-slices that already-computed data by a chosen
// (year, month) — no new raw-row access needed.
import type { DisturbanceBayEventRecord, DisturbanceMonthlyYearPoint } from "@/types";

// Same 12-month Indonesian label order src/services/disturbances.ts's own
// buildMonthlyByYear() produces each point's `.month` in — duplicated here
// rather than imported since that file is server-only (same precedent as
// disturbance-yoy-monthly-chart.tsx's own copy of this list).
export const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export interface CalendarSummary {
  daysInMonth: number;
  daysWithDisturbance: number;
  daysWithoutDisturbance: number;
  percentWithDisturbance: number | null;
  percentWithoutDisturbance: number | null;
}

function monthValue(data: DisturbanceMonthlyYearPoint[], monthLabel: string, year: string): number {
  const point = data.find((p) => p.month === monthLabel);
  return Number(point?.[year] ?? 0);
}

export interface MonthlyBreakdownEntry {
  label: string;
  count: number;
}

/** Reads a single (month, year) cell out of an already-computed month x
 *  year matrix for every entry in a series list (one per ULTG, per bay, or
 *  per cause — see DisturbanceUltgMonthlyYear/DisturbanceBayMonthlyYear/
 *  DisturbanceCauseMonthlyYear) — the same trick used everywhere else in
 *  this app to avoid needing a dedicated month-scoped aggregate for every
 *  dimension. Zero-count entries are dropped and the rest sorted desc, so
 *  this doubles as both "kontribusi ULTG/ruas/penyebab bulan ini" data and
 *  its own display order. */
export function buildMonthlyBreakdown<T extends { data: DisturbanceMonthlyYearPoint[] }>(
  series: T[],
  labelOf: (entry: T) => string,
  monthLabel: string,
  year: string,
): MonthlyBreakdownEntry[] {
  return series
    .map((entry) => ({ label: labelOf(entry), count: monthValue(entry.data, monthLabel, year) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface CumulativePoint {
  month: string;
  /** null past the truncation point for a year still in progress — a gap
   *  the chart should stop drawing at, never a fabricated flat 0-growth
   *  continuation through months that haven't happened yet in the data. */
  [series: string]: string | number | null;
}

/** Running-total version of one or more month x year matrices, all for the
 *  SAME selected year — same running-sum idea as
 *  disturbance-yoy-monthly-chart.tsx's own toCumulative(), just scoped to
 *  one year (the presentation view shows one category's one selected year
 *  at a time, never a multi-year comparison) and reshaped so several
 *  series (Trip/AR Sukses/Tidak Trip, or the top few causes) can share one
 *  Recharts-ready array keyed by their own label. */
export function buildCumulativeForYear(
  seriesList: { label: string; data: DisturbanceMonthlyYearPoint[] }[],
  year: string,
): CumulativePoint[] {
  const running: Record<string, number> = Object.fromEntries(seriesList.map((s) => [s.label, 0]));
  return MONTH_ID.map((month) => {
    const point: CumulativePoint = { month: month.slice(0, 3) };
    for (const s of seriesList) {
      running[s.label] += monthValue(s.data, month, year);
      point[s.label] = running[s.label];
    }
    return point;
  });
}

/** Running-total version of ONE series, split into one column per YEAR
 *  instead of one column per named series — the year-over-year comparison
 *  counterpart to buildCumulativeForYear above (which compares several
 *  named series within a single year). Same running-sum idea as
 *  disturbance-yoy-monthly-chart.tsx's own toCumulative(). Only pass years
 *  actually present in the category's own `years` list — a year with no key
 *  on any point is indistinguishable from "confirmed zero" here, so drawing
 *  a line for a year that was never tracked would misrepresent "no data" as
 *  "zero disturbances".
 *
 *  `truncate`, when given, stops ONE year's own line right after the
 *  selected month instead of continuing (flat, since there's nothing left
 *  to add) all the way to December — per the user's explicit request: only
 *  the currently-selected (year, month) pair is "still in progress" and
 *  should read that way on the chart, while every other compared year is
 *  shown in full since it's already a complete year in the source data. */
export function buildCumulativeByYear(
  data: DisturbanceMonthlyYearPoint[],
  years: string[],
  truncate?: { year: string; monthIndex0: number },
): CumulativePoint[] {
  const running: Record<string, number> = Object.fromEntries(years.map((y) => [y, 0]));
  return MONTH_ID.map((month, monthIndex0) => {
    const point: CumulativePoint = { month: month.slice(0, 3) };
    for (const y of years) {
      if (truncate && y === truncate.year && monthIndex0 > truncate.monthIndex0) {
        point[y] = null;
        continue;
      }
      running[y] += monthValue(data, month, y);
      point[y] = running[y];
    }
    return point;
  });
}

/** The selected year plus up to 2 preceding years, filtered to only those
 *  actually present in `availableYears` — e.g. selecting 2026 with
 *  2024-2026 all available yields ["2024","2025","2026"], oldest first so
 *  the legend/lines read left-to-right chronologically. */
export function comparisonYears(selectedYear: string, availableYears: string[]): string[] {
  const selected = Number(selectedYear);
  const candidates = [selected - 2, selected - 1, selected].map(String);
  return candidates.filter((y) => availableYears.includes(y));
}

export interface CauseShareSlice {
  cause: string;
  count: number;
}

export interface CauseShareYear {
  year: string;
  total: number;
  slices: CauseShareSlice[];
}

/** One pie chart's worth of data per year — each YEAR's own full-year cause
 *  totals (summed across all 12 months, not a running cumulative — a pie
 *  represents a share of a whole, so it uses the year's real total rather
 *  than a mid-year running count). Only `topCauses` get their own slice;
 *  everything else is folded into "Lainnya" so the slices still sum to the
 *  year's true total instead of silently underrepresenting it. A year with
 *  zero events yields an empty slice list (rendered as "no data" by the
 *  caller), never a fabricated 100%-Lainnya slice. */
export function buildCauseShareByYear(
  causeSeries: { cause: string; data: DisturbanceMonthlyYearPoint[] }[],
  topCauses: string[],
  years: string[],
): CauseShareYear[] {
  return years.map((year) => {
    let otherTotal = 0;
    const slices: CauseShareSlice[] = [];
    for (const { cause, data } of causeSeries) {
      const total = data.reduce((sum, p) => sum + Number(p[year] ?? 0), 0);
      if (total <= 0) continue;
      if (topCauses.includes(cause)) {
        slices.push({ cause, count: total });
      } else {
        otherTotal += total;
      }
    }
    if (otherTotal > 0) slices.push({ cause: "Lainnya", count: otherTotal });
    slices.sort((a, b) => b.count - a.count);
    return { year, total: slices.reduce((sum, s) => sum + s.count, 0), slices };
  });
}

// --- Cross-category ("gabungan") helpers ------------------------------
//
// Every function above works on ONE category's own data. The overview,
// calendar, ULTG and ruas slides all combine Transmisi + Trafo HV + Trafo
// LV into one picture instead — confirmed necessary live: a single day can
// genuinely have disturbances split across different categories (e.g. 1
// Sep 2026 Transmisi, 2 Sep Trafo LV, 19 Sep Trafo HV all in the same
// month), so a per-category-only calendar silently hides 2 of every 3
// events unless the viewer manually flips tabs.

export interface CombinedCalendarDayCategory {
  label: string;
  count: number;
  /** Per-KODE GGN split for this category on this day (Trip/AR Sukses/
   *  Tidak Trip) — the calendar only actually USES this for Transmisi
   *  (to color Trip vs Reclose separately), but it's computed uniformly
   *  for every category rather than as a Transmisi-only special case. */
  byKind: { kind: string; count: number }[];
}

export interface CombinedCalendarDay {
  date: string;
  day: number;
  total: number;
  byCategory: CombinedCalendarDayCategory[];
}

/** Same per-day walk as before, but merges every category's dailyCounts
 *  for that same date instead of reading just one, and carries each
 *  category's own Trip/AR Sukses/Tidak Trip split for that day too. */
export function buildCombinedCalendarDays(
  categories: { label: string; dailyCounts: Record<string, number>; dailyByKind: Record<string, Record<string, number>> }[],
  year: number,
  monthIndex0: number,
): CombinedCalendarDay[] {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const days: CombinedCalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(monthIndex0 + 1)}-${pad(day)}`;
    const byCategory: CombinedCalendarDayCategory[] = categories
      .map((c) => ({
        label: c.label,
        count: c.dailyCounts[date] ?? 0,
        byKind: Object.entries(c.dailyByKind[date] ?? {}).map(([kind, count]) => ({ kind, count })),
      }))
      .filter((c) => c.count > 0);
    days.push({ date, day, total: byCategory.reduce((s, c) => s + c.count, 0), byCategory });
  }
  return days;
}

export function summarizeCombinedCalendar(days: CombinedCalendarDay[]): CalendarSummary {
  const daysInMonth = days.length;
  const daysWithDisturbance = days.filter((d) => d.total > 0).length;
  const daysWithoutDisturbance = daysInMonth - daysWithDisturbance;
  return {
    daysInMonth,
    daysWithDisturbance,
    daysWithoutDisturbance,
    percentWithDisturbance: daysInMonth > 0 ? daysWithDisturbance / daysInMonth : null,
    percentWithoutDisturbance: daysInMonth > 0 ? daysWithoutDisturbance / daysInMonth : null,
  };
}

export interface CombinedUltgEntry {
  ultg: string;
  total: number;
  [categoryLabel: string]: string | number;
}

/** One row per ULTG (union across all 3 categories), each column one
 *  category's own count for the selected month — feeds a stacked bar so a
 *  single chart shows both "which ULTG" and "which category" at once. */
export function buildCombinedUltgBreakdown(
  categories: { label: string; series: { ultg: string; data: DisturbanceMonthlyYearPoint[] }[] }[],
  monthLabel: string,
  year: string,
): CombinedUltgEntry[] {
  const ultgs = new Set<string>();
  for (const cat of categories) for (const s of cat.series) ultgs.add(s.ultg);

  return [...ultgs]
    .map((ultg) => {
      const row: CombinedUltgEntry = { ultg, total: 0 };
      for (const cat of categories) {
        const entry = cat.series.find((s) => s.ultg === ultg);
        const count = entry ? monthValue(entry.data, monthLabel, year) : 0;
        row[cat.label] = count;
        row.total += count;
      }
      return row;
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export interface BayEventDetail {
  /** "DD Mon" — the trailing year is dropped since every detail here is
   *  already scoped to one selected year via the month/year filter. */
  date: string;
  cause: string;
  kind: string;
}

export interface CombinedBayEntry {
  bay: string;
  category: string;
  ultg: string;
  count: number;
  /** One entry per real event this bay had in the selected month — powers
   *  the "kontribusi ruas" table's Tanggal/Penyebab/Keterangan columns,
   *  each read off the SAME event so they stay correctly paired (not 3
   *  separately-sorted parallel arrays that could drift out of order).
   *  Empty when no per-event record matched (shouldn't happen for a bay
   *  with count > 0, but never assumed). */
  events: BayEventDetail[];
}

/** One (bay, year, month) -> event-detail-list lookup, filtered from a
 *  category's full bayEvents list down to just the selected period — built
 *  once per category rather than re-filtering on every bay lookup. */
export function buildBayEventDetailsForMonth(
  events: DisturbanceBayEventRecord[],
  monthLabel: string,
  year: string,
): Map<string, BayEventDetail[]> {
  const map = new Map<string, BayEventDetail[]>();
  for (const e of events) {
    if (e.month !== monthLabel || e.year !== year) continue;
    const shortDate = e.date.replace(new RegExp(`\\s+${year}$`), "");
    const list = map.get(e.bay) ?? [];
    list.push({ date: shortDate, cause: e.cause, kind: e.kind });
    map.set(e.bay, list);
  }
  return map;
}

/** One row per (bay, category) pair that had at least one event this
 *  month — a bay only ever belongs to one category in practice (KODE BAY
 *  determines both), so this is a flat union rather than a per-bay matrix,
 *  tagged with its category for the "kontribusi ruas" slide's own badge.
 *  `ultgOf` looks up which ULTG a given bay belongs to (from that
 *  category's own bayBreakdown, which already carries `ultg` per bay) so
 *  the merged ULTG+ruas slide can show both in one table. `eventsOf` looks
 *  up that same bay's actual event details this month (see
 *  buildBayEventDetailsForMonth) for the same table's date/cause/kind columns. */
export function buildCombinedBayBreakdown(
  categories: {
    label: string;
    series: { bay: string; data: DisturbanceMonthlyYearPoint[] }[];
    ultgOf: (bay: string) => string;
    eventsOf: (bay: string) => BayEventDetail[];
  }[],
  monthLabel: string,
  year: string,
): CombinedBayEntry[] {
  const rows: CombinedBayEntry[] = [];
  for (const cat of categories) {
    for (const s of cat.series) {
      const count = monthValue(s.data, monthLabel, year);
      if (count > 0) {
        rows.push({ bay: s.bay, category: cat.label, ultg: cat.ultgOf(s.bay), count, events: cat.eventsOf(s.bay) });
      }
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}

/** Per-ULTG breakdown by CAUSE for one selected month, combined across
 *  every category's own bayEvents — built directly from real per-event
 *  records (not a monthly-by-year matrix) since this is only ever needed
 *  for the currently selected period. Causes outside `topCauses` are
 *  folded into "Lainnya" so the chart stays readable with a fixed column
 *  set instead of one column per distinct cause code. */
export function buildCombinedUltgByCause(
  categoryEvents: DisturbanceBayEventRecord[][],
  monthLabel: string,
  year: string,
  topCauses: string[],
): CombinedUltgEntry[] {
  const rows = new Map<string, CombinedUltgEntry>();
  for (const events of categoryEvents) {
    for (const e of events) {
      if (e.month !== monthLabel || e.year !== year || !e.ultg || e.ultg === "-") continue;
      const column = topCauses.includes(e.cause) ? e.cause : "Lainnya";
      const row = rows.get(e.ultg) ?? { ultg: e.ultg, total: 0 };
      row[column] = Number(row[column] ?? 0) + 1;
      row.total += 1;
      rows.set(e.ultg, row);
    }
  }
  return [...rows.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

/** Per-ULTG breakdown by JENIS GANGGUAN for one selected month — Transmisi
 *  splits into its own Trip/Reclose columns (the auto-reclose distinction
 *  is the whole point there), while Trafo HV+LV combine into a single
 *  "Trafo Trip" column (no reclose scheme exists for Trafo, and HV/LV were
 *  already being combined for the same reason on the Kumulatif slide) —
 *  per the user's explicit request. "Tidak Trip" is deliberately excluded
 *  here (not asked for), unlike the calendar slide's own kind split. */
export function buildCombinedUltgByKind(
  transmisiEvents: DisturbanceBayEventRecord[],
  trafoHvEvents: DisturbanceBayEventRecord[],
  trafoLvEvents: DisturbanceBayEventRecord[],
  monthLabel: string,
  year: string,
): CombinedUltgEntry[] {
  const rows = new Map<string, CombinedUltgEntry>();
  function bump(ultg: string, column: string) {
    const row = rows.get(ultg) ?? { ultg, total: 0 };
    row[column] = Number(row[column] ?? 0) + 1;
    row.total += 1;
    rows.set(ultg, row);
  }
  for (const e of transmisiEvents) {
    if (e.month !== monthLabel || e.year !== year || !e.ultg || e.ultg === "-") continue;
    if (e.kind === "Trip") bump(e.ultg, "Transmisi Trip");
    else if (e.kind === "AR Sukses") bump(e.ultg, "Transmisi Reclose");
  }
  for (const e of [...trafoHvEvents, ...trafoLvEvents]) {
    if (e.month !== monthLabel || e.year !== year || !e.ultg || e.ultg === "-") continue;
    if (e.kind === "Trip") bump(e.ultg, "Trafo Trip");
  }
  return [...rows.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

/** Point-wise sum of two categories' own "all-causes" month x year matrices
 *  (same shape as mergeCauseSeries below, just for the single un-keyed
 *  `monthlyByYear` series rather than a per-cause list) — used to build a
 *  combined Trafo HV+LV total for the year-over-year comparison chart. */
export function sumMonthlyByYear(
  a: DisturbanceMonthlyYearPoint[],
  b: DisturbanceMonthlyYearPoint[],
): DisturbanceMonthlyYearPoint[] {
  return MONTH_ID.map((month) => {
    const pointA = a.find((p) => p.month === month);
    const pointB = b.find((p) => p.month === month);
    const point: DisturbanceMonthlyYearPoint = { month };
    const years = new Set([...Object.keys(pointA ?? {}), ...Object.keys(pointB ?? {})]);
    years.delete("month");
    for (const year of years) {
      point[year] = Number(pointA?.[year] ?? 0) + Number(pointB?.[year] ?? 0);
    }
    return point;
  });
}

/** Merges several categories' own per-cause month x year matrices into one
 *  by summing matching cause labels (PENYEBAB uses the same fixed label
 *  set in every category, so labels line up directly) — used for a
 *  combined "kumulatif penyebab" trend across the whole Gangguan module
 *  rather than one category at a time. */
export function mergeCauseSeries(
  categorySeries: { cause: string; data: DisturbanceMonthlyYearPoint[] }[][],
): { cause: string; data: DisturbanceMonthlyYearPoint[] }[] {
  const byCause = new Map<string, DisturbanceMonthlyYearPoint[]>();
  for (const series of categorySeries) {
    for (const { cause, data } of series) {
      const existing = byCause.get(cause);
      if (!existing) {
        byCause.set(cause, data.map((p) => ({ ...p })));
        continue;
      }
      for (let i = 0; i < data.length; i++) {
        const point = data[i];
        for (const key of Object.keys(point)) {
          if (key === "month") continue;
          existing[i][key] = Number(existing[i][key] ?? 0) + Number(point[key] ?? 0);
        }
      }
    }
  }
  return [...byCause.entries()].map(([cause, data]) => ({ cause, data }));
}
