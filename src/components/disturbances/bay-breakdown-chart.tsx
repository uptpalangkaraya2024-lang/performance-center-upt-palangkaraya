"use client";

import { useMemo, useState } from "react";
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
import { CheckCircle2, ChevronDown, CircleDashed, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CauseMiniChart } from "./cause-mini-chart";
import type { DisturbanceBaySummary } from "@/types";

const TOP_N = 15;
const PAGE_SIZE = 10;
const labelStyle = { fontSize: 10, fill: "var(--card)", fontWeight: 600 } as const;

export function BayBreakdownChart({ rows, showAr }: { rows: DisturbanceBaySummary[]; showAr: boolean }) {
  const [selectedBay, setSelectedBay] = useState<string | null>(rows[0]?.bay ?? null);
  const [showFullTable, setShowFullTable] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => `${r.bay} ${r.ultg} ${r.gi}`.toLowerCase().includes(needle));
  }, [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data ruas/bay untuk kategori ini.</p>;
  }

  // Charting all ~80+ bays at once would be just as unreadable as the table
  // it replaces — top N (ranked, service already sorts desc) keeps the chart
  // legible while the collapsed full table below still holds every ruas.
  const top = rows.slice(0, TOP_N);
  const chartData = top.map((r) => ({
    bay: `${r.bay} (${r.total})`,
    bayKey: r.bay,
    Trip: r.trip,
    ...(showAr ? { "AR Sukses": r.arSukses } : {}),
    "Tidak Trip": r.tidakTrip,
  }));

  const selected = rows.find((r) => r.bay === selectedBay) ?? top[0];
  // Recharts' Bar onClick payload nests the original datum under `.payload`
  // rather than passing it flat — typed loosely here since the exact shape
  // varies by recharts version/internal event type.
  const handleBarClick = (data: unknown) => {
    const bayKey = (data as { payload?: { bayKey?: string } } | undefined)?.payload?.bayKey;
    if (bayKey) setSelectedBay(bayKey);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {top.length} ruas dengan gangguan terbanyak dari {rows.length} total ruas — klik bar untuk melihat penyebabnya.
      </p>

      <ResponsiveContainer width="100%" height={Math.max(220, top.length * 32)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="bay"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            stroke="var(--muted-foreground)"
            width={190}
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
          <Bar dataKey="Trip" stackId="kind" fill="var(--critical)" barSize={16} onClick={handleBarClick} cursor="pointer">
            <LabelList dataKey="Trip" position="center" style={labelStyle} formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")} />
          </Bar>
          {showAr ? (
            <Bar dataKey="AR Sukses" stackId="kind" fill="var(--primary)" barSize={16} onClick={handleBarClick} cursor="pointer">
              <LabelList dataKey="AR Sukses" position="center" style={labelStyle} formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")} />
            </Bar>
          ) : null}
          <Bar
            dataKey="Tidak Trip"
            stackId="kind"
            fill="var(--muted-foreground)"
            radius={[0, 4, 4, 0]}
            barSize={16}
            onClick={handleBarClick}
            cursor="pointer"
          >
            <LabelList
              dataKey="Tidak Trip"
              position="center"
              style={labelStyle}
              formatter={(v: unknown) => (typeof v === "number" && v > 0 ? v : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {selected ? (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{selected.bay}</p>
            <p className="text-xs text-muted-foreground">
              {selected.ultg} · GI {selected.gi} · {selected.total} gangguan
            </p>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-success">
              <CheckCircle2 className="size-3.5" /> {selected.followUp.closed} Selesai
            </span>
            <span className="flex items-center gap-1 text-critical">
              <XCircle className="size-3.5" /> {selected.followUp.open} Open
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <CircleDashed className="size-3.5" /> {selected.followUp.unknown} Belum Diketahui
            </span>
          </div>
          <div className="mt-2">
            <CauseMiniChart data={selected.causePareto} />
          </div>
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => setShowFullTable((prev) => !prev)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", showFullTable && "rotate-180")} />
          {showFullTable ? "Sembunyikan" : "Lihat"} tabel lengkap semua {rows.length} ruas
        </button>

        {showFullTable ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Cari ruas/bay, ULTG, atau GI..."
                className="h-8 w-[260px]"
              />
              <p className="text-xs text-muted-foreground">{filtered.length} ruas</p>
            </div>

            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada ruas yang sesuai dengan pencarian.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ruas / Bay</TableHead>
                        <TableHead>ULTG</TableHead>
                        <TableHead>GI</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Trip</TableHead>
                        {showAr ? <TableHead className="text-right">AR Sukses</TableHead> : null}
                        <TableHead className="text-right">Tidak Trip</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((row) => (
                        <TableRow
                          key={row.bay}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setSelectedBay(row.bay)}
                        >
                          <TableCell className="max-w-[220px] truncate font-medium" title={row.bay}>
                            {row.bay}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.ultg}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.gi}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                          <TableCell className="text-right tabular-nums text-critical">{row.trip}</TableCell>
                          {showAr ? (
                            <TableCell className="text-right tabular-nums text-primary">{row.arSukses}</TableCell>
                          ) : null}
                          <TableCell className="text-right tabular-nums text-muted-foreground">{row.tidakTrip}</TableCell>
                          <TableCell className="text-right tabular-nums text-critical">{row.followUp.open || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Halaman {currentPage + 1} dari {pageCount}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage((p) => p - 1)}>
                      Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= pageCount - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Berikutnya
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
