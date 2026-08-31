"use client";

import { useMemo, useState } from "react";
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
import type { DisturbanceCauseMonthlyYear, DisturbanceMonthlyYearPoint } from "@/types";

const YEAR_COLORS = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)"];
const ALL_CAUSES_VALUE = "__all__";

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
  years,
}: {
  monthlyByYear: DisturbanceMonthlyYearPoint[];
  monthlyByYearByCause: DisturbanceCauseMonthlyYear[];
  years: string[];
}) {
  // Default to the two most recent years — "dibandingkan antara 2 tahun" —
  // while every year stays available to toggle on/off.
  const [selectedYears, setSelectedYears] = useState<string[]>(years.slice(-2));
  const [selectedCause, setSelectedCause] = useState(ALL_CAUSES_VALUE);
  const [cumulative, setCumulative] = useState(false);

  function toggleYear(year: string) {
    setSelectedYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  }

  const colorFor = (year: string) => YEAR_COLORS[years.indexOf(year) % YEAR_COLORS.length];

  const chartData = useMemo(() => {
    const baseData =
      selectedCause === ALL_CAUSES_VALUE
        ? monthlyByYear
        : (monthlyByYearByCause.find((c) => c.cause === selectedCause)?.data ?? []);
    return cumulative ? toCumulative(baseData, years) : baseData;
  }, [monthlyByYear, monthlyByYearByCause, selectedCause, cumulative, years]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedCause} onValueChange={(value) => setSelectedCause(value ?? ALL_CAUSES_VALUE)}>
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue placeholder="Penyebab" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CAUSES_VALUE}>Semua Penyebab</SelectItem>
            {monthlyByYearByCause.map((c) => (
              <SelectItem key={c.cause} value={c.cause}>
                {c.cause}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
