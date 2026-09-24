"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, RotateCcw } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
  buildCalendarDays,
  buildCumulativeForYear,
  buildMonthlyBreakdown,
  summarizeCalendar,
} from "@/lib/disturbance-presentation-compute";
import type { DisturbanceCategoryResult } from "@/types";

type CategoryKey = "transmisi" | "trafoHv" | "trafoLv";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  transmisi: "Transmisi",
  trafoHv: "Trafo HV",
  trafoLv: "Trafo Low Voltage",
};

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const KIND_COLORS: Record<string, string> = {
  Trip: "var(--critical)",
  "AR Sukses": "var(--success)",
  "Tidak Trip": "var(--muted-foreground)",
};

function todayInJakarta(): { year: number; monthIndex0: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-");
  return { year: Number(parts[0]), monthIndex0: Number(parts[1]) - 1 };
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

// Injects `@page { size: landscape; }` only while this view is mounted, so
// printing/"Save as PDF" here defaults to a slide-like wide page without
// touching the print layout of any other page (a plain global CSS @page
// rule would apply everywhere it's loaded, including the working 4DX
// print flow this pattern was borrowed from).
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

function Slide({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-[70vh] flex-col gap-4 rounded-2xl border bg-card p-6 print:min-h-[calc(100vh-24mm)] print:break-after-page print:rounded-none print:border-0 print:shadow-none">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function StatTile({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <div className={cn("text-2xl font-semibold tabular-nums", className ?? "text-foreground")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function CalendarGrid({
  days,
  monthIndex0,
  year,
}: {
  days: { date: string; day: number; count: number }[];
  monthIndex0: number;
  year: number;
}) {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay(); // 0=Sun
  const leadingBlanks = (firstWeekday + 6) % 7; // shift to Monday-first

  return (
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
            "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm",
            d.count > 0 ? "border-critical/40 bg-critical/10 text-critical" : "border-success/30 bg-success/5 text-foreground",
          )}
        >
          <span className="font-semibold tabular-nums">{d.day}</span>
          {d.count > 0 ? <span className="text-[10px] tabular-nums">{d.count}x</span> : null}
        </div>
      ))}
    </div>
  );
}

