// Ruas-level maintenance/replacement proposals — the user's own explicit
// objection to the GI-level version (src/lib/maintenance-proposals.ts):
// a GI can touch several physical ruas, and an AHI/gangguan anomaly on
// ONE of them doesn't mean the whole substation needs replacing. Mirrors
// maintenance-proposals.ts's own reasoning/recommendation shape exactly
// (same action/recommendation rules, same riskScore100 traceability),
// just built on RuasCorrelationRow instead of GiCorrelationRow, and
// matching AHI degradation/projection data by BAY LINE (circuit-aware)
// instead of by GI.
import { renusGiPairKey, type RuasCorrelationRow } from "@/lib/ruas-correlation";
import { giTowerKey } from "@/lib/gi-name";
import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";
import type { AhiDegradationAlert } from "@/lib/ahi-degradation";
import type { AhiTrendProjection } from "@/lib/ahi-trend-projection";
import type { BayLineReport, GangguanHistoryEntry, RenusRow, SuttRuas } from "@/types";

const NEAR_TERM_PROJECTION_DAYS = 365;

export type RuasProposalAction = "Penggantian" | "Pemeliharaan Prioritas" | "Monitor";
export type RuasProposalRecommendation =
  | "Penggantian Peralatan"
  | "Pengujian Ulang"
  | "Perbaikan Temuan CE"
  | "Penanganan ROW/Vegetasi"
  | "Investigasi Penyebab Gangguan"
  | "Percepat RENUS Tertunda"
  | "Monitor";

export interface RuasEquipmentFlag {
  role: string;
  techident: string | null;
  merk: string | null;
  klasifikasi: string;
  bay: string;
}

export interface RuasMaintenanceProposal {
  section: string;
  circuit: string | null;
  originGi: string;
  farEndGi: string;
  unit: string;
  riskScore: number;
  riskScore100: number;
  riskComponents: { ahi: number; ce: number; gangguan: number; renus: number };
  action: RuasProposalAction;
  recommendation: RuasProposalRecommendation;
  reasons: string[];
  equipmentFlags: RuasEquipmentFlag[];
  ahiCritical: number;
  ahiPoor: number;
  /** GI-level context (see ruas-correlation.ts's own header comment on
   *  why CE can't be attributed to one ruas) — shown, never folded
   *  silently as if it were ruas-specific. */
  ceOpenAtEndpointGis: number;
  gangguanTotal: number;
  gangguanVegetasi: number;
  renusOverdue: number;
  renusTotal: number;
  degradingCount: number;
  nearTermProjections: AhiTrendProjection[];
  /** True when this ruas already has an active (not done, not cancelled)
   *  RENUS entry matched to it — see ruas-correlation.ts's own
   *  renusGiPairKey for how a RENUS row gets attributed to a ruas (its
   *  own SECTION TRANSMISI/SPAN TOWER columns, Transmisi-category work
   *  only). False doesn't mean nothing was ever planned, only that
   *  nothing is CURRENTLY open and matched to this specific ruas. */
  hasActiveRenusPlan: boolean;
}

