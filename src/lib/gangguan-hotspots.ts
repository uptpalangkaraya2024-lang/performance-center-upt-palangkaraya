// Repeat-offender tower/ruas ranking ("Peringkat Tower/Ruas Berulang") —
// the existing Pareto views on the Gangguan page stop at WHICH CAUSE
// (Petir, Hewan, ...), never WHICH PHYSICAL LOCATION keeps getting hit.
// This re-aggregates the same per-tower gangguan history the fault
// locator already uses (gangguan-history.ts) into a ranked hotspot list,
// so a tower/span that's been struck repeatedly surfaces on its own
// instead of being buried inside a cause-only breakdown.
import type { GangguanHistoryEntry, SuttRuas } from "@/types";

export interface GangguanHotspot {
  gi: string;
  towerNo: string;
  ruasSection: string | null;
  unit: string | null;
  count: number;
  /** Most recent event first. */
  entries: GangguanHistoryEntry[];
  causeBreakdown: { cause: string; count: number }[];
}

// Same normalizer gangguan-history.ts's own matchKey uses — duplicated
// locally rather than imported, matching that module's own stated
// convention for this one-line helper.
function normalizeGiNameUpper(raw: string): string {
  return raw.replace(/^GIS?\s*\d+\s*KV\s*/i, "").trim().toUpperCase();
}

/** Builds a GI+towerNo -> {ruas, unit} lookup once over the whole ruas
 *  list, so every tower's own ruas/unit can be resolved in O(1) instead of
 *  re-scanning the ruas list per hotspot. */
function buildTowerLookup(ruasList: SuttRuas[]): Map<string, { ruasSection: string; unit: string }> {
  const lookup = new Map<string, { ruasSection: string; unit: string }>();
  for (const ruas of ruasList) {
    for (const tower of ruas.towers) {
      if (!tower.gi) continue;
      const key = `${normalizeGiNameUpper(tower.gi)}::${tower.towerNo}`;
      // A tower number can legitimately repeat across two different lines
      // sharing one hub GI (see sutt-asset.ts's own comment on this same
      // limitation) — first match wins rather than guessing which line is
      // "more correct"; this is a display label, not a safety-critical
      // distinction.
      if (!lookup.has(key)) lookup.set(key, { ruasSection: ruas.section, unit: ruas.unit });
    }
  }
  return lookup;
}

/** Top N towers by total recorded gangguan count, newest-event-first
 *  within each. Towers with only 1 recorded event are excluded — a single
 *  past event isn't a "repeat offender," it's just history. */
export function buildGangguanHotspots(
  historyByTowerGi: Record<string, GangguanHistoryEntry[]>,
  ruasList: SuttRuas[],
  topN = 15,
): GangguanHotspot[] {
  const towerLookup = buildTowerLookup(ruasList);

  const hotspots: GangguanHotspot[] = [];
  for (const [key, entries] of Object.entries(historyByTowerGi)) {
    if (entries.length < 2) continue;
    const [gi, towerNo] = key.split("::");
    const resolved = towerLookup.get(key);
    const causeCounts = new Map<string, number>();
    for (const e of entries) {
      const cause = e.penyebab || "Tidak diketahui";
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }
    hotspots.push({
      gi,
      towerNo,
      ruasSection: resolved?.ruasSection ?? null,
      unit: resolved?.unit ?? null,
      count: entries.length,
      entries: [...entries].sort((a, b) => b.tgl.localeCompare(a.tgl)),
      causeBreakdown: [...causeCounts.entries()]
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count),
    });
  }

  return hotspots.sort((a, b) => b.count - a.count).slice(0, topN);
}
