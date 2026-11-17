"use client";

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  Factory,
  Gauge,
  Grid3x3,
  MapPin,
  Scale,
  Tags,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildAhiKpis,
  buildBayHotspots,
  buildGiRanking,
  buildMerkRows,
  buildParameterGaps,
  buildSkdirRows,
  buildSubSistemRows,
  buildTriggerPareto,
  buildUltgAssetMatrix,
  equipmentKey,
  prettyGi,
  prettyUltg,
  weightedScore,
  type AhiCountRow,
} from "@/lib/ahi-analysis";
import { cn } from "@/lib/utils";
import type { AhiAnomalyRecord, AhiCategory, AhiDistribution, AhiSectionSummary } from "@/types";
import { AhiStatusBadge } from "./ahi-status-badge";
import { formatCount, formatPercent } from "./format";

const ALL = "__all__";

// AHI 1-5 is an ordinal health scale, so it wears the status tokens:
// two greens for Best/Good, neutral for Fair, warning/critical for 4/5.
const LEVELS: { key: keyof AhiDistribution; label: string; bar: string }[] = [
  { key: "best", label: "1-Best", bar: "bg-success" },
  { key: "good", label: "2-Good", bar: "bg-success/45" },
  { key: "fair", label: "3-Fair", bar: "bg-muted-foreground/35" },
  { key: "poor", label: "4-Poor", bar: "bg-warning" },
  { key: "critical", label: "5-Critical", bar: "bg-critical" },
];

const SKDIR_LABEL = {
  ahiLebihBuruk: "AHI lebih buruk",
  sama: "Sama",
  ahiLebihBaik: "AHI lebih baik",
  kosong: "Tidak terbaca",
} as const;

// --- small building blocks ---------------------------------------------------

