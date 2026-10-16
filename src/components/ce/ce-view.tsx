"use client";

import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, ListChecks, RotateCcw, Search } from "lucide-react";
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
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import {
  CE_MONTH_ABBR,
  CE_MONTH_FULL_ID,
  buildCeAttentionItems,
  buildCeExecutiveSummary,
  buildCeMonthlyTrend,
  buildCeOpenItemsByUltg,
  buildCeProgramRollup,
  buildCeRecentActivity,
  buildCeStreamBreakdown,
  buildCeSubBidangBreakdown,
  buildCeSummary,
  buildCeUltgIdeal,
  buildCeUltgStreamMatrix,
  ceMonthAbbrIndex,
  defaultCeWeekLabel,
  filterCeItemsForPeriod,
  todayISODate,
  type CeAttentionItem,
  type CeOpenItemsUltgGroup,
  type CeProgramRollupEntry,
  type CeUltgIdealEntry,
  type CeUltgStreamRow,
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
  critical: "border-critical/40 bg-critical/20 text-critical",
  poor: "border-destructive/40 bg-destructive/20 text-destructive",
  fair: "border-warning/50 bg-warning/20 text-warning-foreground",
  good: "border-success/40 bg-success/20 text-success",
  "verry good": "border-success/40 bg-success/20 text-success",
};

function KriteriaPill({ value }: { value: string }) {
  if (!value.trim()) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = KRITERIA_CLASS[value.trim().toLowerCase()] ?? "border-border bg-muted/50 text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap", cls)}>
      {value.trim()}
    </span>
  );
}

const STATUS_CLASS: Record<CeProgramRollupEntry["status"], string> = {
  Finish: "border-success/40 bg-success/20 text-success",
  "On Target": "border-primary/40 bg-primary/15 text-primary",
  Lagging: "border-warning/50 bg-warning/20 text-warning-foreground",
};

const ISSUE_CLASS: Record<CeAttentionItem["issue"], string> = {
  "Critical & Belum Selesai": "border-critical/40 bg-critical/20 text-critical",
  Alert: "border-warning/50 bg-warning/20 text-warning-foreground",
  Terlambat: "border-warning/50 bg-warning/20 text-warning-foreground",
};

