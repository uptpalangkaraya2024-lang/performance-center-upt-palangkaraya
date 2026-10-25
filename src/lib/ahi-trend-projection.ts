// AHI trend projection ("Proyeksi Tren AHI") — extends the degradation
// reminder (ahi-degradation.ts, which only looks at the last 2-3 tests) to
// a full linear-regression trend over a unit's ENTIRE recorded history,
// projecting roughly when it will cross into CRITICAL (skorAhi = 5) if the
// trend continues unchanged. Explicitly a statistical projection from past
// data, not a guarantee — every caller surfaces it as such (see the "±"
// framing wherever this is displayed).
//
// skorAhi is PLN's own 1-5 scale where 1 = BEST and 5 = CRITICAL (see
// ahi-bay-report-shared.ts's own LEGEND).
import type { BayLineReport } from "@/types";

export interface AhiTrendProjection {
  gi: string;
  bay: string;
  ultg: string;
  role: string;
  techident: string | null;
  currentScore: number;
  /** Positive = worsening (score rising over time). */
  slopePerDay: number;
  /** "yyyy-MM-dd" — only set when the projection lands within
   *  MAX_PROJECTION_DAYS; a near-flat worsening slope would otherwise
   *  project a date decades out, which reads as false precision rather
   *  than a useful planning signal. */
  projectedCriticalDate: string;
  daysUntilCritical: number;
  /** How many dated, scored tests the projection is built from — confirmed
   *  live that most units currently have only 2 (AHI's own Riwayat
   *  Pengujian history tracking is still young), so this is surfaced
   *  rather than hidden: a 2-point projection is a straight line through
   *  exactly those 2 tests, not a fitted trend, and callers should say so. */
  pointCount: number;
}

// Projections beyond ~3 years out are treated as too speculative to act
// on — shown nowhere, not even with a caveat, since a 3+ year projection
// from a handful of test points is noise, not a planning signal.
const MAX_PROJECTION_DAYS = 3 * 365;
// 2 is the same floor ahi-degradation.ts already treats as meaningful (its
// own 2-test fallback window) — confirmed live most units only HAVE 2
// dated tests so far, so requiring 3 would silently produce zero
// projections today. pointCount on the result lets a caller still
// distinguish "a real fitted trend" (3+) from "a straight line through the
// only 2 points we have" (exactly 2).
const MIN_POINTS = 2;

function daysSinceEpoch(iso: string): number {
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86400000);
}

/** Ordinary least-squares slope of y on x — null when there isn't enough
 *  spread in x to fit a line (e.g. every test happened to log the same
 *  date, which shouldn't occur in practice but is guarded against rather
 *  than dividing by zero). */
function linearSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) ** 2;
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Scans every equipment unit's full test history for a worsening linear
 *  trend and, when one exists, projects the date it crosses into CRITICAL.
 *  Units already at CRITICAL, or with a flat/improving trend, are
 *  excluded — there's nothing to project. Sorted soonest-first. */
export function buildAhiTrendProjections(reports: BayLineReport[]): AhiTrendProjection[] {
  const results: AhiTrendProjection[] = [];

  for (const report of reports) {
    for (const unit of report.units) {
      const scored = unit.history.filter((h) => h.skorAhi !== null);
      if (scored.length < MIN_POINTS) continue;

      const points = scored.map((h) => ({ x: daysSinceEpoch(h.tanggal), y: h.skorAhi as number }));
      const slope = linearSlope(points);
      if (slope === null || slope <= 0) continue;

      const latest = points[points.length - 1];
      if (latest.y >= 5) continue;

      const daysUntilCritical = Math.round((5 - latest.y) / slope);
      if (daysUntilCritical < 0 || daysUntilCritical > MAX_PROJECTION_DAYS) continue;

      const projectedMs = (latest.x + daysUntilCritical) * 86400000;
      results.push({
        gi: report.gi,
        bay: report.bay,
        ultg: report.ultg,
        role: unit.role,
        techident: unit.techident,
        currentScore: latest.y,
        slopePerDay: slope,
        projectedCriticalDate: new Date(projectedMs).toISOString().slice(0, 10),
        daysUntilCritical,
        pointCount: points.length,
      });
    }
  }

  return results.sort((a, b) => a.daysUntilCritical - b.daysUntilCritical);
}
