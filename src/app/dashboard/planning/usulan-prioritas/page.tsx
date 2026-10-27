import { Card, CardContent } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { UsulanPrioritasClient } from "@/components/assets/usulan-prioritas-client";
import { buildRuasCorrelation } from "@/lib/ruas-correlation";
import { buildRuasMaintenanceProposals } from "@/lib/ruas-maintenance-proposals";
import { findAhiDegradationAlerts } from "@/lib/ahi-degradation";
import { buildAhiTrendProjections } from "@/lib/ahi-trend-projection";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReportsWithHistory } from "@/services/ahi-bay-line-report";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getRenusData } from "@/services/renus";
import { getSuttSnapshot } from "@/services/sutt-asset";
import { getGangguanHistoryByTowerGi } from "@/services/gangguan-history";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function UsulanPrioritasPage() {
  const [ahi, bayLineReports, ce, renus, sutt, gangguanByTowerGi] = await Promise.all([
    getAhiPerformance(),
    getAllBayLineReportsWithHistory(),
    getCeSnapshot(),
    getRenusData(),
    getSuttSnapshot(),
    getGangguanHistoryByTowerGi(),
  ]);

  if (!ahi.data || sutt.error || sutt.ruasList.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="Usulan Prioritas Pemeliharaan"
          description="Skor risiko per RUAS (AHI, CE, gangguan, RENUS) diolah menjadi usulan prioritas pemeliharaan/penggantian untuk perencanaan tahun depan."
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Data Aset SUTT atau AHI belum tersedia. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const ceItems = ce.error ? [] : ce.items;
  const renusRows = renus.error ? [] : renus.rows;

  // Risk is scored per RUAS now, not per GI — per user feedback: a GI can
  // touch several physical ruas, and an anomaly on one of them doesn't
  // mean the whole substation needs replacing. See ruas-correlation.ts's
  // own header comment for exactly how each source (AHI/Gangguan/RENUS/
  // CE) gets attributed to a specific ruas, and CE's own GI-only
  // limitation.
  const ruasCorrelation = buildRuasCorrelation({
    ruasList: sutt.ruasList,
    ahiAnomalies: ahi.data.anomalies,
    ahiBayLineReports: bayLineReports,
    ceItems,
    renusRows,
    gangguanByTowerGi,
    todayISO: renus.today,
  });

  const degradationAlerts = findAhiDegradationAlerts(bayLineReports);
  const trendProjections = buildAhiTrendProjections(bayLineReports);

  const proposals = buildRuasMaintenanceProposals({
    ruasCorrelation,
    ruasList: sutt.ruasList,
    bayLineReports,
    degradationAlerts,
    trendProjections,
    gangguanByTowerGi,
    renusRows,
    ceItems,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Usulan Prioritas Pemeliharaan"
        description="Skor risiko per RUAS/sirkit (AHI, CE, gangguan, RENUS) diolah menjadi usulan prioritas pemeliharaan/penggantian untuk perencanaan tahun depan, lengkap dengan alasannya."
      />
      <UsulanPrioritasClient proposals={proposals} />
    </div>
  );
}
