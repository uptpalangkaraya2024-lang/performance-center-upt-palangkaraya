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
  FourDxPeriodBoundary,
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

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function isUltgLevelAsset(asset: string): boolean {
  return normalize(asset).startsWith("ULTG ");
}

export interface FourDxPeriodRange {
  /** Uncapped — can be "M5" for the trailing days of a long month. */
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

/** Resolves a week-of-month label to its real date range by LOOKING IT UP in
 *  the boundaries read from the DATASET sheet — never computed. A per-month
 *  ceil(day/7) formula was tried and disproven by the user against the live
 *  sheet: September's M1 is only 6 days (Sep 1-6) and M4 absorbs 10 days
 *  (Sep 21-30), not the clean 7-day blocks January happens to have. Falls
 *  back to a plain ceil(day/7) estimate only if this exact label is missing
 *  from `boundaries` (DATASET sheet unavailable) — better than showing
 *  nothing, but callers should prefer the looked-up value whenever present. */
export function resolvePeriodRange(
  label: string,
  boundaries: FourDxPeriodBoundary[],
  fallbackYear: number,
): FourDxPeriodRange {
  const found = boundaries.find((b) => b.label === label);
  const monthAbbr = label.split("-M")[0];
  const weekOfMonth = Number(/-M(\d+)$/.exec(label)?.[1] ?? "1");
  const lookupLabel = `${monthAbbr}-M${Math.min(weekOfMonth, 4)}`;

  if (found) {
    return {
      label,
      lookupLabel,
      monthAbbr,
      weekOfMonth,
      weekStartISO: found.startISO,
      weekEndISO: found.endISO,
      weekStartDay: Number(found.startISO.split("-")[2]),
      weekEndDay: Number(found.endISO.split("-")[2]),
    };
  }

  // Fallback estimate — only reached if DATASET has no row for this label.
  const monthIndex = monthAbbrIndex(monthAbbr);
  const daysInMonth = new Date(fallbackYear, monthIndex + 1, 0).getDate();
  const weekStartDay = (weekOfMonth - 1) * 7 + 1;
  const weekEndDay = Math.min(weekStartDay + 6, daysInMonth);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    label,
    lookupLabel,
    monthAbbr,
    weekOfMonth,
    weekStartISO: `${fallbackYear}-${pad(monthIndex + 1)}-${pad(weekStartDay)}`,
    weekEndISO: `${fallbackYear}-${pad(monthIndex + 1)}-${pad(weekEndDay)}`,
    weekStartDay,
    weekEndDay,
  };
}

