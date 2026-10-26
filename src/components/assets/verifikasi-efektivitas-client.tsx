"use client";

// Post-action effectiveness verification — every completed RENUS/CE
// intervention in the last year, with a before/after comparison scoped to
// the metric that actually applies to that kind of work (animal-caused
// gangguan for Anti Binatang, vegetation-caused for ROW/Pohon, AHI for
// equipment work, nothing at all for pure facility/civil work). Closes a
// loop this dashboard otherwise left open: completing work was tracked
// everywhere else, whether it actually helped was tracked nowhere.
import { useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Layers, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EFFECTIVENESS_CATEGORY_LABEL, type EffectivenessCategory } from "@/config/effectiveness-indicator-map";
import type { ActionEffectivenessCheck, EffectivenessVerdict } from "@/lib/action-effectiveness";

const ALL = "__all__";
const PAGE_SIZE = 20;

const VERDICT_STYLE: Record<EffectivenessVerdict, { label: string; icon: typeof TrendingUp; className: string }> = {
  membaik: { label: "Membaik", icon: TrendingUp, className: "border-success/40 bg-success/10 text-success" },
  tetap: { label: "Tetap", icon: Minus, className: "border-border bg-muted text-muted-foreground" },
  memburuk: { label: "Memburuk", icon: TrendingDown, className: "border-critical/40 bg-critical/10 text-critical" },
  belum_cukup_data: { label: "Belum cukup data", icon: CircleDashed, className: "border-border bg-muted/50 text-muted-foreground" },
  tidak_relevan: { label: "Tidak relevan", icon: Minus, className: "border-border bg-muted/30 text-muted-foreground" },
};

