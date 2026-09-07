"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Printer } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EquipmentTrendChart } from "@/components/ahi/equipment-trend-chart";
import { cn } from "@/lib/utils";
import type { AhiKlasifikasi, BayEquipmentUnit, BayLineReport, EquipmentParameterHistoryPoint } from "@/types";

const ALL_VALUE = "__all__";

// One accent color per section — same purpose as Gangguan's sticky category
// banners (src/app/dashboard/disturbances/page.tsx): scrolling through 5-7
// equipment cards for one bay no longer loses track of which one is in
// view. Cycled by role order rather than a fixed per-role map, so a role
// this bay doesn't have never wastes a slot.
const SECTION_COLORS = [
  "var(--chart-1)",
  "var(--brand)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--chart-2)",
];

function klasifikasiClass(k: AhiKlasifikasi): string {
  if (k === "CRITICAL") return "border-critical/40 bg-critical/10 text-critical";
  if (k === "POOR") return "border-warning/40 bg-warning/15 text-warning-foreground";
  if (k === "FAIR") return "border-border bg-muted text-muted-foreground";
  if (k === "GOOD" || k === "BEST") return "border-success/40 bg-success/10 text-success";
  return "border-border text-muted-foreground"; // NO DATA
}

function KlasifikasiPill({ value }: { value: AhiKlasifikasi }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", klasifikasiClass(value))}>
      {value}
    </span>
  );
}

function FlagPill({ active, label, tone }: { active: boolean; label: string; tone: "warning" | "critical" }) {
  if (!active) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = tone === "critical" ? "border-critical/40 bg-critical/10 text-critical" : "border-warning/40 bg-warning/15 text-warning-foreground";
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>✔️ {label}</span>;
}

