import type { LucideIcon } from "lucide-react";
import { ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

const DOT_CLASS: Record<AiInsight["tone"], string> = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  none: "bg-muted-foreground",
};

// Renders a list of {tone, text} bullets computed by rule-based logic (see
// src/lib/executive-insights.ts) — never an AI/LLM call. Not named
// "AI Insight" to avoid implying otherwise; `title`/`icon` let each caller
// label its own section (Management Attention, Top Issue, ...).
export function AiInsightList({
  data,
  title = "Insight",
  icon: Icon = ListChecks,
  emptyMessage = "Tidak ada catatan untuk periode ini.",
}: {
  data: AiInsight[];
  title?: string;
  icon?: LucideIcon;
  emptyMessage?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {data.map((insight) => (
            <li key={insight.id} className="flex items-start gap-2 text-sm">
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT_CLASS[insight.tone])} />
              <span>{insight.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