export function buildFourDxLm(
  lm: FourDxLmRaw,
  period: FourDxPeriodRange,
  realizations: FourDxRealization[],
  monitoring: FourDxMonitoringRow[],
  useTargetTotalRow = false,
  isUltgLevelLm = false,
  fallbackMonitoringDescription: string | null = null,
): FourDxLm {
  let targetMingguanFromAssets = 0;
  let targetBulananFromAssets = 0;
  const scheduled: FourDxLmRaw["assets"] = [];

  for (const asset of lm.assets) {
    const weekTarget = asset.weeklyTargets[period.lookupLabel] ?? 0;
    if (weekTarget > 0) {
      targetMingguanFromAssets += weekTarget;
      scheduled.push(asset);
    }
    for (const [weekLabel, qty] of Object.entries(asset.weeklyTargets)) {
      if (weekLabel.startsWith(`${period.monthAbbr}-M`)) targetBulananFromAssets += qty;
    }
  }

  // WIG 4: per-ULTG target values are confirmed arbitrary (they shift with
  // timing), so its own "Target N ... tiap Minggu" row is the authoritative
  // target instead of summing the per-ULTG rows above. The breakdown below
  // is unaffected by this — it's built from Monitoring for ULTG-level LMs
  // regardless, not from these per-asset targets.
  const useTotalRow = useTargetTotalRow && lm.targetTotalRow;
  const targetMingguan = useTotalRow ? (lm.targetTotalRow![period.lookupLabel] ?? 0) : targetMingguanFromAssets;
  const targetBulanan = useTotalRow
    ? Object.entries(lm.targetTotalRow!)
        .filter(([weekLabel]) => weekLabel.startsWith(`${period.monthAbbr}-M`))
        .reduce((sum, [, qty]) => sum + qty, 0)
    : targetBulananFromAssets;

  // Realisasi Mingguan comes from the "Monitoring" sheet (a manually-
  // reconciled weekly count, confirmed with the user to be more complete
  // than the raw ULTG/K3 logs — some realizations are only ever entered
  // there). Matched by normalized LM description.
  //
  // Monitoring carries a 4th row per LM with a BLANK ULTG — the UPT-level
  // total, confirmed directly with the user: individual ULTGs sometimes
  // fall short of their own target, so the team tops the shortfall up
  // manually at the UPT level (not attributed to any one ULTG) so the
  // overall figure still hits target. That UPT-level row is therefore the
  // authoritative realisasi — preferred over summing the per-ULTG rows,
  // which would undercount whenever a top-up exists.
  // WIG 4: Monitoring's own wording (and even stated quantities) for its LMs
  // don't match TARGET WIG 4's descriptions at all — confirmed directly
  // against the live sheet. Falls back to matching by ordinal position
  // within the same WIG goal-statement (`fallbackMonitoringDescription`,
  // computed by buildFourDxWigs) whenever the direct description match
  // finds nothing.
  const directMonitoringRows = monitoring.filter((m) => normalize(m.description) === normalize(lm.description));
  const monitoringRows =
    directMonitoringRows.length > 0
      ? directMonitoringRows
      : fallbackMonitoringDescription
        ? monitoring.filter((m) => normalize(m.description) === normalize(fallbackMonitoringDescription))
        : directMonitoringRows;
  const uptLevelRows = monitoringRows.filter((m) => !m.ultg);
  const perUltgMonitoringRows = monitoringRows.filter((m) => m.ultg);

  const matchingThisLm = realizations.filter(
    (r) => r.lmCode === lm.code && r.tanggal >= period.weekStartISO && r.tanggal <= period.weekEndISO,
  );

  const realisasiMingguan =
    uptLevelRows.length > 0
      ? uptLevelRows.reduce((sum, m) => sum + (m.weeklyRealisasi[period.lookupLabel] ?? 0), 0)
      : perUltgMonitoringRows.length > 0
        ? perUltgMonitoringRows.reduce((sum, m) => sum + (m.weeklyRealisasi[period.lookupLabel] ?? 0), 0)
        : matchingThisLm.length;
  const percentRealisasiMingguan = targetMingguan > 0 ? realisasiMingguan / targetMingguan : null;
  const status: FourDxLm["status"] =
    percentRealisasiMingguan !== null && percentRealisasiMingguan >= 1 ? "tercapai" : "belum";

  // Breakdown: for a ULTG-level LM (WIG 2 & 4), built from Monitoring's own
  // per-ULTG rows rather than TARGET WIG's asset list — confirmed with the
  // user this must hold even when TARGET WIG defines no per-ULTG rows at
  // all for a given LM (e.g. LM 4.3, whose target only ever exists at the
  // UPT level), so the breakdown still reflects Monitoring's real per-ULTG
  // realisasi instead of going empty. TARGET WIG's own per-ULTG target
  // (when it exists) is shown alongside purely as context — WIG 4's is
  // already known to be unreliable, so it never gates `done` on its own.
  //
  // For a per-ruas/bay LM (WIG 1 & 3), Monitoring has no per-bay detail, so
  // the breakdown stays sourced from TARGET WIG's own asset list with
  // realisasi matched against the raw ULTG/K3 logs, unchanged from before.
  const assets: FourDxAssetStatus[] = isUltgLevelLm
    ? perUltgMonitoringRows.map((m) => {
        const matchingTargetAsset = lm.assets.find((a) => normalize(a.asset) === normalize(m.ultg));
        const targetThisWeek = matchingTargetAsset?.weeklyTargets[period.lookupLabel] ?? 0;
        const realizedCount = m.weeklyRealisasi[period.lookupLabel] ?? 0;
        return {
          asset: m.ultg,
          targetThisWeek,
          realizedCount,
          done: targetThisWeek > 0 ? realizedCount >= targetThisWeek : realizedCount > 0,
          realizedAt: null, // Monitoring only carries a weekly count, not a specific date
        };
      })
    : scheduled.map((asset) => {
        const matches = matchingThisLm.filter((r) => normalize(r.asset) === normalize(asset.asset));
        const targetThisWeek = asset.weeklyTargets[period.lookupLabel] ?? 0;
        return {
          asset: asset.asset,
          targetThisWeek,
          realizedCount: matches.length,
          done: matches.length >= targetThisWeek,
          realizedAt: matches[0]?.tanggal ?? null,
        };
      });

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
  return wigsRaw.map((wig) => {
    // Monitoring's own "Wildly Important Goals (WIG)" column holds the same
    // goal statement as this WIG's title (minus the "WIG N. " prefix) —
    // confirmed directly against the live sheet. Used only as a fallback
    // join for WIG 4, whose per-LM description text doesn't match TARGET
    // WIG 4 at all: within that goal-statement's rows, the distinct
    // descriptions appear in the same order as this WIG's own LMs
    // (confirmed: WIG 4's 4 descriptions line up 1:1 with LM 4.1-4.4).
    const wigGoalStatement = normalize(wig.title.replace(/^WIG\s*\d+\.\s*/i, ""));
    const orderedMonitoringDescriptions: string[] = [];
    for (const m of monitoring) {
      if (normalize(m.wigTitle) !== wigGoalStatement) continue;
      if (!orderedMonitoringDescriptions.some((d) => normalize(d) === normalize(m.description))) {
        orderedMonitoringDescriptions.push(m.description);
      }
    }

    return {
      number: wig.number,
      title: wig.title,
      // Confirmed with the user: WIG 2 & 4 are ULTG-level (breakdown sourced
      // from Monitoring's own per-ULTG rows), WIG 1 & 3 are per-ruas/bay
      // (breakdown sourced from TARGET WIG's own asset list) — see
      // buildFourDxLm's isUltgLevelLm param.
      lms: wig.lms.map((lm, index) =>
        buildFourDxLm(
          lm,
          period,
          realizations,
          monitoring,
          wig.number === 4,
          wig.number === 2 || wig.number === 4,
          orderedMonitoringDescriptions[index] ?? null,
        ),
      ),
    };
  });
}

