import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

// Simple, per-severity cards (Critical / Attention / Good / Info), each a
// fixed size with its own internal scroll — no module sub-grouping (tried,
// but the extra header lines per module made the list read as longer, not
// clearer). The item text itself already names its own module in most
// cases (e.g. "1 KPI UPT...", "AHI MTU...", "5 program ABO..."). Since
// UPT Performance Status now sits full-width above this section instead of
// sharing a grid row with it (see src/app/dashboard/page.tsx), there's no
// height-matching problem to solve here — this can just be a plain grid
// that wraps naturally. Per user feedback.
const TONE_META: Record<AiInsight["tone"], { label: string; icon: typeof CheckCircle2; className: string; dotClassName: string }> = {
  critical: { label: "CRITICAL", icon: XCircle, className: "text-critical", dotClassName: "bg-critical" },
  warning: { label: "ATTENTION", icon: AlertTriangle, className: "text-warning-foreground", dotClassName: "bg-warning" },
  good: { label: "GOOD", icon: CheckCircle2, className: "text-success", dotClassName: "bg-success" },
  none: { label: "INFO", icon: Info, className: "text-muted-foreground", dotClassName: "bg-muted-foreground" },
};

const TONE_ORDER: AiInsight["tone"][] = ["critical", "warning", "good", "none"];

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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {groups.map((group) => {
        const meta = TONE_META[group.tone];
        const Icon = meta.icon;
        return (
          <Card key={group.tone} className="gap-3 overflow-hidden py-0">
            <div className={cn("h-1 w-full", meta.dotClassName)} />
            <CardContent className="flex flex-col gap-2 pt-3 pb-4">
              <div className={cn("flex items-center gap-1.5 text-xs font-bold tracking-widest", meta.className)}>
                <Icon className="size-3.5" />
                {meta.label}
                <span className="font-medium text-muted-foreground">({group.items.length})</span>
              </div>
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                {group.items.map((item) =>
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
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
