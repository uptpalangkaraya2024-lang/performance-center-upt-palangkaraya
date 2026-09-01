"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { TrendPoint } from "@/types";

export function PerformanceTrendChart({ data }: { data: TrendPoint[] }) {
  const target = data[0]?.target;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="var(--muted-foreground)"
          domain={[70, 100]}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        {target ? (
          <ReferenceLine
            y={target}
            stroke="var(--warning)"
            strokeDasharray="4 4"
            label={{ value: `Target ${target}%`, fontSize: 11, fill: "var(--warning-foreground)", position: "insideTopRight" }}
          />
        ) : null}
        <Line
          type="monotone"
          dataKey="value"
          name="Performance"
          stroke="var(--primary)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "var(--primary)" }}
          activeDot={{ r: 5 }}
          label={{ position: "top", fontSize: 11, fill: "var(--primary)", formatter: (value) => `${value}%` }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
