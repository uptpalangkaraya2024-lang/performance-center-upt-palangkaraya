import { Trophy } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UltgPerformanceSnapshot } from "@/types";

export interface UltgRankingRow {
  rank: number;
  snapshot: UltgPerformanceSnapshot;
  gapToTarget: number | null;
}

/** Ranks the 3 ULTGs by their own sheet's official weighted contract score
 *  (TOTAL BOBOT PROPORSIONAL / Capping 110%) — never recomputed locally,
 *  same "read the sheet's own official number" rule as Kinerja UPT. A ULTG
 *  with no weighted score (sheet unreadable that far) sorts last, not 0 —
 *  a missing number is not the same as a bad one. */
export function buildUltgRanking(snapshots: UltgPerformanceSnapshot[]): UltgRankingRow[] {
  const sorted = [...snapshots].sort((a, b) => {
    if (a.overallWeightedScore === null && b.overallWeightedScore === null) return 0;
    if (a.overallWeightedScore === null) return 1;
    if (b.overallWeightedScore === null) return -1;
    return b.overallWeightedScore - a.overallWeightedScore;
  });
  return sorted.map((snapshot, index) => ({
    rank: index + 1,
    snapshot,
    gapToTarget: snapshot.overallWeightedScore !== null ? Math.max(0, 100 - snapshot.overallWeightedScore) : null,
  }));
}

const RANK_ACCENT = ["border-l-success", "border-l-warning", "border-l-critical"];

export function UltgRankingTable({
  ranking,
  selectedSlug,
  onSelect,
}: {
  ranking: UltgRankingRow[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-extrabold">
          <Trophy className="size-4.5 text-primary" />
          Ranking ULTG
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {ranking.map((row) => {
          const isSelected = row.snapshot.ultgSlug === selectedSlug;
          return (
            <button
              key={row.snapshot.ultgSlug}
              type="button"
              onClick={() => onSelect(row.snapshot.ultgSlug)}
              className={cn(
                "flex items-center gap-3 rounded-lg border-l-4 bg-muted px-3 py-2.5 text-left transition-colors hover:bg-secondary",
                RANK_ACCENT[row.rank - 1] ?? "border-l-border",
                isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-extrabold text-foreground">
                {row.rank}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-foreground">{row.snapshot.ultg}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.snapshot.overall.achieved} achieved · {row.snapshot.overall.warning} warning ·{" "}
                  {row.snapshot.overall.critical} critical
                </span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-extrabold tabular-nums text-foreground">
                  {row.snapshot.overallWeightedScore !== null
                    ? row.snapshot.overallWeightedScore.toLocaleString("id-ID", { maximumFractionDigits: 2 })
                    : "-"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Gap: {row.gapToTarget !== null ? row.gapToTarget.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "-"}
                </span>
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
