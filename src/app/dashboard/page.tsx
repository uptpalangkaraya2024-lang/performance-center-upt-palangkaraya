import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceTrendChart } from "@/components/charts/performance-trend-chart";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { UltgPerformanceList } from "@/components/dashboard/ultg-performance-list";
import { OpenCaseSummaryGrid } from "@/components/dashboard/open-case-summary";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import { getUltgPerformance } from "@/services/ultg-performance";
import {
  aiInsights,
  disturbanceCauses,
  kpiSummaries,
  lastUpdated,
  openCaseSummary,
  performanceTrend,
} from "@/lib/mock-data";

// Prerendering this page statically would freeze the ULTG section at
// whatever the Sheets API returned at build time — force per-request
// rendering so the service's own 5-minute TTL cache (see
// src/services/ultg-performance.ts) is what actually controls freshness.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ultg = await getUltgPerformance();

  return (
    <div className="flex flex-col gap-6">
      <DashboardFilters lastUpdated={lastUpdated} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiSummaries.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Tren Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <PerformanceTrendChart data={performanceTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Insight</CardTitle>
          </CardHeader>
          <CardContent>
            <AiInsightList data={aiInsights} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pareto Gangguan</CardTitle>
          </CardHeader>
          <CardContent>
            <DisturbanceParetoChart data={disturbanceCauses} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open Case</CardTitle>
          </CardHeader>
          <CardContent>
            <OpenCaseSummaryGrid data={openCaseSummary} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Ranking Kinerja ULTG</CardTitle>
          {ultg.data.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-1.5 rounded-full ${ultg.error ? "bg-warning" : "bg-success"}`} />
              {ultg.error ? "Data terakhir tersimpan" : "Live dari Spreadsheet"}
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          {ultg.data.length > 0 ? (
            <UltgPerformanceList data={ultg.data} />
          ) : (
            <DataUnavailable message="Sinkronisasi Kinerja ULTG belum berhasil. Lihat halaman Data & Sync untuk detail." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
