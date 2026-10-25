"use client";

// Per-ruas "report card" (feature #1) — picks one SUTT ruas and shows its
// AHI/CE/gangguan/ABO summary alongside the nearest RENUS outage at either
// endpoint GI, with a data-driven readiness checklist for what to handle
// once that outage happens. Matches the dashboard's own reference design
// (a single-ruas "visualize" panel): countdown + timeline + checklist next
// to the condition summary, not two separate pages.
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Gauge,
  ListChecks,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RuasInfographicSummary } from "@/lib/ruas-infographic";
import type { AhiKlasifikasi } from "@/types";

const ALL = "__all__";

function klasifikasiClass(k: AhiKlasifikasi): string {
  if (k === "CRITICAL") return "border-critical/40 bg-critical/20 text-critical";
  if (k === "POOR") return "border-warning/50 bg-warning/20 text-warning-foreground";
  if (k === "FAIR") return "border-border bg-muted text-muted-foreground";
  if (k === "GOOD" || k === "BEST") return "border-success/40 bg-success/20 text-success";
  return "border-border text-muted-foreground";
}

function KlasifikasiPill({ value }: { value: AhiKlasifikasi }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap", klasifikasiClass(value))}>
      {value}
    </span>
  );
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function formatShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

function StatTile({
  icon: Icon,
  label,
  value,
  valueClassName,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={cn("text-xl font-extrabold tabular-nums", valueClassName ?? "text-foreground")}>{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function RuasInfografisClient({ summaries }: { summaries: RuasInfographicSummary[] }) {
  const units = useMemo(() => [...new Set(summaries.map((s) => s.unit))].sort(), [summaries]);
  const [unit, setUnit] = useState(ALL);
  const ruasOptions = useMemo(
    () => summaries.filter((s) => unit === ALL || s.unit === unit).sort((a, b) => a.section.localeCompare(b.section)),
    [summaries, unit],
  );
  const [section, setSection] = useState(summaries[0]?.section ?? "");

  const selected = summaries.find((s) => s.section === section) ?? ruasOptions[0] ?? null;

  function onUnitChange(v: string) {
    setUnit(v);
    const firstInUnit = summaries.find((s) => v === ALL || s.unit === v);
    if (firstInUnit) setSection(firstInUnit.section);
  }

  if (!selected) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data ruas.</p>;
  }

  const hasAnyIssue = selected.ceOpenCount > 0 || selected.aboOpenCount > 0 || (selected.ahiWorstKlasifikasi && ["POOR", "CRITICAL"].includes(selected.ahiWorstKlasifikasi));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={unit} onValueChange={(v) => v && onUnitChange(v)}>
          <SelectTrigger size="sm" className="w-[200px]">
            <SelectValue placeholder="ULTG">{unit === ALL ? "Semua ULTG" : unit}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua ULTG</SelectItem>
            {units.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selected.section} onValueChange={(v) => v && setSection(v)}>
          <SelectTrigger size="sm" className="w-[280px]">
            <SelectValue placeholder="Ruas">{selected.section}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="!w-[min(92vw,480px)]">
            {ruasOptions.map((s) => (
              <SelectItem key={s.section} value={s.section}>
                {s.section}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-xl font-extrabold">
                {selected.originGi} <span className="text-muted-foreground">→</span> {selected.farEndGi}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {selected.unit} · {selected.lengthKm.toLocaleString("id-ID", { maximumFractionDigits: 2 })} km ·{" "}
                {selected.towerCount} tower
              </p>
            </div>
            {!hasAnyIssue ? (
              <span className="flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-bold text-success">
                <CheckCircle2 className="size-3.5" /> Kondisi Baik
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/10 px-3 py-1 text-xs font-bold text-warning-foreground">
                <AlertTriangle className="size-3.5" /> Perlu Perhatian
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              icon={Activity}
              label="AHI"
              value={selected.ahiWorstKlasifikasi ?? "—"}
              valueClassName={selected.ahiWorstKlasifikasi ? klasifikasiClass(selected.ahiWorstKlasifikasi).split(" ").find((c) => c.startsWith("text-")) : undefined}
              sub={`${selected.ahiAnomalies.length} temuan`}
            />
            <StatTile
              icon={Gauge}
              label="CE"
              value={`${selected.ceOpenCount}`}
              valueClassName={selected.ceOpenCount > 0 ? "text-critical" : undefined}
              sub={`dari ${selected.ceItems.length} temuan OPEN`}
            />
            <StatTile
              icon={Zap}
              label="Gangguan"
              value={`${selected.gangguanTotal}`}
              sub="riwayat tercatat"
            />
            <StatTile
              icon={ClipboardList}
              label="ABO"
              value={`${selected.aboOpenCount}`}
              valueClassName={selected.aboOpenCount > 0 ? "text-warning-foreground" : undefined}
              sub={`dari ${selected.aboItems.length} item belum selesai`}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
              <CalendarClock className="size-4.5 text-primary" />
              Sinkronisasi Jadwal Padam
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {selected.nextOutage ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-2xl font-extrabold tabular-nums text-primary">
                  {selected.daysUntilNextOutage !== null && selected.daysUntilNextOutage >= 0
                    ? `${selected.daysUntilNextOutage} hari lagi`
                    : "Terlambat"}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{selected.nextOutage.workDetail}</p>
                <p className="text-xs text-muted-foreground">
                  {formatShort(selected.nextOutage.rencanaDate)} · GI {selected.nextOutage.gi} · {selected.nextOutage.bay}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Tidak ada jadwal padam mendatang di GI terkait ruas ini.</p>
            )}

            {selected.outageRows.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {selected.outageRows.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-b pb-1.5 text-xs last:border-0">
                    <span className="truncate text-foreground" title={r.workDetail}>
                      {r.workDetail}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatShort(r.rencanaDate)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
              <ListChecks className="size-4.5 text-primary" />
              Checklist Kesiapan Saat Padam
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selected.readinessChecklist.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="size-4 shrink-0" /> Tidak ada catatan khusus berdasarkan data yang ada.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {selected.readinessChecklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {selected.ahiAnomalies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Temuan AHI</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {selected.ahiAnomalies.slice(0, 8).map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{a.bay}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.keterangan || a.parameterPemicuAhi}</p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    Kategori {a.kategoriAhi}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {selected.ceItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Temuan Common Enemy</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {selected.ceItems.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.namaProgram || item.anomaliPemicu}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.kriteriaBefore || "—"} → {item.kriteriaAfter || "—"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold",
                      item.done ? "border-success/40 bg-success/10 text-success" : "border-critical/40 bg-critical/10 text-critical",
                    )}
                  >
                    {item.done ? "CLOSE" : "OPEN"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {selected.gangguanRecent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Riwayat Gangguan Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {selected.gangguanRecent.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <span className="text-foreground">{e.penyebab || "Penyebab tidak tercatat"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.tgl}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {selected.aboItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Item Program ABO</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {selected.aboItems.slice(0, 8).map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <span className="truncate text-foreground" title={item.asset}>
                    {item.asset}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold",
                      item.done ? "border-success/40 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {item.done ? "Selesai" : "Belum"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
