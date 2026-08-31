import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { KpiSummary } from "@/types";
import { StatusBadge } from "./status-badge";

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

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-start justify-between px-4">
        <span className="text-sm font-medium text-muted-foreground">{kpi.label}</span>
        <StatusBadge status={kpi.status} />
      </CardHeader>
      <CardContent className="px-4">
        <div className="text-2xl font-semibold tracking-tight">{formatValue(kpi)}</div>
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          {delta === 0 ? (
            <Minus className="size-3 text-muted-foreground" />
          ) : isImprovement ? (
            <ArrowUpRight className="size-3 text-success" />
          ) : (
            <ArrowDownRight className="size-3 text-critical" />
          )}
          <span
            className={cn(
              "font-medium",
              delta === 0
                ? "text-muted-foreground"
                : isImprovement
                  ? "text-success"
                  : "text-critical",
            )}
          >
            {deltaPct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs bulan lalu · target {kpi.target}{kpi.format !== "number" ? "%" : ""}</span>
        </div>
      </CardContent>
    </Card>
  );
}
