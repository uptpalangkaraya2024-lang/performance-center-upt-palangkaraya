"use client";

// Monthly workload heatmap (feature #7) — a calendar-style view over the
// already-loaded RENUS dataset so an overloaded week is visible at a
// glance, before it piles up, instead of only being discovered once it's
// underway. Matches the dashboard's own reference design: per-day job
// counts, a red flag wherever high-risk work lands, and a plain-language
// callout for any week that's crossed the overload threshold.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildMonthlyWorkloadHeatmap, WORKLOAD_WEEKDAY_LABEL, type WorkloadDay } from "@/lib/renus-workload-heatmap";
import type { RenusRow } from "@/types";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

/** Background intensity scales with how busy a day is relative to the
 *  busiest day this month (not a fixed scale) — so "busy" always reads
 *  correctly whether a typical month has 2 jobs/day or 6. A day with any
 *  high-risk work always gets the critical ring on top, regardless of its
 *  own count-based shade. */
function cellShadeClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-muted/30";
  if (maxCount <= 1) return "bg-primary/25";
  const ratio = count / maxCount;
  if (ratio <= 0.34) return "bg-primary/15";
  if (ratio <= 0.67) return "bg-primary/35";
  return "bg-primary/55";
}

function DayCell({
  day,
  maxCount,
  isToday,
  isSelected,
  onSelect,
}: {
  day: WorkloadDay;
  maxCount: number;
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-h-16 flex-col justify-between rounded-md border p-1.5 text-left transition-colors sm:min-h-20 sm:p-2",
        cellShadeClass(day.count, maxCount),
        day.highRiskCount > 0 ? "ring-2 ring-critical/70" : "",
        isSelected ? "border-primary" : "border-border/60",
        isToday ? "outline outline-2 outline-offset-1 outline-primary/60" : "",
        "hover:brightness-95",
      )}
    >
      <span className={cn("text-xs font-semibold", isToday ? "text-primary" : "text-muted-foreground")}>{day.day}</span>
      {day.count > 0 ? (
        <span className="flex items-center justify-between gap-1">
          <span className="text-base font-extrabold tabular-nums text-foreground sm:text-lg">{day.count}</span>
          {day.highRiskCount > 0 ? (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-critical">
              <AlertTriangle className="size-3" />
              {day.highRiskCount}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

export function RenusWorkloadHeatmap({ rows, todayISO }: { rows: RenusRow[]; todayISO: string }) {
  const [todayYear, todayMonth] = todayISO.split("-").map(Number);
  const [year, setYear] = useState(todayYear);
  const [monthIndex, setMonthIndex] = useState(todayMonth - 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const month = useMemo(() => buildMonthlyWorkloadHeatmap(rows, year, monthIndex), [rows, year, monthIndex]);

  function goPrevMonth() {
    setSelectedDay(null);
    if (monthIndex === 0) {
      setYear((y) => y - 1);
      setMonthIndex(11);
    } else {
      setMonthIndex((m) => m - 1);
    }
  }
  function goNextMonth() {
    setSelectedDay(null);
    if (monthIndex === 11) {
      setYear((y) => y + 1);
      setMonthIndex(0);
    } else {
      setMonthIndex((m) => m + 1);
    }
  }
  function goToday() {
    setSelectedDay(null);
    setYear(todayYear);
    setMonthIndex(todayMonth - 1);
  }

  const maxCount = Math.max(1, ...month.weeks.flatMap((w) => w.map((d) => d?.count ?? 0)));
  const selectedRows = month.weeks.flat().find((d) => d?.dateISO === selectedDay)?.rows ?? [];
  const isCurrentMonth = year === todayYear && monthIndex === todayMonth - 1;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
            <CalendarRange className="size-5 text-primary" />
            Peta Beban Kerja Bulanan
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {month.totalCount} pekerjaan direncanakan bulan {month.monthLabel} {month.year}
            {month.highRiskCount > 0 ? `, ${month.highRiskCount} di antaranya berisiko tinggi` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={goPrevMonth} aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-36 text-center text-sm font-semibold text-foreground">
            {month.monthLabel} {month.year}
          </span>
          <Button variant="outline" size="icon" className="size-8" onClick={goNextMonth} aria-label="Bulan selanjutnya">
            <ChevronRight className="size-4" />
          </Button>
          {!isCurrentMonth ? (
            <Button variant="ghost" size="icon" className="size-8" onClick={goToday} aria-label="Kembali ke bulan ini">
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {month.overloadWeekIndexes.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-lg border border-critical/40 bg-critical/10 p-3 text-sm">
            {month.overloadWeekIndexes.map((idx) => {
              const weekRows = month.weeks[idx];
              const weekCount = weekRows.reduce((s, d) => s + (d?.count ?? 0), 0);
              const weekHighRisk = weekRows.reduce((s, d) => s + (d?.highRiskCount ?? 0), 0);
              const firstDay = weekRows.find((d) => d !== null)?.day;
              const lastDay = [...weekRows].reverse().find((d) => d !== null)?.day;
              return (
                <p key={idx} className="flex items-start gap-1.5 font-medium text-critical">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Minggu tanggal {firstDay}–{lastDay}: {weekCount} pekerjaan
                  {weekHighRisk > 0 ? ` (${weekHighRisk} berisiko tinggi)` : ""} — beban berlebih, pertimbangkan diratakan
                  ke minggu lain.
                </p>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          {WORKLOAD_WEEKDAY_LABEL.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {month.weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-1">
              {week.map((day, cellIdx) =>
                day ? (
                  <DayCell
                    key={day.dateISO}
                    day={day}
                    maxCount={maxCount}
                    isToday={day.dateISO === todayISO}
                    isSelected={day.dateISO === selectedDay}
                    onSelect={() => setSelectedDay((prev) => (prev === day.dateISO ? null : day.dateISO))}
                  />
                ) : (
                  <span key={cellIdx} />
                ),
              )}
            </div>
          ))}
        </div>

        {selectedDay ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-bold text-foreground">{formatShort(selectedDay)} — {selectedRows.length} pekerjaan</p>
            {selectedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada pekerjaan dijadwalkan pada tanggal ini.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedRows.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={r.workDetail}>
                        {r.workDetail}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.ultg} · {r.gi} · {r.bay}
                      </p>
                    </div>
                    {r.risk ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                          r.risk === "EXTREME-CRITICAL" || r.risk === "HIGH"
                            ? "border-critical/40 bg-critical/10 text-critical"
                            : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {r.risk}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Klik tanggal untuk lihat detail pekerjaan. Warna sel mengikuti jumlah pekerjaan pada hari itu relatif terhadap
          hari paling sibuk bulan ini; bingkai merah menandai hari dengan pekerjaan berisiko tinggi.
        </p>
      </CardContent>
    </Card>
  );
}
