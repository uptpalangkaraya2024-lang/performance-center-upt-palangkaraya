"use client";

import { useMemo, useState } from "react";
import { Clock, Crosshair, Gauge, Waypoints } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PHASE_BUCKETS,
  buildCircuitRates,
  buildHourMatrix,
  buildLocatorAccuracy,
  buildPhaseBreakdown,
  periodYears,
  type LocatorTool,
  type PhaseBucket,
  type PhaseRow,
  type TransmissionAnalyticsEvent,
} from "@/lib/transmission-analytics";

const ALL = "__all__";

const CAUSE_COLOR: Record<string, string> = {
  Petir: "var(--chart-1)",
  Hewan: "var(--chart-4)",
  "Tegakan / Pohon": "var(--chart-2)",
};

// Single positions get strong distinct hues; each two-position combo gets
// a hue between its two members' so "Atas-Tengah" reads as related to both.
const PHASE_COLOR: Record<PhaseBucket, string> = {
  Atas: "#dc2626",
  Tengah: "#d97706",
  Bawah: "#2563eb",
  "Atas-Tengah": "#db2777",
  "Tengah-Bawah": "#0d9488",
  "Atas-Bawah": "#7c3aed",
  "3 fasa": "#475569",
  "Urutan belum diketahui": "#94a3b8",
};

const fmt1 = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

function rateTone(rate: number): string {
  if (rate >= 10) return "bg-critical/15 text-critical";
  if (rate >= 5) return "bg-warning/20 text-warning-foreground";
  return "bg-success/15 text-success";
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Gauge;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
          <Icon className="size-5 text-primary" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data pada periode ini.</p>;
}

function PhaseBar({ row }: { row: PhaseRow }) {
  return (
    <div className="flex h-4 min-w-[140px] overflow-hidden rounded">
      {PHASE_BUCKETS.filter((b) => row.buckets[b] > 0).map((b) => (
        <span
          key={b}
          title={`${b}: ${row.buckets[b]} kejadian`}
          style={{ width: `${(row.buckets[b] / row.total) * 100}%`, backgroundColor: PHASE_COLOR[b] }}
        />
      ))}
    </div>
  );
}

/** Four simple, high-impact views over REKAP GANGGUAN columns the page
 *  didn't use before (per user request) — see transmission-analytics.ts.
 *  One shared year filter; everything recomputes client-side. */
