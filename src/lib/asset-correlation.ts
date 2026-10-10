import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";
import type { AhiAnomalyRecord, CeItem, DisturbanceGiCount, RenusRow } from "@/types";

export interface GiCorrelationRow {
  gi: string;
  gangguanTrafo: number;
  gangguanTransmisi: number;
  gangguanTotal: number;
  ahiCritical: number;
  ahiPoor: number;
  ahiTotal: number;
  /** CE (Common Enemy) findings still Open for this GI. */
  ceOpen: number;
  ceTotal: number;
  /** RENUS work orders past their own rencana date for this GI, not
   *  scoped to any period — see buildRenusUltgResume's own comment for
   *  why "overdue" is always all-time, not just the current week/month. */
  renusOverdue: number;
  renusTotal: number;
  /** ahiCritical×100 + (ahiPoor + ceOpen + renusOverdue)×10 + gangguanTotal —
   *  AHI Critical weighted heaviest since it's the most direct asset-failure
   *  signal, Poor/CE-open/RENUS-overdue weighted equally as "needs real
   *  follow-up soon" signals, gangguan counted at face value. Not a
   *  statistically fitted model — a transparent, explainable scoring rule
   *  in the same spirit as the one this replaces (same weights the
   *  AHI+Gangguan-only version already used, extended rather than
   *  redesigned), so a GI's position in the ranking is always traceable
   *  back to its own raw counts. */
  riskScore: number;
}

// CE's own "gardu" column reads e.g. "GI BAGENDANG" / "GIS MINTIN" (no
// voltage number), RENUS's own "gi" column reads e.g. "GI 150 KV
// PALANGKARAYA" (with one) — confirmed live, two different prefix shapes
// from two different sheets. One regex handles both: an optional "<n> KV"
// group between the GI(S) prefix and the bare name. AHI/Disturbances
// already hand buildGiCorrelation pre-normalized bare names from their own
// services, so this is only applied to CE/RENUS's own raw fields here.
export function normalizeGiName(raw: string): string {
  return raw.replace(/^GIS?\s*(\d+\s*KV\s*)?/i, "").trim();
}

/**
 * Joins Gangguan (per-GI disturbance counts), AHI (per-GI anomaly records),
 * CE (per-GI Common Enemy findings), and RENUS (per-GI maintenance work
 * orders) by GI name into one per-GI risk view — the finer-grained,
 * actionable counterpart to the per-ULTG attention rollup (3 buckets is too
 * coarse to say "go check this GI"; this says exactly which one).
 *
 * Data Aset's own anomali sheet is deliberately NOT joined in here —
 * confirmed live its own "bayGi" field is a mix of genuine GI names
 * ("GI MUARA TEWEH") and bay/line-segment names ("SAMPIT - PANGKALAN
 * BANTENG", which touches two GIs at once), too heterogeneous to attribute
 * to a single GI without guessing which end a cross-GI line segment
 * belongs to.
 */
export function buildGiCorrelation(params: {
  trafoGi: DisturbanceGiCount[];
  transmisiGi: DisturbanceGiCount[];
  anomalies: AhiAnomalyRecord[];
  ceItems: CeItem[];
  renusRows: RenusRow[];
}): GiCorrelationRow[] {
  const { trafoGi, transmisiGi, anomalies, ceItems, renusRows } = params;
  const rows = new Map<string, GiCorrelationRow>();

  function ensure(gi: string): GiCorrelationRow {
    let row = rows.get(gi);
    if (!row) {
      row = {
        gi,
        gangguanTrafo: 0,
        gangguanTransmisi: 0,
        gangguanTotal: 0,
        ahiCritical: 0,
        ahiPoor: 0,
        ahiTotal: 0,
        ceOpen: 0,
        ceTotal: 0,
        renusOverdue: 0,
        renusTotal: 0,
        riskScore: 0,
      };
      rows.set(gi, row);
    }
    return row;
  }

  for (const { gi, count } of trafoGi) {
    const row = ensure(gi);
    row.gangguanTrafo += count;
    row.gangguanTotal += count;
  }
  for (const { gi, count } of transmisiGi) {
    const row = ensure(gi);
    row.gangguanTransmisi += count;
    row.gangguanTotal += count;
  }

  for (const anomaly of anomalies) {
    if (!anomaly.gi) continue;
    const row = ensure(anomaly.gi);
    row.ahiTotal += 1;
    if (anomaly.kategoriAhi === 5) row.ahiCritical += 1;
    else if (anomaly.kategoriAhi === 4) row.ahiPoor += 1;
  }

  for (const item of ceItems) {
    if (!item.gardu) continue;
    const row = ensure(normalizeGiName(item.gardu));
    row.ceTotal += 1;
    if (!item.done) row.ceOpen += 1;
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  for (const r of renusRows) {
    if (!r.gi) continue;
    const row = ensure(normalizeGiName(r.gi));
    row.renusTotal += 1;
    if (!isRenusDone(r) && !isRenusCancelled(r) && r.rencanaDate < today) row.renusOverdue += 1;
  }

  const result = [...rows.values()];
  for (const row of result) {
    row.riskScore = row.ahiCritical * 100 + (row.ahiPoor + row.ceOpen + row.renusOverdue) * 10 + row.gangguanTotal;
  }
  return result.sort((a, b) => b.riskScore - a.riskScore);
}