function formatValue(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return String(v);
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function unitAnchorId(idx: number): string {
  return `bay-unit-${idx}`;
}

function jumpToUnit(idx: number) {
  document.getElementById(unitAnchorId(idx))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Standalone summary card — Kualitas Data % and Skor AHI per equipment,
 *  mirroring the sheet's own bottom summary block, kept separate from the
 *  Resume table below (which is about what needs testing, not data quality). */
function QualityScoreCard({ units }: { units: BayEquipmentUnit[] }) {
  return (
    <Card className="print:break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Kualitas Data &amp; Skor AHI</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {units.map((unit, idx) => (
            <div key={`${unit.role}-${idx}`} className="rounded-lg border p-3">
              <p className="truncate text-xs text-muted-foreground" title={unit.role}>
                {unit.role}
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatPercent(unit.kualitasData)}
                </span>
                <span className="text-xs text-muted-foreground">Kualitas Data</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums text-foreground">{unit.skorAhi ?? "—"}</span>
                <KlasifikasiPill value={unit.klasifikasi} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** One equipment's group of rows inside the Resume table. The summary row
 *  (klasifikasi + Mandatory/Pengujian Ulang counts for the whole unit) is
 *  always visible — that's the thing you actually need at a glance; the
 *  item-pengujian breakdown underneath (which specific parameter) is
 *  collapsed by default since it can run long across 5-7 pieces of
 *  equipment, same show/hide pattern as the raw Hasil Uji rows below.
 *  Item rows stay in the DOM even while collapsed (hidden via a class, not
 *  unmounted) so print output can force them back on regardless of the
 *  on-screen toggle state — see the print:table-row override. */
function ResumeUnitGroup({ unit, idx }: { unit: BayEquipmentUnit; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  const mandatoryCount = unit.parameters.filter((p) => p.mandatoryPengujian).length;
  const retestCount = unit.parameters.filter((p) => p.pengujianUlang).length;
  return (
    <>
      <tr
        className="cursor-pointer border-b bg-muted/20 hover:bg-muted/30 print:cursor-auto"
        onClick={() => jumpToUnit(idx)}
      >
        <td className="px-3 py-2 text-xs font-bold tracking-tight text-foreground">
          <div className="flex items-center gap-2">
            {unit.role}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground hover:bg-muted/50 print:hidden"
            >
              <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Sembunyikan item" : "Tampilkan item"}
            </button>
          </div>
        </td>
        <td className="px-3 py-2">
          <KlasifikasiPill value={unit.klasifikasi} />
        </td>
        <td className="px-3 py-2">
          {mandatoryCount > 0 ? (
            <FlagPill active label={`${mandatoryCount} parameter`} tone="warning" />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {retestCount > 0 ? (
            <FlagPill active label={`${retestCount} parameter`} tone="critical" />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {unit.parameters.map((p) => (
        <tr
          key={p.label}
          onClick={() => jumpToUnit(idx)}
          className={cn(
            "cursor-pointer border-b last:border-0 hover:bg-muted/10 print:cursor-auto",
            !expanded && "hidden print:table-row",
          )}
        >
          <td className="px-3 py-2 pl-6 text-muted-foreground">{p.label}</td>
          <td className="px-3 py-2">
            <KlasifikasiPill value={p.klasifikasi} />
          </td>
          <td className="px-3 py-2">
            <FlagPill active={p.mandatoryPengujian} label="Mandatory" tone="warning" />
          </td>
          <td className="px-3 py-2">
            <FlagPill active={p.pengujianUlang} label="Ulang" tone="critical" />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Resume: for every equipment unit, every item pengujian (parameter) — so
 *  which specific parameters need Mandatory Pengujian / Pengujian Ulang is
 *  visible in one place, without scrolling through each equipment's own
 *  detail card below. Clicking any row jumps to that equipment's own detail
 *  section further down the page. */
function ResumeTable({ units }: { units: BayEquipmentUnit[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:break-inside-avoid">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Peralatan / Item Pengujian</th>
            <th className="px-3 py-2 font-medium">Klasifikasi</th>
            <th className="px-3 py-2 font-medium">Mandatory Pengujian</th>
            <th className="px-3 py-2 font-medium">Pengujian Ulang</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit, idx) => (
            <ResumeUnitGroup key={`${unit.role}-${idx}`} unit={unit} idx={idx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionBanner({ id, role, accent }: { id: string; role: string; accent: string }) {
  return (
    // -mx-4/px-4 must match CardContent's own --card-spacing (always 1rem,
    // there's no md:6 step inside a Card) — using Gangguan's md:-mx-6 here
    // overshot the Card's edge once its ancestor Card went overflow-visible,
    // which is what made the banner look detached ("mengambang") at desktop
    // widths instead of flush with the card it belongs to.
    // top-0 + z-20 (above SiteHeader's z-10): once scrolled past, the section
    // banner takes over the very top of the viewport instead of parking
    // below a persistent header — maximizes vertical space for the table
    // content below, per explicit request to prioritize that over keeping
    // the search/nav header visible during a deep scroll.
    <div
      id={id}
      className="sticky top-0 z-20 -mx-4 -mb-2 scroll-mt-4 border-y bg-card px-4 py-2 print:static print:border-0 print:bg-transparent print:px-0 print:py-1"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full print:hidden" style={{ backgroundColor: accent }} />
        <h3 className="text-base font-bold tracking-tight text-foreground">{role}</h3>
      </div>
    </div>
  );
}

const OVERALL_VALUE = "__overall__";

function unitKey(unit: BayEquipmentUnit): string {
  return `${unit.role}-${unit.techident ?? unit.nomorSeri}`;
}

/** One consolidated Riwayat Pengujian block for the whole bay, placed at the
 *  very bottom of the report rather than repeated inside every equipment
 *  card — with 5-7 pieces of equipment each getting their own trend section
 *  the page piled up fast, so this replaces all of them with one section
 *  that filters by BOTH equipment and item pengujian (Skor AHI Keseluruhan
 *  or one specific parameter, which also switches the raw-readings table
 *  below the chart to that parameter's history). */
function BayHistorySection({ units }: { units: BayEquipmentUnit[] }) {
  const [selectedUnitKey, setSelectedUnitKey] = useState(() => unitKey(units[0]));
  const [selectedParam, setSelectedParam] = useState<string>(OVERALL_VALUE);

  const unit = units.find((u) => unitKey(u) === selectedUnitKey) ?? units[0];
  const param = selectedParam === OVERALL_VALUE ? null : unit.parameters.find((p) => p.label === selectedParam);
  const history = param ? param.history : unit.history;

  return (
    <Card className="print:break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Riwayat Pengujian</CardTitle>
        <p className="text-xs text-muted-foreground">
          Trend Skor AHI dari waktu ke waktu — pilih peralatan dan item pengujian untuk melihat riwayatnya.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Select
            value={selectedUnitKey}
            onValueChange={(v) => {
              setSelectedUnitKey(v ?? unitKey(units[0]));
              setSelectedParam(OVERALL_VALUE);
            }}
          >
            <SelectTrigger size="sm" className="w-[220px]">
              <SelectValue placeholder="Peralatan">{unit.role}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={unitKey(u)} value={unitKey(u)}>
                  {u.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedParam} onValueChange={(v) => setSelectedParam(v ?? OVERALL_VALUE)}>
            <SelectTrigger size="sm" className="w-[220px]">
              <SelectValue placeholder="Item">
                {selectedParam === OVERALL_VALUE ? "Skor AHI Keseluruhan" : selectedParam}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OVERALL_VALUE}>Skor AHI Keseluruhan</SelectItem>
              {unit.parameters.map((p) => (
                <SelectItem key={p.label} value={p.label}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada data riwayat untuk {unit.role}
            {param ? ` · ${param.label}` : ""} — pastikan sinkronisasi riwayat AHI sudah berjalan.
          </p>
        ) : (
          <>
            <EquipmentTrendChart history={history} />
            {history.length === 1 ? (
              <p className="text-xs text-muted-foreground">
                Baru 1 titik data (hasil uji saat ini). Riwayat bertambah otomatis setiap kali ada pengujian baru.
              </p>
            ) : null}
          </>
        )}

        {param ? <ParameterRawHistoryTable history={param.history} /> : null}
      </CardContent>
    </Card>
  );
}

/** Riwayat nilai mentah (hasil uji) for one parameter — one row per
 *  (tanggal, titik ukur) pair, since a parameter can fan out into several
 *  raw readings (e.g. Tahanan Isolasi: Atas-Bawah/Atas-Tanah/Bawah-Tanah). */
interface ParameterRawHistoryRow {
  tanggal: string;
  klasifikasi: AhiKlasifikasi;
  reading: EquipmentParameterHistoryPoint["rawReadings"][number] | null;
}

function ParameterRawHistoryTable({ history }: { history: EquipmentParameterHistoryPoint[] }) {
  const rows: ParameterRawHistoryRow[] = history.flatMap((point): ParameterRawHistoryRow[] =>
    point.rawReadings.length > 0
      ? point.rawReadings.map((reading) => ({ tanggal: point.tanggal, klasifikasi: point.klasifikasi, reading }))
      : [{ tanggal: point.tanggal, klasifikasi: point.klasifikasi, reading: null }],
  );
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Tanggal</th>
            <th className="px-2 py-1.5 font-medium">Titik Ukur</th>
            <th className="px-2 py-1.5 font-medium">R</th>
            <th className="px-2 py-1.5 font-medium">S</th>
            <th className="px-2 py-1.5 font-medium">T</th>
            <th className="px-2 py-1.5 font-medium">Klasifikasi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.tanggal}-${idx}`} className="border-b last:border-0">
              <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{row.tanggal}</td>
              <td className="px-2 py-1.5 text-foreground">{row.reading?.label ?? "—"}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{formatValue(row.reading?.r ?? null)}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{formatValue(row.reading?.s ?? null)}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{formatValue(row.reading?.t ?? null)}</td>
              <td className="px-2 py-1.5">
                <KlasifikasiPill value={row.klasifikasi} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnitCard({ unit }: { unit: BayEquipmentUnit }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <Card className="print:break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{unit.role}</CardTitle>
          <div className="flex items-center gap-2">
            <KlasifikasiPill value={unit.klasifikasi} />
            {unit.skorAhi !== null ? (
              <span className="text-xs text-muted-foreground">Skor AHI: {unit.skorAhi}</span>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {unit.merk ?? "—"} {unit.type ?? ""} · Nomor Seri {unit.nomorSeri ?? "—"} · Techident {unit.techident ?? "—"}
          {unit.tanggalPemeliharaanTerakhir ? ` · Pemeliharaan terakhir ${unit.tanggalPemeliharaanTerakhir}` : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Parameter / Hasil Uji</th>
                <th className="px-3 py-2 font-medium">R</th>
                <th className="px-3 py-2 font-medium">S</th>
                <th className="px-3 py-2 font-medium">T</th>
                <th className="px-3 py-2 font-medium">Klasifikasi</th>
              </tr>
            </thead>
            <tbody>
              {unit.parameters.map((p) => (
                <Fragment key={p.label}>
                  <tr className="border-b bg-muted/10 last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{p.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatValue(p.r)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatValue(p.s)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatValue(p.t)}</td>
                    <td className="px-3 py-2">
                      <KlasifikasiPill value={p.klasifikasi} />
                    </td>
                  </tr>
                  {p.rawReadings.map((reading, idx) => (
                    <tr
                      key={`${p.label}-raw-${idx}`}
                      className={cn("border-b text-xs last:border-0", !showRaw && "hidden print:table-row")}
                    >
                      <td className="py-1.5 pr-3 pl-6 text-muted-foreground">
                        <span className="text-muted-foreground/70">↳ </span>
                        {reading.label}
                      </td>
                      <td className="py-1.5 pr-3">{formatValue(reading.r)}</td>
                      <td className="py-1.5 pr-3">{formatValue(reading.s)}</td>
                      <td className="py-1.5 pr-3">{formatValue(reading.t)}</td>
                      <td />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/50 print:hidden"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", showRaw && "rotate-180")} />
          {showRaw ? "Sembunyikan Hasil Uji (nilai mentah)" : "Tampilkan Hasil Uji (nilai mentah)"}
        </button>

        {unit.tindakLanjut || unit.sourceLink ? (
          <div className="flex flex-col gap-1 text-xs">
            {unit.tindakLanjut ? (
              <p>
                <span className="text-muted-foreground">Tindak Lanjut: </span>
                {unit.tindakLanjut}
              </p>
            ) : null}
            {unit.sourceLink ? (
              <a
                href={unit.sourceLink}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 text-primary hover:underline print:hidden"
              >
                <FileText className="size-3.5 shrink-0" />
                Dokumen sumber
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function BayLineReportView({ reports }: { reports: BayLineReport[] }) {
  const giOptions = useMemo(() => [...new Set(reports.map((r) => r.gi))].sort(), [reports]);
  const [gi, setGi] = useState(ALL_VALUE);
  const bayOptions = useMemo(
    () => reports.filter((r) => gi === ALL_VALUE || r.gi === gi).map((r) => r.bay).sort(),
    [reports, gi],
  );
  const [bay, setBay] = useState<string | null>(null);

  const selected = reports.find((r) => r.bay === bay) ?? null;

  if (reports.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Data Bay Line belum tersedia — lihat halaman Data & Sync untuk detail.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {/* Report type is its own selector — the AHI page has a "Report" tab
            (not "Bay Line") because the source spreadsheet has several report
            sheets (Bay Line, Bay GT, Bus, Trafo). Only Bay Line is built so
            far; this makes that scope explicit instead of the tab label
            implying Bay Line is the only report that will ever exist. */}
        <Select value="bay-line" onValueChange={() => {}}>
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Jenis Report">Bay Line</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bay-line">Bay Line</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={gi}
          onValueChange={(v) => {
            setGi(v ?? ALL_VALUE);
            setBay(null);
          }}
        >
          <SelectTrigger size="sm" className="w-[220px]">
            <SelectValue placeholder="GI">{gi === ALL_VALUE ? "Semua GI" : gi}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua GI</SelectItem>
            {giOptions.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bay ?? ""} onValueChange={(v) => setBay(v || null)}>
          <SelectTrigger size="sm" className="w-[320px]">
            <SelectValue placeholder="Pilih Bay Line">{bay ?? "Pilih Bay Line..."}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {bayOptions.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Cetak / Simpan PDF
          </Button>
        ) : null}
      </div>

      {!selected ? (
        <p className="py-8 text-center text-sm text-muted-foreground print:hidden">
          Pilih Bay Line untuk melihat detail report.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/20 p-3 print:border-0 print:bg-transparent print:p-0">
            <p className="text-sm font-semibold text-foreground">{selected.bay}</p>
            <p className="text-xs text-muted-foreground">
              {selected.ultg} · GI {selected.gi} · {selected.units.length} unit peralatan
            </p>
          </div>
          {selected.units.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Data belum tersedia untuk bay ini.</p>
          ) : (
            <>
              <QualityScoreCard units={selected.units} />

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Resume Semua Peralatan</h3>
                <ResumeTable units={selected.units} />
              </div>

              {selected.units.map((unit, idx) => (
                // Banner and card are flat siblings of the same long list, not
                // each wrapped in their own short container — sticky's
                // containing block is the nearest ancestor, so a banner
                // wrapped alone with just its one card could only ever stick
                // for that card's few hundred px before being forced off,
                // which read as "floating past" rather than truly anchored.
                // As direct siblings, each banner stays parked at top-14 for
                // the whole remaining list until the next section's banner
                // scrolls up and physically overlaps it (later element,
                // same stacking context, paints on top).
                <Fragment key={`${unit.role}-${unit.techident ?? unit.nomorSeri}`}>
                  <SectionBanner
                    id={unitAnchorId(idx)}
                    role={unit.role}
                    accent={SECTION_COLORS[idx % SECTION_COLORS.length]}
                  />
                  <UnitCard unit={unit} />
                </Fragment>
              ))}

              <BayHistorySection units={selected.units} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
