"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, Copy, MessageSquareText, Printer, RotateCcw } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceLine,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  MONTH_ABBR_ID,
  MONTH_FULL_ID,
  buildFourDxAchievementSummaries,
  buildFourDxInsightRecap,
  buildFourDxOutcomeChart,
  buildFourDxOutcomeStatuses,
  buildFourDxWigs,
  extractWigOutcomeTarget,
  formatFourDxWaRecap,
  monthAbbrIndex,
  resolvePeriodRange,
  type FourDxAchievementSummary,
  type FourDxOutcomeChartPoint,
  type FourDxOutcomeStatus,
} from "@/lib/four-dx-compute";
import { cn } from "@/lib/utils";
import type { FourDxLm, FourDxOutcomeSnapshot, FourDxSnapshot, FourDxWig } from "@/types";

// One accent color per WIG — same sticky-banner pattern as AHI Bay Line
// (src/components/ahi/bay-line-report.tsx) and Gangguan.
const WIG_COLORS = ["var(--chart-1)", "var(--brand)", "var(--chart-4)", "var(--chart-3)"];

function wigAnchorId(wigNumber: number): string {
  return `wig-${wigNumber}`;
}

function lmAnchorId(lmCode: string): string {
  return `lm-${lmCode.replace(".", "-")}`;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function StatusPill({ status }: { status: FourDxLm["status"] }) {
  const cls =
    status === "tercapai"
      ? "border-success/40 bg-success/10 text-success"
      : "border-warning/40 bg-warning/15 text-warning-foreground";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", cls)}>
      {status === "tercapai" ? "Tercapai" : "Belum"}
    </span>
  );
}

