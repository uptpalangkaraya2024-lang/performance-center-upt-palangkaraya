import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

// Same underlying rule-based AiInsight[] as AiInsightList (see
// src/lib/executive-insights.ts) — every item is still shown, nothing is
// trimmed to a "top 3". This only changes how the same data is grouped and
// presented: when several Critical items land at once, a flat list of red
// dots reads as a wall of red where nothing stands out from anything else.
// Grouping by severity with one tone-colored section header per group keeps
// every item visible while making the *shape* of the situation (how many
// Critical vs Warning vs OK) scannable in a glance.
const TONE_META: Record<AiInsight["tone"], { label: string; icon: typeof CheckCircle2; className: string; barClassName: string }> = {
  critical: { label: "CRITICAL", icon: XCircle, className: "text-critical", barClassName: "bg-critical" },
  warning: { label: "ATTENTION", icon: AlertTriangle, className: "text-warning-foreground", barClassName: "bg-warning" },
  good: { label: "GOOD", icon: CheckCircle2, className: "text-success", barClassName: "bg-success" },
  none: { label: "INFO", icon: Info, className: "text-muted-foreground", barClassName: "bg-border" },
};

const TONE_ORDER: AiInsight["tone"][] = ["critical", "warning", "good", "none"];

const TONE_BORDER_VAR: Record<AiInsight["tone"], string> = {
  critical: "var(--critical)",
  warning: "var(--warning)",
  good: "var(--success)",
  none: "var(--border)",
};

export function ManagementAttentionList({
  data,
  emptyMessage = "Tidak ada catatan khusus untuk periode ini.",
}: {
  data: AiInsight[];
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const groups = TONE_ORDER.map((tone) => ({ tone, items: data.filter((item) => item.tone === tone) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const meta = TONE_META[group.tone];
        const Icon = meta.icon;
        return (
          <div key={group.tone} className="flex flex-col gap-2">
            <div className={cn("flex items-center gap-1.5 text-xs font-bold tracking-widest", meta.className)}>
              <Icon className="size-3.5" />
              {meta.label}
              <span className="font-medium text-muted-foreground">({group.items.length})</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-2.5 rounded-md border-l-2 bg-muted/30 py-1.5 pr-2 pl-3"
                  style={{ borderColor: TONE_BORDER_VAR[group.tone] }}
                >
                  <span className="text-sm text-foreground">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
