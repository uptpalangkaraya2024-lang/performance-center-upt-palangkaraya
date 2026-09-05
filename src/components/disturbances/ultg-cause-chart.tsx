"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
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
import type { DisturbanceCause, DisturbanceUltgSummary } from "@/types";

const ALL_VALUE = "__all__";
const labelStyle = { fontSize: 11, fill: "var(--card)", fontWeight: 600 } as const;
// Cycled by index — same palette CauseByBayChart uses, so a given cause
// reads as the same color everywhere on the page.
const CAUSE_COLORS = [
  "var(--chart-1)",
  "var(--chart-5)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--critical)",
  "var(--warning)",
  "var(--success)",
  "var(--primary)",
  "var(--muted-foreground)",
];

// Legend's own auto-derived item order sorts alphabetically rather than
// matching the stack's left-to-right (Pareto) order — its `payload` prop is
// typed as unavailable to callers in this recharts version, so a custom
// `content` renderer is used instead to fix the order.
function renderFixedLegend(items: { value: string; color: string }[]) {
  function FixedLegend() {
    return (
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item.value} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.value}
          </li>
        ))}
      </ul>
    );
  }
  return FixedLegend;
}

// Only 3 ULTGs exist — small enough to show every one at once as a single
// stacked-by-cause chart instead of the per-ULTG mini-chart cards this
// replaces. Both filters narrow the same chart rather than opening a
// separate detail view: pick one ULTG to focus on just its own breakdown,
// pick one Penyebab to compare that cause alone across ULTGs, or both.
export function UltgCauseChart({
  rows,
  causeOrder,
}: {
  rows: DisturbanceUltgSummary[];
  causeOrder: DisturbanceCause[];
}) {
  const [selectedUltg, setSelectedUltg] = useState(ALL_VALUE);
  const [selectedCause, setSelectedCause] = useState(ALL_VALUE);

  const causeColor = (cause: string) => {
    const idx = causeOrder.findIndex((c) => c.cause === cause);
    return CAUSE_COLORS[(idx < 0 ? 0 : idx) % CAUSE_COLORS.length];
  };

  function causeCountFor(row: DisturbanceUltgSummary, cause: string): number {
    return row.causePareto.find((c) => c.cause === cause)?.count ?? 0;
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data ULTG untuk kategori ini.</p>;
  }

  const shownRows = selectedUltg === ALL_VALUE ? rows : rows.filter((r) => r.ultg === selectedUltg);
  const causesToStack = selectedCause === ALL_VALUE ? causeOrder.map((c) => c.cause) : [selectedCause];

  const chartData = shownRows.map((r) => {
    const displayTotal = selectedCause === ALL_VALUE ? r.total : causeCountFor(r, selectedCause);
    const point: Record<string, string | number> = { ultg: `${r.ultg} (${displayTotal})` };
    for (const cause of causesToStack) point[cause] = causeCountFor(r, cause);
    return point;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedUltg} onValueChange={(value) => setSelectedUltg(value ?? ALL_VALUE)}>
          <SelectTrigger size="sm" className="w-[170px]">
            <SelectValue placeholder="ULTG">{selectedUltg === ALL_VALUE ? "Semua ULTG" : selectedUltg}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua ULTG</SelectItem>
            {rows.map((r) => (
              <SelectItem key={r.ultg} value={r.ultg}>
                {r.ultg}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedCause} onValueChange={(value) => setSelectedCause(value ?? ALL_VALUE)}>
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue placeholder="Penyebab">{selectedCause === ALL_VALUE ? "Semua Penyebab" : selectedCause}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua Penyebab</SelectItem>
            {causeOrder.map((c) => (
              <SelectItem key={c.cause} value={c.cause}>
                {c.cause}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data untuk kombinasi filter ini.</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, chartData.length * 64)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="ultg"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              stroke="var(--muted-foreground)"
              width={170}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
              }}
            />
            <Legend
              content={renderFixedLegend(causesToStack.map((cause) => ({ value: cause, color: causeColor(cause) })))}
            />
            {causesToStack.map((cause, idx) => (
              <Bar
                key={cause}
                dataKey={cause}
                stackId="cause"
                fill={causeColor(cause)}
                barSize={28}
                radius={idx === causesToStack.length - 1 ? [0, 4, 4, 0] : undefined}
              >
                <LabelList
                  dataKey={cause}
                  position="center"
                  style={labelStyle}
                  formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
