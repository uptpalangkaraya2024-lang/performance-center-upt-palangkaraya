"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DisturbanceBaySummary } from "@/types";

const PAGE_SIZE = 15;

function BayRow({ row, showAr }: { row: DisturbanceBaySummary; showAr: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setExpanded((prev) => !prev)}>
        <TableCell className="w-6">
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </TableCell>
        <TableCell className="max-w-[220px] truncate font-medium" title={row.bay}>
          {row.bay}
        </TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.ultg}</TableCell>
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.gi}</TableCell>
        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
        <TableCell className="text-right tabular-nums text-critical">{row.trip}</TableCell>
        {showAr ? <TableCell className="text-right tabular-nums text-primary">{row.arSukses}</TableCell> : null}
        <TableCell className="text-right tabular-nums text-muted-foreground">{row.tidakTrip}</TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={showAr ? 8 : 7} className="bg-muted/20 px-4 py-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Penyebab Gangguan — {row.bay}
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

export function BayBreakdownTable({ rows, showAr }: { rows: DisturbanceBaySummary[]; showAr: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => `${r.bay} ${r.ultg} ${r.gi}`.toLowerCase().includes(needle));
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data ruas/bay untuk kategori ini.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Cari ruas/bay, ULTG, atau GI..."
          className="h-8 w-[260px]"
        />
        <p className="text-xs text-muted-foreground">{filtered.length} ruas</p>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada ruas yang sesuai dengan pencarian.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Ruas / Bay</TableHead>
                  <TableHead>ULTG</TableHead>
                  <TableHead>GI</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Trip</TableHead>
                  {showAr ? <TableHead className="text-right">AR Sukses</TableHead> : null}
                  <TableHead className="text-right">Tidak Trip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <BayRow key={row.bay} row={row} showAr={showAr} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Halaman {currentPage + 1} dari {pageCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage((p) => p - 1)}>
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
