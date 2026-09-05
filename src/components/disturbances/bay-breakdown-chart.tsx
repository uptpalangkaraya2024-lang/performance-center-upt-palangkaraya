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
import type { DisturbanceBaySummary } from "@/types";

const TOP_N = 15;
const PAGE_SIZE = 10;
const labelStyle = { fontSize: 10, fill: "var(--card)", fontWeight: 600 } as const;

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

type KindFilter = "all" | "trip" | "ar" | "tidaktrip";
const KIND_LABEL: Record<Exclude<KindFilter, "all">, string> = {
  trip: "Trip",
  ar: "AR Sukses",
  tidaktrip: "Tidak Trip",
};

export function BayBreakdownChart({ rows, showAr }: { rows: DisturbanceBaySummary[]; showAr: boolean }) {
  const [selectedBay, setSelectedBay] = useState<string | null>(rows[0]?.bay ?? null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [showFullTable, setShowFullTable] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Re-ranks by the selected jenis instead of total when filtered — a bay
  // with the most AR Sukses isn't necessarily the one with the most Trip, so
  // the ranking itself has to change, not just which segment is visible.
  const rankedRows = useMemo(() => {
    if (kindFilter === "all") return rows;
    const key = kindFilter === "trip" ? "trip" : kindFilter === "ar" ? "arSukses" : "tidakTrip";
    return [...rows].filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
  }, [rows, kindFilter]);

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

  // Charting all ~80+ bays at once would be just as unreadable as the table
  // it replaces — top N (ranked, service already sorts desc) keeps the chart
  // legible while the collapsed full table below still holds every ruas.
  const top = rankedRows.slice(0, TOP_N);
  // Zeroing the non-selected kinds (rather than swapping dataKeys) keeps the
  // same 3-Bar stack below unchanged for both "Semua Jenis" and a filtered
  // single jenis — a filtered bar just renders as one solid-color segment.
  const chartData = top.map((r) => {
    const trip = kindFilter === "all" || kindFilter === "trip" ? r.trip : 0;
    const ar = kindFilter === "all" || kindFilter === "ar" ? r.arSukses : 0;
    const tidakTrip = kindFilter === "all" || kindFilter === "tidaktrip" ? r.tidakTrip : 0;
    const displayTotal = kindFilter === "all" ? r.total : trip + ar + tidakTrip;
    return {
      bay: `${r.bay} (${displayTotal})`,
      bayKey: r.bay,
      Trip: trip,
      ...(showAr ? { "AR Sukses": ar } : {}),
      "Tidak Trip": tidakTrip,
    };
  });

  const selected = rows.find((r) => r.bay === selectedBay) ?? top[0] ?? rows[0];
  // Recharts' Bar onClick payload nests the original datum under `.payload`
  // rather than passing it flat — typed loosely here since the exact shape
  // varies by recharts version/internal event type.
  const handleBarClick = (data: unknown) => {
    const bayKey = (data as { payload?: { bayKey?: string } } | undefined)?.payload?.bayKey;
    if (bayKey) setSelectedBay(bayKey);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kindFilter} onValueChange={(value) => value && setKindFilter(value as KindFilter)}>
          <SelectTrigger size="sm" className="w-[170px]">
            <SelectValue placeholder="Jenis">{kindFilter === "all" ? "Semua Jenis" : KIND_LABEL[kindFilter]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jenis</SelectItem>
            <SelectItem value="trip">Trip</SelectItem>
            {showAr ? <SelectItem value="ar">AR Sukses</SelectItem> : null}
            <SelectItem value="tidaktrip">Tidak Trip</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {top.length} ruas {kindFilter === "all" ? "dengan gangguan terbanyak" : `dengan ${KIND_LABEL[kindFilter]} terbanyak`} dari{" "}
          {rankedRows.length} ruas — klik bar untuk melihat penyebabnya.
        </p>
      </div>

      {top.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tidak ada ruas dengan gangguan jenis {KIND_LABEL[kindFilter as Exclude<KindFilter, "all">]} untuk kategori ini.
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
            content={renderFixedLegend([
              { value: "Trip", color: "var(--critical)" },
              ...(showAr ? [{ value: "AR Sukses", color: "var(--primary)" }] : []),
              { value: "Tidak Trip", color: "var(--muted-foreground)" },
            ])}
          />
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
      )}

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
          {showFullTable ? "Sembunyikan" : "Lihat"} tabel lengkap semua {rankedRows.length} ruas
          {kindFilter !== "all" ? ` (${KIND_LABEL[kindFilter]})` : ""}
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
