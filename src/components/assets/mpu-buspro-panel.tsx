"use client";

import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ALL_VALUE, buildGiOptionsForGardu, buildUltgOptions, filterGarduRows } from "@/lib/asset-scanning-compute";
import type { AssetMpuBusproRow } from "@/types";
import {
  AssetDetailToggle,
  AssetFilterBar,
  AssetInfoField,
  AssetRawDetailGrid,
  AssetStatTile,
  AssetStatusBadge,
} from "./asset-shared";

// Bus protection lives at the Gardu Induk level, not per bay — only ULTG and
// GI filters apply here (no "Ruas" level, unlike the two Bay Line sheets).
export function MpuBusproPanel({ rows }: { rows: AssetMpuBusproRow[] }) {
  const [ultg, setUltg] = useState(ALL_VALUE);
  const [gi, setGi] = useState(ALL_VALUE);

  const ultgOptions = useMemo(() => buildUltgOptions(rows), [rows]);
  const giOptions = useMemo(() => buildGiOptionsForGardu(rows, ultg), [rows, ultg]);
  const filtered = useMemo(() => filterGarduRows(rows, ultg, gi), [rows, ultg, gi]);

  const adaCount = filtered.filter((r) => r.adaTidak.toUpperCase() === "ADA").length;
  const abnormalCount = filtered.filter((r) => (r.normalAbnormal ?? "").toUpperCase() === "ABNORMAL").length;

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Data MPU Buspro belum tersedia.</p>;
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
            },
            allLabel: "Semua ULTG",
          },
          { key: "gi", value: gi, options: giOptions, onChange: setGi, allLabel: "Semua GI" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AssetStatTile value={filtered.length} label="Total GI" />
        <AssetStatTile value={adaCount} label="Ada Bus Protection" className="text-success" />
        <AssetStatTile value={filtered.length - adaCount} label="Belum Ada" className="text-muted-foreground" />
        <AssetStatTile value={abnormalCount} label="Abnormal" className="text-critical" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold tracking-wide text-foreground uppercase">Breakdown per Gardu Induk</p>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada data untuk filter ini.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((row, i) => (
              <Card key={`${row.gardu}-${i}`}>
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-foreground">{row.gardu}</p>
                      <p className="text-xs text-muted-foreground">{row.ultg}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AssetStatusBadge label={row.adaTidak} tone={row.adaTidak.toUpperCase() === "ADA" ? "good" : "neutral"} />
                      {row.normalAbnormal ? (
                        <AssetStatusBadge
                          label={row.normalAbnormal}
                          tone={row.normalAbnormal.toUpperCase() === "NORMAL" ? "good" : "warn"}
                        />
                      ) : null}
                    </div>
                  </div>
                  {row.adaTidak.toUpperCase() === "ADA" ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <AssetInfoField label="Merk / Tipe" value={`${row.merk || "—"} / ${row.tipe || "—"}`} />
                      <AssetInfoField label="Serial Number" value={row.serialNumber ?? "—"} />
                      <AssetInfoField label="Tahun Operasi" value={row.tahunOperasi !== null ? String(row.tahunOperasi) : "—"} />
                      <AssetInfoField label="Fungsi" value={row.fungsi ?? "—"} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">GI ini belum memiliki proteksi bus (bus protection).</p>
                  )}
                  <AssetDetailToggle label="Bay Terkoneksi & Setting Differensial">
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
