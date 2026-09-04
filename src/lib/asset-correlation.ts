import type { AhiAnomalyRecord, DisturbanceBayCount } from "@/types";

export interface GiCorrelationRow {
  gi: string;
  gangguanTrafo: number;
  gangguanTransmisi: number;
  gangguanTotal: number;
  ahiCritical: number;
  ahiPoor: number;
  ahiTotal: number;
}

function stripTrailingCircuitNumber(text: string): string {
  return text.replace(/\s*\d+\s*$/, "").trim();
}

// Trafo bay names are long descriptive strings that name exactly one GI
// ("TD 1 150/20 KV GIS <GI> (NEW)") — a substring match is safe as long as
// it resolves to exactly one distinct GI; more than one hit means the name
// doesn't cleanly identify a single GI, so it's skipped rather than guessed.
function matchSingleGi(bay: string, giList: string[]): string | null {
  const bayUpper = bay.toUpperCase();
  const hits = giList.filter((gi) => bayUpper.includes(gi.toUpperCase()));
  return hits.length === 1 ? hits[0] : null;
}

function matchExactGi(text: string, giSet: Set<string>): string | null {
  const upper = text.trim().toUpperCase();
  for (const gi of giSet) {
    if (gi.toUpperCase() === upper) return gi;
  }
  return null;
}

/**
 * Joins Gangguan (per-bay disturbance counts) with AHI (per-GI anomaly
 * records) by GI name — the only key the two sources share; there is no
 * asset ID common to both.
 *
 * Gangguan Trafo bay names identify a single GI directly and are matched
 * 1:1. Gangguan Transmisi bay names identify a *line* between two GIs
 * ("<GI-A> - <GI-B> <circuit>") — the source data does not say which end
 * actually faulted. Per an explicit product decision (the source genuinely
 * can't distinguish the two sides), each Transmisi disturbance is counted
 * toward BOTH endpoints rather than guessed at one — this is why the
 * "Gangguan" column is worded "melibatkan GI ini", not "disebabkan oleh".
 *
 * A bay name that can't be resolved to exactly one (Trafo) or exactly two
 * (Transmisi) known GI is left out of the tally entirely rather than
 * force-matched — better an incomplete correlation than a wrong one.
 */
export function buildGiCorrelation(params: {
  trafoBays: DisturbanceBayCount[];
  transmisiBays: DisturbanceBayCount[];
  anomalies: AhiAnomalyRecord[];
}): GiCorrelationRow[] {
  const { trafoBays, transmisiBays, anomalies } = params;

  const giSet = new Set(anomalies.map((a) => a.gi).filter(Boolean));
  const giList = [...giSet];
  const rows = new Map<string, GiCorrelationRow>();

  function ensure(gi: string): GiCorrelationRow {
    let row = rows.get(gi);
    if (!row) {
      row = { gi, gangguanTrafo: 0, gangguanTransmisi: 0, gangguanTotal: 0, ahiCritical: 0, ahiPoor: 0, ahiTotal: 0 };
      rows.set(gi, row);
    }
    return row;
  }

  for (const { bay, count } of trafoBays) {
    const gi = matchSingleGi(bay, giList);
    if (!gi) continue;
    const row = ensure(gi);
    row.gangguanTrafo += count;
    row.gangguanTotal += count;
  }

  for (const { bay, count } of transmisiBays) {
    const parts = bay.split(" - ");
    if (parts.length !== 2) continue;
    const giA = matchExactGi(parts[0], giSet);
    const giB = matchExactGi(stripTrailingCircuitNumber(parts[1]), giSet);
    if (!giA || !giB) continue;
    for (const gi of new Set([giA, giB])) {
      const row = ensure(gi);
      row.gangguanTransmisi += count;
      row.gangguanTotal += count;
    }
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
