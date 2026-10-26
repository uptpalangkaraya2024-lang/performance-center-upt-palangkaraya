import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiPrognosisChart } from "@/components/charts/kpi-prognosis-chart";
import { UptStatusBadge } from "@/components/kinerja-upt/upt-status-badge";
import { buildKpiPrognosisList, buildMonthlyAggregateSeries, buildStatusTransitionMatrix } from "@/lib/kpi-prognosis";
import type { StatusLevel, UptKpiDirection, UptKpiMonthlyPoint } from "@/types";

interface KpiLike {
  key: string;
  displayName: string;
  status: StatusLevel;
  direction: UptKpiDirection | null;
  targetValue: number | null;
  monthlyTrend: UptKpiMonthlyPoint[] | null;
}

const OUTCOME_LABEL: Record<string, string> = {
  proyeksi_tercapai: "Diproyeksikan hijau",
  tidak_tercapai_tahun_ini: "Tidak tercapai tahun ini",
  stagnan: "Stagnan/menurun",
  sudah_lewat_batas: "Sudah lewat batas",
  dalam_batas: "Masih dalam batas",
  sudah_capai_raw: "Realisasi mentah tercapai",
  data_tidak_cukup: "Data tidak cukup",
};

/** Performance prognosis ("Grafik Prognosa Kinerja") — per user's explicit
 *  request and reference design: a Jan-Dec bar+line chart of the average
 *  raw achievement ratio (real for reported months, projected for the
 *  rest of the year), plus a month-by-month Merah/Kuning matrix showing
 *  which currently-troubled KPIs are projected to still be red/yellow in
 *  each remaining month — a KPI that's projected to recover that month
 *  simply stops appearing. Reused as-is on both Kinerja UPT and Kinerja
 *  ULTG (just fed that page's own KPI array). */
export function KpiPrognosisSection({ kpis, label, year }: { kpis: KpiLike[]; label: string; year?: string }) {
  const series = buildMonthlyAggregateSeries(kpis);
  const matrix = buildStatusTransitionMatrix(kpis);
  const prognoses = buildKpiPrognosisList(kpis);
  const lastReportedLabel = series.find((p) => !p.isProjected && p.avgRatio !== null)
    ? [...series].reverse().find((p) => !p.isProjected && p.avgRatio !== null)?.monthLabel
    : null;

  if (series.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
          <TrendingUp className="size-5 text-primary" />
          Prognosa Kinerja — {label}
          {year ? <span className="text-sm font-normal text-muted-foreground">| s.d. Desember {year}</span> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Rata-rata rasio pencapaian mentah (realisasi/target, dibatasi 110% seperti kolom Capping 110% pada sheet) —
          bukan rumus Skor Kontrak resmi yang punya bobot/capping tersendiri. Batang gelap = sudah dilaporkan
          {lastReportedLabel ? ` (s.d. ${lastReportedLabel})` : ""}, batang pudar = proyeksi.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <KpiPrognosisChart data={series} />

        {matrix.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Proyeksi KPI Merah/Kuning per Bulan
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2.5 font-bold">Kinerja</th>
                    {matrix.map((col) => (
                      <th key={col.monthIndex} className="px-3 py-2.5 text-center font-bold">
                        {col.monthLabel.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="bg-critical px-3 py-2 font-bold text-white">MERAH</td>
                    {matrix.map((col) => (
                      <td key={col.monthIndex} className="px-3 py-2 align-top text-xs text-foreground">
                        {col.merah.map((name) => (
                          <div key={name} className="mb-1 last:mb-0">
                            {name}
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="bg-warning px-3 py-2 font-bold text-warning-foreground">KUNING</td>
                    {matrix.map((col) => (
                      <td key={col.monthIndex} className="px-3 py-2 align-top text-xs text-foreground">
                        {col.kuning.map((name) => (
                          <div key={name} className="mb-1 last:mb-0">
                            {name}
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              KPI yang tidak lagi muncul di suatu bulan diproyeksikan sudah hijau (tercapai) pada bulan tersebut. KPI
              berpolaritas &ldquo;semakin rendah semakin baik&rdquo; tetap ditampilkan di status saat ini tiap bulan —
              nilai kumulatifnya tidak bisa turun kembali dalam tahun berjalan (lihat rincian per KPI di bawah).
            </p>
          </div>
        ) : null}

        {prognoses.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-bold">KPI</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Proyeksi</th>
                  <th className="px-3 py-2.5 font-bold">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {prognoses.map((p) => (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{p.displayName}</td>
                    <td className="px-3 py-2">
                      <UptStatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold text-foreground">
                      {p.projectedMonthLabel ?? OUTCOME_LABEL[p.outcome]}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-success">
            Tidak ada KPI berstatus Warning/Critical saat ini.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
