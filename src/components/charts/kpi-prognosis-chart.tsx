"use client";

import { Bar, CartesianGrid, Cell, ComposedChart, Line, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MonthlyAggregatePoint } from "@/lib/kpi-prognosis";

/** Bar + line combo matching the user's own reference design — one bar per
 *  calendar month (Jan-Dec) showing the average raw achievement ratio
 *  (see kpi-prognosis.ts's own ratioForValue), a connecting line across
 *  all 12 months, and the value labeled above each point. Already-reported
 *  months render solid/primary; projected months render lighter so the
 *  "real vs projected" boundary is visible at a glance, not just in the
 *  caption text. */
export function KpiPrognosisChart({ data }: { data: MonthlyAggregatePoint[] }) {
  const chartData = data.map((d) => ({ ...d, value: d.avgRatio !== null ? Math.round(d.avgRatio * 100) / 100 : null }));
  const maxValue = Math.max(110, ...chartData.map((d) => d.value ?? 0));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
        <YAxis
          domain={[0, Math.ceil(maxValue * 1.15)]}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" name="Rata-rata rasio pencapaian" radius={[4, 4, 0, 0]} barSize={28}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.isProjected ? "var(--primary)" : "var(--brand)"} fillOpacity={d.isProjected ? 0.35 : 0.85} />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="value"
          name="Tren"
          stroke="var(--critical)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--critical)" }}
          connectNulls
        >
          <LabelList
            dataKey="value"
            position="top"
            style={{ fontSize: 10, fill: "var(--critical)", fontWeight: 700 }}
            formatter={(v: unknown) => (typeof v === "number" ? v.toFixed(2) : "")}
          />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
