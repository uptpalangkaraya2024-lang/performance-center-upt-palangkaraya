"use client";

import { useState } from "react";
import { Flame } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { GangguanHotspot, GangguanTowerRange } from "@/lib/gangguan-hotspots";

type ViewMode = "range5" | "range10" | "tower";

const VIEW_LABEL: Record<ViewMode, string> = {
  range5: "Per rentang 5 tower",
  range10: "Per rentang 10 tower",
  tower: "Per tower",
};

/** Heat shading for one tower cell inside a range strip — how many of the
 *  range's incidents named that tower. Same critical hue family as the
 *  rest of the page, stepped so a 1-mention tower is clearly different
 *  from a 4-mention one at a glance. */
function cellClass(count: number): string {
  if (count >= 4) return "bg-critical text-white border-critical";
  if (count === 3) return "bg-critical/75 text-white border-critical/75";
  if (count === 2) return "bg-critical/45 text-foreground border-critical/50";
  if (count === 1) return "bg-critical/20 text-foreground border-critical/30";
  return "bg-muted/40 text-muted-foreground/60";
}

/** Ranked list of towers (or fixed stretches of 5/10 towers) with 2+
 *  recorded gangguan — a location-specific complement to the page's own
 *  cause-only Pareto charts. Transmisi-only (towers belong to SUTT lines,
 *  Trafo gangguan has no tower to attribute to), so this sits once at the
 *  top of the page rather than once per category. The range views exist
 *  because a repeat problem is often the same STRETCH of line rather than
 *  one tower (per user); see gangguan-hotspots.ts for why a range counts
 *  distinct incidents, not a sum of per-tower counts. */
