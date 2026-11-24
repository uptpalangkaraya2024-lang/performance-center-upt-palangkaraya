"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Maximize2, Minus, Printer, RotateCcw, TrendingDown, TrendingUp, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
  buildBayEventDetailsForMonth,
  buildCauseShareByYear,
  buildCombinedBayBreakdown,
  buildCombinedCalendarDays,
  buildCombinedUltgBreakdown,
  buildCombinedUltgByCause,
  buildCombinedUltgByKind,
  buildCumulativeByYear,
  buildDisturbanceResumeEvents,
  buildMonthlyBreakdown,
  comparisonYears,
  summarizeCombinedCalendar,
  sumMonthlyByYear,
  type CauseShareYear,
  type CombinedCalendarDay,
  type CumulativePoint,
  type DisturbanceResumeEvent,
} from "@/lib/disturbance-presentation-compute";
import type { DisturbanceCause } from "@/types";
import type { DisturbanceCategoryResult } from "@/types";

// Same palette as disturbance-yoy-monthly-chart.tsx's own YEAR_COLORS —
// duplicated rather than imported since that's a separate client component,
// same precedent as this file's own duplicated MONTH_ID.
const YEAR_COLORS = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)"];

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

// One accent per category, reused everywhere (stat cards, donut, stacked
// bar, badges) so the same category always reads the same color across
// every slide — same "one accent = one thing" principle the rest of the
// dashboard's chart palette already follows (var(--chart-N) tokens).
const CATEGORY_COLOR: Record<string, string> = {
  Transmisi: "var(--chart-1)",
  "Trafo HV": "var(--chart-4)",
  // Violet, not --chart-3: that token is the same green as --success
  // (Reclose), so a Trafo LV trip on the calendar read as a reclose.
  "Trafo LV": "#8b5cf6",
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

// A "terbanyak" (most-affected) tile picking just entry [0] after a
// count-desc sort silently hides real ties (e.g. 2 ULTGs both at the same
// top count) behind whichever one happened to sort first — confirmed
// confusing from a live screenshot ("kenapa ... padahal ada ruas lain yang
// juga sama jumlahnya"). This lists every tied entry instead, capped so a
// long tie (common for a low count like 1) doesn't overflow the tile.
function formatTiedNames(names: string[], max = 4): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")}, +${names.length - max} lainnya`;
}

// LabelList's own formatter type accepts any renderable value (not just
// number), so a stacked segment's own 0-value cells (rendered but with
// nothing to show) get coerced safely instead of printing "0" inside a
// sliver too thin to hold text.
function formatBarLabel(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
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

// `compact` trims padding/font-size for a dense row (e.g. 6 tiles across) —
// added per explicit user feedback that Slide 2 grew too tall to fit one
// screen in presentation mode once it gained 2 more tiles.
function StatTile({
  value,
  label,
  className,
  compact = false,
}: {
  value: string;
  label: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col justify-center rounded-lg border bg-muted text-center", compact ? "p-2.5" : "p-5")}>
      <div className={cn("font-extrabold tabular-nums", compact ? "text-xl" : "text-3xl", className ?? "text-foreground")}>
        {value}
      </div>
      <div className={cn("font-medium text-muted-foreground", compact ? "text-[11px] leading-tight" : "text-sm")}>{label}</div>
    </div>
  );
}

/** One month-over-month comparison tile (e.g. "Transmisi · Trip": 3 -> 5,
 *  +2, +67%) for the ringkasan slide's comparison strip. More gangguan is
 *  worse, fewer is better — colored the opposite of a typical "up is good"
 *  dashboard tile on purpose, same red/green convention this file already
 *  uses for Trip (critical/red) vs AR Sukses (success/green). `previous`
 *  of 0 with a positive `current` has no meaningful percent (not -100%,
 *  not +Infinity%) — shown as "Baru" instead of a fabricated number; both
 *  zero shows "Tetap". */
function MonthComparisonTile({
  label,
  current,
  previous,
  emphasize = false,
}: {
  label: string;
  current: number;
  previous: number;
  emphasize?: boolean;
}) {
  const delta = current - previous;
  const isNew = previous === 0 && current > 0;
  const isFlat = previous === 0 && current === 0;
  const percent = !isNew && !isFlat ? Math.round((delta / previous) * 100) : null;
  const direction: "up" | "down" | "flat" = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  // "up" (more gangguan) reads as worse -> critical/red; "down" (fewer) reads
  // as better -> success/green; flat/no-data stays neutral.
  const toneClass = direction === "up" ? "text-critical" : direction === "down" ? "text-success" : "text-muted-foreground";
  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3.5",
        emphasize ? "border-2 border-primary/40 bg-primary/5" : "bg-muted",
      )}
    >
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm text-muted-foreground tabular-nums">{previous}</span>
        <span className="text-sm text-muted-foreground">→</span>
        <span className="text-2xl font-extrabold tabular-nums text-foreground">{current}</span>
      </div>
      <div className={cn("flex items-center gap-1 text-sm font-bold", toneClass)}>
        <Icon className="size-3.5" />
        {isNew ? (
          <span>Baru ({current})</span>
        ) : isFlat ? (
          <span>Tetap</span>
        ) : (
          <span>
            {delta > 0 ? "+" : ""}
            {delta} ({percent !== null && percent > 0 ? "+" : ""}
            {percent}%)
          </span>
        )}
      </div>
    </div>
  );
}

/** Like StatTile, but sized for a NAME (e.g. an ULTG or ruas label) instead
 *  of a short number — a 3xl numeric font would either overflow or force
 *  awkward wrapping for something like "ULTG PALANGKARAYA". */
function InfoTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col justify-center rounded-lg border bg-muted p-5">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-extrabold text-foreground", className)}>{value}</div>
    </div>
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

/** One cause's own small cumulative chart, sized to fit two per row within a
 *  slide — see the "Kumulatif Penyebab Gangguan" slide, which per the user's
 *  explicit request shows one chart per cause (not one chart with every
 *  cause overlaid) so each cause's own year-over-year comparison stays
 *  readable instead of a single chart with 5 causes x 3 years = 15 lines. */
