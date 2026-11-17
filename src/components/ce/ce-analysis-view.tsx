"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  ClipboardCheck,
  Layers,
  ListChecks,
  MapPin,
  Repeat,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CE_STATUS_ORDER,
  COMPLETENESS_FIELDS,
  buildBayHotspots,
  buildBreakdown,
  buildBudgetGroups,
  buildCeCandidates,
  buildCompleteness,
  buildGiStreamMatrix,
  buildKpis,
  buildSystemicIssues,
  buildTargetTimeline,
  buildUltgRows,
  formatRupiah,
  giList,
  isInCe,
  isOverdue,
  shortUltg,
} from "@/lib/ce-analysis";
import { cn } from "@/lib/utils";
import type { CeItem, CeUnlinkedBudget } from "@/types";

const ALL = "__all__";
type PeriodeFilter = "all" | "ce" | "belum";
const PERIODE_LABEL: Record<PeriodeFilter, string> = {
  all: "Semua anomali",
  ce: "Masuk CE 2026",
  belum: "Belum masuk CE",
};

// Two-series identity colors (CE 2026 / Belum masuk CE), validated with
// the dataviz palette checker for both themes (CVD ΔE ≥ 23, contrast ≥ 3:1).
const CE_BAR = "bg-[#2457a6] dark:bg-[#4f8fe0]";
const BELUM_BAR = "bg-[#d97706] dark:bg-[#c07f1a]";

const STATUS_TONE: Record<string, string> = {
  "NO TARGET": "bg-muted text-muted-foreground",
  "ON TARGET": "bg-primary/15 text-primary",
  LAGGING: "bg-critical/15 text-critical",
  "FINISH (LEAD)": "bg-success/15 text-success",
  "FINISH (LAGGING)": "bg-warning/20 text-warning-foreground",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// --- small building blocks ------------------------------------------------

function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
  action,
}: {
  icon: typeof Layers;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
            <Icon className="size-5 text-primary" />
            {title}
          </CardTitle>
          {action}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card px-3 py-2.5", tone)}>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap",
        STATUS_TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status || "—"}
    </span>
  );
}

function SeriesLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={cn("size-2.5 rounded-sm", CE_BAR)} /> Masuk CE 2026
      </span>
      <span className="flex items-center gap-1.5">
        <span className={cn("size-2.5 rounded-sm", BELUM_BAR)} /> Belum masuk CE
      </span>
    </div>
  );
}

/** Horizontal two-segment bar (CE 2026 | Belum), scaled to `max`, with a
 *  2px gap between segments and the total printed after it. */
function SplitBar({ inCe, notInCe, max, title }: { inCe: number; notInCe: number; max: number; title: string }) {
  const w = (n: number) => `${(n / Math.max(1, max)) * 100}%`;
  return (
    <div className="flex h-4 items-center gap-0.5" title={title}>
      {inCe > 0 && <div className={cn("h-4 rounded-l", notInCe === 0 && "rounded-r", CE_BAR)} style={{ width: w(inCe) }} />}
      {notInCe > 0 && (
        <div className={cn("h-4 rounded-r", inCe === 0 && "rounded-l", BELUM_BAR)} style={{ width: w(notInCe) }} />
      )}
    </div>
  );
}

