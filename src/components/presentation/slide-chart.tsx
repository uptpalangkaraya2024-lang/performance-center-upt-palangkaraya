"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { PresentationChartSpec } from "@/types";

// Same visual language as Gangguan's own Mode Presentasi
// (src/components/disturbances/disturbance-presentation-view.tsx) —
// horizontal bars, donut pies with percent labels, var(--chart-N) tokens —
// reused here so a chart inside a Presentasi slide doesn't look like a
// different app from the one it was built from.
const SLICE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"];

function formatBarLabel(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

function ChartTooltip() {
  return (
    <Tooltip
      contentStyle={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        fontSize: 12,
      }}
    />
  );
}

function BarCard({ spec }: { spec: PresentationChartSpec }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <ComposedChart data={spec.data} layout="vertical" margin={{ top: 8, right: 28, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" allowDecimals={false} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" width={130} />
        <ChartTooltip />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]}>
          <LabelList dataKey="value" position="right" fontSize={11} fill="var(--muted-foreground)" formatter={formatBarLabel} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PieCard({ spec }: { spec: PresentationChartSpec }) {
  const total = spec.data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={200}>
          <PieChart margin={{ top: 20, right: 8, bottom: 8, left: 8 }}>
            <Pie
              data={spec.data}
              dataKey="value"
              nameKey="name"
              innerRadius="38%"
              outerRadius="68%"
              paddingAngle={2}
              label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
              labelLine={false}
              fontSize={11}
            >
              {spec.data.map((d, i) => (
                <Cell key={d.name} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
              ))}
              <Label value={String(total)} position="center" fontSize={20} fontWeight={700} fill="var(--foreground)" />
            </Pie>
            <ChartTooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex shrink-0 flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {spec.data.map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

function ParetoCard({ spec }: { spec: PresentationChartSpec }) {
  const combined = spec.data.map((d, i) => ({ name: d.name, value: d.value, cumulative: spec.cumulativePercent?.[i] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={220}>
      <ComposedChart data={combined} margin={{ top: 8, right: 16, left: -8, bottom: 32 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
          angle={-25}
          textAnchor="end"
          interval={0}
          height={50}
        />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" allowDecimals={false} width={32} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <ChartTooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey="value" name="Jumlah" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="value" position="top" fontSize={10} fill="var(--muted-foreground)" formatter={formatBarLabel} />
        </Bar>
        <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Kumulatif %" stroke="var(--critical)" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** One chart card for a slide — type dispatches to the right Recharts
 *  layout. Used both in the full slide view and the fullscreen present
 *  mode (via SlideBody), so sizing is controlled entirely by the parent's
 *  own grid/flex container, never a fixed height here. */
export function SlideChart({ spec }: { spec: PresentationChartSpec }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col gap-1.5 rounded-lg border bg-muted p-3">
      {spec.title ? <p className="shrink-0 text-sm font-semibold text-foreground">{spec.title}</p> : null}
      <div className="min-h-0 flex-1">
        {spec.type === "pie" ? <PieCard spec={spec} /> : spec.type === "pareto" ? <ParetoCard spec={spec} /> : <BarCard spec={spec} />}
      </div>
    </div>
  );
}
