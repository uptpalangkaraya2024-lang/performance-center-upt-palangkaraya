import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { PageHero } from "@/components/dashboard/page-hero";
import { AhiExecutiveSummary } from "@/components/ahi/ahi-executive-summary";
import { AhiKpiCard } from "@/components/ahi/ahi-kpi-card";
import { AhiAnomalyTable } from "@/components/ahi/ahi-anomaly-table";
import { AhiCategoryDetail } from "@/components/ahi/ahi-category-detail";
import { AhiDataDetail } from "@/components/ahi/ahi-data-detail";
import { getAhiPerformance } from "@/services/ahi-performance";

export const dynamic = "force-dynamic";

export default async function AhiPage() {
  const result = await getAhiPerformance();

  if (result.error || !result.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHero
          title="AHI UPT Palangkaraya"
          description="Healthy Index Monitoring 2026 — Unit Induk UIP3B Kalimantan / UPT Palangkaraya"
        />
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Data source temporarily unavailable. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { sections, anomalies, lastUpdate } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="AHI UPT Palangkaraya"
        description="Healthy Index Monitoring 2026 — Unit Induk UIP3B Kalimantan / UPT Palangkaraya"
        status={
          <>
            <span className="size-1.5 rounded-full bg-success" />
            Data synchronized
            {lastUpdate ? ` · Last update: ${lastUpdate}` : null}
          </>
        }
        actions={
          <ExportExcelButton
            filename="AHI-UPT-Palangkaraya.xlsx"
            sheets={[
              {
                name: "Kategori",
                rows: sections.flatMap((section) =>
                  section.categories.map((category) => ({
                    Section: section.displayName,
                    Kategori: category.displayName,
                    "Jumlah Data": category.jumlahDataTercatat ?? "",
                    "Kualitas Data": category.kualitasData ?? "",
                    "Score AHI": category.score ?? "",
                    Status: category.status,
                    Best: category.distribution.best ?? "",
                    Good: category.distribution.good ?? "",
                    Fair: category.distribution.fair ?? "",
                    Poor: category.distribution.poor ?? "",
                    Critical: category.distribution.critical ?? "",
                  })),
                ),
              },
              {
                name: "Anomaly",
                rows: anomalies.map((a) => ({
                  ULTG: a.ultg,
                  GI: a.gi,
                  Bay: a.bay,
                  "Jenis Aset": a.jenisAset,
                  Fasa: a.fasa,
                  Merk: a.merk,
                  "Parameter Pemicu": a.parameterPemicuAhi,
                  "Kategori AHI": a.kategoriAhi,
                  "vs SKDIR": a.kategoriAhiVsSkdir,
                  "Sub Sistem": a.subSistem,
                  "Rencana Tindak Lanjut": a.rencanaTindakLanjut,
                  "Target Waktu": a.targetWaktu,
                })),
              },
            ]}
          />
        }
      />

      <AhiExecutiveSummary sections={sections} totalAnomalies={anomalies.length} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Asset Health Breakdown</h2>
          <p className="text-xs text-muted-foreground">
            Healthy Index per KPI utama — MTU, Catu Daya, Trafo, dan Reaktor.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sections.map((section) => (
            <AhiKpiCard key={section.key} section={section} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anomaly Perlu Perhatian</CardTitle>
          <p className="text-xs text-muted-foreground">
            Rekap anomali Poor &amp; Critical MTU &amp; Trafo — hasil rekapan langsung dari sumber data (AM:BA).
          </p>
        </CardHeader>
        <CardContent>
          <AhiAnomalyTable records={anomalies} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Detail per Kategori</h2>
          <p className="text-xs text-muted-foreground">
            Rincian tiap kategori AHI per kelompok — skor, distribusi hasil pengujian, dan parameter pemeriksaan.
          </p>
        </div>
        <AhiCategoryDetail sections={sections} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Detail</CardTitle>
          <p className="text-xs text-muted-foreground">Audit seluruh parameter pemeriksaan dari sumber A:W.</p>
        </CardHeader>
        <CardContent>
          <AhiDataDetail sections={sections} />
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Source: AHI UPT Palangkaraya 2026 fixed · Sheet: HI UPT · Range: A:W + AM:BA · Provider: Apps Script
      </p>
    </div>
  );
}
