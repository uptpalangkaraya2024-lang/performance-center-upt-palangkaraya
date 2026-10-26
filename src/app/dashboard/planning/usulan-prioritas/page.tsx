import { Card, CardContent } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { UsulanPrioritasClient } from "@/components/assets/usulan-prioritas-client";
import { buildGiCorrelation } from "@/lib/asset-correlation";
import { buildMaintenanceProposals } from "@/lib/maintenance-proposals";
import { findAhiDegradationAlerts } from "@/lib/ahi-degradation";
import { buildAhiTrendProjections } from "@/lib/ahi-trend-projection";
import { getDisturbances } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReportsWithHistory } from "@/services/ahi-bay-line-report";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getRenusData } from "@/services/renus";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function UsulanPrioritasPage() {
  const [disturbances, ahi, bayLineReports, ce, renus] = await Promise.all([
    getDisturbances(),
    getAhiPerformance(),
    getAllBayLineReportsWithHistory(),
    getCeSnapshot(),
    getRenusData(),
  ]);

  if (disturbances.error || !ahi.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="Usulan Prioritas Pemeliharaan"
          description="Skor risiko per GI (AHI, CE, gangguan, RENUS) diolah menjadi usulan prioritas pemeliharaan/penggantian untuk perencanaan tahun depan."
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Data Gangguan atau AHI belum tersedia. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const giCorrelation = buildGiCorrelation({
    trafoGi: [...disturbances.trafoHv.giBreakdown, ...disturbances.trafoLv.giBreakdown],
    transmisiGi: disturbances.transmisi.giBreakdown,
    anomalies: ahi.data.anomalies,
    ceItems: ce.error ? [] : ce.items,
    renusRows: renus.error ? [] : renus.rows,
  });

  const degradationAlerts = findAhiDegradationAlerts(bayLineReports);
  const trendProjections = buildAhiTrendProjections(bayLineReports);

  const proposals = buildMaintenanceProposals({
    giCorrelation,
    bayLineReports,
    degradationAlerts,
    trendProjections,
    renusRows: renus.error ? [] : renus.rows,
    disturbanceEvents: [...disturbances.transmisi.bayEvents, ...disturbances.trafoHv.bayEvents, ...disturbances.trafoLv.bayEvents],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Usulan Prioritas Pemeliharaan"
        description="Skor risiko per GI (AHI, CE, gangguan, RENUS) diolah menjadi usulan prioritas pemeliharaan/penggantian untuk perencanaan tahun depan, lengkap dengan alasannya."
      />
      <UsulanPrioritasClient proposals={proposals} />
    </div>
  );
}
