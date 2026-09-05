"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  XCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { isRenusCancelled, isRenusDone, isRenusHighRisk } from "@/lib/renus-helpers";
import { RenusWorkTable } from "./renus-work-table";
import type { RenusData, RenusRow } from "@/types";

const ALL = "__all__";
const BLANK = "__blank__";
const HIGH_RISK_ANY = "high-risk-any";

type ViewScope = "all" | "week" | "month" | "overdue" | "today";
const VIEW_LABEL: Record<ViewScope, string> = {
  all: "Semua",
  week: "Minggu Ini (Jumat–Kamis)",
  month: "Bulan Depan",
  overdue: "Overdue",
  today: "Hari Ini",
};

function StatTile({ value, label, className }: { value: string; label: string; className?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-xl font-semibold tabular-nums ${className ?? "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  options,
  includeBlank,
  width = "w-[160px]",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  allLabel: string;
  options: string[];
  includeBlank?: boolean;
  width?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size="sm" className={width}>
        <SelectValue placeholder={placeholder}>
          {value === ALL ? allLabel : value === BLANK ? "Belum Diisi" : value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
        {includeBlank ? <SelectItem value={BLANK}>Belum Diisi</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}

export function RenusClient({ data }: { data: RenusData }) {
  const searchParams = useSearchParams();
  const initial = (key: string) => searchParams.get(key) ?? ALL;
  const rawView = searchParams.get("view");
  const initialView: ViewScope =
    rawView === "week" || rawView === "month" || rawView === "overdue" || rawView === "today" ? rawView : "all";

  const [view, setView] = useState<ViewScope>(initialView);
  const [year, setYear] = useState(initial("year"));
  const [month, setMonth] = useState(initial("month"));
  const [ultg, setUltg] = useState(initial("ultg"));
  const [gi, setGi] = useState(initial("gi"));
  const [bay, setBay] = useState(initial("bay"));
  const [status, setStatus] = useState(initial("status"));
  const [risk, setRisk] = useState(() => {
    const r = searchParams.get("risk");
    return r === "high-risk-any" ? HIGH_RISK_ANY : (r ?? ALL);
  });

  const isActiveRow = (r: RenusRow) => !isRenusCancelled(r);

  const weekRows = useMemo(
    () => data.rows.filter((r) => r.rencanaDate >= data.weekPeriod.start && r.rencanaDate <= data.weekPeriod.end),
    [data],
  );
  const overdueRows = useMemo(
    () => data.rows.filter((r) => isActiveRow(r) && !isRenusDone(r) && r.rencanaDate < data.today),
    [data],
  );
  const todayRows = useMemo(() => data.rows.filter((r) => r.rencanaDate === data.today), [data]);

  const scoped = useMemo(() => {
    switch (view) {
      case "week":
        return weekRows;
      case "month":
        return data.nextMonth.rows;
      case "overdue":
        return overdueRows;
      case "today":
        return todayRows;
      default:
        return data.rows;
    }
  }, [view, data, weekRows, overdueRows, todayRows]);

  const filtered = useMemo(
    () =>
      scoped.filter(
        (r) =>
          (year === ALL || r.year === year) &&
          (month === ALL || r.month === month) &&
          (ultg === ALL || r.ultg === ultg) &&
          (gi === ALL || r.gi === gi) &&
          (bay === ALL || r.bay === bay) &&
          (status === ALL || (status === BLANK ? r.status === "" : r.status === status)) &&
          (risk === ALL ||
            (risk === HIGH_RISK_ANY ? isRenusHighRisk(r) : risk === BLANK ? r.risk === "" : r.risk === risk)),
      ),
    [scoped, year, month, ultg, gi, bay, status, risk],
  );

  const hasActiveFilter =
    view !== "all" || [year, month, ultg, gi, bay, status, risk].some((v) => v !== ALL);

  function clearFilters() {
    setView("all");
    setYear(ALL);
    setMonth(ALL);
    setUltg(ALL);
    setGi(ALL);
    setBay(ALL);
    setStatus(ALL);
    setRisk(ALL);
  }

  const activeLabels: string[] = [];
  if (view !== "all") activeLabels.push(VIEW_LABEL[view]);
  if (year !== ALL) activeLabels.push(`Tahun: ${year}`);
  if (month !== ALL) activeLabels.push(`Bulan: ${month}`);
  if (ultg !== ALL) activeLabels.push(ultg);
  if (gi !== ALL) activeLabels.push(gi);
  if (bay !== ALL) activeLabels.push(bay);
  if (status !== ALL) activeLabels.push(`Status: ${status === BLANK ? "Belum Diisi" : status}`);
  if (risk !== ALL) activeLabels.push(`Risiko: ${risk === HIGH_RISK_ANY ? "Tinggi (High/Extreme)" : risk === BLANK ? "Belum Diisi" : risk}`);

  const highRiskThisWeek = weekRows.filter((r) => isRenusHighRisk(r)).length;
  const closedThisWeek = weekRows.filter((r) => isRenusDone(r)).length;
  const overdueInWeek = weekRows.filter((r) => overdueRows.includes(r)).length;

  return (
    <div className="flex flex-col gap-6">
      {data.reminders.length > 0 ? (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-4">
            <AiInsightList data={data.reminders} title="Perhatian Minggu Ini" icon={Bell} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={data.summary.total.toLocaleString("id-ID")} label="Total Pekerjaan" />
        <StatTile value={data.summary.thisWeek.toLocaleString("id-ID")} label="Minggu Ini" />
        <StatTile value={data.summary.highRisk.toLocaleString("id-ID")} label="High Risk" className="text-critical" />
        <StatTile value={data.summary.upcoming.toLocaleString("id-ID")} label="Upcoming" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <CalendarClock className="size-4 text-primary" />
              Rencana Pemeliharaan Bulan Depan
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {data.nextMonth.monthLabel} {data.nextMonth.year} — {data.nextMonth.rows.length} pekerjaan direncanakan.
            </p>
          </CardHeader>
          <CardContent>
            {data.nextMonth.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada pekerjaan yang direncanakan bulan depan.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.nextMonth.rows.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={r.workDetail}>
                        {r.workDetail}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.ultg} · {r.gi} · {r.bay}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatShort(r.rencanaDate)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.nextMonth.rows.length > 0 ? (
              <button type="button" onClick={() => setView("month")} className="mt-3 text-xs font-medium text-primary hover:underline">
                Lihat semua {data.nextMonth.rows.length} pekerjaan bulan depan →
              </button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <CalendarDays className="size-4 text-primary" />
              Periode Kerja Minggu Ini
            </CardTitle>
            <p className="text-xs text-muted-foreground">Jumat–Kamis · {data.weekPeriod.label}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {weekRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada pekerjaan pada periode ini.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="flex items-center gap-1.5 rounded-lg border p-2 text-critical">
                  <XCircle className="size-3.5 shrink-0" /> {overdueInWeek} Overdue
                </span>
                <span className="flex items-center gap-1.5 rounded-lg border p-2 text-warning-foreground">
                  <AlertTriangle className="size-3.5 shrink-0" /> {highRiskThisWeek} High Risk
                </span>
                <span className="flex items-center gap-1.5 rounded-lg border p-2 text-success">
                  <CheckCircle2 className="size-3.5 shrink-0" /> {closedThisWeek} Selesai
                </span>
                <span className="flex items-center gap-1.5 rounded-lg border p-2 text-muted-foreground">
                  <CircleDashed className="size-3.5 shrink-0" /> {weekRows.length} Total
                </span>
              </div>
            )}
            <button type="button" onClick={() => setView("week")} className="text-xs font-medium text-primary hover:underline">
              Lihat semua {weekRows.length} pekerjaan minggu ini →
            </button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Daftar Pekerjaan</CardTitle>
            <p className="text-xs text-muted-foreground">{filtered.length} dari {data.rows.length} pekerjaan ditampilkan.</p>
          </div>
          <ExportExcelButton
            filename="RENUS-UPT-Palangkaraya.xlsx"
            sheets={[
              {
                name: "RENUS",
                rows: filtered.map((r) => ({
                  Tanggal: r.rencanaDate,
                  ULTG: r.ultg,
                  GI: r.gi,
                  Bay: r.bay,
                  "Detail Pekerjaan": r.workDetail,
                  Status: r.status || "Belum Diisi",
                  Risiko: r.risk || "Belum Diisi",
                  PIC: r.pic ?? "",
                  Realisasi: r.realisasiDate ?? "",
                })),
              },
            ]}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={view} onValueChange={(v) => v && setView(v as ViewScope)}>
              <SelectTrigger size="sm" className="w-[220px]">
                <SelectValue placeholder="Periode">{VIEW_LABEL[view]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VIEW_LABEL) as ViewScope[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {VIEW_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data.years.length > 1 ? (
              <FilterSelect value={year} onChange={setYear} placeholder="Tahun" allLabel="Semua Tahun" options={data.years} width="w-[110px]" />
            ) : null}
            <FilterSelect value={month} onChange={setMonth} placeholder="Bulan" allLabel="Semua Bulan" options={data.months} width="w-[150px]" />
            <FilterSelect value={ultg} onChange={setUltg} placeholder="ULTG" allLabel="Semua ULTG" options={data.ultgs} width="w-[190px]" />
            <FilterSelect value={gi} onChange={setGi} placeholder="GI" allLabel="Semua GI" options={data.gis} width="w-[190px]" />
            <FilterSelect value={bay} onChange={setBay} placeholder="Bay" allLabel="Semua Bay" options={data.bays} width="w-[190px]" />
            <FilterSelect value={status} onChange={setStatus} placeholder="Status" allLabel="Semua Status" options={data.statuses} includeBlank width="w-[150px]" />
            <Select value={risk} onValueChange={(v) => v && setRisk(v)}>
              <SelectTrigger size="sm" className="w-[190px]">
                <SelectValue placeholder="Risiko">
                  {risk === ALL ? "Semua Risiko" : risk === HIGH_RISK_ANY ? "Berisiko Tinggi" : risk === BLANK ? "Belum Diisi" : risk}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua Risiko</SelectItem>
                <SelectItem value={HIGH_RISK_ANY}>Berisiko Tinggi (High/Extreme)</SelectItem>
                {data.risks.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
                <SelectItem value={BLANK}>Belum Diisi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilter ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Filter Aktif:</span>
              {activeLabels.map((label) => (
                <span key={label} className="rounded-full border bg-muted/40 px-2.5 py-1 font-medium text-foreground">
                  {label}
                </span>
              ))}
              <button type="button" onClick={clearFilters} className="font-medium text-primary hover:underline">
                Clear Filter
              </button>
            </div>
          ) : null}

          <RenusWorkTable rows={filtered} />
        </CardContent>
      </Card>
    </div>
  );
}
