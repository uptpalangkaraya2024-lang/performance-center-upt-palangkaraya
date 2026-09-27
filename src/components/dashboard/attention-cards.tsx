import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

// Per-severity cards (Critical / Attention / Good / Info), each a fixed
// size with its own internal scroll, sub-grouped by MODULE within each
// card — spreading the module breakdown across 4 separate small cards
// (instead of one long nested list) keeps it scannable without turning
// into one long scroll. Per user feedback.
// Each quadrant gets its own tinted card background (not just a thin top
// bar) plus a solid-fill badge pill for its count — the same
// translucent-fill-only rule as upt-performance-status.tsx applies here too
// (--warning-foreground equals --warning itself in dark mode by design, so
// warning's badge stays translucent+bordered like the others rather than a
// solid fill, for a consistent look across all four rather than one
// visually odd one out).
const TONE_META: Record<
  AiInsight["tone"],
  { label: string; icon: typeof CheckCircle2; className: string; dotClassName: string; cardClassName: string; badgeClassName: string }
> = {
  critical: {
    label: "CRITICAL",
    icon: XCircle,
    className: "text-critical",
    dotClassName: "bg-critical",
    cardClassName: "border-critical/30 bg-critical/[0.06]",
    badgeClassName: "border border-critical/40 bg-critical/20 text-critical",
  },
  warning: {
    label: "ATTENTION",
    icon: AlertTriangle,
    className: "text-warning-foreground",
    dotClassName: "bg-warning",
    cardClassName: "border-warning/40 bg-warning/[0.06]",
    badgeClassName: "border border-warning/50 bg-warning/20 text-warning-foreground",
  },
  good: {
    label: "GOOD",
    icon: CheckCircle2,
    className: "text-success",
    dotClassName: "bg-success",
    cardClassName: "border-success/30 bg-success/[0.06]",
    badgeClassName: "border border-success/40 bg-success/20 text-success",
  },
  none: {
    label: "INFO",
    icon: Info,
    className: "text-muted-foreground",
    dotClassName: "bg-muted-foreground",
    cardClassName: "border-border bg-muted/40",
    badgeClassName: "border border-border bg-muted text-muted-foreground",
  },
};

const TONE_ORDER: AiInsight["tone"][] = ["critical", "warning", "good", "none"];

function groupByModule(items: AiInsight[]): { module: string; items: AiInsight[] }[] {
  const order: string[] = [];
  for (const item of items) {
    const moduleName = item.module ?? "Lainnya";
    if (!order.includes(moduleName)) order.push(moduleName);
  }
  return order.map((moduleName) => ({
    module: moduleName,
    items: items.filter((item) => (item.module ?? "Lainnya") === moduleName),
  }));
}

export function AttentionCards({
  data,
  emptyMessage = "Tidak ada catatan khusus untuk periode ini.",
}: {
  data: AiInsight[];
  emptyMessage?: string;
}) {
  const groups = TONE_ORDER.map((tone) => ({ tone, items: data.filter((item) => item.tone === tone) })).filter(
    (group) => group.items.length > 0,
  );

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {groups.map((group) => {
        const meta = TONE_META[group.tone];
        const Icon = meta.icon;
        return (
          <Card key={group.tone} className={cn("gap-3 overflow-hidden border py-0", meta.cardClassName)}>
            <div className={cn("h-1.5 w-full", meta.dotClassName)} />
            <CardContent className="flex flex-col gap-2.5 pt-3 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className={cn("flex items-center gap-1.5 text-xs font-extrabold tracking-wide sm:text-sm", meta.className)}>
                  <Icon className="size-4 shrink-0" />
                  {meta.label}
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular-nums sm:text-sm", meta.badgeClassName)}>
                  {group.items.length}
                </span>
              </div>
              <div className="flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-1">
                {groupByModule(group.items).map((moduleGroup) => (
                  <div key={moduleGroup.module} className="flex flex-col gap-1">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{moduleGroup.module}</p>
                    <ul className="flex flex-col gap-1.5">
                      {moduleGroup.items.map((item) =>
                        item.href ? (
                          <li key={item.id}>
                            <Link
                              href={item.href}
                              className="group flex items-start gap-2 rounded-md text-sm hover:text-foreground"
                            >
                              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", meta.dotClassName)} />
                              <span className="flex-1 underline decoration-transparent underline-offset-2 group-hover:decoration-current">
                                {item.text}
                              </span>
                              <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </li>
                        ) : (
                          <li key={item.id} className="flex items-start gap-2 text-sm">
                            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", meta.dotClassName)} />
                            <span>{item.text}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
