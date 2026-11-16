"use client";

import { useMemo, useState } from "react";
import { Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  R_LIMIT_OHM,
  type LightningPriorityLevel,
  type LightningPriorityRange,
  type LightningTower,
} from "@/lib/lightning-priority";

const ALL = "__all__";

const PRIORITY_TONE: Record<LightningPriorityLevel, string> = {
  Tinggi: "bg-critical text-white",
  Sedang: "bg-warning text-warning-foreground",
  Rendah: "bg-success/20 text-success",
};

const fmtOhm = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

function rTone(r: number | null): string {
  if (r === null) return "text-muted-foreground";
  return r > R_LIMIT_OHM ? "font-bold text-critical" : "text-success";
}

/** One tower in a range strip: red frame + strike count when lightning
 *  tripped the line there, TLA tag when fitted, footing resistance below. */
function TowerCell({ t }: { t: LightningTower }) {
  const hit = t.hits > 0;
  return (
    <div
      className={cn(
        "flex w-[58px] shrink-0 flex-col items-center rounded border px-1 py-1 text-[11px] leading-tight",
        hit ? "border-2 border-critical bg-critical/10" : "bg-muted/30",
      )}
      title={
        !t.inSigap
          ? `T.${t.towerNo}: tidak ada di SIGAP`
          : `T.${t.towerNo}: ${t.hits} gangguan petir · ${t.tla ? "sudah TLA" : "belum TLA"} · R ${
              t.rOhm === null ? "belum diukur" : `${fmtOhm(t.rOhm)} Ω`
            }${t.sambaran !== null ? ` · ${t.sambaran} sambaran (SIGAP)` : ""}`
      }
    >
      <span className={cn("font-semibold", hit ? "text-critical" : "text-muted-foreground")}>
        {t.towerNo}
        {hit && <span className="ml-0.5">⚡{t.hits > 1 ? t.hits : ""}</span>}
      </span>
      {t.inSigap ? (
        <>
          <span className={cn("tabular-nums", rTone(t.rOhm))}>{t.rOhm === null ? "R –" : `${fmtOhm(t.rOhm)} Ω`}</span>
          <span
            className={cn(
              "mt-0.5 rounded px-1 text-[10px] font-bold",
              t.tla ? "bg-primary text-primary-foreground" : "text-muted-foreground/70",
            )}
          >
            {t.tla ? "TLA" : "no TLA"}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground/70">n/a</span>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", tone)}>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const towerList = (nos: string[]) => nos.map((n) => `T.${n}`).join(", ");

/** Repeat-lightning stretches (5 towers, 2+ PETIR trips) ranked for TLA /
 *  grounding work: which struck towers still have no arrester, high or
 *  unmeasured footing resistance. Meant as the shortlist behind an
 *  investment/maintenance proposal. */
export function LightningPriorityCard({
  ranges,
  sigapAvailable,
}: {
  ranges: LightningPriorityRange[];
  sigapAvailable: boolean;
}) {
  const [unit, setUnit] = useState<string>(ALL);
  const [selected, setSelected] = useState<LightningPriorityRange | null>(null);

  const units = useMemo(() => [...new Set(ranges.map((r) => r.unit))].sort(), [ranges]);
  const view = useMemo(() => {
    const scoped = unit === ALL ? ranges : ranges.filter((r) => r.unit === unit);
    const struck = scoped.flatMap((r) => r.towers.filter((t) => t.hits > 0 && t.inSigap));
    return {
      scoped,
      high: scoped.filter((r) => r.priority === "Tinggi").length,
      struck: struck.length,
      noTla: struck.filter((t) => !t.tla).length,
      highR: struck.filter((t) => t.rOhm !== null && t.rOhm > R_LIMIT_OHM).length,
      unmeasured: struck.filter((t) => t.rOhm === null).length,
    };
  }, [ranges, unit]);

  if (ranges.length === 0) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
            <Zap className="size-5 text-primary" />
            Prioritas Pemasangan TLA &amp; Perbaikan Pentanahan
          </CardTitle>
          <Select value={unit} onValueChange={(v) => v && setUnit(v)}>
            <SelectTrigger size="sm" className="w-[210px]" aria-label="ULTG">
              <SelectValue>{unit === ALL ? "Semua ULTG" : unit}</SelectValue>
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
        </div>
        <p className="text-xs text-muted-foreground">
          Rentang 5 tower dengan 2 atau lebih gangguan petir (REKAP GANGGUAN, seluruh tahun), digabung dengan data
          SIGAP per tower: terpasang TLA atau belum, dan tahanan pentanahan total. Prioritas <b>Tinggi</b>: ada tower
          tersambar yang belum TLA dan pentanahannya di atas {R_LIMIT_OHM} Ω atau belum diukur. <b>Sedang</b>: masih
          ada salah satu kekurangan. <b>Rendah</b>: semua tower tersambar sudah TLA dan pentanahannya baik, jadi
          penyebab berulangnya perlu dicari di tempat lain (isolator, sudut lindung kawat tanah).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!sigapAvailable && (
          <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
            Data SIGAP sedang tidak bisa diambil, jadi status TLA dan pentanahan belum tampil.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label="Rentang petir berulang" value={String(view.scoped.length)} hint={`${view.high} prioritas tinggi`} />
          <Kpi
            label="Tower tersambar belum TLA"
            value={String(view.noTla)}
            hint={`dari ${view.struck} tower tersambar`}
            tone={view.noTla > 0 ? "border-critical/40 bg-critical/5" : undefined}
          />
          <Kpi
            label={`Pentanahan > ${R_LIMIT_OHM} Ω`}
            value={String(view.highR)}
            hint="tower tersambar"
            tone={view.highR > 0 ? "border-critical/40 bg-critical/5" : undefined}
          />
          <Kpi
            label="Pentanahan belum diukur"
            value={String(view.unmeasured)}
            hint="tower tersambar, tidak ada nilai di SIGAP"
            tone={view.unmeasured > 0 ? "border-warning/50 bg-warning/5" : undefined}
          />
        </div>

        <div className="relative max-h-[560px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2.5 font-bold">Prioritas</th>
                <th className="px-3 py-2.5 font-bold">Ruas / Rentang</th>
                <th className="px-3 py-2.5 text-right font-bold">Ggn Petir</th>
                <th className="px-3 py-2.5 font-bold">Kondisi tower</th>
                <th className="px-3 py-2.5 text-right font-bold">Sambaran SIGAP</th>
                <th className="px-3 py-2.5 font-bold">Rekomendasi</th>
              </tr>
            </thead>
            <tbody>
              {view.scoped.map((r) => (
                <tr key={`${r.ruasSection}-${r.fromTowerNo}`} className="border-b align-top last:border-0">
                  <td className="px-3 py-2">
                    <span className={cn("rounded px-2 py-0.5 text-xs font-bold", PRIORITY_TONE[r.priority])}>
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold whitespace-nowrap">{r.ruasSection}</div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      T.{r.fromTowerNo}–T.{r.toTowerNo} · {r.unit}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="font-bold tabular-nums text-critical underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      title="Lihat tanggal tiap gangguan"
                    >
                      {r.count}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {r.towers.map((t) => (
                        <TowerCell key={t.towerNo} t={t} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.sambaranTotal > 0 ? r.sambaranTotal.toLocaleString("id-ID") : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <ul className="flex min-w-[200px] flex-col gap-0.5">
                      {r.needTla.length > 0 && (
                        <li>
                          <b>Pasang TLA:</b> {towerList(r.needTla)}
                        </li>
                      )}
                      {r.needGrounding.length > 0 && (
                        <li>
                          <b>Perbaiki pentanahan:</b> {towerList(r.needGrounding)}
                        </li>
                      )}
                      {r.needMeasurement.length > 0 && (
                        <li>
                          <b>Ukur pentanahan:</b> {towerList(r.needMeasurement)}
                        </li>
                      )}
                      {r.priority === "Rendah" && (
                        <li className="text-muted-foreground">
                          Sudah TLA dan pentanahan baik. Cek isolator dan sudut lindung.
                        </li>
                      )}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Kotak tower: ⚡ = tower tempat gangguan petir tercatat (angka = jumlah kejadian bila lebih dari satu), nilai
          Ω = tahanan pentanahan total dari SIGAP (merah bila di atas {R_LIMIT_OHM} Ω), TLA = sudah terpasang arrester.
          Sambaran SIGAP = jumlah sambaran petir tercatat di sekitar kelima tower, seluruh tahun. SIGAP tidak mencatat
          tanggal pemasangan TLA, jadi tower bertanda TLA bisa saja baru dipasang setelah gangguannya.
        </p>
      </CardContent>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected ? `${selected.ruasSection} T.${selected.fromTowerNo}–T.${selected.toTowerNo}` : ""}
            </DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col divide-y text-sm">
            {selected?.incidents.map((i) => (
              <li key={i.tgl} className="flex justify-between gap-3 py-2">
                <span>{i.tgl.slice(0, 10)}</span>
                <span className="text-muted-foreground">{towerList(i.towerNos)}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
