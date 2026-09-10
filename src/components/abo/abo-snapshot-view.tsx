"use client";

import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ABO_MONTH_ABBR,
  ABO_MONTH_FULL,
  aboMonthAbbrIndex,
  buildAboSnapshotComputed,
  defaultAboWeekLabel,
} from "@/lib/abo-proteksi-compute";
import { cn } from "@/lib/utils";
import type { AboProgramComputed, AboSnapshot, AboUltgComputed } from "@/types";

function programAnchorId(code: string): string {
  return `abo-${code.toLowerCase()}`;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function StatusPill({ status }: { status: AboProgramComputed["status"] }) {
  const cls =
    status === "tercapai"
      ? "border-success/40 bg-success/10 text-success"
      : "border-warning/40 bg-warning/15 text-warning-foreground";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", cls)}>
      {status === "tercapai" ? "Tercapai" : "Belum"}
    </span>
  );
}

function ResumeTable({ programs }: { programs: AboProgramComputed[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:break-inside-avoid">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Program</th>
            <th className="px-3 py-2 font-medium">Target s.d. Periode</th>
            <th className="px-3 py-2 font-medium">Realisasi s.d. Periode</th>
            <th className="px-3 py-2 font-medium">% Realisasi</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p) => (
            <tr
              key={p.code}
              onClick={() => jumpTo(programAnchorId(p.code))}
              className="cursor-pointer border-b last:border-0 hover:bg-muted/10 print:cursor-auto"
            >
              <td className="px-3 py-2 text-foreground">
                <span className="font-medium">{p.code}</span>{" "}
                <span className="text-muted-foreground">{p.description}</span>
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.targetToDate}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.realisasiToDate}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatPercent(p.percentRealisasi)}</td>
              <td className="px-3 py-2">
                <StatusPill status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatGrid({ stats }: { stats: { master: number; targetToDate: number; realisasiToDate: number; percentTarget: number; percentRealisasi: number; gap: number } }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-lg border p-3">
        <div className="text-lg font-semibold tabular-nums text-foreground">{stats.master}</div>
        <div className="text-xs text-muted-foreground">Target Tahunan (Master)</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-lg font-semibold tabular-nums text-foreground">{stats.targetToDate}</div>
        <div className="text-xs text-muted-foreground">Target s.d. Periode</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-lg font-semibold tabular-nums text-foreground">{stats.realisasiToDate}</div>
        <div className="text-xs text-muted-foreground">Realisasi s.d. Periode</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-lg font-semibold tabular-nums text-foreground">{formatPercent(stats.percentTarget)}</div>
        <div className="text-xs text-muted-foreground">% Target</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-lg font-semibold tabular-nums text-foreground">{formatPercent(stats.percentRealisasi)}</div>
        <div className="text-xs text-muted-foreground">% Realisasi</div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-lg font-semibold tabular-nums text-foreground">{stats.gap}</div>
        <div className="text-xs text-muted-foreground">GAP</div>
      </div>
    </div>
  );
}

function UltgBreakdown({ ultgBreakdown }: { ultgBreakdown: AboUltgComputed[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-foreground">Breakdown per ULTG</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ultgBreakdown.map((u) => (
          <div key={u.ultg} className="flex flex-col gap-1 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">{u.ultg}</span>
              <StatusPill status={u.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              R:{u.realisasiToDate}/T:{u.targetToDate} · {formatPercent(u.percentRealisasi)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuasChecklist({
  ruasItems,
  selectedWeekLabel,
}: {
  ruasItems: AboProgramComputed["ruasItems"];
  selectedWeekLabel: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof ruasItems>();
    for (const item of ruasItems) {
      const list = map.get(item.ultg) ?? [];
      list.push(item);
      map.set(item.ultg, list);
    }
    return Array.from(map.entries());
  }, [ruasItems]);

  if (ruasItems.length === 0) {
    return <p className="text-xs text-muted-foreground">Belum ada ruas yang jatuh tempo pada periode ini.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-foreground">
        Breakdown per Ruas
        <span className="ml-1 font-normal text-muted-foreground">
          — termasuk ruas dari periode sebelumnya yang belum direalisasi
        </span>
      </p>
      {grouped.map(([ultg, items]) => (
        <div key={ultg} className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{ultg}</p>
          <ul className="flex flex-col gap-1">
            {items.map((item, i) => {
              const overdue = !item.done && item.targetWeekLabel !== selectedWeekLabel;
              return (
                <li key={`${item.asset}-${i}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("flex-1", item.done ? "text-foreground" : "text-muted-foreground")}>
                    {item.asset}
                  </span>
                  {overdue ? (
                    <span className="inline-flex rounded-full border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
                      Terlambat
                    </span>
                  ) : null}
                  {item.targetWeekLabel ? (
                    <span className="text-xs text-muted-foreground">{item.targetWeekLabel}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ProgramCard({ program, selectedWeekLabel }: { program: AboProgramComputed; selectedWeekLabel: string }) {
  return (
    <Card id={programAnchorId(program.code)} className="scroll-mt-16 print:break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{program.code}</CardTitle>
          <StatusPill status={program.status} />
        </div>
        <p className="text-xs text-muted-foreground">{program.description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">Target &amp; Realisasi UPT</p>
          <StatGrid stats={program} />
        </div>
        <UltgBreakdown ultgBreakdown={program.ultgBreakdown} />
        <RuasChecklist ruasItems={program.ruasItems} selectedWeekLabel={selectedWeekLabel} />
      </CardContent>
    </Card>
  );
}

export function AboSnapshotView({ snapshot, emptyMessage }: { snapshot: AboSnapshot; emptyMessage: string }) {
  const [weekLabel, setWeekLabel] = useState(() => defaultAboWeekLabel());
  const [monthAbbr, weekOfMonth] = weekLabel.split("-M");

  const programs = buildAboSnapshotComputed(snapshot, weekLabel);

  if (snapshot.programs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select
          value={monthAbbr}
          onValueChange={(v) => {
            if (!v) return;
            setWeekLabel(`${v}-M1`);
          }}
        >
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Bulan">{ABO_MONTH_FULL[aboMonthAbbrIndex(monthAbbr)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ABO_MONTH_ABBR.map((m) => (
              <SelectItem key={m} value={m}>
                {ABO_MONTH_FULL[aboMonthAbbrIndex(m)]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={weekOfMonth} onValueChange={(v) => v && setWeekLabel(`${monthAbbr}-M${v}`)}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Minggu ke-">{`Minggu ke-${weekOfMonth}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {["1", "2", "3", "4"].map((w) => (
              <SelectItem key={w} value={w}>
                Minggu ke-{w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 print:border-0 print:bg-transparent print:p-0">
        <p className="text-sm font-semibold text-foreground">
          Periode {ABO_MONTH_FULL[aboMonthAbbrIndex(monthAbbr)]}-M{weekOfMonth}
        </p>
        <p className="text-xs text-muted-foreground">Target &amp; realisasi kumulatif sejak Jan-M1 s.d. periode ini.</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Resume Semua Program</h3>
        <ResumeTable programs={programs} />
      </div>

      <div className="flex flex-col gap-3">
        {programs.map((p) => (
          <Fragment key={p.code}>
            <ProgramCard program={p} selectedWeekLabel={weekLabel} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
