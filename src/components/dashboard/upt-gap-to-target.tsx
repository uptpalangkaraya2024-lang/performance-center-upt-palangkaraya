import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { UptKpi } from "@/types";
import { UptStatusBadge } from "@/components/kinerja-upt/upt-status-badge";

// Only KPIs that missed target this period — the point is "what needs
// attention", not a full re-listing of all 19 (that's Kinerja UPT itself).
export function UptGapToTarget({ kpis }: { kpis: UptKpi[] }) {
  const gaps = kpis
    .filter((k) => k.status === "warning" || k.status === "critical")
    .sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0))
    .slice(0, 5);

  if (gaps.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Semua KPI UPT mencapai target periode ini.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {gaps.map((kpi) => (
        <div key={kpi.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{kpi.abbreviation ?? kpi.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              Target {kpi.targetLabel ?? "-"} · Realisasi {kpi.actualLabel ?? "-"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {kpi.achievement !== null ? `${kpi.achievement.toFixed(1)}%` : "-"}
            </span>
            <UptStatusBadge status={kpi.status} />
          </div>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mt-1 justify-start gap-1 text-muted-foreground"
        render={
          <Link href="/dashboard/performance/upt">
            Lihat semua KPI Kinerja UPT
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />
    </div>
  );
}
