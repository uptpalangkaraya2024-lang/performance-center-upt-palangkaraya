import { Card, CardContent } from "@/components/ui/card";
import { calculateAchievedPercentage, formatAchievedPercentage } from "@/lib/kpi-engine";
import { cn } from "@/lib/utils";
import type { UptOverallPerformance } from "@/types";

function Tile({
  value,
  label,
  className,
  cardClassName,
  barClassName = "bg-primary",
}: {
  value: number;
  label: string;
  className?: string;
  cardClassName?: string;
  barClassName?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", cardClassName)}>
      <div className={cn("h-1.5 w-full", barClassName)} />
      <CardContent className="px-4 py-4">
        <div className={cn("text-3xl font-extrabold tabular-nums", className ?? "text-foreground")}>{value}</div>
        <div className="mt-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
      </CardContent>
    </Card>
  );
}

export function UptOverallPerformanceSummary({ overall }: { overall: UptOverallPerformance }) {
  // Same calculateAchievedPercentage() the homepage banner and Kinerja
  // ULTG's ranking table both use (src/lib/kpi-engine.ts) — this page used
  // to show only raw achieved/warning/critical counts with no percentage
  // at all, which is part of why the same "% KPI tercapai" number looked
  // like it disagreed across pages (this one simply didn't show it).
  const { pct, scoredCount, noDataCount } = calculateAchievedPercentage(overall);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        <span className="text-2xl font-extrabold tabular-nums text-foreground">{formatAchievedPercentage(pct)}</span>{" "}
        KPI tercapai target{noDataCount > 0 ? ` (dihitung dari ${scoredCount} dari ${overall.total} KPI, ${noDataCount} belum terisi)` : ""}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile value={overall.total} label="Total KPI" barClassName="bg-primary" />
        <Tile value={overall.achieved} label="Achieved" className="text-success" cardClassName="border-success/40 bg-success/10" barClassName="bg-success" />
        <Tile value={overall.warning} label="Warning" className="text-warning-foreground" cardClassName="border-warning/50 bg-warning/10" barClassName="bg-warning" />
        <Tile value={overall.critical} label="Critical" className="text-critical" cardClassName="border-critical/40 bg-critical/10" barClassName="bg-critical" />
      </div>
    </div>
  );
}
