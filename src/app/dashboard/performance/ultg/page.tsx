import { Card, CardContent } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { UltgDashboardClient } from "@/components/kinerja-ultg/ultg-dashboard-client";
import { getUltgPerformance } from "@/services/ultg-performance";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function KinerjaUltgPage() {
  const result = await getUltgPerformance();

  if (result.error || !result.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="Kinerja ULTG"
          description="Tabel KPI, target, actual, achievement, ranking, dan gap to target tiap ULTG."
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Data source temporarily unavailable. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  return <UltgDashboardClient snapshots={result.data} />;
}
