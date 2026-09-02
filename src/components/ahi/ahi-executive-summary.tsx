import { Card, CardContent } from "@/components/ui/card";
import type { AhiSectionSummary } from "@/types";
import { formatCount, formatPercent } from "./format";

// Pure display aggregation over already-computed section/category data — no
// new business logic, threshold, or source. "Kategori" tally is a straight
// count of each category's existing `status` (see statusFromDistribution in
// src/services/ahi-performance.ts); best/worst is a factual sort of the 4
// sections' own `score` values, not an inferred conclusion.
export function AhiExecutiveSummary({
  sections,
  totalAnomalies,
}: {
  sections: AhiSectionSummary[];
  totalAnomalies: number;
}) {
  const categories = sections.flatMap((s) => s.categories);
  const tally = {
    good: categories.filter((c) => c.status === "good").length,
    warning: categories.filter((c) => c.status === "warning").length,
    critical: categories.filter((c) => c.status === "critical").length,
  };

  const scored = sections.filter((s): s is AhiSectionSummary & { score: number } => s.score !== null);
  const best = scored.length > 0 ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const worst = scored.length > 0 ? scored.reduce((a, b) => (b.score < a.score ? b : a)) : null;
  const showComparison = best && worst && best.key !== worst.key;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Kondisi Asset Health Keseluruhan
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <span>
              <b className="text-success tabular-nums">{tally.good}</b>
              <span className="text-muted-foreground"> dari {categories.length} kategori Sehat</span>
            </span>
            <span>
              <b className="text-warning-foreground tabular-nums">{tally.warning}</b>
              <span className="text-muted-foreground"> Perlu Perhatian</span>
            </span>
            <span>
              <b className="text-critical tabular-nums">{tally.critical}</b>
              <span className="text-muted-foreground"> Kritis</span>
            </span>
            <span className="text-muted-foreground">{formatCount(totalAnomalies)} kondisi tercatat di rekap anomali</span>
          </div>
        </div>
        {showComparison ? (
          <div className="flex shrink-0 flex-col gap-1 text-xs sm:text-right">
            <span className="text-muted-foreground">
              Skor tertinggi: <b className="text-foreground">{best.displayName}</b> ({formatPercent(best.score)})
            </span>
            <span className="text-muted-foreground">
              Skor terendah: <b className="text-foreground">{worst.displayName}</b> ({formatPercent(worst.score)})
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
