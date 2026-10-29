"use client";

import { useState } from "react";
import { Flame } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BayGangguanHotspot } from "@/lib/gangguan-hotspots";

const CATEGORY_BADGE: Record<string, string> = {
  "Trafo HV": "border-warning/40 bg-warning/10 text-warning-foreground",
  "Trafo LV": "border-info/40 bg-info/10 text-info",
};

/** Ranked list of trafo UNITS (the sheet's own NAMA BAY GANGGUAN value,
 *  e.g. "TRAFO 1") with 2+ recorded gangguan — the Trafo HV/LV counterpart
 *  of GangguanHotspotsCard's tower ranking. Trafo gangguan has no tower to
 *  attribute to (a trafo bay belongs to exactly one GI, not shared between
 *  two substations the way a transmission span is), so this groups
 *  straight by (kategori, GI, bay) — no ruas-merging needed, unlike the
 *  tower version. HV and LV ranked together so the single worst-offending
 *  trafo unit overall sorts first regardless of which side it's on. */
export function TrafoBayHotspotsCard({ hotspots }: { hotspots: BayGangguanHotspot[] }) {
  const [selected, setSelected] = useState<BayGangguanHotspot | null>(null);

  if (hotspots.length === 0) return null;

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
          <Flame className="size-5 text-warning-foreground" />
          Trafo HV/LV Gangguan Berulang
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Unit trafo (per GI) dengan 2 atau lebih riwayat gangguan tercatat, sisi HV dan Low Voltage digabung satu
          peringkat, diurutkan dari yang paling sering. Klik jumlah kejadian untuk melihat tanggal tiap kejadiannya.
          Pertimbangkan pemeriksaan/pemeliharaan tambahan pada unit-unit ini.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2.5 font-bold">No</th>
                <th className="px-3 py-2.5 font-bold">Kategori</th>
                <th className="px-3 py-2.5 font-bold">GI</th>
                <th className="px-3 py-2.5 font-bold">Unit Trafo</th>
                <th className="px-3 py-2.5 text-right font-bold">Jumlah Kejadian</th>
                <th className="px-3 py-2.5 font-bold">Penyebab Terbanyak</th>
                <th className="px-3 py-2.5 font-bold">Terakhir Terjadi</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.map((h, idx) => (
                <tr key={`${h.category}-${h.gi}-${h.bay}`} className="border-b last:border-0">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap ${CATEGORY_BADGE[h.category] ?? "border-border bg-muted text-muted-foreground"}`}
                    >
                      {h.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{h.gi}</td>
                  <td className="px-3 py-2 text-foreground">{h.bay}</td>
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
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{h.entries[0]?.date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? `${selected.gi} — ${selected.bay}` : ""}</DialogTitle>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {selected.category} · {selected.count} kejadian tercatat, terbaru di atas.
              </p>
            ) : null}
          </DialogHeader>
          {selected ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {selected.entries.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-md border bg-muted px-3 py-2">
                  <span className="shrink-0 font-bold text-muted-foreground tabular-nums">{i + 1}.</span>
                  <span className="flex-1 font-medium text-foreground">{e.date}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.cause || "Tidak diketahui"}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
