import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { FourDxView } from "@/components/four-dx/four-dx-view";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getFourDxOutcomeSnapshot } from "@/services/four-dx-gangguan";
import type { FourDxOutcomeSnapshot, FourDxSnapshot } from "@/types";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why — 4DX reads 9 sheets, the
// heaviest single module in the dashboard.
export const maxDuration = 60;

// Same streaming fix as the homepage/Laporan Eksekutif: the fetch is kicked
// off here (not awaited) so the page shell streams immediately instead of
// blocking on 4DX's own 9-sheet read before any html goes out.
export default function FourDxPage() {
  const snapshotPromise = getFourDxSnapshot();
  const outcomePromise = getFourDxOutcomeSnapshot();

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHero
          title="4DX Transmisi UPT Palangkaraya"
          description="Target dan realisasi mingguan tiap Lead Measure (LM) per WIG — dihitung otomatis dari periode berjalan (tanggal server), menggantikan update manual mingguan."
          status={
            <Suspense fallback={<span>Memuat status sinkronisasi...</span>}>
              <SyncStatus snapshotPromise={snapshotPromise} />
            </Suspense>
          }
        />
      </div>

      <Suspense fallback={<FourDxFallback />}>
        <FourDxBody snapshotPromise={snapshotPromise} outcomePromise={outcomePromise} />
      </Suspense>

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: [02] Monitoring 4DX Transmisi UPT Palangkaraya 2026 · Sheet: TARGET WIG 1-4, ULTG Palangkaraya/Pangkalan
        Bun/Muara Teweh, K3 UPT Palangkaraya · Korelasi Gangguan: 2026_Kertas Kerja 4DX UIP3B Kalimantan (Data Gangguan)
        · Provider: Apps Script
      </p>
    </div>
  );
}

function FourDxFallback() {
  return (
    <Card>
      <CardContent className="py-6">
        <LoadingScreen />
      </CardContent>
    </Card>
  );
}

async function SyncStatus({ snapshotPromise }: { snapshotPromise: Promise<FourDxSnapshot> }) {
  const snapshot = await snapshotPromise;
  return !snapshot.error ? (
    <>
      <span className="size-1.5 rounded-full bg-success" />
      Data synchronized
    </>
  ) : null;
}

async function FourDxBody({
  snapshotPromise,
  outcomePromise,
}: {
  snapshotPromise: Promise<FourDxSnapshot>;
  outcomePromise: Promise<FourDxOutcomeSnapshot>;
}) {
  const [snapshot, outcome] = await Promise.all([snapshotPromise, outcomePromise]);

  return snapshot.error ? (
    <Card>
      <CardContent className="py-8">
        <DataUnavailable message="Sinkronisasi 4DX belum berhasil. Lihat halaman Data & Sync untuk detail." />
      </CardContent>
    </Card>
  ) : (
    <FourDxView snapshot={snapshot} outcome={outcome} />
  );
}
