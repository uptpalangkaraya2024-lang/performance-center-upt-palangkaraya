import { CheckCircle2, CircleDashed, TrendingUp, XCircle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { PageHero } from "@/components/dashboard/page-hero";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { DisturbanceYoyMonthlyChart } from "@/components/charts/disturbance-yoy-monthly-chart";
import { DisturbanceBayChart } from "@/components/charts/disturbance-bay-chart";
import { getDisturbances } from "@/services/disturbances";
import { buildDisturbanceInsights } from "@/lib/executive-insights";
import { listSyncStatus } from "@/lib/sync-status";
import type { DisturbanceCategoryResult } from "@/types";

// DURASI GGN (MENIT) is a spreadsheet TIME value, already converted to a
// plain minute count by parseDurationMinutes() in the service — this only
// formats it for display.
function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} menit`;
  return `${h} jam ${m} menit`;
}

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

function CategorySection({ title, data, anchorId }: { title: string; data: DisturbanceCategoryResult; anchorId: string }) {
  if (data.summary.total === 0) {
    return (
      <section id={anchorId} className="flex scroll-mt-20 flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Belum ada gangguan yang masuk kinerja untuk kategori ini." />
          </CardContent>
        </Card>
      </section>
    );
  }

  // Trafo protection is direct-trip (differential/REF) with no auto-reclose
  // scheme — "AR Sukses" is a Transmisi-only concept that happens to live in
  // the same KODE GGN column, so showing it (even as 0) under Trafo implies
  // a protection scheme that doesn't exist there. Hidden for Trafo only.
  const isTrafo = title === "Trafo";
  const kindBreakdownForChart = isTrafo
    ? data.kindBreakdown.filter((k) => k.cause !== "AR Sukses")
    : data.kindBreakdown;

  return (
    <section id={anchorId} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {data.summary.latestDisturbance ? (
          <span className="text-xs text-muted-foreground">Gangguan terakhir: {data.summary.latestDisturbance}</span>
        ) : null}
      </div>

      <div className={`grid grid-cols-2 gap-3 ${isTrafo ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <StatTile value={data.summary.total.toLocaleString("id-ID")} label="Total (Masuk Kinerja)" />
        <StatTile value={data.summary.trip.toLocaleString("id-ID")} label="Trip" className="text-critical" />
        {!isTrafo ? (
          <StatTile value={data.summary.arSukses.toLocaleString("id-ID")} label="AR Sukses" className="text-primary" />
        ) : null}
        <StatTile value={data.summary.tidakTrip.toLocaleString("id-ID")} label="Tidak Trip" className="text-muted-foreground" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-lg border p-3">
          <CheckCircle2 className="size-4 shrink-0 text-success" />
          <div>
            <div className="text-lg font-semibold tabular-nums text-foreground">{data.followUp.closed}</div>
            <div className="text-xs text-muted-foreground">Tindak Lanjut Selesai</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border p-3">
          <XCircle className="size-4 shrink-0 text-critical" />
          <div>
            <div className="text-lg font-semibold tabular-nums text-foreground">{data.followUp.open}</div>
            <div className="text-xs text-muted-foreground">Masih Open</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border p-3">
          <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-lg font-semibold tabular-nums text-foreground">{data.followUp.unknown}</div>
            <div className="text-xs text-muted-foreground">Belum Diketahui</div>
          </div>
        </div>
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
            <CardTitle className="text-base">Pareto Jenis Gangguan{isTrafo ? " (Trip)" : " (Trip / AR)"}</CardTitle>
          </CardHeader>
          <CardContent>
            <DisturbanceParetoChart data={kindBreakdownForChart} />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Durasi Pemulihan Gangguan (Trip)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Dari kolom DURASI GGN pada sumber data — hanya gangguan Trip (padam nyata), tidak termasuk AR Sukses
            &amp; Tidak Trip yang durasinya memang 0.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.avgDurationMinutes === null ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Data durasi belum tersedia untuk kategori ini.
            </p>
          ) : (
            <>
              <div className="rounded-lg border p-3">
                <div className="text-xl font-semibold tabular-nums text-foreground">
                  {formatDurationMinutes(data.avgDurationMinutes)}
                </div>
                <div className="text-xs text-muted-foreground">Rata-rata Durasi Pemulihan (Trip)</div>
              </div>

              {data.longestDisturbances.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Bay</TableHead>
                        <TableHead>GI</TableHead>
                        <TableHead className="text-right">Durasi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.longestDisturbances.map((d, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="whitespace-nowrap">{d.tgl}</TableCell>
                          <TableCell className="max-w-[240px] truncate" title={d.bay}>
                            {d.bay}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{d.gi}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                            {formatDurationMinutes(d.durationMinutes)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </>
          )}
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
        actions={
          !result.error ? (
            <ExportExcelButton
              filename="Gangguan-UPT-Palangkaraya.xlsx"
              sheets={[
                {
                  name: "Transmisi - Penyebab",
                  rows: result.transmisi.causePareto.map((c) => ({ Penyebab: c.cause, Jumlah: c.count })),
                },
                {
                  name: "Transmisi - Bay",
                  rows: result.transmisi.allBayCounts.map((b) => ({ Bay: b.bay, Jumlah: b.count })),
                },
                {
                  name: "Trafo - Penyebab",
                  rows: result.trafo.causePareto.map((c) => ({ Penyebab: c.cause, Jumlah: c.count })),
                },
                {
                  name: "Trafo - Bay",
                  rows: result.trafo.allBayCounts.map((b) => ({ Bay: b.bay, Jumlah: b.count })),
                },
                {
                  name: "Durasi Terlama",
                  rows: [
                    ...result.transmisi.longestDisturbances.map((d) => ({
                      Kategori: "Transmisi",
                      Tanggal: d.tgl,
                      Bay: d.bay,
                      GI: d.gi,
                      "Durasi (menit)": d.durationMinutes,
                    })),
                    ...result.trafo.longestDisturbances.map((d) => ({
                      Kategori: "Trafo",
                      Tanggal: d.tgl,
                      Bay: d.bay,
                      GI: d.gi,
                      "Durasi (menit)": d.durationMinutes,
                    })),
                  ],
                },
              ]}
            />
          ) : undefined
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
          <CategorySection title="Transmisi" data={result.transmisi} anchorId="transmisi" />
          <CategorySection title="Trafo" data={result.trafo} anchorId="trafo" />
        </>
      )}
    </div>
  );
}
