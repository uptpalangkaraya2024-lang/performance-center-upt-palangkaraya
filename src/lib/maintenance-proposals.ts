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
import type { GiCorrelationRow } from "@/lib/asset-correlation";
import { canonicalGiKey } from "@/lib/gi-name";
import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";
import type { AhiDegradationAlert } from "@/lib/ahi-degradation";
import type { AhiTrendProjection } from "@/lib/ahi-trend-projection";
import type { BayLineReport, DisturbanceBayEventRecord, RenusRow } from "@/types";

// A projection landing within this window is worth calling out as its own
// proposal reason (and worth bumping the action to Penggantian) — beyond
// this, it's still visible on the AHI page but not treated as urgent
// enough to drive next year's priority ranking on its own.
const NEAR_TERM_PROJECTION_DAYS = 365;

export type ProposalAction = "Penggantian" | "Pemeliharaan Prioritas" | "Monitor";

/** A specific, actionable next step — distinct from `action` above (which
 *  is only a coarse 3-level urgency bucket kept for existing callers/UI).
 *  Derived from whichever risk component actually dominates this GI's own
 *  score (see GiCorrelationRow.riskComponents), so two GIs both flagged
 *  "Penggantian" at the action level can still get different, specific
 *  recommendations here — one driven by AHI Critical really does need
 *  equipment replaced, one driven mostly by vegetation-caused gangguan
 *  needs ROW handling instead, even if their coarse urgency matches. */
export type ProposalRecommendation =
  | "Penggantian Peralatan"
  | "Pengujian Ulang"
  | "Perbaikan Temuan CE"
  | "Penanganan ROW/Vegetasi"
  | "Investigasi Penyebab Gangguan"
  | "Percepat RENUS Tertunda"
  | "Monitor";

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
  /** 0-100, relative to the highest riskScore in this same result set —
   *  see GiCorrelationRow.riskScore100 for what this scale does and
   *  doesn't mean. */
  riskScore100: number;
  riskComponents: { ahi: number; ce: number; gangguan: number; renus: number };
  action: ProposalAction;
  recommendation: ProposalRecommendation;
  reasons: string[];
  equipmentFlags: EquipmentFlag[];
  ahiCritical: number;
  ahiPoor: number;
  ceOpen: number;
  gangguanTotal: number;
  /** Of gangguanTotal, how many were vegetation-caused ("Tegakan / Pohon")
   *  — only populated when disturbanceEvents is passed to
   *  buildMaintenanceProposals; 0 otherwise, same as any other count would
   *  be for data that wasn't supplied. Drives the "Penanganan ROW/
   *  Vegetasi" recommendation specifically, rather than a generic
   *  "something's causing gangguan here." */
  gangguanVegetasi: number;
  renusOverdue: number;
  degradingCount: number;
  nearTermProjections: AhiTrendProjection[];
  /** True when this GI already has an active (not done, not cancelled)
   *  RENUS entry — surfaces the gap between "this GI should be planned"
   *  (this proposal) and "this GI IS actually planned" (RENUS), per user
   *  request. False doesn't mean nothing was ever planned, only that
   *  nothing is CURRENTLY open for it. */
  hasActiveRenusPlan: boolean;
}

function giMatches(a: string, b: string): boolean {
  return canonicalGiKey(a) === canonicalGiKey(b);
}

/** One proposal per GI with a non-zero risk score (a clean GI has nothing
 *  to propose) — sorted worst-first, same ranking buildGiCorrelation
 *  already uses for its own homepage table, so a GI's position here always
 *  matches its position there. */
