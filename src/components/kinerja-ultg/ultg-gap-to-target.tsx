import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { computeGap } from "@/lib/kpi-engine";
import { cn } from "@/lib/utils";
import type { UltgPerformanceSnapshot } from "@/types";
import { UptStatusBadge } from "@/components/kinerja-upt/upt-status-badge";

const GAP_TONE: Record<string, string> = {
  critical: "text-critical",
  warning: "text-warning-foreground",
};

const CARD_TONE: Record<string, string> = {
  critical: "border-critical/40 bg-critical/[0.06]",
  warning: "border-warning/50 bg-warning/[0.06]",
};

// Same idea as Kinerja UPT's UptGapToTarget, but pooled across all 3 ULTGs
// at once (there's no per-ULTG selector on the homepage) — the worst 5 KPIs
// company-wide across Palangkaraya/Pangkalan Bun/Muara Teweh combined, each
// tagged with its own ULTG so it's clear which one needs attention.
export function UltgGapToTarget({ snapshots }: { snapshots: UltgPerformanceSnapshot[] }) {
  const gaps = snapshots
    .flatMap((snapshot) =>
      snapshot.kpis
        .filter((k) => k.status === "warning" || k.status === "critical")
        .map((kpi) => ({ kpi, ultg: snapshot.ultg })),
    )
    .sort((a, b) => (a.kpi.achievement ?? 0) - (b.kpi.achievement ?? 0))
    .slice(0, 5);

  if (gaps.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Semua KPI ULTG mencapai target periode ini.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {gaps.map(({ kpi, ultg }) => {
        const gap = computeGap(kpi.targetValue, kpi.actualValue, kpi.direction, kpi.unit);
        return (
          <div key={`${ultg}-${kpi.key}`} className={cn("rounded-lg border px-3 py-3", CARD_TONE[kpi.status] ?? "")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-foreground">{kpi.abbreviation ?? kpi.displayName}</p>
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{ultg}</p>
              </div>
              <UptStatusBadge status={kpi.status} className="shrink-0" />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{kpi.displayName}</p>

            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Target</p>
                <p className="font-bold tabular-nums text-foreground">{kpi.targetLabel ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Realisasi</p>
                <p className="font-bold tabular-nums text-foreground">{kpi.actualLabel ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Achievement</p>
                <p className="font-bold tabular-nums text-foreground">
                  {kpi.achievement !== null ? `${kpi.achievement.toFixed(1)}%` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Gap</p>
                <p className={cn("font-bold tabular-nums", GAP_TONE[kpi.status] ?? "text-foreground")}>
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
          <Link href="/dashboard/performance/ultg">
            Lihat semua KPI Kinerja ULTG
            <ArrowRight className="size-3.5" />
          </Link>
        }
      />
    </div>
  );
}
