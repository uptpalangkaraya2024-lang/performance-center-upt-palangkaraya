// Per-ruas (not per-GI) risk correlation — built for Usulan Prioritas
// Pemeliharaan per the user's own explicit objection to the GI-level
// version: a GI can touch several physical ruas, and an anomaly on one
// ruas doesn't mean "replace the whole substation." This mirrors asset-
// correlation.ts's own buildGiCorrelation/riskScore design (same weights,
// same 0-100 rescaling), just keyed by (section, circuit) instead of GI —
// asset-correlation.ts itself is left untouched, since the homepage GI
// risk table and Laporan Eksekutif's own "Risiko Utama" section still
// want the GI-level rollup.
//
// Per-source attribution precision, confirmed live before writing this:
//  - AHI: already circuit-aware (see ruas-infographic.ts's own
//    detectRuasCircuits/extractCircuitSuffix) — exact.
//  - Gangguan: tower-precise (FASE 1's own giTowerKey), rolled up to
//    whichever ruas owns that tower — exact.
//  - RENUS: ~53% of rows carry their own "SECTION TRANSMISI" + "SPAN/
//    TOWER" columns (Transmisi-category work only — Trafo work has
//    neither, since a trafo isn't on a line). Matched to a ruas via the
//    GI-pair embedded in those columns, run through GI_ABBREVIATION_MAP
//    below (confirmed live this column uses short forms like "KSGAN" for
//    "KASONGAN" — a different abbreviation convention than anything else
//    in this app). Rows with neither field (Trafo work, or a Transmisi
//    row where the field was simply left blank) are NOT attributed to any
//    ruas — shown separately as "pekerjaan trafo/tidak teratribusi ke
//    ruas" context, never guessed onto a ruas with no evidence for it.
//  - CE: `gardu` alone is GI-only, but CE's own `bay` field for a line-
//    related finding carries the SAME "X-Y#N" shape AHI's own BAY LINE
//    naming does, just with a "PHT <n>KV" prefix instead of "BAY LINE"
//    (confirmed live, e.g. "PHT 150KV BUNTOK-MUARA TEWEH#2") — matched
//    ruas+circuit-precise via the same lineGiPairKey/extractCircuitSuffix
//    AHI uses, NOT a GI-wide guess. A facility/trafo CE finding (atap
//    gedung, AC, pondasi, pagar, a trafo-only anomaly) has no such bay
//    text and genuinely cannot be attributed to one ruas — these stay
//    counted at GI level only, shown as separate context, never folded
//    into the ruas's own riskScore.
import { canonicalGiKey, extractCircuitSuffix, giTokenSet, giTowerKey, lineGiPairKey } from "@/lib/gi-name";
import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";
import type { AhiAnomalyRecord, BayLineReport, CeItem, GangguanHistoryEntry, RenusRow, SuttRuas } from "@/types";

export interface RuasCorrelationRow {
  section: string;
  circuit: string | null;
  unit: string;
  originGi: string;
  farEndGi: string;

  ahiCritical: number;
  ahiPoor: number;
  ahiTotal: number;

  /** CE line findings precisely matched to THIS ruas+circuit via its own
   *  bay text (see header comment) — this is what feeds riskComponents.ce
   *  now, genuinely ruas-specific, not diluted across every ruas sharing
   *  a GI. */
  ceOpenOnThisRuas: number;
  /** GI-level context only — facility/trafo CE findings at either endpoint
   *  GI that have no bay/line reference at all, so can't be attributed to
   *  one ruas. Shown separately, NOT folded into riskScore.ce. Always the
   *  same number across every ruas sharing a GI — a GI-wide count, not a
   *  ruas one. */
  ceOpenAtEndpointGis: number;

  gangguanTotal: number;
  renusOverdue: number;
  renusTotal: number;

  riskScore: number;
  riskComponents: { ahi: number; ce: number; gangguan: number; renus: number };
  riskScore100: number;
}

const KLASIFIKASI_SEVERITY: Record<string, number> = { CRITICAL: 5, POOR: 4, FAIR: 3, GOOD: 2, BEST: 1, "NO DATA": 0 };
const KATEGORI_TO_KLASIFIKASI: Record<number, string> = { 1: "BEST", 2: "GOOD", 3: "FAIR", 4: "POOR", 5: "CRITICAL" };