function ItemsDialog({
  title,
  items,
  onClose,
}: {
  title: string;
  items: CeItem[] | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={items !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col divide-y text-sm">
          {items?.map((i) => (
            <li key={i.id} className="flex flex-col gap-0.5 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{i.bay || i.gardu}</span>
                <span className="text-xs text-muted-foreground">
                  · {i.jenisAsset}
                  {i.phasa && i.phasa !== "-" ? ` · fasa ${i.phasa}` : ""}
                </span>
                <StatusPill status={i.status} />
                <span className="text-[11px] text-muted-foreground">{isInCe(i) ? "CE 2026" : "Belum masuk CE"}</span>
              </div>
              <div className="text-xs">{i.anomaliPemicu || <i className="text-muted-foreground">uraian anomali kosong</i>}</div>
              {i.actionPlan && <div className="text-xs text-muted-foreground">Action plan: {i.actionPlan}</div>}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// --- main view ------------------------------------------------------------

export function CeAnalysisView({
  items,
  budgetUnlinked,
  todayISO,
}: {
  items: CeItem[];
  budgetUnlinked: CeUnlinkedBudget[];
  todayISO: string;
}) {
  const [ultg, setUltg] = useState<string>(ALL);
  const [periode, setPeriode] = useState<PeriodeFilter>("all");
  const [dialog, setDialog] = useState<{ title: string; items: CeItem[] } | null>(null);
  const [stream, setStream] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [showAllBays, setShowAllBays] = useState(false);

  const ultgs = useMemo(() => [...new Set(items.map((i) => shortUltg(i.ultg)))].sort(), [items]);

  // Filters at the top apply to every section; periode is not applied to
  // the sections whose whole point is comparing CE vs belum (they use
  // `byUltg`), so those stay meaningful whatever is selected.
  const byUltg = useMemo(() => (ultg === ALL ? items : items.filter((i) => shortUltg(i.ultg) === ultg)), [items, ultg]);
  const scoped = useMemo(
    () => (periode === "all" ? byUltg : byUltg.filter((i) => (periode === "ce" ? isInCe(i) : !isInCe(i)))),
    [byUltg, periode],
  );

  const view = useMemo(
    () => ({
      kpi: buildKpis(byUltg, todayISO),
      ultgRows: buildUltgRows(items, todayISO),
      streams: buildBreakdown(byUltg, (i) => i.stream),
      jenis: buildBreakdown(scoped, (i) => i.jenisAsset).slice(0, 12),
      matrix: buildGiStreamMatrix(scoped),
      systemic: buildSystemicIssues(scoped),
      candidates: buildCeCandidates(byUltg).slice(0, 15),
      bays: buildBayHotspots(scoped),
      timeline: buildTargetTimeline(byUltg, todayISO),
      overdueItems: byUltg.filter((i) => isOverdue(i, todayISO)),
      budgetByPos: buildBudgetGroups(scoped, (i) =>
        [i.budget?.pos, i.budget?.tahun].filter(Boolean).join(" ") || "Pos/tahun belum diisi",
      ),
      budgetByStream: buildBudgetGroups(scoped, (i) => i.stream),
      completeness: buildCompleteness(scoped),
    }),
    [items, byUltg, scoped, todayISO],
  );

  const unlinked = useMemo(
    () => budgetUnlinked.filter((b) => ultg === ALL || shortUltg(b.ultg) === ultg),
    [budgetUnlinked, ultg],
  );

  const tableRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter(
      (i) =>
        (stream === ALL || i.stream === stream) &&
        (status === ALL || i.status === status) &&
        (!q ||
          [i.gardu, i.bay, i.jenisAsset, i.anomaliPemicu, i.actionPlan, i.indikator].some((t) =>
            t.toLowerCase().includes(q),
          )),
    );
  }, [scoped, stream, status, query]);

  const k = view.kpi;
  const maxStream = Math.max(1, ...view.streams.map((s) => s.total));
  const maxJenis = Math.max(1, ...view.jenis.map((s) => s.total));
  const maxMatrix = Math.max(1, ...view.matrix.rows.flatMap((r) => Object.values(r.byStream)));
  const maxTimeline = Math.max(1, ...view.timeline.map((t) => t.target));
  const maxPos = Math.max(1, ...view.budgetByPos.map((b) => b.nilai));

  return (
    <div className="flex flex-col gap-4">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={ultg} onValueChange={(v) => v && setUltg(v)}>
          <SelectTrigger size="sm" className="w-[190px]" aria-label="ULTG">
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
        <div className="flex rounded-lg border p-0.5 text-xs">
          {(Object.keys(PERIODE_LABEL) as PeriodeFilter[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold",
                periode === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {PERIODE_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Filter berlaku untuk semua bagian di bawah, kecuali bagian yang membandingkan CE 2026 dengan Belum masuk CE.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total anomali" value={String(k.total)} hint={`${k.open} OPEN · ${k.close} CLOSE`} />
        <Kpi
          label="Masuk CE 2026"
          value={String(k.inCe)}
          hint={`${k.ceClose} close (${k.inCe ? Math.round((k.ceClose / k.inCe) * 100) : 0}%)`}
        />
        <Kpi
          label="Belum masuk CE"
          value={String(k.notInCe)}
          hint={`${k.total ? Math.round((k.notInCe / k.total) * 100) : 0}% dari semua anomali`}
          tone={k.notInCe > 0 ? "border-warning/50" : undefined}
        />
        <Kpi
          label="Lewat target"
          value={String(k.overdue)}
          hint={`${k.lagging} berstatus LAGGING`}
          tone={k.overdue > 0 ? "border-critical/40 bg-critical/5" : undefined}
        />
        <Kpi
          label="OPEN tanpa action plan"
          value={String(k.noActionPlan)}
          hint={`dari ${k.open} anomali OPEN`}
          tone={k.noActionPlan > 0 ? "border-warning/50 bg-warning/5" : undefined}
        />
        <Kpi
          label="Anggaran teridentifikasi"
          value={formatRupiah(k.budgetTotal)}
          hint={`${k.withBudget} anomali punya nilai RAB`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* per ULTG */}
        <Section
          icon={Layers}
          title="Status per ULTG"
          description="Seluruh anomali per ULTG, dipisah yang sudah masuk CE 2026 dan yang belum, beserta status pelaksanaannya. % close dihitung dari item CE 2026."
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-bold">ULTG</th>
                  <th className="px-3 py-2 font-bold">Komposisi</th>
                  <th className="px-3 py-2 text-right font-bold">CE / Belum</th>
                  <th className="px-3 py-2 text-right font-bold">% Close CE</th>
                  <th className="px-3 py-2 text-right font-bold">Lewat target</th>
                  <th className="px-3 py-2 text-right font-bold">Anggaran</th>
                </tr>
              </thead>
              <tbody>
                {view.ultgRows.map((r) => {
                  const maxU = Math.max(...view.ultgRows.map((x) => x.total));
                  return (
                    <tr key={r.ultg} className={cn("border-b last:border-0", ultg === r.ultg && "bg-primary/5")}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.ultg}</td>
                      <td className="w-[35%] px-3 py-2">
                        <SplitBar
                          inCe={r.inCe}
                          notInCe={r.notInCe}
                          max={maxU}
                          title={`${r.ultg}: ${r.inCe} masuk CE 2026, ${r.notInCe} belum masuk CE`}
                        />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {CE_STATUS_ORDER.filter((s) => r.byStatus[s]).map((s) => (
                            <span key={s} className={cn("rounded px-1 text-[10px] font-semibold", STATUS_TONE[s])}>
                              {s} {r.byStatus[s]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <b>{r.inCe}</b> / {r.notInCe}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct(r.closePct)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", r.overdue > 0 && "font-bold text-critical")}>
                        {r.overdue}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {r.budget > 0 ? formatRupiah(r.budget) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SeriesLegend />
        </Section>

        {/* target timeline */}
        <Section
          icon={Target}
          title="Target Penyelesaian per Bulan"
          description="Anomali yang sudah punya TARGET TANGGAL, dikelompokkan per bulan target: sudah close, masih berjalan, atau sudah lewat target tapi belum close."
        >
          {view.timeline.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada anomali dengan tanggal target.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {view.timeline.map((t) => (
                <div key={t.key} className="grid grid-cols-[72px_1fr_40px] items-center gap-2 text-xs">
                  <span className="font-semibold">{monthLabel(t.key)}</span>
                  <div
                    className="flex h-5 gap-0.5"
                    title={`${monthLabel(t.key)}: ${t.closed} close, ${t.open} berjalan, ${t.overdue} lewat target`}
                  >
                    {t.closed > 0 && (
                      <div className="h-5 rounded-sm bg-success" style={{ width: `${(t.closed / maxTimeline) * 100}%` }} />
                    )}
                    {t.open > 0 && (
                      <div className="h-5 rounded-sm bg-primary/40" style={{ width: `${(t.open / maxTimeline) * 100}%` }} />
                    )}
                    {t.overdue > 0 && (
                      <div className="h-5 rounded-sm bg-critical" style={{ width: `${(t.overdue / maxTimeline) * 100}%` }} />
                    )}
                  </div>
                  <span className="text-right font-bold tabular-nums">{t.target}</span>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-success" /> Close
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary/40" /> Berjalan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-critical" /> Lewat target, belum close
                </span>
              </div>
            </div>
          )}
          {view.overdueItems.length > 0 && (
            <div className="rounded-lg border border-critical/40 bg-critical/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-critical">
                <AlertTriangle className="size-4" /> Lewat target, belum close ({view.overdueItems.length})
              </div>
              <ul className="flex flex-col gap-1 text-xs">
                {view.overdueItems.map((i) => (
                  <li key={i.id}>
                    <b>{i.bay || i.gardu}</b> · {i.jenisAsset} · target {formatDate(i.tanggalTarget)} ·{" "}
                    <span className="text-muted-foreground">{i.actionPlan || i.anomaliPemicu}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Hanya {byUltg.filter((i) => i.tanggalTarget).length} dari {byUltg.length} anomali yang punya tanggal target.
            Anomali tanpa target tidak bisa dipantau keterlambatannya.
          </p>
        </Section>

        {/* streams */}
        <Section
          icon={Layers}
          title="Anomali per Stream"
          description="Sebaran anomali per stream, dipisah sudah dan belum masuk CE. Angka di kanan: total (OPEN)."
        >
          <div className="flex flex-col gap-1.5">
            {view.streams.map((s) => (
              <div key={s.label} className="grid grid-cols-[110px_1fr_64px] items-center gap-2 text-xs">
                <span className="truncate font-semibold">{s.label}</span>
                <SplitBar
                  inCe={s.inCe}
                  notInCe={s.notInCe}
                  max={maxStream}
                  title={`${s.label}: ${s.inCe} masuk CE 2026, ${s.notInCe} belum, ${s.open} OPEN`}
                />
                <span className="text-right tabular-nums">
                  <b>{s.total}</b> <span className="text-muted-foreground">({s.open})</span>
                </span>
              </div>
            ))}
          </div>
          <SeriesLegend />
        </Section>

        {/* jenis aset pareto */}
        <Section
          icon={ListChecks}
          title="Jenis Aset Terbanyak"
          description="12 jenis aset dengan anomali terbanyak (Pareto). Kolom kanan: persentase kumulatif dari seluruh anomali pada filter ini."
        >
          <div className="flex flex-col gap-1.5">
            {view.jenis.map((s) => (
              <div key={s.label} className="grid grid-cols-[110px_1fr_36px_44px] items-center gap-2 text-xs">
                <span className="truncate font-semibold" title={s.label}>
                  {s.label}
                </span>
                <SplitBar
                  inCe={s.inCe}
                  notInCe={s.notInCe}
                  max={maxJenis}
                  title={`${s.label}: ${s.inCe} masuk CE 2026, ${s.notInCe} belum`}
                />
                <span className="text-right font-bold tabular-nums">{s.total}</span>
                <span className="text-right text-muted-foreground tabular-nums">{pct(s.cumPct)}</span>
              </div>
            ))}
          </div>
          <SeriesLegend />
        </Section>
      </div>

      {/* GI x stream */}
      <Section
        icon={MapPin}
        title="Peta Anomali OPEN per Gardu Induk"
        description="Jumlah anomali yang masih OPEN per GI dan stream. Warna makin gelap berarti makin banyak. Satu baris yang menyebut beberapa GI sekaligus (mis. program Wi-Fi) dihitung di setiap GI-nya. Klik angka untuk melihat rinciannya."
      >
        <div className="max-h-[480px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2 font-bold">Gardu Induk</th>
                <th className="px-3 py-2 font-bold">ULTG</th>
                {view.matrix.streams.map((s) => (
                  <th key={s} className="px-2 py-2 text-center font-bold">
                    {s}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-bold">OPEN</th>
              </tr>
            </thead>
            <tbody>
              {view.matrix.rows.map((r) => (
                <tr key={r.gi} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{r.gi}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{r.ultg}</td>
                  {view.matrix.streams.map((s) => {
                    const n = r.byStream[s] ?? 0;
                    const level = n / maxMatrix;
                    return (
                      <td key={s} className="px-1 py-1 text-center">
                        {n > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({
                                title: `${r.gi} — ${s}`,
                                items: scoped.filter((i) => !i.done && i.stream === s && giList(i).includes(r.gi)),
                              })
                            }
                            className={cn(
                              "w-full rounded px-1.5 py-1 text-xs font-bold tabular-nums",
                              level > 0.66
                                ? "bg-primary text-primary-foreground"
                                : level > 0.33
                                  ? "bg-primary/45 text-foreground"
                                  : "bg-primary/15 text-foreground",
                            )}
                            title={`${r.gi}, ${s}: ${n} anomali OPEN`}
                          >
                            {n}
                          </button>
                        ) : (
                          <span className="text-muted-foreground/40">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{r.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* systemic */}
        <Section
          icon={Repeat}
          title="Masalah Sistemik (Lintas GI)"
          description="Anomali yang sama pada jenis aset yang sama dan muncul di 2 GI atau lebih. Lebih efisien diselesaikan sebagai satu program (satu RAB, satu kontrak) daripada satu per satu per GI."
        >
          <div className="max-h-[440px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-bold">Jenis aset / anomali</th>
                  <th className="px-3 py-2 text-right font-bold">Item</th>
                  <th className="px-3 py-2 text-right font-bold">GI</th>
                  <th className="px-3 py-2 font-bold">Periode</th>
                  <th className="px-3 py-2 text-right font-bold">Anggaran</th>
                </tr>
              </thead>
              <tbody>
                {view.systemic.map((s) => (
                  <tr key={`${s.jenisAsset}-${s.anomaly}`} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{s.jenisAsset}</div>
                      <div className="text-xs text-muted-foreground">{s.anomaly}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDialog({ title: `${s.jenisAsset}: ${s.anomaly}`, items: s.items })}
                        className="font-bold tabular-nums text-primary underline decoration-dotted underline-offset-2"
                      >
                        {s.items.length}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" title={s.gis.join(", ")}>
                      {s.gis.length}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {s.inCe === s.items.length ? (
                        "CE 2026"
                      ) : s.inCe === 0 ? (
                        <span className="font-semibold text-warning-foreground">Belum masuk CE</span>
                      ) : (
                        `${s.inCe} CE · ${s.items.length - s.inCe} belum`
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
                      {s.budget > 0 ? formatRupiah(s.budget) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* candidates */}
        <Section
          icon={Sparkles}
          title="Kandidat Masuk CE Berikutnya"
          description="Anomali OPEN yang belum masuk CE, dikelompokkan per masalah, lalu diurutkan dari yang paling siap dan paling berdampak: stream yang langsung memengaruhi keandalan, sudah ada RAB/PRK, sudah ada action plan, dan terjadi di banyak GI."
        >
          <div className="max-h-[440px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-bold">#</th>
                  <th className="px-3 py-2 font-bold">Masalah</th>
                  <th className="px-3 py-2 text-right font-bold">Item</th>
                  <th className="px-3 py-2 font-bold">Alasan</th>
                </tr>
              </thead>
              <tbody>
                {view.candidates.map((c, idx) => (
                  <tr key={`${c.jenisAsset}-${c.anomaly}`} className="border-b align-top last:border-0">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">
                        {c.jenisAsset} <span className="text-xs font-normal text-muted-foreground">· {c.stream}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{c.anomaly}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.gis.slice(0, 4).join(", ")}
                        {c.gis.length > 4 ? ` +${c.gis.length - 4} GI` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDialog({ title: `${c.jenisAsset}: ${c.anomaly}`, items: c.items })}
                        className="font-bold tabular-nums text-primary underline decoration-dotted underline-offset-2"
                      >
                        {c.items.length}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.reasons.map((r) => (
                          <span key={r} className="rounded bg-muted px-1.5 py-0.5 text-[11px] whitespace-nowrap">
                            {r}
                          </span>
                        ))}
                      </div>
                      {c.budget > 0 && (
                        <div className="mt-1 text-[11px] text-muted-foreground">RAB {formatRupiah(c.budget)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* bay hotspots */}
      <Section
        icon={MapPin}
        title="Bay dengan Anomali Menumpuk"
        description="Bay (atau GI untuk anomali tingkat gardu) yang punya 3 anomali atau lebih. Beberapa pekerjaan pada satu bay bisa digabung dalam satu kali padam/pemeliharaan. Klik jumlahnya untuk melihat rincian."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {(showAllBays ? view.bays : view.bays.slice(0, 9)).map((b) => (
            <button
              key={b.bay}
              type="button"
              onClick={() => setDialog({ title: b.bay, items: b.items })}
              className="flex flex-col gap-1 rounded-lg border p-3 text-left hover:border-primary/50 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{b.bay}</span>
                <span className="text-lg font-extrabold tabular-nums">{b.items.length}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                ULTG {b.ultg} · {b.open} OPEN
              </span>
              <div className="flex flex-wrap gap-1">
                {b.jenis.map((j) => (
                  <span key={j} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {j}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
        {view.bays.length > 9 && (
          <button
            type="button"
            onClick={() => setShowAllBays((v) => !v)}
            className="self-start text-sm font-semibold text-primary underline underline-offset-2"
          >
            {showAllBays ? "Tampilkan 9 teratas saja" : `Lihat semua ${view.bays.length} bay`}
          </button>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* budget */}
        <Section
          icon={Banknote}
          title="Anggaran Penyelesaian Anomali"
          description="Dari sheet ALOKASI ANGGARAN, dicocokkan ke tiap anomali. Satu nomor RAB yang tercantum di beberapa anomali dengan nilai sama dihitung satu kali."
        >
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-bold">Per pos & tahun anggaran</h3>
            {view.budgetByPos.map((b) => (
              <div key={b.label} className="grid grid-cols-[150px_1fr_96px] items-center gap-2 text-xs">
                <span className="truncate font-semibold">{b.label}</span>
                <div className="h-3.5 rounded bg-muted/50" title={`${b.label}: ${formatRupiah(b.nilai)}, ${b.count} anomali`}>
                  <div className="h-3.5 rounded bg-primary/70" style={{ width: `${(b.nilai / maxPos) * 100}%` }} />
                </div>
                <span className="text-right tabular-nums">{formatRupiah(b.nilai)}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-muted-foreground uppercase">
                  <th className="px-3 py-1.5 font-bold">Stream</th>
                  <th className="px-3 py-1.5 text-right font-bold">Anomali ber-RAB</th>
                  <th className="px-3 py-1.5 text-right font-bold">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {view.budgetByStream.map((b) => (
                  <tr key={b.label} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-semibold">{b.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{b.count}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatRupiah(b.nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unlinked.length > 0 && (
            <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 text-xs">
              <div className="mb-1 font-bold">
                Paket anggaran yang tidak terhubung ke anomali mana pun (
                {formatRupiah(unlinked.reduce((s, b) => s + (b.nilai ?? 0), 0))})
              </div>
              <ul className="flex flex-col gap-0.5">
                {unlinked.map((b, i) => (
                  <li key={i}>
                    {b.gardu} · {b.jenisAsset || "—"} · {b.anomali} — <b>{formatRupiah(b.nilai ?? 0)}</b>{" "}
                    <span className="text-muted-foreground">
                      ({[b.rab, b.pos, b.tahun].filter(Boolean).join(", ")})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-muted-foreground">
                Ditulis di tingkat GI, sedangkan anomalinya tercatat per bay dengan uraian berbeda. Tidak ikut dihitung di
                angka di atas.
              </p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Bila nilai di ALOKASI ANGGARAN ternyata per anomali (bukan per paket RAB), totalnya menjadi{" "}
            {formatRupiah(k.budgetPerItem)} untuk filter ULTG ini.
          </p>
        </Section>

        {/* completeness */}
        <Section
          icon={ClipboardCheck}
          title="Kelengkapan Data"
          description="Persentase anomali yang kolomnya sudah terisi. Kolom yang kosong membuat anomali tidak bisa dipantau (umur, keterlambatan, bukti BA)."
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-bold">Kolom</th>
                  {view.completeness.map((c) => (
                    <th key={c.ultg} className="px-3 py-2 text-right font-bold">
                      {c.ultg}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPLETENESS_FIELDS.map((f, fi) => (
                  <tr key={f.label} className="border-b last:border-0">
                    <td className="px-3 py-2 font-semibold">{f.label}</td>
                    {view.completeness.map((c) => {
                      const v = c.values[fi];
                      return (
                        <td key={c.ultg} className="px-3 py-2 text-right">
                          <span
                            className={cn(
                              "inline-block min-w-12 rounded px-1.5 py-0.5 text-xs font-bold tabular-nums",
                              v === null
                                ? "text-muted-foreground"
                                : v >= 0.9
                                  ? "bg-success/15 text-success"
                                  : v >= 0.5
                                    ? "bg-warning/20 text-warning-foreground"
                                    : "bg-critical/15 text-critical",
                            )}
                          >
                            {pct(v)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Hijau ≥ 90%, kuning 50–89%, merah &lt; 50%. Target hanya dinilai untuk item yang sudah masuk CE 2026.
          </p>
        </Section>
      </div>

      {/* full list */}
      <Section
        icon={Search}
        title="Daftar Anomali"
        description={`${tableRows.length} dari ${scoped.length} anomali sesuai filter.`}
        action={
          <ExportExcelButton
            filename={`Anomali-CE-UPT-Palangkaraya-${todayISO}.xlsx`}
            sheets={[
              {
                name: "Anomali",
                rows: tableRows.map((i) => ({
                  ULTG: shortUltg(i.ultg),
                  "Gardu Induk": i.gardu,
                  Bay: i.bay,
                  Periode: i.periode,
                  Stream: i.stream,
                  Indikator: i.indikator,
                  "Jenis Aset": i.jenisAsset,
                  Phasa: i.phasa,
                  Anomali: i.anomaliPemicu,
                  "Action Plan": i.actionPlan,
                  "Tanggal Temuan": i.tanggalTemuan ?? "",
                  Target: i.tanggalTarget ?? "",
                  Realisasi: i.tanggalRealisasi ?? "",
                  Status: i.status,
                  "Close/Open": i.done ? "CLOSE" : "OPEN",
                  RAB: i.budget?.rab ?? "",
                  Nilai: i.budget?.nilai ?? "",
                  "Pos Anggaran": [i.budget?.pos, i.budget?.tahun].filter(Boolean).join(" "),
                  PRK: i.budget?.nomorPrk ?? "",
                })),
              },
            ]}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari GI, bay, aset, anomali…"
              className="h-8 w-[240px] pl-7 text-sm"
            />
          </div>
          <Select value={stream} onValueChange={(v) => v && setStream(v)}>
            <SelectTrigger size="sm" className="w-[160px]" aria-label="Stream">
              <SelectValue>{stream === ALL ? "Semua stream" : stream}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua stream</SelectItem>
              {view.streams.map((s) => (
                <SelectItem key={s.label} value={s.label}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger size="sm" className="w-[170px]" aria-label="Status">
              <SelectValue>{status === ALL ? "Semua status" : status}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua status</SelectItem>
              {CE_STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[560px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2 font-bold">Lokasi</th>
                <th className="px-3 py-2 font-bold">Aset</th>
                <th className="px-3 py-2 font-bold">Anomali / Action plan</th>
                <th className="px-3 py-2 font-bold">Periode</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Target</th>
                <th className="px-3 py-2 text-right font-bold">RAB</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((i) => (
                <tr key={i.id} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{i.bay || i.gardu}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {giList(i).join(", ")} · ULTG {shortUltg(i.ultg)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="font-semibold">{i.jenisAsset || "—"}</div>
                    <div className="text-muted-foreground">
                      {i.stream}
                      {i.phasa && i.phasa !== "-" ? ` · ${i.phasa}` : ""}
                    </div>
                  </td>
                  <td className="max-w-[420px] px-3 py-2 text-xs">
                    <div>{i.anomaliPemicu || <i className="text-muted-foreground">uraian anomali kosong</i>}</div>
                    {i.actionPlan ? (
                      <div className="mt-0.5 text-muted-foreground">→ {i.actionPlan}</div>
                    ) : (
                      !i.done && <div className="mt-0.5 text-warning-foreground">Belum ada action plan</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-sm", isInCe(i) ? CE_BAR : BELUM_BAR)} />
                      {isInCe(i) ? i.periode : "Belum masuk CE"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={i.status} />
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{i.done ? "CLOSE" : "OPEN"}</div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-xs whitespace-nowrap",
                      isOverdue(i, todayISO) && "font-bold text-critical",
                    )}
                  >
                    {formatDate(i.tanggalTarget)}
                    {i.tanggalRealisasi && (
                      <div className="font-normal text-success">selesai {formatDate(i.tanggalRealisasi)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap tabular-nums">
                    {i.budget?.nilai ? formatRupiah(i.budget.nilai) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <ItemsDialog title={dialog?.title ?? ""} items={dialog?.items ?? null} onClose={() => setDialog(null)} />
    </div>
  );
}
