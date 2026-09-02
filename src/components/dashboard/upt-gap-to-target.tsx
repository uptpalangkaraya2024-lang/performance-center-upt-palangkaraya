import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { computeGap } from "@/lib/kpi-engine";
import { cn } from "@/lib/utils";
import type { UptKpi } from "@/types";
import { UptStatusBadge } from "@/components/kinerja-upt/upt-status-badge";

const GAP_TONE: Record<string, string> = {
  critical: "text-critical",
  warning: "text-warning-foreground",
};

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
      {gaps.map((kpi) => {
        const gap = computeGap(kpi.targetValue, kpi.actualValue, kpi.direction, kpi.unit);
        return (
          <div key={kpi.key} className="rounded-lg border px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-sm font-semibold text-foreground">{kpi.abbreviation ?? kpi.displayName}</p>
              <UptStatusBadge status={kpi.status} className="shrink-0" />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{kpi.displayName}</p>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Target</p>
                <p className="font-medium tabular-nums text-foreground">{kpi.targetLabel ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Realisasi</p>
                <p className="font-medium tabular-nums text-foreground">{kpi.actualLabel ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Achievement</p>
                <p className="font-medium tabular-nums text-foreground">
                  {kpi.achievement !== null ? `${kpi.achievement.toFixed(1)}%` : "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Gap</p>
                <p className={cn("font-medium tabular-nums", GAP_TONE[kpi.status] ?? "text-foreground")}>
                  {gap.label}
                </p>
              </div>
            </div>
          </div>
        );
      })}
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
