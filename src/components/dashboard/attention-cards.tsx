import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

// One card per severity tone (Critical / Attention / Good / Info), each with
// its own bounded height and internal scroll — replaces the previous single
// "Management Attention" card whose list grew unbounded tall whenever there
// were many items, stretching UPT Performance Status (its CSS grid row
// sibling) to match and making the whole row look disproportionate. Per
// user request.
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
            <div className={cn("h-1 w-full", meta.barClassName)} />
            <CardHeader className="pt-3">
              <div className={cn("flex items-center gap-1.5 text-xs font-bold tracking-widest", meta.className)}>
                <Icon className="size-3.5" />
                <CardTitle className="text-xs tracking-widest">{meta.label}</CardTitle>
                <span className="font-medium text-muted-foreground">({group.items.length})</span>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                {group.items.map((item) =>
                  item.href ? (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-2.5 rounded-md border-l-2 bg-muted/30 py-1.5 pr-2 pl-3 transition-colors hover:bg-muted/60"
                        style={{ borderColor: TONE_BORDER_VAR[group.tone] }}
                      >
                        <span className="flex-1 text-sm text-foreground underline decoration-transparent underline-offset-2 group-hover:decoration-current">
                          {item.text}
                        </span>
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  ) : (
                    <li
                      key={item.id}
                      className="flex gap-2.5 rounded-md border-l-2 bg-muted/30 py-1.5 pr-2 pl-3"
                      style={{ borderColor: TONE_BORDER_VAR[group.tone] }}
                    >
                      <span className="text-sm text-foreground">{item.text}</span>
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