export function buildMaintenanceProposals(params: {
  giCorrelation: GiCorrelationRow[];
  bayLineReports: BayLineReport[];
  degradationAlerts: AhiDegradationAlert[];
  trendProjections: AhiTrendProjection[];
  renusRows: RenusRow[];
  /** Optional — when supplied, enables the vegetation-specific
   *  "Penanganan ROW/Vegetasi" recommendation (see gangguanVegetasi on
   *  MaintenanceProposal). Every existing caller still works without it,
   *  just with a coarser "Investigasi Penyebab Gangguan" recommendation
   *  wherever gangguan happens to be the dominant risk component. */
  disturbanceEvents?: DisturbanceBayEventRecord[];
}): MaintenanceProposal[] {
  const { giCorrelation, bayLineReports, degradationAlerts, trendProjections, renusRows, disturbanceEvents } = params;

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
    const nearTermProjections = trendProjections.filter(
      (p) => giMatches(p.gi, row.gi) && p.daysUntilCritical <= NEAR_TERM_PROJECTION_DAYS,
    );
    const hasActiveRenusPlan = renusRows.some(
      (r) => r.gi && giMatches(r.gi, row.gi) && !isRenusCancelled(r) && !isRenusDone(r),
    );

    const reasons: string[] = [];
    if (row.ahiCritical > 0) reasons.push(`${row.ahiCritical} temuan AHI berklasifikasi Critical.`);
    if (row.ahiPoor > 0) reasons.push(`${row.ahiPoor} temuan AHI berklasifikasi Poor.`);
    if (row.ceOpen > 0) reasons.push(`${row.ceOpen} temuan Common Enemy masih OPEN.`);
    if (row.renusOverdue > 0) reasons.push(`${row.renusOverdue} pekerjaan RENUS melewati tanggal rencana.`);
    if (row.gangguanTotal > 0) reasons.push(`${row.gangguanTotal} kejadian gangguan tercatat (trafo + transmisi).`);
    if (degrading.length > 0) {
      reasons.push(`${degrading.length} peralatan dengan tren hasil uji memburuk pada 2-3 pengujian terakhir.`);
    }
    if (nearTermProjections.length > 0) {
      const soonest = nearTermProjections[0];
      const basis = soonest.pointCount <= 2 ? "hanya 2 titik data, proyeksi kasar" : `${soonest.pointCount} titik data`;
      reasons.push(
        `${nearTermProjections.length} peralatan diproyeksikan mencapai Critical dalam ~${Math.round(soonest.daysUntilCritical / 30)} bulan berdasarkan tren linear (${basis}, bukan kepastian).`,
      );
    }

    const hasCriticalDegradation = degrading.some((d) => d.trend[d.trend.length - 1]?.klasifikasi === "CRITICAL");
    const action: ProposalAction =
      row.ahiCritical > 0 || hasCriticalDegradation || nearTermProjections.length > 0
        ? "Penggantian"
        : row.ahiPoor > 0 || row.ceOpen > 0 || row.renusOverdue > 0 || degrading.length > 0
          ? "Pemeliharaan Prioritas"
          : "Monitor";

    const gangguanVegetasi = disturbanceEvents
      ? disturbanceEvents.filter((e) => giMatches(e.gi ?? "", row.gi) && e.cause === "Tegakan / Pohon").length
      : 0;

    // Which risk component actually dominates THIS GI's own score (see
    // GiCorrelationRow.riskComponents) — picks a specific recommendation
    // instead of the same generic "do maintenance" text for every
    // proposal, per the user's own request (ganti/perbaiki/uji ulang/
    // penanganan ROW, not one uniform label). Ties resolve in this fixed
    // order (ahi > ce > gangguan > renus), the same priority the urgency
    // levels above already imply.
    const { ahi, ce, gangguan, renus } = row.riskComponents;
    const dominant = Math.max(ahi, ce, gangguan, renus);
    let recommendation: ProposalRecommendation = "Monitor";
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
      gi: row.gi,
      riskScore: row.riskScore,
      riskScore100: row.riskScore100,
      riskComponents: row.riskComponents,
      action,
      recommendation,
      reasons,
      equipmentFlags,
      ahiCritical: row.ahiCritical,
      ahiPoor: row.ahiPoor,
      ceOpen: row.ceOpen,
      gangguanTotal: row.gangguanTotal,
      gangguanVegetasi,
      renusOverdue: row.renusOverdue,
      degradingCount: degrading.length,
      nearTermProjections,
      hasActiveRenusPlan,
    });
  }

  return proposals.sort((a, b) => b.riskScore - a.riskScore);
}
