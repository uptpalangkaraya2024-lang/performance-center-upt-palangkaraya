import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

// Grouped by SEVERITY first (Critical/Attention/Good/Info, same as the
// original design), then by MODULE within each severity group (Kinerja
// UPT, Gangguan, AHI, RENUS, ABO, 4DX) — so it's clear which module a
// given Critical/Attention item belongs to, without losing the
// at-a-glance "how bad is it right now" severity view. Per user feedback
// (a module-only grouping lost that severity-first view they wanted).
//
// The whole thing lives in ONE card that fills its grid row's height
// exactly (h-full, flex-1 CardContent with overflow-y-auto) instead of a
// fixed max-height — so it always matches UPT Performance Status (its
// grid row sibling) with no leftover empty space in the shorter column,
// regardless of how long the combined list gets.
const TONE_META: Record<AiInsight["tone"], { label: string; icon: typeof CheckCircle2; className: string; dotClassName: string }> = {
  critical: { label: "CRITICAL", icon: XCircle, className: "text-critical", dotClassName: "bg-critical" },
  warning: { label: "ATTENTION", icon: AlertTriangle, className: "text-warning-foreground", dotClassName: "bg-warning" },
  good: { label: "GOOD", icon: CheckCircle2, className: "text-success", dotClassName: "bg-success" },
  none: { label: "INFO", icon: Info, className: "text-muted-foreground", dotClassName: "bg-muted-foreground" },
};

const TONE_ORDER: AiInsight["tone"][] = ["critical", "warning", "good", "none"];

function groupByModule(items: AiInsight[]): { module: string; items: AiInsight[] }[] {
  const order: string[] = [];
  for (const item of items) {
    const moduleName = item.module ?? "Lainnya";
    if (!order.includes(moduleName)) order.push(moduleName);
  }
  return order.map((moduleName) => ({ module: moduleName, items: items.filter((item) => (item.module ?? "Lainnya") === moduleName) }));
}

export function AttentionCards({
  data,
  emptyMessage = "Tidak ada catatan khusus untuk periode ini.",
}: {
  data: AiInsight[];
  emptyMessage?: string;
}) {
  const toneGroups = TONE_ORDER.map((tone) => ({ tone, items: data.filter((item) => item.tone === tone) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="min-h-0 flex-1 overflow-y-auto py-4">
        {toneGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {toneGroups.map((toneGroup) => {
              const meta = TONE_META[toneGroup.tone];
              const Icon = meta.icon;
              const moduleGroups = groupByModule(toneGroup.items);
              return (
                <div key={toneGroup.tone} className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
                  <div className={cn("flex items-center gap-1.5 text-xs font-bold tracking-widest", meta.className)}>
                    <Icon className="size-3.5" />
                    {meta.label}
                    <span className="font-medium text-muted-foreground">({toneGroup.items.length})</span>
                  </div>
                  <div className="flex flex-col gap-2 pl-1">
                    {moduleGroups.map((moduleGroup) => (
                      <div key={moduleGroup.module} className="flex flex-col gap-1">
                        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          {moduleGroup.module}
                        </p>
                        <ul className="flex flex-col gap-1">
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
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
