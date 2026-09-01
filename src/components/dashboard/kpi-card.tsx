import type { LucideIcon } from "lucide-react";
import { Activity, Gauge, HeartPulse, ListChecks, ShieldCheck, Target, Zap } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { KpiSummary, StatusLevel } from "@/types";
import { StatusBadge } from "./status-badge";
import { TrendIndicator } from "./trend-indicator";

const KPI_ICONS: Record<string, LucideIcon> = {
  performance: Activity,
  disturbance: Zap,
  "open-case": ListChecks,
  abo: ShieldCheck,
  "4dx": Target,
  ce: Gauge,
  ahi: HeartPulse,
};

// Icon container tint follows the KPI's current status, not a fixed brand
// color — status is the thing actually worth drawing the eye to here.
const ICON_TINT: Record<StatusLevel, string> = {
  good: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  critical: "bg-critical/10 text-critical",
  none: "bg-muted text-muted-foreground",
};

function formatValue(kpi: KpiSummary) {
  if (kpi.format === "percent" || kpi.format === "score") {
    return `${kpi.value.toFixed(1)}%`;
  }
  return `${kpi.value} ${kpi.unit}`;
}

export function KpiCard({ kpi }: { kpi: KpiSummary }) {
  const delta = kpi.value - kpi.previous;
  // Fewer disturbances/open-cases is an improvement, so a falling value
  // for those KPIs should still read as positive movement.
  const higherIsBetter = kpi.format !== "number";
  const isImprovement = higherIsBetter ? delta > 0 : delta < 0;
  const deltaPct = kpi.previous !== 0 ? (Math.abs(delta) / kpi.previous) * 100 : 0;
  const Icon = KPI_ICONS[kpi.id] ?? Activity;
  // Achievement-toward-target only reads naturally for "higher is better"
  // KPIs (a percent score climbing toward its target) — a falling count
  // (gangguan, open case) doesn't map onto the same bar metaphor, so it's
  // skipped there rather than shown misleadingly.
  const showProgress = higherIsBetter && kpi.target > 0;
  const progressPct = showProgress ? Math.min(100, Math.round((kpi.value / kpi.target) * 100)) : 0;

  return (
    <Card className="gap-3 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div
        className={cn(
          "h-1 w-full",
          kpi.status === "good" && "bg-success",
          kpi.status === "warning" && "bg-warning",
          kpi.status === "critical" && "bg-critical",
          kpi.status === "none" && "bg-border",
        )}
      />
      <CardHeader className="flex flex-row items-start justify-between px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", ICON_TINT[kpi.status])}>
            <Icon className="size-4" />
          </span>
          <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
        </div>
        <StatusBadge status={kpi.status} />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-2xl font-bold tracking-tight text-foreground">{formatValue(kpi)}</div>
        <div className="mt-1.5">
          <TrendIndicator
            delta={deltaPct}
            isImprovement={isImprovement}
            label={`vs bulan lalu · target ${kpi.target}${kpi.format !== "number" ? "%" : ""}`}
          />
        </div>
        {showProgress ? <Progress value={progressPct} className="mt-3" /> : null}
      </CardContent>
    </Card>
  );
}
