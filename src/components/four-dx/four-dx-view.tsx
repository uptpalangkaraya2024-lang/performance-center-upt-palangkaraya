"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, Copy, MessageSquareText, Printer } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  MONTH_ABBR_ID,
  MONTH_FULL_ID,
  buildFourDxWigs,
  formatFourDxWaRecap,
  monthAbbrIndex,
  resolvePeriodRange,
} from "@/lib/four-dx-compute";
import { cn } from "@/lib/utils";
import type { FourDxLm, FourDxSnapshot, FourDxWig } from "@/types";

// One accent color per WIG — same sticky-banner pattern as AHI Bay Line
// (src/components/ahi/bay-line-report.tsx) and Gangguan.
const WIG_COLORS = ["var(--chart-1)", "var(--brand)", "var(--chart-4)", "var(--chart-3)"];

function wigAnchorId(wigNumber: number): string {
  return `wig-${wigNumber}`;
}

function lmAnchorId(lmCode: string): string {
  return `lm-${lmCode.replace(".", "-")}`;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function StatusPill({ status }: { status: FourDxLm["status"] }) {
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

function ResumeTable({ wigs }: { wigs: FourDxWig[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:break-inside-avoid">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">WIG / Lead Measure</th>
            <th className="px-3 py-2 font-medium">Target Mingguan</th>
            <th className="px-3 py-2 font-medium">Realisasi Mingguan</th>
            <th className="px-3 py-2 font-medium">%</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {wigs.map((wig) => (
            <Fragment key={wig.number}>
              <tr className="border-b bg-muted/20">
                <td colSpan={5} className="px-3 py-1.5 text-xs font-bold tracking-tight text-foreground">
                  WIG {wig.number}
                </td>
              </tr>
              {wig.lms.map((lm) => (
                <tr
                  key={lm.code}
                  onClick={() => jumpTo(lmAnchorId(lm.code))}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/10 print:cursor-auto"
                >
                  <td className="px-3 py-2 pl-6 text-foreground">
                    <span className="font-medium">LM {lm.code}</span>{" "}
                    <span className="text-muted-foreground">{lm.description}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{lm.targetMingguan}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{lm.realisasiMingguan}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatPercent(lm.percentRealisasiMingguan)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={lm.status} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WigBanner({ wig }: { wig: FourDxWig }) {
  const accent = WIG_COLORS[(wig.number - 1) % WIG_COLORS.length];
  return (
    <div
      id={wigAnchorId(wig.number)}
      className="sticky top-0 z-20 -mx-4 -mb-2 scroll-mt-4 border-y bg-card px-4 py-2 print:static print:border-0 print:bg-transparent print:px-0 print:py-1"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full print:hidden" style={{ backgroundColor: accent }} />
        <h3 className="text-base font-bold tracking-tight text-foreground">
          WIG {wig.number}. {wig.title.replace(/^WIG\s*\d+\.\s*/i, "")}
        </h3>
      </div>
    </div>
  );
}

function LmCard({ lm }: { lm: FourDxLm }) {
  return (
    <Card id={lmAnchorId(lm.code)} className="scroll-mt-16 print:break-inside-avoid print:border print:shadow-none">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">LM {lm.code}</CardTitle>
          <StatusPill status={lm.status} />
        </div>
        <p className="text-xs text-muted-foreground">{lm.description}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">
            Target &amp; Realisasi UPT
            <span className="ml-1 font-normal text-muted-foreground">
              — menentukan status tercapai/belum, walau breakdown di bawah masih ada yang kurang
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">{lm.targetBulanan}</div>
              <div className="text-xs text-muted-foreground">Target Bulanan</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">{lm.targetMingguan}</div>
              <div className="text-xs text-muted-foreground">Target Mingguan</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">{lm.realisasiMingguan}</div>
              <div className="text-xs text-muted-foreground">Realisasi Mingguan</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-lg font-semibold tabular-nums text-foreground">
                {formatPercent(lm.percentRealisasiMingguan)}
              </div>
              <div className="text-xs text-muted-foreground">% Realisasi Mingguan</div>
            </div>
          </div>
        </div>

        {lm.assets.length === 0 ? (
          <p className="text-xs text-muted-foreground">Tidak ada aset yang dijadwalkan pada periode ini.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-foreground">Breakdown per ULTG / Ruas</p>
            <ul className="flex flex-col gap-1">
              {/* Same "Total UPT" line the WA recap leads with — placed here
                  too so the Tercapai/Belum badge above is never a mystery
                  next to a breakdown where every individual ULTG still
                  looks short (the UPT total can already meet target via a
                  manual top-up between ULTGs — see buildFourDxLm). */}
              <li
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium",
                  lm.status === "tercapai" ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/15",
                )}
              >
                {lm.status === "tercapai" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 text-foreground">Total UPT</span>
                <span className="text-xs text-muted-foreground">
                  R:{lm.realisasiMingguan}/T:{lm.targetMingguan}
                </span>
              </li>
              {lm.assets.map((asset) => (
                <li key={asset.asset} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                  {asset.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("flex-1", asset.done ? "text-foreground" : "text-muted-foreground")}>
                    {asset.asset}
                  </span>
                  {asset.targetThisWeek > 1 ? (
                    <span className="text-xs text-muted-foreground">
                      R:{asset.realizedCount}/T:{asset.targetThisWeek}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Slide-in panel from the side (not a card sitting in the main page flow) —
// keeps the recap available on demand without pushing down/competing with
// the Resume table and per-WIG sections for vertical space on the main page.
function WaRecapSheet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <MessageSquareText className="size-3.5" />
            Rekap Format WA
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Rekap Format WA</SheetTitle>
          <SheetDescription>
            Siap ditempel ke WhatsApp — cek dulu kesesuaiannya dengan spreadsheet sebelum dikirim.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-hidden px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // clipboard permission denied — the text is still selectable below
              }
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Tersalin" : "Copy"}
          </Button>
          <pre className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-3 text-xs whitespace-pre-wrap text-foreground">
            {text}
          </pre>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function FourDxView({ snapshot }: { snapshot: FourDxSnapshot }) {
  // Month/week options come from DATASET's own boundaries (periodBoundaries)
  // rather than TARGET WIG's columns — a month can legitimately have 5 weeks
  // (e.g. a 31-day month), and which weeks exist varies per month, so this
  // can't be a fixed 1-4 list.
  const monthOptions = useMemo(() => {
    const present = new Set<string>();
    for (const b of snapshot.periodBoundaries) present.add(b.monthAbbr);
    return MONTH_ABBR_ID.filter((m) => present.has(m));
  }, [snapshot.periodBoundaries]);

  const [monthAbbr, setMonthAbbr] = useState(() => snapshot.currentPeriodLabel.split("-M")[0]);
  const [weekOfMonth, setWeekOfMonth] = useState(() =>
    Number(/-M(\d+)$/.exec(snapshot.currentPeriodLabel)?.[1] ?? "1"),
  );

  const weekOptions = useMemo(() => {
    return snapshot.periodBoundaries
      .filter((b) => b.monthAbbr === monthAbbr)
      .map((b) => b.weekOfMonth)
      .sort((a, b) => a - b);
  }, [snapshot.periodBoundaries, monthAbbr]);

  const period = useMemo(
    () => resolvePeriodRange(`${monthAbbr}-M${weekOfMonth}`, snapshot.periodBoundaries, snapshot.currentYear),
    [monthAbbr, weekOfMonth, snapshot.periodBoundaries, snapshot.currentYear],
  );

  const wigs = useMemo(
    () => buildFourDxWigs(snapshot.wigs, period, snapshot.realizations, snapshot.monitoring),
    [snapshot.wigs, snapshot.realizations, snapshot.monitoring, period],
  );

  const waRecap = useMemo(
    () => formatFourDxWaRecap(period, snapshot.currentYear, wigs),
    [period, snapshot.currentYear, wigs],
  );

  if (snapshot.wigs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Data 4DX belum tersedia — lihat halaman Data & Sync untuk detail.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select
          value={monthAbbr}
          onValueChange={(v) => {
            if (!v) return;
            setMonthAbbr(v);
            // Week count varies per month (a 31-day month can have a 5th
            // week) — clamp to that month's first available week rather
            // than keep a week number that might not exist there.
            const firstWeek = snapshot.periodBoundaries.find((b) => b.monthAbbr === v)?.weekOfMonth ?? 1;
            setWeekOfMonth(firstWeek);
          }}
        >
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue placeholder="Bulan">{MONTH_FULL_ID[monthAbbrIndex(monthAbbr)]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {MONTH_FULL_ID[monthAbbrIndex(m)]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(weekOfMonth)} onValueChange={(v) => v && setWeekOfMonth(Number(v))}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue placeholder="Minggu ke-">{`Minggu ke-${weekOfMonth}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {weekOptions.map((w) => (
              <SelectItem key={w} value={String(w)}>
                Minggu ke-{w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <WaRecapSheet text={waRecap} />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            Cetak / Simpan PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 print:border-0 print:bg-transparent print:p-0">
        <p className="text-sm font-semibold text-foreground">
          Periode {MONTH_FULL_ID[monthAbbrIndex(monthAbbr)]}-M{weekOfMonth}
        </p>
        <p className="text-xs text-muted-foreground">
          {period.weekStartISO} s.d. {period.weekEndISO}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Resume Semua Lead Measure</h3>
        <ResumeTable wigs={wigs} />
      </div>

      {wigs.map((wig) => (
        <div key={wig.number} className="flex flex-col gap-2">
          <WigBanner wig={wig} />
          <div className="flex flex-col gap-3">
            {wig.lms.map((lm) => (
              <LmCard key={lm.code} lm={lm} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
