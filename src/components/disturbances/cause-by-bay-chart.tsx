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
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { DisturbanceBaySummary, DisturbanceCause } from "@/types";

const TOP_N = 15;
const PAGE_SIZE = 10;
const ALL_VALUE = "__all__";
const labelStyle = { fontSize: 10, fill: "var(--card)", fontWeight: 600 } as const;
// Cycled by index — enough distinct hues for every cause this data source
// actually has (confirmed live: at most ~6-7 per category), wrapping around
// safely if a new cause code ever appears.
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

export function CauseByBayChart({
  rows,
  causeOrder,
}: {
  rows: DisturbanceBaySummary[];
  /** The category's own causePareto (already sorted by total count desc) —
   *  used only to fix a stable stacking order/color per cause, consistent
   *  with the page's other Pareto Penyebab chart. */
  causeOrder: DisturbanceCause[];
}) {
  const [selectedBay, setSelectedBay] = useState<string | null>(rows[0]?.bay ?? null);
  const [selectedCause, setSelectedCause] = useState(ALL_VALUE);
  const [showFullTable, setShowFullTable] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const causeColor = (cause: string) => {
    const idx = causeOrder.findIndex((c) => c.cause === cause);
    return CAUSE_COLORS[(idx < 0 ? 0 : idx) % CAUSE_COLORS.length];
  };

  function causeCountFor(row: DisturbanceBaySummary, cause: string): number {
    return row.causePareto.find((c) => c.cause === cause)?.count ?? 0;
  }

  // Re-ranks by the selected cause's own count instead of total when
  // filtered — the bay hit hardest by Petir isn't necessarily the bay with
  // the most gangguan overall.
  const rankedRows = useMemo(() => {
    if (selectedCause === ALL_VALUE) return rows;
    return [...rows]
      .filter((r) => causeCountFor(r, selectedCause) > 0)
      .sort((a, b) => causeCountFor(b, selectedCause) - causeCountFor(a, selectedCause));
  }, [rows, selectedCause]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rankedRows;
    const needle = search.trim().toLowerCase();
    return rankedRows.filter((r) => `${r.bay} ${r.ultg} ${r.gi}`.toLowerCase().includes(needle));
  }, [rankedRows, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data ruas/bay untuk kategori ini.</p>;
  }

  const top = rankedRows.slice(0, TOP_N);
  // Every cause the category has, in a fixed order — stacked per bay so the
  // same cause always gets the same color/position across every bar.
  const causesToStack =
    selectedCause === ALL_VALUE ? causeOrder.map((c) => c.cause) : [selectedCause];

  const chartData = top.map((r) => {
    const displayTotal =
      selectedCause === ALL_VALUE ? r.total : causeCountFor(r, selectedCause);
    const point: Record<string, string | number> = { bay: `${r.bay} (${displayTotal})`, bayKey: r.bay };
    for (const cause of causesToStack) point[cause] = causeCountFor(r, cause);
    return point;
  });

  const selected = rows.find((r) => r.bay === selectedBay) ?? top[0] ?? rows[0];
  // Recharts' Bar onClick payload nests the original datum under `.payload`.
  const handleBarClick = (data: unknown) => {
    const bayKey = (data as { payload?: { bayKey?: string } } | undefined)?.payload?.bayKey;
    if (bayKey) setSelectedBay(bayKey);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
        <p className="text-xs text-muted-foreground">
          {top.length} ruas {selectedCause === ALL_VALUE ? "dengan gangguan terbanyak" : `dengan penyebab ${selectedCause} terbanyak`} dari{" "}
          {rankedRows.length} ruas — klik bar untuk melihat rinciannya.
        </p>
      </div>

      {top.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tidak ada ruas dengan penyebab {selectedCause} untuk kategori ini.
        </p>
      ) : (
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
            <Legend
              content={renderFixedLegend(causesToStack.map((cause) => ({ value: cause, color: causeColor(cause) })))}
            />
            {causesToStack.map((cause, idx) => (
              <Bar
                key={cause}
                dataKey={cause}
                stackId="cause"
                fill={causeColor(cause)}
                barSize={16}
                radius={idx === causesToStack.length - 1 ? [0, 4, 4, 0] : undefined}
                onClick={handleBarClick}
                cursor="pointer"
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

      {selected ? (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{selected.bay}</p>
            <p className="text-xs text-muted-foreground">
              {selected.ultg} · GI {selected.gi} · {selected.total} gangguan
            </p>
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
          {showFullTable ? "Sembunyikan" : "Lihat"} tabel lengkap semua {rankedRows.length} ruas
          {selectedCause !== ALL_VALUE ? ` (${selectedCause})` : ""}
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
                        <TableHead>Penyebab Terbesar</TableHead>
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
                          <TableCell className="whitespace-nowrap">
                            {row.causePareto[0] ? `${row.causePareto[0].cause} (${row.causePareto[0].count})` : "-"}
                          </TableCell>
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
