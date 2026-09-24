// Pure period-math for the Gangguan "Mode Presentasi" view — deliberately
// NOT "server-only" so the client component owning the month/year filter
// state can call it directly, same "load once in the service, derive many
// things here" split already used by src/lib/four-dx-compute.ts and
// src/lib/ce-compute.ts. src/services/disturbances.ts does the one-time
// sheet parse and hands over a DisturbanceCategoryResult per category;
// everything here just re-slices that already-computed data by a chosen
// (year, month) — no new raw-row access needed.
import type { DisturbanceMonthlyYearPoint } from "@/types";

// Same 12-month Indonesian label order src/services/disturbances.ts's own
// buildMonthlyByYear() produces each point's `.month` in — duplicated here
// rather than imported since that file is server-only (same precedent as
// disturbance-yoy-monthly-chart.tsx's own copy of this list).
export const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export interface CalendarDay {
  date: string; // yyyy-MM-dd
  day: number;
  count: number;
}

/** Every calendar day in the given month (0-indexed), each paired with its
 *  disturbance count from `dailyCounts` — 0 when the day has no entry
 *  (DisturbanceCategoryResult.dailyCounts only ever holds days that had at
 *  least one event). Built from a plain date-string template, not a Date
 *  object per day, so there's no timezone ambiguity between the key format
 *  here and the one the service wrote (both plain "yyyy-MM-dd"). */
export function buildCalendarDays(dailyCounts: Record<string, number>, year: number, monthIndex0: number): CalendarDay[] {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const days: CalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(monthIndex0 + 1)}-${pad(day)}`;
    days.push({ date, day, count: dailyCounts[date] ?? 0 });
  }
  return days;
}

export interface CalendarSummary {
  daysInMonth: number;
  daysWithDisturbance: number;
  daysWithoutDisturbance: number;
  percentWithoutDisturbance: number | null;
}

export function summarizeCalendar(days: CalendarDay[]): CalendarSummary {
  const daysInMonth = days.length;
  const daysWithDisturbance = days.filter((d) => d.count > 0).length;
  const daysWithoutDisturbance = daysInMonth - daysWithDisturbance;
  return {
    daysInMonth,
    daysWithDisturbance,
    daysWithoutDisturbance,
    percentWithoutDisturbance: daysInMonth > 0 ? daysWithoutDisturbance / daysInMonth : null,
  };
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
  [series: string]: string | number;
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

// --- Cross-category ("gabungan") helpers ------------------------------
//
// Every function above works on ONE category's own data. The overview,
// calendar, ULTG and ruas slides all combine Transmisi + Trafo HV + Trafo
// LV into one picture instead — confirmed necessary live: a single day can
// genuinely have disturbances split across different categories (e.g. 1
// Sep 2026 Transmisi, 2 Sep Trafo LV, 19 Sep Trafo HV all in the same
// month), so a per-category-only calendar silently hides 2 of every 3
// events unless the viewer manually flips tabs.

export interface CombinedCalendarDay {
  date: string;
  day: number;
  total: number;
  byCategory: { label: string; count: number }[];
}

/** Same per-day walk as buildCalendarDays, but merges every category's
 *  dailyCounts for that same date instead of reading just one. */
export function buildCombinedCalendarDays(
  dailyCountsByCategory: { label: string; dailyCounts: Record<string, number> }[],
  year: number,
  monthIndex0: number,
): CombinedCalendarDay[] {
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const days: CombinedCalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad(monthIndex0 + 1)}-${pad(day)}`;
    const byCategory = dailyCountsByCategory
      .map((c) => ({ label: c.label, count: c.dailyCounts[date] ?? 0 }))
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

export interface CombinedBayEntry {
  bay: string;
  category: string;
  count: number;
}

/** One row per (bay, category) pair that had at least one event this
 *  month — a bay only ever belongs to one category in practice (KODE BAY
 *  determines both), so this is a flat union rather than a per-bay matrix,
 *  tagged with its category for the "kontribusi ruas" slide's own badge. */
export function buildCombinedBayBreakdown(
  categories: { label: string; series: { bay: string; data: DisturbanceMonthlyYearPoint[] }[] }[],
  monthLabel: string,
  year: string,
): CombinedBayEntry[] {
  const rows: CombinedBayEntry[] = [];
  for (const cat of categories) {
    for (const s of cat.series) {
      const count = monthValue(s.data, monthLabel, year);
      if (count > 0) rows.push({ bay: s.bay, category: cat.label, count });
    }
  }
  return rows.sort((a, b) => b.count - a.count);
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
