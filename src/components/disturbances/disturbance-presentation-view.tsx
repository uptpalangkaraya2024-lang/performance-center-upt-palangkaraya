"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Printer, RotateCcw, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MONTH_ID,
  buildCombinedBayBreakdown,
  buildCombinedCalendarDays,
  buildCombinedUltgBreakdown,
  buildCumulativeForYear,
  buildMonthlyBreakdown,
  mergeCauseSeries,
  summarizeCombinedCalendar,
  type CombinedBayEntry,
  type CombinedCalendarDay,
} from "@/lib/disturbance-presentation-compute";
import type { DisturbanceCategoryResult } from "@/types";

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

// One accent per category, reused everywhere (stat cards, donut, stacked
// bar, badges) so the same category always reads the same color across
// every slide — same "one accent = one thing" principle the rest of the
// dashboard's chart palette already follows (var(--chart-N) tokens).
const CATEGORY_COLOR: Record<string, string> = {
  Transmisi: "var(--chart-1)",
  "Trafo HV": "var(--chart-4)",
  "Trafo LV": "var(--chart-3)",
};
const KIND_COLOR: Record<string, string> = {
  Trip: "var(--critical)",
  "AR Sukses": "var(--success)",
  "Tidak Trip": "var(--muted-foreground)",
};

