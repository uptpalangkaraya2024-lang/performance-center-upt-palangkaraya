import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { StatusLevel, UptOverallPerformance } from "@/types";

const STATUS_META: Record<StatusLevel, { label: string; icon: typeof CheckCircle2; tint: string; bar: string }> = {
  good: { label: "GOOD", icon: CheckCircle2, tint: "bg-success/10 text-success", bar: "bg-success" },
  warning: { label: "WARNING", icon: AlertTriangle, tint: "bg-warning/15 text-warning-foreground", bar: "bg-warning" },
  critical: { label: "CRITICAL", icon: XCircle, tint: "bg-critical/10 text-critical", bar: "bg-critical" },
  none: { label: "NO DATA", icon: AlertTriangle, tint: "bg-muted text-muted-foreground", bar: "bg-border" },
};

// "Performance Score" here is the share of UPT KPIs that met their own
// target this period (achieved / total) — computed straight from Kinerja
// UPT's per-KPI status, not a separately-sourced or invented aggregate.
export function UptPerformanceStatus({
  overall,
  periodLabel,
  status,
  overallWeightedScore,
}: {
  overall: UptOverallPerformance;
  periodLabel: string;
  status: StatusLevel;
  /** The sheet's own official weighted contract score ("TOTAL BOBOT
   *  PROPORSIONAL" row) — shown alongside, not instead of, the simple
   *  achieved-count score above so neither number silently replaces the
   *  other. */
  overallWeightedScore?: number | null;
}) {
  const scored = overall.achieved + overall.warning + overall.critical;
  const score = scored > 0 ? Math.round((overall.achieved / scored) * 100) : null;
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <Card className="gap-3 overflow-hidden py-0">
      <div className={cn("h-1 w-full", meta.bar)} />
      <CardContent className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              UPT Performance Status
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Kinerja s.d. {periodLabel}</p>
          </div>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", meta.tint)}>
            <Icon className="size-3.5" />
            {meta.label}
          </span>
        </div>

        <div className="flex items-end gap-3">
          <span className="text-4xl font-bold tabular-nums text-foreground">{score === null ? "-" : `${score}%`}</span>
          <span className="mb-1 text-sm text-muted-foreground">KPI tercapai target</span>
        </div>

        {score !== null ? <Progress value={score} /> : null}

        {overallWeightedScore !== undefined && overallWeightedScore !== null ? (
          <p className="text-xs text-muted-foreground">
            Skor Kontrak (Bobot Resmi):{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {overallWeightedScore.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
            </span>
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md bg-success/10 py-2">
            <div className="text-base font-bold text-success">{overall.achieved}</div>
            <div className="text-muted-foreground">Achieved</div>
          </div>
          <div className="rounded-md bg-warning/10 py-2">
            <div className="text-base font-bold text-warning-foreground">{overall.warning}</div>
            <div className="text-muted-foreground">Warning</div>
          </div>
          <div className="rounded-md bg-critical/10 py-2">
            <div className="text-base font-bold text-critical">{overall.critical}</div>
            <div className="text-muted-foreground">Critical</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
