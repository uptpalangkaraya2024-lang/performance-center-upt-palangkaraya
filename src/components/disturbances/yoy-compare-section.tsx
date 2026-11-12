"use client";

// Wraps the two YoY comparison tables (Penyebab + Kinerja) under ONE shared
// filter bar — year and cutoff month (per user request). Shared on purpose:
// both tables are read side-by-side as "the same period, two angles", so
// letting them drift to different periods would make the pair misleading.
//
// Year = the "current" year of the comparison; the previous year is always
// the calendar year right before it (so 2025 vs 2024 works even when the
// data only has 2024-2026). Month = cumulative cutoff (Jan–X), the same
// "s.d. bulan" framing the tables already use — defaults to today's month.
import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YoyCompareTable } from "@/components/disturbances/yoy-compare-table";
import { buildYoyCompareRows } from "@/lib/disturbance-yoy-compare";
import type { DisturbanceBayEventRecord } from "@/types";

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function YoyCompareSection({
  events,
  years,
  isTrafo,
  defaultCutoffMonth,
}: {
  events: DisturbanceBayEventRecord[];
  /** Ascending, same list data.years exposes. */
  years: string[];
  isTrafo: boolean;
  /** 1-12 — today's month (Asia/Jakarta), computed on the server. */
  defaultCutoffMonth: number;
}) {
  const [year, setYear] = useState(years.at(-1) ?? "");
  const [cutoffMonth, setCutoffMonth] = useState(defaultCutoffMonth);

  const previousYear = useMemo(() => {
    const n = Number(year);
    return Number.isFinite(n) && year ? String(n - 1) : "";
  }, [year]);

  const { penyebabRows, kinerjaRows } = useMemo(
    () => ({
      penyebabRows: buildYoyCompareRows(
        events.map((e) => ({ category: e.cause, year: e.year, dateISO: e.dateISO })),
        year,
        previousYear,
        cutoffMonth,
      ),
      kinerjaRows: buildYoyCompareRows(
        events
          .filter((e) => !isTrafo || e.kind !== "AR Sukses")
          .map((e) => ({ category: e.kind, year: e.year, dateISO: e.dateISO })),
        year,
        previousYear,
        cutoffMonth,
      ),
    }),
    [events, year, previousYear, cutoffMonth, isTrafo],
  );

  if (!year) return null;

  const previousHasData = years.includes(previousYear);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-secondary px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-bold text-foreground">Perbandingan Year-on-Year</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            — Januari–{MONTH_ID[cutoffMonth - 1]} {previousYear} vs {year}
            {!previousHasData ? ` (tidak ada data ${previousYear})` : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            Tahun
            <Select value={year} onValueChange={(v) => v && setYear(v)}>
              <SelectTrigger size="sm" className="w-[96px]">
                <SelectValue placeholder="Tahun">{year}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[...years].reverse().map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            s.d. Bulan
            <Select value={String(cutoffMonth)} onValueChange={(v) => v && setCutoffMonth(Number(v))}>
              <SelectTrigger size="sm" className="w-[130px]">
                <SelectValue placeholder="Bulan">{MONTH_ID[cutoffMonth - 1]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MONTH_ID.map((m, idx) => (
                  <SelectItem key={m} value={String(idx + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <YoyCompareTable
          title="Perbandingan Penyebab"
          rows={penyebabRows}
          currentYear={year}
          previousYear={previousYear}
          cutoffMonth={cutoffMonth}
        />
        <YoyCompareTable
          title="Perbandingan Kinerja"
          rows={kinerjaRows}
          currentYear={year}
          previousYear={previousYear}
          cutoffMonth={cutoffMonth}
        />
      </div>
    </div>
  );
}
