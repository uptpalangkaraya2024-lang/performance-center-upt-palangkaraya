// Automatic AHI degradation reminder (feature #4) — flags an equipment
// unit whose last 2-3 RECORDED tests have been getting worse, so a
// worsening trend surfaces on its own instead of waiting for someone to
// notice it while skimming the Riwayat history chart by hand.
//
// skorAhi is PLN's own 1-5 scale where 1 = BEST and 5 = CRITICAL (see
// ahi-bay-report-shared.ts's own LEGEND) — "worsening" therefore means the
// score going UP across consecutive tests, not down.
import type { BayLineReport, EquipmentHistoryPoint } from "@/types";

export interface AhiDegradationAlert {
  gi: string;
  bay: string;
  ultg: string;
  role: string;
  techident: string | null;
  merk: string | null;
  /** The worsening window itself, oldest-first (2 or 3 points). */
  trend: EquipmentHistoryPoint[];
}

/** Prefers a 3-test window; falls back to the last 2 when that's all the
 *  history has recorded so far (a unit with only 2 logged tests can still
 *  show a real worsening step worth flagging, not just silence until a 3rd
 *  test exists). Monotonic non-decreasing across the window AND at least
 *  one real increase — a flat run of identical scores is never flagged,
 *  only an actual deterioration. */
function findWorseningTrend(history: EquipmentHistoryPoint[]): EquipmentHistoryPoint[] | null {
  const scored = history.filter((h) => h.skorAhi !== null);
  for (const windowSize of [3, 2]) {
    if (scored.length < windowSize) continue;
    const window = scored.slice(-windowSize);
    let monotonic = true;
    let hasIncrease = false;
    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1].skorAhi as number;
      const curr = window[i].skorAhi as number;
      if (curr < prev) {
        monotonic = false;
        break;
      }
      if (curr > prev) hasIncrease = true;
    }
    if (monotonic && hasIncrease) return window;
  }
  return null;
}

/** Scans every equipment unit across every bay line report for a worsening
 *  trend in its own test history — a new consumer of data every AHI page
 *  load already fetches (getAllBayLineReportsWithHistory), not a new sheet
 *  read. */
export function findAhiDegradationAlerts(reports: BayLineReport[]): AhiDegradationAlert[] {
  const alerts: AhiDegradationAlert[] = [];
  for (const report of reports) {
    for (const unit of report.units) {
      const trend = findWorseningTrend(unit.history);
      if (trend) {
        alerts.push({
          gi: report.gi,
          bay: report.bay,
          ultg: report.ultg,
          role: unit.role,
          techident: unit.techident,
          merk: unit.merk,
          trend,
        });
      }
    }
  }
  return alerts;
}
