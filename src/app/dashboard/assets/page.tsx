import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import { AssetScanningView } from "@/components/assets/asset-scanning-view";
import { getAssetScanning } from "@/services/asset-scanning";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function AssetsPage() {
  const result = await getAssetScanning();

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHero
          title="Data Aset"
          description="Hasil scanning proteksi (MPU/BPU/Buspro) dan anomali per ULTG, GI, dan ruas — dari REKAPITULASI SCANNING."
          status={
            !result.error ? (
              <>
                <span className="size-1.5 rounded-full bg-success" />
                Data synchronized
              </>
            ) : null
          }
          actions={!result.error ? <ExportPdfButton /> : null}
        />
      </div>

      {result.error || !result.data ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi Data Aset belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : (
        <AssetScanningView snapshot={result.data} />
      )}

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: REKAPITULASI SCANNING · Sheet: MPU BAY LINE, BPU BAY LINE, MPU BUSPRO, ANOMALI · Provider: Apps Script
      </p>
    </div>
  );
}
