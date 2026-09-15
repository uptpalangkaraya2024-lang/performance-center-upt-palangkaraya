import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { FourDxView } from "@/components/four-dx/four-dx-view";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getFourDxOutcomeSnapshot } from "@/services/four-dx-gangguan";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why — 4DX reads 9 sheets, the
// heaviest single module in the dashboard.
export const maxDuration = 60;

export default async function FourDxPage() {
  const [snapshot, outcome] = await Promise.all([getFourDxSnapshot(), getFourDxOutcomeSnapshot()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHero
          title="4DX Transmisi UPT Palangkaraya"
          description="Target dan realisasi mingguan tiap Lead Measure (LM) per WIG — dihitung otomatis dari periode berjalan (tanggal server), menggantikan update manual mingguan."
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
            <DataUnavailable message="Sinkronisasi 4DX belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : (
        <FourDxView snapshot={snapshot} outcome={outcome} />
      )}

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: [02] Monitoring 4DX Transmisi UPT Palangkaraya 2026 · Sheet: TARGET WIG 1-4, ULTG Palangkaraya/Pangkalan
        Bun/Muara Teweh, K3 UPT Palangkaraya · Korelasi Gangguan: 2026_Kertas Kerja 4DX UIP3B Kalimantan (Data Gangguan)
        · Provider: Apps Script
      </p>
    </div>
  );
}
