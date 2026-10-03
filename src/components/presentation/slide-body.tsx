import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PresentationSlide } from "@/types";

/** One stat tile inside a slide — same visual role as every other module's
 *  own stat tiles (Data Aset, Gangguan presentation mode, ...), kept local
 *  here since a presentation slide's stats are already-formatted strings
 *  (built server-side per materi), not raw numbers needing their own
 *  formatting logic. */
function SlideStatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg border bg-muted p-3 text-center sm:p-4">
      <div className="text-xl font-extrabold tabular-nums text-foreground sm:text-2xl">{value}</div>
      <div className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</div>
    </div>
  );
}

/** A slide's body content — stats grid, bullet list, and/or a small table —
 *  shared between the stacked/print view and the fullscreen present mode in
 *  presentation-slide-deck.tsx so the two never visually drift apart. */
export function SlideBody({ slide }: { slide: PresentationSlide }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {slide.aiGenerated ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" />
          Analisis AI — bukan data operasional langsung
        </span>
      ) : null}

      {slide.stats && slide.stats.length > 0 ? (
        <div className={cn("grid grid-cols-2 gap-3", slide.stats.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {slide.stats.map((s, i) => (
            <SlideStatTile key={`${s.label}-${i}`} value={s.value} label={s.label} />
          ))}
        </div>
      ) : null}

      {slide.bullets.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground sm:text-base">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {slide.table ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                {slide.table.headers.map((h) => (
                  <th key={h} className="px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slide.table.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className={cn("px-3 py-2", j === 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {slide.sourceNote ? <p className="mt-auto text-xs text-muted-foreground italic">{slide.sourceNote}</p> : null}
    </div>
  );
}
