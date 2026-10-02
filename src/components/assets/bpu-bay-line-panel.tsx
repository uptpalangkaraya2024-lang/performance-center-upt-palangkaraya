"use client";

import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  ALL_VALUE,
  buildBayOptionsForBayLine,
  buildGiOptionsForBayLine,
  buildUltgOptions,
  filterBayLineRows,
} from "@/lib/asset-scanning-compute";
import type { AssetBpuBayLineRow } from "@/types";
import {
  AssetDetailToggle,
  AssetFilterBar,
  AssetInfoField,
  AssetRawDetailGrid,
  AssetStatTile,
  AssetStatusBadge,
} from "./asset-shared";

export function BpuBayLinePanel({ rows }: { rows: AssetBpuBayLineRow[] }) {
  const [ultg, setUltg] = useState(ALL_VALUE);
  const [gi, setGi] = useState(ALL_VALUE);
  const [bay, setBay] = useState(ALL_VALUE);

  const ultgOptions = useMemo(() => buildUltgOptions(rows), [rows]);
  const giOptions = useMemo(() => buildGiOptionsForBayLine(rows, ultg), [rows, ultg]);
  const bayOptions = useMemo(() => buildBayOptionsForBayLine(rows, ultg, gi), [rows, ultg, gi]);
  const filtered = useMemo(() => filterBayLineRows(rows, ultg, gi, bay), [rows, ultg, gi, bay]);

  const normalCount = filtered.filter((r) => r.anomaliStatus.toUpperCase() === "NORMAL").length;
  const anomaliCount = filtered.length - normalCount;

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Data BPU Bay Line belum tersedia.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <AssetFilterBar
        selects={[
          {
            key: "ultg",
            value: ultg,
            options: ultgOptions,
            onChange: (v) => {
              setUltg(v);
              setGi(ALL_VALUE);
              setBay(ALL_VALUE);
            },
            allLabel: "Semua ULTG",
          },
          {
            key: "gi",
            value: gi,
            options: giOptions,
            onChange: (v) => {
              setGi(v);
              setBay(ALL_VALUE);
            },
            allLabel: "Semua GI",
          },
          { key: "bay", value: bay, options: bayOptions, onChange: setBay, allLabel: "Semua Ruas" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AssetStatTile value={filtered.length} label="Total Line" />
        <AssetStatTile value={normalCount} label="Normal" className="text-success" />
        <AssetStatTile value={anomaliCount} label="Ada Anomali" className="text-critical" />
        <AssetStatTile value={new Set(filtered.map((r) => r.merk).filter(Boolean)).size} label="Jenis Merk" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold tracking-wide text-foreground uppercase">Breakdown per Ruas</p>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada data untuk filter ini.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((row, i) => (
              <Card key={`${row.bay}-${i}`}>
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-foreground">{row.bay}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.ultg} · {row.dariGi} → {row.keGi}
                        {row.line ? ` · Line ${row.line}` : ""}
                      </p>
                    </div>
                    <AssetStatusBadge
                      label={row.anomaliStatus}
                      tone={row.anomaliStatus.toUpperCase() === "NORMAL" ? "good" : "warn"}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <AssetInfoField label="Merk / Tipe" value={`${row.merk || "—"} / ${row.tipe || "—"}`} />
                    <AssetInfoField label="Serial Number" value={row.serialNumber ?? "—"} />
                    <AssetInfoField label="Tahun Operasi" value={row.tahunOperasi !== null ? String(row.tahunOperasi) : "—"} />
                    <AssetInfoField label="Remote Relai" value={row.remoteRelai ?? "—"} />
                  </div>
                  <AssetDetailToggle label="Setting OCR/GFR & Pemeliharaan">
                    <AssetRawDetailGrid raw={row.raw} />
                  </AssetDetailToggle>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
