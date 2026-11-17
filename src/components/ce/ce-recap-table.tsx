"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";

import { isInCe, shortGi, shortUltg, type RecapGroup, type RecapRow } from "@/lib/ce-analysis";
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

const COLS = METRICS.length + 2;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** The anomalies behind one ULTG × stream row, shown inline under it. */
function DetailRows({ items, showUltg }: { items: CeItem[]; showUltg: boolean }) {
  const sorted = [...items].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      Number(isInCe(b)) - Number(isInCe(a)) ||
      a.gardu.localeCompare(b.gardu) ||
      a.bay.localeCompare(b.bay),
  );
  return (
    <tr className="border-b bg-muted/20">
      <td colSpan={COLS} className="px-3 py-2 pl-8">
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b bg-muted/60 text-left text-[10px] text-muted-foreground uppercase">
                <th className="px-2 py-1.5 font-bold">No</th>
                {showUltg && <th className="px-2 py-1.5 font-bold">ULTG</th>}
                <th className="px-2 py-1.5 font-bold">Gardu Induk</th>
                <th className="px-2 py-1.5 font-bold">Bay</th>
                <th className="px-2 py-1.5 font-bold">Jenis aset</th>
                <th className="px-2 py-1.5 font-bold">Anomali</th>
                <th className="px-2 py-1.5 font-bold">Action plan</th>
                <th className="px-2 py-1.5 font-bold">Periode</th>
                <th className="px-2 py-1.5 font-bold">Status</th>
                <th className="px-2 py-1.5 font-bold">Target</th>
                <th className="px-2 py-1.5 font-bold">Close/Open</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((i, n) => (
                <tr key={i.id} className="border-b align-top last:border-0">
                  <td className="px-2 py-1.5 text-muted-foreground tabular-nums">{n + 1}</td>
                  {showUltg && <td className="px-2 py-1.5 whitespace-nowrap">{shortUltg(i.ultg)}</td>}
                  <td className="px-2 py-1.5">{shortGi(i.gardu) || "—"}</td>
                  <td className="px-2 py-1.5">{i.bay || "—"}</td>
                  <td className="px-2 py-1.5">
                    {i.jenisAsset || "—"}
                    {i.phasa && i.phasa !== "-" ? (
                      <span className="text-muted-foreground"> · fasa {i.phasa}</span>
                    ) : null}
                  </td>
                  <td className="min-w-[220px] px-2 py-1.5">
                    {i.anomaliPemicu || <i className="text-muted-foreground">kosong</i>}
                  </td>
                  <td className="min-w-[180px] px-2 py-1.5 text-muted-foreground">{i.actionPlan || "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "rounded px-1 font-semibold",
                        isInCe(i) ? "bg-primary/15 text-primary" : "bg-warning/20 text-warning-foreground",
                      )}
                    >
                      {isInCe(i) ? "CE 2026" : "Belum CE"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{i.status || "—"}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{formatDate(i.tanggalTarget)}</td>
                  <td className={cn("px-2 py-1.5 font-semibold", i.done ? "text-success" : "text-critical")}>
                    {i.done ? "CLOSE" : "OPEN"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

/** ULTG × stream recap in one table. Every count opens its anomaly list;
 *  each stream row expands to the full anomaly detail inline. */
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
  const [open, setOpen] = useState<Set<string>>(new Set());
  const streamKeys = groups.flatMap((g) => g.streams.map((s) => `${g.ultg}|${s.label}`));
  const allOpen = streamKeys.length > 0 && streamKeys.every((k) => open.has(k));
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const row = (r: RecapRow, ultg: string, kind: "stream" | "subtotal" | "grand", isUpt = false) => {
    const k = `${isUpt ? "UPT" : ultg}|${r.label}`;
    const expanded = kind === "stream" && open.has(k);
    return (
      <Fragment key={`${ultg}|${r.label}|${kind}`}>
        <tr
          key={`${ultg}|${r.label}|${kind}`}
          className={cn(
            "border-b",
            kind === "subtotal" && "bg-muted/50 font-bold",
            kind === "grand" && "bg-primary/10 font-extrabold",
          )}
        >
          <td className={cn("px-3 py-1.5", kind === "stream" && "pl-4")}>
            {kind === "stream" ? (
              <button
                type="button"
                onClick={() => toggle(k)}
                aria-expanded={expanded}
                className="flex items-center gap-1 rounded text-left hover:text-primary"
              >
                <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")} />
                {r.label}
              </button>
            ) : (
              r.label
            )}
          </td>
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
        {expanded && <DetailRows items={r.items} showUltg={isUpt} />}
      </Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(streamKeys))}
          className="rounded-md border px-2.5 py-1 font-semibold text-foreground hover:bg-muted"
        >
          {allOpen ? "Tutup semua detail" : "Buka semua detail per ULTG"}
        </button>
        <span>Klik nama stream untuk menampilkan daftar anomalinya di bawah baris tersebut.</span>
      </div>
      <div className="max-h-[720px] overflow-auto rounded-lg border">
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
                  <td colSpan={COLS} className="px-3 pt-3 pb-1 text-xs font-extrabold text-primary uppercase">
                    {g === upt ? "UPT Palangkaraya — semua ULTG" : `ULTG ${g.ultg}`}
                  </td>
                </tr>
                {g.streams.map((s) => row(s, g.ultg, "stream", g === upt))}
                {row(g.subtotal, g.ultg, g === upt ? "grand" : "subtotal")}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
