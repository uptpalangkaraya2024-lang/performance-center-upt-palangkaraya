import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import { ManagementAttentionList } from "@/components/dashboard/management-attention-list";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { GiCorrelationTable } from "@/components/dashboard/gi-correlation-table";
import { PageHero } from "@/components/dashboard/page-hero";
import { UptPerformanceStatus } from "@/components/dashboard/upt-performance-status";
import { UptGapToTarget } from "@/components/dashboard/upt-gap-to-target";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { getUptPerformance } from "@/services/upt-performance";
import { getDisturbances } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { buildManagementAttention, buildTopIssues } from "@/lib/executive-insights";
import { buildGiCorrelation } from "@/lib/asset-correlation";
import { listSyncStatus } from "@/lib/sync-status";
import type { StatusLevel } from "@/types";

export const dynamic = "force-dynamic";

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

export default async function OverviewPage() {
  const [upt, disturbances, ahi] = await Promise.all([
    getUptPerformance(),
    getDisturbances(),
    getAhiPerformance(),
  ]);

  const uptStatus: StatusLevel = !upt.data
    ? "none"
    : upt.data.overall.critical > 0
      ? "critical"
      : upt.data.overall.warning > 0
        ? "warning"
        : "good";

  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    ahi: ahi.data,
  });
  const topIssues = buildTopIssues({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    ahi: ahi.data,
  });

  const lastSyncOverall = listSyncStatus().reduce<Date | null>(
    (latest, entry) => (entry.lastSync && (!latest || entry.lastSync > latest) ? entry.lastSync : latest),
    null,
  );

  const giCorrelation =
    !disturbances.error && ahi.data
      ? buildGiCorrelation({
          // AHI doesn't distinguish HV vs LV side either, so both trafo
          // sub-categories are combined here for correlation purposes only
          // — buildGiCorrelation sums counts per GI across the array, so
          // concatenating (rather than merging) is enough.
          trafoGi: [...disturbances.trafoHv.giBreakdown, ...disturbances.trafoLv.giBreakdown],
          transmisiGi: disturbances.transmisi.giBreakdown,
          anomalies: ahi.data.anomalies,
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Monitoring Kinerja UPT Palangkaraya"
        description="Executive overview kondisi operasional, kinerja, gangguan, dan asset health UPT Palangkaraya."
        status={
          <>
            <span className="size-1.5 rounded-full bg-success" />
            Data synchronized
            {lastSyncOverall ? ` · Last update: ${formatTime(lastSyncOverall)}` : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {upt.data ? (
          <UptPerformanceStatus
            overall={upt.data.overall}
            periodLabel={upt.data.periodLabel}
            status={uptStatus}
            overallWeightedScore={upt.data.overallWeightedScore}
          />
        ) : (
          <Card className="xl:col-span-1">
            <CardContent className="py-8">
              <DataUnavailable message="Kinerja UPT belum tersedia. Lihat halaman Data & Sync." />
            </CardContent>
          </Card>
        )}

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Management Attention</CardTitle>
          </CardHeader>
          <CardContent>
            <ManagementAttentionList data={managementAttention} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Gap to Target — Kinerja UPT</CardTitle>
          </CardHeader>
          <CardContent>
            {upt.data ? (
              <UptGapToTarget kpis={upt.data.kpis} />
            ) : (
              <DataUnavailable message="Kinerja UPT belum tersedia." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Issue</CardTitle>
          </CardHeader>
          <CardContent>
            <AiInsightList
              data={topIssues.map((issue, index) => ({
                id: String(index),
                tone: issue.tone,
                text: issue.text,
                href: issue.href,
              }))}
              title="Top Issue"
              emptyMessage="Tidak ada isu prioritas saat ini."
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pareto Gangguan Transmisi</CardTitle>
        </CardHeader>
        <CardContent>
          {disturbances.error ? (
            <DataUnavailable message="Sinkronisasi Gangguan belum berhasil. Lihat halaman Data & Sync." />
          ) : disturbances.transmisi.causePareto.length > 0 ? (
            <DisturbanceParetoChart data={disturbances.transmisi.causePareto} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada gangguan yang masuk kinerja.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gangguan &amp; Asset Health per GI</CardTitle>
          <p className="text-xs text-muted-foreground">
            Gabungan data Gangguan (per bay) dan AHI (per GI) — membantu melihat GI mana yang sekaligus sering
            gangguan dan asset health-nya bermasalah.
          </p>
        </CardHeader>
        <CardContent>
          {giCorrelation ? (
            <GiCorrelationTable rows={giCorrelation} />
          ) : (
            <DataUnavailable message="Data Gangguan atau AHI belum tersedia untuk korelasi ini." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
