// Pure, period-specific 4DX computation — deliberately NOT "server-only".
// src/services/four-dx.ts does the one-time spreadsheet parse (server-only,
// produces the *Raw shapes), and this file turns a raw snapshot + a chosen
// (month, week) into the same per-LM numbers a human currently hand-writes
// into a weekly WhatsApp update. Shared by the page's server-rendered
// default view AND the client's month/week filter, so changing the filter
// never needs a server round-trip (same "load once, derive many things"
// shape as src/services/ahi-bay-line-report.ts).
import type {
  FourDxAssetStatus,
  FourDxLm,
  FourDxLmRaw,
  FourDxMonitoringRow,
  FourDxRealization,
  FourDxWig,
  FourDxWigRaw,
} from "@/types";

export const MONTH_ABBR_ID = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
export const MONTH_FULL_ID = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
];
export const MONTH_TITLE_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function monthAbbrIndex(abbr: string): number {
  return MONTH_ABBR_ID.indexOf(abbr.toUpperCase());
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function dayOfMonthToWeek(day: number): number {
  return Math.ceil(day / 7);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function isUltgLevelAsset(asset: string): boolean {
  return normalize(asset).startsWith("ULTG ");
}

export interface FourDxPeriodRange {
  /** Uncapped — can be "M5" for the trailing 1-3 days of a long month. */
  label: string;
  /** Capped at M4 — TARGET WIG sheets never define an M5 column, so the
   *  trailing days of a long month piggyback on M4's own weekly target. */
  lookupLabel: string;
  monthAbbr: string;
  weekOfMonth: number;
  weekStartISO: string;
  weekEndISO: string;
  weekStartDay: number;
  weekEndDay: number;
}

export function computeFourDxPeriodRange(monthAbbr: string, weekOfMonth: number, year: number): FourDxPeriodRange {
  const monthIndex = monthAbbrIndex(monthAbbr);
  const lookupWeek = Math.min(weekOfMonth, 4);
  const weekStartDay = (weekOfMonth - 1) * 7 + 1;
  const weekEndDay = Math.min(weekStartDay + 6, daysInMonth(year, monthIndex));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    label: `${monthAbbr}-M${weekOfMonth}`,
    lookupLabel: `${monthAbbr}-M${lookupWeek}`,
    monthAbbr,
    weekOfMonth,
    weekStartISO: `${year}-${pad(monthIndex + 1)}-${pad(weekStartDay)}`,
    weekEndISO: `${year}-${pad(monthIndex + 1)}-${pad(weekEndDay)}`,
    weekStartDay,
    weekEndDay,
  };
}

export function buildFourDxLm(
  lm: FourDxLmRaw,
  period: FourDxPeriodRange,
  realizations: FourDxRealization[],
  monitoring: FourDxMonitoringRow[],
): FourDxLm {
  let targetMingguan = 0;
  let targetBulanan = 0;
  const scheduled: FourDxLmRaw["assets"] = [];

  for (const asset of lm.assets) {
    const weekTarget = asset.weeklyTargets[period.lookupLabel] ?? 0;
    if (weekTarget > 0) {
      targetMingguan += weekTarget;
      scheduled.push(asset);
    }
    for (const [weekLabel, qty] of Object.entries(asset.weeklyTargets)) {
      if (weekLabel.startsWith(`${period.monthAbbr}-M`)) targetBulanan += qty;
    }
  }

  const matchingThisLm = realizations.filter(
    (r) => r.lmCode === lm.code && r.tanggal >= period.weekStartISO && r.tanggal <= period.weekEndISO,
  );

  const assets: FourDxAssetStatus[] = scheduled.map((asset) => {
    const ultgLevel = isUltgLevelAsset(asset.asset);
    const matches = matchingThisLm.filter((r) =>
      ultgLevel ? normalize(r.ultg) === normalize(asset.asset) : normalize(r.asset) === normalize(asset.asset),
    );
    const targetThisWeek = asset.weeklyTargets[period.lookupLabel] ?? 0;
    return {
      asset: asset.asset,
      targetThisWeek,
      realizedCount: matches.length,
      done: matches.length >= targetThisWeek,
      realizedAt: matches[0]?.tanggal ?? null,
    };
  });

  // Realisasi Mingguan comes from the "Monitoring" sheet (a manually-
  // reconciled weekly count, confirmed with the user to be more complete
  // than the raw ULTG/K3 logs — some realizations are only ever entered
  // there). Matched by normalized LM description, summed across every ULTG
  // (TARGET WIG's own target for WIG 1 & 3 isn't split by ULTG either).
  // Falls back to counting matching raw log rows if this LM has no
  // Monitoring rows at all (sheet temporarily unavailable, etc).
  const monitoringRows = monitoring.filter((m) => normalize(m.description) === normalize(lm.description));
  const realisasiMingguan =
    monitoringRows.length > 0
      ? monitoringRows.reduce((sum, m) => sum + (m.weeklyRealisasi[period.lookupLabel] ?? 0), 0)
      : matchingThisLm.length;
  const percentRealisasiMingguan = targetMingguan > 0 ? realisasiMingguan / targetMingguan : null;
  const status: FourDxLm["status"] =
    percentRealisasiMingguan !== null && percentRealisasiMingguan >= 1 ? "tercapai" : "belum";

  return {
    code: lm.code,
    description: lm.description,
    targetMingguan,
    targetBulanan,
    realisasiMingguan,
    percentRealisasiMingguan,
    status,
    assets,
  };
}

export function buildFourDxWigs(
  wigsRaw: FourDxWigRaw[],
  period: FourDxPeriodRange,
  realizations: FourDxRealization[],
  monitoring: FourDxMonitoringRow[],
): FourDxWig[] {
  return wigsRaw.map((wig) => ({
    number: wig.number,
    title: wig.title,
    lms: wig.lms.map((lm) => buildFourDxLm(lm, period, realizations, monitoring)),
  }));
}

/** WhatsApp-style recap text for one chosen period — mirrors the manual
 *  weekly update format (confirmed against a real example the user pasted):
 *  per-asset LMs get a plain "- <asset> ✅" line, ULTG-level LMs (WIG 2 & 4)
 *  get "- <ULTG> (R:n/T:n) ✅" since their target is a quantity, not a single
 *  yes/no per asset. The header date range follows this dashboard's own
 *  ceil(day/7) week rule, which may differ by a day or two from a manually
 *  hand-typed range — worth eyeballing against the spreadsheet once. */
export function formatFourDxWaRecap(period: FourDxPeriodRange, year: number, wigs: FourDxWig[]): string {
  const monthIndex = monthAbbrIndex(period.monthAbbr);
  const monthFull = MONTH_FULL_ID[monthIndex];
  const monthTitle = MONTH_TITLE_ID[monthIndex];
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateRange = `${pad(period.weekStartDay)}-${pad(period.weekEndDay)} ${monthTitle} ${year}`;

  const lines: string[] = [`*UPDATE TARGET 4DX periode ${monthFull}-M${period.weekOfMonth} (${dateRange})*`];

  for (const wig of wigs) {
    const tercapaiCount = wig.lms.filter((lm) => lm.status === "tercapai").length;
    const belumCount = wig.lms.length - tercapaiCount;

    lines.push("");
    lines.push(`*WIG ${wig.number}. ${wig.title.replace(/^WIG\s*\d+\.\s*/i, "")}*`);
    lines.push(`✅ ${tercapaiCount} tercapai · ⏳ ${belumCount} belum`);
    for (const lm of wig.lms) {
      lines.push(`LM ${lm.code} ${lm.description}`);
      if (lm.assets.length === 0) {
        lines.push("- Tidak ada aset dijadwalkan pada periode ini");
      }
      for (const asset of lm.assets) {
        const mark = asset.done ? "✅" : "⏳";
        if (isUltgLevelAsset(asset.asset)) {
          lines.push(`- ${asset.asset} (R:${asset.realizedCount}/T:${asset.targetThisWeek}) ${mark}`);
        } else {
          lines.push(`- ${asset.asset} ${mark}`);
        }
      }
    }
  }

  return lines.join("\n").trim();
}