function CauseYearChart({
  cause,
  data,
  years,
  className,
}: {
  cause: string;
  data: CumulativePoint[];
  years: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-1.5 rounded-lg border bg-muted p-3", className)}>
      <p className="shrink-0 truncate text-sm font-semibold text-foreground md:text-base" title={cause}>
        {cause}
      </p>
      {/* height="100%" here relies on the grid cell above having a
          definite height (see the gridTemplateRows fraction-rows on this
          chart's parent grid) so the chart actually fills the card instead
          of collapsing — same "make it look full" fix as Slide 2's
          calendar. Per explicit user feedback. */}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={140}>
          <LineChart data={data} margin={{ top: 14, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
            <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" allowDecimals={false} width={24} />
            <ChartTooltip contentStyle={{ fontSize: 11 }} />
            {years.map((y, i) => (
              <Line
                key={y}
                type="monotone"
                dataKey={y}
                name={y}
                stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
                label={{ position: "top", fontSize: 10, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function causeChartSpan(index: number, count: number): string {
  const remainder = count % 3;
  const inLastRow = index >= count - remainder;
  if (remainder === 2 && inLastRow) return "lg:col-span-3";
  if (remainder === 1 && inLastRow) return "lg:col-span-6";
  return "lg:col-span-2";
}

// Cause colors are assigned by POSITION in the shared top-5 list (not the
// year-comparison YEAR_COLORS palette, which means something different
// here) — every year's pie for the same category uses the same color for
// the same cause, so "Petir" reads as the same slice color across 2024,
// 2025 and 2026 at a glance. "Lainnya" (everything outside the top 5)
// always gets a neutral tone rather than competing for a chart color.
const CAUSE_PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const OTHER_CAUSE_COLOR = "var(--muted-foreground)";

function causeColorOf(topCauses: string[], cause: string): string {
  if (cause === "Lainnya") return OTHER_CAUSE_COLOR;
  const idx = topCauses.indexOf(cause);
  return idx >= 0 ? CAUSE_PIE_COLORS[idx % CAUSE_PIE_COLORS.length] : OTHER_CAUSE_COLOR;
}

/** One year's pie — "grafik pie persentase jumlah gangguan terbanyak tiap
 *  tahun" per the user's explicit request: which cause made up the biggest
 *  share of that year's disturbances, at a glance, alongside the line
 *  charts' own year-over-year trend view. */
function CauseShareYearPie({ share, topCauses }: { share: CauseShareYear; topCauses: string[] }) {
  if (share.total === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border bg-muted p-3 text-center">
        <p className="text-2xl font-bold text-foreground">{share.year}</p>
        <p className="text-base text-muted-foreground">Belum ada gangguan.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-lg border bg-muted p-3">
      <p className="shrink-0 text-center text-base font-semibold text-foreground">
        {share.year} <span className="font-normal text-muted-foreground">({share.total} gangguan)</span>
      </p>
      {/* Donut sized in % of its own box so it fills the card on a
          presentation screen; slice labels sit just outside the ring with
          enough margin to never touch the title or legend. The year's total
          sits in the hole. */}
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <PieChart margin={{ top: 22, right: 16, bottom: 22, left: 16 }}>
            <Pie
              data={share.slices}
              dataKey="count"
              nameKey="cause"
              innerRadius="52%"
              outerRadius="84%"
              paddingAngle={2}
              label={({ percent }) => ((percent ?? 0) >= 0.04 ? `${Math.round((percent ?? 0) * 100)}%` : "")}
              labelLine={false}
              fontSize={13}
              fontWeight={600}
            >
              {share.slices.map((s) => (
                <Cell key={s.cause} fill={causeColorOf(topCauses, s.cause)} />
              ))}
            </Pie>
            <ChartTooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="text-2xl font-extrabold tabular-nums text-foreground md:text-3xl">{share.total}</span>
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase md:text-xs">Gangguan</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 text-xs md:text-sm">
        {share.slices.map((s) => (
          <span key={s.cause} className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: causeColorOf(topCauses, s.cause) }} />
            {s.cause}
            <span className="font-semibold tabular-nums text-foreground">{Math.round((s.count / share.total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
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

function CombinedCalendarGrid({
  days,
  monthIndex0,
  year,
  className,
}: {
  days: CombinedCalendarDay[];
  monthIndex0: number;
  year: number;
  className?: string;
}) {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay(); // 0=Sun
  const leadingBlanks = (firstWeekday + 6) % 7; // shift to Monday-first
  const numRows = Math.ceil((leadingBlanks + days.length) / 7);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {DAY_LABELS.map((d) => (
          <div key={d} className="pb-0.5 text-xs font-semibold text-muted-foreground sm:text-sm">
            {d}
          </div>
        ))}
      </div>
      {/* Rows stretch evenly (minmax(0,1fr) each) to fill whatever height
          this grid is given, instead of a fixed per-cell height — a 4-row
          month fills the same space as a 6-row month rather than leaving
          empty space below it (and a 6-row month still never overflows,
          since every row shares the same bounded height). Per explicit user
          feedback: presentation-mode slides should look "full", not have a
          fixed-size grid floating in a mostly-empty slide. */}
      <div
        className="grid flex-1 grid-cols-7 gap-1.5"
        style={{ gridTemplateRows: `repeat(${numRows}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((d) => (
          <div
            key={d.date}
            className={cn(
              "flex h-full flex-col items-center justify-center gap-0.5 rounded-lg border p-1",
              d.total > 0 ? "border-critical/50 bg-critical/10" : "border-success/30 bg-success/5",
            )}
          >
            <span className={cn("text-sm font-bold tabular-nums sm:text-base", d.total > 0 ? "text-critical" : "text-foreground")}>
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

function hasPpt(e: { pptName: string | null; pptUrl: string | null }): boolean {
  return Boolean(e.pptName || e.pptUrl);
}

function PptStatusPill({
  event,
  large = false,
}: {
  event: { pptName: string | null; pptUrl: string | null };
  large?: boolean;
}) {
  const done = hasPpt(event);
  const className = cn(
    "inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap",
    large ? "px-4 py-1.5 text-base" : "px-2.5 py-1 text-xs",
    done ? "bg-success/15 text-success" : "bg-critical/15 text-critical",
  );
  const iconClass = large ? "size-4" : "size-3.5";
  const content = (
    <>
      {done ? <Check className={iconClass} aria-hidden /> : <X className={iconClass} aria-hidden />}
      {done ? "PPT Sudah" : "PPT Belum"}
    </>
  );
  if (done && event.pptUrl) {
    return (
      <a
        href={event.pptUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={event.pptName ?? "Buka laporan PPT"}
        className={cn(className, "hover:underline")}
      >
        {content}
      </a>
    );
  }
  return (
    <span className={className} title={done ? (event.pptName ?? undefined) : "Laporan PPT belum diunggah di kolom LINK PPT"}>
      {content}
    </span>
  );
}

/** "TOWER SUTT 150 KV KSNGN-PLSKS #167" -> "Tower KSNGN-PLSKS #167" — the
 *  "SUTT 150 KV" part is identical on every entry and only costs width on
 *  a slide; the full sheet text stays available as the hover title. */
function shortLocation(raw: string): string {
  return raw
    .split(/\s*,\s*/)
    .map((part) =>
      part
        .replace(/^TOWER\s+SUTT\s*\d+\s*KV\s*/i, "Tower ")
        .replace(/^SPAN\s+SUTT\s*\d+\s*KV\s*/i, "Span ")
        .replace(/\s+-\s+/g, "-"),
    )
    .join(", ");
}

function ResumeChip({
  children,
  className,
  style,
  large = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium whitespace-nowrap",
        large ? "px-3 py-1 text-base md:text-lg" : "px-2 py-0.5 text-xs md:px-2.5 md:text-sm",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

function resumeLabelClass(large: boolean): string {
  return cn(
    "font-bold tracking-wide text-muted-foreground uppercase",
    large ? "text-sm md:text-base" : "text-[11px] md:text-xs",
  );
}

/** Shows ALL of a long text inside whatever height its box has: starts at
 *  `max` px and steps the font down until nothing overflows (never below
 *  `min`; only past that does the box scroll). Re-fits when the box
 *  resizes — so a long "temuan" never gets cut off with "…" on a slide. */
function FitText({ text, min, max, className }: { text: string; min: number; max: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}px`;
      while (size > min && el.scrollHeight > el.clientHeight + 1) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, min, max]);
  return (
    <p ref={ref} className={cn("min-h-0 shrink overflow-hidden leading-snug whitespace-pre-line", className)} title={text}>
      {text}
    </p>
  );
}

function ResumeField({
  label,
  value,
  detail,
  large = false,
}: {
  label: string;
  value: string | null;
  detail?: string | null;
  large?: boolean;
}) {
  return (
    // With a detail text the field may be squeezed by a short card; FitText
    // then shrinks the detail's font so it still shows in full.
    <div className={cn("min-w-0", detail ? "flex min-h-0 flex-col" : "shrink-0")}>
      <p className={resumeLabelClass(large)}>{label}</p>
      <p
        className={cn(
          "shrink-0 leading-snug",
          large ? "line-clamp-3 text-xl md:text-2xl" : "line-clamp-2 text-sm md:text-base",
          value ? "font-medium text-foreground" : "text-muted-foreground/70 italic",
        )}
        title={value ?? undefined}
      >
        {value ?? "Belum diisi"}
      </p>
      {detail ? <FitText text={detail} min={large ? 14 : 10} max={large ? 20 : 15} className="mt-1 text-muted-foreground" /> : null}
    </div>
  );
}

/** `large` is used when a slide holds only one or two cards (e.g. a month
 *  with a single Trip): the card then fills most of the screen, so its text
 *  scales up to match instead of leaving small text in a huge empty box. */
function ResumeCard({ event, index, large = false }: { event: DisturbanceResumeEvent; index: number; large?: boolean }) {
  const kindColor = KIND_COLOR[event.kind] ?? "var(--muted-foreground)";
  const categoryColor = CATEGORY_COLOR[event.category] ?? "var(--muted-foreground)";
  const locators: { label: string; value: string | null }[] = [
    { label: "Vaisala", value: event.vaisala },
    { label: "SMDE/DE", value: event.smde },
    { label: "TWS", value: event.tws },
  ];
  return (
    // h-full + overflow-hidden: the card stretches to its grid cell (the
    // slide's rows split the full screen height evenly) and never spills
    // into the card below it.
    <article
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-background/60 break-inside-avoid",
        large ? "gap-5 p-6 md:p-8" : "gap-2.5 p-4 md:p-5",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div className={cn("flex min-w-0 items-start", large ? "gap-4" : "gap-3")}>
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-muted font-bold tabular-nums text-muted-foreground",
              large ? "size-10 text-base" : "size-7 text-xs md:size-8 md:text-sm",
            )}
          >
            {index}
          </span>
          <div className="min-w-0">
            <p className={cn("leading-snug font-bold text-foreground", large ? "text-2xl md:text-3xl" : "text-base md:text-lg")}>
              {event.bay}
            </p>
            <p className={cn("text-muted-foreground", large ? "line-clamp-2 text-base md:text-lg" : "truncate text-xs md:text-sm")}>
              {event.ultg}
              {event.gi ? ` · GI ${event.gi}` : ""}
            </p>
          </div>
        </div>
        <PptStatusPill event={event} large={large} />
      </header>

      <div className={cn("flex shrink-0 flex-wrap items-center", large ? "gap-2" : "gap-1.5")}>
        <ResumeChip large={large} className="font-semibold text-foreground">
          {event.date} · {event.tripTime ? `${event.tripTime} WIB` : "jam —"}
        </ResumeChip>
        <ResumeChip
          large={large}
          style={{ color: categoryColor, borderColor: `color-mix(in srgb, ${categoryColor} 45%, transparent)` }}
        >
          {event.category}
        </ResumeChip>
        <ResumeChip large={large} style={{ color: kindColor, borderColor: `color-mix(in srgb, ${kindColor} 45%, transparent)` }}>
          {event.kind === "AR Sukses" ? "Reclose Sukses" : event.kind}
        </ResumeChip>
        <ResumeChip large={large} className="text-foreground">
          {event.cause}
        </ResumeChip>
        {event.occurrencesInMonth > 1 ? (
          <ResumeChip large={large} className="border-warning/50 text-warning">
            Ke-{event.occurrence} dari {event.occurrencesInMonth} di ruas ini
          </ResumeChip>
        ) : null}
      </div>

      {/* Body sections share the card's remaining height evenly, so a tall
          card reads as spacious rather than half-empty. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col justify-around",
          large ? "gap-5" : "gap-3",
        )}
      >
        <ResumeField label="Indikasi" value={event.indikasi} large={large} />

        <div className={cn("grid shrink-0 grid-cols-3 rounded-lg bg-muted/50", large ? "gap-6 p-5" : "gap-3 p-2.5 md:p-3")}>
          {locators.map((l) => (
            <div key={l.label} className="min-w-0">
              <p className={resumeLabelClass(large)}>{l.label}</p>
              <p
                className={cn(
                  "leading-snug font-medium",
                  large ? "line-clamp-4 text-base md:text-lg" : "line-clamp-3 text-xs md:text-sm",
                  l.value ? "text-foreground" : "text-muted-foreground/70",
                )}
                title={l.value ?? undefined}
              >
                {l.value ? shortLocation(l.value) : "—"}
              </p>
            </div>
          ))}
        </div>

        <ResumeField
          label="Temuan Lapangan"
          value={event.temuanLapangan ? shortLocation(event.temuanLapangan) : null}
          detail={event.temuanDetail}
          large={large}
        />
      </div>
    </article>
  );
}

// Grid shape per screen: columns follow the grid's own breakpoints (3 from
// xl, 2 from md), rows = how many cards fit vertically at full text size (2
// on a 1080p-class screen, 1 on a 768px laptop). The rows then split the
// slide's full height evenly so the cards fill the whole screen; more
// events continue on the next slide instead of shrinking anything.
interface ResumeLayout {
  perSlide: number;
  cols: number;
  /** One row of cards on a tall-enough screen: each card is ~800px tall,
   *  so it uses the large text size instead of looking half empty. */
  roomy: boolean;
  /** null on phones: one column that simply scrolls. */
  rows: number | null;
}

const RESUME_LAYOUT_DEFAULT: ResumeLayout = { perSlide: 6, cols: 3, rows: 2, roomy: false };

function resumeLayoutFor(width: number, height: number): ResumeLayout {
  if (width < 768) return { perSlide: 3, cols: 1, rows: null, roomy: false };
  // 3 columns only from 1536px wide: on a 1366px laptop a third of the
  // width is too narrow for a long "temuan" to stay readable.
  const cols = width >= 1536 ? 3 : 2;
  // 2 rows only on tall screens (e.g. 1920x1200): at 1080px a half-height
  // card is too short to show a long "temuan" in full at a readable size.
  const rows = height >= 1150 ? 2 : 1;
  return { perSlide: cols * rows, cols, rows, roomy: rows === 1 && height >= 1000 };
}

function useResumeLayout(): ResumeLayout {
  const [layout, setLayout] = useState<ResumeLayout>(RESUME_LAYOUT_DEFAULT);
  useEffect(() => {
    const update = () => {
      const next = resumeLayoutFor(window.innerWidth, window.innerHeight);
      setLayout((prev) => (prev.perSlide === next.perSlide && prev.cols === next.cols && prev.rows === next.rows && prev.roomy === next.roomy
          ? prev
          : next));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return layout;
}

// Group pill color follows the same kind palette as everywhere else
// (Reclose = green, Trip = red).
const GROUP_KIND: Record<string, string> = { Reclose: "AR Sukses", Trip: "Trip", "Tidak Trip": "Tidak Trip" };

function PptCompletenessBar({ events, groupLabel }: { events: DisturbanceResumeEvent[]; groupLabel: string }) {
  const done = events.filter(hasPpt).length;
  const missing = events.filter((e) => !hasPpt(e));
  const pct = events.length > 0 ? Math.round((done / events.length) * 100) : 0;
  const groupColor = KIND_COLOR[GROUP_KIND[groupLabel] ?? ""] ?? "var(--muted-foreground)";
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2 text-sm">
      {groupLabel ? (
        <span
          className="rounded-md px-2.5 py-0.5 text-sm font-bold tracking-wide uppercase"
          style={{ color: groupColor, backgroundColor: `color-mix(in srgb, ${groupColor} 15%, transparent)` }}
        >
          {groupLabel} · {events.length} kejadian
        </span>
      ) : null}
      <span className="font-semibold text-foreground">
        Kelengkapan Laporan PPT:{" "}
        <span className={cn("tabular-nums", missing.length === 0 ? "text-success" : "text-critical")}>
          {done}/{events.length} kejadian ({pct}%)
        </span>
      </span>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", missing.length === 0 ? "bg-success" : "bg-critical")} style={{ width: `${pct}%` }} />
      </div>
      {missing.length > 0 ? (
        <span className="min-w-0 text-muted-foreground">
          Belum ada PPT: {missing.map((m) => `${m.bay} (${m.date})`).join(", ")}
        </span>
      ) : (
        <span className="text-success">Semua gangguan di kelompok ini sudah dilengkapi PPT.</span>
      )}
    </div>
  );
}

function ResumeSlide({
  all,
  page,
  layout,
  groupLabel,
}: {
  all: DisturbanceResumeEvent[];
  page: number;
  layout: ResumeLayout;
  groupLabel: string;
}) {
  if (all.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>;
  }
  const start = page * layout.perSlide;
  const shown = all.slice(start, start + layout.perSlide);
  // A group that fits on one slide (e.g. a single Trip) spreads its few
  // cards over the whole slide instead of sitting in one small corner
  // cell; multi-slide groups keep the standard grid so every card in the
  // run has the same size.
  let gridStyle: CSSProperties | undefined;
  const large = layout.roomy || (Boolean(layout.rows) && all.length <= layout.perSlide && shown.length <= 2);
  if (layout.rows) {
    const cols = all.length <= layout.perSlide ? Math.min(layout.cols, shown.length) : layout.cols;
    const rows = all.length <= layout.perSlide ? Math.ceil(shown.length / cols) : layout.rows;
    gridStyle = {
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    };
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PptCompletenessBar events={all} groupLabel={groupLabel} />
      <div
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        style={gridStyle}
      >
        {shown.map((e, i) => (
          <ResumeCard key={`${e.bay}-${e.dateISO}-${e.tripTime}-${i}`} event={e} index={start + i + 1} large={large} />
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

  // The month immediately before whichever one is selected above (not
  // necessarily "last calendar month" — the presenter can browse to any
  // past period, and the comparison should always be "vs the month right
  // before this one"). Handles the January -> December-of-prior-year
  // rollover, per the user's own request for a month-over-month AR/Trip
  // comparison on the ringkasan slide.
  const prevMonthIndex0 = monthIndex0 === 0 ? 11 : monthIndex0 - 1;
  const prevYear = monthIndex0 === 0 ? String(Number(year) - 1) : year;
  const prevMonthLabel = MONTH_ID[prevMonthIndex0];

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

  // Same per-category Trip/AR Sukses breakdown, read for the PREVIOUS month
  // instead — feeds the ringkasan slide's month-over-month comparison strip
  // (per the user's own request: AR/Trip Transmisi and Trip Trafo HV/LV,
  // bulan ini vs bulan lalu, naik/turun berapa dan berapa persen).
  const kindByCategoryPrev = useMemo(
    () =>
      categories.map((c) => ({
        label: c.label,
        kind: buildMonthlyBreakdown(c.data.monthlyByYearByKind, (k) => k.kind, prevMonthLabel, prevYear),
      })),
    [categories, prevMonthLabel, prevYear],
  );
  const kindCountForPrev = useCallback(
    (label: string, kind: string) =>
      kindByCategoryPrev.find((c) => c.label === label)?.kind.find((k) => k.label === kind)?.count ?? 0,
    [kindByCategoryPrev],
  );

  // The 4 metrics the user explicitly asked for — Transmisi's own Trip AND
  // AR Sukses (the only category with a reclose scheme), Trip only for
  // Trafo HV/LV (no AR scheme there) — plus "Seluruhnya", the sum of
  // exactly these 4, not every possible kind (e.g. "Tidak Trip" is
  // deliberately excluded, same framing the rest of this slide already
  // uses: Trip/AR are the meaningful incident counts, Tidak Trip is a
  // near-miss). previousValue === 0 with a positive current means the
  // percent change is mathematically undefined (not -100%, not +Infinity%
  // in any useful sense) — shown as "Baru" (new this month) rather than a
  // fabricated number; both-zero shows "Tetap" (no change, nothing to
  // compare).
  const monthComparison = useMemo(() => {
    const items = [
      { label: "Transmisi · Trip", current: kindCountFor("Transmisi", "Trip"), previous: kindCountForPrev("Transmisi", "Trip") },
      {
        label: "Transmisi · AR Sukses",
        current: kindCountFor("Transmisi", "AR Sukses"),
        previous: kindCountForPrev("Transmisi", "AR Sukses"),
      },
      { label: "Trafo HV · Trip", current: kindCountFor("Trafo HV", "Trip"), previous: kindCountForPrev("Trafo HV", "Trip") },
      { label: "Trafo LV · Trip", current: kindCountFor("Trafo LV", "Trip"), previous: kindCountForPrev("Trafo LV", "Trip") },
    ];
    const totalCurrent = items.reduce((s, i) => s + i.current, 0);
    const totalPrevious = items.reduce((s, i) => s + i.previous, 0);
    return {
      items,
      total: { label: "Seluruhnya", current: totalCurrent, previous: totalPrevious },
    };
  }, [kindCountFor, kindCountForPrev]);

  // Per-category cause breakdown for the SELECTED MONTH only (not an
  // all-time pareto) — e.g. "Transmisi: 3 gangguan — Petir (2), Hewan (1)" —
  // per the user's explicit request to show what each category's own
  // disturbances this month were actually caused by, on the ringkasan slide.
  const causeByCategory = useMemo(
    () =>
      categories.map((c) => ({
        label: c.label,
        causes: buildMonthlyBreakdown(c.data.monthlyByYearByCause, (cause) => cause.cause, monthLabel, year),
      })),
    [categories, monthLabel, year],
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
          const eventsByBay = buildBayEventDetailsForMonth(c.data.bayEvents, monthLabel, year);
          return {
            label: c.label,
            series: c.data.monthlyByYearByBay,
            ultgOf: (bay: string) => ultgByBay.get(bay) ?? "—",
            eventsOf: (bay: string) => eventsByBay.get(bay) ?? [],
          };
        }),
        monthLabel,
        year,
      ),
    [categories, monthLabel, year],
  );

  const resumeEvents = useMemo(
    () =>
      buildDisturbanceResumeEvents(
        categories.map((c) => ({ label: c.label, events: c.data.bayEvents })),
        monthLabel,
        year,
      ),
    [categories, monthLabel, year],
  );
  const resumeLayout = useResumeLayout();
  // Reclose and Trip are reviewed separately — reclose first, Trip grouped
  // on its own slide(s) at the end. Any other KODE GGN (Tidak Trip, or a
  // new value) gets its own group in between rather than being dropped.
  const resumeGroups = useMemo(() => {
    const groups: { key: string; label: string; events: DisturbanceResumeEvent[] }[] = [
      { key: "reclose", label: "Reclose", events: resumeEvents.filter((e) => e.kind === "AR Sukses") },
      { key: "tidak-trip", label: "Tidak Trip", events: resumeEvents.filter((e) => e.kind === "Tidak Trip") },
      {
        key: "lainnya",
        label: "Lainnya",
        events: resumeEvents.filter((e) => !["AR Sukses", "Tidak Trip", "Trip"].includes(e.kind)),
      },
      { key: "trip", label: "Trip", events: resumeEvents.filter((e) => e.kind === "Trip") },
    ];
    return groups.filter((g) => g.events.length > 0);
  }, [resumeEvents]);

  // Combined (all 3 categories) top-5 causes for the SELECTED MONTH — feeds
  // the new per-ULTG cause breakdown chart's fixed column set (anything
  // outside the top 5 folds into "Lainnya"), same pattern as the pie
  // charts' own topCauses usage.
  const topCausesThisMonth = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of causeByCategory) for (const cause of c.causes) counts.set(cause.label, (counts.get(cause.label) ?? 0) + cause.count);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cause]) => cause);
  }, [causeByCategory]);

  // Slide 3: per-ULTG breakdown by CAUSE and by JENIS GANGGUAN (Trip/Reclose
  // for Transmisi, Trip for Trafo HV+LV combined) — sits alongside the
  // existing per-ULTG-by-category chart, per the user's explicit request.
  const combinedUltgByCause = useMemo(
    () => buildCombinedUltgByCause([transmisi.bayEvents, trafoHv.bayEvents, trafoLv.bayEvents], monthLabel, year, topCausesThisMonth),
    [transmisi.bayEvents, trafoHv.bayEvents, trafoLv.bayEvents, monthLabel, year, topCausesThisMonth],
  );
  const combinedUltgByKind = useMemo(
    () => buildCombinedUltgByKind(transmisi.bayEvents, trafoHv.bayEvents, trafoLv.bayEvents, monthLabel, year),
    [transmisi.bayEvents, trafoHv.bayEvents, trafoLv.bayEvents, monthLabel, year],
  );

  // The selected year plus up to 2 preceding years actually present in the
  // data — feeds every "perbandingan tahun" chart below (slide 4's
  // Trip/AR/Trafo charts and slide 5/6's per-cause charts) with the same
  // consistent year set, per the user's explicit request to compare against
  // 2024 and 2025 (computed relative to the selected year rather than
  // hardcoded, so this still works correctly if the year filter changes).
  const compareYears = useMemo(() => comparisonYears(year, yearOptions), [year, yearOptions]);

  // Slide 4: Transmisi's Trip and AR Sukses kept as two SEPARATE
  // year-comparison charts (not one chart mixing both kinds together) per
  // the user's explicit request — each kind's own trend is clearer on its
  // own than sharing an axis with the other. A combined Trip+AR total chart
  // sits before both, per the user's explicit request ("tambahkan jumlah
  // total gangguan dulu trip dan ar") — deliberately Trip+AR only, not
  // every kind (excludes "Tidak Trip", which isn't part of what the user
  // asked this total to represent). Trafo's Trip is HV+LV combined into ONE
  // chart (also per the user's explicit request), since the two sides were
  // already being compared together before.
  // Truncates the SELECTED (year, month) — never the other compared years —
  // so a still-in-progress year's line visibly stops at the selected month
  // instead of drawing a flat continuation through months that haven't
  // happened yet. Per the user's explicit request.
  const truncateAtSelectedMonth = useMemo(() => ({ year, monthIndex0 }), [year, monthIndex0]);

  const cumulativeTransmisiTotalByYear = useMemo(() => {
    const trip = transmisi.monthlyByYearByKind.find((k) => k.kind === "Trip")?.data ?? [];
    const ar = transmisi.monthlyByYearByKind.find((k) => k.kind === "AR Sukses")?.data ?? [];
    return buildCumulativeByYear(sumMonthlyByYear(trip, ar), compareYears, truncateAtSelectedMonth);
  }, [transmisi.monthlyByYearByKind, compareYears, truncateAtSelectedMonth]);
  const cumulativeTransmisiTripByYear = useMemo(
    () =>
      buildCumulativeByYear(
        transmisi.monthlyByYearByKind.find((k) => k.kind === "Trip")?.data ?? [],
        compareYears,
        truncateAtSelectedMonth,
      ),
    [transmisi.monthlyByYearByKind, compareYears, truncateAtSelectedMonth],
  );
  const cumulativeTransmisiArByYear = useMemo(
    () =>
      buildCumulativeByYear(
        transmisi.monthlyByYearByKind.find((k) => k.kind === "AR Sukses")?.data ?? [],
        compareYears,
        truncateAtSelectedMonth,
      ),
    [transmisi.monthlyByYearByKind, compareYears, truncateAtSelectedMonth],
  );
  const cumulativeTrafoTripByYear = useMemo(() => {
    const hvTrip = trafoHv.monthlyByYearByKind.find((k) => k.kind === "Trip")?.data ?? [];
    const lvTrip = trafoLv.monthlyByYearByKind.find((k) => k.kind === "Trip")?.data ?? [];
    return buildCumulativeByYear(sumMonthlyByYear(hvTrip, lvTrip), compareYears, truncateAtSelectedMonth);
  }, [trafoHv.monthlyByYearByKind, trafoLv.monthlyByYearByKind, compareYears, truncateAtSelectedMonth]);

  // Transmisi, Trafo HV, and Trafo LV causes are kept as three SEPARATE
  // paretos/trends rather than one combined-across-everything chart — a
  // single top-5 across all 3 categories tends to conflate causes that are
  // only meaningful for one asset type (e.g. a lightning-strike cause
  // dominating Transmisi's own trend gets buried by a totally unrelated
  // Trafo cause, and vice versa), per explicit user feedback. Trafo HV and
  // LV used to be merged into one "Trafo" pareto/trend — now split apart
  // too, also per explicit user feedback ("pisahkan antara trafo hv dan lv").
  const transmisiCausePareto = useMemo(() => paretoFor([transmisi]), [transmisi]);
  const transmisiTopCauses = useMemo(() => transmisiCausePareto.slice(0, 5).map((c) => c.cause), [transmisiCausePareto]);

  const trafoHvCausePareto = useMemo(() => paretoFor([trafoHv]), [trafoHv]);
  const trafoHvTopCauses = useMemo(() => trafoHvCausePareto.slice(0, 5).map((c) => c.cause), [trafoHvCausePareto]);

  const trafoLvCausePareto = useMemo(() => paretoFor([trafoLv]), [trafoLv]);
  const trafoLvTopCauses = useMemo(() => trafoLvCausePareto.slice(0, 5).map((c) => c.cause), [trafoLvCausePareto]);

  // Slide 5/6/7: one small chart PER cause (not one chart with every cause
  // overlaid) — each showing that single cause's own cumulative trend
  // compared across compareYears, per the user's explicit request.
  const transmisiCauseYearCharts = useMemo(
    () =>
      transmisiTopCauses.map((cause) => ({
        cause,
        data: buildCumulativeByYear(
          transmisi.monthlyByYearByCause.find((c) => c.cause === cause)?.data ?? [],
          compareYears,
          truncateAtSelectedMonth,
        ),
      })),
    [transmisiTopCauses, transmisi.monthlyByYearByCause, compareYears, truncateAtSelectedMonth],
  );
  const trafoHvCauseYearCharts = useMemo(
    () =>
      trafoHvTopCauses.map((cause) => ({
        cause,
        data: buildCumulativeByYear(
          trafoHv.monthlyByYearByCause.find((c) => c.cause === cause)?.data ?? [],
          compareYears,
          truncateAtSelectedMonth,
        ),
      })),
    [trafoHvTopCauses, trafoHv.monthlyByYearByCause, compareYears, truncateAtSelectedMonth],
  );
  const trafoLvCauseYearCharts = useMemo(
    () =>
      trafoLvTopCauses.map((cause) => ({
        cause,
        data: buildCumulativeByYear(
          trafoLv.monthlyByYearByCause.find((c) => c.cause === cause)?.data ?? [],
          compareYears,
          truncateAtSelectedMonth,
        ),
      })),
    [trafoLvTopCauses, trafoLv.monthlyByYearByCause, compareYears, truncateAtSelectedMonth],
  );

  // Per-year pie data ("grafik pie persentase jumlah gangguan terbanyak
  // tiap tahun") — one pie per compared year, sharing the same top-5 cause
  // set as that category's own line charts above.
  const transmisiCauseShareByYear = useMemo(
    () => buildCauseShareByYear(transmisi.monthlyByYearByCause, transmisiTopCauses, compareYears),
    [transmisi.monthlyByYearByCause, transmisiTopCauses, compareYears],
  );
  const trafoHvCauseShareByYear = useMemo(
    () => buildCauseShareByYear(trafoHv.monthlyByYearByCause, trafoHvTopCauses, compareYears),
    [trafoHv.monthlyByYearByCause, trafoHvTopCauses, compareYears],
  );
  const trafoLvCauseShareByYear = useMemo(
    () => buildCauseShareByYear(trafoLv.monthlyByYearByCause, trafoLvTopCauses, compareYears),
    [trafoLv.monthlyByYearByCause, trafoLvTopCauses, compareYears],
  );

  const donutData = totalByCategory.filter((c) => c.total > 0).map((c) => ({ name: c.label, value: c.total }));

  const slides: SlideDef[] = useMemo(
    () => [
      {
        id: "ringkasan",
        title: "Ringkasan Total Gangguan",
        subtitle: `Periode ${monthLabel} ${year}`,
        render: () => {
          return (
            <div className="flex h-full flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-primary/40 bg-primary/5 p-6 text-center sm:col-span-1">
                  <div className="text-5xl font-bold tabular-nums text-primary">{grandTotal}</div>
                  <div className="text-sm font-medium text-muted-foreground">Total Gangguan</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:col-span-3 sm:grid-cols-3">
                  {totalByCategory.map((c) => (
                    <div key={c.label} className="rounded-lg border bg-muted p-4" style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLOR[c.label] }}>
                      <div className="text-2xl font-extrabold tabular-nums text-foreground">{c.total}</div>
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

              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Dibanding {prevMonthLabel} {prevYear}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {monthComparison.items.map((item) => (
                    <MonthComparisonTile key={item.label} label={item.label} current={item.current} previous={item.previous} />
                  ))}
                  <MonthComparisonTile
                    label={monthComparison.total.label}
                    current={monthComparison.total.current}
                    previous={monthComparison.total.previous}
                    emphasize
                  />
                </div>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
                {donutData.length > 0 ? (
                  // The donut scales with its cell (radii in %, container
                  // 100% tall) instead of a fixed 120px radius — on a
                  // fullscreen presentation it fills its half of the slide
                  // rather than floating small in the middle. The legend
                  // sits outside the chart so the center total stays at the
                  // donut's true center.
                  <div className="flex min-h-[200px] flex-col gap-2">
                    <div className="relative min-h-0 flex-1">
                      <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                        <PieChart margin={{ top: 20, right: 24, bottom: 20, left: 24 }}>
                          <Pie
                            data={donutData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="58%"
                            outerRadius="90%"
                            paddingAngle={2}
                            label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
                            fontSize={15}
                          >
                            {donutData.map((d) => (
                              <Cell key={d.name} fill={CATEGORY_COLOR[d.name]} />
                            ))}
                          </Pie>
                          <ChartTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center total — the donut's own radius leaves a big
                          empty hole in the middle; putting the grand total
                          there gives that space a job instead of wasting it. */}
                      <div className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                        <span className="text-4xl font-extrabold tabular-nums text-foreground md:text-6xl">{grandTotal}</span>
                        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase md:text-sm">Event</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
                      {donutData.map((d) => (
                        <span key={d.name} className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="size-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLOR[d.name] }} />
                          {d.name}
                          <span className="font-semibold tabular-nums text-foreground">{d.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada gangguan pada periode ini.</p>
                )}

                <div className="flex h-full flex-col gap-3">
                  <p className="text-base font-semibold text-foreground">Penyebab Gangguan — {monthLabel} {year}</p>
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                    {causeByCategory.map((c) => {
                      const total = totalByCategory.find((t) => t.label === c.label)?.total ?? 0;
                      const maxCount = c.causes[0]?.count ?? 0;
                      return (
                        <div
                          key={c.label}
                          className="flex h-full flex-col gap-2 rounded-lg border bg-muted p-4"
                          style={{ borderLeftWidth: 4, borderLeftColor: CATEGORY_COLOR[c.label] }}
                        >
                          <div className="flex shrink-0 items-baseline justify-between gap-2">
                            <span className="text-base font-bold text-foreground">{c.label}</span>
                            <span className="text-sm whitespace-nowrap text-muted-foreground">{total} gangguan</span>
                          </div>
                          {/* Vertically centered in the remaining space
                              instead of pinned to the top — a category with
                              only 1 cause used to leave a large empty gap
                              below a short list while sitting in the same
                              stretched-height grid cell as a 3-cause
                              category, per explicit user feedback ("tampak
                              memanjang"). Mini bars make the relative size
                              of each cause visible at a glance, not just its
                              number. */}
                          {c.causes.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center">
                              <p className="text-sm text-muted-foreground">Tidak ada gangguan bulan ini.</p>
                            </div>
                          ) : (
                            <ul className="flex flex-1 flex-col justify-center gap-2.5">
                              {c.causes.map((cause) => (
                                <li key={cause.label} className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between gap-2 text-sm">
                                    <span className="truncate text-foreground" title={cause.label}>
                                      {cause.label}
                                    </span>
                                    <span className="shrink-0 font-semibold tabular-nums text-foreground">{cause.count}</span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${maxCount > 0 ? Math.round((cause.count / maxCount) * 100) : 0}%`,
                                        backgroundColor: CATEGORY_COLOR[c.label],
                                      }}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
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
          <div className="flex h-full flex-col gap-4">
            <CombinedCalendarGrid
              className="min-h-0 flex-1"
              days={combinedCalendarDays}
              monthIndex0={monthIndex0}
              year={Number(year)}
            />
            <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6">
              <StatTile
                value={formatPercent(combinedCalendarSummary.percentWithoutDisturbance)}
                label={`Hari Tanpa Gangguan (${combinedCalendarSummary.daysWithoutDisturbance} hari)`}
                className="text-success"
              />
              <StatTile
                value={formatPercent(combinedCalendarSummary.percentWithDisturbance)}
                label={`Hari Dengan Gangguan (${combinedCalendarSummary.daysWithDisturbance} hari)`}
                className="text-critical"
              />
              <StatTile value={String(kindCountFor("Transmisi", "Trip"))} label="Transmisi · Trip" className="text-critical" />
              <StatTile value={String(kindCountFor("Transmisi", "AR Sukses"))} label="Transmisi · Reclose" className="text-success" />
              <StatTile value={String(totalByCategory.find((c) => c.label === "Trafo HV")?.total ?? 0)} label="Trafo HV" />
              <StatTile value={String(totalByCategory.find((c) => c.label === "Trafo LV")?.total ?? 0)} label="Trafo LV" />
            </div>
          </div>
        ),
      },
      {
        id: "ultg-ruas",
        title: "Kontribusi ULTG & Ruas",
        subtitle: `Transmisi + Trafo HV + Trafo LV — ${monthLabel} ${year}`,
        render: () => {
          const topUltgCount = combinedUltg[0]?.total ?? 0;
          const topUltgTied = topUltgCount > 0 ? combinedUltg.filter((u) => u.total === topUltgCount) : [];
          const topBayCount = combinedBay[0]?.count ?? 0;
          const topBayTied = topBayCount > 0 ? combinedBay.filter((b) => b.count === topBayCount) : [];
          return (
          <div className="flex h-full flex-col gap-4">
            <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile
                label={
                  topUltgTied.length === 0
                    ? "ULTG Terdampak Terbanyak"
                    : topUltgTied.length === 1
                      ? `ULTG Terdampak Terbanyak (${topUltgCount} kejadian)`
                      : `ULTG Terdampak Terbanyak — ${topUltgTied.length} ULTG seri (${topUltgCount} kejadian masing-masing)`
                }
                value={topUltgTied.length === 0 ? "—" : formatTiedNames(topUltgTied.map((u) => u.ultg))}
              />
              <InfoTile
                label={
                  topBayTied.length === 0
                    ? "Ruas Terdampak Terbanyak"
                    : topBayTied.length === 1
                      ? `Ruas Terdampak Terbanyak (${topBayCount} kejadian)`
                      : `Ruas Terdampak Terbanyak — ${topBayTied.length} ruas seri (${topBayCount} kejadian masing-masing)`
                }
                value={topBayTied.length === 0 ? "—" : formatTiedNames(topBayTied.map((b) => b.bay))}
              />
            </div>
            {combinedUltg.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada gangguan pada periode ini.</p>
            ) : (
              (() => {
                const causeKeys = [...topCausesThisMonth, "Lainnya"].filter((k) =>
                  combinedUltgByCause.some((r) => r[k] !== undefined),
                );
                const kindKeys = ["Transmisi Trip", "Transmisi Reclose", "Trafo Trip"].filter((k) =>
                  combinedUltgByKind.some((r) => r[k] !== undefined),
                );
                const KIND_SERIES_COLOR: Record<string, string> = {
                  "Transmisi Trip": KIND_COLOR.Trip,
                  "Transmisi Reclose": KIND_COLOR["AR Sukses"],
                  "Trafo Trip": CATEGORY_COLOR["Trafo HV"],
                };
                return (
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="flex min-h-0 flex-col gap-1.5">
                      <p className="shrink-0 text-sm font-semibold text-foreground">Per Kategori</p>
                      <div className="min-h-0 flex-1">
                        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                          <BarChart data={combinedUltg} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                            <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                            <YAxis type="category" dataKey="ultg" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" width={140} />
                            <ChartTooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="Transmisi" stackId="a" fill={CATEGORY_COLOR.Transmisi}>
                              <LabelList dataKey="Transmisi" position="inside" fontSize={11} fill="var(--card)" formatter={formatBarLabel} />
                            </Bar>
                            <Bar dataKey="Trafo HV" stackId="a" fill={CATEGORY_COLOR["Trafo HV"]}>
                              <LabelList dataKey="Trafo HV" position="inside" fontSize={11} fill="var(--card)" formatter={formatBarLabel} />
                            </Bar>
                            <Bar dataKey="Trafo LV" stackId="a" fill={CATEGORY_COLOR["Trafo LV"]} radius={[0, 4, 4, 0]}>
                              <LabelList dataKey="Trafo LV" position="inside" fontSize={11} fill="var(--card)" formatter={formatBarLabel} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* New: per-ULTG breakdown by CAUSE, sitting alongside
                        the category chart, per the user's explicit request. */}
                    <div className="flex min-h-0 flex-col gap-1.5">
                      <p className="shrink-0 text-sm font-semibold text-foreground">Per Penyebab</p>
                      <div className="min-h-0 flex-1">
                        {combinedUltgByCause.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Tidak ada data.</p>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                            <BarChart data={combinedUltgByCause} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                              <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                              <YAxis type="category" dataKey="ultg" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" width={140} />
                              <ChartTooltip />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              {causeKeys.map((key, i) => (
                                <Bar
                                  key={key}
                                  dataKey={key}
                                  stackId="a"
                                  fill={causeColorOf(topCausesThisMonth, key)}
                                  radius={i === causeKeys.length - 1 ? [0, 4, 4, 0] : undefined}
                                >
                                  <LabelList dataKey={key} position="inside" fontSize={11} fill="var(--card)" formatter={formatBarLabel} />
                                </Bar>
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* New: per-ULTG breakdown by JENIS GANGGUAN — Transmisi
                        Trip/Reclose split, Trafo HV+LV combined into one
                        Trip column, per the user's explicit request. */}
                    <div className="flex min-h-0 flex-col gap-1.5">
                      <p className="shrink-0 text-sm font-semibold text-foreground">Per Jenis Gangguan</p>
                      <div className="min-h-0 flex-1">
                        {combinedUltgByKind.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Tidak ada data.</p>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
                            <BarChart data={combinedUltgByKind} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                              <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                              <YAxis type="category" dataKey="ultg" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" width={140} />
                              <ChartTooltip />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              {kindKeys.map((key, i) => (
                                <Bar
                                  key={key}
                                  dataKey={key}
                                  stackId="a"
                                  fill={KIND_SERIES_COLOR[key] ?? "var(--muted-foreground)"}
                                  radius={i === kindKeys.length - 1 ? [0, 4, 4, 0] : undefined}
                                >
                                  <LabelList dataKey={key} position="inside" fontSize={11} fill="var(--card)" formatter={formatBarLabel} />
                                </Bar>
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
          );
        },
      },
      // Kontribusi Ruas as one resume card per disturbance (time, indikasi,
      // Vaisala/SMDE/TWS, temuan lapangan, PPT status) — moved off the chart
      // slide above onto its own slide(s), resumeLayout.perSlide cards each, so
      // nothing has to shrink or overlap however many events the month had.
      // One run of slides per group (Reclose, then Trip last).
      ...(resumeGroups.length === 0
        ? [
            {
              id: "ruas-resume-kosong",
              title: "Kontribusi Ruas — Resume Gangguan",
              subtitle: `${monthLabel} ${year}`,
              render: () => <ResumeSlide all={[]} page={0} layout={resumeLayout} groupLabel="" />,
            },
          ]
        : resumeGroups.flatMap((g) => {
            const pageCount = Math.ceil(g.events.length / resumeLayout.perSlide);
            return Array.from({ length: pageCount }, (_, page) => ({
              id: `ruas-resume-${g.key}-${page + 1}`,
              title: `Kontribusi Ruas — Resume Gangguan ${g.label}`,
              subtitle: `${monthLabel} ${year} · ${g.events.length} kejadian ${g.label.toLowerCase()} dari ${resumeEvents.length} total${
                pageCount > 1 ? ` · Halaman ${page + 1}/${pageCount}` : ""
              }`,
              render: () => <ResumeSlide all={g.events} page={page} layout={resumeLayout} groupLabel={g.label} />,
            }));
          })),
      {
        id: "kumulatif-transmisi-trafo",
        title: "Kumulatif Transmisi & Trafo",
        subtitle: `Perbandingan tahun ${compareYears.join("/")} — Transmisi Trip & AR dipisah, Trafo Trip HV+LV digabung`,
        render: () => (
          // 4 charts in one row, each stretching to fill the FULL slide
          // height (ResponsiveContainer height="100%" inside a min-h-0
          // flex-1 wrapper) instead of a small fixed pixel height — per
          // explicit user feedback that fixed-height charts left a large
          // empty area below them on a real presentation display. The
          // combined Trip+AR total sits first, per the user's explicit
          // ordering request.
          <div className="grid h-full grid-cols-1 gap-5 lg:grid-cols-4">
            <div className="flex min-h-0 flex-col gap-2">
              <p className="shrink-0 text-sm font-semibold text-foreground">Transmisi — Total Trip + AR (Perbandingan Tahun)</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                  <LineChart data={cumulativeTransmisiTotalByYear} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {compareYears.map((y, i) => (
                      <Line
                        key={y}
                        type="monotone"
                        dataKey={y}
                        name={y}
                        stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        label={{ position: "top", fontSize: 10, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <p className="shrink-0 text-sm font-semibold text-foreground">Transmisi — Trip (Perbandingan Tahun)</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                  <LineChart data={cumulativeTransmisiTripByYear} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {compareYears.map((y, i) => (
                      <Line
                        key={y}
                        type="monotone"
                        dataKey={y}
                        name={y}
                        stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        label={{ position: "top", fontSize: 10, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <p className="shrink-0 text-sm font-semibold text-foreground">Transmisi — AR Sukses (Perbandingan Tahun)</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                  <LineChart data={cumulativeTransmisiArByYear} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {compareYears.map((y, i) => (
                      <Line
                        key={y}
                        type="monotone"
                        dataKey={y}
                        name={y}
                        stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        label={{ position: "top", fontSize: 10, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2">
              <p className="shrink-0 text-sm font-semibold text-foreground">Trafo (HV + LV) — Trip (Perbandingan Tahun)</p>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%" minHeight={260}>
                  <LineChart data={cumulativeTrafoTripByYear} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" allowDecimals={false} />
                    <ChartTooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {compareYears.map((y, i) => (
                      <Line
                        key={y}
                        type="monotone"
                        dataKey={y}
                        name={y}
                        stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        label={{ position: "top", fontSize: 10, fill: YEAR_COLORS[i % YEAR_COLORS.length] }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ),
      },
      {
        // Split from a single "kumulatif-penyebab" slide into three — per
        // explicit user feedback: Transmisi's causes on their own slide,
        // Trafo HV and Trafo LV each on their own slide too (previously
        // merged into one "Trafo" set), since fitting everything on one or
        // two screens forced scrolling. Each slide also gets a per-year pie
        // ("grafik pie persentase jumlah gangguan terbanyak tiap tahun").
        id: "kumulatif-penyebab-transmisi",
        title: "Kumulatif Penyebab Gangguan — Transmisi",
        subtitle: `Top 5 penyebab — satu grafik per penyebab, perbandingan tahun ${compareYears.join("/")}`,
        render: () => (
          <div className="flex h-full flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Tahun:</span>
              {compareYears.map((y, i) => (
                <span key={y} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                  {y}
                </span>
              ))}
            </div>
            {transmisiCauseYearCharts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada penyebab tercatat.</p>
            ) : (
              <>
                {/* Row heights stretch evenly (minmax(0,1fr)) to fill the
                    slide instead of a fixed small chart height leaving empty
                    space below — same fix as Slide 2's calendar. Assumes the
                    lg:grid-cols-3 breakpoint (presentation mode is
                    effectively always a wide fullscreen viewport). */}
                <div
                  className="grid min-h-0 flex-[3] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:[grid-template-rows:var(--cause-rows)]"
                  style={{ "--cause-rows": `repeat(${Math.ceil(transmisiCauseYearCharts.length / 3)}, minmax(0, 1fr))` } as CSSProperties}
                >
                  {transmisiCauseYearCharts.map((c, i, all) => (
                    <CauseYearChart
                      key={c.cause}
                      cause={c.cause}
                      data={c.data}
                      years={compareYears}
                      className={causeChartSpan(i, all.length)}
                    />
                  ))}
                </div>
                <div className="flex min-h-0 flex-[3] flex-col gap-1.5">
                  <p className="shrink-0 text-sm font-semibold text-foreground">Distribusi Penyebab per Tahun</p>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                    {transmisiCauseShareByYear.map((share) => (
                      <CauseShareYearPie key={share.year} share={share} topCauses={transmisiTopCauses} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ),
      },
      {
        id: "kumulatif-penyebab-trafo-hv",
        title: "Kumulatif Penyebab Gangguan — Trafo HV",
        subtitle: `Top 5 penyebab — satu grafik per penyebab, perbandingan tahun ${compareYears.join("/")}`,
        render: () => (
          <div className="flex h-full flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Tahun:</span>
              {compareYears.map((y, i) => (
                <span key={y} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                  {y}
                </span>
              ))}
            </div>
            {trafoHvCauseYearCharts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada penyebab tercatat.</p>
            ) : (
              <>
                <div
                  className="grid min-h-0 flex-[3] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:[grid-template-rows:var(--cause-rows)]"
                  style={{ "--cause-rows": `repeat(${Math.ceil(trafoHvCauseYearCharts.length / 3)}, minmax(0, 1fr))` } as CSSProperties}
                >
                  {trafoHvCauseYearCharts.map((c, i, all) => (
                    <CauseYearChart
                      key={c.cause}
                      cause={c.cause}
                      data={c.data}
                      years={compareYears}
                      className={causeChartSpan(i, all.length)}
                    />
                  ))}
                </div>
                <div className="flex min-h-0 flex-[3] flex-col gap-1.5">
                  <p className="shrink-0 text-sm font-semibold text-foreground">Distribusi Penyebab per Tahun</p>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                    {trafoHvCauseShareByYear.map((share) => (
                      <CauseShareYearPie key={share.year} share={share} topCauses={trafoHvTopCauses} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ),
      },
      {
        id: "kumulatif-penyebab-trafo-lv",
        title: "Kumulatif Penyebab Gangguan — Trafo LV",
        subtitle: `Top 5 penyebab — satu grafik per penyebab, perbandingan tahun ${compareYears.join("/")}`,
        render: () => (
          <div className="flex h-full flex-col gap-3">
            <div className="flex shrink-0 flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Tahun:</span>
              {compareYears.map((y, i) => (
                <span key={y} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                  {y}
                </span>
              ))}
            </div>
            {trafoLvCauseYearCharts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada penyebab tercatat.</p>
            ) : (
              <>
                <div
                  className="grid min-h-0 flex-[3] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:[grid-template-rows:var(--cause-rows)]"
                  style={{ "--cause-rows": `repeat(${Math.ceil(trafoLvCauseYearCharts.length / 3)}, minmax(0, 1fr))` } as CSSProperties}
                >
                  {trafoLvCauseYearCharts.map((c, i, all) => (
                    <CauseYearChart
                      key={c.cause}
                      cause={c.cause}
                      data={c.data}
                      years={compareYears}
                      className={causeChartSpan(i, all.length)}
                    />
                  ))}
                </div>
                <div className="flex min-h-0 flex-[3] flex-col gap-1.5">
                  <p className="shrink-0 text-sm font-semibold text-foreground">Distribusi Penyebab per Tahun</p>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                    {trafoLvCauseShareByYear.map((share) => (
                      <CauseShareYearPie key={share.year} share={share} topCauses={trafoLvTopCauses} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ),
      },
    ],
    [
      monthLabel,
      year,
      monthIndex0,
      prevMonthLabel,
      prevYear,
      monthComparison,
      grandTotal,
      totalByCategory,
      kindCountFor,
      causeByCategory,
      donutData,
      combinedCalendarSummary,
      combinedCalendarDays,
      combinedUltg,
      combinedBay,
      resumeEvents,
      resumeGroups,
      resumeLayout,
      combinedUltgByCause,
      combinedUltgByKind,
      topCausesThisMonth,
      compareYears,
      cumulativeTransmisiTotalByYear,
      cumulativeTransmisiTripByYear,
      cumulativeTransmisiArByYear,
      cumulativeTrafoTripByYear,
      transmisiCauseYearCharts,
      trafoHvCauseYearCharts,
      trafoLvCauseYearCharts,
      transmisiCauseShareByYear,
      trafoHvCauseShareByYear,
      trafoLvCauseShareByYear,
      transmisiTopCauses,
      trafoHvTopCauses,
      trafoLvTopCauses,
    ],
  );

  const clampSlide = useCallback((i: number) => Math.min(Math.max(i, 0), slides.length - 1), [slides.length]);
  // The resume slides re-paginate when the window is resized, so the slide
  // count can shrink under an active index — always read through this.
  const currentSlide = clampSlide(activeSlide);

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
      if (e.key === "ArrowRight" || e.key === " ") setActiveSlide((i) => clampSlide(clampSlide(i) + 1));
      else if (e.key === "ArrowLeft") setActiveSlide((i) => clampSlide(clampSlide(i) - 1));
      else if (e.key === "Escape") exitPresentation();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, clampSlide, exitPresentation]);

  return (
    <div className="flex flex-col gap-5" data-print-slides>
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{slides[currentSlide].title}</h2>
              {slides[currentSlide].subtitle ? (
                <p className="text-base text-muted-foreground sm:text-lg">{slides[currentSlide].subtitle}</p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">{slides[currentSlide].render()}</div>
          </div>

          <div className="mx-auto mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSlide((i) => clampSlide(clampSlide(i) - 1))}
              disabled={activeSlide === 0}
              className="flex size-10 items-center justify-center rounded-full border bg-card text-foreground disabled:opacity-30"
              aria-label="Slide sebelumnya"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
              {currentSlide + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => setActiveSlide((i) => clampSlide(clampSlide(i) + 1))}
              disabled={currentSlide === slides.length - 1}
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
