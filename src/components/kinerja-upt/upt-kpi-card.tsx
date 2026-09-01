import { ArrowDown, ArrowUp } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { UptKpi } from "@/types";
import { formatAchievement, formatKpiValue } from "./format";
import { UptStatusBadge } from "./upt-status-badge";

const ACCENT_BY_STATUS: Record<UptKpi["status"], string> = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  none: "bg-border",
};

export function UptKpiCard({ kpi }: { kpi: UptKpi }) {
  if (kpi.status === "none") {
    return (
      <Card className="gap-3 overflow-hidden py-0">
        <div className="h-1 w-full bg-border" />
        <CardHeader className="px-4 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              {kpi.abbreviation ?? kpi.displayName}
            </span>
            <UptStatusBadge status="none" />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm font-medium text-foreground">{kpi.displayName}</p>
          <p className="mt-1 text-xs text-muted-foreground">Tidak tersedia untuk periode ini.</p>
        </CardContent>
      </Card>
    );
  }

  const progressPct = kpi.achievement !== null ? Math.min(100, Math.max(0, Math.round(kpi.achievement))) : 0;
  const DirectionIcon = kpi.direction === "LOWER_IS_BETTER" ? ArrowDown : ArrowUp;

  return (
    <Card className="gap-3 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <div className={cn("h-1 w-full", ACCENT_BY_STATUS[kpi.status])} />
      <CardHeader className="px-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">{kpi.abbreviation ?? kpi.displayName}</span>
            {kpi.direction ? (
              <span title={kpi.direction === "LOWER_IS_BETTER" ? "Lower is better" : "Higher is better"}>
                <DirectionIcon className="size-3 text-muted-foreground" />
              </span>
            ) : null}
          </div>
          <UptStatusBadge status={kpi.status} />
        </div>
        <p className="text-xs text-muted-foreground">{kpi.displayName}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {formatKpiValue(kpi.actualValue, kpi.actualLabel, kpi.unit)}
        </div>

        <div className="mt-3 flex flex-col gap-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Target</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatKpiValue(kpi.targetValue, kpi.targetLabel, kpi.unit)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Realisasi</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatKpiValue(kpi.actualValue, kpi.actualLabel, kpi.unit)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Achievement</span>
            <span className="font-medium tabular-nums text-foreground">{formatAchievement(kpi.achievement)}</span>
          </div>
        </div>

        <Progress value={progressPct} className="mt-3" />

        {kpi.directionConflict ? (
          <p className="mt-2 text-[10px] leading-tight text-warning-foreground">
            ⚠ Arah target berbeda dari dokumentasi — lihat catatan Data &amp; Sync.
          </p>
        ) : null}
        {kpi.direction === null ? (
          <p className="mt-2 text-[10px] leading-tight text-warning-foreground">
            ⚠ Arah target (higher/lower is better) tidak dapat dipastikan dari sumber data.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
