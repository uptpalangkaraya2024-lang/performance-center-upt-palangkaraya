// Risk-based maintenance/replacement proposals (features #6 + #9 merged) —
// turns the existing per-GI risk join (buildGiCorrelation) plus AHI's own
// equipment-level condition and degradation trend into a reasoned,
// human-reviewable priority list for next year's maintenance/replacement
// budget planning. Every reason is a plain count pulled straight from
// already-computed data — never a fabricated or statistically fitted
// judgment — so each proposal stays traceable back to the raw numbers
// behind it, same principle as GiCorrelationRow's own riskScore.
//
// Deliberately framed as a SUGGESTION for engineering review, never an
// automated decision — the UI layer carries that framing explicitly, this
// module only computes what the data actually shows.
import { normalizeGiName } from "@/lib/asset-correlation";
import type { GiCorrelationRow } from "@/lib/asset-correlation";
import type { AhiDegradationAlert } from "@/lib/ahi-degradation";
import type { BayLineReport } from "@/types";

export type ProposalAction = "Penggantian" | "Pemeliharaan Prioritas" | "Monitor";

export interface EquipmentFlag {
  role: string;
  techident: string | null;
  merk: string | null;
  klasifikasi: string;
  bay: string;
}

export interface MaintenanceProposal {
  gi: string;
  riskScore: number;
  action: ProposalAction;
  reasons: string[];
  equipmentFlags: EquipmentFlag[];
  ahiCritical: number;
  ahiPoor: number;
  ceOpen: number;
  gangguanTotal: number;
  renusOverdue: number;
  degradingCount: number;
}

function giMatches(a: string, b: string): boolean {
  return normalizeGiName(a).trim().toUpperCase() === normalizeGiName(b).trim().toUpperCase();
}

/** One proposal per GI with a non-zero risk score (a clean GI has nothing
 *  to propose) — sorted worst-first, same ranking buildGiCorrelation
 *  already uses for its own homepage table, so a GI's position here always
 *  matches its position there. */
export function buildMaintenanceProposals(params: {
  giCorrelation: GiCorrelationRow[];
  bayLineReports: BayLineReport[];
  degradationAlerts: AhiDegradationAlert[];
}): MaintenanceProposal[] {
  const { giCorrelation, bayLineReports, degradationAlerts } = params;

  const proposals: MaintenanceProposal[] = [];
  for (const row of giCorrelation) {
    if (row.riskScore <= 0) continue;

    const equipmentFlags: EquipmentFlag[] = [];
    for (const report of bayLineReports) {
      if (!giMatches(report.gi, row.gi)) continue;
      for (const unit of report.units) {
        if (unit.klasifikasi === "POOR" || unit.klasifikasi === "CRITICAL") {
          equipmentFlags.push({ role: unit.role, techident: unit.techident, merk: unit.merk, klasifikasi: unit.klasifikasi, bay: report.bay });
        }
      }
    }

    const degrading = degradationAlerts.filter((a) => giMatches(a.gi, row.gi));

    const reasons: string[] = [];
    if (row.ahiCritical > 0) reasons.push(`${row.ahiCritical} temuan AHI berklasifikasi Critical.`);
    if (row.ahiPoor > 0) reasons.push(`${row.ahiPoor} temuan AHI berklasifikasi Poor.`);
    if (row.ceOpen > 0) reasons.push(`${row.ceOpen} temuan Common Enemy masih OPEN.`);
    if (row.renusOverdue > 0) reasons.push(`${row.renusOverdue} pekerjaan RENUS melewati tanggal rencana.`);
    if (row.gangguanTotal > 0) reasons.push(`${row.gangguanTotal} kejadian gangguan tercatat (trafo + transmisi).`);
    if (degrading.length > 0) {
      reasons.push(`${degrading.length} peralatan dengan tren hasil uji memburuk pada 2-3 pengujian terakhir.`);
    }

    const hasCriticalDegradation = degrading.some((d) => d.trend[d.trend.length - 1]?.klasifikasi === "CRITICAL");
    const action: ProposalAction =
      row.ahiCritical > 0 || hasCriticalDegradation
        ? "Penggantian"
        : row.ahiPoor > 0 || row.ceOpen > 0 || row.renusOverdue > 0 || degrading.length > 0
          ? "Pemeliharaan Prioritas"
          : "Monitor";

    proposals.push({
      gi: row.gi,
      riskScore: row.riskScore,
      action,
      reasons,
      equipmentFlags,
      ahiCritical: row.ahiCritical,
      ahiPoor: row.ahiPoor,
      ceOpen: row.ceOpen,
      gangguanTotal: row.gangguanTotal,
      renusOverdue: row.renusOverdue,
      degradingCount: degrading.length,
    });
  }

  return proposals.sort((a, b) => b.riskScore - a.riskScore);
}
