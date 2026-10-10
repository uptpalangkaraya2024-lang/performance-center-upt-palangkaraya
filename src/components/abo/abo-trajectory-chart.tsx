"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { AboTrajectoryPoint } from "@/lib/abo-proteksi-compute";

// One tick per month (every 4th week) rather than all 48 week labels — 48
// x-axis ticks would overlap into an unreadable smear at this chart's size.
function monthTick(weekLabel: string): string {
  return weekLabel.endsWith("-M1") ? weekLabel.replace("-M1", "") : "";
}

/** Full-year pacing line for one ABO program — plan (target, dashed) traced
 *  across the whole year vs. realisasi (solid) traced through the selected
 *  week, both as % of MASTER. Answers "has this program been pacing ahead
 *  or behind all year" at a glance, instead of only this week's verdict —
 *  see buildAboTrajectory's own comment for why the plan line here is the
 *  sheet's real week-by-week target, not an assumed-even diagonal. */
export function AboTrajectoryChart({
  trajectory,
  selectedWeekLabel,
}: {
  trajectory: AboTrajectoryPoint[];
  selectedWeekLabel: string;
}) {
  if (trajectory.every((p) => p.targetPercent === 0)) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-bold tracking-wide text-foreground uppercase">Grafik Lintasan Tahunan</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={trajectory} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="weekLabel"
            tickFormatter={monthTick}
            interval={0}
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--muted-foreground)"
            width={36}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              typeof value === "number" ? `${value.toFixed(1)}%` : "—",
              name === "targetPercent" ? "Target (plan)" : "Realisasi",
            ]}
            labelFormatter={(label) => String(label)}
          />
          <ReferenceLine
            x={selectedWeekLabel}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: "Periode Ini", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
          />
          <Line
            type="monotone"
            dataKey="targetPercent"
            stroke="var(--muted-foreground)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="realisasiPercent"
            stroke="var(--brand)"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
