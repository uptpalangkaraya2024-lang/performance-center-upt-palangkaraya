"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LabelList,
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
  // Mirrors the left YAxis's own domain formula so we can tell, per point,
  // how close a bar's top sits to the cumulative line at that same category —
  // when a category's count share happens to land near its cumulative %,
  // the two scales place the bar top and the line point only a few px apart
  // on the shared plot area, and no fixed label offset survives every dataset.
  const maxCount = Math.max(...data.map((item) => item.count));
  const leftDomainMax = Math.ceil(maxCount * 1.5);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={withCumulative} margin={{ top: 28, right: 24, left: -12, bottom: 0 }}>
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
          // Extra headroom above the tallest bar so its own count label
          // never collides with the cumulative line/dot passing near the top.
          // The dominant first category in a Pareto typically has a count
          // share close to its own cumulative %, so on the shared plot area
          // its bar top and the line's first dot land only a few px apart —
          // 1.5x (not just 1.2x) pushes the bar down enough to keep them clear.
          domain={[0, (max: number) => Math.ceil(max * 1.5)]}
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
        <Bar yAxisId="left" dataKey="count" name="Jumlah" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={28}>
          <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "var(--primary)" }} />
        </Bar>
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulativePct"
          name="Kumulatif %"
          stroke="var(--brand)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--brand)" }}
          label={(props) => {
            // Once the cumulative line reaches 100% every remaining point
            // sits at the exact same spot — labeling each one stacks
            // identical "100%" text on top of itself. Only the point where
            // a value first appears (or the very last point, so the line's
            // end is never unlabeled) gets a label.
            const { x, y, value, index } = props;
            if (x == null || y == null || value == null || typeof index !== "number") return undefined;
            const numericValue = Number(value);
            const isRepeat = index > 0 && withCumulative[index - 1]?.cumulativePct === numericValue;
            const isLast = index === withCumulative.length - 1;
            if (isRepeat && !isLast) return undefined;
            // If this point's bar-top and line-point pixel heights are close,
            // stacking the label above the dot would land it on the bar's
            // own count label — push it out to the side instead.
            const barTopFraction = withCumulative[index].count / leftDomainMax;
            const lineFraction = numericValue / 100;
            const isNearBarTop = Math.abs(barTopFraction - lineFraction) < 0.1;
            if (isNearBarTop) {
              return (
                <text x={Number(x) + 16} y={Number(y) + 3} textAnchor="start" fontSize={10} fill="var(--brand)">
                  {numericValue}%
                </text>
              );
            }
            return (
              <text x={x} y={Number(y) - 12} textAnchor="middle" fontSize={10} fill="var(--brand)">
                {numericValue}%
              </text>
            );
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
