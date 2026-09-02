import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { DisturbanceYoyMonthlyChart } from "@/components/charts/disturbance-yoy-monthly-chart";
import { DisturbanceBayChart } from "@/components/charts/disturbance-bay-chart";
import { getDisturbances } from "@/services/disturbances";
import { buildDisturbanceInsights } from "@/lib/executive-insights";
import { listSyncStatus } from "@/lib/sync-status";
import type { DisturbanceCategoryResult } from "@/types";

export const dynamic = "force-dynamic";

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

function StatTile({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-xl font-semibold tabular-nums ${className ?? "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function CategorySection({ title, data }: { title: string; data: DisturbanceCategoryResult }) {
  if (data.summary.total === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Belum ada gangguan yang masuk kinerja untuk kategori ini." />
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {data.summary.latestDisturbance ? (
          <span className="text-xs text-muted-foreground">Gangguan terakhir: {data.summary.latestDisturbance}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={data.summary.total.toLocaleString("id-ID")} label="Total (Masuk Kinerja)" />
        <StatTile value={data.summary.trip.toLocaleString("id-ID")} label="Trip" className="text-critical" />
        <StatTile value={data.summary.arSukses.toLocaleString("id-ID")} label="AR Sukses" className="text-primary" />
        <StatTile value={data.summary.tidakTrip.toLocaleString("id-ID")} label="Tidak Trip" className="text-muted-foreground" />
      </div>

      <Card>
        <CardContent className="py-4">
          <AiInsightList data={buildDisturbanceInsights(data, title)} title="Insight Gangguan" icon={TrendingUp} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pareto Penyebab Gangguan</CardTitle>
          </CardHeader>
          <CardContent>
            <DisturbanceParetoChart data={data.causePareto} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pareto Jenis Gangguan (Trip / AR)</CardTitle>
          </CardHeader>
          <CardContent>
            <DisturbanceParetoChart data={data.kindBreakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gangguan per Bulan — Year-on-Year</CardTitle>
        </CardHeader>
        <CardContent>
          <DisturbanceYoyMonthlyChart
            monthlyByYear={data.monthlyByYear}
            monthlyByYearByCause={data.monthlyByYearByCause}
            years={data.years}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bay Gangguan Terbanyak</CardTitle>
        </CardHeader>
        <CardContent>
          <DisturbanceBayChart data={data.topBay} />
        </CardContent>
      </Card>
    </section>
  );
}

export default async function DisturbancesPage() {
  const result = await getDisturbances();
  const syncEntry = listSyncStatus().find((entry) => entry.module === "Gangguan");
  const lastUpdate = formatTime(syncEntry?.lastSync ?? null);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Gangguan Transmisi & Trafo"
        description="Rekap gangguan UPT Palangkaraya yang masuk kinerja — Pareto penyebab, tren tahunan per bulan, dan sebaran per bay."
        status={
          !result.error ? (
            <>
              <span className="size-1.5 rounded-full bg-success" />
              Data synchronized
              {lastUpdate ? ` · Last update: ${lastUpdate}` : null}
            </>
          ) : null
        }
      />

      {result.error ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi Rekap Gangguan belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : (
        <>
          <CategorySection title="Transmisi" data={result.transmisi} />
          <CategorySection title="Trafo" data={result.trafo} />
        </>
      )}
    </div>
  );
}
