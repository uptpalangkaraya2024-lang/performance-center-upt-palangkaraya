"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, RotateCcw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CE_MONTH_ABBR,
  CE_MONTH_FULL_ID,
  buildCeAttentionItems,
  buildCeExecutiveSummary,
  buildCeMonthlyTrend,
  buildCeProgramRollup,
  buildCeRecentActivity,
  buildCeStreamBreakdown,
  buildCeSubBidangBreakdown,
  buildCeSummary,
  buildCeUltgIdeal,
  ceMonthAbbrIndex,
  defaultCeWeekLabel,
  filterCeItemsForPeriod,
  todayISODate,
  type CeAttentionItem,
  type CeProgramRollupEntry,
  type CeUltgIdealEntry,
} from "@/lib/ce-compute";
import { cn } from "@/lib/utils";
import type { CeItem, CeSnapshot } from "@/types";

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function formatPercentGap(v: number | null): string {
  if (v === null) return "—";
  const rounded = Math.round(v * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

const KRITERIA_CLASS: Record<string, string> = {
  critical: "border-critical/40 bg-critical/10 text-critical",
  poor: "border-destructive/40 bg-destructive/10 text-destructive",
  fair: "border-warning/40 bg-warning/15 text-warning-foreground",
  good: "border-success/40 bg-success/10 text-success",
  "verry good": "border-success/40 bg-success/10 text-success",
};

function KriteriaPill({ value }: { value: string }) {
  if (!value.trim()) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = KRITERIA_CLASS[value.trim().toLowerCase()] ?? "border-border bg-muted/40 text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", cls)}>
      {value.trim()}
    </span>
  );
}

const STATUS_CLASS: Record<CeProgramRollupEntry["status"], string> = {
  Finish: "border-success/40 bg-success/10 text-success",
  "On Target": "border-primary/40 bg-primary/10 text-primary",
  Lagging: "border-warning/40 bg-warning/15 text-warning-foreground",
};

const ISSUE_CLASS: Record<CeAttentionItem["issue"], string> = {
  "Critical & Belum Selesai": "border-critical/40 bg-critical/10 text-critical",
  Alert: "border-warning/40 bg-warning/15 text-warning-foreground",
  Terlambat: "border-warning/40 bg-warning/15 text-warning-foreground",
};

function ExecutiveSummaryCards({
  criticalOpen,
  criticalTotal,
  criticalOpenPct,
  backlogStream,
}: {
  criticalOpen: number;
  criticalTotal: number;
  criticalOpenPct: number | null;
  backlogStream: { label: string; open: number; criticalOpen: number } | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1 rounded-lg border border-critical/30 bg-critical/5 p-3">
        <span className="text-xs font-medium text-muted-foreground">Critical Masih Open</span>
        <span className="text-xl font-semibold tabular-nums text-critical">{criticalOpen}</span>
        <span className="text-xs text-muted-foreground">
          {formatPercent(criticalOpenPct)} dari {criticalTotal} temuan Critical
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <span className="text-xs font-medium text-muted-foreground">Backlog Stream Terbesar</span>
        {backlogStream ? (
          <>
            <span className="text-xl font-semibold text-foreground">{backlogStream.label}</span>
            <span className="text-xs text-muted-foreground">
              {backlogStream.open} open · {backlogStream.criticalOpen} critical aktif
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Tidak ada backlog open.</span>
        )}
      </div>
    </div>
  );
}

