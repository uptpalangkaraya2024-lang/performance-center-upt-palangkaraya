import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiInsight } from "@/types";

const DOT_CLASS: Record<AiInsight["tone"], string> = {
  good: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  none: "bg-muted-foreground",
};

export function AiInsightList({ data }: { data: AiInsight[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Sparkles className="size-3.5" />
        AI Insight
      </div>
      <ul className="flex flex-col gap-2.5">
        {data.map((insight) => (
          <li key={insight.id} className="flex items-start gap-2 text-sm">
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT_CLASS[insight.tone])} />
            <span>{insight.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
