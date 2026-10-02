"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_VALUE, buildBayGiOptions, buildUltgOptions, filterAnomaliRows } from "@/lib/asset-scanning-compute";
import type { AssetAnomaliRow, AssetRelayObsoleteRow } from "@/types";
import { AssetFilterBar, AssetInfoField, AssetReportBanner, AssetSelectPrompt, AssetStatTile, AssetStatusBadge } from "./asset-shared";

function statusTone(status: string | null): "good" | "warn" | "neutral" {
  const s = (status ?? "").toUpperCase();
  if (s === "SELESAI") return "good";
  if (!s) return "neutral";
  return "warn";
}

// Same "filter only, then one report" UX as the other 3 panels — but unlike
// a bay line or a gardu (one row each), one ruas/GI here legitimately holds
// several separate anomali findings, so the "report" for a selected ruas is
// itself a small breakdown (stat tiles + one card per finding) rather than a
// single card.
export function AnomaliPanel({
  anomali,
  relayObsolete,
}: {
  anomali: AssetAnomaliRow[];
  relayObsolete: AssetRelayObsoleteRow[];
}) {
  const [ultg, setUltg] = useState(ALL_VALUE);
  const [bayGi, setBayGi] = useState(ALL_VALUE);

  const ultgOptions = useMemo(() => buildUltgOptions(anomali), [anomali]);
  const bayGiOptions = useMemo(() => buildBayGiOptions(anomali, ultg), [anomali, ultg]);

  const selected = useMemo(
    () => (bayGi === ALL_VALUE ? [] : filterAnomaliRows(anomali, ultg, bayGi)),
    [anomali, ultg, bayGi],
  );
  // Relay-obsolete is a separate forward-planning list (not itself part of
  // "data anomali"), kept scoped to the same ULTG but shown regardless of
  // which ruas is picked — matching bay/Gi names across the two sheets
  // isn't guaranteed to be exact, so this stays an ULTG-level reference
  // rather than risking silently hiding real rows behind a strict match.
  const relayObsoleteForUltg = useMemo(
    () => (ultg === ALL_VALUE ? relayObsolete : relayObsolete.filter((r) => r.ultg === ultg)),
    [relayObsolete, ultg],
  );

  const selesaiCount = selected.filter((r) => (r.status ?? "").toUpperCase() === "SELESAI").length;
  const belumCount = selected.length - selesaiCount;

  if (anomali.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Data Anomali belum tersedia.</p>;
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
              setBayGi(ALL_VALUE);
            },
            allLabel: "Semua ULTG",
          },
          { key: "baygi", value: bayGi, options: bayGiOptions, onChange: setBayGi, allLabel: "Pilih Ruas/GI...", width: "w-[260px]" },
        ]}
      />

      {bayGi === ALL_VALUE ? (
        <AssetSelectPrompt message="Pilih Ruas/GI untuk melihat detail temuan Anomali." />
      ) : selected.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada data untuk filter ini.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <AssetReportBanner
            title={bayGi}
            subtitle={`${selected[0].ultg} · ${selected.length} temuan`}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AssetStatTile value={selected.length} label="Total Temuan" />
            <AssetStatTile value={selesaiCount} label="Selesai" className="text-success" />
            <AssetStatTile value={belumCount} label="Belum Selesai" className="text-warning-foreground" />
            <AssetStatTile value={new Set(selected.map((r) => r.peralatan).filter(Boolean)).size} label="Jenis Peralatan" />
          </div>

          <div className="flex flex-col gap-3">
            {selected.map((row, i) => (
              <Card key={`${row.bayGi}-${i}`} className="border-l-4 border-l-primary print:break-inside-avoid print:border print:shadow-none">
                <CardContent className="flex flex-col gap-3 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-foreground">{row.peralatan}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.ultg}
                        {row.merk ? ` · ${row.merk}${row.type ? " " + row.type : ""}` : ""}
                        {row.sn ? ` · SN ${row.sn}` : ""}
                      </p>
                    </div>
                    <AssetStatusBadge label={row.status ?? "—"} tone={statusTone(row.status)} />
                  </div>

                  <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
                    <p className="text-xs font-bold tracking-wide text-warning-foreground uppercase">{row.anomali}</p>
                    {row.keteranganAnomali ? <p className="mt-0.5 text-sm text-foreground">{row.keteranganAnomali}</p> : null}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <AssetInfoField label="Tindak Lanjut" value={row.tindakLanjut ?? "—"} />
                    <AssetInfoField
                      label="Pengganti"
                      value={row.merkPengganti || row.typePengganti ? `${row.merkPengganti ?? "—"} ${row.typePengganti ?? ""}`.trim() : "—"}
                    />
                    <AssetInfoField label="Target" value={row.target ?? "—"} />
                    <AssetInfoField label="Realisasi" value={row.realisasi ?? "—"} />
                  </div>
                  {row.keteranganLanjutan ? (
                    <p className="text-xs text-muted-foreground">Catatan: {row.keteranganLanjutan}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {relayObsoleteForUltg.length > 0 ? (
        <Card className="print:break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-lg font-extrabold">Rencana Penggantian Relay Obsolete</CardTitle>
            <p className="text-xs text-muted-foreground">
              {relayObsoleteForUltg.length} relay direncanakan diganti karena sudah obsolete
              {ultg !== ALL_VALUE ? ` di ${ultg}` : ""} — tabel terpisah dari daftar anomali di atas.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                    <th className="px-3 py-2.5 font-bold">ULTG</th>
                    <th className="px-3 py-2.5 font-bold">GI</th>
                    <th className="px-3 py-2.5 font-bold">Bay</th>
                    <th className="px-3 py-2.5 font-bold">Alasan</th>
                    <th className="px-3 py-2.5 font-bold">Tipe Eksisting</th>
                    <th className="px-3 py-2.5 font-bold">Tipe Pengganti</th>
                  </tr>
                </thead>
                <tbody>
                  {relayObsoleteForUltg.map((row, i) => (
                    <tr key={`${row.bay}-${i}`} className="border-b last:border-0">
                      <td className="px-3 py-2 text-foreground">{row.ultg}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.gi}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.bay}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.anomali}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.tipeEksisting ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.tipePengganti ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
