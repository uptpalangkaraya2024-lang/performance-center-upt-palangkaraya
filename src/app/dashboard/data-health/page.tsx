import { Card, CardContent } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { DataHealthView } from "@/components/dashboard/data-health-view";
import { buildDataHealthReport } from "@/lib/data-health";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getRenusData } from "@/services/renus";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function DataHealthPage() {
  const [ce, renus, ahi, aboProteksi, aboHargi] = await Promise.all([
    getCeSnapshot(),
    getRenusData(),
    getAhiPerformance(),
    getAboProteksiSnapshot(),
    getAboHargiSnapshot(),
  ]);

  const report = buildDataHealthReport({
    ceItems: ce.error ? [] : ce.items,
    renusRows: renus.error ? [] : renus.rows,
    anomalies: ahi.data ? ahi.data.anomalies : [],
    aboSnapshots: [
      { label: "Proteksi", snapshot: aboProteksi },
      { label: "Hargi", snapshot: aboHargi },
    ].filter((s) => !s.snapshot.error),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 print:hidden">
        <PageHero
          title="Kesehatan Data"
          description="Pemeriksaan otomatis atas data live dari setiap modul — nilai ULTG yang tidak dikenali, kolom atribusi (GI) yang kosong, dan nama GI yang mirip tapi tidak identik antar modul. Bukan untuk memperbaiki data, hanya menunjukkan di mana sheet sumber perlu dirapikan."
        />
      </div>

      <Card>
        <CardContent className="py-6">
          <DataHealthView checks={report.checks} giNamePairs={report.giNamePairs} />
        </CardContent>
      </Card>
    </div>
  );
}