// giTokenSet/lineGiPairKey/extractCircuitSuffix now live in gi-name.ts
// (shared with ruas-infographic.ts and ruas-maintenance-proposals.ts),
// since CE's own "PHT <n>KV X-Y#N" bay naming needs the exact same
// AHI-style line/circuit matching.

// Confirmed live against RENUS's own "SECTION TRANSMISI"/"SPAN/TOWER"
// columns — a short-form convention distinct from every other GI-name
// variant already handled in gi-name.ts. Expand as new abbreviations
// surface (same "never relax the matcher, add to the table" rule as every
// other alias list in this codebase).
const GI_ABBREVIATION_MAP: Record<string, string> = {
  KSGAN: "KASONGAN",
  KSNGN: "KASONGAN",
  SMPIT: "SAMPIT",
  MRTWH: "MUARA TEWEH",
  PURCA: "PURUK CAHU",
  PBUN: "PANGKALAN BUN",
  PKBUN: "PANGKALAN BUN",
  TNJNG: "TANJUNG",
  BNTOK: "BUNTOK",
  PLKRY: "PALANGKARAYA",
  PRAYA: "PALANGKARAYA",
  PLSKS: "SKS",
  MNTIN: "MINTIN",
  BKNAI: "BANGKANAI",
  PGEAN: "PARENGGEAN",
  NGBLK: "NANGABULIK",
  INC: "INCOMER",
};

function expandAbbreviations(raw: string): string {
  return raw
    .toUpperCase()
    .split(/[^A-Z]+/)
    .map((word) => GI_ABBREVIATION_MAP[word] ?? word)
    .join(" ");
}

/** Pulls whichever GI-pair text RENUS's own columns carry — "SECTION
 *  TRANSMISI" reads e.g. "TRS 150 KV KSGAN-SMPIT", "SPAN/TOWER" reads
 *  e.g. "SPAN SUTT 150 KV KSGAN - SUDAN #227-#228" or "TOWER SUTT 150 KV
 *  PLKRY - KSGAN #020" — either one names the corridor, expanded through
 *  GI_ABBREVIATION_MAP before token-matching against a ruas's own GI
 *  pair. Prefers spanTower (closer to the actual physical location) when
 *  both are present. */
