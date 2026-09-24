import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { DisturbancePresentationView } from "@/components/disturbances/disturbance-presentation-view";
import { getDisturbances } from "@/services/disturbances";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function DisturbancePresentationPage() {
  const result = await getDisturbances();

  if (result.error) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi Rekap Gangguan belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DisturbancePresentationView transmisi={result.transmisi} trafoHv={result.trafoHv} trafoLv={result.trafoLv} />
  );
}
