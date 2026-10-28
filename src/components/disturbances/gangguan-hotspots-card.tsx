"use client";

import { useState } from "react";
import { Flame } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GangguanHotspot } from "@/lib/gangguan-hotspots";

/** Ranked list of towers with 2+ recorded gangguan — a location-specific
 *  complement to the page's own cause-only Pareto charts. Transmisi-only
 *  (towers belong to SUTT lines, Trafo gangguan has no tower to attribute
 *  to), so this sits once at the top of the page rather than once per
 *  category. Grouped by physical ruas+tower (see gangguan-hotspots.ts),
 *  not by whichever GI a given incident row happened to be logged
 *  against — a tower on a ruas connecting two GIs used to show up as two
 *  separate, identical-looking rows otherwise. */
export function GangguanHotspotsCard({ hotspots }: { hotspots: GangguanHotspot[] }) {
  const [selected, setSelected] = useState<GangguanHotspot | null>(null);

  if (hotspots.length === 0) return null;

  return (
    <Card className="border-critical/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
          <Flame className="size-5 text-critical" />
          Tower Gangguan Berulang
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tower dengan 2 atau lebih riwayat gangguan tercatat (khusus Transmisi — Trafo tidak punya tower),
          diurutkan dari yang paling sering. Satu tower pada satu ruas hanya ditampilkan sekali meski kadang
          tercatat dari kedua ujung GI-nya. Klik jumlah kejadian untuk melihat tanggal tiap kejadiannya.
          Pertimbangkan mitigasi fisik tambahan (arrester, grounding, vegetasi) di titik-titik ini.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
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
                      onClick={() => setSelected(h)}
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
        </div>
      </CardContent>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected ? `${selected.gi} — Tower T.${selected.towerNo}` : ""}
            </DialogTitle>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {selected.ruasSection ? `Ruas ${selected.ruasSection} · ` : ""}
                {selected.count} kejadian tercatat, terbaru di atas.
              </p>
            ) : null}
          </DialogHeader>
          {selected ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {selected.entries.map((e, i) => (
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
    </Card>
  );
}
