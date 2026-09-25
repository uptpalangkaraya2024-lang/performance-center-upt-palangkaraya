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
import type { DisturbanceCause } from "@/types";
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

/** Sums each category's own all-time causePareto by matching cause label —
 *  used to pick Transmisi's own top-5 causes and Trafo's own top-5 causes
 *  (HV+LV merged) as two SEPARATE rankings instead of one pooled-across-
 *  every-category list, so an unrelated category's cause can't crowd out
 *  the other's in the presentation's cause slide. */
function paretoFor(cats: DisturbanceCategoryResult[]): DisturbanceCause[] {
  const counts = new Map<string, number>();
  for (const cat of cats) for (const c of cat.causePareto) counts.set(c.cause, (counts.get(c.cause) ?? 0) + c.count);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cause, count]) => ({ cause, count }));
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
    <div className="flex flex-col justify-center rounded-lg border p-5 text-center">
      <div className={cn("text-3xl font-semibold tabular-nums", className ?? "text-foreground")}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

/** Like StatTile, but sized for a NAME (e.g. an ULTG or ruas label) instead
 *  of a short number — a 3xl numeric font would either overflow or force
 *  awkward wrapping for something like "ULTG PALANGKARAYA". */
function InfoTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg border p-5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-bold text-foreground", className)}>{value}</div>
    </div>
  );
}

function CategoryBadge({ label }: { label: string }) {
  const color = CATEGORY_COLOR[label] ?? "var(--muted-foreground)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium whitespace-nowrap"
      style={{ borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
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
        fontSize: 13,
        ...contentStyle,
      }}
    />
  );
}

// Short, unambiguous tag text per (category, kind) pair — e.g. "T · Trip",
// "T · Reclose", "HV · Trip" — so a glance at the calendar tells both WHICH
// asset type and WHICH kind of event happened, not just a bare count.
function categoryAbbr(label: string): string {
  return label === "Transmisi" ? "T" : label === "Trafo HV" ? "HV" : "LV";
}
function kindAbbr(kind: string): string {
  return kind === "AR Sukses" ? "Reclose" : kind === "Tidak Trip" ? "T.Trip" : kind;
}
// Transmisi is colored by KIND (Trip=red vs Reclose=green) since that
// distinction is the whole point of an auto-reclose scheme; Trafo HV/LV
// have no reclose scheme so they stay colored by CATEGORY instead.
function tagColor(categoryLabel: string, kind: string): string {
  return categoryLabel === "Transmisi" ? (KIND_COLOR[kind] ?? "var(--muted-foreground)") : CATEGORY_COLOR[categoryLabel];
}

function CombinedCalendarGrid({ days, monthIndex0, year }: { days: CombinedCalendarDay[]; monthIndex0: number; year: number }) {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay(); // 0=Sun
  const leadingBlanks = (firstWeekday + 6) % 7; // shift to Monday-first

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-7 gap-2 text-center">
        {DAY_LABELS.map((d) => (
          <div key={d} className="pb-1 text-sm font-semibold text-muted-foreground">
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
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border p-1.5",
              d.total > 0 ? "border-critical/50 bg-critical/10" : "border-success/30 bg-success/5",
            )}
          >
            <span className={cn("text-lg font-bold tabular-nums", d.total > 0 ? "text-critical" : "text-foreground")}>
              {d.day}
            </span>
            {d.byCategory.flatMap((c) =>
              (c.byKind.length > 0 ? c.byKind : [{ kind: "", count: c.count }]).map((k) => (
                <span
                  key={`${c.label}-${k.kind}`}
                  className="rounded px-1.5 py-0.5 text-[11px] leading-tight font-semibold whitespace-nowrap"
                  style={{ backgroundColor: `color-mix(in srgb, ${tagColor(c.label, k.kind)} 20%, transparent)`, color: tagColor(c.label, k.kind) }}
                >
                  {categoryAbbr(c.label)}
                  {k.kind ? ` · ${kindAbbr(k.kind)}` : ""}:{k.count}
                </span>
              )),
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: KIND_COLOR.Trip }} />
          Transmisi · Trip
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: KIND_COLOR["AR Sukses"] }} />
          Transmisi · Reclose (AR Sukses)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR["Trafo HV"] }} />
          Trafo HV
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLOR["Trafo LV"] }} />
          Trafo LV
        </span>
      </div>
    </div>
  );
}

