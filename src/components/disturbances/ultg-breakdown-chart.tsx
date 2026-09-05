"use client";

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
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import type { DisturbanceUltgSummary } from "@/types";

const labelStyle = { fontSize: 11, fill: "var(--card)", fontWeight: 600 } as const;

// Legend's own auto-derived item order sorts alphabetically rather than
// matching the stack's left-to-right order (Trip, AR Sukses, Tidak Trip) —
// its `payload` prop is typed as unavailable to callers in this recharts
// version, so a custom `content` renderer is used instead to fix the order.
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

// Only 3 ULTGs exist — small enough that every one's cause breakdown can
// stay visible at once (no click-to-reveal needed, unlike the bay chart
// below which has to pick a top-N). Ranking + composition both read
// straight off the stacked bar's length, and every segment prints its own
// count so nothing requires hovering to read.
export function UltgBreakdownChart({ rows, showAr }: { rows: DisturbanceUltgSummary[]; showAr: boolean }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data ULTG untuk kategori ini.</p>;
  }

  // rows already sorted by total desc (service) — recharts renders a
  // vertical BarChart's first data item at the top, so this order already
  // reads as a ranking, largest first. Total is folded into the axis label
  // itself so the overall count is visible without hovering too.
  const chartData = rows.map((r) => ({
    ultg: `${r.ultg} (${r.total})`,
    Trip: r.trip,
    ...(showAr ? { "AR Sukses": r.arSukses } : {}),
    "Tidak Trip": r.tidakTrip,
  }));

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 56)}>
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
            content={renderFixedLegend([
              { value: "Trip", color: "var(--critical)" },
              ...(showAr ? [{ value: "AR Sukses", color: "var(--primary)" }] : []),
              { value: "Tidak Trip", color: "var(--muted-foreground)" },
            ])}
          />
          <Bar dataKey="Trip" stackId="kind" fill="var(--critical)" barSize={28}>
            <LabelList dataKey="Trip" position="center" style={labelStyle} formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")} />
          </Bar>
          {showAr ? (
            <Bar dataKey="AR Sukses" stackId="kind" fill="var(--primary)" barSize={28}>
              <LabelList dataKey="AR Sukses" position="center" style={labelStyle} formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")} />
            </Bar>
          ) : null}
          <Bar dataKey="Tidak Trip" stackId="kind" fill="var(--muted-foreground)" radius={[0, 4, 4, 0]} barSize={28}>
            <LabelList
              dataKey="Tidak Trip"
              position="center"
              style={labelStyle}
              formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.ultg} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <p className="text-xs font-medium text-foreground">{row.ultg}</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3.5" /> {row.followUp.closed} Selesai
              </span>
              <span className="flex items-center gap-1 text-critical">
                <XCircle className="size-3.5" /> {row.followUp.open} Open
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <CircleDashed className="size-3.5" /> {row.followUp.unknown} Belum Diketahui
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
