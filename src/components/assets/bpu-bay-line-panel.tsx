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
  AssetFilterBar,
  AssetInfoField,
  AssetRawDetailGrid,
  AssetReportBanner,
  AssetSelectPrompt,
  AssetStatusBadge,
} from "./asset-shared";

// Same "filter only, then one report" UX as MpuBayLinePanel — see that
// file's comment for why.
export function BpuBayLinePanel({ rows }: { rows: AssetBpuBayLineRow[] }) {
  const [ultg, setUltg] = useState(ALL_VALUE);
  const [gi, setGi] = useState(ALL_VALUE);
  const [bay, setBay] = useState(ALL_VALUE);

  const ultgOptions = useMemo(() => buildUltgOptions(rows), [rows]);
  const giOptions = useMemo(() => buildGiOptionsForBayLine(rows, ultg), [rows, ultg]);
  const bayOptions = useMemo(() => buildBayOptionsForBayLine(rows, ultg, gi), [rows, ultg, gi]);

  const selectedRows = useMemo(
    () => (bay === ALL_VALUE ? [] : filterBayLineRows(rows, ultg, gi, bay)),
    [rows, ultg, gi, bay],
  );

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
          { key: "bay", value: bay, options: bayOptions, onChange: setBay, allLabel: "Pilih Ruas..." },
        ]}
      />

      {bay === ALL_VALUE ? (
        <AssetSelectPrompt message="Pilih Ruas untuk melihat detail data BPU Bay Line." />
      ) : selectedRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data untuk filter ini.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {selectedRows.map((row, i) => (
            <Card key={`${row.bay}-${i}`} className="border-l-4 border-l-primary print:break-inside-avoid print:border print:shadow-none">
              <CardContent className="flex flex-col gap-4 py-4">
                <AssetReportBanner
                  title={row.bay}
                  subtitle={`${row.ultg} · ${row.dariGi} → ${row.keGi}${row.line ? ` · Line ${row.line}` : ""}`}
                  badge={
                    <AssetStatusBadge
                      label={row.anomaliStatus}
                      tone={row.anomaliStatus.toUpperCase() === "NORMAL" ? "good" : "warn"}
                    />
                  }
                />

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <AssetInfoField label="Merk / Tipe" value={`${row.merk || "—"} / ${row.tipe || "—"}`} />
                  <AssetInfoField label="Serial Number" value={row.serialNumber ?? "—"} />
                  <AssetInfoField label="Tahun Operasi" value={row.tahunOperasi !== null ? String(row.tahunOperasi) : "—"} />
                  <AssetInfoField label="Remote Relai" value={row.remoteRelai ?? "—"} />
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-bold tracking-wide text-foreground uppercase">
                    Setting OCR/GFR &amp; Pemeliharaan Lengkap
                  </p>
                  <AssetRawDetailGrid raw={row.raw} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
