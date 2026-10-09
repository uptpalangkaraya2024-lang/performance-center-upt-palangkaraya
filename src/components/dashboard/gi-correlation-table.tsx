import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { GiCorrelationRow } from "@/lib/asset-correlation";

export function GiCorrelationTable({ rows }: { rows: GiCorrelationRow[] }) {
  const withSignal = rows.filter(
    (r) => r.gangguanTotal > 0 || r.ahiTotal > 0 || r.ceTotal > 0 || r.renusTotal > 0,
  );

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
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GI</TableHead>
              <TableHead className="text-right">Gangguan Trafo</TableHead>
              <TableHead className="text-right">Gangguan Transmisi</TableHead>
              <TableHead className="text-right">AHI Poor</TableHead>
              <TableHead className="text-right">AHI Critical</TableHead>
              <TableHead className="text-right">CE Open</TableHead>
              <TableHead className="text-right">RENUS Overdue</TableHead>
              <TableHead className="border-l text-right">Skor Risiko</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {withSignal.map((row) => (
              <TableRow key={row.gi}>
                <TableCell className="font-medium whitespace-nowrap">
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
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.gangguanTrafo || "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{row.gangguanTransmisi || "-"}</TableCell>
                <TableCell className={cn("text-right text-sm tabular-nums", row.ahiPoor > 0 && "text-warning-foreground font-bold")}>
                  {row.ahiPoor || "-"}
                </TableCell>
                <TableCell className={cn("text-right text-sm tabular-nums", row.ahiCritical > 0 && "text-critical font-bold")}>
                  {row.ahiCritical || "-"}
                </TableCell>
                <TableCell className={cn("text-right text-sm tabular-nums", row.ceOpen > 0 && "text-warning-foreground font-bold")}>
                  {row.ceOpen || "-"}
                </TableCell>
                <TableCell className={cn("text-right text-sm tabular-nums", row.renusOverdue > 0 && "text-warning-foreground font-bold")}>
                  {row.renusOverdue || "-"}
                </TableCell>
                <TableCell className="border-l text-right font-bold tabular-nums text-foreground">{row.riskScore}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
