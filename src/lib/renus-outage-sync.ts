// Cross-references RENUS's own "minggu padam" (the Friday–Thursday week a
// planned outage's RENCANA date falls in — see getFridayThursdayPeriod)
// against the AHI Bay Report system, via renus-ahi-bay-match.ts's own
// per-kind bay matching. Pure orchestration: both inputs are already-
// fetched data, nothing is read from a sheet here.
import { getFridayThursdayPeriod, getNextWeekPeriod } from "@/services/renus";
import { isRenusCancelled } from "@/lib/renus-helpers";
import { matchRenusBay, type BayMatchCandidate } from "@/lib/renus-ahi-bay-match";
import type { BayLineOption, BayReportKind, RenusRow, RenusWeekPeriod } from "@/types";

export interface RenusOutageSyncEntry {
  renusRow: RenusRow;
  /** The AHI report kind this row's own bay prefix resolved to — null when
   *  it doesn't match any of the 8 known kinds (e.g. a relay/panel/tower
   *  work item with no per-bay AHI report at all). Shown as "belum ada
   *  Report AHI" rather than hidden, per explicit user request. */
  kind: BayReportKind | null;
  candidates: BayMatchCandidate[];
}

export interface RenusOutageSyncWeek {
  period: RenusWeekPeriod;
  entries: RenusOutageSyncEntry[];
}

/** This week's and next week's padam lists, each cross-referenced against
 *  every AHI bay report kind. Cancelled RENUS rows (BATAL/CANC) are
 *  excluded — a cancelled work order isn't a real planned outage, same
 *  `isRenusCancelled` convention already used for every other RENUS
 *  aggregation in this app (asset-correlation.ts, seasonal-readiness.ts). */
export function buildRenusOutageSync(params: {
  rows: RenusRow[];
  todayISO: string;
  ahiOptionsByKind: Record<BayReportKind, BayLineOption[]>;
}): { thisWeek: RenusOutageSyncWeek; nextWeek: RenusOutageSyncWeek } {
  function buildWeek(period: RenusWeekPeriod): RenusOutageSyncWeek {
    const rowsInWeek = params.rows.filter(
      (r) => !isRenusCancelled(r) && r.rencanaDate >= period.start && r.rencanaDate <= period.end,
    );
    const entries: RenusOutageSyncEntry[] = rowsInWeek.map((renusRow) => {
      const { kind, candidates } = matchRenusBay(renusRow.bay, params.ahiOptionsByKind);
      return { renusRow, kind, candidates };
    });
    return { period, entries };
  }

  return {
    thisWeek: buildWeek(getFridayThursdayPeriod(params.todayISO)),
    nextWeek: buildWeek(getNextWeekPeriod(params.todayISO)),
  };
}
