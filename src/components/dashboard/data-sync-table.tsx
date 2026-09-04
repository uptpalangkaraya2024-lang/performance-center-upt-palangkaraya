"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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

const HISTORY_STATUS_DOT: Record<"healthy" | "error", string> = {
  healthy: "bg-success",
  error: "bg-critical",
};

function SyncHistoryButton({ history }: { history: DataSourceHealth["history"] }) {
  if (!history || history.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="ml-1 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Riwayat sinkronisasi"
          >
            <History className="size-3.5" />
          </button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <PopoverTitle className="text-xs font-semibold tracking-wide uppercase">
          Riwayat Sinkronisasi
        </PopoverTitle>
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-xs">
          {history.map((event, idx) => (
            <li key={idx} className="flex items-start gap-2 border-b border-border/60 pb-1.5 last:border-0">
              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", HISTORY_STATUS_DOT[event.status])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{event.timestamp}</span>
                  <span className="text-muted-foreground">
                    {event.status === "healthy" ? `${event.rows ?? 0} baris` : "Gagal"}
                  </span>
                </div>
                {event.error ? <p className="mt-0.5 truncate text-muted-foreground" title={event.error}>{event.error}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// "pending" means the module's source was never expected to exist yet — a
// Coming Soon module, not a broken integration — so it gets the same
// neutral/blue treatment as the ComingSoon component, never red.
const STATUS_LABEL: Record<
  DataSourceHealth["status"],
  { label: string; pillClassName: string; dotClassName: string }
> = {
  healthy: { label: "Active", pillClassName: "bg-success/10 text-success", dotClassName: "bg-success" },
  error: { label: "Gagal sinkronisasi", pillClassName: "bg-critical/10 text-critical", dotClassName: "bg-critical" },
  pending: { label: "Coming Soon", pillClassName: "bg-info/10 text-info", dotClassName: "bg-info" },
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
            {/* Explicit children — SelectValue's own item-label lookup only
                resolves once the popup has mounted at least once, so the
                trigger would otherwise show the raw value on first paint. */}
            <SelectValue placeholder="Module">
              {moduleFilter === "all" ? "Semua Module" : moduleFilter}
            </SelectValue>
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
            <SelectValue placeholder="Status">
              {statusFilter === "all" ? "Semua Status" : STATUS_LABEL[statusFilter].label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="healthy">Active</SelectItem>
            <SelectItem value="error">Gagal sinkronisasi</SelectItem>
            <SelectItem value="pending">Coming Soon</SelectItem>
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
            <TableHead className="text-right">Rows</TableHead>
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
                  <TableCell className="text-right tabular-nums">
                    {row.rows !== null ? row.rows.toLocaleString("id-ID") : "–"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                          status.pillClassName,
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", status.dotClassName)} />
                        {status.label}
                      </span>
                      <SyncHistoryButton history={row.history} />
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
