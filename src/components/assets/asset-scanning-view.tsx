"use client";

import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AssetScanningSnapshot } from "@/types";
import { MpuBayLinePanel } from "./mpu-bay-line-panel";
import { BpuBayLinePanel } from "./bpu-bay-line-panel";
import { MpuBusproPanel } from "./mpu-buspro-panel";
import { AnomaliPanel } from "./anomali-panel";

type AssetTab = "mpu-bay-line" | "bpu-bay-line" | "mpu-buspro" | "anomali";

// One tab per sheet pulled from "REKAPITULASI SCANNING" so far — more
// sheets (MPU FASOP, BATTERY & RECTIFIER, TWS, MPU/BPU BAY TRAFO, ...) are
// expected to join this same list later, per the user's own stated plan;
// adding one just means another TABS entry + panel component, the page's
// own data-fetch/layout doesn't need to change.
const TABS: { value: AssetTab; label: string }[] = [
  { value: "mpu-bay-line", label: "MPU Bay Line" },
  { value: "bpu-bay-line", label: "BPU Bay Line" },
  { value: "mpu-buspro", label: "MPU Buspro" },
  { value: "anomali", label: "Anomali" },
];

export function AssetScanningView({ snapshot }: { snapshot: AssetScanningSnapshot }) {
  const [tab, setTab] = useState<AssetTab>("mpu-bay-line");

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={(v) => v && setTab(v as AssetTab)}>
        <TabsList className="w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "mpu-bay-line" ? <MpuBayLinePanel rows={snapshot.mpuBayLine} /> : null}
      {tab === "bpu-bay-line" ? <BpuBayLinePanel rows={snapshot.bpuBayLine} /> : null}
      {tab === "mpu-buspro" ? <MpuBusproPanel rows={snapshot.mpuBuspro} /> : null}
      {tab === "anomali" ? <AnomaliPanel anomali={snapshot.anomali} relayObsolete={snapshot.relayObsolete} /> : null}
    </div>
  );
}
