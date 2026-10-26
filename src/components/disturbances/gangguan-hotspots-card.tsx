import { Flame } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GangguanHotspot } from "@/lib/gangguan-hotspots";

/** Ranked list of towers with 2+ recorded gangguan — a location-specific
 *  complement to the page's own cause-only Pareto charts. Transmisi-only
 *  (towers belong to SUTT lines, Trafo gangguan has no tower to attribute
 *  to), so this sits once at the top of the page rather than once per
 *  category. */
export function GangguanHotspotsCard({ hotspots }: { hotspots: GangguanHotspot[] }) {
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
          diurutkan dari yang paling sering. Pertimbangkan mitigasi fisik tambahan (arrester, grounding, vegetasi)
          di titik-titik ini.
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
                <tr key={`${h.gi}-${h.towerNo}`} className="border-b last:border-0">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{h.gi}</td>
                  <td className="px-3 py-2 text-foreground">T.{h.towerNo}</td>
                  <td className="px-3 py-2 text-muted-foreground">{h.ruasSection ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-critical">{h.count}</td>
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
    </Card>
  );
}
