import { Suspense } from "react";
import { CheckCircle2, Server, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataSyncTable } from "@/components/dashboard/data-sync-table";
import { PageHero } from "@/components/dashboard/page-hero";
import { getDataProvider } from "@/lib/data-provider-registry";
import { dataSourceHealth } from "@/lib/mock-data";
import { listSyncHistory, listSyncStatus } from "@/lib/sync-status";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getDisturbances } from "@/services/disturbances";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getUptPerformance } from "@/services/upt-performance";
import type { DataSourceHealth } from "@/types";

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why — Apps Script's own latency
// varies a lot (measured 5-30s for the same request), and this page reads
// several sources too.
export const maxDuration = 60;

// Same streaming fix as the homepage/Laporan Eksekutif/AHI/Disturbances/
// Kesehatan Data: all 5 calls kicked off here (not awaited) so the page
// shell streams immediately instead of blocking on all 5 before any html
// goes out.
export default function DataSyncPage() {
  const provider = getDataProvider();
  // Triggers (or reuses the cached result of) the one real sync so its
  // status below reflects this page load, not whatever the Overview page
  // happened to leave in the registry earlier.
  const ultgPromise = getUltgPerformance();
  const disturbancesPromise = getDisturbances();
  const uptPromise = getUptPerformance();
  const ahiPromise = getAhiPerformance();
  const gatewayHealthPromise = provider.health();

  return (
    <div className="flex flex-col gap-4">
      <PageHero title="Data Health" description="Status sinkronisasi tiap file + sheet yang menjadi input dashboard." />

      <Suspense fallback={<DataSyncFallback />}>
        <DataSyncBody
          provider={provider}
          ultgPromise={ultgPromise}
          disturbancesPromise={disturbancesPromise}
          uptPromise={uptPromise}
          ahiPromise={ahiPromise}
          gatewayHealthPromise={gatewayHealthPromise}
        />
      </Suspense>
    </div>
  );
}

function DataSyncFallback() {
  return (
    <>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

async function DataSyncBody({
  provider,
  ultgPromise,
  disturbancesPromise,
  uptPromise,
  ahiPromise,
  gatewayHealthPromise,
}: {
  provider: ReturnType<typeof getDataProvider>;
  ultgPromise: ReturnType<typeof getUltgPerformance>;
  disturbancesPromise: ReturnType<typeof getDisturbances>;
  uptPromise: ReturnType<typeof getUptPerformance>;
  ahiPromise: ReturnType<typeof getAhiPerformance>;
  gatewayHealthPromise: ReturnType<typeof provider.health>;
}) {
  const [, , , , gatewayHealth] = await Promise.all([
    ultgPromise,
    disturbancesPromise,
    uptPromise,
    ahiPromise,
    gatewayHealthPromise,
  ]);
  const liveStatus = listSyncStatus();
  const lastSyncOverall = liveStatus.reduce<Date | null>(
    (latest, entry) => (entry.lastSync && (!latest || entry.lastSync > latest) ? entry.lastSync : latest),
    null,
  );

  const rows: DataSourceHealth[] = [
    ...liveStatus.map((entry): DataSourceHealth => {
      // A missing spreadsheet file means this module's integration was
      // never actually set up yet — that's "Coming Soon", not a sync
      // failure of something that used to work. Showing a red error for a
      // file that was never expected to exist would misrepresent an
      // executive-facing page as broken when it's simply not started.
      const notYetConfigured = entry.status === "error" && (entry.error ?? "").includes("tidak ditemukan");
      return {
        key: entry.key,
        module: entry.module,
        file: entry.file,
        sheet: entry.sheet,
        provider: notYetConfigured ? null : entry.provider,
        lastSync: notYetConfigured ? null : formatTime(entry.lastSync),
        rows: notYetConfigured ? null : entry.rows,
        status: notYetConfigured ? "pending" : entry.status,
        error: notYetConfigured ? null : entry.error,
        history: notYetConfigured
          ? []
          : listSyncHistory(entry.key).map((h) => ({
              timestamp: formatTime(h.timestamp) ?? "-",
              status: h.status,
              rows: h.rows,
              error: h.error,
            })),
      };
    }),
    ...dataSourceHealth,
  ];

  return (
    <>
      <Card className="overflow-hidden py-0">
        <div className="flex items-center gap-4 p-5" style={{ backgroundImage: "var(--gradient-hero)" }}>
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
              gatewayHealth.healthy ? "bg-success/15 text-success" : "bg-critical/15 text-critical"
            }`}
          >
            <Server className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Data Provider</p>
            <p className="text-base font-extrabold text-foreground">
              {provider.name === "apps-script" ? "Google Apps Script Gateway" : "Google Drive API (service account)"}
            </p>
            {lastSyncOverall ? (
              <p className="mt-0.5 text-xs text-muted-foreground">Last sync: {formatTime(lastSyncOverall)}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold ${
              gatewayHealth.healthy ? "border-success/40 bg-success/20 text-success" : "border-critical/40 bg-critical/20 text-critical"
            }`}
          >
            {gatewayHealth.healthy ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {gatewayHealth.healthy ? "Healthy" : "Unavailable"}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-extrabold">Sumber Data</CardTitle>
        </CardHeader>
        <CardContent>
          <DataSyncTable rows={rows} />
        </CardContent>
      </Card>
    </>
  );
}