export function renusGiPairKey(row: RenusRow): string | null {
  const source = row.spanTower || row.section;
  if (!source) return null;
  const withoutPrefix = source.replace(/^(SPAN|TOWER)\s+SUTT\s+\d+\s*KV\s+/i, "").replace(/^TRS\s+\d+\s*KV\s+/i, "");
  const withoutTowerNumbers = withoutPrefix.replace(/#\d+(-#?\d+)?\s*$/, "").trim();
  const sides = withoutTowerNumbers.split(/\s*-\s*/).map((s) => giTokenSet(expandAbbreviations(s)));
  if (sides.length !== 2 || sides.some((s) => !s)) return null;
  return [...sides].sort().join("||");
}

/** Tower number(s) a RENUS row's own "SPAN/TOWER" text names — a span
 *  names two ("#227-#228"), a single tower names one ("#020"). Used by
 *  Verifikasi Efektivitas to scope a gangguan comparison to the exact
 *  tower(s) the work happened at, not the whole ruas/GI. */
export function extractRenusTowerNumbers(spanTower: string | null): string[] {
  if (!spanTower) return [];
  const matches = [...spanTower.matchAll(/#(\d+)/g)];
  return matches.map((m) => m[1]);
}

export function buildRuasCorrelation(params: {
  ruasList: SuttRuas[];
  ahiAnomalies: AhiAnomalyRecord[];
  ahiBayLineReports: BayLineReport[];
  ceItems: CeItem[];
  renusRows: RenusRow[];
  gangguanByTowerGi: Record<string, GangguanHistoryEntry[]>;
  todayISO: string;
}): RuasCorrelationRow[] {
  const { ruasList, ahiAnomalies, ahiBayLineReports, ceItems, renusRows, gangguanByTowerGi, todayISO } = params;

  const rows: RuasCorrelationRow[] = [];
  for (const ruas of ruasList) {
    const ruasGiKey = [giTokenSet(ruas.originLabel), giTokenSet(ruas.farEndLabel)].sort().join("||");
    const endpointGis = new Set([canonicalGiKey(ruas.originLabel), canonicalGiKey(ruas.farEndLabel)]);

    const circuits = new Set<string>();
    for (const r of ahiBayLineReports) {
      if (lineGiPairKey(r.bay) !== ruasGiKey) continue;
      const c = extractCircuitSuffix(r.bay);
      if (c) circuits.add(c);
    }
    for (const a of ahiAnomalies) {
      if (lineGiPairKey(a.bay) !== ruasGiKey) continue;
      const c = extractCircuitSuffix(a.bay);
      if (c) circuits.add(c);
    }
    const circuitList: (string | null)[] = circuits.size === 0 ? [null] : [...circuits].sort((a, b) => Number(a) - Number(b));

    // Ruas-wide signals (not circuit-specific — computed once, reused for
    // every circuit card of this section).
    //
    // CE line findings matched by bay text to this ruas (still ruas-wide
    // here, split per circuit inside the loop below) vs GI-level-only
    // findings that have no bay/line reference at all (facility/trafo —
    // genuinely can't be narrowed past "somewhere at this GI").
    const ceLineItemsOnThisRuas = ceItems.filter((i) => !i.done && lineGiPairKey(i.bay) === ruasGiKey);
    const ceOpenAtEndpointGis = ceItems.filter(
      (i) => !i.done && i.gardu && endpointGis.has(canonicalGiKey(i.gardu)) && lineGiPairKey(i.bay) === null,
    ).length;

    const gangguanTotal = ruas.towers.reduce((sum, tower) => {
      const entries = gangguanByTowerGi[giTowerKey(tower.gi, tower.towerNo)];
      return sum + (entries?.length ?? 0);
    }, 0);

    const renusMatched = renusRows.filter((r) => !isRenusCancelled(r) && renusGiPairKey(r) === ruasGiKey);
    const renusTotal = renusMatched.length;
    const renusOverdue = renusMatched.filter((r) => !isRenusDone(r) && r.rencanaDate < todayISO).length;

    for (const circuit of circuitList) {
      const ahiAnomaliesMatched = ahiAnomalies.filter(
        (a) => lineGiPairKey(a.bay) === ruasGiKey && extractCircuitSuffix(a.bay) === circuit,
      );
      const ahiCritical = ahiAnomaliesMatched.filter((a) => a.kategoriAhi === 5).length;
      const ahiPoor = ahiAnomaliesMatched.filter((a) => a.kategoriAhi === 4).length;
      const ahiTotal = ahiAnomaliesMatched.length;
      const ceOpenOnThisRuas = ceLineItemsOnThisRuas.filter((i) => extractCircuitSuffix(i.bay) === circuit).length;

      const ahi = ahiCritical * 100 + ahiPoor * 10;
      const ce = ceOpenOnThisRuas * 10;
      const renus = renusOverdue * 10;
      const gangguan = gangguanTotal;
      const riskScore = ahi + ce + gangguan + renus;

      rows.push({
        section: ruas.section,
        circuit,
        unit: ruas.unit,
        originGi: ruas.originLabel,
        farEndGi: ruas.farEndLabel,
        ahiCritical,
        ahiPoor,
        ahiTotal,
        ceOpenOnThisRuas,
        ceOpenAtEndpointGis,
        gangguanTotal,
        renusOverdue,
        renusTotal,
        riskScore,
        riskComponents: { ahi, ce, gangguan, renus },
        riskScore100: 0, // filled below once the max across all rows is known
      });
    }
  }

  const maxScore = Math.max(0, ...rows.map((r) => r.riskScore));
  for (const row of rows) {
    row.riskScore100 = maxScore > 0 ? Math.round((row.riskScore / maxScore) * 1000) / 10 : 0;
  }
  return rows.sort((a, b) => b.riskScore - a.riskScore);
}

export { KLASIFIKASI_SEVERITY, KATEGORI_TO_KLASIFIKASI };
