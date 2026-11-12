"use client";

// Year-on-year comparison card (per user's own reference screenshot) with
// its OWN year + cutoff-month filter in the card header (per user: one
// filter per card, not one shared bar — Penyebab and Kinerja can be read
// at different periods independently). Defaults to the running year and
// running month; the previous year is always the calendar year before the
// selected one.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buildYoyCompareRows, type YoyCompareRow } from "@/lib/disturbance-yoy-compare";

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Red = more gangguan than last year (worse), green = fewer (better) —
 *  same framing used everywhere else on this page (critical/success
 *  colors), regardless of which category the row is about. */
function ChangeBadge({ row }: { row: YoyCompareRow }) {
  if (row.current === row.previous) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Minus className="size-3" /> 0%
      </span>
    );
  }
  const up = row.current > row.previous;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", up ? "text-critical" : "text-success")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(row.pctChange).toFixed(2)}%
    </span>
  );
}

export function YoyCompareTable({
  title,
  items,
  years,
  defaultYear,
  defaultCutoffMonth,
}: {
  title: string;
  /** Every individual event already reduced to the category label this
   *  card groups by (cause or kind) — see buildYoyCompareRows. */
  items: { category: string; year: string; dateISO: string }[];
  /** Ascending, same list data.years exposes — the year dropdown. */
  years: string[];
  /** Running year (Asia/Jakarta), computed on the server; falls back to
   *  the latest data year if the data has no row for it yet. */
  defaultYear: string;
  /** 1-12 — running month (Asia/Jakarta), computed on the server. Both
   *  years are truncated to the same month, so the column headers say
   *  exactly what's being compared (a still-in-progress current year is
   *  never silently compared against a previous year's full 12 months). */
  defaultCutoffMonth: number;
}) {
  const [year, setYear] = useState(years.includes(defaultYear) ? defaultYear : (years.at(-1) ?? defaultYear));
  const [cutoffMonth, setCutoffMonth] = useState(defaultCutoffMonth);

  const previousYear = String(Number(year) - 1);
  const rows = useMemo(
    () => buildYoyCompareRows(items, year, previousYear, cutoffMonth),
    [items, year, previousYear, cutoffMonth],
  );
  const monthLabel = MONTH_ID[cutoffMonth - 1] ?? "";
  const previousHasData = years.includes(previousYear);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg font-extrabold">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={year} onValueChange={(v) => v && setYear(v)}>
              <SelectTrigger size="sm" className="w-[90px]" aria-label="Tahun">
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
            <Select value={String(cutoffMonth)} onValueChange={(v) => v && setCutoffMonth(Number(v))}>
              <SelectTrigger size="sm" className="w-[130px]" aria-label="s.d. Bulan">
                <SelectValue placeholder="Bulan">s.d. {monthLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MONTH_ID.map((m, idx) => (
                  <SelectItem key={m} value={String(idx + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Kumulatif Januari–{monthLabel} — {previousYear} vs {year}
          {!previousHasData ? ` (tidak ada data ${previousYear})` : ""} — merah berarti naik (lebih banyak
          gangguan), hijau berarti turun dibanding periode yang sama tahun sebelumnya.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data untuk dibandingkan.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-bold">Kategori</th>
                  <th className="px-3 py-2.5 text-right font-bold">
                    s.d. {monthLabel} {previousYear}
                  </th>
                  <th className="px-3 py-2.5 text-right font-bold">
                    s.d. {monthLabel} {year}
                  </th>
                  <th className="px-3 py-2.5 text-right font-bold">Perubahan %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.category} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{row.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.previous}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.current}</td>
                    <td className="px-3 py-2 text-right">
                      <ChangeBadge row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
