import Link from "next/link";
import { CheckCircle2, CircleDashed, MonitorPlay, TrendingUp, XCircle, Zap } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import { PageHero } from "@/components/dashboard/page-hero";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { DisturbanceYoyMonthlyChart } from "@/components/charts/disturbance-yoy-monthly-chart";
import { UltgBreakdownChart } from "@/components/disturbances/ultg-breakdown-chart";
import { UltgCauseChart } from "@/components/disturbances/ultg-cause-chart";
import { BayBreakdownChart } from "@/components/disturbances/bay-breakdown-chart";
import { CauseByBayChart } from "@/components/disturbances/cause-by-bay-chart";
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
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

// Switches to MWh above 1000 KWh purely for readability — the underlying
// number (data.summary.totalEnsKwh) is always the raw KWh sum, this is
// display-only.
function formatEnsKwh(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} MWh`;
  return `${kwh.toLocaleString("id-ID", { maximumFractionDigits: 1 })} KWh`;
}

// Colored top accent per tile — a scannable status stripe before reading
// any number, same idea used on ProgramCard/LmCard and RENUS's summary row.
function StatTile({
  value,
  label,
  className,
  barClassName = "bg-primary",
}: {
  value: string;
  label: string;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className={`h-1.5 w-full ${barClassName}`} />
      <div className="p-3">
        <div className={`text-xl font-extrabold tabular-nums sm:text-2xl ${className ?? "text-foreground"}`}>{value}</div>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      </div>
    </div>
  );
}

// One accent color per category so the sticky banner below is instantly
// tellable apart at a glance while scrolling, not just by reading the text.
const CATEGORY_ACCENT: Record<string, string> = {
  Transmisi: "var(--chart-1)",
  "Trafo HV": "var(--brand)",
  "Trafo Low Voltage": "var(--chart-4)",
};

function CategoryBanner({ title, subtitle, latest }: { title: string; subtitle?: string; latest: string | null }) {
  const accent = CATEGORY_ACCENT[title] ?? "var(--chart-2)";
  return (
    // Sticks at the very top of the viewport (above the site header, z-20 >
    // header's z-10) once scrolled past — takes over the top of the screen
    // instead of parking below a persistent header, so scrolling through a
    // long list of cards keeps the most content visible while still never
    // losing track of which of Transmisi / Trafo HV / Trafo Low Voltage
    // you're looking at.
    <div
      className="sticky top-0 z-20 -mx-4 border-y bg-card px-4 py-3 md:-mx-6 md:px-6"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-foreground">{title}</h2>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {latest ? <span className="text-xs text-muted-foreground">Gangguan terakhir: {latest}</span> : null}
      </div>
    </div>
  );
}

// Top-of-page resume so a reader can see all three categories' Trip/AR,
// open case count, and biggest cause without scrolling through each
// category's full section first. Plain <a href="#anchorId"> (no client
// component needed) jumps straight to that category's own CategoryBanner
// further down — anchorId matches the section's own id + scroll-mt-20.
function CategoryResumeCard({
  title,
  anchorId,
  data,
  isTrafo,
}: {
  title: string;
  anchorId: string;
  data: DisturbanceCategoryResult;
  isTrafo: boolean;
}) {
  const accent = CATEGORY_ACCENT[title] ?? "var(--chart-2)";
  const topCauses = data.causePareto.slice(0, 2);
  return (
    <a
      href={`#${anchorId}`}
      className="flex flex-col gap-3 rounded-lg border bg-secondary p-4 transition-colors hover:brightness-110"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <h3 className="text-base font-extrabold tracking-tight text-foreground">{title}</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border bg-muted p-2">
          <div className="text-xl font-extrabold tabular-nums text-critical">
            {data.summary.trip.toLocaleString("id-ID")}
            {!isTrafo ? (
              <span className="ml-1 text-sm font-bold text-primary">/ {data.summary.arSukses.toLocaleString("id-ID")}</span>
            ) : null}
          </div>
          <div className="text-xs font-medium text-muted-foreground">{isTrafo ? "Trip" : "Trip / AR Sukses"}</div>
        </div>
        <div className="rounded-md border bg-muted p-2">
          <div className="text-xl font-extrabold tabular-nums text-critical">
            {data.followUp.open.toLocaleString("id-ID")}
          </div>
          <div className="text-xs font-medium text-muted-foreground">Open Case</div>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Penyebab Terbesar</p>
        {topCauses.length === 0 ? (
          <span className="text-xs text-muted-foreground">Belum ada data.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {topCauses.map((c) => (
              <span
                key={c.cause}
                className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-bold text-foreground"
              >
                {c.cause} <span className="tabular-nums text-muted-foreground">({c.count})</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function CategorySection({
  title,
  subtitle,
  data,
  anchorId,
}: {
  title: string;
  subtitle?: string;
  data: DisturbanceCategoryResult;
  anchorId: string;
}) {
  if (data.summary.total === 0) {
    return (
      <section id={anchorId} className="flex scroll-mt-20 flex-col gap-4">
        <CategoryBanner title={title} subtitle={subtitle} latest={null} />
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
  // a protection scheme that doesn't exist there. Hidden for both Trafo
  // sub-categories (HV and LV).
  const isTrafo = title.startsWith("Trafo");
  const kindBreakdownForChart = isTrafo
    ? data.kindBreakdown.filter((k) => k.cause !== "AR Sukses")
    : data.kindBreakdown;

  return (
    <section id={anchorId} className="flex scroll-mt-20 flex-col gap-4">
      <CategoryBanner title={title} subtitle={subtitle} latest={data.summary.latestDisturbance} />

      <div className={`grid grid-cols-2 gap-3 ${isTrafo ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <StatTile value={data.summary.total.toLocaleString("id-ID")} label="Total (Masuk Kinerja)" barClassName="bg-primary" />
        <StatTile value={data.summary.trip.toLocaleString("id-ID")} label="Trip" className="text-critical" barClassName="bg-critical" />
        {!isTrafo ? (
          <StatTile value={data.summary.arSukses.toLocaleString("id-ID")} label="AR Sukses" className="text-success" barClassName="bg-success" />
        ) : null}
        <StatTile value={data.summary.tidakTrip.toLocaleString("id-ID")} label="Tidak Trip" className="text-muted-foreground" barClassName="bg-border" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-success/40 bg-success/10 p-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">{data.followUp.closed}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tindak Lanjut Selesai</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border border-critical/40 bg-critical/10 p-3">
          <XCircle className="size-5 shrink-0 text-critical" />
          <div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">{data.followUp.open}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Masih Open</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg border bg-muted p-3">
          <CircleDashed className="size-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">{data.followUp.unknown}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Belum Diketahui</div>
          </div>
        </div>
      </div>

      {data.summary.ensRowCount > 0 ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <Zap className="size-5 shrink-0 text-warning-foreground" />
          <div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {formatEnsKwh(data.summary.totalEnsKwh)}
            </div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Energi Tidak Tersalur (ENS) — dari {data.summary.ensRowCount} dari {data.summary.total} kejadian yang
              tercatat ENS-nya
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-secondary p-3">
        <p className="mb-2 text-xs font-bold tracking-wide text-foreground uppercase">Penyebab Gangguan Keseluruhan</p>
        <div className="flex flex-wrap gap-2">
          {data.causePareto.map((c) => (
            <span
              key={c.cause}
              className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-bold text-foreground"
            >
              {c.cause} <span className="tabular-nums text-muted-foreground">
                ({c.count} · {Math.round((c.count / data.summary.total) * 100)}%)
              </span>
            </span>
          ))}
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
            <CardTitle className="text-lg font-extrabold">Pareto Penyebab Gangguan</CardTitle>
          </CardHeader>
          <CardContent>
            <DisturbanceParetoChart data={data.causePareto} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-extrabold">Pareto Jenis Gangguan{isTrafo ? " (Trip)" : " (Trip / AR)"}</CardTitle>
          </CardHeader>
          <CardContent>
            <DisturbanceParetoChart data={kindBreakdownForChart} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Gangguan per Bulan — Year-on-Year</CardTitle>
        </CardHeader>
        <CardContent>
          <DisturbanceYoyMonthlyChart
            monthlyByYear={data.monthlyByYear}
            monthlyByYearByCause={data.monthlyByYearByCause}
            monthlyByYearByKind={data.monthlyByYearByKind}
            monthlyByYearByUltg={data.monthlyByYearByUltg}
            years={data.years}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Gangguan per ULTG</CardTitle>
          <p className="text-xs text-muted-foreground">
            Kinerja relay (Trip{isTrafo ? "" : " / AR Sukses"} / Tidak Trip) dan status tindak lanjut per ULTG.
          </p>
        </CardHeader>
        <CardContent>
          <UltgBreakdownChart rows={data.ultgBreakdown} showAr={!isTrafo} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Penyebab Gangguan per ULTG</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sebaran penyebab tiap ULTG dalam satu bar — filter satu ULTG dan/atau satu penyebab untuk fokus ke
            kombinasi yang ingin dibandingkan.
          </p>
        </CardHeader>
        <CardContent>
          <UltgCauseChart rows={data.ultgBreakdown} causeOrder={data.causePareto} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Gangguan per Ruas / Bay</CardTitle>
          <p className="text-xs text-muted-foreground">
            Kinerja relay tiap ruas/bay — filter jenis (Trip{isTrafo ? "" : " / AR Sukses"} / Tidak Trip) atau status
            tindak lanjut (Open / Selesai / Belum Diketahui) untuk meranking ulang ruas yang paling terdampak.
          </p>
        </CardHeader>
        <CardContent>
          <BayBreakdownChart rows={data.bayBreakdown} showAr={!isTrafo} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Penyebab Gangguan per Ruas / Bay</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sebaran penyebab tiap ruas/bay dalam satu bar — filter satu penyebab untuk meranking ulang ruas mana yang
            paling terdampak.
          </p>
        </CardHeader>
        <CardContent>
          <CauseByBayChart rows={data.bayBreakdown} causeOrder={data.causePareto} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Durasi Pemulihan Gangguan (Trip)</CardTitle>
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
              <div className="rounded-lg border bg-muted p-3">
                <div className="text-2xl font-extrabold tabular-nums text-foreground">
                  {formatDurationMinutes(data.avgDurationMinutes)}
                </div>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Rata-rata Durasi Pemulihan (Trip)</div>
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
        description="Rekap gangguan UPT Palangkaraya yang masuk kinerja — Pareto penyebab, tren tahunan per bulan, dan sebaran per bay. Trafo dipisah sisi HV dan sisi Low Voltage karena bermakna operasional berbeda."
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
            <>
            <Link
              href="/dashboard/disturbances/presentasi"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <MonitorPlay className="size-3.5" />
              Mode Presentasi
            </Link>
            <ExportPdfButton />
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
                  name: "Trafo HV - Penyebab",
                  rows: result.trafoHv.causePareto.map((c) => ({ Penyebab: c.cause, Jumlah: c.count })),
                },
                {
                  name: "Trafo HV - Bay",
                  rows: result.trafoHv.allBayCounts.map((b) => ({ Bay: b.bay, Jumlah: b.count })),
                },
                {
                  name: "Trafo LV - Penyebab",
                  rows: result.trafoLv.causePareto.map((c) => ({ Penyebab: c.cause, Jumlah: c.count })),
                },
                {
                  name: "Trafo LV - Bay",
                  rows: result.trafoLv.allBayCounts.map((b) => ({ Bay: b.bay, Jumlah: b.count })),
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
                    ...result.trafoHv.longestDisturbances.map((d) => ({
                      Kategori: "Trafo HV",
                      Tanggal: d.tgl,
                      Bay: d.bay,
                      GI: d.gi,
                      "Durasi (menit)": d.durationMinutes,
                    })),
                    ...result.trafoLv.longestDisturbances.map((d) => ({
                      Kategori: "Trafo LV",
                      Tanggal: d.tgl,
                      Bay: d.bay,
                      GI: d.gi,
                      "Durasi (menit)": d.durationMinutes,
                    })),
                  ],
                },
                {
                  name: "Per ULTG",
                  rows: [
                    ...result.transmisi.ultgBreakdown.map((u) => ({
                      Kategori: "Transmisi",
                      ULTG: u.ultg,
                      Total: u.total,
                      Trip: u.trip,
                      "AR Sukses": u.arSukses,
                      "Tidak Trip": u.tidakTrip,
                      "TL Selesai": u.followUp.closed,
                      "TL Open": u.followUp.open,
                      "TL Belum Diketahui": u.followUp.unknown,
                      "Penyebab Terbesar": u.causePareto[0]?.cause ?? "",
                    })),
                    ...result.trafoHv.ultgBreakdown.map((u) => ({
                      Kategori: "Trafo HV",
                      ULTG: u.ultg,
                      Total: u.total,
                      Trip: u.trip,
                      "AR Sukses": u.arSukses,
                      "Tidak Trip": u.tidakTrip,
                      "TL Selesai": u.followUp.closed,
                      "TL Open": u.followUp.open,
                      "TL Belum Diketahui": u.followUp.unknown,
                      "Penyebab Terbesar": u.causePareto[0]?.cause ?? "",
                    })),
                    ...result.trafoLv.ultgBreakdown.map((u) => ({
                      Kategori: "Trafo LV",
                      ULTG: u.ultg,
                      Total: u.total,
                      Trip: u.trip,
                      "AR Sukses": u.arSukses,
                      "Tidak Trip": u.tidakTrip,
                      "TL Selesai": u.followUp.closed,
                      "TL Open": u.followUp.open,
                      "TL Belum Diketahui": u.followUp.unknown,
                      "Penyebab Terbesar": u.causePareto[0]?.cause ?? "",
                    })),
                  ],
                },
                {
                  name: "Per Ruas Bay",
                  rows: [
                    ...result.transmisi.bayBreakdown.map((b) => ({
                      Kategori: "Transmisi",
                      Ruas: b.bay,
                      ULTG: b.ultg,
                      GI: b.gi,
                      Total: b.total,
                      Trip: b.trip,
                      "AR Sukses": b.arSukses,
                      "Tidak Trip": b.tidakTrip,
                      "Penyebab Terbesar": b.causePareto[0]?.cause ?? "",
                    })),
                    ...result.trafoHv.bayBreakdown.map((b) => ({
                      Kategori: "Trafo HV",
                      Ruas: b.bay,
                      ULTG: b.ultg,
                      GI: b.gi,
                      Total: b.total,
                      Trip: b.trip,
                      "AR Sukses": b.arSukses,
                      "Tidak Trip": b.tidakTrip,
                      "Penyebab Terbesar": b.causePareto[0]?.cause ?? "",
                    })),
                    ...result.trafoLv.bayBreakdown.map((b) => ({
                      Kategori: "Trafo LV",
                      Ruas: b.bay,
                      ULTG: b.ultg,
                      GI: b.gi,
                      Total: b.total,
                      Trip: b.trip,
                      "AR Sukses": b.arSukses,
                      "Tidak Trip": b.tidakTrip,
                      "Penyebab Terbesar": b.causePareto[0]?.cause ?? "",
                    })),
                  ],
                },
              ]}
            />
            </>
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
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Resume Gangguan</h2>
              <p className="text-xs text-muted-foreground">
                Trip/AR, open case, dan penyebab terbesar tiap kategori — klik kartu untuk lompat ke detailnya.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <CategoryResumeCard title="Transmisi" anchorId="transmisi" data={result.transmisi} isTrafo={false} />
              <CategoryResumeCard title="Trafo HV" anchorId="trafo-hv" data={result.trafoHv} isTrafo />
              <CategoryResumeCard title="Trafo Low Voltage" anchorId="trafo-lv" data={result.trafoLv} isTrafo />
            </div>
          </section>

          <CategorySection title="Transmisi" data={result.transmisi} anchorId="transmisi" />
          <CategorySection
            title="Trafo HV"
            subtitle="T/R Bay — trafo tripped di sisi tegangan tinggi (seluruh trafo terdampak)."
            data={result.trafoHv}
            anchorId="trafo-hv"
          />
          <CategorySection
            title="Trafo Low Voltage"
            subtitle="T/R Bay (LOW VOLTAGE) — hanya sisi incoming/20kV yang trip, sisi HV tetap bertegangan."
            data={result.trafoLv}
            anchorId="trafo-lv"
          />
        </>
      )}
    </div>
  );
}
