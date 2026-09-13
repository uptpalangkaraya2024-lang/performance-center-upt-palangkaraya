import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

// One unified "Management Attention" list, grouped by MODULE (Kinerja UPT,
// Gangguan, AHI, RENUS, ABO, 4DX, ...) with a divider between each group —
// replaces the earlier version grouped by severity tone, which read as 4
// disconnected cards (CRITICAL/ATTENTION/GOOD/INFO) alongside a separate
// "Top Issue" card, confusing about which number belonged to which module.
// Everything now lives in ONE card with a bounded height + single scroll,
// so a long combined list never grows the card past a size that leaves the
// UPT Performance Status card (its grid row sibling) looking oddly short
// with empty space beneath it. Per user feedback.
const TONE_META: Record<AiInsight["tone"], { icon: typeof CheckCircle2; dotClassName: string }> = {
  critical: { icon: XCircle, dotClassName: "bg-critical" },
  warning: { icon: AlertTriangle, dotClassName: "bg-warning" },
  good: { icon: CheckCircle2, dotClassName: "bg-success" },
  none: { icon: Info, dotClassName: "bg-muted-foreground" },
};

const TONE_ORDER: AiInsight["tone"][] = ["critical", "warning", "good", "none"];

function ModuleBadge({ moduleName, items }: { moduleName: string; items: AiInsight[] }) {
  // The module's own worst tone present decides its little status dot —
  // Critical if any item is critical, else Warning if any is warning, etc.
  const worstTone = TONE_ORDER.find((tone) => items.some((item) => item.tone === tone)) ?? "none";
  const meta = TONE_META[worstTone];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-foreground">
      <Icon className={cn("size-3.5", worstTone === "critical" ? "text-critical" : worstTone === "warning" ? "text-warning-foreground" : worstTone === "good" ? "text-success" : "text-muted-foreground")} />
      {moduleName.toUpperCase()}
      <span className="font-medium text-muted-foreground">({items.length})</span>
    </div>
  );
}

export function AttentionCards({
  data,
  emptyMessage = "Tidak ada catatan khusus untuk periode ini.",
}: {
  data: AiInsight[];
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const moduleOrder: string[] = [];
  for (const item of data) {
    const moduleName = item.module ?? "Lainnya";
    if (!moduleOrder.includes(moduleName)) moduleOrder.push(moduleName);
  }
  const groups = moduleOrder.map((moduleName) => ({
    module: moduleName,
    items: data.filter((item) => (item.module ?? "Lainnya") === moduleName),
  }));

  return (
    <Card>
      <CardContent className="max-h-[26rem] overflow-y-auto py-4">
        <div className="flex flex-col divide-y divide-border">
          {groups.map((group) => (
            <div key={group.module} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <ModuleBadge moduleName={group.module} items={group.items} />
              <ul className="flex flex-col gap-1.5">
                {group.items.map((item) => {
                  const dotClass = TONE_META[item.tone].dotClassName;
                  return item.href ? (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="group flex items-start gap-2 rounded-md text-sm hover:text-foreground"
                      >
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dotClass)} />
                        <span className="flex-1 underline decoration-transparent underline-offset-2 group-hover:decoration-current">
                          {item.text}
                        </span>
                        <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  ) : (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dotClass)} />
                      <span>{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
