// Pure, cross-module compute — "is preventive maintenance adequately
// scheduled ahead of the historically worst months," cross-referencing the
// Gangguan module's own 3-year monthly history (already shown on its YoY
// chart, not a new dataset) against RENUS and ABO's forward-looking
// schedules. Same "load once, derive many things" shape as every other
// *-compute.ts file — the homepage/page calling this fetches the 3 source
// snapshots itself and passes them in.
import { ABO_MONTH_FULL, weekLabelIndex } from "@/lib/abo-proteksi-compute";
import { isRenusCancelled } from "@/lib/renus-helpers";
import type { DisturbancesResult } from "@/services/disturbances";
import type { AboSnapshot, RenusRow } from "@/types";

export interface SeasonalRiskMonth {
  monthIndex: number;
  month: string;
  /** Summed across every category (Transmisi, Trafo HV, Trafo LV) and every
   *  year the Gangguan sheet has data for. */
  historicalTotal: number;
  /** How many distinct years contributed to historicalTotal — shown
   *  alongside it so "12 events" isn't misread the same whether it's from
   *  1 year or 3. */
  yearsCounted: number;
  avgPerYear: number;
}

/** Sums the Gangguan module's own monthlyByYear matrices (one per category:
 *  Transmisi, Trafo HV, Trafo LV) across every historically-available year,
 *  per calendar month — "which months are historically the worst," read
 *  straight from the same data already behind the Gangguan page's YoY
 *  chart, never a separately-maintained seasonality guess. */
export function buildSeasonalRisk(disturbances: DisturbancesResult): SeasonalRiskMonth[] {
  const categories = [disturbances.transmisi, disturbances.trafoHv, disturbances.trafoLv];
  const totals = new Array(12).fill(0) as number[];
  const years = new Set<string>();
  for (const cat of categories) {
    for (const point of cat.monthlyByYear) {
      const monthIndex = ABO_MONTH_FULL.indexOf(point.month);
      if (monthIndex === -1) continue;
      for (const [key, value] of Object.entries(point)) {
        if (key === "month") continue;
        years.add(key);
        totals[monthIndex] += typeof value === "number" ? value : 0;
      }
    }
  }
  const yearsCounted = years.size;
  return ABO_MONTH_FULL.map((month, idx) => ({
    monthIndex: idx,
    month,
    historicalTotal: totals[idx],
    yearsCounted,
    avgPerYear: yearsCounted > 0 ? totals[idx] / yearsCounted : 0,
  }));
}

export interface SeasonalReadinessEntry extends SeasonalRiskMonth {
  /** 1 = historically worst month of the year, 12 = calmest. */
  rank: number;
  /** 0 = the current month, 1 = next month, ... 11 = eleven months out —
   *  circular distance forward from today, never negative. */
  monthsAhead: number;
  /** Non-cancelled RENUS work orders whose own RENCANA month (any year —
   *  this is read as a recurring calendar month, not tied to one year) falls
   *  in this calendar month. */
  renusScheduled: number;
  /** ABO ruas/action items whose own target week falls in this calendar
   *  month, across every ABO program and both Proteksi and Hargi. */
  aboScheduled: number;
}

/** Cross-references buildSeasonalRisk's per-month historical totals against
 *  how much preventive work (RENUS + ABO) is actually scheduled in each of
 *  those same calendar months — the answer to "are we ready for the
 *  historically bad months coming up," not just "which months were bad
 *  before." RENUS/ABO counts are read by calendar month only (not tied to a
 *  specific year), since both are recurring annual programs the sheets
 *  re-plan every year — matching how buildSeasonalRisk itself already
 *  treats "Januari" as one bucket across every year of disturbance history. */
export function buildSeasonalReadiness(params: {
  disturbances: DisturbancesResult;
  renusRows: RenusRow[];
  aboSnapshots: AboSnapshot[];
  /** 0-11, Asia/Jakarta "today" — passed in rather than computed here so
   *  this stays a pure function of its inputs, same convention as every
   *  other *-compute.ts file's own `selectedWeekLabel`/`todayISO` param. */
  todayMonthIndex: number;
}): SeasonalReadinessEntry[] {
  const risk = buildSeasonalRisk(params.disturbances);
  const rankOf = new Map(
    [...risk].sort((a, b) => b.avgPerYear - a.avgPerYear).map((r, i) => [r.monthIndex, i + 1]),
  );

  const renusByMonth = new Array(12).fill(0) as number[];
  for (const r of params.renusRows) {
    if (isRenusCancelled(r)) continue;
    const idx = ABO_MONTH_FULL.indexOf(r.month);
    if (idx !== -1) renusByMonth[idx] += 1;
  }

  const aboByMonth = new Array(12).fill(0) as number[];
  for (const snapshot of params.aboSnapshots) {
    for (const program of snapshot.programs) {
      for (const item of program.ruasItems) {
        if (!item.targetWeekLabel) continue;
        const weekIdx = weekLabelIndex(item.targetWeekLabel);
        if (weekIdx !== -1) aboByMonth[Math.floor(weekIdx / 4)] += 1;
      }
    }
  }

  return risk.map((r) => ({
    ...r,
    rank: rankOf.get(r.monthIndex) ?? 0,
    monthsAhead: (((r.monthIndex - params.todayMonthIndex) % 12) + 12) % 12,
    renusScheduled: renusByMonth[r.monthIndex],
    aboScheduled: aboByMonth[r.monthIndex],
  }));
}

/** The riskiest months among the next `horizonMonths` (default 3, inclusive
 *  of the current month) sorted worst-first — the actionable slice: "is
 *  preventive work scheduled ahead of THESE specific upcoming months,"
 *  not a generic ranking of all 12. */
export function upcomingRiskyMonths(
  entries: SeasonalReadinessEntry[],
  horizonMonths = 3,
): SeasonalReadinessEntry[] {
  return entries.filter((e) => e.monthsAhead < horizonMonths).sort((a, b) => b.avgPerYear - a.avgPerYear);
}
