import type { UltgKpi, UltgKpiCategory } from "@/types";
import { UltgKpiCard } from "./ultg-kpi-card";

export const CATEGORY_ORDER: UltgKpiCategory[] = [
  "availability",
  "disturbance",
  "protection",
  "maintenance-support",
  "abo-proteksi",
  "abo-jaringan",
  "abo-gardu-induk",
  "reporting",
  "konten",
];

export const CATEGORY_META: Record<UltgKpiCategory, { title: string; description: string }> = {
  availability: {
    title: "Faktor Ketersediaan Transmisi (TRAF dan CCAF)",
    description: "Ketersediaan trafo & transmisi, serta kecepatan pemulihan gangguan.",
  },
  disturbance: {
    title: "Keandalan Line Transmisi dan Trafo Transmisi",
    description: "Frekuensi gangguan pada sirkit, trafo, dan peralatan bay.",
  },
  protection: {
    title: "Pengendalian Kinerja Proteksi",
    description: "Security, dependability, auto reclose, dan reclose akibat gangguan.",
  },
  "maintenance-support": {
    title: "Optimalisasi Pendukung Pemeliharaan",
    description: "SLO dan Healthy Index peralatan.",
  },
  "abo-proteksi": {
    title: "Program Kerja ABO Bidang Proteksi",
    description: "Scanning koordinasi setting proteksi dan pelaporan bay trafo/penghantar.",
  },
  "abo-jaringan": {
    title: "Program Kerja ABO Bidang Jaringan",
    description: "ROW, thermovisi, pentanahan tower, dan New Srintami.",
  },
  "abo-gardu-induk": {
    title: "Program Kerja ABO Gardu Induk",
    description: "Thermo, partial discharge, LCM LA, inspeksi, dan proteksi binatang GI.",
  },
  reporting: {
    title: "Pengelolaan Laporan",
    description: "Laporan pemeliharaan periodik dan Fashar.",
  },
  konten: {
    title: "Konten",
    description: "Produksi konten tema Capturing The Moment.",
  },
};

export function UltgCategorySection({
  category,
  kpis,
  highlightKeys,
}: {
  category: UltgKpiCategory;
  kpis: UltgKpi[];
  highlightKeys?: Set<string>;
}) {
  const meta = CATEGORY_META[category];
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">{meta.title}</h2>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <UltgKpiCard key={kpi.key} kpi={kpi} highlighted={highlightKeys?.has(kpi.key)} />
        ))}
      </div>
    </section>
  );
}
