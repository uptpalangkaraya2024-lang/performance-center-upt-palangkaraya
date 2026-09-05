import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { RenusClient } from "@/components/renus/renus-client";
import { getRenusData } from "@/services/renus";
import { listSyncStatus } from "@/lib/sync-status";

export const dynamic = "force-dynamic";

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

export default async function RenusPage() {
  const data = await getRenusData();
  const syncEntry = listSyncStatus().find((entry) => entry.module === "RENUS");
  const lastUpdate = formatTime(syncEntry?.lastSync ?? null);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="RENUS"
        description="Rencana & Monitoring Pemeliharaan — sumber data sheet MONITORING, periode kerja Jumat–Kamis."
        status={
          !data.error ? (
            <>
              <span className="size-1.5 rounded-full bg-success" />
              Data synchronized
              {lastUpdate ? ` · Last update: ${lastUpdate}` : null}
              {` · ${data.summary.total.toLocaleString("id-ID")} pekerjaan aktif`}
            </>
          ) : null
        }
      />

      {data.error ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi RENUS belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : (
        <RenusClient data={data} />
      )}
    </div>
  );
}