function BreakdownBars({ entries, unit }: { entries: { label: string; count: number }[]; unit?: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>;
  }
  const max = Math.max(...entries.map((e) => e.count));
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((e) => (
        <div key={e.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-foreground" title={e.label}>
            {e.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded-full bg-muted/40">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(e.count / max) * 100}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
            {e.count}
            {unit ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
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

  const dataByCategory: Record<CategoryKey, DisturbanceCategoryResult> = { transmisi, trafoHv, trafoLv };
  const [category, setCategory] = useState<CategoryKey>("transmisi");
  const data = dataByCategory[category];

  const current = useMemo(() => todayInJakarta(), []);
  const [year, setYear] = useState(String(current.year));
  const [monthIndex0, setMonthIndex0] = useState(current.monthIndex0);
  const monthLabel = MONTH_ID[monthIndex0];

  const yearOptions = useMemo(() => {
    const years = new Set(data.years);
    years.add(String(current.year));
    return [...years].sort();
  }, [data.years, current.year]);

  const isCurrentPeriod = year === String(current.year) && monthIndex0 === current.monthIndex0;

  const calendarDays = useMemo(
    () => buildCalendarDays(data.dailyCounts, Number(year), monthIndex0),
    [data.dailyCounts, year, monthIndex0],
  );
  const calendarSummary = useMemo(() => summarizeCalendar(calendarDays), [calendarDays]);

  const kindThisMonth = useMemo(
    () => buildMonthlyBreakdown(data.monthlyByYearByKind, (k) => k.kind, monthLabel, year),
    [data.monthlyByYearByKind, monthLabel, year],
  );
  const totalThisMonth = kindThisMonth.reduce((sum, k) => sum + k.count, 0);
  const kindCount = (label: string) => kindThisMonth.find((k) => k.label === label)?.count ?? 0;

  const ultgThisMonth = useMemo(
    () => buildMonthlyBreakdown(data.monthlyByYearByUltg, (u) => u.ultg, monthLabel, year),
    [data.monthlyByYearByUltg, monthLabel, year],
  );
  const bayThisMonth = useMemo(
    () => buildMonthlyBreakdown(data.monthlyByYearByBay, (b) => b.bay, monthLabel, year),
    [data.monthlyByYearByBay, monthLabel, year],
  );
  const causeThisMonth = useMemo(
    () => buildMonthlyBreakdown(data.monthlyByYearByCause, (c) => c.cause, monthLabel, year),
    [data.monthlyByYearByCause, monthLabel, year],
  );

  const cumulativeKind = useMemo(() => {
    const series = data.monthlyByYearByKind
      .map((k) => ({ label: k.kind, data: k.data }))
      .filter((k) => k.data.some((p) => Number(p[year] ?? 0) > 0));
    return buildCumulativeForYear(series, year);
  }, [data.monthlyByYearByKind, year]);

  const topCauseLabels = useMemo(() => data.causePareto.slice(0, 5).map((c) => c.cause), [data.causePareto]);
  const cumulativeCause = useMemo(() => {
    const series = data.monthlyByYearByCause
      .filter((c) => topCauseLabels.includes(c.cause))
      .map((c) => ({ label: c.cause, data: c.data }));
    return buildCumulativeForYear(series, year);
  }, [data.monthlyByYearByCause, topCauseLabels, year]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/dashboard/disturbances" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Kembali ke Gangguan
        </Link>

        <div className="ml-2 flex items-center rounded-full border p-0.5">
          {(Object.keys(CATEGORY_LABELS) as CategoryKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                category === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>

        <Select value={String(monthIndex0)} onValueChange={(v) => v && setMonthIndex0(Number(v))}>
          <SelectTrigger size="sm" className="w-[150px]">
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

        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Cetak / Simpan PDF
        </Button>
      </div>

      <Slide title={`Rekap Gangguan ${CATEGORY_LABELS[category]}`} subtitle={`Periode ${monthLabel} ${year}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={String(totalThisMonth)} label="Total Kejadian" />
          <StatTile value={String(kindCount("Trip"))} label="Trip" className="text-critical" />
          {category === "transmisi" ? (
            <StatTile value={String(kindCount("AR Sukses"))} label="AR Sukses" className="text-success" />
          ) : null}
          <StatTile value={String(kindCount("Tidak Trip"))} label="Tidak Trip" />
        </div>
      </Slide>

      <Slide
        title="Kalender Gangguan"
        subtitle={`${formatPercent(calendarSummary.percentWithoutDisturbance)} hari tanpa gangguan (${calendarSummary.daysWithoutDisturbance} dari ${calendarSummary.daysInMonth} hari)`}
      >
        <CalendarGrid days={calendarDays} monthIndex0={monthIndex0} year={Number(year)} />
      </Slide>

      {category === "transmisi" ? (
        <Slide title="AR & Lockout" subtitle={`Jumlah kejadian Transmisi periode ${monthLabel} ${year}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile value={String(kindCount("Trip"))} label="Lockout (Trip)" className="text-critical" />
            <StatTile value={String(kindCount("AR Sukses"))} label="AR (Auto-Reclose Sukses)" className="text-success" />
            <StatTile value={String(kindCount("Tidak Trip"))} label="Tidak Trip" />
          </div>
        </Slide>
      ) : null}

      <Slide title="Kontribusi ULTG" subtitle={`Jumlah gangguan per ULTG — ${monthLabel} ${year}`}>
        <BreakdownBars entries={ultgThisMonth} />
      </Slide>

      <Slide title="Kontribusi Ruas" subtitle={`Ruas dengan gangguan — ${monthLabel} ${year}`}>
        <BreakdownBars entries={bayThisMonth.slice(0, 10)} />
        {bayThisMonth.length > 10 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Menampilkan 10 dari {bayThisMonth.length} ruas yang mengalami gangguan bulan ini.
          </p>
        ) : null}
      </Slide>

      <Slide title="Kumulatif AR / Trip" subtitle={`Tren kumulatif sepanjang tahun ${year}`}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={cumulativeKind} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
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
            {Object.keys(KIND_COLORS)
              .filter((kind) => cumulativeKind.some((p) => Number(p[kind] ?? 0) > 0))
              .map((kind) => (
                <Line
                  key={kind}
                  type="monotone"
                  dataKey={kind}
                  name={kind}
                  stroke={KIND_COLORS[kind]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </Slide>

      <Slide title="Kumulatif Penyebab Gangguan" subtitle={`Top 5 penyebab — tren kumulatif tahun ${year}`}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={cumulativeCause} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
            <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {topCauseLabels.map((cause, i) => (
              <Line
                key={cause}
                type="monotone"
                dataKey={cause}
                name={cause}
                stroke={`var(--chart-${(i % 5) + 1})`}
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {causeThisMonth.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Penyebab bulan ini: {causeThisMonth.map((c) => `${c.label} (${c.count})`).join(", ")}.
          </p>
        ) : null}
      </Slide>
    </div>
  );
}
