import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export function TrendIndicator({
  delta,
  isImprovement,
  label,
}: {
  delta: number;
  isImprovement: boolean;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
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
          delta === 0 ? "text-muted-foreground" : isImprovement ? "text-success" : "text-critical",
        )}
      >
        {Math.abs(delta).toFixed(1)}%
      </span>
      {label ? <span className="text-muted-foreground">{label}</span> : null}
    </span>
  );
}
