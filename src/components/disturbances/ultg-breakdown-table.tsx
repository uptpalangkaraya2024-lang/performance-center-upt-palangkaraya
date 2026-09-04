"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DisturbanceUltgSummary } from "@/types";

function UltgRow({ row, showAr }: { row: DisturbanceUltgSummary; showAr: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded((prev) => !prev)}>
        <TableCell className="w-6">
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </TableCell>
        <TableCell className="font-medium whitespace-nowrap">{row.ultg}</TableCell>
        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
        <TableCell className="text-right tabular-nums text-critical">{row.trip}</TableCell>
        {showAr ? <TableCell className="text-right tabular-nums text-primary">{row.arSukses}</TableCell> : null}
        <TableCell className="text-right tabular-nums text-muted-foreground">{row.tidakTrip}</TableCell>
        <TableCell className="text-right tabular-nums text-success">{row.followUp.closed}</TableCell>
        <TableCell className="text-right tabular-nums text-critical">{row.followUp.open}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{row.followUp.unknown}</TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={showAr ? 8 : 7} className="bg-muted/20 px-4 py-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Penyebab Gangguan — {row.ultg}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {row.causePareto.map((c) => (
                <span
                  key={c.cause}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                >
                  {c.cause} <b className="tabular-nums">{c.count}</b>
                </span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function UltgBreakdownTable({ rows, showAr }: { rows: DisturbanceUltgSummary[]; showAr: boolean }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data ULTG untuk kategori ini.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead>ULTG</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Trip</TableHead>
            {showAr ? <TableHead className="text-right">AR Sukses</TableHead> : null}
            <TableHead className="text-right">Tidak Trip</TableHead>
            <TableHead className="text-right">TL Selesai</TableHead>
            <TableHead className="text-right">TL Open</TableHead>
            <TableHead className="text-right">TL Belum Diketahui</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <UltgRow key={row.ultg} row={row} showAr={showAr} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