function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
  id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card id={id} className={cn("min-w-0 scroll-mt-20 gap-3", className)}>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-xl border bg-card px-3 py-2.5", tone)}>
      <span className="text-[11px] font-semibold text-muted-foreground uppercase">{label}</span>
      <span className="text-xl leading-tight font-extrabold tabular-nums">{value}</span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function DistBar({ dist, className }: { dist: AhiDistribution; className?: string }) {
  const total = LEVELS.reduce((s, l) => s + (dist[l.key] ?? 0), 0);
  if (!total) return <div className={cn("h-2.5 rounded-sm bg-muted", className)} />;
  return (
    <div
      className={cn("flex h-2.5 gap-[2px] overflow-hidden rounded-sm", className)}
      title={LEVELS.map((l) => `${l.label}: ${dist[l.key] ?? 0}`).join(" · ")}
    >
      {LEVELS.map((l) =>
        dist[l.key] ? (
          <div key={l.key} className={l.bar} style={{ width: `${((dist[l.key] ?? 0) / total) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}

function LevelLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {LEVELS.map((l) => (
        <span key={l.key} className="inline-flex items-center gap-1">
          <span className={cn("size-2.5 rounded-sm", l.bar)} />
          {l.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal count bar: critical part + poor part of `conditions`. */
function CountBar({ row, max }: { row: AhiCountRow; max: number }) {
  const poor = row.conditions - row.critical;
  return (
    <div className="flex h-3 gap-[2px]" title={`${row.critical} critical · ${poor} poor`}>
      {row.critical > 0 && (
        <div className="rounded-sm bg-critical" style={{ width: `${(row.critical / max) * 100}%` }} />
      )}
      {poor > 0 && <div className="rounded-sm bg-warning" style={{ width: `${(poor / max) * 100}%` }} />}
    </div>
  );
}

function CountLegend() {
  return (
    <div className="flex gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-critical" />
        Critical
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-warning" />
        Poor
      </span>
    </div>
  );
}

function AnomalyDialog({
  title,
  items,
  onClose,
}: {
  title: string;
  items: AhiAnomalyRecord[] | null;
  onClose: () => void;
}) {
  // One entry per physical equipment, phases listed together.
  const equipment = useMemo(() => {
    const map = new Map<string, AhiAnomalyRecord[]>();
    for (const a of items ?? []) {
      const k = equipmentKey(a);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.values()].sort((a, b) => a[0].gi.localeCompare(b[0].gi) || a[0].bay.localeCompare(b[0].bay));
  }, [items]);
  return (
    <Dialog open={items !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {items?.length ?? 0} kondisi · {equipment.length} peralatan
          </p>
        </DialogHeader>
        <ul className="flex flex-col divide-y text-sm">
          {equipment.map((list) => {
            const a = list[0];
            const worst = Math.max(...list.map((x) => x.kategoriAhi));
            return (
              <li key={equipmentKey(a)} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{a.bay}</span>
                  <span className="text-xs text-muted-foreground">
                    · {prettyGi(a.gi)} · {a.jenisAset}
                    {a.keterangan && a.keterangan !== "-" ? ` ${a.keterangan}` : ""} · {a.merk || "merk ?"}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 text-[11px] font-bold",
                      worst >= 5 ? "bg-critical/15 text-critical" : "bg-warning/20 text-warning-foreground",
                    )}
                  >
                    {worst >= 5 ? "5-Critical" : "4-Poor"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    fasa {list.map((x) => x.fasa).join(", ")}
                  </span>
                </div>
                <div className="text-xs">
                  Pemicu: {[...new Set(list.map((x) => x.parameterPemicuAhi))].join(" · ") || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {[...new Set(list.map((x) => x.kategoriAhiVsSkdir))].join(" · ")}
                  {a.subSistem && a.subSistem !== "#N/A" ? ` · Sub sistem: ${a.subSistem}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// --- category score table ------------------------------------------------------

function CategoryRow({
  category,
  open,
  onToggle,
}: {
  category: AhiCategory;
  open: boolean;
  onToggle: () => void;
}) {
  const d = category.distribution;
  return (
    <>
      <tr className="border-b">
        <td className="px-2 py-1.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-1 text-left font-semibold hover:text-primary"
          >
            <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
            {category.displayName.replace(/^AHI\s+/i, "")}
          </button>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{formatCount(category.jumlahDataTercatat)}</td>
        <td
          className={cn(
            "px-2 py-1.5 text-right tabular-nums",
            (category.kualitasData ?? 1) < 0.8 && "font-semibold text-warning-foreground",
          )}
        >
          {formatPercent(category.kualitasData)}
        </td>
        <td className="px-2 py-1.5 text-right font-bold tabular-nums">{formatPercent(category.score)}</td>
        <td className="w-[28%] min-w-[120px] px-2 py-1.5">
          <DistBar dist={d} />
        </td>
        <td className={cn("px-2 py-1.5 text-right tabular-nums", (d.poor ?? 0) > 0 && "text-warning-foreground")}>
          {d.poor ?? 0}
        </td>
        <td className={cn("px-2 py-1.5 text-right tabular-nums", (d.critical ?? 0) > 0 && "font-bold text-critical")}>
          {d.critical ?? 0}
        </td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30">
          <td colSpan={7} className="px-2 py-2 pl-7">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-muted-foreground uppercase">
                  <th className="py-1 font-bold">Parameter</th>
                  <th className="py-1 text-right font-bold">Kosong</th>
                  <th className="w-[35%] px-2 py-1 font-bold">Distribusi</th>
                  <th className="py-1 text-right font-bold">Poor</th>
                  <th className="py-1 text-right font-bold">Critical</th>
                </tr>
              </thead>
              <tbody>
                {category.parameters.map((p) => (
                  <tr key={p.name} className="border-t border-border/60">
                    <td className="py-1 pr-2">{p.name}</td>
                    <td
                      className={cn(
                        "py-1 text-right tabular-nums",
                        category.jumlahDataTercatat &&
                          (p.kosong ?? 0) / category.jumlahDataTercatat >= 0.5 &&
                          "font-semibold text-warning-foreground",
                      )}
                    >
                      {p.kosong ?? 0}
                    </td>
                    <td className="px-2 py-1">
                      <DistBar dist={p} className="h-2" />
                    </td>
                    <td className="py-1 text-right tabular-nums">{p.poor ?? 0}</td>
                    <td className={cn("py-1 text-right tabular-nums", (p.critical ?? 0) > 0 && "font-bold text-critical")}>
                      {p.critical ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// --- main ------------------------------------------------------------------------

export function AhiOverview({
  sections,
  anomalies,
}: {
  sections: AhiSectionSummary[];
  anomalies: AhiAnomalyRecord[];
}) {
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const [ultg, setUltg] = useState(ALL);
  const [dialog, setDialog] = useState<{ title: string; items: AhiAnomalyRecord[] } | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(
    () =>
      new Set(
        sections.filter((s) => s.key === requestedSection).flatMap((s) => s.categories.map((c) => c.key)),
      ),
  );
  const [showAllBays, setShowAllBays] = useState(false);

  const ultgs = useMemo(() => [...new Set(anomalies.map((a) => prettyUltg(a.ultg)))].sort(), [anomalies]);
  const list = useMemo(
    () => (ultg === ALL ? anomalies : anomalies.filter((a) => prettyUltg(a.ultg) === ultg)),
    [anomalies, ultg],
  );

  const v = useMemo(
    () => ({
      kpi: buildAhiKpis(list),
      triggers: buildTriggerPareto(list).slice(0, 10),
      subSistem: buildSubSistemRows(list),
      matrix: buildUltgAssetMatrix(list),
      gis: buildGiRanking(list),
      bays: buildBayHotspots(list),
      merk: buildMerkRows(list).slice(0, 10),
      skdir: buildSkdirRows(list),
    }),
    [list],
  );
  const s = useMemo(
    () => ({
      overall: weightedScore(sections),
      gaps: buildParameterGaps(sections, 10),
      totalData: sections.reduce(
        (n, sec) => n + sec.categories.reduce((m, c) => m + (c.jumlahDataTercatat ?? 0), 0),
        0,
      ),
      categories: sections.flatMap((sec) => sec.categories),
    }),
    [sections],
  );

  const k = v.kpi;
  const open = (title: string, items: AhiAnomalyRecord[]) => {
    if (items.length) setDialog({ title, items });
  };
  const toggleCat = (key: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const pctOf = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const maxTrigger = Math.max(1, ...v.triggers.map((t) => t.conditions));
  const maxSub = Math.max(1, ...v.subSistem.map((t) => t.conditions));
  const maxGi = Math.max(1, ...v.gis.map((g) => g.conditions));
  const maxCell = Math.max(1, ...v.matrix.rows.flatMap((r) => Object.values(r.cells).map((c) => c.conditions)));
  const healthyCats = s.categories.filter((c) => c.status === "good").length;
  const bays = showAllBays ? v.bays : v.bays.slice(0, 8);
  const skdirTotal = k.skdirWorse + k.skdirSame + k.skdirBetter;

  return (
    <div className="flex flex-col gap-4">
      {/* filter */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={ultg} onValueChange={(val) => val && setUltg(val)}>
          <SelectTrigger size="sm" className="w-[200px]" aria-label="ULTG">
            <SelectValue>{ultg === ALL ? "Semua ULTG" : `ULTG ${ultg}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua ULTG</SelectItem>
            {ultgs.map((u) => (
              <SelectItem key={u} value={u}>
                ULTG {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Filter ULTG berlaku untuk analisa anomali Poor/Critical. Skor per kategori adalah angka UPT dari sheet HI UPT
          (sumber tidak memisah skor per ULTG).
        </span>
      </div>

      {/* section scores + KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {sections.map((sec) => {
          const data = sec.categories.reduce((n, c) => n + (c.jumlahDataTercatat ?? 0), 0);
          return (
            <div
              key={sec.key}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5",
                sec.status === "critical" && "border-critical/40",
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold text-muted-foreground uppercase">
                  {sec.displayName}
                </div>
                <div className="text-2xl leading-tight font-extrabold tabular-nums">{formatPercent(sec.score)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatCount(data)} data · {sec.categories.length} kategori
                </div>
              </div>
              <AhiStatusBadge status={sec.status} className="shrink-0 px-2 py-0.5 text-[11px]" />
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Skor AHI tertimbang"
          value={formatPercent(s.overall)}
          hint={`${healthyCats} dari ${s.categories.length} kategori sehat · ${formatCount(s.totalData)} data`}
        />
        <Kpi
          label="Kondisi Poor/Critical"
          value={String(k.conditions)}
          hint={`${k.critical} critical · ${k.poor} poor`}
          tone={k.critical > 0 ? "border-critical/40 bg-critical/5" : undefined}
        />
        <Kpi label="Peralatan terdampak" value={String(k.equipment)} hint={`di ${k.bays} bay · ${k.gis} GI`} />
        <Kpi
          label="Bay hotspot"
          value={String(v.bays.length)}
          hint="bay dengan ≥2 peralatan Poor/Critical"
          tone={v.bays.length > 0 ? "border-warning/50" : undefined}
        />
        <Kpi
          label="AHI lebih buruk dari SKDIR"
          value={String(k.skdirWorse)}
          hint={`${pctOf(k.skdirWorse, skdirTotal)} kondisi · ${k.skdirSame} sama`}
        />
        <Kpi
          label="Tanpa rencana tindak lanjut"
          value={pctOf(k.noFollowUp, k.conditions)}
          hint={`${k.noFollowUp} kondisi · ${k.noTarget} tanpa target waktu`}
          tone={k.noFollowUp > 0 ? "border-warning/50 bg-warning/5" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* category table */}
        <Section
          id="ahi-detail"
          icon={Gauge}
          title="Skor & Distribusi per Kategori"
          description="Skor AHI, kualitas data dan sebaran hasil evaluasi (1-Best s.d. 5-Critical) tiap kategori. Klik kategori untuk melihat parameter pemeriksaannya."
          className="xl:col-span-3"
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-[11px] text-muted-foreground uppercase">
                  <th className="px-2 py-2 font-bold">Kategori</th>
                  <th className="px-2 py-2 text-right font-bold">Data</th>
                  <th className="px-2 py-2 text-right font-bold">Kualitas</th>
                  <th className="px-2 py-2 text-right font-bold">Skor</th>
                  <th className="px-2 py-2 font-bold">Distribusi</th>
                  <th className="px-2 py-2 text-right font-bold">Poor</th>
                  <th className="px-2 py-2 text-right font-bold">Crit.</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <Fragment key={sec.key}>
                    <tr className="border-b bg-muted/30">
                      <td colSpan={7} className="px-2 pt-2 pb-1 text-[11px] font-extrabold text-primary uppercase">
                        {sec.displayName} · {formatPercent(sec.score)}
                      </td>
                    </tr>
                    {sec.categories.map((c) => (
                      <CategoryRow
                        key={c.key}
                        category={c}
                        open={openCats.has(c.key)}
                        onToggle={() => toggleCat(c.key)}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <LevelLegend />
        </Section>

        {/* triggers + sub sistem */}
        <Section
          icon={Activity}
          title="Parameter Pemicu Poor/Critical"
          description="Parameter uji yang membuat peralatan masuk Poor/Critical (rekap AM:BA). Klik untuk melihat peralatannya."
          className="xl:col-span-2"
        >
          <div className="flex flex-col gap-1.5">
            {v.triggers.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => open(`Pemicu: ${t.label}`, t.items)}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
              >
                <span className="truncate font-medium" title={t.label}>
                  {t.label}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {t.by
                      .slice(0, 3)
                      .map((b) => `${b.label} ${b.n}`)
                      .join(" · ")}
                  </span>
                </span>
                <CountBar row={t} max={maxTrigger} />
                <span className="w-16 text-right tabular-nums">
                  <b>{t.conditions}</b> <span className="text-muted-foreground">/ {t.equipment} alat</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 border-t pt-2">
            <div className="mb-1.5 text-[11px] font-bold text-muted-foreground uppercase">Sub sistem terdampak</div>
            <div className="flex flex-col gap-1">
              {v.subSistem.slice(0, 7).map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => open(`Sub sistem: ${t.label}`, t.items)}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
                >
                  <span className={cn("truncate", t.label === "Belum terisi" && "text-muted-foreground italic")}>
                    {t.label}
                  </span>
                  <CountBar row={t} max={maxSub} />
                  <span className="w-16 text-right tabular-nums">{t.conditions}</span>
                </button>
              ))}
            </div>
          </div>
          <CountLegend />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ULTG x asset matrix */}
        <Section
          icon={Grid3x3}
          title="Sebaran ULTG × Jenis Aset"
          description="Jumlah kondisi Poor/Critical (angka kecil: critical). Warna sel makin pekat makin banyak. Klik sel untuk daftar peralatan."
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/70 text-[11px] text-muted-foreground uppercase">
                  <th className="px-2 py-2 text-left font-bold">ULTG</th>
                  {v.matrix.assets.map((a) => (
                    <th key={a} className="px-1 py-2 text-center font-bold">
                      {a}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {v.matrix.rows.map((r) => (
                  <tr key={r.ultg} className="border-b">
                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{r.ultg}</td>
                    {v.matrix.assets.map((a) => {
                      const c = r.cells[a];
                      return (
                        <td key={a} className="p-0.5 text-center">
                          {c.conditions > 0 ? (
                            <button
                              type="button"
                              onClick={() => open(`${r.ultg} · ${a}`, c.items)}
                              className="w-full rounded px-1 py-1 tabular-nums hover:ring-2 hover:ring-primary/40"
                              style={{
                                backgroundColor: `color-mix(in oklab, var(--critical) ${Math.round(
                                  12 + (c.conditions / maxCell) * 60,
                                )}%, transparent)`,
                              }}
                              title={`${c.conditions} kondisi · ${c.critical} critical · ${c.equipment} peralatan`}
                            >
                              <b>{c.conditions}</b>
                              <span className="ml-0.5 text-[10px] opacity-80">{c.critical}</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">
                      {r.total.conditions}
                      <div className="text-[10px] font-normal text-muted-foreground">{r.total.equipment} alat</div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-bold">
                  <td className="px-2 py-1.5">Total</td>
                  {v.matrix.assets.map((a) => (
                    <td key={a} className="px-1 py-1.5 text-center tabular-nums">
                      {v.matrix.totals[a].conditions}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {v.matrix.totals[a].equipment} alat
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {k.conditions}
                    <div className="text-[10px] font-normal text-muted-foreground">{k.equipment} alat</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* GI ranking */}
        <Section
          icon={MapPin}
          title="GI dengan Kondisi Terbanyak"
          description="Diurutkan menurut jumlah peralatan Poor/Critical. Klik baris untuk daftar peralatan."
        >
          <div className="flex max-h-[330px] flex-col gap-1 overflow-y-auto pr-1">
            {v.gis.map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => open(`GI ${g.label}`, g.items)}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
              >
                <span className="truncate">
                  <b>{g.label}</b> <span className="text-[10px] text-muted-foreground">{g.ultg}</span>
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <CountBar row={g} max={maxGi} />
                  <span className="truncate text-[10px] text-muted-foreground">
                    {g.by.map((b) => `${b.label} ${b.n}`).join(" · ")}
                  </span>
                </div>
                <span className="w-24 text-right tabular-nums">
                  <b>{g.equipment}</b> alat · {g.bays} bay
                </span>
              </button>
            ))}
          </div>
          <CountLegend />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* bay hotspots */}
        <Section
          icon={Factory}
          title="Bay Hotspot"
          description="Bay dengan dua peralatan atau lebih berstatus Poor/Critical. Cocok untuk ditangani bersamaan dalam satu kali padam."
        >
          {v.bays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada bay dengan ≥2 peralatan bermasalah.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {bays.map((b) => (
                <button
                  key={`${b.gi}|${b.label}`}
                  type="button"
                  onClick={() => open(b.label, b.items)}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border p-2 text-left text-xs hover:bg-muted/50",
                    b.critical > 0 && "border-critical/30",
                  )}
                >
                  <span className="line-clamp-1 font-semibold" title={b.label}>
                    {b.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {b.gi} · ULTG {b.ultg}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {b.by.map((x) => (
                      <span key={x.label} className="rounded bg-muted px-1 text-[10px] font-semibold">
                        {x.label} {x.n}
                      </span>
                    ))}
                  </span>
                  <span className="tabular-nums">
                    <b>{b.equipment}</b> peralatan · {b.conditions} kondisi ·{" "}
                    <span className="text-critical">{b.critical} critical</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {v.bays.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllBays((x) => !x)}
              className="w-fit rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
            >
              {showAllBays ? "Tampilkan 8 teratas" : `Lihat semua ${v.bays.length} bay`}
            </button>
          )}
        </Section>

        {/* merk */}
        <Section
          icon={Tags}
          title="Pola Merk × Jenis Aset"
          description="Merk yang bermasalah di banyak GI dengan parameter yang sama menandakan masalah tipe/produksi, bukan masalah lokasi."
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-[11px] text-muted-foreground uppercase">
                  <th className="px-2 py-2 font-bold">Merk · Aset</th>
                  <th className="px-2 py-2 text-right font-bold">Alat</th>
                  <th className="px-2 py-2 text-right font-bold">GI</th>
                  <th className="px-2 py-2 text-right font-bold">Crit.</th>
                  <th className="px-2 py-2 font-bold">Pemicu utama</th>
                </tr>
              </thead>
              <tbody>
                {v.merk.map((m) => (
                  <tr
                    key={m.label}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                    onClick={() => open(`Merk ${m.label}`, m.items)}
                  >
                    <td className="px-2 py-1.5 font-semibold">{m.label}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.equipment}</td>
                    <td
                      className={cn("px-2 py-1.5 text-right tabular-nums", m.gis >= 3 && "font-bold text-primary")}
                    >
                      {m.gis}
                    </td>
                    <td className="px-2 py-1.5 text-right text-critical tabular-nums">{m.critical}</td>
                    <td className="px-2 py-1.5">{m.topParam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* SKDIR */}
        <Section
          icon={Scale}
          title="Konsistensi AHI vs SKDIR"
          description="Perbandingan kategori AHI dengan kategori menurut SKDIR per kondisi. AHI lebih buruk berarti hasil AHI lebih berat daripada penilaian SKDIR, jadi perlu verifikasi data uji atau batas penilaiannya."
        >
          <div className="flex h-4 gap-[2px] overflow-hidden rounded-sm" title="Komposisi semua kondisi">
            {(["ahiLebihBuruk", "sama", "ahiLebihBaik"] as const).map((r) => {
              const n = r === "ahiLebihBuruk" ? k.skdirWorse : r === "sama" ? k.skdirSame : k.skdirBetter;
              return n ? (
                <div
                  key={r}
                  className={cn(
                    r === "ahiLebihBuruk" && "bg-critical/70",
                    r === "sama" && "bg-muted-foreground/40",
                    r === "ahiLebihBaik" && "bg-primary/60",
                  )}
                  style={{ width: `${(n / Math.max(1, skdirTotal)) * 100}%` }}
                  title={`${SKDIR_LABEL[r]}: ${n}`}
                />
              ) : null;
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-critical/70" />
              AHI lebih buruk {k.skdirWorse}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-muted-foreground/40" />
              Sama {k.skdirSame}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary/60" />
              AHI lebih baik {k.skdirBetter}
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/70 text-[11px] text-muted-foreground uppercase">
                  <th className="px-2 py-2 text-left font-bold">Jenis aset</th>
                  <th className="px-2 py-2 text-right font-bold">AHI lebih buruk</th>
                  <th className="px-2 py-2 text-right font-bold">Sama</th>
                  <th className="px-2 py-2 text-right font-bold">AHI lebih baik</th>
                </tr>
              </thead>
              <tbody>
                {v.skdir.map((r) => (
                  <tr key={r.jenisAset} className="border-b last:border-0">
                    <td className="px-2 py-1.5 font-semibold">{r.jenisAset}</td>
                    {(["ahiLebihBuruk", "sama", "ahiLebihBaik"] as const).map((rel) => (
                      <td key={rel} className="px-2 py-1 text-right tabular-nums">
                        {r[rel] > 0 ? (
                          <button
                            type="button"
                            onClick={() => open(`${r.jenisAset} · ${SKDIR_LABEL[rel]} dari SKDIR`, r.items[rel])}
                            className={cn(
                              "rounded px-1 hover:bg-primary/10 hover:underline",
                              rel === "ahiLebihBuruk" && "font-bold text-critical",
                            )}
                          >
                            {r[rel]}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* data completeness & follow-up */}
        <Section
          icon={ClipboardCheck}
          title="Kelengkapan Data & Tindak Lanjut"
          description="Kualitas data per kategori, parameter yang paling banyak belum diuji, dan kelengkapan kolom tindak lanjut di rekap anomali."
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              {
                label: "Rencana tindak lanjut",
                filled: k.conditions - k.noFollowUp,
              },
              { label: "Target waktu", filled: k.conditions - k.noTarget },
              {
                label: "Sub sistem",
                filled: list.filter((a) => !/^(|-|#N\/A)$/.test(a.subSistem.trim())).length,
              },
            ].map((f) => {
              const r = k.conditions ? f.filled / k.conditions : 0;
              return (
                <div
                  key={f.label}
                  className={cn(
                    "rounded-lg border px-2 py-2",
                    r < 0.5 ? "border-critical/40 bg-critical/5" : r < 0.9 ? "border-warning/50" : "",
                  )}
                >
                  <div className="text-lg font-extrabold tabular-nums">{Math.round(r * 100)}%</div>
                  <div className="text-[11px] text-muted-foreground">{f.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {f.filled}/{k.conditions} terisi
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-muted-foreground uppercase">
              Parameter paling banyak belum terisi
            </div>
            <div className="flex flex-col gap-1">
              {s.gaps.map((g) => (
                <div
                  key={`${g.category}|${g.parameter}`}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] items-center gap-2 text-xs"
                  title={`${g.kosong} dari ${g.total} data kosong`}
                >
                  <span className="truncate">
                    {g.parameter}{" "}
                    <span className="text-[10px] text-muted-foreground">{g.category.replace(/^AHI\s+/i, "")}</span>
                  </span>
                  <div className="h-2.5 rounded-sm bg-muted">
                    <div className="h-2.5 rounded-sm bg-warning" style={{ width: `${g.ratio * 100}%` }} />
                  </div>
                  <span className="w-20 text-right tabular-nums">
                    <b>{Math.round(g.ratio * 100)}%</b>{" "}
                    <span className="text-muted-foreground">
                      {g.kosong}/{g.total}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {k.noFollowUp > 0 && (
            <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
              {k.noFollowUp} dari {k.conditions} kondisi Poor/Critical belum punya rencana tindak lanjut di sheet HI UPT
              (kolom AM:BA). Lengkapi agar progres perbaikan bisa dipantau.
            </p>
          )}
        </Section>
      </div>

      <AnomalyDialog title={dialog?.title ?? ""} items={dialog?.items ?? null} onClose={() => setDialog(null)} />
    </div>
  );
}
