import { CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataSyncTable } from "@/components/dashboard/data-sync-table";
import { getDataProvider } from "@/lib/data-provider-registry";
import { dataSourceHealth } from "@/lib/mock-data";
import { listSyncStatus } from "@/lib/sync-status";
import { getDisturbances } from "@/services/disturbances";
import { getUltgPerformance } from "@/services/ultg-performance";
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
  const [, , gatewayHealth] = await Promise.all([getUltgPerformance(), getDisturbances(), provider.health()]);
  const liveStatus = listSyncStatus();

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Data Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status sinkronisasi tiap file + sheet yang menjadi input dashboard.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium">Data Provider</p>
            <p className="text-xs text-muted-foreground">
              {provider.name === "apps-script" ? "Google Apps Script Gateway" : "Google Drive API (service account)"}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${gatewayHealth.healthy ? "text-success" : "text-critical"}`}
          >
            {gatewayHealth.healthy ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {gatewayHealth.healthy ? "Healthy" : "Unavailable"}
          </span>
        </CardContent>
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
