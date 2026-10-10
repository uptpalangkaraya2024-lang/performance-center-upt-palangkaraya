import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ManagementAttentionSection } from "@/components/dashboard/management-attention-section";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { GiCorrelationTable } from "@/components/dashboard/gi-correlation-table";
import { SeasonalReadinessCard } from "@/components/dashboard/seasonal-readiness-card";
import { PageHero } from "@/components/dashboard/page-hero";
import { UptPerformanceStatus } from "@/components/dashboard/upt-performance-status";
import { UptGapToTarget } from "@/components/dashboard/upt-gap-to-target";
import { OverviewExportToolbar } from "@/components/dashboard/overview-export-toolbar";
import { ExportExcelButton, type ExcelSheetSpec } from "@/components/dashboard/export-excel-button";
import { UltgGapToTarget } from "@/components/kinerja-ultg/ultg-gap-to-target";
import { buildUltgRanking, RankBadge } from "@/components/kinerja-ultg/ultg-ranking-table";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { UltgAttentionRollupTable } from "@/components/dashboard/ultg-attention-rollup-table";
import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getDisturbances, type DisturbancesResult } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReports } from "@/services/ahi-bay-line-report";
import { getRenusData } from "@/services/renus";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAssetScanning } from "@/services/asset-scanning";
import { buildManagementAttention } from "@/lib/executive-insights";
import { buildGiCorrelation } from "@/lib/asset-correlation";
import { buildSeasonalReadiness, upcomingRiskyMonths } from "@/lib/seasonal-readiness";
import { listSyncStatus } from "@/lib/sync-status";
import { buildAboSnapshotComputed, buildAboUltgResume, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxUltgResume, buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { buildCeSummary } from "@/lib/ce-compute";
import { buildAhiUltgResume } from "@/lib/ahi-compute";
import { buildRenusUltgResume } from "@/lib/renus-compute";
import { buildUltgAttentionRollup, type UltgCountEntry } from "@/lib/ultg-attention-rollup";
import type {
  AboSnapshot,
  AhiResult,
  AssetScanningResult,
  BayLineReport,
  CeSnapshot,
  FourDxSnapshot,
  RenusData,
  StatusLevel,
  UltgPerformanceResult,
  UptPerformanceResult,
} from "@/types";

export const dynamic = "force-dynamic";
// Safety margin against Apps Script's own observed latency variance
// (measured 5-30s for the same request depending on Google's backend load)
// on top of Vercel's serverless function duration limit — this page
// crashed with a hard server error once that combination exceeded it.
export const maxDuration = 60;

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

// --- Streaming redesign -----------------------------------------------------
//
// This page used to `await Promise.all([...5 services...])` before rendering
// ANY html — meaning the whole page's first byte was gated on the slowest of
// five separate data sources (Kinerja UPT, Gangguan x3, AHI, RENUS, AHI Bay
// Line Reports), each its own round trip to Apps Script. Measured live: even
// with everything warm, this routinely took 4-8s before a visitor saw
// anything but a blank tab.
//
// Every fetch below is now kicked off immediately (NOT awaited) here at the
// top, so they all start in parallel the instant the request comes in. Each
// is then handed to its own small async Server Component, awaited only
// there, wrapped in its own <Suspense> — Next.js streams each section into
// the already-sent page shell (PageHero renders instantly) as soon as THAT
// section's own dependency resolves, instead of the slowest one blocking
// everything. Passing the same promise to two sections (e.g. uptPromise to
// both UptStatusSection and GapToTargetSection) does not refetch anything —
// a promise only ever resolves once no matter how many places await it.
export default function OverviewPage() {
  const uptPromise = getUptPerformance();
  const ultgPromise = getUltgPerformance();
  const disturbancesPromise = getDisturbances();
  const ahiPromise = getAhiPerformance();
  const renusPromise = getRenusData();
  const bayLineReportsPromise = getAllBayLineReports();
  const aboProteksiPromise = getAboProteksiSnapshot();
  const aboHargiPromise = getAboHargiSnapshot();
  const fourDxPromise = getFourDxSnapshot();
  const cePromise = getCeSnapshot();
  const assetScanningPromise = getAssetScanning();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Monitoring Kinerja UPT Palangkaraya"
        description="Executive overview kondisi operasional, kinerja, gangguan, dan asset health UPT Palangkaraya."
        status={
          <Suspense fallback={<span>Memuat status sinkronisasi...</span>}>
            <SyncStatus
              uptPromise={uptPromise}
              ultgPromise={ultgPromise}
              disturbancesPromise={disturbancesPromise}
              ahiPromise={ahiPromise}
              renusPromise={renusPromise}
              bayLineReportsPromise={bayLineReportsPromise}
            />
          </Suspense>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <ExportToolbarSection uptPromise={uptPromise} ultgPromise={ultgPromise} />
            </Suspense>
            <Suspense fallback={null}>
              <ExecutiveReportSection
                uptPromise={uptPromise}
                disturbancesPromise={disturbancesPromise}
                ahiPromise={ahiPromise}
                renusPromise={renusPromise}
                bayLineReportsPromise={bayLineReportsPromise}
                aboProteksiPromise={aboProteksiPromise}
                aboHargiPromise={aboHargiPromise}
                fourDxPromise={fourDxPromise}
                cePromise={cePromise}
                assetScanningPromise={assetScanningPromise}
              />
            </Suspense>
          </div>
        }
      />

      {/* UPT Performance Status full-width on its own row, Management
          Attention full-width below it — no longer paired side-by-side in
          one grid row, which is what made one of them look
          disproportionate no matter how the heights were reconciled.
          Per user feedback. */}
      <Suspense fallback={<UptStatusFallback />}>
        <UptStatusSection uptPromise={uptPromise} />
      </Suspense>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-extrabold tracking-tight text-foreground">Kinerja ULTG</h3>
        <Suspense fallback={<UptStatusFallback />}>
          <UltgStatusSection ultgPromise={ultgPromise} />
        </Suspense>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-extrabold tracking-tight text-foreground">Management Attention</h3>
        <Suspense fallback={<ManagementAttentionFallback />}>
          <ManagementAttentionAsync
            uptPromise={uptPromise}
            disturbancesPromise={disturbancesPromise}
            ahiPromise={ahiPromise}
            renusPromise={renusPromise}
            bayLineReportsPromise={bayLineReportsPromise}
            aboProteksiPromise={aboProteksiPromise}
            aboHargiPromise={aboHargiPromise}
            fourDxPromise={fourDxPromise}
            cePromise={cePromise}
          />
        </Suspense>
      </div>

      <Suspense fallback={<ManagementAttentionFallback />}>
        <UltgAttentionRollupSection
          aboProteksiPromise={aboProteksiPromise}
          aboHargiPromise={aboHargiPromise}
          fourDxPromise={fourDxPromise}
          cePromise={cePromise}
          ahiPromise={ahiPromise}
          renusPromise={renusPromise}
          disturbancesPromise={disturbancesPromise}
          assetScanningPromise={assetScanningPromise}
        />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Gap to Target — Kinerja UPT</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <GapToTargetSection uptPromise={uptPromise} />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Gap to Target — Kinerja ULTG</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <UltgGapToTargetSection ultgPromise={ultgPromise} />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Pareto Gangguan Transmisi</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ParetoSection disturbancesPromise={disturbancesPromise} />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Skor Risiko Aset per GI</CardTitle>
          <p className="text-xs text-muted-foreground">
            Gabungan Gangguan, AHI, CE, dan RENUS per GI — bukan cuma ULTG mana yang perlu perhatian, tapi GI mana
            persisnya yang harus dikunjungi lebih dulu.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <GiCorrelationSection
              disturbancesPromise={disturbancesPromise}
              ahiPromise={ahiPromise}
              cePromise={cePromise}
              renusPromise={renusPromise}
            />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Kesiapan Musiman</CardTitle>
          <p className="text-xs text-muted-foreground">
            3 bulan ke depan dengan risiko gangguan historis tertinggi — apakah pekerjaan preventif RENUS &amp; ABO
            sudah terjadwal menjelang bulan-bulan tersebut.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <SeasonalReadinessSection
              disturbancesPromise={disturbancesPromise}
              renusPromise={renusPromise}
              aboProteksiPromise={aboProteksiPromise}
              aboHargiPromise={aboHargiPromise}
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

function UptStatusFallback() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="gap-3 py-4">
          <CardHeader className="px-4">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-4">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ManagementAttentionFallback() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

async function SyncStatus({
  uptPromise,
  ultgPromise,
  disturbancesPromise,
  ahiPromise,
  renusPromise,
  bayLineReportsPromise,
}: {
  uptPromise: Promise<unknown>;
  ultgPromise: Promise<unknown>;
  disturbancesPromise: Promise<unknown>;
  ahiPromise: Promise<unknown>;
  renusPromise: Promise<unknown>;
  bayLineReportsPromise: Promise<unknown>;
}) {
  // listSyncStatus() reads a registry populated as a side effect of each
  // service's own underlying readConfiguredSource() call — waiting on every
  // promise here (even though their VALUES aren't used) ensures the
  // registry actually reflects this request's own sync attempts before
  // this reads it, not whatever an earlier request left behind.
  await Promise.all([uptPromise, ultgPromise, disturbancesPromise, ahiPromise, renusPromise, bayLineReportsPromise]);
  const lastSyncOverall = listSyncStatus().reduce<Date | null>(
    (latest, entry) => (entry.lastSync && (!latest || entry.lastSync > latest) ? entry.lastSync : latest),
    null,
  );
  return (
    <>
      <span className="size-1.5 rounded-full bg-success" />
      Data synchronized
      {lastSyncOverall ? ` · Last update: ${formatTime(lastSyncOverall)}` : null}
    </>
  );
}

// Builds the Excel workbook's sheets from the SAME data the rest of this
// page already fetched (uptPromise/ultgPromise are awaited again here, but
// a promise only ever resolves once no matter how many places await it —
// no extra Apps Script round trip). Row shape matches the Kinerja UPT and
// Kinerja ULTG pages' own export buttons exactly, so a number in this
// workbook always means the same thing it does on those pages. Falls back
// to an empty sheet list (not an error) when a source has no data yet —
// the PDF export (plain window.print()) still works regardless.
async function ExportToolbarSection({
  uptPromise,
  ultgPromise,
}: {
  uptPromise: Promise<UptPerformanceResult>;
  ultgPromise: Promise<UltgPerformanceResult>;
}) {
  const [upt, ultg] = await Promise.all([uptPromise, ultgPromise]);
  const sheets: ExcelSheetSpec[] = [];

  if (upt.data) {
    sheets.push({
      name: "Kinerja UPT",
      rows: upt.data.kpis.map((kpi) => ({
        KPI: kpi.displayName,
        Kategori: kpi.category,
        Target: kpi.targetLabel ?? "",
        Realisasi: kpi.actualLabel ?? "",
        "Achievement (%)": kpi.achievement ?? "",
        Status: kpi.status,
        Arah: kpi.direction ?? "",
        Bobot: kpi.weightInfo?.weight ?? "",
        "Kontribusi Bobot": kpi.weightInfo?.weightedScore ?? "",
        "Bobot Digabung Dengan": kpi.weightInfo?.sharedWith ?? "",
      })),
    });
  }

  if (ultg.data) {
    for (const snapshot of ultg.data) {
      sheets.push({
        name: snapshot.ultg,
        rows: snapshot.kpis.map((kpi) => ({
          KPI: kpi.displayName,
          Kategori: kpi.category,
          Target: kpi.targetLabel ?? "",
          Realisasi: kpi.actualLabel ?? "",
          "Achievement (%)": kpi.achievement ?? "",
          Status: kpi.status,
          Arah: kpi.direction ?? "",
          Bobot: kpi.weightInfo?.weight ?? "",
          "Kontribusi Bobot": kpi.weightInfo?.weightedScore ?? "",
          "Bobot Digabung Dengan": kpi.weightInfo?.sharedWith ?? "",
        })),
      });
    }
  }

  return <OverviewExportToolbar sheets={sheets} />;
}

// The "satu-klik laporan eksekutif" — one Excel workbook bundling the same
// cross-module views already on this page (Management Attention, Perhatian
// per ULTG, Skor Risiko Aset per GI, Kesiapan Musiman) so a manager gets
// one file to read/forward instead of screenshotting 4 different cards.
// Deliberately scoped to a data export, not an AI-narrated slide deck —
// every number in it traces back to the exact same compute call its own
// card on this page uses, so it can never say something the page itself
// doesn't already show. Re-awaits the same promises the rest of the page
// already kicked off (no extra fetch) and re-runs the same pure compute
// functions those other sections use — cheap, and keeps this from ever
// drifting out of sync with what's actually rendered.
async function ExecutiveReportSection({
  uptPromise,
  disturbancesPromise,
  ahiPromise,
  renusPromise,
  bayLineReportsPromise,
  aboProteksiPromise,
  aboHargiPromise,
  fourDxPromise,
  cePromise,
  assetScanningPromise,
}: {
  uptPromise: Promise<UptPerformanceResult>;
  disturbancesPromise: Promise<DisturbancesResult>;
  ahiPromise: Promise<AhiResult>;
  renusPromise: Promise<RenusData>;
  bayLineReportsPromise: Promise<BayLineReport[]>;
  aboProteksiPromise: Promise<AboSnapshot>;
  aboHargiPromise: Promise<AboSnapshot>;
  fourDxPromise: Promise<FourDxSnapshot>;
  cePromise: Promise<CeSnapshot>;
  assetScanningPromise: Promise<AssetScanningResult>;
}) {
  const [upt, disturbances, ahi, renus, bayLineReports, aboProteksi, aboHargi, fourDx, ce, assetScanning] =
    await Promise.all([
      uptPromise,
      disturbancesPromise,
      ahiPromise,
      renusPromise,
      bayLineReportsPromise,
      aboProteksiPromise,
      aboHargiPromise,
      fourDxPromise,
      cePromise,
      assetScanningPromise,
    ]);

  const aboWeekLabel = defaultAboWeekLabel();
  const fourDxPeriod = resolvePeriodRange(fourDx.currentPeriodLabel, fourDx.periodBoundaries, fourDx.currentYear);

  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    trafoHv: disturbances.error ? null : disturbances.trafoHv,
    trafoLv: disturbances.error ? null : disturbances.trafoLv,
    ahi: ahi.data,
    bayLineReports: bayLineReports.length > 0 ? bayLineReports : null,
    renusReminders: renus.error ? null : renus.reminders,
    abo:
      aboProteksi.error || aboHargi.error
        ? null
        : {
            proteksiPrograms: buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
            hargiPrograms: buildAboSnapshotComputed(aboHargi, aboWeekLabel),
            weekLabel: aboWeekLabel,
          },
    fourDx: fourDx.error ? null : buildFourDxWigs(fourDx.wigs, fourDxPeriod, fourDx.realizations, fourDx.monitoring),
    ce: ce.error ? null : ce,
  });

  const aboEntries: UltgCountEntry[] =
    aboProteksi.error || aboHargi.error
      ? []
      : buildAboUltgResume([
          ...buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
          ...buildAboSnapshotComputed(aboHargi, aboWeekLabel),
        ]).map((e) => ({ ultg: e.ultg, count: e.programsEvaluated - e.programsTercapai }));

  const fourDxEntries: UltgCountEntry[] = fourDx.error
    ? []
    : buildFourDxUltgResume(
        buildFourDxWigs(fourDx.wigs, fourDxPeriod, fourDx.realizations, fourDx.monitoring),
      ).map((e) => ({ ultg: e.ultg, count: e.lmsEvaluated - e.lmsTercapai }));

  const ceEntries: UltgCountEntry[] = ce.error
    ? []
    : buildCeSummary(ce.items).byUltg.map((e) => ({ ultg: e.label, count: e.open }));

  const ahiEntries: UltgCountEntry[] = ahi.data
    ? buildAhiUltgResume(ahi.data.anomalies).map((e) => ({ ultg: e.ultg, count: e.critical }))
    : [];

  const renusEntries: UltgCountEntry[] = renus.error
    ? []
    : buildRenusUltgResume(renus.rows, renus.today).map((e) => ({ ultg: e.ultg, count: e.overdue }));

  const disturbanceOpenByUltg = new Map<string, number>();
  if (!disturbances.error) {
    for (const category of [disturbances.transmisi, disturbances.trafoHv, disturbances.trafoLv]) {
      for (const u of category.ultgBreakdown) {
        disturbanceOpenByUltg.set(u.ultg, (disturbanceOpenByUltg.get(u.ultg) ?? 0) + u.followUp.open);
      }
    }
  }
  const disturbanceEntries: UltgCountEntry[] = [...disturbanceOpenByUltg.entries()].map(([ultg, count]) => ({
    ultg,
    count,
  }));

  const assetOpenByUltg = new Map<string, number>();
  if (assetScanning.data) {
    for (const a of assetScanning.data.anomali) {
      if ((a.status ?? "").toUpperCase() === "SELESAI") continue;
      assetOpenByUltg.set(a.ultg, (assetOpenByUltg.get(a.ultg) ?? 0) + 1);
    }
  }
  const assetEntries: UltgCountEntry[] = [...assetOpenByUltg.entries()].map(([ultg, count]) => ({ ultg, count }));

  const rollup = buildUltgAttentionRollup({
    abo: aboEntries,
    fourDx: fourDxEntries,
    ce: ceEntries,
    ahi: ahiEntries,
    renus: renusEntries,
    disturbances: disturbanceEntries,
    dataAset: assetEntries,
  });

  const giCorrelation =
    !disturbances.error && ahi.data
      ? buildGiCorrelation({
          trafoGi: [...disturbances.trafoHv.giBreakdown, ...disturbances.trafoLv.giBreakdown],
          transmisiGi: disturbances.transmisi.giBreakdown,
          anomalies: ahi.data.anomalies,
          ceItems: ce.error ? [] : ce.items,
          renusRows: renus.error ? [] : renus.rows,
        })
      : [];

  const todayMonthIndex =
    Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", month: "2-digit" }).format(new Date())) - 1;
  const seasonalReadiness = disturbances.error
    ? []
    : buildSeasonalReadiness({
        disturbances,
        renusRows: renus.error ? [] : renus.rows,
        aboSnapshots: [aboProteksi, aboHargi].filter((s) => !s.error),
        todayMonthIndex,
      });

  const sheets: ExcelSheetSpec[] = [
    {
      name: "Management Attention",
      rows: managementAttention.map((i) => ({ Modul: i.module ?? "-", Tingkat: i.tone, Insight: i.text })),
    },
    {
      name: "Perhatian per ULTG",
      rows: rollup.map((r) => ({
        ULTG: r.ultg,
        ABO: r.abo,
        "4DX": r.fourDx,
        CE: r.ce,
        AHI: r.ahi,
        RENUS: r.renus,
        Gangguan: r.disturbances,
        "Data Aset": r.dataAset,
        Total: r.total,
      })),
    },
    {
      name: "Skor Risiko Aset per GI",
      rows: giCorrelation.slice(0, 30).map((g) => ({
        GI: g.gi,
        "Gangguan Trafo": g.gangguanTrafo,
        "Gangguan Transmisi": g.gangguanTransmisi,
        "AHI Poor": g.ahiPoor,
        "AHI Critical": g.ahiCritical,
        "CE Open": g.ceOpen,
        "RENUS Overdue": g.renusOverdue,
        "Skor Risiko": g.riskScore,
      })),
    },
    {
      name: "Kesiapan Musiman",
      rows: seasonalReadiness.map((m) => ({
        Bulan: m.month,
        "Peringkat Risiko": m.rank,
        "Rata-rata Gangguan per Tahun": Math.round(m.avgPerYear * 10) / 10,
        "RENUS Terjadwal": m.renusScheduled,
        "ABO Terjadwal": m.aboScheduled,
      })),
    },
  ];

  return (
    <ExportExcelButton
      filename={`Laporan-Eksekutif-UPT-Palangkaraya-${new Date().toISOString().slice(0, 10)}.xlsx`}
      sheets={sheets}
      label="Laporan Eksekutif"
    />
  );
}

