import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { UptDashboardClient } from "@/components/kinerja-upt/upt-dashboard-client";
import { getUptPerformance } from "@/services/upt-performance";

export const dynamic = "force-dynamic";

export default async function KinerjaUptPage() {
  const result = await getUptPerformance();

  if (result.error || !result.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="Kinerja UPT Palangkaraya"
          description="19 indikator kinerja kunci UPT Palangkaraya — target, realisasi, dan achievement."
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Data source temporarily unavailable. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <UptDashboardClient snapshot={result.data} />;
}
