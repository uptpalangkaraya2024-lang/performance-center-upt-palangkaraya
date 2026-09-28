import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ManagementAttentionSection } from "@/components/dashboard/management-attention-section";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { GiCorrelationTable } from "@/components/dashboard/gi-correlation-table";
import { PageHero } from "@/components/dashboard/page-hero";
import { UptPerformanceStatus } from "@/components/dashboard/upt-performance-status";
import { UptGapToTarget } from "@/components/dashboard/upt-gap-to-target";
import { UltgGapToTarget } from "@/components/kinerja-ultg/ultg-gap-to-target";
import { buildUltgRanking, RankBadge } from "@/components/kinerja-ultg/ultg-ranking-table";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getDisturbances, type DisturbancesResult } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReports } from "@/services/ahi-bay-line-report";
import { getRenusData } from "@/services/renus";
import { buildManagementAttention } from "@/lib/executive-insights";
import { buildGiCorrelation } from "@/lib/asset-correlation";
import { listSyncStatus } from "@/lib/sync-status";
import type {
  AhiResult,
  BayLineReport,
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
          />
        </Suspense>
      </div>

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
          <CardTitle className="text-lg font-extrabold">Gangguan &amp; Asset Health per GI</CardTitle>
          <p className="text-xs text-muted-foreground">
            Gabungan data Gangguan (per bay) dan AHI (per GI) — membantu melihat GI mana yang sekaligus sering
            gangguan dan asset health-nya bermasalah.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <GiCorrelationSection disturbancesPromise={disturbancesPromise} ahiPromise={ahiPromise} />
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
}: {
  uptPromise: Promise<UptPerformanceResult>;
  disturbancesPromise: Promise<DisturbancesResult>;
  ahiPromise: Promise<AhiResult>;
  renusPromise: Promise<RenusData>;
  bayLineReportsPromise: Promise<BayLineReport[]>;
}) {
  const [upt, disturbances, ahi, renus, bayLineReports] = await Promise.all([
    uptPromise,
    disturbancesPromise,
    ahiPromise,
    renusPromise,
    bayLineReportsPromise,
  ]);

  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    trafoHv: disturbances.error ? null : disturbances.trafoHv,
    trafoLv: disturbances.error ? null : disturbances.trafoLv,
    ahi: ahi.data,
    bayLineReports: bayLineReports.length > 0 ? bayLineReports : null,
    renusReminders: renus.error ? null : renus.reminders,
    abo: null,
    fourDx: null,
    ce: null,
  });

  return <ManagementAttentionSection initialInsights={managementAttention} />;
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
}: {
  disturbancesPromise: Promise<DisturbancesResult>;
  ahiPromise: Promise<AhiResult>;
}) {
  const [disturbances, ahi] = await Promise.all([disturbancesPromise, ahiPromise]);
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

  return giCorrelation ? (
    <GiCorrelationTable rows={giCorrelation} />
  ) : (
    <DataUnavailable message="Data Gangguan atau AHI belum tersedia untuk korelasi ini." />
  );
}
