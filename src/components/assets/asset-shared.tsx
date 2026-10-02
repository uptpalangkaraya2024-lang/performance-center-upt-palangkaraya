"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_VALUE } from "@/lib/asset-scanning-compute";

export interface AssetFilterSelectConfig {
  key: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  /** Shown both as the "show everything" option's label and as the trigger's
   *  placeholder — e.g. "Semua ULTG". */
  allLabel: string;
  width?: string;
}

/** A row of cascading ULTG/GI/Ruas selects — each sheet's panel builds its
 *  own `options` arrays (via src/lib/asset-scanning-compute.ts) since what
 *  counts as "GI" and whether a 3rd "Ruas" level even applies differs per
 *  sheet (MPU/BPU Bay Line has one, MPU BUSPRO stops at GI). */
export function AssetFilterBar({ selects }: { selects: AssetFilterSelectConfig[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selects.map((s) => (
        <Select key={s.key} value={s.value} onValueChange={(v) => v && s.onChange(v)}>
          <SelectTrigger size="sm" className={cn("bg-card", s.width ?? "w-[200px]")}>
            <SelectValue placeholder={s.allLabel}>{s.value === ALL_VALUE ? s.allLabel : s.value}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>{s.allLabel}</SelectItem>
            {s.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}

/** Every non-empty field of a row's own `raw` bag (everything NOT already
 *  surfaced as a curated field), auto-laid-out as a compact key:value grid —
 *  only populated cells render, so a bay with mostly-blank advanced
 *  protection settings doesn't show 80 "—" rows. This is what keeps a
 *  ~100-column sheet "bisa dilihat" (viewable) without a bespoke section
 *  per column: nothing is hidden, but nothing empty takes up space either. */
export function AssetRawDetailGrid({ raw }: { raw: Record<string, string> }) {
  const entries = Object.entries(raw);
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data tambahan pada sheet untuk baris ini.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-md border bg-muted px-3 py-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{key}</p>
          <p className="text-sm font-medium break-words text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}

/** Collapsed by default (same pattern as AHI's own CollapsibleDataDetail) —
 *  the per-ruas breakdown card's full technical detail only expands on
 *  demand, so a filtered list of several ruas doesn't dump dozens of
 *  key:value grids on screen at once. */
export function AssetDetailToggle({ label = "Detail Teknis", children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? `Sembunyikan ${label}` : `Tampilkan ${label}`}
      </button>
      {open ? children : null}
    </div>
  );
}

export function AssetStatTile({ value, label, className }: { value: string | number; label: string; className?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg border bg-muted p-3">
      <div className={cn("text-xl font-bold tabular-nums sm:text-2xl", className ?? "text-foreground")}>{value}</div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

const STATUS_TONE_CLASS: Record<"good" | "warn" | "neutral", string> = {
  good: "border-success/40 bg-success/15 text-success",
  warn: "border-warning/50 bg-warning/15 text-warning-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
};

/** Each panel decides what counts as "good" vs "warn" for its own sheet's
 *  status column (e.g. "NORMAL" vs anything else, "ADA" vs "TIDAK ADA") —
 *  this just renders whichever tone it's told. */
export function AssetStatusBadge({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap", STATUS_TONE_CLASS[tone])}>
      {label}
    </span>
  );
}

export function AssetInfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-secondary px-2.5 py-1.5">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
