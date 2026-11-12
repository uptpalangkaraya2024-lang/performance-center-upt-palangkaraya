// Repeat-offender tower/ruas ranking ("Peringkat Tower/Ruas Berulang") —
// the existing Pareto views on the Gangguan page stop at WHICH CAUSE
// (Petir, Hewan, ...), never WHICH PHYSICAL LOCATION keeps getting hit.
// This re-aggregates the same per-tower gangguan history the fault
// locator already uses (gangguan-history.ts) into a ranked hotspot list,
// so a tower/span that's been struck repeatedly surfaces on its own
// instead of being buried inside a cause-only breakdown.
import { canonicalGiKey, giTokenSet, lineGiPairKey } from "@/lib/gi-name";
import type { DisturbanceBayEventRecord, GangguanHistoryEntry, SuttRuas } from "@/types";

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
  /** Order-independent key of the ruas's two endpoint GIs, same shape
   *  lineGiPairKey() produces from a "X - Y" bay name — so a gangguan
   *  row's NAMA BAY GANGGUAN can be matched straight to its ruas. */
  pairKey: string;
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
    const pairKey = [giTokenSet(ruas.originLabel), giTokenSet(ruas.farEndLabel)].sort().join("||");
    for (const tower of ruas.towers) {
      if (!tower.gi) continue;
      const list = map.get(tower.towerNo) ?? [];
      list.push({ ruasSection: ruas.section, unit: ruas.unit, gi: tower.gi, originGiKey, farEndGiKey, pairKey });
      map.set(tower.towerNo, list);
    }
  }
  return map;
}

/** Resolves a gangguan-sheet (gi, towerNo, bay) row to the physical ruas
 *  it actually belongs to. FIRST preference is the row's own NAMA BAY
 *  GANGGUAN ("SKS - KASONGAN 1"): its GI pair names the exact line, which
 *  settles the tower-number collision between two lines sharing a hub GI
 *  (confirmed live: T.100 used to show up under BOTH "KASONGAN - SKS" and
 *  "MINTIN - PALANGKARAYA" with identical incidents, because (GI, tower)
 *  alone can't tell them apart). Then an EXACT match against the tower's
 *  own recorded nearest-GI (the precise case). Falls back to any candidate
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
function resolveTower(gi: string, towerNo: string, bay: string, candidates: TowerCandidate[]): TowerCandidate | null {
  if (candidates.length === 0) return null;
  const bayPairKey = bay ? lineGiPairKey(bay) : null;
  let pool = candidates;
  if (bayPairKey) {
    const byBay = candidates.find((c) => c.pairKey === bayPairKey);
    if (byBay) return byBay;
    // The bay names a line the SUTT registry doesn't list under that
    // exact GI pair (confirmed live: "PULANG PISAU - PALANGKARAYA" — that
    // circuit rides on the "MINTIN - PALANGKARAYA" towers, GI Pulang
    // Pisau being a tap, not a registered ruas end). Narrow to the
    // candidates sharing at least ONE GI with the bay, so a report filed
    // from the far (unregistered) end still lands on the right line
    // rather than falling through to an unrelated first candidate — that
    // fall-through is exactly how one PETIR event at T.333-337 showed up
    // under both MINTIN - PALANGKARAYA and KASONGAN - SUDAN. If no
    // candidate shares any GI with the bay, the tower isn't on any
    // registered line we know of: unresolved, never a guess.
    const baySides = new Set(bayPairKey.split("||"));
    pool = candidates.filter((c) => c.pairKey.split("||").some((side) => baySides.has(side)));
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
  }
  const giKey = canonicalGiKey(gi);
  const exact = pool.find((c) => canonicalGiKey(c.gi) === giKey);
  if (exact) return exact;
  const endpointMatch = pool.find((c) => c.originGiKey === giKey || c.farEndGiKey === giKey);
  return endpointMatch ?? pool[0];
}

interface TowerGroup {
  gi: string;
  towerNo: string;
  ruasSection: string | null;
  unit: string | null;
  /** Deduped by (tgl, penyebab), newest first. */
  entries: GangguanHistoryEntry[];
}

/** The same physical incident sometimes gets logged once per endpoint GI
 *  (confirmed live: identical date+cause pairs duplicated across two
 *  GI-keyed buckets for the same tower, both ends of the line filing
 *  their own report) — deduped by (tgl, penyebab) so a count reflects
 *  distinct incidents, not double-counted reports of the same one.
 *  Accepted trade-off: two genuinely different incidents at the same
 *  place on the exact same date with the exact same cause (rare) would
 *  also collapse to one — same "don't over-engineer a disambiguator for a
 *  handful of edge cases" call already made elsewhere in this file. */
function incidentKey(e: { tgl: string; penyebab: string }): string {
  return `${e.tgl}::${e.penyebab}`;
}

