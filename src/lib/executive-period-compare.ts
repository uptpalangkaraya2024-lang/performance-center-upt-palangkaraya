// Period-over-period comparisons for Laporan Eksekutif (FASE 3) — "naik /
// turun / tetap dibanding periode sebelumnya" for KPI UPT, RENUS overdue,
// and Gangguan. Each one is a genuine reconstruction from already-available
// data, not a stored history (this app has no database) — see each
// function's own comment for exactly what it can and can't honestly claim.
//
// CE Critical findings are NOT compared here. A GI/finding first-seen date
// would be needed to reconstruct "how many were open last period," and
// CE's own "Tanggal_Temuan" column — the one field that could answer that
// — is confirmed live to be blank on all 634 rows in the current sheet
// (0% fill rate). Rather than guess a substitute date, this comparison is
// left out entirely until that column is actually populated.
import type { RenusRow, UptKpi, DisturbanceMonthlyYearPoint } from "@/types";
import { isRenusOverdue } from "@/lib/renus-helpers";

export type Trend = "naik" | "turun" | "tetap";

export interface KpiTrendComparison {
  /** Count of KPIs whose own LAST TWO reported monthly cumulative
   *  Realisasi points moved in the favorable direction for that KPI's own
   *  POLARITAS. This is NOT the same as "more KPIs achieved target" —
   *  the official Pencapaian/Target s/d figures are cumulative-to-date
   *  only, with no monthly target breakdown this app can read, so there
   *  is no honest way to recompute "last month's official achievement %"
   *  without inventing a formula PLN doesn't use. This instead tracks
   *  the raw realisasi trajectory, which IS fully traceable to already-
   *  shown monthlyTrend data. */
  improving: number;
  worsening: number;
  flat: number;
  /** Fewer than 2 reported months, or direction unknown (POLARITAS
   *  "Range"/blank) — excluded from the 3 buckets above rather than
   *  guessed. */
  notComparable: number;
}

export function buildKpiTrendComparison(kpis: UptKpi[]): KpiTrendComparison {
  let improving = 0;
  let worsening = 0;
  let flat = 0;
  let notComparable = 0;
  for (const k of kpis) {
    const points = (k.monthlyTrend ?? []).filter((p) => p.value !== null);
    if (points.length < 2 || k.direction === null) {
      notComparable += 1;
      continue;
    }
    const last = points[points.length - 1].value as number;
    const prev = points[points.length - 2].value as number;
    if (last === prev) {
      flat += 1;
      continue;
    }
    const better = k.direction === "LOWER_IS_BETTER" ? last < prev : last > prev;
    if (better) improving += 1;
    else worsening += 1;
  }
  return { improving, worsening, flat, notComparable };
}

function subtractMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 - months, d));
  return date.toISOString().slice(0, 10);
}

export interface RenusOverdueComparison {
  now: number;
  oneMonthAgo: number;
  trend: Trend;
}

/** RENUS overdue is a point-in-time status (not stored history), but it's
 *  fully DERIVABLE for any past date from data this app already has —
 *  rencanaDate/realisasiDate/status don't change after the fact, so
 *  running the same isRenusOverdue() predicate with "today" set to one
 *  month ago honestly answers "how many would have been overdue back
 *  then," using the exact same rule as the live count today. */
export function buildRenusOverdueComparison(rows: RenusRow[], todayISO: string): RenusOverdueComparison {
  const oneMonthAgoISO = subtractMonths(todayISO, 1);
  const now = rows.filter((r) => isRenusOverdue(r, todayISO)).length;
  const oneMonthAgo = rows.filter((r) => isRenusOverdue(r, oneMonthAgoISO)).length;
  return { now, oneMonthAgo, trend: now === oneMonthAgo ? "tetap" : now > oneMonthAgo ? "naik" : "turun" };
}

export interface GangguanMonthComparison {
  thisMonth: number;
  lastMonth: number;
  thisMonthLabel: string;
  lastMonthLabel: string;
  trend: Trend;
}

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** This calendar month (so far) vs the immediately preceding one, summed
 *  across however many DisturbanceMonthlyYearPoint[] arrays are passed in
 *  (e.g. Transmisi + Trafo HV + Trafo LV combined) — unlike the all-time
 *  "total" figure elsewhere in this report, monthlyByYear already breaks
 *  events down by calendar month and year, so this comparison needs no
 *  reconstruction, just a lookup. "Bulan ini" is necessarily a partial
 *  month if run before month-end — noted in the rendered sentence, not
 *  hidden. */
export function buildGangguanMonthComparison(
  monthlyByYearSets: DisturbanceMonthlyYearPoint[][],
  todayISO: string,
): GangguanMonthComparison {
  const [y, m] = todayISO.split("-").map(Number);
  const thisMonthIdx = m - 1;
  const thisYear = String(y);
  const lastMonthIdx = thisMonthIdx === 0 ? 11 : thisMonthIdx - 1;
  const lastMonthYear = thisMonthIdx === 0 ? String(y - 1) : String(y);

  function sumAt(monthIdx: number, year: string): number {
    let total = 0;
    for (const set of monthlyByYearSets) {
      const row = set[monthIdx];
      const v = row?.[year];
      if (typeof v === "number") total += v;
    }
    return total;
  }

  const thisMonth = sumAt(thisMonthIdx, thisYear);
  const lastMonth = sumAt(lastMonthIdx, lastMonthYear);

  return {
    thisMonth,
    lastMonth,
    thisMonthLabel: `${MONTH_ID[thisMonthIdx]} ${thisYear}`,
    lastMonthLabel: `${MONTH_ID[lastMonthIdx]} ${lastMonthYear}`,
    trend: thisMonth === lastMonth ? "tetap" : thisMonth > lastMonth ? "naik" : "turun",
  };
}
