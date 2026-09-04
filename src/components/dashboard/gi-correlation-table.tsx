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
  const withSignal = rows.filter((r) => r.gangguanTotal > 0 || r.ahiTotal > 0);

  if (withSignal.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Belum ada GI dengan data Gangguan maupun AHI yang dapat dikorelasikan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        GI diambil langsung dari kolom &quot;Gardu Induk&quot; pada data Gangguan — bukan tebakan dari nama bay.
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {withSignal.map((row) => (
              <TableRow key={row.gi}>
                <TableCell className="font-medium whitespace-nowrap">
                  {row.ahiTotal > 0 ? (
                    <Link
                      href={`/dashboard/kpi/ahi?gi=${encodeURIComponent(row.gi)}#ahi-anomaly`}
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
                <TableCell className={cn("text-right tabular-nums", row.ahiPoor > 0 && "text-warning-foreground font-medium")}>
                  {row.ahiPoor || "-"}
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", row.ahiCritical > 0 && "text-critical font-medium")}>
                  {row.ahiCritical || "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
