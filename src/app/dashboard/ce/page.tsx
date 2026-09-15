import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { CeView } from "@/components/ce/ce-view";
import { getCeSnapshot } from "@/services/ce-proteksi";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function CePage() {
  const snapshot = await getCeSnapshot();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 print:hidden">
        <PageHero
          title="CE (Common Enemy) UPT Palangkaraya"
          description="Temuan/anomali aset (elektrik & sipil/fasilitas) yang perlu ditindaklanjuti hingga close, per ULTG/GI/jenis aset — dihitung otomatis untuk periode yang dipilih."
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
        <CeView snapshot={snapshot} emptyMessage="Data CE belum tersedia — lihat halaman Data & Sync untuk detail." />
      )}

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: NEXT LEVEL MONITORING Common Enemy 2026 · Sheet: 🏭 INPUT CE PKY · Provider: Apps Script
      </p>
    </div>
  );
}
