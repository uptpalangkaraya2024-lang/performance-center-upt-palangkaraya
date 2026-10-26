import { Card, CardContent } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { RuasInfografisClient } from "@/components/assets/ruas-infografis-client";
import { buildRuasInfographic, detectRuasCircuits } from "@/lib/ruas-infographic";
import { buildOutageImpact } from "@/lib/outage-impact";
import { getSuttSnapshot } from "@/services/sutt-asset";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReports } from "@/services/ahi-bay-line-report";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getRenusData } from "@/services/renus";
import { getGangguanHistoryByTowerGi } from "@/services/gangguan-history";

export const dynamic = "force-dynamic";
// See src/app/dashboard/page.tsx for why.
export const maxDuration = 60;

export default async function RuasInfografisPage() {
  const [sutt, ahi, bayLineReports, ce, aboProteksi, aboHargi, renus, gangguanByTowerGi] = await Promise.all([
    getSuttSnapshot(),
    getAhiPerformance(),
    getAllBayLineReports(),
    getCeSnapshot(),
    getAboProteksiSnapshot(),
    getAboHargiSnapshot(),
    getRenusData(),
    getGangguanHistoryByTowerGi(),
  ]);

  if (sutt.error || sutt.ruasList.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="Infografis Ruas"
          description="Ringkasan kondisi per ruas SUTT — AHI, CE, riwayat gangguan, ABO, dan sinkronisasi jadwal padam dalam satu tampilan."
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Data ruas SUTT belum tersedia. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const aboRuasItems = [...aboProteksi.programs, ...aboHargi.programs].flatMap((p) => p.ruasItems);
  const outageImpactBySection = new Map(buildOutageImpact(sutt.ruasList).map((r) => [r.section, r]));

  const ahiAnomalies = ahi.data ? ahi.data.anomalies : [];
  const ceItems = ce.error ? [] : ce.items;
  const renusRows = renus.error ? [] : renus.rows;

  // Most SUTT corridors carry 2 physical circuits on shared towers — see
  // detectRuasCircuits's own comment. Each detected circuit gets its own
  // card (one ruas can now produce 1 or 2 summaries, not always exactly
  // 1), since AHI condition is tracked independently per circuit even
  // though the towers/route/outage risk underneath are identical.
  const summaries = sutt.ruasList.flatMap((ruas) =>
    detectRuasCircuits(ruas, bayLineReports, ahiAnomalies).map((circuit) =>
      buildRuasInfographic({
        ruas,
        circuit,
        ahiAnomalies,
        ahiBayLineReports: bayLineReports,
        ceItems,
        aboRuasItems,
        renusRows,
        gangguanByTowerGi,
        todayISO: renus.today,
        outageImpactBySection,
      }),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Infografis Ruas"
        description="Ringkasan kondisi per ruas SUTT — AHI, CE, riwayat gangguan, ABO, dan sinkronisasi jadwal padam dalam satu tampilan."
      />
      <RuasInfografisClient summaries={summaries} />
    </div>
  );
}
