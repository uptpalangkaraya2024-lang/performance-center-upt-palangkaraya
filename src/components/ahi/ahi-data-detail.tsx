"use client";

import { useMemo, useState } from "react";

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
import type { AhiSectionSummary } from "@/types";
import { formatCount } from "./format";

interface FlatRow {
  section: string;
  category: string;
  parameter: string;
  kosong: number | null;
  best: number | null;
  good: number | null;
  fair: number | null;
  poor: number | null;
  critical: number | null;
}

const PAGE_SIZE = 20;

export function AhiDataDetail({ sections }: { sections: AhiSectionSummary[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const rows = useMemo<FlatRow[]>(() => {
    const flat: FlatRow[] = [];
    for (const section of sections) {
      for (const category of section.categories) {
        for (const param of category.parameters) {
          flat.push({
            section: section.displayName,
            category: category.displayName,
            parameter: param.name,
            kosong: param.kosong,
            best: param.best,
            good: param.good,
            fair: param.fair,
            poor: param.poor,
            critical: param.critical,
          });
        }
      }
    }
    return flat;
  }, [sections]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => `${r.section} ${r.category} ${r.parameter}`.toLowerCase().includes(needle));
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Cari kategori atau parameter..."
          className="h-8 w-[260px]"
        />
        <p className="text-xs text-muted-foreground">{filtered.length} baris parameter (dari sumber A:W)</p>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tidak ada parameter yang sesuai dengan pencarian.
        </p>
      ) : (
      <div className="max-h-[480px] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Section</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Parameter</TableHead>
              <TableHead className="text-right">Kosong</TableHead>
              <TableHead className="text-right">1-Best</TableHead>
              <TableHead className="text-right">2-Good</TableHead>
              <TableHead className="text-right">3-Fair</TableHead>
              <TableHead className="text-right">4-Poor</TableHead>
              <TableHead className="text-right">5-Critical</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r, idx) => (
              <TableRow key={`${r.category}-${r.parameter}-${idx}`}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.section}</TableCell>
                <TableCell className="whitespace-nowrap">{r.category}</TableCell>
                <TableCell className="whitespace-nowrap">{r.parameter}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(r.kosong)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(r.best)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(r.good)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(r.fair)}</TableCell>
                <TableCell className="text-right tabular-nums text-warning-foreground">
                  {formatCount(r.poor)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-critical">{formatCount(r.critical)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      {filtered.length > 0 ? (
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
      ) : null}
    </div>
  );
}
