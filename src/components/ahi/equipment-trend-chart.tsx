"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { AhiKlasifikasi, EquipmentHistoryPoint } from "@/types";

const KLASIFIKASI_COLOR: Record<AhiKlasifikasi, string> = {
  BEST: "var(--success)",
  GOOD: "var(--success)",
  FAIR: "var(--muted-foreground)",
  POOR: "var(--warning)",
  CRITICAL: "var(--critical)",
  "NO DATA": "var(--border)",
};

const SKOR_LABEL: Record<number, string> = { 1: "Best", 2: "Good", 3: "Fair", 4: "Poor", 5: "Critical" };

function formatTanggal(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

interface ChartPoint extends EquipmentHistoryPoint {
  label: string;
}

function TrendDot(props: { cx?: number; cy?: number; payload?: ChartPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return <g />;
  return <circle cx={cx} cy={cy} r={4} fill={KLASIFIKASI_COLOR[payload.klasifikasi]} stroke="var(--card)" strokeWidth={1.5} />;
}

/** Skor AHI over time for one equipment unit, sourced from the Riwayat
 *  history file (empty/short until enough test cycles have accumulated —
 *  see UnitCard's own handling of history.length < 2 for that case). */
export function EquipmentTrendChart({ history }: { history: EquipmentHistoryPoint[] }) {
  const data: ChartPoint[] = history.map((point) => ({ ...point, label: formatTanggal(point.tanggal) }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          reversed
          tickLine={false}
          axisLine={false}
          fontSize={10}
          stroke="var(--muted-foreground)"
          tickFormatter={(v: number) => SKOR_LABEL[v] ?? String(v)}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
          formatter={(_value, _name, item) => {
            const payload = (item as { payload?: ChartPoint }).payload;
            return [payload?.klasifikasi ?? "—", "Klasifikasi"];
          }}
        />
        <Line
          type="monotone"
          dataKey="skorAhi"
          name="Skor AHI"
          stroke="var(--primary)"
          strokeWidth={2}
          connectNulls
          dot={<TrendDot />}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
