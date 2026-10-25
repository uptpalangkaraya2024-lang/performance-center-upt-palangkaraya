// Monthly workload heatmap (feature #7) — a calendar-style view over RENUS
// rows showing, per day, how many jobs are scheduled (RENCANA date) and how
// many of those are high-risk, so an overloaded week is visible before it
// piles up rather than being discovered only once it's underway. Pure,
// client-safe — the page/client component already has the full RenusRow[]
// in memory, so this is just a different grouping of data that's already
// loaded, same "load once, derive many" shape as renus-compute.ts.
import { isRenusCancelled, isRenusHighRisk } from "@/lib/renus-helpers";
import type { RenusRow } from "@/types";

export const WORKLOAD_MONTH_LABEL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Indonesian week convention — Senin (Monday) first.
export const WORKLOAD_WEEKDAY_LABEL = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export interface WorkloadDay {
  dateISO: string; // yyyy-MM-dd
  day: number; // 1-31
  count: number;
  highRiskCount: number;
  rows: RenusRow[];
}

export interface MonthWorkload {
  year: number;
  monthIndex: number; // 0-11
  monthLabel: string;
  /** Senin-start weeks; a cell is null where the month doesn't have that
   *  day (leading/trailing padding so every week row has exactly 7 cells). */
  weeks: (WorkloadDay | null)[][];
  totalCount: number;
  highRiskCount: number;
  busiestDay: WorkloadDay | null;
  /** Index into `weeks` for any week whose total job count crosses
   *  this month's own typical weekly load — a glance-able "this week needs
   *  rebalancing" signal, not a hard science. */
  overloadWeekIndexes: number[];
}

// A fixed job-count threshold can't work across 3 ULTGs with very
// different volumes (what's "overload" for one is a quiet week for
// another) — instead a week is flagged relative to THIS month's own
// average weekly load, so the signal stays meaningful whether the
// underlying dataset is one ULTG or all three combined.
const OVERLOAD_RATIO = 1.5; // must exceed 1.5x this month's average week
const OVERLOAD_FLOOR = 6; // ...and clear this floor, so a quiet month with
// only a couple of jobs total never gets a week flagged over noise.

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function isoDate(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** 0 = Senin ... 6 = Minggu, converted from JS's own 0=Sunday convention. */
function mondayWeekdayIndex(year: number, monthIndex: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
  return (jsDay + 6) % 7;
}

/** Builds one month's calendar grid over whatever row set is passed in —
 *  callers pass the already-loaded full dataset (not pre-filtered by
 *  month), since this does its own month-prefix filter. Cancelled rows are
 *  excluded, same as every other RENUS summary in this app. */
export function buildMonthlyWorkloadHeatmap(rows: RenusRow[], year: number, monthIndex: number): MonthWorkload {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  const byDay = new Map<string, RenusRow[]>();
  for (const r of rows) {
    if (isRenusCancelled(r)) continue;
    if (!r.rencanaDate.startsWith(prefix)) continue;
    const list = byDay.get(r.rencanaDate) ?? [];
    list.push(r);
    byDay.set(r.rencanaDate, list);
  }

  const totalDays = daysInMonth(year, monthIndex);
  const days: WorkloadDay[] = [];
  for (let day = 1; day <= totalDays; day++) {
    const dateISO = isoDate(year, monthIndex, day);
    const dayRows = byDay.get(dateISO) ?? [];
    days.push({
      dateISO,
      day,
      count: dayRows.length,
      highRiskCount: dayRows.filter(isRenusHighRisk).length,
      rows: dayRows,
    });
  }

  const firstOffset = mondayWeekdayIndex(year, monthIndex, 1);
  const cells: (WorkloadDay | null)[] = [...(Array(firstOffset).fill(null) as null[]), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (WorkloadDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const totalCount = days.reduce((s, d) => s + d.count, 0);
  const highRiskCount = days.reduce((s, d) => s + d.highRiskCount, 0);
  const busiestDay = days.reduce<WorkloadDay | null>(
    (best, d) => (d.count > 0 && (!best || d.count > best.count) ? d : best),
    null,
  );

  const weekCounts = weeks.map((week) => week.reduce((s, d) => s + (d?.count ?? 0), 0));
  const weeksWithWork = weekCounts.filter((c) => c > 0);
  const avgPerWeek = weeksWithWork.length > 0 ? weeksWithWork.reduce((a, b) => a + b, 0) / weeksWithWork.length : 0;
  const overloadThreshold = Math.max(OVERLOAD_FLOOR, avgPerWeek * OVERLOAD_RATIO);
  const overloadWeekIndexes = weekCounts
    .map((count, idx) => (count > overloadThreshold ? idx : -1))
    .filter((idx) => idx !== -1);

  return {
    year,
    monthIndex,
    monthLabel: WORKLOAD_MONTH_LABEL[monthIndex],
    weeks,
    totalCount,
    highRiskCount,
    busiestDay,
    overloadWeekIndexes,
  };
}
