import Link from "next/link";

import { cn } from "@/lib/utils";
import type { GiCorrelationRow } from "@/lib/asset-correlation";

export function GiCorrelationTable({ rows }: { rows: GiCorrelationRow[] }) {
  const withSignal = rows.filter((r) => r.gangguanTotal > 0 || r.ahiTotal > 0 || r.ceTotal > 0 || r.renusTotal > 0);

  if (withSignal.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Belum ada GI dengan data Gangguan, AHI, CE, maupun RENUS yang dapat dikorelasikan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        GI diambil langsung dari kolom sumber tiap modul (Gangguan: &quot;Gardu Induk&quot;, AHI: &quot;GI&quot;, CE:
        &quot;Gardu&quot;, RENUS: &quot;GI&quot;) — bukan tebakan dari nama bay. Diurutkan dari skor risiko tertinggi
        (AHI Critical dibobot paling berat, lalu AHI Poor/CE Open/RENUS Overdue, lalu jumlah gangguan).
      </p>
      {/* One box, no sideways scrolling: fixed layout, GI names wrap
          inside their cell, headers wrap onto two lines. */}
      <div className="rounded-lg border">
        <table className="w-full table-fixed text-[11px] sm:text-sm">
          <colgroup>
            <col className="w-[36%] sm:w-[34%]" />
            {Array.from({ length: 7 }, (_, i) => (
              <col key={i} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/70 text-[10px] leading-tight text-muted-foreground sm:text-xs">
              <th className="px-2 py-2 text-left font-semibold sm:px-3">GI</th>
              <th className="px-1 py-2 text-right font-semibold sm:px-2" title="Gangguan Trafo">
                <span className="sm:hidden">Trf</span>
                <span className="hidden sm:inline">Gangguan Trafo</span>
              </th>
              <th className="px-1 py-2 text-right font-semibold sm:px-2" title="Gangguan Transmisi">
                <span className="sm:hidden">Trans</span>
                <span className="hidden sm:inline">Gangguan Transmisi</span>
              </th>
              <th className="px-1 py-2 text-right font-semibold sm:px-2" title="AHI Poor">
                <span className="sm:hidden">Poor</span>
                <span className="hidden sm:inline">AHI Poor</span>
              </th>
              <th className="px-1 py-2 text-right font-semibold sm:px-2" title="AHI Critical">
                <span className="sm:hidden">Crit</span>
                <span className="hidden sm:inline">AHI Critical</span>
              </th>
              <th className="px-1 py-2 text-right font-semibold sm:px-2" title="CE Open">
                <span className="sm:hidden">CE</span>
                <span className="hidden sm:inline">CE Open</span>
              </th>
              <th className="px-1 py-2 text-right font-semibold sm:px-2" title="RENUS Overdue">
                <span className="sm:hidden">Renus</span>
                <span className="hidden sm:inline">RENUS Overdue</span>
              </th>
              <th className="border-l px-1 py-2 text-right font-semibold sm:px-2" title="Skor Risiko">
                <span className="sm:hidden">Skor</span>
                <span className="hidden sm:inline">Skor Risiko</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {withSignal.map((row) => (
              <tr key={row.gi} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-2 py-2 align-top font-medium [overflow-wrap:normal] sm:px-3">
                  {row.ahiTotal > 0 ? (
                    <Link
                      href={`/dashboard/ahi?gi=${encodeURIComponent(row.gi)}#ahi-anomaly`}
                      className="text-primary underline decoration-transparent underline-offset-2 hover:decoration-current"
                    >
                      {row.gi}
                    </Link>
                  ) : (
                    row.gi
                  )}
                </td>
                <td className={cn("px-1 py-2 text-right align-top tabular-nums sm:px-2")}>
                  {row.gangguanTrafo || "-"}
                </td>
                <td className={cn("px-1 py-2 text-right align-top tabular-nums sm:px-2")}>
                  {row.gangguanTransmisi || "-"}
                </td>
                <td
                  className={cn(
                    "px-1 py-2 text-right align-top tabular-nums sm:px-2",
                    row.ahiPoor > 0 && "text-warning-foreground font-bold",
                  )}
                >
                  {row.ahiPoor || "-"}
                </td>
                <td
                  className={cn(
                    "px-1 py-2 text-right align-top tabular-nums sm:px-2",
                    row.ahiCritical > 0 && "text-critical font-bold",
                  )}
                >
                  {row.ahiCritical || "-"}
                </td>
                <td
                  className={cn(
                    "px-1 py-2 text-right align-top tabular-nums sm:px-2",
                    row.ceOpen > 0 && "text-warning-foreground font-bold",
                  )}
                >
                  {row.ceOpen || "-"}
                </td>
                <td
                  className={cn(
                    "px-1 py-2 text-right align-top tabular-nums sm:px-2",
                    row.renusOverdue > 0 && "text-warning-foreground font-bold",
                  )}
                >
                  {row.renusOverdue || "-"}
                </td>
                <td className="border-l px-1 py-2 text-right align-top font-bold text-foreground tabular-nums sm:px-2">
                  {row.riskScore}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground sm:hidden">
        Trf/Trans = gangguan trafo/transmisi · Poor/Crit = AHI Poor/Critical · CE = CE Open · Renus = RENUS Overdue
      </p>
    </div>
  );
}