function todayInJakarta(): { year: number; monthIndex0: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-");
  return { year: Number(parts[0]), monthIndex0: Number(parts[1]) - 1 };
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

/** Injects `@page { size: landscape; }` only while this view is mounted —
 *  a plain global CSS @page rule would apply everywhere it's loaded,
 *  including the already-working 4DX print flow this pattern borrows
 *  from, so it's added/removed here instead of in globals.css. */
function useLandscapePrint() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@page { size: landscape; margin: 12mm; }";
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

function StatTile({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <div className={cn("text-2xl font-semibold tabular-nums", className ?? "text-foreground")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function CategoryBadge({ label }: { label: string }) {
  const color = CATEGORY_COLOR[label] ?? "var(--muted-foreground)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ChartTooltip({ contentStyle }: { contentStyle?: React.CSSProperties } = {}) {
  return (
    <Tooltip
      contentStyle={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        fontSize: 12,
        ...contentStyle,
      }}
    />
  );
}

function CombinedCalendarGrid({ days, monthIndex0, year }: { days: CombinedCalendarDay[]; monthIndex0: number; year: number }) {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay(); // 0=Sun
  const leadingBlanks = (firstWeekday + 6) % 7; // shift to Monday-first

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {DAY_LABELS.map((d) => (
          <div key={d} className="pb-1 text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((d) => (
          <div
            key={d.date}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border p-1",
              d.total > 0 ? "border-critical/40 bg-critical/10" : "border-success/30 bg-success/5",
            )}
          >
            <span className={cn("text-sm font-semibold tabular-nums", d.total > 0 ? "text-critical" : "text-foreground")}>
              {d.day}
            </span>
            {d.byCategory.map((c) => (
              <span
                key={c.label}
                className="rounded px-1 text-[9px] leading-tight font-medium whitespace-nowrap"
                style={{ backgroundColor: `color-mix(in srgb, ${CATEGORY_COLOR[c.label]} 18%, transparent)`, color: CATEGORY_COLOR[c.label] }}
              >
                {c.label === "Transmisi" ? "T" : c.label === "Trafo HV" ? "HV" : "LV"}:{c.count}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {Object.entries(CATEGORY_COLOR).map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BayTable({ entries, limit = 15 }: { entries: CombinedBayEntry[]; limit?: number }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>;
  }
  const shown = entries.slice(0, limit);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Ruas</th>
              <th className="px-3 py-2 font-medium">Kategori</th>
              <th className="px-3 py-2 font-medium text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={`${e.bay}-${i}`} className="border-b last:border-0">
                <td className="px-3 py-2 text-foreground">{e.bay}</td>
                <td className="px-3 py-2">
                  <CategoryBadge label={e.category} />
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{e.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > limit ? (
        <p className="text-xs text-muted-foreground">
          Menampilkan {limit} dari {entries.length} ruas yang mengalami gangguan bulan ini.
        </p>
      ) : null}
    </div>
  );
}

function KindStackedBar({ kind }: { kind: { label: string; count: number }[] }) {
  const total = kind.reduce((s, k) => s + k.count, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Tidak ada kejadian bulan ini.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 overflow-hidden rounded-full border">
        {kind.map((k) => (
          <div
            key={k.label}
            style={{ width: `${(k.count / total) * 100}%`, backgroundColor: KIND_COLOR[k.label] ?? "var(--muted-foreground)" }}
            title={`${k.label}: ${k.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {kind.map((k) => (
          <span key={k.label} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: KIND_COLOR[k.label] ?? "var(--muted-foreground)" }} />
            {k.label}: <span className="font-semibold text-foreground">{k.count}</span> ({formatPercent(k.count / total)})
          </span>
        ))}
      </div>
    </div>
  );
}

interface SlideDef {
  id: string;
  title: string;
  subtitle?: string;
  render: () => ReactNode;
}

export function DisturbancePresentationView({
  transmisi,
  trafoHv,
  trafoLv,
}: {
  transmisi: DisturbanceCategoryResult;
  trafoHv: DisturbanceCategoryResult;
  trafoLv: DisturbanceCategoryResult;
}) {
  useLandscapePrint();

  const current = useMemo(() => todayInJakarta(), []);
  const [year, setYear] = useState(String(current.year));
  const [monthIndex0, setMonthIndex0] = useState(current.monthIndex0);
  const monthLabel = MONTH_ID[monthIndex0];
  const isCurrentPeriod = year === String(current.year) && monthIndex0 === current.monthIndex0;

  const [mode, setMode] = useState<"preview" | "present">("preview");
  const [activeSlide, setActiveSlide] = useState(0);

  const yearOptions = useMemo(() => {
    const years = new Set([...transmisi.years, ...trafoHv.years, ...trafoLv.years, String(current.year)]);
    return [...years].sort();
  }, [transmisi.years, trafoHv.years, trafoLv.years, current.year]);

  const categories = useMemo(
    () => [
      { label: "Transmisi", data: transmisi },
      { label: "Trafo HV", data: trafoHv },
      { label: "Trafo LV", data: trafoLv },
    ],
    [transmisi, trafoHv, trafoLv],
  );

  const kindByCategory = useMemo(
    () =>
      categories.map((c) => ({
        label: c.label,
        kind: buildMonthlyBreakdown(c.data.monthlyByYearByKind, (k) => k.kind, monthLabel, year),
      })),
    [categories, monthLabel, year],
  );
  const totalByCategory = kindByCategory.map((c) => ({
    label: c.label,
    total: c.kind.reduce((s, k) => s + k.count, 0),
  }));
  const grandTotal = totalByCategory.reduce((s, c) => s + c.total, 0);
  const kindCountFor = useCallback(
    (label: string, kind: string) => kindByCategory.find((c) => c.label === label)?.kind.find((k) => k.label === kind)?.count ?? 0,
    [kindByCategory],
  );

  const combinedCalendarDays = useMemo(
    () => buildCombinedCalendarDays(categories.map((c) => ({ label: c.label, dailyCounts: c.data.dailyCounts })), Number(year), monthIndex0),
    [categories, year, monthIndex0],
  );
  const combinedCalendarSummary = useMemo(() => summarizeCombinedCalendar(combinedCalendarDays), [combinedCalendarDays]);

  const combinedUltg = useMemo(
    () =>
      buildCombinedUltgBreakdown(
        categories.map((c) => ({ label: c.label, series: c.data.monthlyByYearByUltg })),
        monthLabel,
        year,
      ),
    [categories, monthLabel, year],
  );

  const combinedBay = useMemo(
    () =>
      buildCombinedBayBreakdown(
        categories.map((c) => ({ label: c.label, series: c.data.monthlyByYearByBay })),
        monthLabel,
        year,
      ),
    [categories, monthLabel, year],
  );

  const cumulativeTransmisi = useMemo(() => {
    const series = transmisi.monthlyByYearByKind
      .map((k) => ({ label: k.kind, data: k.data }))
      .filter((k) => k.data.some((p) => Number(p[year] ?? 0) > 0));
    return buildCumulativeForYear(series, year);
  }, [transmisi.monthlyByYearByKind, year]);

  const cumulativeTrafo = useMemo(() => {
    const hvTrip = trafoHv.monthlyByYearByKind.find((k) => k.kind === "Trip")?.data ?? [];
    const lvTrip = trafoLv.monthlyByYearByKind.find((k) => k.kind === "Trip")?.data ?? [];
    return buildCumulativeForYear(
      [
        { label: "Trafo HV", data: hvTrip },
        { label: "Trafo LV", data: lvTrip },
      ],
      year,
    );
  }, [trafoHv.monthlyByYearByKind, trafoLv.monthlyByYearByKind, year]);

  const combinedCausePareto = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cat of categories) for (const c of cat.data.causePareto) counts.set(c.cause, (counts.get(c.cause) ?? 0) + c.count);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cause, count]) => ({ cause, count }));
  }, [categories]);
  const topCauseLabels = useMemo(() => combinedCausePareto.slice(0, 5).map((c) => c.cause), [combinedCausePareto]);
  const cumulativeCause = useMemo(() => {
    const merged = mergeCauseSeries(categories.map((c) => c.data.monthlyByYearByCause));
    const series = merged.filter((c) => topCauseLabels.includes(c.cause)).map((c) => ({ label: c.cause, data: c.data }));
    return buildCumulativeForYear(series, year);
  }, [categories, topCauseLabels, year]);

  const donutData = totalByCategory.filter((c) => c.total > 0).map((c) => ({ name: c.label, value: c.total }));

  const slides: SlideDef[] = useMemo(
    () => [
      {
        id: "ringkasan",
        title: "Ringkasan Total Gangguan",
        subtitle: `Periode ${monthLabel} ${year}`,
        render: () => (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary/40 bg-primary/5 p-5 text-center sm:col-span-1">
                <div className="text-4xl font-bold tabular-nums text-primary">{grandTotal}</div>
                <div className="text-xs font-medium text-muted-foreground">Total Gangguan</div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:col-span-3 sm:grid-cols-3">
                {totalByCategory.map((c) => (
                  <div key={c.label} className="rounded-lg border p-3" style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLOR[c.label] }}>
                    <div className="text-xl font-semibold tabular-nums text-foreground">{c.total}</div>
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>Trip: {kindCountFor(c.label, "Trip")}</span>
                      {c.label === "Transmisi" ? <span>AR: {kindCountFor(c.label, "AR Sukses")}</span> : null}
                      <span>Tidak Trip: {kindCountFor(c.label, "Tidak Trip")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={CATEGORY_COLOR[d.name]} />
                    ))}
                  </Pie>
                  <ChartTooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada gangguan pada periode ini.</p>
            )}
          </div>
        ),
      },
      {
        id: "kalender",
        title: "Kalender Gangguan (Gabungan)",
        subtitle: `${formatPercent(combinedCalendarSummary.percentWithoutDisturbance)} hari tanpa gangguan (${combinedCalendarSummary.daysWithoutDisturbance} dari ${combinedCalendarSummary.daysInMonth} hari)`,
        render: () => <CombinedCalendarGrid days={combinedCalendarDays} monthIndex0={monthIndex0} year={Number(year)} />,
      },
      {
        id: "transmisi-ar-trip",
        title: "Transmisi — AR & Trip",
        subtitle: `Jumlah kejadian Transmisi — ${monthLabel} ${year}`,
        render: () => (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatTile value={String(kindCountFor("Transmisi", "Trip"))} label="Lockout (Trip)" className="text-critical" />
              <StatTile value={String(kindCountFor("Transmisi", "AR Sukses"))} label="AR (Auto-Reclose Sukses)" className="text-success" />
              <StatTile value={String(kindCountFor("Transmisi", "Tidak Trip"))} label="Tidak Trip" />
            </div>
            <KindStackedBar kind={kindByCategory.find((c) => c.label === "Transmisi")?.kind ?? []} />
          </div>
        ),
      },
      {
        id: "trafo-hv-lv",
        title: "Trafo HV & LV — Trip / Tidak Trip",
        subtitle: `Sisi HV (seluruh trafo) vs sisi LV/incoming 20kV saja — ${monthLabel} ${year}`,
        render: () => (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4" style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLOR["Trafo HV"] }}>
                <p className="mb-3 text-sm font-semibold text-foreground">Trafo HV</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatTile value={String(kindCountFor("Trafo HV", "Trip"))} label="Trip" className="text-critical" />
                  <StatTile value={String(kindCountFor("Trafo HV", "Tidak Trip"))} label="Tidak Trip" />
                </div>
              </div>
              <div className="rounded-lg border p-4" style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLOR["Trafo LV"] }}>
                <p className="mb-3 text-sm font-semibold text-foreground">Trafo LV</p>
                <div className="grid grid-cols-2 gap-3">
                  <StatTile value={String(kindCountFor("Trafo LV", "Trip"))} label="Trip" className="text-critical" />
                  <StatTile value={String(kindCountFor("Trafo LV", "Tidak Trip"))} label="Tidak Trip" />
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { label: "Trip", "Trafo HV": kindCountFor("Trafo HV", "Trip"), "Trafo LV": kindCountFor("Trafo LV", "Trip") },
                  { label: "Tidak Trip", "Trafo HV": kindCountFor("Trafo HV", "Tidak Trip"), "Trafo LV": kindCountFor("Trafo LV", "Tidak Trip") },
                ]}
                margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                <ChartTooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Trafo HV" fill={CATEGORY_COLOR["Trafo HV"]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Trafo LV" fill={CATEGORY_COLOR["Trafo LV"]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ),
      },
      {
        id: "ultg",
        title: "Kontribusi ULTG",
        subtitle: `Transmisi + Trafo HV + Trafo LV — ${monthLabel} ${year}`,
        render: () =>
          combinedUltg.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={combinedUltg} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                <YAxis type="category" dataKey="ultg" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" width={150} />
                <ChartTooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Transmisi" stackId="a" fill={CATEGORY_COLOR.Transmisi} />
                <Bar dataKey="Trafo HV" stackId="a" fill={CATEGORY_COLOR["Trafo HV"]} />
                <Bar dataKey="Trafo LV" stackId="a" fill={CATEGORY_COLOR["Trafo LV"]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ),
      },
      {
        id: "ruas",
        title: "Kontribusi Ruas",
        subtitle: `Ruas dengan gangguan, ditandai kategorinya — ${monthLabel} ${year}`,
        render: () => <BayTable entries={combinedBay} />,
      },
      {
        id: "kumulatif-transmisi",
        title: "Kumulatif Transmisi — AR / Trip",
        subtitle: `Tren kumulatif sepanjang tahun ${year}`,
        render: () => (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={cumulativeTransmisi} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
              <ChartTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {Object.keys(KIND_COLOR)
                .filter((kind) => cumulativeTransmisi.some((p) => Number(p[kind] ?? 0) > 0))
                .map((kind) => (
                  <Line key={kind} type="monotone" dataKey={kind} name={kind} stroke={KIND_COLOR[kind]} strokeWidth={2.5} dot={{ r: 3 }} />
                ))}
            </LineChart>
          </ResponsiveContainer>
        ),
      },
      {
        id: "kumulatif-trafo",
        title: "Kumulatif Trafo HV vs LV",
        subtitle: `Tren Trip kumulatif sepanjang tahun ${year}`,
        render: () => (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={cumulativeTrafo} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
              <ChartTooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Trafo HV" stroke={CATEGORY_COLOR["Trafo HV"]} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Trafo LV" stroke={CATEGORY_COLOR["Trafo LV"]} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ),
      },
      {
        id: "kumulatif-penyebab",
        title: "Kumulatif Penyebab Gangguan",
        subtitle: `Top 5 penyebab gabungan — tren kumulatif tahun ${year}`,
        render: () => (
          <div className="flex flex-col gap-3">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cumulativeCause} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                <ChartTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topCauseLabels.map((cause, i) => (
                  <Line key={cause} type="monotone" dataKey={cause} name={cause} stroke={`var(--chart-${(i % 5) + 1})`} strokeWidth={2.5} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {combinedCausePareto.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Penyebab terbesar sepanjang data: {combinedCausePareto.slice(0, 5).map((c) => `${c.cause} (${c.count})`).join(", ")}.
              </p>
            ) : null}
          </div>
        ),
      },
    ],
    [
      monthLabel,
      year,
      monthIndex0,
      grandTotal,
      totalByCategory,
      kindByCategory,
      kindCountFor,
      donutData,
      combinedCalendarSummary,
      combinedCalendarDays,
      combinedUltg,
      combinedBay,
      cumulativeTransmisi,
      cumulativeTrafo,
      cumulativeCause,
      topCauseLabels,
      combinedCausePareto,
    ],
  );

  const clampSlide = useCallback((i: number) => Math.min(Math.max(i, 0), slides.length - 1), [slides.length]);

  const enterPresentation = useCallback(() => {
    setActiveSlide(0);
    setMode("present");
    try {
      document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen API unsupported/denied — the fixed full-viewport overlay
      // below still gives a presentation-like view without it.
    }
  }, []);

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setMode("preview");
  }, []);

  // Keeps mode state in sync no matter how fullscreen was exited (our own
  // button, Escape, F11, browser chrome) — Escape's fullscreen-exit is
  // handled natively by the browser before any JS runs, so this listener
  // is the reliable way to notice it happened.
  useEffect(() => {
    function onFullscreenChange() {
      if (!document.fullscreenElement) setMode("preview");
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (mode !== "present") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") setActiveSlide((i) => clampSlide(i + 1));
      else if (e.key === "ArrowLeft") setActiveSlide((i) => clampSlide(i - 1));
      else if (e.key === "Escape") exitPresentation();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, clampSlide, exitPresentation]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/dashboard/disturbances" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Kembali ke Gangguan
        </Link>

        <Select value={String(monthIndex0)} onValueChange={(v) => v && setMonthIndex0(Number(v))}>
          <SelectTrigger size="sm" className="ml-2 w-[150px]">
            <SelectValue placeholder="Bulan">{MONTH_ID[monthIndex0]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTH_ID.map((m, i) => (
              <SelectItem key={m} value={String(i)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger size="sm" className="w-[100px]">
            <SelectValue placeholder="Tahun">{year}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!isCurrentPeriod ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setYear(String(current.year));
              setMonthIndex0(current.monthIndex0);
            }}
          >
            <RotateCcw className="size-3.5" />
            Kembali ke Bulan Ini
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Cetak / Simpan PDF
          </Button>
          <Button size="sm" className="gap-1.5" onClick={enterPresentation}>
            <Maximize2 className="size-3.5" />
            Mulai Presentasi
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {slides.map((s) => (
          <section
            key={s.id}
            className="flex min-h-[70vh] flex-col gap-4 rounded-2xl border bg-card p-6 print:min-h-[calc(100vh-24mm)] print:break-after-page print:rounded-none print:border-0 print:shadow-none"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">{s.title}</h2>
              {s.subtitle ? <p className="text-sm text-muted-foreground">{s.subtitle}</p> : null}
            </div>
            <div className="flex-1">{s.render()}</div>
          </section>
        ))}
      </div>

      {mode === "present" ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background p-8 sm:p-12">
          <button
            type="button"
            onClick={exitPresentation}
            aria-label="Keluar dari mode presentasi"
            className="absolute top-5 right-5 z-10 flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" />
          </button>

          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 overflow-y-auto">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{slides[activeSlide].title}</h2>
              {slides[activeSlide].subtitle ? (
                <p className="text-sm text-muted-foreground sm:text-base">{slides[activeSlide].subtitle}</p>
              ) : null}
            </div>
            <div className="flex-1">{slides[activeSlide].render()}</div>
          </div>

          <div className="mx-auto mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSlide((i) => clampSlide(i - 1))}
              disabled={activeSlide === 0}
              className="flex size-10 items-center justify-center rounded-full border bg-card text-foreground disabled:opacity-30"
              aria-label="Slide sebelumnya"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
              {activeSlide + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => setActiveSlide((i) => clampSlide(i + 1))}
              disabled={activeSlide === slides.length - 1}
              className="flex size-10 items-center justify-center rounded-full border bg-card text-foreground disabled:opacity-30"
              aria-label="Slide berikutnya"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
