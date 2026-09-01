import { CheckCircle2, Server, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataSyncTable } from "@/components/dashboard/data-sync-table";
import { PageHero } from "@/components/dashboard/page-hero";
import { getDataProvider } from "@/lib/data-provider-registry";
import { dataSourceHealth } from "@/lib/mock-data";
import { listSyncStatus } from "@/lib/sync-status";
import { getDisturbances } from "@/services/disturbances";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getUptPerformance } from "@/services/upt-performance";
import type { DataSourceHealth } from "@/types";

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

export const dynamic = "force-dynamic";

export default async function DataSyncPage() {
  const provider = getDataProvider();

  // Triggers (or reuses the cached result of) the one real sync so its
  // status below reflects this page load, not whatever the Overview page
  // happened to leave in the registry earlier.
  const [, , , gatewayHealth] = await Promise.all([
    getUltgPerformance(),
    getDisturbances(),
    getUptPerformance(),
    provider.health(),
  ]);
  const liveStatus = listSyncStatus();
  const lastSyncOverall = liveStatus.reduce<Date | null>(
    (latest, entry) => (entry.lastSync && (!latest || entry.lastSync > latest) ? entry.lastSync : latest),
    null,
  );

  const rows: DataSourceHealth[] = [
    ...liveStatus.map((entry): DataSourceHealth => ({
      key: entry.key,
      module: entry.module,
      file: entry.file,
      sheet: entry.sheet,
      provider: entry.provider,
      lastSync: formatTime(entry.lastSync),
      rows: entry.rows,
      status: entry.status,
      error: entry.error,
    })),
    ...dataSourceHealth,
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        title="Data Health"
        description="Status sinkronisasi tiap file + sheet yang menjadi input dashboard."
      />

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
            <p className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Data Provider</p>
            <p className="text-sm font-semibold text-foreground">
              {provider.name === "apps-script" ? "Google Apps Script Gateway" : "Google Drive API (service account)"}
            </p>
            {lastSyncOverall ? (
              <p className="mt-0.5 text-xs text-muted-foreground">Last sync: {formatTime(lastSyncOverall)}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ${
              gatewayHealth.healthy ? "bg-success/10 text-success" : "bg-critical/10 text-critical"
            }`}
          >
            {gatewayHealth.healthy ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {gatewayHealth.healthy ? "Healthy" : "Unavailable"}
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sumber Data</CardTitle>
        </CardHeader>
        <CardContent>
          <DataSyncTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
