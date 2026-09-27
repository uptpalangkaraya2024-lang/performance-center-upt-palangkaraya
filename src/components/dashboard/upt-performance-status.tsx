import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { StatusLevel, UptOverallPerformance } from "@/types";

// Translucent bg-<tone>/NN fill + solid <tone>-foreground text, never a
// solid <tone> fill with foreground text on top — --warning-foreground
// equals --warning itself in dark mode by design (see globals.css's own
// comment on --warning-foreground: an earlier attempt at a solid warning
// pill rendered as invisible warning-on-warning text), so every badge here
// uses the same translucent-fill convention for consistency even though
// success/critical's own foreground tokens would technically survive a
// solid fill. Bumped from /10-/15 to /20 plus a matching border for more
// visual weight without risking that exact bug again.
const STATUS_META: Record<
  StatusLevel,
  { label: string; icon: typeof CheckCircle2; tint: string; bar: string; scoreClassName: string }
> = {
  good: {
    label: "GOOD",
    icon: CheckCircle2,
    tint: "border border-success/40 bg-success/20 text-success",
    bar: "bg-success",
    scoreClassName: "text-success",
  },
  warning: {
    label: "WARNING",
    icon: AlertTriangle,
    tint: "border border-warning/50 bg-warning/20 text-warning-foreground",
    bar: "bg-warning",
    scoreClassName: "text-warning-foreground",
  },
  critical: {
    label: "CRITICAL",
    icon: XCircle,
    tint: "border border-critical/40 bg-critical/20 text-critical",
    bar: "bg-critical",
    scoreClassName: "text-critical",
  },
  none: {
    label: "NO DATA",
    icon: AlertTriangle,
    tint: "border border-border bg-muted text-muted-foreground",
    bar: "bg-border",
    scoreClassName: "text-foreground",
  },
};

// A wide, horizontal banner (not a narrow column card) — placed full-width
// above Management Attention rather than sharing a grid row with it. Per
// user feedback: pairing a naturally-short card with a naturally-tall list
// in the same row always left one of them looking disproportionate no
// matter how the heights were reconciled; stacking them instead sidesteps
// the problem entirely.
export function UptPerformanceStatus({
  overall,
  periodLabel,
  status,
  overallWeightedScore,
}: {
  overall: UptOverallPerformance;
  periodLabel: string;
  status: StatusLevel;
  /** The sheet's own official weighted contract score ("TOTAL BOBOT
   *  PROPORSIONAL" row) — shown alongside, not instead of, the simple
   *  achieved-count score above so neither number silently replaces the
   *  other. */
  overallWeightedScore?: number | null;
}) {
  const scored = overall.achieved + overall.warning + overall.critical;
  const score = scored > 0 ? Math.round((overall.achieved / scored) * 100) : null;
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={cn("h-1.5 w-full", meta.bar)} />
      <CardContent className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex shrink-0 flex-col gap-1.5 lg:w-56">
          <p className="text-sm font-bold tracking-wide text-muted-foreground uppercase">UPT Performance Status</p>
          <p className="text-xs text-muted-foreground">Kinerja s.d. {periodLabel}</p>
          <span className={cn("mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold", meta.tint)}>
            <Icon className="size-4" />
            {meta.label}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex shrink-0 items-end gap-2">
            <span className={cn("text-4xl font-extrabold tabular-nums sm:text-5xl", meta.scoreClassName)}>
              {score === null ? "-" : `${score}%`}
            </span>
            <span className="mb-1.5 text-sm font-medium text-muted-foreground whitespace-nowrap">KPI tercapai target</span>
          </div>
          <div className="hidden min-w-24 flex-1 sm:block">{score !== null ? <Progress value={score} /> : null}</div>
        </div>

        {overallWeightedScore !== undefined && overallWeightedScore !== null ? (
          <p className="shrink-0 text-sm text-muted-foreground">
            Skor Kontrak (Bobot Resmi)
            <br className="hidden lg:block" />
            <span className="text-xl font-extrabold text-foreground tabular-nums sm:text-2xl">
              {overallWeightedScore.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
            </span>
          </p>
        ) : null}

        <div className="grid shrink-0 grid-cols-3 gap-2 overflow-hidden sm:w-80 sm:gap-2.5 text-center">
          <div className="overflow-hidden rounded-lg border border-success/40 bg-success/15">
            <div className="h-1.5 w-full bg-success" />
            <div className="py-2 sm:py-2.5">
              <div className="text-xl font-extrabold text-success sm:text-2xl">{overall.achieved}</div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase sm:text-xs">Achieved</div>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-warning/50 bg-warning/15">
            <div className="h-1.5 w-full bg-warning" />
            <div className="py-2 sm:py-2.5">
              <div className="text-xl font-extrabold text-warning-foreground sm:text-2xl">{overall.warning}</div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase sm:text-xs">Warning</div>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-critical/40 bg-critical/15">
            <div className="h-1.5 w-full bg-critical" />
            <div className="py-2 sm:py-2.5">
              <div className="text-xl font-extrabold text-critical sm:text-2xl">{overall.critical}</div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase sm:text-xs">Critical</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
