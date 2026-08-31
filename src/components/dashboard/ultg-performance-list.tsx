import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { UltgPerformance } from "@/types";
import { StatusBadge } from "./status-badge";

const TREND_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

export function UltgPerformanceList({ data }: { data: UltgPerformance[] }) {
  return (
    <div className="flex flex-col divide-y">
      {data.map((ultg) => {
        const TrendIcon = TREND_ICON[ultg.trend];
        return (
          <div key={ultg.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {ultg.rank}
                </span>
                <span className="text-sm font-medium">{ultg.name}</span>
              </div>
              <StatusBadge status={ultg.status} />
            </div>
            <div className="flex items-center gap-3">
              <Progress value={Math.min(ultg.achievement, 100)} className="h-2 flex-1" />
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                {ultg.achievement}%
              </span>
              <TrendIcon
                className={cn(
                  "size-3.5 shrink-0",
                  ultg.trend === "up" && "text-success",
                  ultg.trend === "down" && "text-critical",
                  ultg.trend === "flat" && "text-muted-foreground",
                )}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Target {ultg.target}% &middot; Aktual {ultg.actual}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
