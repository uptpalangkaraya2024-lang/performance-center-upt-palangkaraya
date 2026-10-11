"use client";

import { useState } from "react";

import { BayLineReportView, type ReportKind } from "@/components/ahi/bay-line-report";
import { RenusOutageSyncPanel } from "@/components/ahi/renus-outage-sync-panel";
import type { RenusOutageSyncWeek } from "@/lib/renus-outage-sync";
import type { BayLineReport } from "@/types";

/** Owns the one piece of state the RENUS sync panel and the manual GI/Bay
 *  selector both need to agree on — which (kind, bay) is currently open —
 *  so clicking a "Lihat Report" button in the sync panel drives the exact
 *  same selector the page already had, instead of needing two separate
 *  report views. */
export function AhiBayReportPanel({
  reportsByKind,
  renusSync,
}: {
  reportsByKind: Record<ReportKind, BayLineReport[]>;
  renusSync: { thisWeek: RenusOutageSyncWeek; nextWeek: RenusOutageSyncWeek } | null;
}) {
  const [jumpTo, setJumpTo] = useState<{ kind: ReportKind; bay: string; nonce: number } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {renusSync ? (
        <RenusOutageSyncPanel
          thisWeek={renusSync.thisWeek}
          nextWeek={renusSync.nextWeek}
          onSelectBay={(kind, bay) => setJumpTo((prev) => ({ kind, bay, nonce: (prev?.nonce ?? 0) + 1 }))}
        />
      ) : null}
      <BayLineReportView reportsByKind={reportsByKind} jumpTo={jumpTo} />
    </div>
  );
}
