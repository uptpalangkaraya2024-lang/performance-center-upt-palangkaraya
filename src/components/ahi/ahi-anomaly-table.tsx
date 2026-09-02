"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AhiAnomalyRecord } from "@/types";

const ALL_VALUE = "__all__";

const CATEGORY_LABEL: Record<number, { label: string; className: string }> = {
  5: { label: "5-Critical", className: "bg-critical/10 text-critical" },
  4: { label: "4-Poor", className: "bg-warning/15 text-warning-foreground" },
  3: { label: "3-Fair", className: "bg-muted text-muted-foreground" },
};

function categoryBadge(kategoriAhi: number) {
  const config = CATEGORY_LABEL[kategoriAhi] ?? { label: `${kategoriAhi}`, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}

export function AhiAnomalyTable({ records }: { records: AhiAnomalyRecord[] }) {
  const [search, setSearch] = useState("");
  const [ultgFilter, setUltgFilter] = useState(ALL_VALUE);
  const [jenisAsetFilter, setJenisAsetFilter] = useState(ALL_VALUE);
  const [kategoriFilter, setKategoriFilter] = useState(ALL_VALUE);
  const [sortDesc, setSortDesc] = useState(true);

  const ultgOptions = useMemo(() => [...new Set(records.map((r) => r.ultg))].sort(), [records]);
  const jenisAsetOptions = useMemo(() => [...new Set(records.map((r) => r.jenisAset))].sort(), [records]);
  const kategoriOptions = useMemo(
    () => [...new Set(records.map((r) => r.kategoriAhi))].sort((a, b) => b - a),
    [records],
  );

  // Severity tally over the full unfiltered record set — a straight count of
  // each record's existing kategoriAhi (the sheet's own Poor/Critical
  // classification), not a new rule. Doubles as a one-click filter into the
  // table below, giving the 146 records a Critical → Attention hierarchy
  // instead of dropping the reader straight into a flat table.
  const severityTally = useMemo(() => {
    const critical = records.filter((r) => r.kategoriAhi === 5).length;
    const poor = records.filter((r) => r.kategoriAhi === 4).length;
    const other = records.length - critical - poor;
    return { critical, poor, other };
  }, [records]);

  const filtered = useMemo(() => {
    let rows = records;
    if (ultgFilter !== ALL_VALUE) rows = rows.filter((r) => r.ultg === ultgFilter);
    if (jenisAsetFilter !== ALL_VALUE) rows = rows.filter((r) => r.jenisAset === jenisAsetFilter);
    if (kategoriFilter !== ALL_VALUE) rows = rows.filter((r) => String(r.kategoriAhi) === kategoriFilter);
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.ultg, r.gi, r.bay, r.jenisAset, r.merk, r.parameterPemicuAhi, r.keterangan]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    return [...rows].sort((a, b) => (sortDesc ? b.kategoriAhi - a.kategoriAhi : a.kategoriAhi - b.kategoriAhi));
  }, [records, ultgFilter, jenisAsetFilter, kategoriFilter, search, sortDesc]);

  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Tidak terdapat kondisi yang memerlukan perhatian.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setKategoriFilter(kategoriFilter === "5" ? ALL_VALUE : "5")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            kategoriFilter === "5" ? "border-critical bg-critical/10 text-critical" : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="size-1.5 rounded-full bg-critical" />
          Critical <b className="tabular-nums">{severityTally.critical}</b>
        </button>
        <button
          type="button"
          onClick={() => setKategoriFilter(kategoriFilter === "4" ? ALL_VALUE : "4")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            kategoriFilter === "4" ? "border-warning bg-warning/15 text-warning-foreground" : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="size-1.5 rounded-full bg-warning" />
          Poor <b className="tabular-nums">{severityTally.poor}</b>
        </button>
        {severityTally.other > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground" />
            Lainnya <b className="tabular-nums">{severityTally.other}</b>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari aset, parameter, keterangan..."
          className="h-8 w-[240px]"
        />
        <Select value={ultgFilter} onValueChange={(value) => setUltgFilter(value ?? ALL_VALUE)}>
          <SelectTrigger size="sm" className="w-[170px]">
            <SelectValue placeholder="ULTG">{ultgFilter === ALL_VALUE ? "Semua ULTG" : ultgFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua ULTG</SelectItem>
            {ultgOptions.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jenisAsetFilter} onValueChange={(value) => setJenisAsetFilter(value ?? ALL_VALUE)}>
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue placeholder="Jenis Aset">
              {jenisAsetFilter === ALL_VALUE ? "Semua Aset" : jenisAsetFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua Aset</SelectItem>
            {jenisAsetOptions.map((j) => (
              <SelectItem key={j} value={j}>
                {j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kategoriFilter} onValueChange={(value) => setKategoriFilter(value ?? ALL_VALUE)}>
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue placeholder="Kategori">
              {kategoriFilter === ALL_VALUE ? "Semua Kategori" : (CATEGORY_LABEL[Number(kategoriFilter)]?.label ?? kategoriFilter)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua Kategori</SelectItem>
            {kategoriOptions.map((k) => (
              <SelectItem key={k} value={String(k)}>
                {CATEGORY_LABEL[k]?.label ?? k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setSortDesc((prev) => !prev)}
          className="ml-auto rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Urutkan: {sortDesc ? "Kritis → Fair" : "Fair → Kritis"}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Menampilkan {filtered.length} dari {records.length} kondisi.
      </p>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Tidak ada kondisi yang sesuai dengan filter.
        </p>
      ) : (
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ULTG</TableHead>
              <TableHead>GI</TableHead>
              <TableHead>Bay</TableHead>
              <TableHead>Jenis Aset</TableHead>
              <TableHead>Fasa</TableHead>
              <TableHead>Merk</TableHead>
              <TableHead>Parameter Pemicu AHI</TableHead>
              <TableHead>Kategori AHI</TableHead>
              <TableHead>vs SKDIR</TableHead>
              <TableHead>Sub Sistem</TableHead>
              <TableHead>Rencana Tindak Lanjut</TableHead>
              <TableHead>Target Waktu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r, idx) => (
              <TableRow key={`${r.no}-${idx}`}>
                <TableCell className="whitespace-nowrap">{r.ultg}</TableCell>
                <TableCell className="whitespace-nowrap">{r.gi}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={r.bay}>
                  {r.bay}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.jenisAset}</TableCell>
                <TableCell>{r.fasa}</TableCell>
                <TableCell className="whitespace-nowrap">{r.merk}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={r.parameterPemicuAhi}>
                  {r.parameterPemicuAhi}
                </TableCell>
                <TableCell>{categoryBadge(r.kategoriAhi)}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {r.kategoriAhiVsSkdir || "-"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.subSistem || "-"}</TableCell>
                <TableCell className="max-w-[200px] truncate" title={r.rencanaTindakLanjut}>
                  {r.rencanaTindakLanjut || "-"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.targetWaktu || "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}