function dedupeNewestFirst(entries: GangguanHistoryEntry[]): GangguanHistoryEntry[] {
  const seen = new Set<string>();
  const out: GangguanHistoryEntry[] = [];
  for (const e of [...entries].sort((a, b) => b.tgl.localeCompare(a.tgl))) {
    const k = incidentKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function causeBreakdownOf(items: { penyebab: string }[]): { cause: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of items) {
    const cause = e.penyebab || "Tidak diketahui";
    counts.set(cause, (counts.get(cause) ?? 0) + 1);
  }
  return [...counts.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count);
}

/** Resolves every history entry to its physical (ruas, tower) and merges
 *  them into one group per physical tower — the fix for the duplicate-row
 *  bug: a tower on a ruas connecting two GIs used to show up as two
 *  separate rows (one per endpoint GI the gangguan sheet happened to
 *  record for a given incident), identical count and all, because the
 *  grouping key was (gi, tower) instead of (ruas, tower). Resolution is
 *  per ENTRY (not per gi::tower bucket) because one bucket can mix rows
 *  from two different lines that share the GI and the tower number —
 *  only each row's own bay name tells them apart. An entry that never
 *  resolves to any ruas (no SUTT asset match at all) keeps its raw
 *  (gi, tower) grouping — nothing to merge it against. Keyed by
 *  `${ruasSection}::${towerNo}` for resolved towers. */
function groupByPhysicalTower(
  historyByTowerGi: Record<string, GangguanHistoryEntry[]>,
  ruasList: SuttRuas[],
): Map<string, TowerGroup> {
  const towerCandidates = buildTowerCandidates(ruasList);
  const merged = new Map<string, TowerGroup>();
  for (const [key, entries] of Object.entries(historyByTowerGi)) {
    const [gi, towerNo] = key.split("::");
    const candidates = towerCandidates.get(towerNo) ?? [];
    for (const entry of entries) {
      const resolved = resolveTower(gi, towerNo, entry.bay, candidates);
      const groupKey = resolved ? `${resolved.ruasSection}::${towerNo}` : key;
      const existing = merged.get(groupKey);
      if (existing) {
        existing.entries.push(entry);
      } else {
        merged.set(groupKey, {
          gi: resolved?.gi ?? gi,
          towerNo,
          ruasSection: resolved?.ruasSection ?? null,
          unit: resolved?.unit ?? null,
          entries: [entry],
        });
      }
    }
  }
  for (const group of merged.values()) group.entries = dedupeNewestFirst(group.entries);
  return merged;
}

/** Top N towers by total recorded gangguan count, newest-event-first
 *  within each. Towers with only 1 recorded event are excluded — a single
 *  past event isn't a "repeat offender," it's just history. */
export function buildGangguanHotspots(
  historyByTowerGi: Record<string, GangguanHistoryEntry[]>,
  ruasList: SuttRuas[],
  topN = 15,
): GangguanHotspot[] {
  const hotspots: GangguanHotspot[] = [];
  for (const group of groupByPhysicalTower(historyByTowerGi, ruasList).values()) {
    if (group.entries.length < 2) continue;
    hotspots.push({
      gi: group.gi,
      towerNo: group.towerNo,
      ruasSection: group.ruasSection,
      unit: group.unit,
      count: group.entries.length,
      entries: group.entries,
      causeBreakdown: causeBreakdownOf(group.entries),
    });
  }
  return hotspots.sort((a, b) => b.count - a.count).slice(0, topN);
}

// --- Tower RANGE repeat-offender ranking ---------------------------------
//
// Per user request: a repeat problem is often "the same stretch of line,"
// not the same single tower — lightning or animal strikes land on T.161
// one year and T.163 the next, and neither tower alone ever reaches the
// per-tower view's 2-event threshold. So the same per-tower history is
// re-bucketed into fixed stretches of `size` consecutive towers (by the
// ruas's PHYSICAL tower order, so decimal/suffixed numbers like 185.1 or
// 265A slot in where they really stand, not by numeric value).
//
// Counting is by DISTINCT INCIDENT per range, not a sum of per-tower
// counts: gangguan-history.ts expands a narrative like "T.93 - T.94" into
// one entry per tower, so summing would count that single trip twice
// (confirmed live: T.93=5 + T.94=4 in the per-tower view are mostly the
// same three TEGAKAN incidents). Each tower's own mention count is still
// kept so the UI can show exactly where inside the range the hits landed.

export interface GangguanTowerRangeTower {
  towerNo: string;
  /** How many of the range's distinct incidents name this tower. */
  count: number;
}

export interface GangguanTowerRangeIncident {
  tgl: string;
  penyebab: string;
  /** Towers inside this range the incident was attributed to, physical order. */
  towerNos: string[];
}

export interface GangguanTowerRange {
  ruasSection: string;
  unit: string;
  /** Nearest GI of the range's first tower, per the SUTT registry. */
  gi: string;
  fromTowerNo: string;
  toTowerNo: string;
  /** Every tower in the range in physical order (hit or not), so the UI
   *  can draw one cell per tower. */
  towers: GangguanTowerRangeTower[];
  /** Distinct incidents across the whole range. */
  count: number;
  /** Newest first. */
  incidents: GangguanTowerRangeIncident[];
  causeBreakdown: { cause: string; count: number }[];
}

/** Top N fixed ranges of `size` consecutive towers (1-5, 6-10, ... in
 *  physical order per ruas) by distinct-incident count. Ranges with fewer
 *  than 2 distinct incidents are excluded, same rule as the per-tower
 *  view. Ties broken by how many different towers were hit (more spread =
 *  more "area" signal), then by ruas/tower order for a stable list. */
export function buildGangguanTowerRanges(
  historyByTowerGi: Record<string, GangguanHistoryEntry[]>,
  ruasList: SuttRuas[],
  size = 5,
  topN = 15,
): GangguanTowerRange[] {
  const groups = groupByPhysicalTower(historyByTowerGi, ruasList);
  const ranges: GangguanTowerRange[] = [];
  for (const ruas of ruasList) {
    for (let i = 0; i < ruas.towers.length; i += size) {
      const slice = ruas.towers.slice(i, i + size);
      const incidents = new Map<string, GangguanTowerRangeIncident>();
      const towers: GangguanTowerRangeTower[] = [];
      for (const tower of slice) {
        const entries = groups.get(`${ruas.section}::${tower.towerNo}`)?.entries ?? [];
        towers.push({ towerNo: tower.towerNo, count: entries.length });
        for (const e of entries) {
          const k = incidentKey(e);
          const inc = incidents.get(k) ?? { tgl: e.tgl, penyebab: e.penyebab, towerNos: [] };
          inc.towerNos.push(tower.towerNo);
          incidents.set(k, inc);
        }
      }
      if (incidents.size < 2) continue;
      const incidentList = [...incidents.values()].sort((a, b) => b.tgl.localeCompare(a.tgl));
      ranges.push({
        ruasSection: ruas.section,
        unit: ruas.unit,
        gi: slice[0].gi,
        fromTowerNo: slice[0].towerNo,
        toTowerNo: slice[slice.length - 1].towerNo,
        towers,
        count: incidentList.length,
        incidents: incidentList,
        causeBreakdown: causeBreakdownOf(incidentList),
      });
    }
  }
  const hitTowers = (r: GangguanTowerRange) => r.towers.filter((t) => t.count > 0).length;
  return ranges.sort((a, b) => b.count - a.count || hitTowers(b) - hitTowers(a)).slice(0, topN);
}

// --- Trafo HV/LV bay repeat-offender ranking -----------------------------
//
// Trafo gangguan has no tower to attribute to (per this file's own header
// comment) — the equivalent physical location there is the specific
// trafo UNIT at a GI (the sheet's own NAMA BAY GANGGUAN value, e.g.
// "TRAFO 1"). Unlike a transmission tower, a trafo bay only ever belongs
// to ONE GI (it isn't shared between two substations the way a line
// span is), so there's no cross-GI duplicate-reporting ambiguity to
// resolve here — straight (gi, bay) grouping over the already-computed
// bayEvents (src/services/disturbances.ts) is enough, no new data source
// needed.

export interface BayGangguanHotspot {
  category: string;
  gi: string;
  bay: string;
  count: number;
  /** Most recent event first. */
  entries: { date: string; dateISO: string; cause: string }[];
  causeBreakdown: { cause: string; count: number }[];
}

/** Top N (category, GI, bay) trafo units by recorded gangguan count,
 *  across however many categories are passed in (Trafo HV and Trafo LV
 *  combined, per the user's own request) — ranked together so the single
 *  worst-offending trafo unit overall sorts first regardless of which
 *  side it's on. Units with only 1 recorded event are excluded, same
 *  "not a repeat offender yet" rule as the tower ranking above. */
export function buildBayGangguanHotspots(
  categories: { category: string; events: DisturbanceBayEventRecord[] }[],
  topN = 15,
): BayGangguanHotspot[] {
  const byKey = new Map<string, { category: string; gi: string; bay: string; events: DisturbanceBayEventRecord[] }>();
  for (const { category, events } of categories) {
    for (const e of events) {
      const gi = e.gi ?? "-";
      const key = `${category}::${gi}::${e.bay}`;
      const existing = byKey.get(key);
      if (existing) existing.events.push(e);
      else byKey.set(key, { category, gi, bay: e.bay, events: [e] });
    }
  }

  const hotspots: BayGangguanHotspot[] = [];
  for (const group of byKey.values()) {
    if (group.events.length < 2) continue;
    const sorted = [...group.events].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
    const causeCounts = new Map<string, number>();
    for (const e of sorted) causeCounts.set(e.cause, (causeCounts.get(e.cause) ?? 0) + 1);
    hotspots.push({
      category: group.category,
      gi: group.gi,
      bay: group.bay,
      count: sorted.length,
      entries: sorted.map((e) => ({ date: e.date, dateISO: e.dateISO, cause: e.cause })),
      causeBreakdown: [...causeCounts.entries()].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count),
    });
  }

  return hotspots.sort((a, b) => b.count - a.count).slice(0, topN);
}
