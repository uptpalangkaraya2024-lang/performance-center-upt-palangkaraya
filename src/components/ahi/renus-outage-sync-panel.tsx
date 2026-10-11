"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BayMatchCandidate } from "@/lib/renus-ahi-bay-match";
import type { RenusOutageSyncWeek } from "@/lib/renus-outage-sync";
import type { ReportKind } from "@/components/ahi/bay-line-report";

const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  "bay-line": "Bay Line",
  "bay-trafo": "Bay Trafo",
  "bay-kopel": "Bay Kopel",
  "bay-reaktor": "Bay Reaktor",
  "bay-kapasitor": "Bay Kapasitor",
  "bay-gt": "Bay GT",
  "bay-bus": "CVT Bus",
  "bay-diameter": "Bay Diameter",
};

type WeekTab = "this" | "next";

function CandidateButtons({ candidates, onSelect }: { candidates: BayMatchCandidate[]; onSelect: (kind: ReportKind, bay: string) => void }) {
  if (candidates.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {candidates.map((c) => (
        <Button
          key={`${c.kind}-${c.bay}`}
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => onSelect(c.kind, c.bay)}
        >
          <ExternalLink className="size-3" />
          {candidates.length > 1 ? c.bay : "Lihat Report"}
        </Button>
      ))}
    </div>
  );
}

/** One week's padam list — RENUS rows whose RENCANA date falls in that
 *  Friday–Thursday period, each cross-referenced against the AHI Bay
 *  Report system. A row with exactly 1 match gets a single "Lihat Report"
 *  button; several candidates (e.g. a line's 2 physical ends, each their
 *  own AHI-monitored bay) show one button per candidate so the user still
 *  picks which ruas they mean, per explicit request — this list never
 *  silently guesses which one. */
function WeekTable({ week, onSelect }: { week: RenusOutageSyncWeek; onSelect: (kind: ReportKind, bay: string) => void }) {
  if (week.entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Tidak ada pekerjaan RENUS terjadwal pada periode {week.period.label}.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2.5 font-bold">Tanggal</th>
            <th className="px-3 py-2.5 font-bold">ULTG / GI</th>
            <th className="px-3 py-2.5 font-bold">Ruas / Bay (RENUS)</th>
            <th className="px-3 py-2.5 font-bold">Pekerjaan</th>
            <th className="px-3 py-2.5 font-bold">Report AHI</th>
          </tr>
        </thead>
        <tbody>
          {week.entries.map(({ renusRow, kind, candidates }, i) => (
            <tr key={renusRow.id ?? i} className="border-b last:border-0 align-top">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{renusRow.rencanaDate}</td>
              <td className="px-3 py-2 text-foreground">
                <div className="font-medium">{renusRow.gi}</div>
                <div className="text-xs text-muted-foreground">{renusRow.ultg}</div>
              </td>
              <td className="px-3 py-2 text-foreground">{renusRow.bay}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{renusRow.workDetail}</td>
              <td className="px-3 py-2">
                {candidates.length > 0 ? (
                  <CandidateButtons candidates={candidates} onSelect={onSelect} />
                ) : kind ? (
                  <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
                    <AlertTriangle className="size-3 shrink-0" />
                    {REPORT_KIND_LABEL[kind]} — bay tidak ditemukan
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Bukan jenis bay yang terpantau AHI</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lets the user see, straight from the AHI Report tab, which bays are
 *  scheduled for a RENUS outage this week or next — so they know which
 *  equipment can actually be tested (de-energized) without having to
 *  cross-check the RENUS page separately. Picking any "Lihat Report"
 *  button jumps the existing manual GI/Bay selector below to that exact
 *  bay — manual selection stays fully available either way. */
export function RenusOutageSyncPanel({
  thisWeek,
  nextWeek,
  onSelectBay,
  initialWeek,
}: {
  thisWeek: RenusOutageSyncWeek;
  nextWeek: RenusOutageSyncWeek;
  onSelectBay: (kind: ReportKind, bay: string) => void;
  initialWeek?: "this" | "next";
}) {
  const [tab, setTab] = useState<WeekTab>(initialWeek ?? "this");
  const week = tab === "this" ? thisWeek : nextWeek;
  const unmatchedCount = week.entries.filter((e) => e.candidates.length === 0).length;

  return (
    <Card className="print:hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg font-extrabold">Ruas Padam (RENUS)</CardTitle>
          <div className="flex items-center gap-1.5 rounded-lg border bg-secondary p-1">
            <button
              type="button"
              onClick={() => setTab("this")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold",
                tab === "this" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <CalendarDays className="size-3.5" />
              Minggu Ini
            </button>
            <button
              type="button"
              onClick={() => setTab("next")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold",
                tab === "next" ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <CalendarDays className="size-3.5" />
              Minggu Depan
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Periode {week.period.label} — {week.entries.length} pekerjaan RENUS terjadwal
          {unmatchedCount > 0 ? `, ${unmatchedCount} belum cocok ke Report AHI manapun` : ""}. Pilih salah satu untuk
          langsung melihat Report AHI bay tersebut, atau tetap pilih manual lewat selector di bawah.
        </p>
      </CardHeader>
      <CardContent>
        <WeekTable week={week} onSelect={onSelectBay} />
      </CardContent>
    </Card>
  );
}
