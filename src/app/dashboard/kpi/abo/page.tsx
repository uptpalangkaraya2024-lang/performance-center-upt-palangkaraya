import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { AboProteksiView } from "@/components/abo/abo-proteksi-view";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";

export const dynamic = "force-dynamic";

export default async function AboProteksiPage() {
  const snapshot = await getAboProteksiSnapshot();

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHero
          title="ABO Proteksi UPT Palangkaraya"
          description="Target dan realisasi kumulatif tiap program Anti Blackout (Proteksi) per UPT/ULTG/ruas — dihitung otomatis untuk periode yang dipilih."
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
            <DataUnavailable message="Sinkronisasi ABO Proteksi belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : (
        <AboProteksiView snapshot={snapshot} />
      )}

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: ABO 2026 SUB BID. PROTEKSI UIP3B KAL · Sheet: 🖥️ PKY, 📝 INPUT PKY · Provider: Apps Script
      </p>
    </div>
  );
}
