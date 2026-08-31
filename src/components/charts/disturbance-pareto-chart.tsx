"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DisturbanceCause } from "@/types";

export function DisturbanceParetoChart({ data }: { data: DisturbanceCause[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const cumulativeCounts = data.reduce<number[]>((acc, item) => {
    acc.push((acc.at(-1) ?? 0) + item.count);
    return acc;
  }, []);
  const withCumulative = data.map((item, index) => ({
    ...item,
    cumulativePct: Math.round((cumulativeCounts[index] / total) * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={withCumulative} margin={{ top: 8, right: 24, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="cause"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
          interval={0}
          angle={-15}
          textAnchor="end"
          height={50}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Bar yAxisId="left" dataKey="count" name="Jumlah" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={28} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulativePct"
          name="Kumulatif %"
          stroke="var(--warning)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--warning)" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
