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

import { CauseMiniChart } from "./cause-mini-chart";
import type { DisturbanceUltgSummary } from "@/types";

const labelStyle = { fontSize: 11, fill: "var(--card)", fontWeight: 600 } as const;

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
          <Legend wrapperStyle={{ fontSize: 12 }} />
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

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.ultg} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                {row.ultg} <span className="font-normal text-muted-foreground">({row.total} gangguan)</span>
              </p>
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
            <div className="mt-2">
              <CauseMiniChart data={row.causePareto} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