/** WhatsApp-style recap text for one chosen period — mirrors the manual
 *  weekly update format (confirmed against a real example the user pasted):
 *  per-asset LMs get a plain "- <asset> ✅" line, ULTG-level LMs (WIG 2 & 4)
 *  get "- <ULTG> (R:n/T:n) ✅" since their target is a quantity, not a single
 *  yes/no per asset. The header date range is looked up from DATASET (see
 *  resolvePeriodRange), matching the source sheet exactly.
 *
 *  Order per LM, confirmed with the user: UPT-level target/realisasi total
 *  first ("Total UPT: R:x/T:y"), THEN the per-ULTG/ruas breakdown — the UPT
 *  total already accounts for manual top-ups between ULTGs (see
 *  buildFourDxLm), so it's the number that decides tercapai/belum; the
 *  breakdown below it is detail, not a second pass/fail gate. */
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
    lines.push("═".repeat(32));
    lines.push(`*WIG ${wig.number}. ${wig.title.replace(/^WIG\s*\d+\.\s*/i, "")}*`);
    lines.push(`✅ ${tercapaiCount} tercapai · ⏳ ${belumCount} belum`);
    for (const lm of wig.lms) {
      const lmMark = lm.status === "tercapai" ? "✅" : "⏳";
      lines.push("");
      lines.push(`*LM ${lm.code} ${lm.description}*`);
      lines.push(`Total UPT: R:${lm.realisasiMingguan}/T:${lm.targetMingguan} ${lmMark}`);
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