async function UptStatusSection({ uptPromise }: { uptPromise: Promise<UptPerformanceResult> }) {
  const upt = await uptPromise;
  const uptStatus: StatusLevel = !upt.data
    ? "none"
    : upt.data.overall.critical > 0
      ? "critical"
      : upt.data.overall.warning > 0
        ? "warning"
        : "good";

  return upt.data ? (
    <UptPerformanceStatus
      overall={upt.data.overall}
      periodLabel={upt.data.periodLabel}
      status={uptStatus}
      overallWeightedScore={upt.data.overallWeightedScore}
    />
  ) : (
    <Card>
      <CardContent className="py-8">
        <DataUnavailable message="Kinerja UPT belum tersedia. Lihat halaman Data & Sync." />
      </CardContent>
    </Card>
  );
}

// One full-width UptPerformanceStatus banner per ULTG, stacked in RANKED
// order (best weighted contract score first — same ranking buildUltgRanking
// already computes for the Kinerja ULTG page's own ranking table) with a
// matching numbered RankBadge, per the user's explicit request: the banners
// used to render in a fixed PALANGKARAYA/PANGKALAN BUN/MUARA TEWEH order
// regardless of who actually performed best, which read as arbitrary rather
// than a ranking. Same widget as UPT's own (see its `title` prop) rather
// than a separate component, since the shape is identical, just computed
// per ULTG instead of once for the UPT.
async function UltgStatusSection({ ultgPromise }: { ultgPromise: Promise<UltgPerformanceResult> }) {
  const ultg = await ultgPromise;

  if (!ultg.data) {
    return (
      <Card>
        <CardContent className="py-8">
          <DataUnavailable message="Kinerja ULTG belum tersedia. Lihat halaman Data & Sync." />
        </CardContent>
      </Card>
    );
  }

  const ranking = buildUltgRanking(ultg.data);

  return (
    <div className="flex flex-col gap-3">
      {ranking.map(({ rank, snapshot }) => {
        const status: StatusLevel =
          snapshot.overall.critical > 0 ? "critical" : snapshot.overall.warning > 0 ? "warning" : "good";
        return (
          <div key={snapshot.ultgSlug} className="flex items-center gap-3">
            <RankBadge rank={rank} size="lg" />
            <div className="min-w-0 flex-1">
              <UptPerformanceStatus
                title={`#${rank} · ${snapshot.ultg} Performance Status`}
                overall={snapshot.overall}
                periodLabel={snapshot.periodLabel}
                status={status}
                overallWeightedScore={snapshot.overallWeightedScore}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

async function UltgGapToTargetSection({ ultgPromise }: { ultgPromise: Promise<UltgPerformanceResult> }) {
  const ultg = await ultgPromise;
  return ultg.data ? (
    <UltgGapToTarget snapshots={ultg.data} />
  ) : (
    <DataUnavailable message="Kinerja ULTG belum tersedia." />
  );
}

async function ManagementAttentionAsync({
  uptPromise,
  disturbancesPromise,
  ahiPromise,
  renusPromise,
  bayLineReportsPromise,
  aboProteksiPromise,
  aboHargiPromise,
  fourDxPromise,
  cePromise,
}: {
  uptPromise: Promise<UptPerformanceResult>;
  disturbancesPromise: Promise<DisturbancesResult>;
  ahiPromise: Promise<AhiResult>;
  renusPromise: Promise<RenusData>;
  bayLineReportsPromise: Promise<BayLineReport[]>;
  aboProteksiPromise: Promise<AboSnapshot>;
  aboHargiPromise: Promise<AboSnapshot>;
  fourDxPromise: Promise<FourDxSnapshot>;
  cePromise: Promise<CeSnapshot>;
}) {
  const [upt, disturbances, ahi, renus, bayLineReports, aboProteksi, aboHargi, fourDx, ce] = await Promise.all([
    uptPromise,
    disturbancesPromise,
    ahiPromise,
    renusPromise,
    bayLineReportsPromise,
    aboProteksiPromise,
    aboHargiPromise,
    fourDxPromise,
    cePromise,
  ]);

  // Same "today"'s period each module's own page/sidebar-badge already uses
  // (see src/lib/nav-badges.ts) — the homepage has no month/week filter of
  // its own, so this is always "right now," not a user-chosen period.
  const aboWeekLabel = defaultAboWeekLabel();
  const fourDxPeriod = resolvePeriodRange(fourDx.currentPeriodLabel, fourDx.periodBoundaries, fourDx.currentYear);

  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    trafoHv: disturbances.error ? null : disturbances.trafoHv,
    trafoLv: disturbances.error ? null : disturbances.trafoLv,
    ahi: ahi.data,
    bayLineReports: bayLineReports.length > 0 ? bayLineReports : null,
    renusReminders: renus.error ? null : renus.reminders,
    abo:
      aboProteksi.error || aboHargi.error
        ? null
        : {
            proteksiPrograms: buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
            hargiPrograms: buildAboSnapshotComputed(aboHargi, aboWeekLabel),
            weekLabel: aboWeekLabel,
          },
    fourDx: fourDx.error ? null : buildFourDxWigs(fourDx.wigs, fourDxPeriod, fourDx.realizations, fourDx.monitoring),
    ce: ce.error ? null : ce,
  });

  return <ManagementAttentionSection initialInsights={managementAttention} />;
}

async function UltgAttentionRollupSection({
  aboProteksiPromise,
  aboHargiPromise,
  fourDxPromise,
  cePromise,
  ahiPromise,
  renusPromise,
  disturbancesPromise,
  assetScanningPromise,
}: {
  aboProteksiPromise: Promise<AboSnapshot>;
  aboHargiPromise: Promise<AboSnapshot>;
  fourDxPromise: Promise<FourDxSnapshot>;
  cePromise: Promise<CeSnapshot>;
  ahiPromise: Promise<AhiResult>;
  renusPromise: Promise<RenusData>;
  disturbancesPromise: Promise<DisturbancesResult>;
  assetScanningPromise: Promise<AssetScanningResult>;
}) {
  const [aboProteksi, aboHargi, fourDx, ce, ahi, renus, disturbances, assetScanning] = await Promise.all([
    aboProteksiPromise,
    aboHargiPromise,
    fourDxPromise,
    cePromise,
    ahiPromise,
    renusPromise,
    disturbancesPromise,
    assetScanningPromise,
  ]);

  const aboWeekLabel = defaultAboWeekLabel();
  const aboEntries: UltgCountEntry[] =
    aboProteksi.error || aboHargi.error
      ? []
      : buildAboUltgResume([
          ...buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
          ...buildAboSnapshotComputed(aboHargi, aboWeekLabel),
        ]).map((e) => ({ ultg: e.ultg, count: e.programsEvaluated - e.programsTercapai }));

  const fourDxEntries: UltgCountEntry[] = fourDx.error
    ? []
    : buildFourDxUltgResume(
        buildFourDxWigs(
          fourDx.wigs,
          resolvePeriodRange(fourDx.currentPeriodLabel, fourDx.periodBoundaries, fourDx.currentYear),
          fourDx.realizations,
          fourDx.monitoring,
        ),
      ).map((e) => ({ ultg: e.ultg, count: e.lmsEvaluated - e.lmsTercapai }));

  const ceEntries: UltgCountEntry[] = ce.error
    ? []
    : buildCeSummary(ce.items).byUltg.map((e) => ({ ultg: e.label, count: e.open }));

  const ahiEntries: UltgCountEntry[] = ahi.data
    ? buildAhiUltgResume(ahi.data.anomalies).map((e) => ({ ultg: e.ultg, count: e.critical }))
    : [];

  // Same "overdue, all periods" definition as buildRenusReminders — not
  // scoped to the page's own view/filter (there is none here on the
  // homepage), just every active row past its own rencana date.
  const renusEntries: UltgCountEntry[] = renus.error
    ? []
    : buildRenusUltgResume(renus.rows, renus.today).map((e) => ({ ultg: e.ultg, count: e.overdue }));

  const disturbanceOpenByUltg = new Map<string, number>();
  if (!disturbances.error) {
    for (const category of [disturbances.transmisi, disturbances.trafoHv, disturbances.trafoLv]) {
      for (const u of category.ultgBreakdown) {
        disturbanceOpenByUltg.set(u.ultg, (disturbanceOpenByUltg.get(u.ultg) ?? 0) + u.followUp.open);
      }
    }
  }
  const disturbanceEntries: UltgCountEntry[] = [...disturbanceOpenByUltg.entries()].map(([ultg, count]) => ({ ultg, count }));

  const assetOpenByUltg = new Map<string, number>();
  if (assetScanning.data) {
    for (const a of assetScanning.data.anomali) {
      if ((a.status ?? "").toUpperCase() === "SELESAI") continue;
      assetOpenByUltg.set(a.ultg, (assetOpenByUltg.get(a.ultg) ?? 0) + 1);
    }
  }
  const assetEntries: UltgCountEntry[] = [...assetOpenByUltg.entries()].map(([ultg, count]) => ({ ultg, count }));

  const rollup = buildUltgAttentionRollup({
    abo: aboEntries,
    fourDx: fourDxEntries,
    ce: ceEntries,
    ahi: ahiEntries,
    renus: renusEntries,
    disturbances: disturbanceEntries,
    dataAset: assetEntries,
  });

  return <UltgAttentionRollupTable entries={rollup} />;
}

async function GapToTargetSection({ uptPromise }: { uptPromise: Promise<UptPerformanceResult> }) {
  const upt = await uptPromise;
  return upt.data ? (
    <UptGapToTarget kpis={upt.data.kpis} />
  ) : (
    <DataUnavailable message="Kinerja UPT belum tersedia." />
  );
}

async function ParetoSection({ disturbancesPromise }: { disturbancesPromise: Promise<DisturbancesResult> }) {
  const disturbances = await disturbancesPromise;
  if (disturbances.error) {
    return <DataUnavailable message="Sinkronisasi Gangguan belum berhasil. Lihat halaman Data & Sync." />;
  }
  if (disturbances.transmisi.causePareto.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada gangguan yang masuk kinerja.</p>;
  }
  return <DisturbanceParetoChart data={disturbances.transmisi.causePareto} />;
}

async function GiCorrelationSection({
  disturbancesPromise,
  ahiPromise,
  cePromise,
  renusPromise,
}: {
  disturbancesPromise: Promise<DisturbancesResult>;
  ahiPromise: Promise<AhiResult>;
  cePromise: Promise<CeSnapshot>;
  renusPromise: Promise<RenusData>;
}) {
  const [disturbances, ahi, ce, renus] = await Promise.all([
    disturbancesPromise,
    ahiPromise,
    cePromise,
    renusPromise,
  ]);
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
          ceItems: ce.error ? [] : ce.items,
          renusRows: renus.error ? [] : renus.rows,
        })
      : null;

  return giCorrelation ? (
    <GiCorrelationTable rows={giCorrelation} />
  ) : (
    <DataUnavailable message="Data Gangguan atau AHI belum tersedia untuk korelasi ini." />
  );
}

async function SeasonalReadinessSection({
  disturbancesPromise,
  renusPromise,
  aboProteksiPromise,
  aboHargiPromise,
}: {
  disturbancesPromise: Promise<DisturbancesResult>;
  renusPromise: Promise<RenusData>;
  aboProteksiPromise: Promise<AboSnapshot>;
  aboHargiPromise: Promise<AboSnapshot>;
}) {
  const [disturbances, renus, aboProteksi, aboHargi] = await Promise.all([
    disturbancesPromise,
    renusPromise,
    aboProteksiPromise,
    aboHargiPromise,
  ]);

  if (disturbances.error) {
    return <DataUnavailable message="Sinkronisasi Gangguan belum berhasil. Lihat halaman Data & Sync." />;
  }

  const todayMonthIndex = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", month: "2-digit" }).format(new Date()),
  ) - 1;

  const readiness = buildSeasonalReadiness({
    disturbances,
    renusRows: renus.error ? [] : renus.rows,
    aboSnapshots: [aboProteksi, aboHargi].filter((s) => !s.error),
    todayMonthIndex,
  });

  return <SeasonalReadinessCard months={upcomingRiskyMonths(readiness, 3)} />;
}
