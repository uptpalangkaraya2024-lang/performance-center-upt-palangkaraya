"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { RenusRow } from "@/types";

const PAGE_SIZE = 10;

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function formatShort(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

function statusClass(status: string): string {
  if (status === "COMPLETED") return "border-success/40 bg-success/10 text-success";
  if (status === "BATAL") return "border-muted-foreground/30 bg-muted text-muted-foreground line-through";
  if (status === "TUNDA") return "border-warning/40 bg-warning/10 text-warning-foreground";
  if (status === "RENCANA") return "border-primary/30 bg-primary/10 text-primary";
  return "border-border text-muted-foreground"; // blank — "Belum Diisi"
}

function riskClass(risk: string): string {
  if (risk === "EXTREME-CRITICAL") return "border-critical/40 bg-critical/10 text-critical";
  if (risk === "HIGH") return "border-warning/40 bg-warning/10 text-warning-foreground";
  return "border-border text-muted-foreground"; // blank — "Belum Diisi"
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", statusClass(value))}>
      {value || "Belum Diisi"}
    </span>
  );
}

function RiskPill({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", riskClass(value))}>
      {value || "Belum Diisi"}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function RenusWorkTable({ rows }: { rows: RenusRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<RenusRow | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const needle = search.trim().toLowerCase();
    return rows.filter((r) =>
      `${r.ultg} ${r.gi} ${r.bay} ${r.workDetail} ${r.pic ?? ""}`.toLowerCase().includes(needle),
    );
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
          placeholder="Cari ULTG, GI, Bay, detail pekerjaan, atau PIC..."
          className="h-8 w-[300px]"
        />
        <p className="text-xs text-muted-foreground">{filtered.length} pekerjaan</p>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada pekerjaan yang sesuai.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>ULTG</TableHead>
                  <TableHead>GI</TableHead>
                  <TableHead>Bay</TableHead>
                  <TableHead>Detail Pekerjaan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risiko</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelected(row)}>
                    <TableCell className="whitespace-nowrap">{formatShort(row.rencanaDate)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground" title={row.ultg}>
                      {row.ultg}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground" title={row.gi}>
                      {row.gi}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={row.bay}>
                      {row.bay}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate" title={row.workDetail}>
                      {row.workDetail}
                    </TableCell>
                    <TableCell>
                      <StatusPill value={row.status} />
                    </TableCell>
                    <TableCell>
                      <RiskPill value={row.risk} />
                    </TableCell>
                  </TableRow>
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
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.workDetail}</SheetTitle>
                <SheetDescription>
                  {selected.ultg} · {selected.gi} · {selected.bay}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col px-4 pb-4">
                <DetailRow label="Tanggal Rencana" value={formatShort(selected.rencanaDate)} />
                <DetailRow label="Tanggal Realisasi" value={selected.realisasiDate ? formatShort(selected.realisasiDate) : null} />
                <DetailRow
                  label="Jam Padam — Penormalan"
                  value={selected.padamStart || selected.padamEnd ? `${selected.padamStart ?? "—"} – ${selected.padamEnd ?? "—"}` : null}
                />
                <DetailRow label="Status" value={<StatusPill value={selected.status} />} />
                <DetailRow label="Risiko Pekerjaan" value={<RiskPill value={selected.risk} />} />
                <DetailRow label="PIC" value={selected.pic} />
                <DetailRow label="Detail Pekerjaan (Catatan Tambahan)" value={selected.workDetailAlt} />
                <DetailRow label="Kode Bay / Jenis Aset" value={selected.kodeBay} />
                <DetailRow label="Section Transmisi" value={selected.section} />
                <DetailRow label="Span/Tower" value={selected.spanTower} />
                <DetailRow label="Status Work Order (SAP)" value={selected.sapWoStatus} />
                {selected.docLink ? (
                  <DetailRow
                    label="Dokumen Kerja"
                    value={
                      <a
                        href={selected.docLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <FileText className="size-3.5 shrink-0" />
                        <span className="truncate">{selected.docName ?? "Lihat dokumen"}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    }
                  />
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  Sumber data: sheet MONITORING, baris {selected.sourceRow}.
                </p>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
