import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UptOverallPerformance } from "@/types";

function Tile({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <Card className="py-0">
      <CardContent className="px-4 py-4">
        <div className={cn("text-2xl font-bold tabular-nums", className ?? "text-foreground")}>{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export function UptOverallPerformanceSummary({ overall }: { overall: UptOverallPerformance }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile value={overall.total} label="Total KPI" />
      <Tile value={overall.achieved} label="Achieved" className="text-success" />
      <Tile value={overall.warning} label="Warning" className="text-warning-foreground" />
      <Tile value={overall.critical} label="Critical" className="text-critical" />
    </div>
  );
}
