"use client";

import { useMemo, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UltgKpi } from "@/types";
import { formatKpiValue } from "@/components/kinerja-upt/format";

// Same chart as Kinerja UPT's UptTrendChart, just typed for UltgKpi — see
// that file's own comment. Resets its selection (via `key` in the parent)
// whenever the selected ULTG changes, since KPI keys are shared across ULTGs
// but each ULTG's own monthlyTrend data differs.
export function UltgTrendChart({ kpis }: { kpis: UltgKpi[] }) {
  const trendable = useMemo(() => kpis.filter((k) => k.monthlyTrend && k.monthlyTrend.length > 0), [kpis]);
  const [selectedKey, setSelectedKey] = useState(trendable[0]?.key ?? "");

  if (trendable.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
        <LineChartIcon className="size-8" />
        <p className="text-sm">Data historis belum tersedia.</p>
        <p className="max-w-sm text-xs">
          Trend bulanan akan tersedia setelah data historis mencukupi pada sheet sumber.
        </p>
      </div>
    );
  }

  const selected = trendable.find((k) => k.key === selectedKey) ?? trendable[0];
  const chartData = (selected.monthlyTrend ?? []).map((point) => ({ month: point.month, value: point.value }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Realisasi Komulatif bulanan — {selected.abbreviation ?? selected.displayName}
        </p>
        <Select value={selected.key} onValueChange={(value) => value && setSelectedKey(value)}>
          <SelectTrigger size="sm" className="w-[220px]">
            <SelectValue placeholder="Pilih KPI">{selected.abbreviation ?? selected.displayName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {trendable.map((kpi) => (
              <SelectItem key={kpi.key} value={kpi.key}>
                {kpi.abbreviation ?? kpi.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            stroke="var(--muted-foreground)"
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
            formatter={(value) =>
              [formatKpiValue(typeof value === "number" ? value : null, null, selected.unit), "Realisasi"] as [
                string,
                string,
              ]
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--brand)" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
