"use client";

import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DisturbanceCause } from "@/types";

// Compact horizontal bar chart for a cause (Penyebab) breakdown scoped to
// one ULTG or one ruas/bay — same visual language as the page's main Pareto
// Penyebab chart, just without the cumulative-% line (not meaningful at
// this small a scale) and with counts printed directly on each bar so
// reading the numbers never requires hovering.
export function CauseMiniChart({ data }: { data: DisturbanceCause[] }) {
  if (data.length === 0) {
    return <p className="text-xs text-muted-foreground">Belum ada data penyebab.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(40, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 28, left: 4, bottom: 2 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="cause"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
          width={120}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={14}>
          <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "var(--foreground)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
