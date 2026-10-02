"use client";

import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { ALL_VALUE, buildGiOptionsForGardu, buildUltgOptions, filterGarduRows } from "@/lib/asset-scanning-compute";
import type { AssetMpuBusproRow } from "@/types";
import {
  AssetFilterBar,
  AssetInfoField,
  AssetRawDetailGrid,
  AssetReportBanner,
  AssetSelectPrompt,
  AssetStatusBadge,
} from "./asset-shared";

// Bus protection lives at the Gardu Induk level, not per bay — only ULTG and
// GI filters apply here (no "Ruas" level, unlike the two Bay Line sheets).
// Same "filter only, then one report" UX as the Bay Line panels: nothing
// below the filters until GI reaches one specific gardu.
export function MpuBusproPanel({ rows }: { rows: AssetMpuBusproRow[] }) {
  const [ultg, setUltg] = useState(ALL_VALUE);
  const [gi, setGi] = useState(ALL_VALUE);

  const ultgOptions = useMemo(() => buildUltgOptions(rows), [rows]);
  const giOptions = useMemo(() => buildGiOptionsForGardu(rows, ultg), [rows, ultg]);

  const selectedRows = useMemo(
    () => (gi === ALL_VALUE ? [] : filterGarduRows(rows, ultg, gi)),
    [rows, ultg, gi],
  );

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
          { key: "gi", value: gi, options: giOptions, onChange: setGi, allLabel: "Pilih Gardu Induk..." },
        ]}
      />

      {gi === ALL_VALUE ? (
        <AssetSelectPrompt message="Pilih Gardu Induk (GI) untuk melihat detail data Bus Protection." />
      ) : selectedRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data untuk filter ini.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {selectedRows.map((row, i) => (
            <Card key={`${row.gardu}-${i}`} className="border-l-4 border-l-primary print:break-inside-avoid print:border print:shadow-none">
              <CardContent className="flex flex-col gap-4 py-4">
                <AssetReportBanner
                  title={row.gardu}
                  subtitle={row.ultg}
                  badge={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AssetStatusBadge label={row.adaTidak} tone={row.adaTidak.toUpperCase() === "ADA" ? "good" : "neutral"} />
                      {row.normalAbnormal ? (
                        <AssetStatusBadge
                          label={row.normalAbnormal}
                          tone={row.normalAbnormal.toUpperCase() === "NORMAL" ? "good" : "warn"}
                        />
                      ) : null}
                    </div>
                  }
                />

                {row.adaTidak.toUpperCase() === "ADA" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <AssetInfoField label="Merk / Tipe" value={`${row.merk || "—"} / ${row.tipe || "—"}`} />
                      <AssetInfoField label="Serial Number" value={row.serialNumber ?? "—"} />
                      <AssetInfoField label="Tahun Operasi" value={row.tahunOperasi !== null ? String(row.tahunOperasi) : "—"} />
                      <AssetInfoField label="Fungsi" value={row.fungsi ?? "—"} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-sm font-bold tracking-wide text-foreground uppercase">
                        Bay Terkoneksi &amp; Setting Differensial Lengkap
                      </p>
                      <AssetRawDetailGrid raw={row.raw} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">GI ini belum memiliki proteksi bus (bus protection).</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
