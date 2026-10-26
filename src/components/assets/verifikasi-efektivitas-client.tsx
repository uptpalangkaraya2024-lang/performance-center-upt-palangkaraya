"use client";

// Post-action effectiveness verification — every completed RENUS/CE item
// in the last year, with a before/after comparison of AHI condition and
// gangguan frequency at that GI. Closes a loop this dashboard otherwise
// left open: completing work was tracked everywhere else, whether it
// actually helped was tracked nowhere.
import { useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ActionEffectivenessCheck, EffectivenessVerdict } from "@/lib/action-effectiveness";

const ALL = "__all__";

const VERDICT_STYLE: Record<EffectivenessVerdict, { label: string; icon: typeof TrendingUp; className: string }> = {
  membaik: { label: "Membaik", icon: TrendingUp, className: "border-success/40 bg-success/10 text-success" },
  tetap: { label: "Tetap", icon: Minus, className: "border-border bg-muted text-muted-foreground" },
  memburuk: { label: "Memburuk", icon: TrendingDown, className: "border-critical/40 bg-critical/10 text-critical" },
  belum_cukup_data: { label: "Belum cukup data", icon: CircleDashed, className: "border-border bg-muted/50 text-muted-foreground" },
};

function VerdictPill({ verdict }: { verdict: EffectivenessVerdict }) {
  const { label, icon: Icon, className } = VERDICT_STYLE[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap", className)}>
      <Icon className="size-3.5" /> {label}
    </span>
  );
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function formatShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

export function VerifikasiEfektivitasClient({ checks }: { checks: ActionEffectivenessCheck[] }) {
  const [source, setSource] = useState(ALL);
  const [ahiVerdict, setAhiVerdict] = useState(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      checks.filter(
        (c) =>
          (source === ALL || c.source === source) &&
          (ahiVerdict === ALL || c.ahiVerdict === ahiVerdict) &&
          (search.trim() === "" ||
            c.gi.toLowerCase().includes(search.trim().toLowerCase()) ||
            c.description.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [checks, source, ahiVerdict, search],
  );

  const summary = useMemo(() => {
    const withAhiData = checks.filter((c) => c.ahiVerdict !== "belum_cukup_data");
    return {
      total: checks.length,
      membaik: checks.filter((c) => c.ahiVerdict === "membaik").length,
      memburuk: checks.filter((c) => c.ahiVerdict === "memburuk").length,
      pending: checks.filter((c) => c.ahiVerdict === "belum_cukup_data").length,
      withAhiDataCount: withAhiData.length,
    };
  }, [checks]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-primary" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-foreground">{summary.total}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Total Diverifikasi</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-success" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-success">{summary.membaik}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AHI Membaik</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-critical" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-critical">{summary.memburuk}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">AHI Memburuk</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-border" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-foreground">{summary.pending}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Belum Ada Data Uji</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={source} onValueChange={(v) => v && setSource(v)}>
          <SelectTrigger size="sm" className="w-[140px]">
            <SelectValue placeholder="Sumber">{source === ALL ? "Semua Sumber" : source}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Sumber</SelectItem>
            <SelectItem value="RENUS">RENUS</SelectItem>
            <SelectItem value="CE">CE</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ahiVerdict} onValueChange={(v) => v && setAhiVerdict(v)}>
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue placeholder="Hasil AHI">
              {ahiVerdict === ALL ? "Semua Hasil AHI" : VERDICT_STYLE[ahiVerdict as EffectivenessVerdict].label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Hasil AHI</SelectItem>
            <SelectItem value="membaik">Membaik</SelectItem>
            <SelectItem value="tetap">Tetap</SelectItem>
            <SelectItem value="memburuk">Memburuk</SelectItem>
            <SelectItem value="belum_cukup_data">Belum cukup data</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
                  <th className="px-3 py-2.5 font-bold">Deskripsi</th>
                  <th className="px-3 py-2.5 font-bold">Selesai</th>
                  <th className="px-3 py-2.5 font-bold">AHI Sebelum → Sesudah</th>
                  <th className="px-3 py-2.5 font-bold">Verdict AHI</th>
                  <th className="px-3 py-2.5 font-bold">Gangguan Sebelum → Sesudah (90 hari)</th>
                  <th className="px-3 py-2.5 font-bold">Verdict Gangguan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{c.source}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{c.gi}</td>
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
                      {c.gangguanVerdict === "belum_cukup_data" && c.daysSinceAction < 90
                        ? `${c.daysSinceAction} hari berjalan`
                        : `${c.gangguanBefore} → ${c.gangguanAfter}`}
                    </td>
                    <td className="px-3 py-2">
                      <VerdictPill verdict={c.gangguanVerdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p>
            Perbandingan langsung sebelum vs sesudah tanggal realisasi — bukan bukti sebab-akibat (faktor lain bisa
            ikut memengaruhi AHI/gangguan di periode yang sama).
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
            Hanya pekerjaan yang selesai dalam <span className="font-semibold text-foreground">1 tahun terakhir</span>{" "}
            yang ikut diverifikasi — yang lebih lama dianggap sudah terlalu lama untuk relevan dicek ulang.
          </p>
        </div>
      </div>
    </div>
  );
}
