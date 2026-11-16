import "server-only";

import { canonicalTowerNo } from "@/lib/gi-name";
import type { SigapTowerInsight } from "@/services/sigap";
import type { SuttRuas } from "@/types";

/** DATA SUTT ruas whose rows carry NO funcLoc at all (confirmed live:
 *  every one of their towers is blank), so the funcLoc join finds nothing.
 *  Mapped by hand to SIGAP's own bayLine code instead, then joined by
 *  tower number. Add a row here if another ruas turns up with an empty
 *  funcLoc column. */
const SIGAP_BAYLINE_FALLBACK: Record<string, string> = {
  "SKS - KUALA KURUN": "SKS-KKR",
  "SUKAMARA - KENDAWANGAN": "SKM-KDW",
};

/** Joins each DATA SUTT tower to its SIGAP record: by funcLoc (shared
 *  functional-location code), or — for a ruas with no funcLoc on any
 *  tower — by (SIGAP bayLine, tower label). Returns, per ruas, a map from
 *  the SUTT tower's own towerNo to its SIGAP insight; towers SIGAP doesn't
 *  know are simply absent. */
export function buildSigapTowerLookup(
  sigap: Record<string, SigapTowerInsight>,
): (ruas: SuttRuas) => Map<string, SigapTowerInsight> {
  const byBayLine = new Map<string, Map<string, SigapTowerInsight>>();
  for (const insight of Object.values(sigap)) {
    if (!insight.towerLabel) continue;
    const m = byBayLine.get(insight.bayLine) ?? new Map<string, SigapTowerInsight>();
    m.set(canonicalTowerNo(insight.towerLabel), insight);
    byBayLine.set(insight.bayLine, m);
  }
  return (ruas) => {
    const result = new Map<string, SigapTowerInsight>();
    for (const t of ruas.towers) {
      const hit = t.funcLoc ? sigap[t.funcLoc] : undefined;
      if (hit) result.set(t.towerNo, hit);
    }
    const fallback = SIGAP_BAYLINE_FALLBACK[ruas.section];
    if (result.size === 0 && fallback) {
      const labels = byBayLine.get(fallback);
      for (const t of ruas.towers) {
        const hit = labels?.get(canonicalTowerNo(t.towerNo));
        if (hit) result.set(t.towerNo, hit);
      }
    }
    return result;
  };
}
