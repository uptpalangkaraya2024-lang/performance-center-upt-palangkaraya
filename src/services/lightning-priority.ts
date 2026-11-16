import "server-only";

import { buildGangguanTowerRanges } from "@/lib/gangguan-hotspots";
import {
  PRIORITY_RANK,
  judgePriority,
  type LightningPriorityRange,
  type LightningTower,
} from "@/lib/lightning-priority";
import { getGangguanHistoryByTowerGi } from "@/services/gangguan-history";
import { getSigapTowerInsights } from "@/services/sigap";
import { buildSigapTowerLookup } from "@/services/sigap-join";
import { getSuttSnapshot } from "@/services/sutt-asset";

const RANGE_SIZE = 5;

export interface LightningPriorityResult {
  ranges: LightningPriorityRange[];
  /** false when SIGAP returned nothing (down, no cache) — every tower then
   *  shows as "not in SIGAP" and the card says so instead of misjudging. */
  sigapAvailable: boolean;
}

/** Same per-tower history and 5-tower ranges as "Tower Gangguan Berulang",
 *  restricted to PETIR incidents (2+ per range), then each tower joined to
 *  SIGAP for its TLA marker, footing resistance and strike count. All three
 *  sources are already cached by their own services, so no new fetch. */
export async function getLightningPriority(): Promise<LightningPriorityResult> {
  const [history, sutt, sigap] = await Promise.all([
    getGangguanHistoryByTowerGi(),
    getSuttSnapshot(),
    getSigapTowerInsights(),
  ]);
  if (sutt.error) return { ranges: [], sigapAvailable: false };

  const isPetir = (e: { penyebab: string }) => e.penyebab.trim().toUpperCase() === "PETIR";
  const ranges = buildGangguanTowerRanges(history, sutt.ruasList, RANGE_SIZE, Infinity, isPetir);
  const lookup = buildSigapTowerLookup(sigap);
  const ruasBySection = new Map(sutt.ruasList.map((r) => [r.section, r]));
  const lookupCache = new Map<string, ReturnType<typeof lookup>>();

  const result = ranges.map((range): LightningPriorityRange => {
    let bySigap = lookupCache.get(range.ruasSection);
    if (!bySigap) {
      const ruas = ruasBySection.get(range.ruasSection);
      bySigap = ruas ? lookup(ruas) : new Map();
      lookupCache.set(range.ruasSection, bySigap);
    }
    const towers: LightningTower[] = range.towers.map((t) => {
      const s = bySigap.get(t.towerNo);
      const sambaran = s?.sambaranPerTahun.length ? s.sambaranPerTahun.reduce((sum, y) => sum + y.value, 0) : null;
      return {
        towerNo: t.towerNo,
        hits: t.count,
        inSigap: !!s,
        tla: s?.tla ?? false,
        dgs: s?.dgs ?? false,
        rOhm: s?.rTotalOhm ?? null,
        sambaran,
      };
    });
    return {
      ruasSection: range.ruasSection,
      unit: range.unit,
      gi: range.gi,
      fromTowerNo: range.fromTowerNo,
      toTowerNo: range.toTowerNo,
      count: range.count,
      incidents: range.incidents.map((i) => ({ tgl: i.tgl, towerNos: i.towerNos })),
      towers,
      sambaranTotal: towers.reduce((sum, t) => sum + (t.sambaran ?? 0), 0),
      ...judgePriority(towers),
    };
  });

  result.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.count - a.count || b.sambaranTotal - a.sambaranTotal,
  );
  return { ranges: result, sigapAvailable: Object.keys(sigap).length > 0 };
}
