import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { CeAnalysisView } from "@/components/ce/ce-analysis-view";
import { getCeSnapshot } from "@/services/ce-proteksi";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function CePage() {
  const snapshot = await getCeSnapshot();
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 print:hidden">
        <PageHero
          title="CE (Common Enemy) UPT Palangkaraya"
          description="Seluruh anomali aset UPT Palangkaraya, baik yang sudah masuk CE 2026 maupun yang belum: status, sebaran per ULTG/GI/stream/jenis aset, masalah sistemik, kandidat CE berikutnya, anggaran, dan kelengkapan data."
          status={
            !snapshot.error ? (
              <>
                <span className="size-1.5 rounded-full bg-success" />
                Data synchronized
              </>
            ) : null
          }
        />
      </div>

      {snapshot.error ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi CE belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : (
        <CeAnalysisView items={snapshot.items} budgetUnlinked={snapshot.budgetUnlinked ?? []} todayISO={todayISO} />
      )}

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: Monitoring Common Enemy UPT Palangkaraya · Sheet: INPUT ULTG PKY, INPUT ULTG PBN, INPUT ULTG MTW, ALOKASI
        ANGGARAN · Provider: Apps Script
      </p>
    </div>
  );
}
