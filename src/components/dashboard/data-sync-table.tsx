"use client";

import { useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { DataSourceHealth } from "@/types";

const STATUS_LABEL: Record<
  DataSourceHealth["status"],
  { label: string; textClassName: string; dotClassName: string }
> = {
  healthy: { label: "Healthy", textClassName: "text-success", dotClassName: "bg-success" },
  error: { label: "Gagal sinkronisasi", textClassName: "text-critical", dotClassName: "bg-critical" },
  pending: { label: "Belum terhubung", textClassName: "text-muted-foreground", dotClassName: "bg-muted-foreground" },
};

export function DataSyncTable({ rows }: { rows: DataSourceHealth[] }) {
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DataSourceHealth["status"]>("all");
  const [search, setSearch] = useState("");

  const modules = useMemo(() => [...new Set(rows.map((row) => row.module))], [rows]);

  const filtered = rows.filter((row) => {
    if (moduleFilter !== "all" && row.module !== moduleFilter) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (search) {
      const needle = search.toLowerCase();
      const haystack = `${row.file ?? ""} ${row.sheet ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={moduleFilter} onValueChange={(value) => setModuleFilter(value ?? "all")}>
          <SelectTrigger size="sm" className="w-[190px]">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Module</SelectItem>
            {modules.map((module) => (
              <SelectItem key={module} value={module}>
                {module}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter((value ?? "all") as typeof statusFilter)}
        >
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="error">Gagal sinkronisasi</SelectItem>
            <SelectItem value="pending">Belum terhubung</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari file atau sheet..."
          className="h-8 w-[220px]"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Module</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Sheet</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Last Sync</TableHead>
            <TableHead>Rows</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                Tidak ada sumber data yang cocok dengan filter.
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((row) => {
              const status = STATUS_LABEL[row.status];
              return (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.module}</TableCell>
                  <TableCell>{row.file ?? "–"}</TableCell>
                  <TableCell>{row.sheet ?? "–"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.provider ?? "–"}</TableCell>
                  <TableCell>{row.lastSync ?? "–"}</TableCell>
                  <TableCell>{row.rows !== null ? row.rows.toLocaleString("id-ID") : "–"}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", status.textClassName)}>
                      <span className={cn("size-1.5 rounded-full", status.dotClassName)} />
                      {status.label}
                    </span>
                    {row.error ? <div className="mt-0.5 text-xs text-muted-foreground">{row.error}</div> : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