function VerdictPill({ verdict }: { verdict: EffectivenessVerdict }) {
  const { label, icon: Icon, className } = VERDICT_STYLE[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap", className)}>
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

/** Which of the two columns (AHI vs Gangguan) is the metric that actually
 *  applies to this check's own category — the "ahi" category is judged by
 *  AHI condition, "binatang"/"row" are judged by their own cause-filtered
 *  gangguan count, "tidak_relevan" is judged by neither. Used for the
 *  summary tiles and per-category breakdown so a facility item (always
 *  "tidak_relevan" on both columns) doesn't dilute those counts, and an
 *  Anti Binatang item's irrelevant AHI column doesn't either. */
function primaryVerdict(c: ActionEffectivenessCheck): EffectivenessVerdict {
  if (c.category === "ahi") return c.ahiVerdict;
  if (c.category === "tidak_relevan") return "tidak_relevan";
  return c.gangguanVerdict;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function formatShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

function BaselineNote({ c }: { c: ActionEffectivenessCheck }) {
  const b = c.gangguanBaseline;
  if (!b || b.avgOtherGiDelta === null) return null;
  const tone =
    b.relativeToBaseline === "lebih_baik"
      ? "text-success"
      : b.relativeToBaseline === "lebih_buruk"
        ? "text-critical"
        : "text-muted-foreground";
  const label =
    b.relativeToBaseline === "lebih_baik"
      ? "lebih baik dari GI lain"
      : b.relativeToBaseline === "lebih_buruk"
        ? "lebih buruk dari GI lain"
        : "sejalan tren GI lain";
  return (
    <p className={cn("text-[11px]", tone)} title={`Rata-rata perubahan di ${b.controlGiCount} GI lain tanpa intervensi pada periode yang sama: ${b.avgOtherGiDelta > 0 ? "+" : ""}${b.avgOtherGiDelta}`}>
      vs {b.controlGiCount} GI lain ({b.avgOtherGiDelta > 0 ? "+" : ""}
      {b.avgOtherGiDelta}) — {label}
    </p>
  );
}

export function VerifikasiEfektivitasClient({ checks }: { checks: ActionEffectivenessCheck[] }) {
  const [source, setSource] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [verdict, setVerdict] = useState(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const totalRawRows = useMemo(() => checks.reduce((s, c) => s + c.mergedCount, 0), [checks]);
  const mergedAwayCount = totalRawRows - checks.length;

  const filtered = useMemo(() => {
    const result = checks.filter(
      (c) =>
        (source === ALL || c.source.includes(source as "RENUS" | "CE")) &&
        (category === ALL || c.category === category) &&
        (verdict === ALL || primaryVerdict(c) === verdict) &&
        (search.trim() === "" ||
          c.gi.toLowerCase().includes(search.trim().toLowerCase()) ||
          c.description.toLowerCase().includes(search.trim().toLowerCase())),
    );
    return result;
  }, [checks, source, category, verdict, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const paged = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  function resetToFirstPage() {
    setPage(0);
  }

  const summary = useMemo(() => {
    const scored = checks.filter((c) => c.category !== "tidak_relevan");
    return {
      total: checks.length,
      membaik: scored.filter((c) => primaryVerdict(c) === "membaik").length,
      memburuk: scored.filter((c) => primaryVerdict(c) === "memburuk").length,
      pending: scored.filter((c) => primaryVerdict(c) === "belum_cukup_data").length,
      tidakRelevan: checks.length - scored.length,
    };
  }, [checks]);

  const byCategory = useMemo(() => {
    const categories = Object.keys(EFFECTIVENESS_CATEGORY_LABEL) as EffectivenessCategory[];
    return categories
      .map((cat) => {
        const items = checks.filter((c) => c.category === cat);
        return {
          category: cat,
          label: EFFECTIVENESS_CATEGORY_LABEL[cat],
          total: items.length,
          membaik: items.filter((c) => primaryVerdict(c) === "membaik").length,
          tetap: items.filter((c) => primaryVerdict(c) === "tetap").length,
          memburuk: items.filter((c) => primaryVerdict(c) === "memburuk").length,
          pending: items.filter((c) => primaryVerdict(c) === "belum_cukup_data").length,
        };
      })
      .filter((row) => row.total > 0);
  }, [checks]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-primary" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-foreground">{summary.total}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Intervensi Diverifikasi</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-success" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-success">{summary.membaik}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Membaik</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-critical" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-critical">{summary.memburuk}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Memburuk</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-border" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-foreground">{summary.pending}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Belum Cukup Data</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-border" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-muted-foreground">{summary.tidakRelevan}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tidak Dinilai</div>
          </div>
        </div>
      </div>

      {mergedAwayCount > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers className="size-3.5 shrink-0" />
          {totalRawRows} baris RENUS/CE asli digabung menjadi {checks.length} intervensi ({mergedAwayCount} baris
          tergabung — GI, jenis pekerjaan, dan tanggal realisasi yang sama dihitung sebagai satu intervensi).
        </p>
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto py-4">
          <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Ringkasan per Jenis Pekerjaan</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2 font-bold">Jenis Pekerjaan</th>
                <th className="px-3 py-2 font-bold text-right">Total</th>
                <th className="px-3 py-2 font-bold text-right">Membaik</th>
                <th className="px-3 py-2 font-bold text-right">Tetap</th>
                <th className="px-3 py-2 font-bold text-right">Memburuk</th>
                <th className="px-3 py-2 font-bold text-right">Belum Cukup Data</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((row) => (
                <tr key={row.category} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">{row.membaik || "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.tetap || "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-critical">{row.memburuk || "–"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.pending || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={source}
          onValueChange={(v) => {
            if (v) setSource(v);
            resetToFirstPage();
          }}
        >
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="Sumber">{source === ALL ? "Semua Sumber" : source}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Sumber</SelectItem>
            <SelectItem value="RENUS">RENUS</SelectItem>
            <SelectItem value="CE">CE</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(v) => {
            if (v) setCategory(v);
            resetToFirstPage();
          }}
        >
          <SelectTrigger size="sm" className="w-[220px]">
            <SelectValue placeholder="Jenis Pekerjaan">
              {category === ALL ? "Semua Jenis Pekerjaan" : EFFECTIVENESS_CATEGORY_LABEL[category as EffectivenessCategory]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Jenis Pekerjaan</SelectItem>
            {(Object.keys(EFFECTIVENESS_CATEGORY_LABEL) as EffectivenessCategory[]).map((cat) => (
              <SelectItem key={cat} value={cat}>
                {EFFECTIVENESS_CATEGORY_LABEL[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={verdict}
          onValueChange={(v) => {
            if (v) setVerdict(v);
            resetToFirstPage();
          }}
        >
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue placeholder="Hasil">{verdict === ALL ? "Semua Hasil" : VERDICT_STYLE[verdict as EffectivenessVerdict].label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Hasil</SelectItem>
            <SelectItem value="membaik">Membaik</SelectItem>
            <SelectItem value="tetap">Tetap</SelectItem>
            <SelectItem value="memburuk">Memburuk</SelectItem>
            <SelectItem value="belum_cukup_data">Belum cukup data</SelectItem>
            <SelectItem value="tidak_relevan">Tidak relevan</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetToFirstPage();
          }}
          placeholder="Cari GI atau deskripsi..."
          className="h-8 w-[220px] text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada pekerjaan pada filter ini.</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-bold">Sumber</th>
                  <th className="px-3 py-2.5 font-bold">GI</th>
                  <th className="px-3 py-2.5 font-bold">Jenis Pekerjaan</th>
                  <th className="px-3 py-2.5 font-bold">Deskripsi</th>
                  <th className="px-3 py-2.5 font-bold">Selesai</th>
                  <th className="px-3 py-2.5 font-bold">AHI Sebelum → Sesudah</th>
                  <th className="px-3 py-2.5 font-bold">Verdict AHI</th>
                  <th className="px-3 py-2.5 font-bold">Gangguan Sebelum → Sesudah (90 hari)</th>
                  <th className="px-3 py-2.5 font-bold">Verdict Gangguan</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{c.source.join(", ")}</td>
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                      {c.gi}
                      {c.mergedCount > 1 ? (
                        <span
                          className="ml-1.5 inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                          title={`${c.mergedCount} baris sumber digabung menjadi satu intervensi ini`}
                        >
                          ×{c.mergedCount}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{c.categoryLabel}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground" title={c.description}>
                      {c.description}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatShort(c.realisasiDate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {c.ahiBeforeAvg !== null && c.ahiAfterAvg !== null
                        ? `${c.ahiBeforeAvg.toFixed(1)} → ${c.ahiAfterAvg.toFixed(1)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <VerdictPill verdict={c.ahiVerdict} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {c.category === "tidak_relevan"
                        ? "—"
                        : c.gangguanVerdict === "belum_cukup_data" && c.daysSinceAction < 90
                          ? `${c.daysSinceAction} hari berjalan`
                          : `${c.gangguanBefore} → ${c.gangguanAfter}`}
                      <BaselineNote c={c} />
                    </td>
                    <td className="px-3 py-2">
                      <VerdictPill verdict={c.gangguanVerdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pageCount > 1 ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Menampilkan {pageSafe * PAGE_SIZE + 1}–{Math.min(filtered.length, (pageSafe + 1) * PAGE_SIZE)} dari {filtered.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" disabled={pageSafe === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    Sebelumnya
                  </Button>
                  <span className="px-1 text-xs text-muted-foreground">
                    {pageSafe + 1} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pageSafe >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p>
            Perbandingan langsung sebelum vs sesudah tanggal realisasi — bukan bukti sebab-akibat (faktor lain bisa
            ikut memengaruhi AHI/gangguan di periode yang sama, termasuk cuaca musiman yang memengaruhi semua GI
            sekaligus — lihat catatan pembanding di kolom Gangguan).
          </p>
          <p>
            <span className="font-semibold text-foreground">Jenis pekerjaan menentukan apa yang dinilai:</span>{" "}
            Anti Binatang dinilai dari gangguan berpenyebab hewan saja, Penebangan ROW/Pohon dari gangguan
            berpenyebab tegakan/pohon saja, Pengujian Ulang/Perbaikan Peralatan dari kondisi AHI. Pekerjaan
            fasilitas/sipil (atap, AC, pagar, pondasi) tidak dinilai sama sekali — tidak ada skor AHI atau pola
            gangguan yang relevan untuk jenis pekerjaan ini.
          </p>
          <p>
            <span className="font-semibold text-foreground">Pembanding GI lain:</span> untuk hasil gangguan,
            perubahan di GI ini dibandingkan dengan rata-rata perubahan di GI lain yang TIDAK ada intervensi pada
            periode yang sama — membantu membedakan efek pekerjaan ini dari tren umum (mis. musim kemarau yang
            menurunkan gangguan petir di semua GI).
          </p>
          <p>
            <span className="font-semibold text-foreground">AHI:</span> dibandingkan dengan hasil uji{" "}
            <span className="font-semibold text-foreground">terdekat sebelum</span> dan{" "}
            <span className="font-semibold text-foreground">terdekat sesudah</span> tanggal realisasi — tidak
            dibatasi jumlah hari, jadi hasil uji berikutnya tetap dipakai meski baru dilakukan beberapa bulan
            kemudian.
          </p>
          <p>
            <span className="font-semibold text-foreground">Gangguan:</span> dibandingkan jumlah kejadian dalam{" "}
            <span className="font-semibold text-foreground">90 hari sebelum</span> vs{" "}
            <span className="font-semibold text-foreground">90 hari sesudah</span> tanggal realisasi. &ldquo;Belum
            cukup data&rdquo; untuk gangguan berarti belum genap 90 hari berjalan sejak pekerjaan selesai; untuk AHI
            berarti belum ada hasil uji setelahnya.
          </p>
          <p>
            Satu intervensi = GI + jenis pekerjaan + tanggal realisasi yang sama — beberapa baris RENUS/CE yang
            memenuhi ketiganya digabung menjadi satu baris di sini, jumlah penggabungan ditandai dengan badge
            &ldquo;×N&rdquo;. Hanya pekerjaan yang selesai dalam{" "}
            <span className="font-semibold text-foreground">1 tahun terakhir</span> yang ikut diverifikasi.
          </p>
        </div>
      </div>
    </div>
  );
}
