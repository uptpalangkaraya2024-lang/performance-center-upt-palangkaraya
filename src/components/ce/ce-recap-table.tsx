"use client";

import { Fragment } from "react";

import { isInCe, type RecapGroup, type RecapRow } from "@/lib/ce-analysis";
import { cn } from "@/lib/utils";
import type { CeItem } from "@/types";

type Metric = {
  key: "total" | "inCe" | "notInCe" | "close" | "open";
  label: string;
  pick: (i: CeItem) => boolean;
};

const METRICS: Metric[] = [
  { key: "total", label: "Total anomali", pick: () => true },
  { key: "inCe", label: "CE 2026", pick: isInCe },
  { key: "notInCe", label: "Belum masuk CE", pick: (i) => !isInCe(i) },
  { key: "close", label: "Close", pick: (i) => i.done },
  { key: "open", label: "Open", pick: (i) => !i.done },
];

/** ULTG × stream recap in one table. Every count opens its anomaly list. */
export function CeRecapTable({
  groups,
  upt,
  onOpen,
}: {
  groups: RecapGroup[];
  upt: RecapGroup | null;
  onOpen: (title: string, items: CeItem[]) => void;
}) {
  const all = upt ? [...groups, upt] : groups;

  const row = (r: RecapRow, ultg: string, kind: "stream" | "subtotal" | "grand") => (
    <tr
      key={`${ultg}|${r.label}|${kind}`}
      className={cn(
        "border-b",
        kind === "subtotal" && "bg-muted/50 font-bold",
        kind === "grand" && "bg-primary/10 font-extrabold",
      )}
    >
      <td className={cn("px-3 py-1.5", kind === "stream" && "pl-6")}>{r.label}</td>
      {METRICS.map((m) => {
        const v = r[m.key];
        return (
          <td key={m.key} className="px-2 py-1.5 text-right tabular-nums">
            {v > 0 ? (
              <button
                type="button"
                className="rounded px-1 underline-offset-2 hover:bg-primary/10 hover:underline"
                onClick={() =>
                  onOpen(
                    `${m.label} · ${kind === "stream" ? `${ultg} · ${r.label}` : r.label} (${v})`,
                    r.items.filter(m.pick),
                  )
                }
              >
                {v}
              </button>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </td>
        );
      })}
      <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
        {r.total ? `${Math.round((r.close / r.total) * 100)}%` : "—"}
      </td>
    </tr>
  );

  return (
    <div className="max-h-[560px] overflow-auto rounded-lg border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="border-b bg-muted text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2 text-left font-bold">ULTG / Stream</th>
            {METRICS.map((m) => (
              <th key={m.key} className="px-2 py-2 text-right font-bold">
                {m.label}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-bold">% Close</th>
          </tr>
        </thead>
        <tbody>
          {all.map((g) => (
            <Fragment key={g.ultg}>
              <tr className="border-b bg-card">
                <td
                  colSpan={METRICS.length + 2}
                  className="px-3 pt-3 pb-1 text-xs font-extrabold text-primary uppercase"
                >
                  {g === upt ? "UPT Palangkaraya — semua ULTG" : `ULTG ${g.ultg}`}
                </td>
              </tr>
              {g.streams.map((s) => row(s, g.ultg, "stream"))}
              {row(g.subtotal, g.ultg, g === upt ? "grand" : "subtotal")}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
