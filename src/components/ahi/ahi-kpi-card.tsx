import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AhiSectionSummary } from "@/types";
import { formatCount } from "./format";
import { AhiRadial } from "./ahi-radial";
import { AhiStatusBadge } from "./ahi-status-badge";

const ACCENT_BY_STATUS: Record<AhiSectionSummary["status"], string> = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  none: "bg-border",
};

export function AhiKpiCard({ section }: { section: AhiSectionSummary }) {
  const totalRecords = section.categories.reduce((sum, c) => sum + (c.jumlahDataTercatat ?? 0), 0);

  return (
    <Card className="gap-3 overflow-hidden py-0">
      <div className={cn("h-1 w-full", ACCENT_BY_STATUS[section.status])} />
      <CardContent className="flex items-center gap-4 px-5 py-5">
        <AhiRadial value={section.score} status={section.status} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold text-foreground">{section.displayName}</span>
          <span className="text-xs text-muted-foreground">Healthy Index</span>
          <div className="mt-1">
            <AhiStatusBadge status={section.status} />
          </div>
          {totalRecords > 0 ? (
            <span className="mt-1 text-[11px] text-muted-foreground">
              {formatCount(totalRecords)} data tercatat · {section.categories.length}{" "}
              {section.categories.length > 1 ? "kategori" : "kategori"}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