function ResumeTable({ wigs }: { wigs: FourDxWig[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:break-inside-avoid">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">WIG / Lead Measure</th>
            <th className="px-3 py-2 font-medium">Target Mingguan</th>
            <th className="px-3 py-2 font-medium">Realisasi Mingguan</th>
            <th className="px-3 py-2 font-medium">%</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {wigs.map((wig) => (
            <Fragment key={wig.number}>
              <tr className="border-b bg-muted/20">
                <td colSpan={5} className="px-3 py-1.5 text-xs font-bold tracking-tight text-foreground">
                  WIG {wig.number}
                </td>
              </tr>
              {wig.lms.map((lm) => (
                <tr
                  key={lm.code}
                  onClick={() => jumpTo(lmAnchorId(lm.code))}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/10 print:cursor-auto"
                >
                  <td className="px-3 py-2 pl-6 text-foreground">
                    <span className="font-medium">LM {lm.code}</span>{" "}
                    <span className="text-muted-foreground">{lm.description}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{lm.targetMingguan}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{lm.realisasiMingguan}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatPercent(lm.percentRealisasiMingguan)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={lm.status} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WigBanner({ wig }: { wig: FourDxWig }) {
  const accent = WIG_COLORS[(wig.number - 1) % WIG_COLORS.length];
  return (
    <div
      id={wigAnchorId(wig.number)}
      className="sticky top-0 z-20 -mx-4 -mb-2 scroll-mt-4 border-y bg-card px-4 py-2 print:static print:border-0 print:bg-transparent print:px-0 print:py-1"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full print:hidden" style={{ backgroundColor: accent }} />
        <h3 className="text-base font-bold tracking-tight text-foreground">
          WIG {wig.number}. {wig.title.replace(/^WIG\s*\d+\.\s*/i, "")}
        </h3>
      </div>
    </div>
  );
}

function LmCard({ lm }: { lm: FourDxLm }) {
  return (
    <Card id={lmAnchorId(lm.code)} className="scroll-mt-16 print:break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">LM {lm.code}</CardTitle>
          <StatusPill status={lm.status} />
        </div>
        <p className="text-xs text-muted-foreground">{lm.description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Target &amp; Realisasi UPT
            <span className="ml-1 font-normal text-muted-foreground">
              — menentukan status tercapai/belum, walau breakdown di bawah masih ada yang kurang
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">{lm.targetBulanan}</div>
              <div className="text-xs text-muted-foreground">Target Bulanan</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">{lm.targetMingguan}</div>
              <div className="text-xs text-muted-foreground">Target Mingguan</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">{lm.realisasiMingguan}</div>
              <div className="text-xs text-muted-foreground">Realisasi Mingguan</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">
                {formatPercent(lm.percentRealisasiMingguan)}
              </div>
              <div className="text-xs text-muted-foreground">% Realisasi Mingguan</div>
            </div>
          </div>
        </div>

        {lm.assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">Tidak ada aset yang dijadwalkan pada periode ini.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-foreground">Breakdown per ULTG / Ruas</p>
            <ul className="flex flex-col gap-1">
              {lm.assets.map((asset) => (
                <li key={asset.asset} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  {asset.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("flex-1", asset.done ? "text-foreground" : "text-muted-foreground")}>
                    {asset.asset}
                  </span>
                  {asset.targetThisWeek > 1 ? (
                    <span className="text-xs text-muted-foreground">
                      R:{asset.realizedCount}/T:{asset.targetThisWeek}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const OUTCOME_STATUS_CLASS: Record<FourDxOutcomeStatus["status"], string> = {
  aman: "border-success/40 bg-success/10 text-success",
  "lewat-target": "border-critical/40 bg-critical/10 text-critical",
  unknown: "border-border bg-muted/40 text-muted-foreground",
};

const OUTCOME_STATUS_LABEL: Record<FourDxOutcomeStatus["status"], string> = {
  aman: "Aman",
  "lewat-target": "Lewat Target",
  unknown: "Belum Ada Data",
};

type OutcomeChartMode = "bulanan" | "kumulatif" | "keduanya";

/** Per-WIG outcome correlation chart — Real.Bulanan (bar) and/or
 *  Real.Kumulatif (line), plus Target 4DX (flat reference line), same
 *  series shape as the reference PPT's own per-WIG slide, sourced from
 *  actual disturbance/incident data rather than Lead Measure completion.
 *  `mode` picks which series are drawn — showing both at once (the
 *  default) works, but a count-scale bar and a running-total line can
 *  crowd each other on a small chart, so either can be viewed alone. */
function WigOutcomeChart({ chart, unit, mode }: { chart: FourDxOutcomeChartPoint[]; unit: string; mode: OutcomeChartMode }) {
  const target = chart.find((p) => p.target !== null)?.target ?? null;
  const showBulanan = mode === "bulanan" || mode === "keduanya";
  const showKumulatif = mode === "kumulatif" || mode === "keduanya";
  return (
    <ResponsiveContainer width="100%" height={180}>
      <ComposedChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={unit === "Jam"} />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {showBulanan ? (
          <Bar dataKey="bulanan" name="Real.Bulanan" fill="var(--chart-2)" radius={[3, 3, 0, 0]}>
            <LabelList dataKey="bulanan" position="top" fontSize={10} fill="var(--muted-foreground)" />
          </Bar>
        ) : null}
        {showKumulatif ? (
          <Line dataKey="kumulatif" name="Real.Kumulatif" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }}>
            <LabelList dataKey="kumulatif" position="top" fontSize={10} fill="var(--chart-1)" />
          </Line>
        ) : null}
        {target !== null ? (
          <ReferenceLine y={target} stroke="var(--critical)" strokeDasharray="4 4" label={{ value: "Target 4DX", fontSize: 10, fill: "var(--critical)", position: "insideTopRight" }} />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** "Korelasi Antar WIG" resume at the very top of the page — each WIG's
 *  target-vs-realisasi status AND its own Real.Bulanan/Kumulatif/Target
 *  chart together, so a case like WIG 2 already sitting at 10 against a
 *  year-end target of 9 is visible (with its trend) before scrolling any
 *  further — per the user's request to surface this as a resume up top
 *  instead of only inside each WIG's own section further down the page. */
function OutcomeCorrelationBanner({
  statuses,
  charts,
}: {
  statuses: FourDxOutcomeStatus[];
  charts: Record<number, FourDxOutcomeChartPoint[]>;
}) {
  // Chart data is always the full 12 months (Jan-Des) — this range filter
  // only slices which months are DISPLAYED, it never recomputes Kumulatif
  // from the truncated range, since "Kumulatif" is meaningless if it
  // doesn't start counting from January.
  const [fromMonth, setFromMonth] = useState(0);
  const [toMonth, setToMonth] = useState(11);
  const [mode, setMode] = useState<OutcomeChartMode>("keduanya");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Korelasi Antar WIG — Target vs Realisasi Aktual</CardTitle>
        <p className="text-xs text-muted-foreground">
          Realisasi kumulatif tahun berjalan dari data gangguan aktual, dibandingkan target tahunan tiap WIG.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <div className="flex items-center rounded-full border p-0.5">
            {([
              { value: "bulanan" as const, label: "Bulanan" },
              { value: "kumulatif" as const, label: "Kumulatif" },
              { value: "keduanya" as const, label: "Keduanya" },
            ]).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span>Tampilkan bulan:</span>
          <Select
            value={String(fromMonth)}
            onValueChange={(v) => {
              if (!v) return;
              const idx = Number(v);
              setFromMonth(idx);
              if (idx > toMonth) setToMonth(idx);
            }}
          >
            <SelectTrigger size="sm" className="w-[110px]">
              <SelectValue placeholder="Dari">{MONTH_FULL_ID[fromMonth]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTH_FULL_ID.map((m, idx) => (
                <SelectItem key={m} value={String(idx)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>sampai</span>
          <Select
            value={String(toMonth)}
            onValueChange={(v) => {
              if (!v) return;
              const idx = Number(v);
              setToMonth(idx);
              if (idx < fromMonth) setFromMonth(idx);
            }}
          >
            <SelectTrigger size="sm" className="w-[110px]">
              <SelectValue placeholder="Sampai">{MONTH_FULL_ID[toMonth]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTH_FULL_ID.map((m, idx) => (
                <SelectItem key={m} value={String(idx)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fromMonth !== 0 || toMonth !== 11 ? (
            <button
              type="button"
              onClick={() => {
                setFromMonth(0);
                setToMonth(11);
              }}
              className="text-primary hover:underline"
            >
              Reset ke Jan–Des
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {statuses.map((s) => {
            const accent = WIG_COLORS[(s.wigNumber - 1) % WIG_COLORS.length];
            const unit = s.wigNumber === 3 ? "Jam" : "kali";
            const chart = (charts[s.wigNumber] ?? []).slice(fromMonth, toMonth + 1);
            return (
              <div key={s.wigNumber} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderLeft: `4px solid ${accent}` }}>
                <button
                  type="button"
                  onClick={() => jumpTo(wigAnchorId(s.wigNumber))}
                  className="flex flex-col gap-1.5 text-left"
                >
                  <span className="text-xs font-semibold tracking-tight text-foreground">WIG {s.wigNumber} — {s.label}</span>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {s.realisasiKumulatif ?? "—"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ target {s.target ?? "—"} {unit}</span>
                  </span>
                  <span className={cn("inline-flex w-fit rounded-full border px-2 py-0.5 text-xs font-medium", OUTCOME_STATUS_CLASS[s.status])}>
                    {OUTCOME_STATUS_LABEL[s.status]}
                  </span>
                </button>
                {chart.length > 0 ? <WigOutcomeChart chart={chart} unit={unit} mode={mode} /> : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function formatPercentSigned(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

/** Per-WIG achievement summary. "Periode dipilih" follows the month/week
 *  filter above (recomputed from the already-filtered `wigs`, same numbers
 *  the Resume table below shows) — "rata-rata tahun ini" is deliberately
 *  NOT filter-dependent: it's the year-to-date average across every
 *  already-elapsed week, which by definition can't be an average "as of" a
 *  future week the filter might select, so it stays labeled and computed
 *  separately (see buildFourDxAchievementSummaries). */
function AchievementSummaryCards({
  wigs,
  summaries,
  wigLabels,
}: {
  wigs: FourDxWig[];
  summaries: FourDxAchievementSummary[];
  wigLabels: Record<number, string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">Ringkasan Pencapaian</h3>
      <p className="text-xs text-muted-foreground">
        &quot;Periode dipilih&quot; mengikuti filter bulan/minggu di atas. &quot;Rata-rata tahun ini&quot; selalu dihitung
        dari seluruh minggu yang sudah berjalan tahun ini, terlepas dari filter.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {wigs.map((wig) => {
          const summary = summaries.find((s) => s.wigNumber === wig.number);
          const evaluable = wig.lms.filter((lm) => lm.targetMingguan > 0);
          const tercapai = evaluable.filter((lm) => lm.status === "tercapai").length;
          return (
            <div key={wig.number} className="flex flex-col gap-1.5 rounded-lg border p-3">
              <span className="text-xs font-semibold tracking-tight text-foreground">WIG {wig.number} — {wigLabels[wig.number]}</span>
              <span className="text-sm text-muted-foreground">
                Periode dipilih: <span className="font-medium text-foreground">{evaluable.length > 0 ? `${tercapai}/${evaluable.length}` : "—"}</span> LM tercapai
              </span>
              <span className="text-sm text-muted-foreground">
                Rata-rata tahun ini: <span className="font-medium text-foreground">{formatPercentSigned(summary?.ytdPercent ?? null)}</span>
              </span>
              <div className="flex items-end gap-0.5" title="Tren 8 minggu terakhir">
                {(summary?.recentWeeks ?? []).map((w, i) => (
                  <div
                    key={`${w.label}-${i}`}
                    className="w-2 rounded-t bg-primary/70"
                    style={{ height: `${Math.max(4, (w.percent ?? 0) * 24)}px` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Slide-in panel from the side (not a card sitting in the main page flow) —
// keeps the recap available on demand without pushing down/competing with
// the Resume table and per-WIG sections for vertical space on the main page.
function WaRecapSheet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <MessageSquareText className="size-3.5" />
            Rekap Format WA
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Rekap Format WA</SheetTitle>
          <SheetDescription>
            Siap ditempel ke WhatsApp — cek dulu kesesuaiannya dengan spreadsheet sebelum dikirim.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-hidden px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // clipboard permission denied — the text is still selectable below
              }
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Tersalin" : "Copy"}
          </Button>
          <pre className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
            {text}
          </pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function FourDxView({ snapshot, outcome }: { snapshot: FourDxSnapshot; outcome: FourDxOutcomeSnapshot }) {
  // Month/week options come from DATASET's own boundaries (periodBoundaries)
  // rather than TARGET WIG's columns — a month can legitimately have 5 weeks
  // (e.g. a 31-day month), and which weeks exist varies per month, so this
  // can't be a fixed 1-4 list.
  const monthOptions = useMemo(() => {
    const present = new Set<string>();
    for (const b of snapshot.periodBoundaries) present.add(b.monthAbbr);
    return MONTH_ABBR_ID.filter((m) => present.has(m));
  }, [snapshot.periodBoundaries]);

  const currentMonthAbbr = snapshot.currentPeriodLabel.split("-M")[0];
  const currentWeekOfMonth = Number(/-M(\d+)$/.exec(snapshot.currentPeriodLabel)?.[1] ?? "1");
  const [monthAbbr, setMonthAbbr] = useState(currentMonthAbbr);
  const [weekOfMonth, setWeekOfMonth] = useState(currentWeekOfMonth);

  const weekOptions = useMemo(() => {
    return snapshot.periodBoundaries
      .filter((b) => b.monthAbbr === monthAbbr)
      .map((b) => b.weekOfMonth)
      .sort((a, b) => a - b);
  }, [snapshot.periodBoundaries, monthAbbr]);

  const period = useMemo(
    () => resolvePeriodRange(`${monthAbbr}-M${weekOfMonth}`, snapshot.periodBoundaries, snapshot.currentYear),
    [monthAbbr, weekOfMonth, snapshot.periodBoundaries, snapshot.currentYear],
  );

  const wigs = useMemo(
    () => buildFourDxWigs(snapshot.wigs, period, snapshot.realizations, snapshot.monitoring),
    [snapshot.wigs, snapshot.realizations, snapshot.monitoring, period],
  );

  const waRecap = useMemo(
    () => formatFourDxWaRecap(period, snapshot.currentYear, wigs),
    [period, snapshot.currentYear, wigs],
  );

  // Achievement across every already-elapsed week this year — independent
  // of the month/week filter above, which only ever shows one selected
  // week's numbers.
  const achievementSummaries = useMemo(
    () =>
      buildFourDxAchievementSummaries(
        snapshot.wigs,
        snapshot.periodBoundaries,
        snapshot.realizations,
        snapshot.monitoring,
        snapshot.currentPeriodLabel,
        snapshot.currentYear,
      ),
    [snapshot.wigs, snapshot.periodBoundaries, snapshot.realizations, snapshot.monitoring, snapshot.currentPeriodLabel, snapshot.currentYear],
  );

  const wigLabels = useMemo(() => {
    const map: Record<number, string> = {};
    for (const wig of snapshot.wigs) map[wig.number] = wig.title.replace(/^WIG\s*\d+\.\s*/i, "");
    return map;
  }, [snapshot.wigs]);

  const wigOutcomeTargets = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const wig of snapshot.wigs) map[wig.number] = extractWigOutcomeTarget(wig.title);
    return map;
  }, [snapshot.wigs]);

  const outcomeCharts = useMemo(() => {
    const map: Record<number, FourDxOutcomeChartPoint[]> = {};
    if (!outcome.error) {
      map[1] = buildFourDxOutcomeChart(outcome.trafo, wigOutcomeTargets[1] ?? null);
      map[2] = buildFourDxOutcomeChart(outcome.transmisi, wigOutcomeTargets[2] ?? null);
      map[3] = buildFourDxOutcomeChart(outcome.ert, wigOutcomeTargets[3] ?? null);
      map[4] = buildFourDxOutcomeChart(outcome.accident, wigOutcomeTargets[4] ?? null);
    }
    return map;
  }, [outcome, wigOutcomeTargets]);

  const outcomeStatuses = useMemo(() => {
    if (outcome.error) return [];
    return buildFourDxOutcomeStatuses(
      snapshot.wigs.map((wig) => ({
        number: wig.number,
        label: wigLabels[wig.number] ?? "",
        chart: outcomeCharts[wig.number] ?? [],
        target: wigOutcomeTargets[wig.number] ?? null,
      })),
    );
  }, [outcome.error, snapshot.wigs, wigLabels, outcomeCharts, wigOutcomeTargets]);

  const insightRecap = useMemo(
    () => buildFourDxInsightRecap(snapshot.currentPeriodLabel, outcomeStatuses, achievementSummaries),
    [snapshot.currentPeriodLabel, outcomeStatuses, achievementSummaries],
  );

  if (snapshot.wigs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Data 4DX belum tersedia — lihat halaman Data & Sync untuk detail.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {outcomeStatuses.length > 0 ? <OutcomeCorrelationBanner statuses={outcomeStatuses} charts={outcomeCharts} /> : null}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select
          value={monthAbbr}
          onValueChange={(v) => {
            if (!v) return;
            setMonthAbbr(v);
            // Week count varies per month (a 31-day month can have a 5th
            // week) — clamp to that month's first available week rather
            // than keep a week number that might not exist there.
            const firstWeek = snapshot.periodBoundaries.find((b) => b.monthAbbr === v)?.weekOfMonth ?? 1;
            setWeekOfMonth(firstWeek);
          }}
        >
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Bulan">{MONTH_FULL_ID[monthAbbrIndex(monthAbbr)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {MONTH_FULL_ID[monthAbbrIndex(m)]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(weekOfMonth)} onValueChange={(v) => v && setWeekOfMonth(Number(v))}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Minggu ke-">{`Minggu ke-${weekOfMonth}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {weekOptions.map((w) => (
              <SelectItem key={w} value={String(w)}>
                Minggu ke-{w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {monthAbbr !== currentMonthAbbr || weekOfMonth !== currentWeekOfMonth ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setMonthAbbr(currentMonthAbbr);
              setWeekOfMonth(currentWeekOfMonth);
            }}
          >
            <RotateCcw className="size-3.5" />
            Kembali ke Periode Ini
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <WaRecapSheet text={`${waRecap}\n\n${insightRecap}`} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Cetak / Simpan PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 print:border-0 print:bg-transparent print:p-0">
        <p className="text-sm font-semibold text-foreground">
          Periode {MONTH_FULL_ID[monthAbbrIndex(monthAbbr)]}-M{weekOfMonth}
        </p>
        <p className="text-xs text-muted-foreground">
          {period.weekStartISO} s.d. {period.weekEndISO}
        </p>
      </div>

      <AchievementSummaryCards wigs={wigs} summaries={achievementSummaries} wigLabels={wigLabels} />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Resume Semua Lead Measure</h3>
        <ResumeTable wigs={wigs} />
      </div>

      {wigs.map((wig) => (
        <div key={wig.number} className="flex flex-col gap-2">
          <WigBanner wig={wig} />
          <div className="flex flex-col gap-3">
            {wig.lms.map((lm) => (
              <LmCard key={lm.code} lm={lm} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