function BayTable({ entries, limit = 12 }: { entries: CombinedBayEntry[]; limit?: number }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>;
  }
  const shown = entries.slice(0, limit);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-base">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-sm text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Ruas</th>
              <th className="px-4 py-2.5 font-medium">ULTG</th>
              <th className="px-4 py-2.5 font-medium">Kategori</th>
              <th className="px-4 py-2.5 font-medium text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={`${e.bay}-${i}`} className="border-b last:border-0">
                <td className="px-4 py-2.5 text-foreground">{e.bay}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.ultg}</td>
                <td className="px-4 py-2.5">
                  <CategoryBadge label={e.category} />
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">{e.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length > limit ? (
        <p className="text-sm text-muted-foreground">
          Menampilkan {limit} dari {entries.length} ruas yang mengalami gangguan bulan ini.
        </p>
      ) : null}
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
    () =>
      buildCombinedCalendarDays(
        categories.map((c) => ({ label: c.label, dailyCounts: c.data.dailyCounts, dailyByKind: c.data.dailyByKind })),
        Number(year),
        monthIndex0,
      ),
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
        categories.map((c) => {
          const ultgByBay = new Map(c.data.bayBreakdown.map((b) => [b.bay, b.ultg]));
          return {
            label: c.label,
            series: c.data.monthlyByYearByBay,
            ultgOf: (bay: string) => ultgByBay.get(bay) ?? "—",
          };
        }),
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

  // Transmisi and Trafo (HV+LV merged) causes are kept in two SEPARATE
  // paretos/trends rather than one combined-across-everything chart — a
  // single top-5 across all 3 categories tends to conflate causes that are
  // only meaningful for one asset type (e.g. a lightning-strike cause
  // dominating Transmisi's own trend gets buried by a totally unrelated
  // Trafo cause, and vice versa), per explicit user feedback.
  const transmisiCausePareto = useMemo(() => paretoFor([transmisi]), [transmisi]);
  const transmisiTopCauses = useMemo(() => transmisiCausePareto.slice(0, 5).map((c) => c.cause), [transmisiCausePareto]);
  const cumulativeCauseTransmisi = useMemo(() => {
    const series = transmisi.monthlyByYearByCause
      .filter((c) => transmisiTopCauses.includes(c.cause))
      .map((c) => ({ label: c.cause, data: c.data }));
    return buildCumulativeForYear(series, year);
  }, [transmisi.monthlyByYearByCause, transmisiTopCauses, year]);

  const trafoCausePareto = useMemo(() => paretoFor([trafoHv, trafoLv]), [trafoHv, trafoLv]);
  const trafoTopCauses = useMemo(() => trafoCausePareto.slice(0, 5).map((c) => c.cause), [trafoCausePareto]);
  const cumulativeCauseTrafo = useMemo(() => {
    const merged = mergeCauseSeries([trafoHv.monthlyByYearByCause, trafoLv.monthlyByYearByCause]);
    const series = merged.filter((c) => trafoTopCauses.includes(c.cause)).map((c) => ({ label: c.cause, data: c.data }));
    return buildCumulativeForYear(series, year);
  }, [trafoHv.monthlyByYearByCause, trafoLv.monthlyByYearByCause, trafoTopCauses, year]);

  const donutData = totalByCategory.filter((c) => c.total > 0).map((c) => ({ name: c.label, value: c.total }));

  const slides: SlideDef[] = useMemo(
    () => [
      {
        id: "ringkasan",
        title: "Ringkasan Total Gangguan",
        subtitle: `Periode ${monthLabel} ${year}`,
        render: () => {
          const topUltg = combinedUltg[0];
          const topBay = combinedBay[0];
          return (
            <div className="flex h-full flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary/40 bg-primary/5 p-6 text-center sm:col-span-1">
                  <div className="text-5xl font-bold tabular-nums text-primary">{grandTotal}</div>
                  <div className="text-sm font-medium text-muted-foreground">Total Gangguan</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:col-span-3 sm:grid-cols-3">
                  {totalByCategory.map((c) => (
                    <div key={c.label} className="rounded-lg border p-4" style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLOR[c.label] }}>
                      <div className="text-2xl font-semibold tabular-nums text-foreground">{c.total}</div>
                      <div className="text-sm text-muted-foreground">{c.label}</div>
                      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Trip: {kindCountFor(c.label, "Trip")}</span>
                        {c.label === "Transmisi" ? <span>AR: {kindCountFor(c.label, "AR Sukses")}</span> : null}
                        <span>Tidak Trip: {kindCountFor(c.label, "Tidak Trip")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 items-center gap-6 lg:grid-cols-2">
                {donutData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={360}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={72}
                        outerRadius={120}
                        paddingAngle={2}
                        label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                      >
                        {donutData.map((d) => (
                          <Cell key={d.name} fill={CATEGORY_COLOR[d.name]} />
                        ))}
                      </Pie>
                      <ChartTooltip />
                      <Legend wrapperStyle={{ fontSize: 13 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada gangguan pada periode ini.</p>
                )}

                <div className="flex h-full flex-col gap-3">
                  <p className="text-base font-semibold text-foreground">Insight Cepat — {monthLabel} {year}</p>
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    <InfoTile
                      label={topUltg ? `ULTG Terdampak Terbanyak (${topUltg.total} kejadian)` : "ULTG Terdampak Terbanyak"}
                      value={topUltg ? topUltg.ultg : "—"}
                    />
                    <InfoTile
                      label={topBay ? `Ruas Terdampak Terbanyak (${topBay.count} kejadian)` : "Ruas Terdampak Terbanyak"}
                      value={topBay ? topBay.bay : "—"}
                    />
                    <StatTile
                      value={formatPercent(combinedCalendarSummary.percentWithoutDisturbance)}
                      label="Hari Tanpa Gangguan Bulan Ini"
                      className="text-success"
                    />
                    <StatTile
                      value={formatPercent(combinedCalendarSummary.percentWithDisturbance)}
                      label="Hari Dengan Gangguan Bulan Ini"
                      className="text-critical"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "kalender",
        title: "Kalender Gangguan (Gabungan)",
        subtitle: `${formatPercent(combinedCalendarSummary.percentWithDisturbance)} hari dengan gangguan · ${formatPercent(combinedCalendarSummary.percentWithoutDisturbance)} hari tanpa gangguan (${combinedCalendarSummary.daysWithoutDisturbance} dari ${combinedCalendarSummary.daysInMonth} hari)`,
        render: () => (
          <div className="flex flex-col gap-5">
            <CombinedCalendarGrid days={combinedCalendarDays} monthIndex0={monthIndex0} year={Number(year)} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile value={String(kindCountFor("Transmisi", "Trip"))} label="Transmisi · Trip" className="text-critical" />
              <StatTile value={String(kindCountFor("Transmisi", "AR Sukses"))} label="Transmisi · Reclose" className="text-success" />
              <StatTile value={String(totalByCategory.find((c) => c.label === "Trafo HV")?.total ?? 0)} label="Trafo HV · Gangguan" />
              <StatTile value={String(totalByCategory.find((c) => c.label === "Trafo LV")?.total ?? 0)} label="Trafo LV · Gangguan" />
            </div>
          </div>
        ),
      },
      {
        id: "ultg-ruas",
        title: "Kontribusi ULTG & Ruas",
        subtitle: `Transmisi + Trafo HV + Trafo LV — ${monthLabel} ${year}`,
        render: () => (
          <div className="flex flex-col gap-6">
            {combinedUltg.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={combinedUltg} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <YAxis type="category" dataKey="ultg" tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" width={160} />
                  <ChartTooltip />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar dataKey="Transmisi" stackId="a" fill={CATEGORY_COLOR.Transmisi} />
                  <Bar dataKey="Trafo HV" stackId="a" fill={CATEGORY_COLOR["Trafo HV"]} />
                  <Bar dataKey="Trafo LV" stackId="a" fill={CATEGORY_COLOR["Trafo LV"]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div>
              <p className="mb-2 text-base font-semibold text-foreground">Kontribusi Ruas</p>
              <BayTable entries={combinedBay} />
            </div>
          </div>
        ),
      },
      {
        id: "kumulatif-transmisi-trafo",
        title: "Kumulatif Transmisi & Trafo",
        subtitle: `Tren kumulatif sepanjang tahun ${year}`,
        render: () => (
          <div className="flex h-full flex-col gap-6">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-base font-semibold text-foreground">Transmisi — AR / Trip</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                  <LineChart data={cumulativeTransmisi} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    {Object.keys(KIND_COLOR)
                      .filter((kind) => cumulativeTransmisi.some((p) => Number(p[kind] ?? 0) > 0))
                      .map((kind) => (
                        <Line key={kind} type="monotone" dataKey={kind} name={kind} stroke={KIND_COLOR[kind]} strokeWidth={3} dot={{ r: 4 }} />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-base font-semibold text-foreground">Trafo HV vs LV — Trip</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                  <LineChart data={cumulativeTrafo} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    <Line type="monotone" dataKey="Trafo HV" stroke={CATEGORY_COLOR["Trafo HV"]} strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Trafo LV" stroke={CATEGORY_COLOR["Trafo LV"]} strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "kumulatif-penyebab",
        title: "Kumulatif Penyebab Gangguan",
        subtitle: `Top 5 penyebab — Transmisi dan Trafo dipisah agar tidak rancu — tren kumulatif tahun ${year}`,
        render: () => (
          <div className="flex h-full flex-col gap-6">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-base font-semibold text-foreground">Penyebab Transmisi</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <LineChart data={cumulativeCauseTransmisi} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {transmisiTopCauses.map((cause, i) => (
                      <Line key={cause} type="monotone" dataKey={cause} name={cause} stroke={`var(--chart-${(i % 5) + 1})`} strokeWidth={3} dot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {transmisiCausePareto.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Terbesar: {transmisiCausePareto.slice(0, 5).map((c) => `${c.cause} (${c.count})`).join(", ")}.
                </p>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-base font-semibold text-foreground">Penyebab Trafo (HV + LV)</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                  <LineChart data={cumulativeCauseTrafo} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={13} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {trafoTopCauses.map((cause, i) => (
                      <Line key={cause} type="monotone" dataKey={cause} name={cause} stroke={`var(--chart-${(i % 5) + 1})`} strokeWidth={3} dot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {trafoCausePareto.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Terbesar: {trafoCausePareto.slice(0, 5).map((c) => `${c.cause} (${c.count})`).join(", ")}.
                </p>
              ) : null}
            </div>
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
      kindCountFor,
      donutData,
      combinedCalendarSummary,
      combinedCalendarDays,
      combinedUltg,
      combinedBay,
      cumulativeTransmisi,
      cumulativeTrafo,
      cumulativeCauseTransmisi,
      cumulativeCauseTrafo,
      transmisiTopCauses,
      trafoTopCauses,
      transmisiCausePareto,
      trafoCausePareto,
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
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{s.title}</h2>
              {s.subtitle ? <p className="text-base text-muted-foreground">{s.subtitle}</p> : null}
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

          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 overflow-y-auto">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{slides[activeSlide].title}</h2>
              {slides[activeSlide].subtitle ? (
                <p className="text-base text-muted-foreground sm:text-lg">{slides[activeSlide].subtitle}</p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">{slides[activeSlide].render()}</div>
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
