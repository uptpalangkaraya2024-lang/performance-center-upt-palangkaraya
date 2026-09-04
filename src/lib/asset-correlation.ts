import type { AhiAnomalyRecord, DisturbanceGiCount } from "@/types";

export interface GiCorrelationRow {
  gi: string;
  gangguanTrafo: number;
  gangguanTransmisi: number;
  gangguanTotal: number;
  ahiCritical: number;
  ahiPoor: number;
  ahiTotal: number;
}

/**
 * Joins Gangguan (per-GI disturbance counts) with AHI (per-GI anomaly
 * records) by GI name — the only key the two sources share; there is no
 * asset ID common to both.
 *
 * Both sides are exact, 1:1 attributions straight from their own source
 * column — Gangguan's `giBreakdown` comes from the sheet's own GARDU INDUK
 * column (see src/services/disturbances.ts), which names a single GI even
 * for a Transmisi/line disturbance, so no bay-name parsing or "which side
 * faulted" guessing is needed here anymore.
 */
export function buildGiCorrelation(params: {
  trafoGi: DisturbanceGiCount[];
  transmisiGi: DisturbanceGiCount[];
  anomalies: AhiAnomalyRecord[];
}): GiCorrelationRow[] {
  const { trafoGi, transmisiGi, anomalies } = params;
  const rows = new Map<string, GiCorrelationRow>();

  function ensure(gi: string): GiCorrelationRow {
    let row = rows.get(gi);
    if (!row) {
      row = { gi, gangguanTrafo: 0, gangguanTransmisi: 0, gangguanTotal: 0, ahiCritical: 0, ahiPoor: 0, ahiTotal: 0 };
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

  return [...rows.values()].sort((a, b) => {
    const aScore = a.ahiCritical * 100 + a.ahiPoor * 10 + a.gangguanTotal;
    const bScore = b.ahiCritical * 100 + b.ahiPoor * 10 + b.gangguanTotal;
    return bScore - aScore;
  });
}