function giTokenSet(s: string): string {
  return [
    ...new Set(
      s
        .toUpperCase()
        .replace(/\b\d+(\s*\/\s*\d+)?\s*KV\b/g, " ")
        .replace(/\bGIS?\b/g, " ")
        .replace(/\bPLTU\b/g, " ")
        .split(/[^A-Z]+/)
        .filter((t) => t.length > 1),
    ),
  ]
    .sort()
    .join("|");
}
function lineGiPairKey(raw: string): string | null {
  const afterPrefix = raw.replace(/^BAY\s+LINE\s+/i, "");
  const withoutNumber = afterPrefix.replace(/[\s#]\d+\s*$/, "");
  const sides = withoutNumber.split(/\s*-\s*/).map(giTokenSet);
  if (sides.length !== 2 || sides.some((s) => !s)) return null;
  return [...sides].sort().join("||");
}
function extractCircuitSuffix(raw: string): string | null {
  const afterPrefix = raw.replace(/^BAY\s+LINE\s+/i, "");
  const m = /[\s#](\d+)\s*$/.exec(afterPrefix);
  return m ? m[1] : null;
}

/** One proposal per (ruas, circuit) with a non-zero risk score — sorted
 *  worst-first, matching buildRuasCorrelation's own ranking so a row's
 *  position here always matches its position on the Infografis Ruas
 *  circuit cards. */
export function buildRuasMaintenanceProposals(params: {
  ruasCorrelation: RuasCorrelationRow[];
  ruasList: SuttRuas[];
  bayLineReports: BayLineReport[];
  degradationAlerts: AhiDegradationAlert[];
  trendProjections: AhiTrendProjection[];
  /** Same tower-keyed gangguan history buildRuasCorrelation's own
   *  gangguanTotal is built from — reused here (not the GI-level
   *  DisturbanceBayEventRecord list) so "vegetation-caused" is counted
   *  from the exact same tower-precise events as the total it's a
   *  fraction of, not a differently-scoped data source. */
  gangguanByTowerGi: Record<string, GangguanHistoryEntry[]>;
  renusRows: RenusRow[];
}): RuasMaintenanceProposal[] {
  const { ruasCorrelation, ruasList, bayLineReports, degradationAlerts, trendProjections, gangguanByTowerGi, renusRows } = params;
  const ruasBySection = new Map(ruasList.map((r) => [r.section, r]));

  const proposals: RuasMaintenanceProposal[] = [];
  for (const row of ruasCorrelation) {
    if (row.riskScore <= 0) continue;
    const ruas = ruasBySection.get(row.section);
    const ruasGiKey = [giTokenSet(row.originGi.toUpperCase()), giTokenSet(row.farEndGi.toUpperCase())].sort().join("||");
    const matchesThisCircuit = (bay: string) => lineGiPairKey(bay) === ruasGiKey && extractCircuitSuffix(bay) === row.circuit;

    const equipmentFlags: RuasEquipmentFlag[] = [];
    for (const report of bayLineReports) {
      if (!matchesThisCircuit(report.bay)) continue;
      for (const unit of report.units) {
        if (unit.klasifikasi === "POOR" || unit.klasifikasi === "CRITICAL") {
          equipmentFlags.push({ role: unit.role, techident: unit.techident, merk: unit.merk, klasifikasi: unit.klasifikasi, bay: report.bay });
        }
      }
    }

    const degrading = degradationAlerts.filter((a) => matchesThisCircuit(a.bay));
    const nearTermProjections = trendProjections.filter((p) => matchesThisCircuit(p.bay) && p.daysUntilCritical <= NEAR_TERM_PROJECTION_DAYS);

    const reasons: string[] = [];
    if (row.ahiCritical > 0) reasons.push(`${row.ahiCritical} temuan AHI berklasifikasi Critical.`);
    if (row.ahiPoor > 0) reasons.push(`${row.ahiPoor} temuan AHI berklasifikasi Poor.`);
    if (row.ceOpenAtEndpointGis > 0) {
      reasons.push(`${row.ceOpenAtEndpointGis} temuan Common Enemy masih OPEN di GI ${row.originGi}/${row.farEndGi} (level GI, bukan khusus ruas ini).`);
    }
    if (row.renusOverdue > 0) reasons.push(`${row.renusOverdue} pekerjaan RENUS di ruas ini melewati tanggal rencana.`);
    if (row.gangguanTotal > 0) reasons.push(`${row.gangguanTotal} kejadian gangguan tercatat di tower-tower ruas ini.`);
    if (degrading.length > 0) reasons.push(`${degrading.length} peralatan dengan tren hasil uji memburuk pada 2-3 pengujian terakhir.`);
    if (nearTermProjections.length > 0) {
      const soonest = nearTermProjections[0];
      const basis = soonest.pointCount <= 2 ? "hanya 2 titik data, proyeksi kasar" : `${soonest.pointCount} titik data`;
      reasons.push(
        `${nearTermProjections.length} peralatan diproyeksikan mencapai Critical dalam ~${Math.round(soonest.daysUntilCritical / 30)} bulan berdasarkan tren linear (${basis}, bukan kepastian).`,
      );
    }

    const hasCriticalDegradation = degrading.some((d) => d.trend[d.trend.length - 1]?.klasifikasi === "CRITICAL");
    const action: RuasProposalAction =
      row.ahiCritical > 0 || hasCriticalDegradation || nearTermProjections.length > 0
        ? "Penggantian"
        : row.ahiPoor > 0 || row.ceOpenAtEndpointGis > 0 || row.renusOverdue > 0 || degrading.length > 0
          ? "Pemeliharaan Prioritas"
          : "Monitor";

    // Tower-precise (not GI-level) — sums the same per-tower gangguan
    // history gangguanTotal itself was built from, filtered to raw
    // PENYEBAB "TEGAKAN" (the sheet's own value — gangguan-history.ts
    // reads it unmapped, so the user-facing "Tegakan / Pohon" label from
    // disturbances.ts's own CAUSE_LABEL map doesn't apply here).
    let gangguanVegetasi = 0;
    if (ruas) {
      for (const tower of ruas.towers) {
        const entries = gangguanByTowerGi[giTowerKey(tower.gi, tower.towerNo)];
        if (entries) gangguanVegetasi += entries.filter((e) => e.penyebab === "TEGAKAN").length;
      }
    }

    const hasActiveRenusPlan = renusRows.some(
      (r) => !isRenusCancelled(r) && !isRenusDone(r) && renusGiPairKey(r) === ruasGiKey,
    );

    const { ahi, ce, gangguan, renus } = row.riskComponents;
    const dominant = Math.max(ahi, ce, gangguan, renus);
    let recommendation: RuasProposalRecommendation = "Monitor";
    if (dominant > 0) {
      if (ahi === dominant) {
        recommendation = row.ahiCritical > 0 || hasCriticalDegradation || nearTermProjections.length > 0 ? "Penggantian Peralatan" : "Pengujian Ulang";
      } else if (ce === dominant) {
        recommendation = "Perbaikan Temuan CE";
      } else if (gangguan === dominant) {
        recommendation = gangguanVegetasi > 0 && gangguanVegetasi >= row.gangguanTotal / 2 ? "Penanganan ROW/Vegetasi" : "Investigasi Penyebab Gangguan";
      } else if (renus === dominant) {
        recommendation = "Percepat RENUS Tertunda";
      }
    }

    proposals.push({
      section: row.section,
      circuit: row.circuit,
      originGi: row.originGi,
      farEndGi: row.farEndGi,
      unit: row.unit,
      riskScore: row.riskScore,
      riskScore100: row.riskScore100,
      riskComponents: row.riskComponents,
      action,
      recommendation,
      reasons,
      equipmentFlags,
      ahiCritical: row.ahiCritical,
      ahiPoor: row.ahiPoor,
      ceOpenAtEndpointGis: row.ceOpenAtEndpointGis,
      gangguanTotal: row.gangguanTotal,
      gangguanVegetasi,
      renusOverdue: row.renusOverdue,
      renusTotal: row.renusTotal,
      hasActiveRenusPlan,
      degradingCount: degrading.length,
      nearTermProjections,
    });
  }

  return proposals.sort((a, b) => b.riskScore - a.riskScore);
}
