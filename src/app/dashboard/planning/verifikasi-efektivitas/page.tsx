import { Card, CardContent } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { VerifikasiEfektivitasClient } from "@/components/assets/verifikasi-efektivitas-client";
import { buildActionEffectivenessChecks } from "@/lib/action-effectiveness";
import { getRenusData } from "@/services/renus";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAllBayLineReportsWithHistory } from "@/services/ahi-bay-line-report";
import { getDisturbances } from "@/services/disturbances";
import { getGangguanHistoryByTowerGi } from "@/services/gangguan-history";
import { getSuttSnapshot } from "@/services/sutt-asset";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function VerifikasiEfektivitasPage() {
  const [renus, ce, bayLineReports, disturbances, gangguanByTowerGi, sutt] = await Promise.all([
    getRenusData(),
    getCeSnapshot(),
    getAllBayLineReportsWithHistory(),
    getDisturbances(),
    getGangguanHistoryByTowerGi(),
    getSuttSnapshot(),
  ]);

  if (renus.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="Verifikasi Efektivitas Tindak Lanjut"
          description="Apakah pekerjaan RENUS/CE yang sudah selesai benar-benar memperbaiki kondisi AHI dan mengurangi gangguan di GI tersebut?"
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi RENUS belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const checks = buildActionEffectivenessChecks({
    renusRows: renus.rows,
    ceItems: ce.error ? [] : ce.items,
    bayLineReports,
    disturbanceEvents: disturbances.error
      ? []
      : [...disturbances.transmisi.bayEvents, ...disturbances.trafoHv.bayEvents, ...disturbances.trafoLv.bayEvents],
    gangguanByTowerGi,
    ruasList: sutt.ruasList,
    todayISO: renus.today,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Verifikasi Efektivitas Tindak Lanjut"
        description="Pekerjaan RENUS/CE yang selesai dalam 1 tahun terakhir — dibandingkan sebelum vs sesudah: apakah kondisi AHI di GI tersebut membaik, dan apakah gangguan berkurang. Perbandingan langsung, bukan klaim sebab-akibat."
      />
      <VerifikasiEfektivitasClient checks={checks} />
    </div>
  );
}