export function GangguanHotspotsCard({
  hotspots,
  ranges5,
  ranges10,
}: {
  hotspots: GangguanHotspot[];
  ranges5: GangguanTowerRange[];
  ranges10: GangguanTowerRange[];
}) {
  const [view, setView] = useState<ViewMode>("range5");
  const [selectedTower, setSelectedTower] = useState<GangguanHotspot | null>(null);
  const [selectedRange, setSelectedRange] = useState<GangguanTowerRange | null>(null);

  if (hotspots.length === 0 && ranges5.length === 0) return null;

  const ranges = view === "range5" ? ranges5 : ranges10;
  const rangeSize = view === "range10" ? 10 : 5;

  return (
    <Card className="border-critical/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
            <Flame className="size-5 text-critical" />
            Tower Gangguan Berulang
          </CardTitle>
          <Select value={view} onValueChange={(v) => v && setView(v as ViewMode)}>
            <SelectTrigger size="sm" className="w-[190px]" aria-label="Tampilan">
              <SelectValue>{VIEW_LABEL[view]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VIEW_LABEL) as ViewMode[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {VIEW_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {view === "tower" ? (
            <>
              Tower dengan 2 atau lebih riwayat gangguan tercatat (khusus Transmisi — Trafo tidak punya tower),
              diurutkan dari yang paling sering. Satu tower pada satu ruas hanya ditampilkan sekali meski kadang
              tercatat dari kedua ujung GI-nya. Klik jumlah kejadian untuk melihat tanggal tiap kejadiannya.
            </>
          ) : (
            <>
              Rentang {rangeSize} tower berurutan (mengikuti urutan fisik tower di ruas) dengan 2 atau lebih kejadian
              gangguan, khusus Transmisi, diurutkan dari yang paling sering. Satu kejadian yang menyebut beberapa
              tower sekaligus dihitung satu kali per rentang. Kolom Tower Terkena menunjukkan gangguan jatuh tepat
              di tower mana saja. Klik jumlah kejadian untuk melihat rinciannya.
            </>
          )}{" "}
          Pertimbangkan mitigasi fisik tambahan (arrester, grounding, vegetasi) di titik-titik ini.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          {view === "tower" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-bold">No</th>
                  <th className="px-3 py-2.5 font-bold">GI Terdekat</th>
                  <th className="px-3 py-2.5 font-bold">Tower</th>
                  <th className="px-3 py-2.5 font-bold">Ruas</th>
                  <th className="px-3 py-2.5 text-right font-bold">Jumlah Kejadian</th>
                  <th className="px-3 py-2.5 font-bold">Penyebab Terbanyak</th>
                  <th className="px-3 py-2.5 font-bold">Terakhir Terjadi</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h, idx) => (
                  <tr key={`${h.ruasSection ?? h.gi}-${h.towerNo}`} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{h.gi}</td>
                    <td className="px-3 py-2 text-foreground">T.{h.towerNo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{h.ruasSection ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedTower(h)}
                        className="font-bold tabular-nums text-critical underline decoration-dotted underline-offset-2 hover:decoration-solid"
                        title="Lihat tanggal tiap kejadian"
                      >
                        {h.count}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {h.causeBreakdown[0] ? `${h.causeBreakdown[0].cause} (${h.causeBreakdown[0].count}x)` : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{h.entries[0]?.tgl ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-bold">No</th>
                  <th className="px-3 py-2.5 font-bold">GI Terdekat</th>
                  <th className="px-3 py-2.5 font-bold">Ruas</th>
                  <th className="px-3 py-2.5 font-bold">Rentang Tower</th>
                  <th className="px-3 py-2.5 text-right font-bold">Kejadian</th>
                  <th className="px-3 py-2.5 font-bold">Tower Terkena</th>
                  <th className="px-3 py-2.5 font-bold">Penyebab Terbanyak</th>
                  <th className="px-3 py-2.5 font-bold">Terakhir Terjadi</th>
                </tr>
              </thead>
              <tbody>
                {ranges.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      Belum ada rentang dengan 2 kejadian atau lebih.
                    </td>
                  </tr>
                ) : (
                  ranges.map((r, idx) => (
                    <tr key={`${r.ruasSection}-${r.fromTowerNo}`} className="border-b last:border-0">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.gi}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.ruasSection}</td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-foreground tabular-nums">
                        T.{r.fromTowerNo} – T.{r.toTowerNo}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRange(r)}
                          className="font-bold tabular-nums text-critical underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          title="Lihat rincian tiap kejadian"
                        >
                          {r.count}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-0.5">
                          {r.towers.map((t) => (
                            <div
                              key={t.towerNo}
                              title={`T.${t.towerNo}: ${t.count} kejadian`}
                              className={cn(
                                "flex h-8 flex-col items-center justify-center rounded border text-[10px] leading-none tabular-nums",
                                rangeSize === 10 ? "w-9" : "w-11",
                                cellClass(t.count),
                              )}
                            >
                              <span>T.{t.towerNo}</span>
                              <span className="mt-0.5 text-[11px] font-bold">{t.count > 0 ? `×${t.count}` : "·"}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.causeBreakdown[0] ? `${r.causeBreakdown[0].cause} (${r.causeBreakdown[0].count}x)` : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {r.incidents[0]?.tgl.slice(0, 10) ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>

      <Dialog open={selectedTower !== null} onOpenChange={(open) => !open && setSelectedTower(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedTower ? `${selectedTower.gi} — Tower T.${selectedTower.towerNo}` : ""}</DialogTitle>
            {selectedTower ? (
              <p className="text-xs text-muted-foreground">
                {selectedTower.ruasSection ? `Ruas ${selectedTower.ruasSection} · ` : ""}
                {selectedTower.count} kejadian tercatat, terbaru di atas.
              </p>
            ) : null}
          </DialogHeader>
          {selectedTower ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {selectedTower.entries.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-md border bg-muted px-3 py-2">
                  <span className="shrink-0 font-bold text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="flex-1 font-medium text-foreground">{e.tgl.slice(0, 10)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.penyebab || "Tidak diketahui"}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={selectedRange !== null} onOpenChange={(open) => !open && setSelectedRange(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedRange ? `${selectedRange.ruasSection} — T.${selectedRange.fromTowerNo} s.d. T.${selectedRange.toTowerNo}` : ""}
            </DialogTitle>
            {selectedRange ? (
              <p className="text-xs text-muted-foreground">
                GI terdekat {selectedRange.gi} · {selectedRange.count} kejadian tercatat, terbaru di atas. Kolom kanan:
                tower yang disebut pada temuan lapangan kejadian itu.
              </p>
            ) : null}
          </DialogHeader>
          {selectedRange ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {selectedRange.incidents.map((inc, i) => (
                <li key={i} className="flex items-center gap-3 rounded-md border bg-muted px-3 py-2">
                  <span className="shrink-0 font-bold text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="w-24 shrink-0 font-medium text-foreground">{inc.tgl.slice(0, 10)}</span>
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{inc.penyebab || "Tidak diketahui"}</span>
                  <span className="flex-1 text-right text-xs font-semibold text-critical tabular-nums">
                    {inc.towerNos.map((t) => `T.${t}`).join(", ")}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
