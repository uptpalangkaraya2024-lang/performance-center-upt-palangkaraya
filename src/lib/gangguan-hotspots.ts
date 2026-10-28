// Repeat-offender tower/ruas ranking ("Peringkat Tower/Ruas Berulang") —
// the existing Pareto views on the Gangguan page stop at WHICH CAUSE
// (Petir, Hewan, ...), never WHICH PHYSICAL LOCATION keeps getting hit.
// This re-aggregates the same per-tower gangguan history the fault
// locator already uses (gangguan-history.ts) into a ranked hotspot list,
// so a tower/span that's been struck repeatedly surfaces on its own
// instead of being buried inside a cause-only breakdown.
import { canonicalGiKey } from "@/lib/gi-name";
import type { GangguanHistoryEntry, SuttRuas } from "@/types";

export interface GangguanHotspot {
  /** This physical tower's own nearest/owning GI per the SUTT asset
   *  registry — never the (sometimes inconsistent) GI the gangguan
   *  sheet's own free text happened to record for one specific incident
   *  row, see resolveTower()'s own comment for why those can disagree. */
  gi: string;
  towerNo: string;
  ruasSection: string | null;
  unit: string | null;
  count: number;
  /** Most recent event first, deduped — see the merge loop below. */
  entries: GangguanHistoryEntry[];
  causeBreakdown: { cause: string; count: number }[];
}

interface TowerCandidate {
  ruasSection: string;
  unit: string;
  /** This tower's own nearest/owning GI per the SUTT registry. */
  gi: string;
  originGiKey: string;
  farEndGiKey: string;
}

/** towerNo -> every ruas with a tower carrying that number — a plain list,
 *  not a single value, since a tower number can legitimately collide
 *  across two different lines sharing one hub GI (e.g. "KASONGAN - SKS"
 *  and "KASONGAN - SUDAN" both touch GI Kasongan and both number towers
 *  1-236ish — see sutt-asset.ts's own comment on this same limitation). */
function buildTowerCandidates(ruasList: SuttRuas[]): Map<string, TowerCandidate[]> {
  const map = new Map<string, TowerCandidate[]>();
  for (const ruas of ruasList) {
    const originGiKey = canonicalGiKey(ruas.originLabel);
    const farEndGiKey = canonicalGiKey(ruas.farEndLabel);
    for (const tower of ruas.towers) {
      if (!tower.gi) continue;
      const list = map.get(tower.towerNo) ?? [];
      list.push({ ruasSection: ruas.section, unit: ruas.unit, gi: tower.gi, originGiKey, farEndGiKey });
      map.set(tower.towerNo, list);
    }
  }
  return map;
}

/** Resolves a gangguan-sheet (gi, towerNo) pair to the physical ruas it
 *  actually belongs to. Prefers an EXACT match against the tower's own
 *  recorded nearest-GI (the precise case). Falls back to any candidate
 *  ruas whose own ENDPOINT GI (origin or far end) equals the reported
 *  one — confirmed live this is a real, common case: a ruas connects two
 *  GIs, and the same physical tower sometimes gets logged under EITHER
 *  endpoint's GI across different incident rows (both substations at a
 *  line's two ends can file their own report for the same trip), even
 *  though SUTT's own asset registry only ever lists ONE nearest GI per
 *  tower. Without this fallback, that reported-from-the-other-end row
 *  fails to resolve a ruas at all and shows as a second, unrelated-
 *  looking "GI Terdekat" row for what is really the same tower — exactly
 *  the duplicate the user flagged. First-candidate-wins for a genuine
 *  tower-number collision across two unrelated lines sharing a hub GI —
 *  a display-label limitation already accepted elsewhere in this app
 *  (same as giTowerKey's own precedent). */
function resolveTower(gi: string, towerNo: string, candidates: TowerCandidate[]): TowerCandidate | null {
  if (candidates.length === 0) return null;
  const giKey = canonicalGiKey(gi);
  const exact = candidates.find((c) => canonicalGiKey(c.gi) === giKey);
  if (exact) return exact;
  const endpointMatch = candidates.find((c) => c.originGiKey === giKey || c.farEndGiKey === giKey);
  return endpointMatch ?? candidates[0];
}

/** Top N towers by total recorded gangguan count, newest-event-first
 *  within each. Towers with only 1 recorded event are excluded — a single
 *  past event isn't a "repeat offender," it's just history. */
export function buildGangguanHotspots(
  historyByTowerGi: Record<string, GangguanHistoryEntry[]>,
  ruasList: SuttRuas[],
  topN = 15,
): GangguanHotspot[] {
  const towerCandidates = buildTowerCandidates(ruasList);

  // Merge every (gi, towerNo) bucket that resolves to the SAME physical
  // ruas+tower into one group — this is the actual fix for the duplicate-
  // row bug: a tower on a ruas connecting two GIs used to show up as two
  // separate rows (one per endpoint GI the gangguan sheet happened to
  // record for a given incident), identical count and all, because the
  // grouping key was (gi, tower) instead of (ruas, tower). A tower that
  // never resolves to any ruas (no SUTT asset match at all) keeps its
  // raw (gi, tower) grouping — nothing to merge it against.
  const merged = new Map<
    string,
    { gi: string; towerNo: string; ruasSection: string | null; unit: string | null; entries: GangguanHistoryEntry[] }
  >();
  for (const [key, entries] of Object.entries(historyByTowerGi)) {
    if (entries.length === 0) continue;
    const [gi, towerNo] = key.split("::");
    const candidates = towerCandidates.get(towerNo) ?? [];
    const resolved = resolveTower(gi, towerNo, candidates);
    const groupKey = resolved ? `${resolved.ruasSection}::${towerNo}` : key;
    const existing = merged.get(groupKey);
    if (existing) {
      existing.entries.push(...entries);
    } else {
      merged.set(groupKey, {
        gi: resolved?.gi ?? gi,
        towerNo,
        ruasSection: resolved?.ruasSection ?? null,
        unit: resolved?.unit ?? null,
        entries: [...entries],
      });
    }
  }

  const hotspots: GangguanHotspot[] = [];
  for (const group of merged.values()) {
    // The same physical incident sometimes gets logged once per endpoint
    // GI (confirmed live: identical date+cause pairs duplicated across
    // two GI-keyed buckets for the same tower, both ends of the line
    // filing their own report) — deduped here by (tgl, penyebab) so a
    // merged tower's count reflects distinct incidents, not double-
    // counted reports of the same one. Accepted trade-off: two genuinely
    // different incidents at the same tower on the exact same date with
    // the exact same cause (rare) would also collapse to one — same
    // "don't over-engineer a disambiguator for a handful of edge cases"
    // call already made elsewhere in this file.
    const seen = new Set<string>();
    const deduped: GangguanHistoryEntry[] = [];
    for (const e of [...group.entries].sort((a, b) => b.tgl.localeCompare(a.tgl))) {
      const dedupeKey = `${e.tgl}::${e.penyebab}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      deduped.push(e);
    }
    if (deduped.length < 2) continue;

    const causeCounts = new Map<string, number>();
    for (const e of deduped) {
      const cause = e.penyebab || "Tidak diketahui";
      causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
    }
    hotspots.push({
      gi: group.gi,
      towerNo: group.towerNo,
      ruasSection: group.ruasSection,
      unit: group.unit,
      count: deduped.length,
      entries: deduped,
      causeBreakdown: [...causeCounts.entries()]
        .map(([cause, count]) => ({ cause, count }))
        .sort((a, b) => b.count - a.count),
    });
  }

  return hotspots.sort((a, b) => b.count - a.count).slice(0, topN);
}