function AttentionTable({ items }: { items: CeAttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning-foreground" />
          <CardTitle className="text-base">Perlu Perhatian</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          {items.length} item — kondisi Critical belum selesai, ada alert, atau sudah melewati target minggu.
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">ULTG / GI</th>
                <th className="px-3 py-2 font-medium">Program</th>
                <th className="px-3 py-2 font-medium">Masalah</th>
                <th className="px-3 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a, i) => (
                <tr key={`${a.item.id}-${a.issue}-${i}`} className="border-b last:border-0 hover:bg-muted/10">
                  <td className="px-3 py-2 text-foreground">
                    <div className="font-medium">{a.item.gardu}</div>
                    <div className="text-xs text-muted-foreground">{a.item.ultg}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{a.item.namaProgram}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", ISSUE_CLASS[a.issue])}>
                      {a.issue}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{a.item.targetWeekLabel ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownGrid({ title, entries }: { title: string; entries: { label: string; total: number; close: number; open: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-1 rounded-lg border p-3">
            <span className="text-sm font-medium text-foreground">{entry.label}</span>
            <p className="text-xs text-muted-foreground">
              Close:{entry.close} / Open:{entry.open} · Total:{entry.total}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreamBreakdownTable({ entries }: { entries: ReturnType<typeof buildCeStreamBreakdown> }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">Breakdown per Stream</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Stream</th>
              <th className="px-3 py-2 font-medium">Sub Bidang</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-right">Close</th>
              <th className="px-3 py-2 font-medium text-right">Open</th>
              <th className="px-3 py-2 font-medium text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.code} className="border-b last:border-0">
                <td className="px-3 py-2 text-foreground">{entry.label}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{entry.subBidang}</td>
                <td className="px-3 py-2 text-right tabular-nums">{entry.total}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{entry.close}</td>
                <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">{entry.open}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {entry.total > 0 ? formatPercent(entry.close / entry.total) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyTrendChart({ data }: { data: ReturnType<typeof buildCeMonthlyTrend> }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">Target vs Realisasi per Bulan</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="target" name="Target" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="realisasi" name="Realisasi" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UltgIdealTable({ entries }: { entries: CeUltgIdealEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">
        Ringkasan per ULTG — Aktual vs Pace Ideal ({formatPercent((entries[0]?.idealPercent ?? 0) / 100)} minggu berjalan)
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">ULTG</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-right">Close</th>
              <th className="px-3 py-2 font-medium text-right">On Target</th>
              <th className="px-3 py-2 font-medium text-right">Lagging</th>
              <th className="px-3 py-2 font-medium text-right">Aktual</th>
              <th className="px-3 py-2 font-medium text-right">Gap vs Ideal</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.ultg} className="border-b last:border-0">
                <td className="px-3 py-2 text-foreground">{entry.ultg}</td>
                <td className="px-3 py-2 text-right tabular-nums">{entry.total}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{entry.close}</td>
                <td className="px-3 py-2 text-right tabular-nums">{entry.onTarget}</td>
                <td className="px-3 py-2 text-right tabular-nums text-critical">{entry.lagging}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPercent(entry.actualPercent !== null ? entry.actualPercent / 100 : null)}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    entry.gapPts !== null && entry.gapPts < 0 ? "text-warning-foreground" : "text-success",
                  )}
                >
                  {formatPercentGap(entry.gapPts)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProgramRollupCard({ entries }: { entries: CeProgramRollupEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Program Aktif — Realisasi 3 Minggu Terakhir</CardTitle>
        <p className="text-xs text-muted-foreground">
          {entries.length} program punya realisasi dalam 3 minggu terakhir.
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Program</th>
                <th className="px-3 py-2 font-medium text-right">Target</th>
                <th className="px-3 py-2 font-medium text-right">Realisasi</th>
                <th className="px-3 py-2 font-medium text-right">Capaian</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">3 Minggu</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.program} className="border-b last:border-0">
                  <td className="px-3 py-2 text-foreground">{entry.program}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{entry.totalTarget}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{entry.realisasiKini}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(entry.percentCapaian)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_CLASS[entry.status])}>
                      {entry.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{entry.realisasi3Minggu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({ activity }: { activity: ReturnType<typeof buildCeRecentActivity> }) {
  if (activity.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kegiatan Terealisasi (3 Minggu Terakhir)</CardTitle>
        <p className="text-xs text-muted-foreground">{activity.length} temuan direalisasi dalam 3 minggu terakhir.</p>
      </CardHeader>
      <CardContent>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {activity.map(({ item, tanggalRealisasi }) => (
            <li key={item.id} className="flex items-start gap-2 rounded-lg border p-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{item.namaProgram || item.gardu}</span>
                <span className="text-xs text-muted-foreground">
                  {item.gardu} · {item.ultg} · {tanggalRealisasi}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ItemTable({ items }: { items: CeItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Belum ada item yang jatuh tempo pada periode ini.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">ULTG / GI / Bay</th>
            <th className="px-3 py-2 font-medium">Program</th>
            <th className="px-3 py-2 font-medium">Kriteria</th>
            <th className="px-3 py-2 font-medium">Target</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="px-3 py-2">
                {item.done ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
              </td>
              <td className="px-3 py-2 text-foreground">
                <div className="font-medium">{item.gardu}</div>
                <div className="text-xs text-muted-foreground">
                  {item.ultg} · {item.bay || item.jenisAsset}
                </div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{item.namaProgram}</td>
              <td className="px-3 py-2">
                <KriteriaPill value={item.kriteriaBefore} />
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{item.targetWeekLabel ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CeView({ snapshot, emptyMessage }: { snapshot: CeSnapshot; emptyMessage: string }) {
  const currentWeekLabel = useMemo(() => defaultCeWeekLabel(), []);
  const todayISO = useMemo(() => todayISODate(), []);
  const [weekLabel, setWeekLabel] = useState(currentWeekLabel);
  const [search, setSearch] = useState("");
  const [monthAbbr, weekOfMonth] = weekLabel.split("-M");

  const summary = useMemo(() => buildCeSummary(snapshot.items), [snapshot.items]);
  const attention = useMemo(() => buildCeAttentionItems(snapshot.items, weekLabel), [snapshot.items, weekLabel]);
  const periodItems = useMemo(() => filterCeItemsForPeriod(snapshot.items, weekLabel), [snapshot.items, weekLabel]);
  const streamBreakdown = useMemo(() => buildCeStreamBreakdown(snapshot.items), [snapshot.items]);
  const subBidangBreakdown = useMemo(() => buildCeSubBidangBreakdown(streamBreakdown), [streamBreakdown]);
  const monthlyTrend = useMemo(() => buildCeMonthlyTrend(snapshot.items), [snapshot.items]);
  const ultgIdeal = useMemo(() => buildCeUltgIdeal(snapshot.items, weekLabel), [snapshot.items, weekLabel]);
  const programRollup = useMemo(() => buildCeProgramRollup(snapshot.items, todayISO), [snapshot.items, todayISO]);
  const recentActivity = useMemo(() => buildCeRecentActivity(snapshot.items, todayISO), [snapshot.items, todayISO]);
  const executiveSummary = useMemo(
    () => buildCeExecutiveSummary(snapshot.items, streamBreakdown),
    [snapshot.items, streamBreakdown],
  );

  const filteredPeriodItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return periodItems;
    return periodItems.filter(
      (item) =>
        item.gardu.toLowerCase().includes(q) ||
        item.namaProgram.toLowerCase().includes(q) ||
        item.ultg.toLowerCase().includes(q) ||
        item.jenisAsset.toLowerCase().includes(q),
    );
  }, [periodItems, search]);

  if (snapshot.items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select
          value={monthAbbr}
          onValueChange={(v) => {
            if (!v) return;
            setWeekLabel(`${v}-M1`);
          }}
        >
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Bulan">{CE_MONTH_FULL_ID[ceMonthAbbrIndex(monthAbbr)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CE_MONTH_ABBR.map((m) => (
              <SelectItem key={m} value={m}>
                {CE_MONTH_FULL_ID[ceMonthAbbrIndex(m)]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={weekOfMonth} onValueChange={(v) => v && setWeekLabel(`${monthAbbr}-M${v}`)}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Minggu ke-">{`Minggu ke-${weekOfMonth}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {["1", "2", "3", "4"].map((w) => (
              <SelectItem key={w} value={w}>
                Minggu ke-{w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {weekLabel !== currentWeekLabel ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setWeekLabel(currentWeekLabel)}>
            <RotateCcw className="size-3.5" />
            Kembali ke Periode Ini
          </Button>
        ) : null}

        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari GI/program/aset..."
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-lg font-semibold tabular-nums text-foreground">{summary.total}</div>
          <div className="text-xs text-muted-foreground">Total Temuan</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-lg font-semibold tabular-nums text-foreground">{summary.close}</div>
          <div className="text-xs text-muted-foreground">Close</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-lg font-semibold tabular-nums text-foreground">{summary.open}</div>
          <div className="text-xs text-muted-foreground">Open</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-lg font-semibold tabular-nums text-foreground">{formatPercent(summary.percentAchieve)}</div>
          <div className="text-xs text-muted-foreground">% Achieve</div>
        </div>
      </div>

      <ExecutiveSummaryCards
        criticalOpen={executiveSummary.criticalOpen}
        criticalTotal={executiveSummary.criticalTotal}
        criticalOpenPct={executiveSummary.criticalOpenPct}
        backlogStream={executiveSummary.backlogStream}
      />

      <AttentionTable items={attention} />

      <UltgIdealTable entries={ultgIdeal} />

      <BreakdownGrid title="Breakdown per Sub Bidang" entries={subBidangBreakdown} />
      <StreamBreakdownTable entries={streamBreakdown} />

      <MonthlyTrendChart data={monthlyTrend} />

      <BreakdownGrid title="Breakdown per Kriteria Before" entries={summary.byKriteriaBefore} />

      <ProgramRollupCard entries={programRollup} />
      <RecentActivityCard activity={recentActivity} />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Item Periode {CE_MONTH_FULL_ID[ceMonthAbbrIndex(monthAbbr)]}-M{weekOfMonth}
        </h3>
        <p className="text-xs text-muted-foreground">
          Termasuk item dari periode sebelumnya yang belum selesai (terlambat).
        </p>
        <ItemTable items={filteredPeriodItems} />
      </div>
    </div>
  );
}
