import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHero } from "@/components/dashboard/page-hero";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import { buildUltgRanking } from "@/components/kinerja-ultg/ultg-ranking-table";
import { buildGiCorrelation } from "@/lib/asset-correlation";
import { buildMaintenanceProposals } from "@/lib/maintenance-proposals";
import { findAhiDegradationAlerts } from "@/lib/ahi-degradation";
import { buildAhiTrendProjections } from "@/lib/ahi-trend-projection";
import { buildManagementAttention } from "@/lib/executive-insights";
import { buildNarrativeReport } from "@/lib/narrative-report";
import { buildAboSnapshotComputed, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getDisturbances } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReportsWithHistory } from "@/services/ahi-bay-line-report";
import { getRenusData } from "@/services/renus";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function LaporanEksekutifPage() {
  const [upt, ultg, disturbances, ahi, bayLineReports, renus, aboProteksi, aboHargi, fourDx, ce] = await Promise.all([
    getUptPerformance(),
    getUltgPerformance(),
    getDisturbances(),
    getAhiPerformance(),
    getAllBayLineReportsWithHistory(),
    getRenusData(),
    getAboProteksiSnapshot(),
    getAboHargiSnapshot(),
    getFourDxSnapshot(),
    getCeSnapshot(),
  ]);

  const aboWeekLabel = defaultAboWeekLabel();
  const fourDxPeriod = resolvePeriodRange(fourDx.currentPeriodLabel, fourDx.periodBoundaries, fourDx.currentYear);
  const fourDxWigs = fourDx.error ? null : buildFourDxWigs(fourDx.wigs, fourDxPeriod, fourDx.realizations, fourDx.monitoring);

  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    trafoHv: disturbances.error ? null : disturbances.trafoHv,
    trafoLv: disturbances.error ? null : disturbances.trafoLv,
    ahi: ahi.data,
    bayLineReports: bayLineReports.length > 0 ? bayLineReports : null,
    renusReminders: renus.error ? null : renus.reminders,
    abo:
      aboProteksi.error || aboHargi.error
        ? null
        : {
            proteksiPrograms: buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
            hargiPrograms: buildAboSnapshotComputed(aboHargi, aboWeekLabel),
            weekLabel: aboWeekLabel,
          },
    fourDx: fourDxWigs,
    ce: ce.error ? null : ce,
  });

  const giCorrelation =
    !disturbances.error && ahi.data
      ? buildGiCorrelation({
          trafoGi: [...disturbances.trafoHv.giBreakdown, ...disturbances.trafoLv.giBreakdown],
          transmisiGi: disturbances.transmisi.giBreakdown,
          anomalies: ahi.data.anomalies,
          ceItems: ce.error ? [] : ce.items,
          renusRows: renus.error ? [] : renus.rows,
        })
      : [];
  const degradationAlerts = findAhiDegradationAlerts(bayLineReports);
  const trendProjections = buildAhiTrendProjections(bayLineReports);
  const topProposals = buildMaintenanceProposals({ giCorrelation, bayLineReports, degradationAlerts, trendProjections });

  const renusOverdueCount = renus.error
    ? 0
    : renus.rows.filter((r) => !r.realisasiDate && r.status !== "BATAL" && r.sapWoStatus !== "CANC" && r.rencanaDate < renus.today).length;

  const sections = buildNarrativeReport({
    periodLabel: upt.data?.periodLabel ?? new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
    upt: upt.data,
    ultgRanking: ultg.data ? buildUltgRanking(ultg.data) : [],
    topProposals,
    renusSummary: renus.error ? null : renus.summary,
    renusOverdueCount,
    disturbanceTotal: disturbances.error ? null : disturbances.transmisi.summary.total,
    disturbanceTrip: disturbances.error ? null : disturbances.transmisi.summary.trip,
    disturbanceTopCause: disturbances.error ? null : (disturbances.transmisi.causePareto[0]?.cause ?? null),
    managementAttentionCritical: managementAttention.filter((i) => i.tone === "critical"),
  });

  const generatedAt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Laporan Eksekutif"
        description="Ringkasan naratif kinerja UPT, risiko utama, RENUS, dan Gangguan — disusun otomatis dari data yang sama dengan seluruh dashboard."
        actions={<ExportPdfButton landscape={false} />}
      />

      <Card className="print:shadow-none">
        <CardContent className="flex flex-col gap-6 py-6">
          <div className="border-b pb-3">
            <h1 className="text-xl font-extrabold text-foreground">Laporan Eksekutif — UPT Palangkaraya</h1>
            <p className="text-xs text-muted-foreground">Disusun otomatis pada {generatedAt} WIB.</p>
          </div>
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Data belum cukup untuk menyusun laporan.</p>
          ) : (
            sections.map((section) => (
              <div key={section.heading} className="flex flex-col gap-2">
                <h2 className="text-base font-extrabold text-foreground">{section.heading}</h2>
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-foreground">
                    {p}
                  </p>
                ))}
              </div>
            ))
          )}
          <p className="border-t pt-3 text-[11px] text-muted-foreground">
            Laporan ini disusun otomatis dari data yang sama dengan seluruh dashboard (bukan hasil AI generatif) —
            setiap kalimat dapat ditelusuri kembali ke angka aslinya di modul masing-masing. Tinjau kembali sebelum
            digunakan sebagai laporan resmi.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
