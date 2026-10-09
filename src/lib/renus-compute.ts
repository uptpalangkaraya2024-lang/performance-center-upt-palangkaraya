// Pure, client-safe RENUS derivations, separate from renus-helpers.ts's
// plain per-row predicates (isRenusDone/isRenusCancelled/isRenusHighRisk) —
// same "load once, derive many things" shape as the other modules'
// *-compute.ts files.
import { isRenusCancelled, isRenusDone, isRenusHighRisk } from "@/lib/renus-helpers";
import type { RenusRow } from "@/types";

export interface RenusUltgResumeEntry {
  ultg: string;
  total: number;
  overdue: number;
  highRisk: number;
  done: number;
}

/** Per-ULTG resume over whatever row set is passed in — callers pass the
 *  already-scoped/filtered rows (same dataset the page's own summary cards
 *  use), so this reacts to the active view/filter instead of always
 *  covering the whole dataset. Cancelled rows are excluded up front, same
 *  as every other RENUS summary (see computeSummaryFor in renus-client.tsx
 *  and buildRenusReminders in executive-insights.ts) — a cancelled work
 *  order shouldn't count toward any ULTG's overdue/high-risk/done tally.
 *  ULTG column order follows first-seen order in `rows`, same convention
 *  as the other modules' per-ULTG builders, rather than a hardcoded list. */
export function buildRenusUltgResume(rows: RenusRow[], todayISO: string): RenusUltgResumeEntry[] {
  const order: string[] = [];
  const map = new Map<string, RenusRow[]>();
  for (const r of rows) {
    if (isRenusCancelled(r)) continue;
    const key = r.ultg || "Lainnya";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(r);
  }
  return order.map((ultg) => {
    const group = map.get(ultg)!;
    return {
      ultg,
      total: group.length,
      overdue: group.filter((r) => !isRenusDone(r) && r.rencanaDate < todayISO).length,
      highRisk: group.filter((r) => isRenusHighRisk(r)).length,
      done: group.filter((r) => isRenusDone(r)).length,
    };
  });
}
