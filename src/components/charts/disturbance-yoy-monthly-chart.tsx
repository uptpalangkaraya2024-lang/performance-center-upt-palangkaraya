"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DisturbanceCauseMonthlyYear, DisturbanceKindMonthlyYear, DisturbanceMonthlyYearPoint } from "@/types";

const YEAR_COLORS = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)"];
const ALL_VALUE = "__all__";

// Same 12-month Indonesian label order buildMonthlyByYear() in
// src/services/disturbances.ts already produces each point's `.month` in —
// duplicated here rather than imported since that file is server-only.
const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type FilterMode = "all" | "cause" | "kind";

function toCumulative(data: DisturbanceMonthlyYearPoint[], years: string[]): DisturbanceMonthlyYearPoint[] {
  const running: Record<string, number> = Object.fromEntries(years.map((year) => [year, 0]));
  return data.map((point) => {
    const next: DisturbanceMonthlyYearPoint = { month: point.month };
    for (const year of years) {
      running[year] += Number(point[year] ?? 0);
      next[year] = running[year];
    }
    return next;
  });
}

export function DisturbanceYoyMonthlyChart({
  monthlyByYear,
  monthlyByYearByCause,
  monthlyByYearByKind,
  years,
}: {
  monthlyByYear: DisturbanceMonthlyYearPoint[];
  monthlyByYearByCause: DisturbanceCauseMonthlyYear[];
  monthlyByYearByKind: DisturbanceKindMonthlyYear[];
  years: string[];
}) {
  // Default to the two most recent years — "dibandingkan antara 2 tahun" —
  // while every year stays available to toggle on/off.
  const [selectedYears, setSelectedYears] = useState<string[]>(years.slice(-2));
  const searchParams = useSearchParams();
  // A Management Attention / Top Issue link on the Overview dashboard can
  // point here with ?cause=<cause> to preselect that cause's line instead of
  // "Semua" — both the Transmisi and Trafo chart instances read the same
  // param, so a cause that only exists in one category simply leaves the
  // other showing no match (its own Select still falls back cleanly).
  const initialCause = searchParams.get("cause");
  const initialHasCause = !!initialCause && monthlyByYearByCause.some((c) => c.cause === initialCause);

  const [filterMode, setFilterMode] = useState<FilterMode>(initialHasCause ? "cause" : "all");
  const [selectedCause, setSelectedCause] = useState(initialHasCause ? (initialCause as string) : ALL_VALUE);
  const [selectedKind, setSelectedKind] = useState(ALL_VALUE);
  const [cumulative, setCumulative] = useState(false);
  const [fromMonth, setFromMonth] = useState(0);
  const [toMonth, setToMonth] = useState(11);

  function toggleYear(year: string) {
    setSelectedYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  }

  const colorFor = (year: string) => YEAR_COLORS[years.indexOf(year) % YEAR_COLORS.length];

  const chartData = useMemo(() => {
    const baseData =
      filterMode === "cause" && selectedCause !== ALL_VALUE
        ? (monthlyByYearByCause.find((c) => c.cause === selectedCause)?.data ?? [])
        : filterMode === "kind" && selectedKind !== ALL_VALUE
          ? (monthlyByYearByKind.find((k) => k.kind === selectedKind)?.data ?? [])
          : monthlyByYear;

    // Range is applied first — cumulative then restarts at 0 from "Dari",
    // matching "hanya lihat rentang ini" rather than a partial view into a
    // full-year running total.
    const ranged = baseData.slice(fromMonth, toMonth + 1);
    return cumulative ? toCumulative(ranged, years) : ranged;
  }, [monthlyByYear, monthlyByYearByCause, monthlyByYearByKind, filterMode, selectedCause, selectedKind, cumulative, fromMonth, toMonth, years]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-full border p-0.5">
          {([
            { mode: "all" as const, label: "Semua" },
            { mode: "cause" as const, label: "Per Penyebab" },
            { mode: "kind" as const, label: "Per Jenis" },
          ]).map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                filterMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {filterMode === "cause" ? (
          <Select value={selectedCause} onValueChange={(value) => setSelectedCause(value ?? ALL_VALUE)}>
            <SelectTrigger size="sm" className="w-[180px]">
              {/* Rendered explicitly instead of relying on SelectValue's own
                  item-label lookup — that only resolves once the popup has
                  actually mounted at least once, so the trigger shows the
                  raw value ("__all__") on first paint otherwise. */}
              <SelectValue placeholder="Penyebab">
                {selectedCause === ALL_VALUE ? "Semua Penyebab" : selectedCause}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua Penyebab</SelectItem>
              {monthlyByYearByCause.map((c) => (
                <SelectItem key={c.cause} value={c.cause}>
                  {c.cause}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {filterMode === "kind" ? (
          <Select value={selectedKind} onValueChange={(value) => setSelectedKind(value ?? ALL_VALUE)}>
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue placeholder="Jenis Gangguan">
                {selectedKind === ALL_VALUE ? "Semua Jenis" : selectedKind}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Semua Jenis</SelectItem>
              {monthlyByYearByKind.map((k) => (
                <SelectItem key={k.kind} value={k.kind}>
                  {k.kind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <div className="flex items-center rounded-full border p-0.5">
          {(["Bulanan", "Kumulatif"] as const).map((label) => {
            const active = (label === "Kumulatif") === cumulative;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setCumulative(label === "Kumulatif")}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {years.map((year) => {
            const active = selectedYears.includes(year);
            return (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Rentang bulan:</span>
        <Select
          value={String(fromMonth)}
          onValueChange={(value) => {
            if (!value) return;
            const idx = Number(value);
            setFromMonth(idx);
            if (idx > toMonth) setToMonth(idx);
          }}
        >
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Dari">{MONTH_ID[fromMonth]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTH_ID.map((month, idx) => (
              <SelectItem key={month} value={String(idx)}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>sampai</span>
        <Select
          value={String(toMonth)}
          onValueChange={(value) => {
            if (!value) return;
            const idx = Number(value);
            setToMonth(idx);
            if (idx < fromMonth) setFromMonth(idx);
          }}
        >
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Sampai">{MONTH_ID[toMonth]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTH_ID.map((month, idx) => (
              <SelectItem key={month} value={String(idx)}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fromMonth !== 0 || toMonth !== 11 ? (
          <button
            type="button"
            onClick={() => {
              setFromMonth(0);
              setToMonth(11);
            }}
            className="text-primary hover:underline"
          >
            Reset ke Jan–Des
          </button>
        ) : null}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="var(--muted-foreground)"
            interval={0}
            angle={-15}
            textAnchor="end"
            height={45}
          />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {years
            .filter((year) => selectedYears.includes(year))
            .map((year) => (
              <Line
                key={year}
                type="monotone"
                dataKey={year}
                name={year}
                stroke={colorFor(year)}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                label={{ position: "top", fontSize: 10, fill: colorFor(year) }}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
