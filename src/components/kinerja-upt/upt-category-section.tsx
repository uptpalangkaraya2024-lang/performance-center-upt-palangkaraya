import type { UptKpi, UptKpiCategory } from "@/types";
import { UptKpiCard } from "./upt-kpi-card";

export const CATEGORY_META: Record<UptKpiCategory, { title: string; description: string }> = {
  availability: {
    title: "Availability & Recovery",
    description: "Ketersediaan trafo & transmisi, serta kecepatan pemulihan gangguan.",
  },
  disturbance: {
    title: "Disturbance Performance",
    description: "Frekuensi gangguan pada sirkit, trafo, dan peralatan bay.",
  },
  protection: {
    title: "Protection Performance",
    description: "Kinerja sistem proteksi — security, dependability, dan auto reclose.",
  },
  finance: {
    title: "Finance & Control",
    description: "Pengendalian anggaran investasi dan biaya non-allowable.",
  },
  "asset-legal": {
    title: "Asset Legal",
    description: "Penyelesaian dokumen legal aset tanah PLN.",
  },
  "asset-maturity": {
    title: "Asset Management Maturity",
    description: "Kematangan tata kelola dan kualitas data manajemen aset.",
  },
};

export function UptCategorySection({ category, kpis }: { category: UptKpiCategory; kpis: UptKpi[] }) {
  const meta = CATEGORY_META[category];
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{meta.title}</h2>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <UptKpiCard key={kpi.key} kpi={kpi} />
        ))}
      </div>
    </section>
  );
}