// Used ONLY for "behind pace vs ideal" in UltgIdealTable below —
// deliberately asymmetric with the on-pace case (plain bold success text,
// no badge), same reasoning as ABO's/4DX's own NotAchievedBadge: giving
// only the exception a bordered, icon-bearing pill is what actually
// catches the eye scanning a per-ULTG table, instead of every row
// carrying the same visual weight.
function NotAchievedBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/60 bg-warning/25 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-warning-foreground">
      <AlertTriangle className="size-3" />
      {children}
    </span>
  );
}

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
      <div className="flex flex-col gap-1 rounded-lg border border-critical/40 bg-critical/10 p-3">
        <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Critical Masih Open</span>
        <span className="text-2xl font-extrabold tabular-nums text-critical">{criticalOpen}</span>
        <span className="text-xs text-muted-foreground">
          {formatPercent(criticalOpenPct)} dari {criticalTotal} temuan Critical
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border border-warning/50 bg-warning/10 p-3">
        <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Backlog Stream Terbesar</span>
        {backlogStream ? (
          <>
            <span className="text-2xl font-extrabold text-foreground">{backlogStream.label}</span>
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
          <AlertTriangle className="size-5 text-warning-foreground" />
          <CardTitle className="text-lg font-extrabold">Perlu Perhatian</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {items.length} item — kondisi Critical belum selesai, ada alert, atau sudah melewati target minggu.
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2.5 font-bold">ULTG / GI</th>
                <th className="px-3 py-2.5 font-bold">Program</th>
                <th className="px-3 py-2.5 font-bold">Masalah</th>
                <th className="px-3 py-2.5 font-bold">Target</th>
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
      <p className="text-sm font-bold tracking-wide text-foreground uppercase">{title}</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-col gap-1 rounded-lg border bg-secondary p-3">
            <span className="text-sm font-bold text-foreground">{entry.label}</span>
            <p className="text-sm text-muted-foreground">
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
      <p className="text-sm font-bold tracking-wide text-foreground uppercase">Breakdown per Stream</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2.5 font-bold">Stream</th>
              <th className="px-3 py-2.5 font-bold">Sub Bidang</th>
              <th className="px-3 py-2.5 font-bold text-right">Total</th>
              <th className="px-3 py-2.5 font-bold text-right">Close</th>
              <th className="px-3 py-2.5 font-bold text-right">Open</th>
              <th className="px-3 py-2.5 font-bold text-right">%</th>
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
      <p className="text-sm font-bold tracking-wide text-foreground uppercase">Target vs Realisasi per Bulan</p>
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
      <p className="text-sm font-bold tracking-wide text-foreground uppercase">
        Ringkasan per ULTG — Aktual vs Pace Ideal ({formatPercent((entries[0]?.idealPercent ?? 0) / 100)} minggu berjalan)
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2.5 font-bold">ULTG</th>
              <th className="px-3 py-2.5 font-bold text-right">Total</th>
              <th className="px-3 py-2.5 font-bold text-right">Close</th>
              <th className="px-3 py-2.5 font-bold text-right">On Target</th>
              <th className="px-3 py-2.5 font-bold text-right">Lagging</th>
              <th className="px-3 py-2.5 font-bold text-right">Aktual</th>
              <th className="px-3 py-2.5 font-bold text-right">Gap vs Ideal</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.ultg} className="border-b last:border-0">
                <td className="px-3 py-2 text-foreground">{entry.ultg}</td>
                <td className="px-3 py-2 text-right tabular-nums">{entry.total}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{entry.close}</td>
                <td className="px-3 py-2 text-right tabular-nums">{entry.onTarget}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {entry.lagging > 0 ? (
                    <NotAchievedBadge>{entry.lagging} lagging</NotAchievedBadge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPercent(entry.actualPercent !== null ? entry.actualPercent / 100 : null)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {entry.gapPts !== null && entry.gapPts < 0 ? (
                    <NotAchievedBadge>{formatPercentGap(entry.gapPts)}</NotAchievedBadge>
                  ) : (
                    <span className="text-success">{formatPercentGap(entry.gapPts)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Detail view behind UltgIdealTable's own per-ULTG summary — that table
// answers "which ULTG is behind," this one answers "behind on which kind
// of equipment." One row per stream, each ULTG's own total/open/close
// shown side by side.
function UltgStreamMatrixTable({ rows }: { rows: CeUltgStreamRow[] }) {
  if (rows.length === 0 || rows[0].byUltg.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada data ULTG untuk breakdown ini.</p>;
  }
  const ultgLabels = rows[0].byUltg.map((c) => c.ultg);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold tracking-wide text-foreground uppercase">Detail Stream × ULTG — Open/Close</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2 font-bold" rowSpan={2}>
                Stream
              </th>
              <th className="border-l px-3 py-2 text-right font-bold" colSpan={2}>
                Total
              </th>
              {ultgLabels.map((ultg) => (
                <th key={ultg} className="border-l px-3 py-2 text-right font-bold" colSpan={2}>
                  {ultg}
                </th>
              ))}
            </tr>
            <tr className="border-b bg-muted/70 text-right text-xs text-muted-foreground uppercase">
              <th className="border-l px-3 py-1.5 font-bold">Open</th>
              <th className="px-3 py-1.5 font-bold">Close</th>
              {ultgLabels.map((ultg) => (
                <Fragment key={ultg}>
                  <th className="border-l px-3 py-1.5 font-bold">Open</th>
                  <th className="px-3 py-1.5 font-bold">Close</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.streamCode} className="border-b last:border-0">
                <td className="px-3 py-2 text-foreground">{row.streamLabel}</td>
                <td className="border-l px-3 py-2 text-right tabular-nums text-warning-foreground">{row.open}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{row.close}</td>
                {row.byUltg.map((cell) => (
                  <Fragment key={cell.ultg}>
                    <td className="border-l px-3 py-2 text-right tabular-nums text-warning-foreground">{cell.open}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{cell.close}</td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A collapsible per-ULTG section, each containing one collapsible dropdown
// per stream — not just the cross-ULTG "Perlu Perhatian" subset (Critical/
// Alert/Terlambat only), and not just open items either (per user
// feedback — a stream dropdown now shows BOTH open and closed items, same
// pair of counts as the page's own Breakdown per Stream table, just
// scoped to one ULTG). Meant as each ULTG's own reminder/checklist: open
// items sort first within each stream (most urgent on top), closed ones
// after, each row's own status visible via an icon.
//
// Streams are independently collapsible ("dropdown" per user's own
// wording) rather than all dumped into one shared scrolling box — the
// earlier version put every stream's rows into a single max-height
// scrollable container with sticky per-stream headers, which read as
// disorganized once a user scrolled past a header boundary (confirmed
// from the user's own screenshot). Each stream is now its own bordered
// block the user opens on demand, closed by default so an ULTG with many
// streams doesn't dump everything on expand.
function streamToggleKey(ultg: string, streamCode: string | null): string {
  return `${ultg}::${streamCode ?? "lainnya"}`;
}

function OpenItemsByUltgSection({ groups }: { groups: CeOpenItemsUltgGroup[] }) {
  const [expandedUltg, setExpandedUltg] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g, i) => [g.ultg, i === 0])),
  );
  const [expandedStream, setExpandedStream] = useState<Record<string, boolean>>({});
  if (groups.length === 0 || groups.every((g) => g.openCount === 0 && g.closeCount === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ListChecks className="size-5 text-warning-foreground" />
          <CardTitle className="text-lg font-extrabold">Daftar Temuan per ULTG</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Dikelompokkan per ULTG, lalu per stream (klik untuk buka/tutup) — tiap stream menampilkan item open (diutamakan,
          paling terlambat di atas) maupun yang sudah close, bahan reminder untuk masing-masing ULTG.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {groups.map((group) => {
          const isUltgOpen = expandedUltg[group.ultg] ?? false;
          return (
            <div key={group.ultg} className="overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setExpandedUltg((prev) => ({ ...prev, [group.ultg]: !prev[group.ultg] }))}
                className="flex w-full items-center justify-between gap-3 bg-muted/50 px-3 py-2.5 text-left hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isUltgOpen ? "rotate-0" : "-rotate-90")} />
                  <span className="font-bold text-foreground">{group.ultg}</span>
                </span>
                <span className="flex items-center gap-2">
                  {group.overdueCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-critical/40 bg-critical/20 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-critical">
                      <AlertTriangle className="size-3" />
                      {group.overdueCount} terlambat
                    </span>
                  ) : null}
                  <span className="rounded-full border border-warning/50 bg-warning/20 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-warning-foreground">
                    {group.openCount} open
                  </span>
                  <span className="rounded-full border border-success/40 bg-success/20 px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-success">
                    {group.closeCount} close
                  </span>
                </span>
              </button>
              {
                // Always rendered (never conditionally skipped) so
                // window.print() — Export PDF's own mechanism, see
                // export-pdf-button.tsx — can show every ULTG's and every
                // stream's full list regardless of what's currently
                // expanded on screen. `hidden`/`block` is CSS-only here;
                // `print:block`/`print:max-h-none` force everything fully
                // open and unclipped specifically when printing, same
                // print-override convention already used elsewhere on
                // this page (print:hidden on the filter toolbar above).
              }
              <div className={cn("flex flex-col gap-1.5 border-t p-1.5 print:block", isUltgOpen ? "flex" : "hidden")}>
                {group.streams.map((stream) => {
                  const key = streamToggleKey(group.ultg, stream.streamCode);
                  const isStreamOpen = expandedStream[key] ?? false;
                  return (
                    <div key={key} className="overflow-hidden rounded-md border">
                      <button
                        type="button"
                        onClick={() => setExpandedStream((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-1.5 text-left hover:bg-muted/60"
                      >
                        <span className="flex items-center gap-1.5">
                          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", isStreamOpen ? "rotate-0" : "-rotate-90")} />
                          <span className="text-xs font-bold tracking-wide text-foreground uppercase">{stream.streamLabel}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-xs">
                          {stream.overdueCount > 0 ? (
                            <span className="font-semibold text-critical">{stream.overdueCount} terlambat</span>
                          ) : null}
                          <span className="font-semibold text-warning-foreground">{stream.openCount} open</span>
                          <span className="font-semibold text-success">{stream.closeCount} close</span>
                        </span>
                      </button>
                      <div
                        className={cn(
                          "max-h-96 overflow-y-auto border-t print:block print:max-h-none print:overflow-visible",
                          isStreamOpen ? "block" : "hidden",
                        )}
                      >
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-card">
                            <tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground uppercase">
                              <th className="px-3 py-2 font-bold">Status</th>
                              <th className="px-3 py-2 font-bold">GI / Bay</th>
                              <th className="px-3 py-2 font-bold">Program</th>
                              <th className="px-3 py-2 font-bold">Kriteria</th>
                              <th className="px-3 py-2 font-bold">Target Minggu</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stream.items.map((item) => (
                              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/10">
                                <td className="px-3 py-2">
                                  {item.done ? (
                                    <CheckCircle2 className="size-4 text-success" />
                                  ) : (
                                    <Circle className="size-4 text-warning-foreground" />
                                  )}
                                </td>
                                <td className="px-3 py-2 text-foreground">
                                  <div className="font-medium">{item.gardu}</div>
                                  <div className="text-xs text-muted-foreground">{item.bay || item.jenisAsset}</div>
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{item.namaProgram}</td>
                                <td className="px-3 py-2">
                                  <KriteriaPill value={item.kriteriaBefore} />
                                </td>
                                <td className="px-3 py-2 text-xs whitespace-nowrap">
                                  {item.targetWeekLabel ?? <span className="text-muted-foreground">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ProgramRollupCard({ entries }: { entries: CeProgramRollupEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-extrabold">Program Aktif — Realisasi 3 Minggu Terakhir</CardTitle>
        <p className="text-xs text-muted-foreground">
          {entries.length} program punya realisasi dalam 3 minggu terakhir.
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-h-72 overflow-y-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2.5 font-bold">Program</th>
                <th className="px-3 py-2.5 font-bold text-right">Target</th>
                <th className="px-3 py-2.5 font-bold text-right">Realisasi</th>
                <th className="px-3 py-2.5 font-bold text-right">Capaian</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold text-right">3 Minggu</th>
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
        <CardTitle className="text-lg font-extrabold">Kegiatan Terealisasi (3 Minggu Terakhir)</CardTitle>
        <p className="text-xs text-muted-foreground">{activity.length} temuan direalisasi dalam 3 minggu terakhir.</p>
      </CardHeader>
      <CardContent>
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {activity.map(({ item, tanggalRealisasi }) => (
            <li key={item.id} className="flex items-start gap-2 rounded-lg border bg-secondary p-2.5 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="flex flex-col">
                <span className="font-semibold text-foreground">{item.namaProgram || item.gardu}</span>
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
          <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2.5 font-bold">Status</th>
            <th className="px-3 py-2.5 font-bold">ULTG / GI / Bay</th>
            <th className="px-3 py-2.5 font-bold">Program</th>
            <th className="px-3 py-2.5 font-bold">Kriteria</th>
            <th className="px-3 py-2.5 font-bold">Target</th>
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
  const openItemsByUltg = useMemo(() => buildCeOpenItemsByUltg(snapshot.items, weekLabel), [snapshot.items, weekLabel]);
  const ultgStreamMatrix = useMemo(() => buildCeUltgStreamMatrix(snapshot.items), [snapshot.items]);
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

        <ExportPdfButton />
        <ExportExcelButton
          filename={`CE-UPT-Palangkaraya-${weekLabel}.xlsx`}
          sheets={[
            {
              name: "Item Periode",
              rows: filteredPeriodItems.map((item) => ({
                Status: item.done ? "CLOSE" : "OPEN",
                ULTG: item.ultg,
                GI: item.gardu,
                Bay: item.bay,
                "Jenis Aset": item.jenisAsset,
                Program: item.namaProgram,
                "Kriteria Before": item.kriteriaBefore,
                "Kriteria After": item.kriteriaAfter,
                "Target Minggu": item.targetWeekLabel ?? "",
                "Realisasi Minggu": item.realisasiWeekLabel ?? "",
                "Status Text": item.status,
              })),
            },
            {
              name: "Ringkasan ULTG",
              rows: ultgIdeal.map((u) => ({
                ULTG: u.ultg,
                Total: u.total,
                Close: u.close,
                Open: u.open,
                "On Target": u.onTarget,
                Lagging: u.lagging,
                "Aktual (%)": u.actualPercent ?? "",
                "Ideal (%)": u.idealPercent,
                "Gap (pts)": u.gapPts ?? "",
              })),
            },
            {
              // Flattened ULTG -> stream -> items (open AND closed) into
              // one row per item — the on-page version groups/collapses
              // this for scanning, but Excel's own sheet is already a
              // flat table by nature, so there's no reason to hide
              // anything here the way the collapsed UI groups do on
              // screen.
              name: "Daftar Temuan per ULTG",
              rows: openItemsByUltg.flatMap((group) =>
                group.streams.flatMap((stream) =>
                  stream.items.map((item) => ({
                    Status: item.done ? "CLOSE" : "OPEN",
                    ULTG: group.ultg,
                    Stream: stream.streamLabel,
                    GI: item.gardu,
                    Bay: item.bay || item.jenisAsset,
                    Program: item.namaProgram,
                    "Kriteria Before": item.kriteriaBefore,
                    "Target Minggu": item.targetWeekLabel ?? "",
                    "Realisasi Minggu": item.realisasiWeekLabel ?? "",
                  })),
                ),
              ),
            },
          ]}
        />

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
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-primary" />
          <div className="p-3">
            <div className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">{summary.total}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Total Temuan</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-success/40 bg-success/10">
          <div className="h-1.5 w-full bg-success" />
          <div className="p-3">
            <div className="text-xl font-bold tabular-nums text-success sm:text-2xl">{summary.close}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Close</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-warning/50 bg-warning/10">
          <div className="h-1.5 w-full bg-warning" />
          <div className="p-3">
            <div className="text-xl font-bold tabular-nums text-warning-foreground sm:text-2xl">{summary.open}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Open</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-info" />
          <div className="p-3">
            <div className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">{formatPercent(summary.percentAchieve)}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">% Achieve</div>
          </div>
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

      <UltgStreamMatrixTable rows={ultgStreamMatrix} />

      <OpenItemsByUltgSection groups={openItemsByUltg} />

      <BreakdownGrid title="Breakdown per Sub Bidang" entries={subBidangBreakdown} />
      <StreamBreakdownTable entries={streamBreakdown} />

      <MonthlyTrendChart data={monthlyTrend} />

      <BreakdownGrid title="Breakdown per Kriteria Before" entries={summary.byKriteriaBefore} />

      <ProgramRollupCard entries={programRollup} />
      <RecentActivityCard activity={recentActivity} />

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-extrabold tracking-tight text-foreground">
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
