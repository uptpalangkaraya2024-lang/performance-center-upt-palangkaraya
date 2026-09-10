"use client";

import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import { AboSnapshotView } from "@/components/abo/abo-snapshot-view";
import type { AboSnapshot } from "@/types";

type AboSubModule = "proteksi" | "hargi";

const SUB_MODULES: { value: AboSubModule; label: string; source: string }[] = [
  { value: "proteksi", label: "Proteksi", source: "ABO 2026 SUB BID. PROTEKSI UIP3B KAL" },
  { value: "hargi", label: "Hargi", source: "ABO 2026 SUB BID. HARGI UIP3B KAL" },
];

export function AboPageShell({ proteksi, hargi }: { proteksi: AboSnapshot; hargi: AboSnapshot }) {
  const [tab, setTab] = useState<AboSubModule>("proteksi");

  const active = SUB_MODULES.find((m) => m.value === tab)!;
  const snapshot = tab === "proteksi" ? proteksi : hargi;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 print:hidden">
        <Tabs value={tab} onValueChange={(v) => v && setTab(v as AboSubModule)}>
          <TabsList className="w-fit">
            {SUB_MODULES.map((m) => (
              <TabsTrigger key={m.value} value={m.value}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <PageHero
          title={`ABO ${active.label} UPT Palangkaraya`}
          description="Target dan realisasi kumulatif tiap program Anti Blackout per UPT/ULTG/ruas — dihitung otomatis untuk periode yang dipilih."
          status={
            !snapshot.error ? (
              <>
                <span className="size-1.5 rounded-full bg-success" />
                Data synchronized
              </>
            ) : null
          }
        />
      </div>

      {snapshot.error ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message={`Sinkronisasi ABO ${active.label} belum berhasil. Lihat halaman Data & Sync untuk detail.`} />
          </CardContent>
        </Card>
      ) : (
        <AboSnapshotView
          snapshot={snapshot}
          emptyMessage={`Data ABO ${active.label} belum tersedia — lihat halaman Data & Sync untuk detail.`}
        />
      )}

      <p className="text-[11px] text-muted-foreground print:hidden">
        Source: {active.source} · Sheet: 🖥️ PKY, 📝 INPUT PKY · Provider: Apps Script
      </p>
    </div>
  );
}