export function TransmissionAnalyticsSection({
  events,
  years,
  todayISO,
}: {
  events: TransmissionAnalyticsEvent[];
  years: string[];
  todayISO: string;
}) {
  const [year, setYear] = useState(ALL);

  const view = useMemo(() => {
    const scoped = year === ALL ? events : events.filter((e) => e.year === year);
    const span = periodYears(year === ALL ? years : [year], todayISO);
    return {
      scoped,
      span,
      rates: buildCircuitRates(scoped, span, year === ALL ? 3 : 2),
      hours: buildHourMatrix(scoped),
      phases: buildPhaseBreakdown(scoped),
      locator: buildLocatorAccuracy(scoped),
    };
  }, [events, years, todayISO, year]);

  if (events.length === 0) return null;

  const maxRate = view.rates[0]?.ratePer100KmsYear ?? 1;
  const bestTool = [...view.locator.overall].filter((t) => t.count >= 5).sort((a, b) => b.within2Pct - a.within2Pct)[0]?.tool;
  const periodLabel = year === ALL ? `${years[0]}–${years.at(-1)}` : year;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Analisa Lanjutan Transmisi</h2>
          <p className="text-xs text-muted-foreground">
            {view.scoped.length} gangguan Transmisi masuk kinerja, periode {periodLabel}. Laporan dari kedua ujung
            saluran untuk kejadian yang sama dihitung satu kali.
          </p>
        </div>
        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger size="sm" className="w-[140px]" aria-label="Tahun">
            <SelectValue>{year === ALL ? "Semua Tahun" : year}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Tahun</SelectItem>
            {[...years].reverse().map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          icon={Gauge}
          title="Laju Gangguan per 100 kms"
          description={`Jumlah gangguan dibagi panjang sirkit, per tahun. Saluran panjang wajar punya lebih banyak gangguan, jadi angka ini yang adil untuk membandingkan sirkit. Trip berarti reclose gagal, tanda gangguan permanen. Sirkit dengan kurang dari ${year === ALL ? 3 : 2} kejadian disembunyikan.`}
        >
          {view.rates.length === 0 ? (
            <Empty />
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2.5 font-bold">Sirkit</th>
                    <th className="px-3 py-2.5 text-right font-bold">Panjang</th>
                    <th className="px-3 py-2.5 text-right font-bold">Kejadian</th>
                    <th className="px-3 py-2.5 text-right font-bold">Per 100 kms/thn</th>
                    <th className="px-3 py-2.5 text-right font-bold">Trip</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rates.map((r) => (
                    <tr key={r.circuit} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{r.circuit}</div>
                        <div className="mt-1 h-1.5 rounded bg-critical/70" style={{ width: `${(r.ratePer100KmsYear / maxRate) * 100}%` }} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums">{fmt1(r.kms)} kms</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold tabular-nums", rateTone(r.ratePer100KmsYear))}>
                          {fmt1(r.ratePer100KmsYear)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {r.trip > 0 ? (
                          <span className="font-bold text-critical">
                            {r.trip} <span className="text-xs font-normal text-muted-foreground">({Math.round((r.trip / r.count) * 100)}%)</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={Clock}
          title="Pola Jam Kejadian per Penyebab"
          description="Jam trip tiap penyebab. Dipakai untuk mengatur jadwal siaga dan patroli, dan untuk menilai jarak aman vegetasi pada jam konduktor paling melendut. Warna makin pekat berarti makin banyak kejadian pada jam itu."
        >
          {view.hours.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[600px] gap-0.5" style={{ gridTemplateColumns: "96px repeat(24, minmax(18px, 1fr))" }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center font-mono text-[10px] text-muted-foreground">
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
                {view.hours.map((s) => {
                  const max = Math.max(...s.counts, 1);
                  const color = CAUSE_COLOR[s.cause] ?? "var(--muted-foreground)";
                  return [
                    <div key={`${s.cause}-l`} className="self-center truncate pr-1 text-xs font-semibold" title={`${s.cause} (${s.total})`}>
                      {s.cause}
                    </div>,
                    ...s.counts.map((v, h) => (
                      <div
                        key={`${s.cause}-${h}`}
                        title={`${s.cause}, jam ${String(h).padStart(2, "0")}.00: ${v} kejadian`}
                        className="grid h-7 place-items-center rounded-sm font-mono text-[10px] text-foreground"
                        style={{
                          backgroundColor: v
                            ? `color-mix(in srgb, ${color} ${Math.round(15 + (v / max) * 75)}%, var(--muted))`
                            : "var(--muted)",
                        }}
                      >
                        {v || ""}
                      </div>
                    )),
                  ];
                })}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={Waypoints}
          title="Fasa Terganggu"
          description="Posisi konduktor yang terganggu (atas, tengah, bawah). Huruf R/S/T dari laporan diterjemahkan memakai urutan fasa SIGAP pada tower lokasi gangguan, karena urutan tiap sirkit berbeda dan sebagian ruas ditranspose. Bila satu penyebab atau satu sirkit terus kena di posisi yang sama, perbaikan bisa difokuskan ke posisi itu. Gangguan yang towernya tidak tercatat di ruas yang ditranspose masuk Urutan belum diketahui."
        >
          {view.phases.byCause.length === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                      <th className="px-3 py-2.5 font-bold">Penyebab / Sirkit</th>
                      <th className="px-3 py-2.5 font-bold">Komposisi fasa</th>
                      <th className="px-3 py-2.5 text-right font-bold">Dominan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...view.phases.byCause.map((r) => ({ r, isCause: true })),
                      ...view.phases.byCircuit.map((r) => ({ r, isCause: false })),
                    ].map(({ r, isCause }, i) => (
                      <tr
                        key={`${isCause ? "c" : "s"}-${r.label}`}
                        className={cn("border-b last:border-0", !isCause && i === view.phases.byCause.length && "border-t-2")}
                      >
                        <td className={cn("px-3 py-2", isCause ? "font-bold text-foreground" : "text-foreground")}>
                          {r.label} <span className="text-xs font-normal text-muted-foreground">({r.total})</span>
                          {!isCause ? (
                            <div className="text-[11px] text-muted-foreground">
                              Urutan atas-bawah:{" "}
                              <span className="font-mono font-semibold text-foreground">
                                {r.order ? r.order.split("").join("-") : r.orderVaries ? "bervariasi (transposisi)" : "belum diketahui"}
                              </span>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <PhaseBar row={r} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                          {r.dominant} <span className="text-muted-foreground">{Math.round((r.buckets[r.dominant] / r.total) * 100)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {PHASE_BUCKETS.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1">
                    <span className="size-3 rounded-sm" style={{ backgroundColor: PHASE_COLOR[b] }} />
                    {b}
                  </span>
                ))}
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          icon={Crosshair}
          title="Akurasi Alat Fault Locator"
          description="Selisih tower antara prediksi tiap alat dan tower yang ditemukan di lapangan (TEMUAN LAPANGAN). Menunjukkan alat mana yang paling bisa diandalkan saat mencari titik gangguan, dan bahan evaluasi kalibrasi alat."
        >
          {view.locator.overall.every((t) => t.count === 0) ? (
            <Empty />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {view.locator.overall.map((t) => (
                  <div
                    key={t.tool}
                    className={cn("flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3", t.tool === bestTool && "border-success/60")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{t.tool}</span>
                      {t.tool === bestTool ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">terbaik</span>
                      ) : null}
                    </div>
                    {t.count === 0 ? (
                      <span className="text-xs text-muted-foreground">Tidak ada data.</span>
                    ) : (
                      <>
                        <div className="text-2xl font-extrabold tabular-nums">{t.within2Pct}%</div>
                        <div className="text-[11px] text-muted-foreground">meleset ≤ 2 tower</div>
                        <div className="h-1.5 overflow-hidden rounded bg-muted">
                          <div className={cn("h-full", t.tool === bestTool ? "bg-success" : "bg-primary")} style={{ width: `${t.within2Pct}%` }} />
                        </div>
                        <dl className="grid grid-cols-[1fr_auto] gap-x-2 text-[11px] text-muted-foreground">
                          <dt>Dibandingkan</dt>
                          <dd className="text-right font-semibold text-foreground tabular-nums">{t.count}</dd>
                          <dt>Tepat sama</dt>
                          <dd className="text-right font-semibold text-foreground tabular-nums">{t.exactPct}%</dd>
                          <dt>≤ 5 tower</dt>
                          <dd className="text-right font-semibold text-foreground tabular-nums">{t.within5Pct}%</dd>
                          <dt>&gt; 20 tower</dt>
                          <dd className="text-right font-semibold text-foreground tabular-nums">{t.over20Pct}%</dd>
                          <dt>Median</dt>
                          <dd className="text-right font-semibold text-foreground tabular-nums">{t.medianDelta ?? "—"} tower</dd>
                        </dl>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="max-h-[260px] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                      <th className="px-3 py-2 font-bold">Ruas</th>
                      {view.locator.overall.map((t) => (
                        <th key={t.tool} className="px-3 py-2 text-right font-bold">
                          {t.tool} ≤2
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.locator.byRuas.map((r) => (
                      <tr key={r.ruas} className="border-b last:border-0">
                        <td className="px-3 py-1.5 text-foreground">
                          {r.ruas} <span className="text-xs text-muted-foreground">({r.total})</span>
                        </td>
                        {(Object.keys(r.tools) as LocatorTool[]).map((tool) => {
                          const v = r.tools[tool];
                          return (
                            <td key={tool} className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                              {v ? (
                                <span
                                  className={cn(
                                    "font-semibold",
                                    v.within2Pct >= 70 ? "text-success" : v.within2Pct >= 40 ? "text-warning-foreground" : "text-critical",
                                  )}
                                >
                                  {v.within2Pct}% <span className="text-xs font-normal text-muted-foreground">/{v.count}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </section>
  );
}
