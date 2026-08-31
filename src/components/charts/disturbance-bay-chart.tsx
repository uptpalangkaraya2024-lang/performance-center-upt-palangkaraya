"use client";

import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DisturbanceBayCount } from "@/types";

export function DisturbanceBayChart({ data }: { data: DisturbanceBayCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RechartsBarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="bay"
          tickLine={false}
          axisLine={false}
          fontSize={10}
          stroke="var(--muted-foreground)"
          width={150}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" name="Jumlah Gangguan" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={16} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
