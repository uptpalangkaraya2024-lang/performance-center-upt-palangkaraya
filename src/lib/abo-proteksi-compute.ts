// Pure, period-specific ABO Proteksi computation — deliberately NOT
// "server-only". src/services/abo-proteksi.ts does the one-time spreadsheet
// parse (server-only, produces the *Raw shapes), and this file turns a raw
// snapshot + a chosen week label into the same per-program numbers the
// source sheet itself shows for "today" — generalized to any selected week,
// so the client's own month/week filter never needs a server round-trip
// (same "load once, derive many things" shape as src/lib/four-dx-compute.ts).
import type {
  AboProgramBlockRaw,
  AboProgramComputed,
  AboProgramRaw,
  AboRuasComputed,
  AboSnapshot,
  AboStatFields,
  AboUltgComputed,
  AboWeeklyValues,
} from "@/types";

// ABO's own week-label casing ("T Jan-M1", "R Sep-M2") — title case, unlike
// 4DX's uppercase "JAN-M1". Kept local/self-contained rather than shared
// with four-dx-compute.ts's MONTH_ABBR_ID, since the casing differs and
// there's no DATASET-style real-date lookup here (confirmed with the user:
// ABO's own week labels are the ground truth, matched by label only).
export const ABO_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const ABO_MONTH_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const ABO_WEEK_LABELS: string[] = ABO_MONTH_ABBR.flatMap((m) => [1, 2, 3, 4].map((w) => `${m}-M${w}`));

export function weekLabelIndex(label: string): number {
  return ABO_WEEK_LABELS.indexOf(label);
}

export function aboMonthAbbrIndex(abbr: string): number {
  return ABO_MONTH_ABBR.indexOf(abbr);
}

function sumToDate(weekly: AboWeeklyValues, uptoIndex: number): number {
  let sum = 0;
  for (let i = 0; i <= uptoIndex; i++) {
    sum += weekly[ABO_WEEK_LABELS[i]] ?? 0;
  }
  return sum;
}

function computeStats(program: AboProgramRaw, selectedIndex: number): AboStatFields {
  const selectedLabel = ABO_WEEK_LABELS[selectedIndex];
  const targetThisWeek = program.targetWeekly[selectedLabel] ?? 0;
  const realisasiThisWeek = program.realisasiWeekly[selectedLabel] ?? 0;
  const targetToDate = sumToDate(program.targetWeekly, selectedIndex);
  const realisasiToDate = sumToDate(program.realisasiWeekly, selectedIndex);
  // Deliberately uncapped (and defaulting to 1, not 0/null, when master is
  // 0) — matches the sheet's own TARGET/% REALISASI formulas exactly,
  // confirmed live against several programs showing >100%.
  const percentTarget = program.master > 0 ? targetToDate / program.master : 1;
  const percentRealisasi = program.master > 0 ? realisasiToDate / program.master : 1;
  return {
    targetThisWeek,
    realisasiThisWeek,
    targetToDate,
    realisasiToDate,
    percentTarget,
    percentRealisasi,
    // Against Target Rencana (the program's own literal full-year total),
    // not targetToDate — confirmed live, see AboStatFields.gap.
    gap: program.targetRencana - realisasiToDate,
    // Mirrors the sheet's own 👍/👎 Capaian column — realisasi-to-date
    // meeting or beating target-to-date.
    status: realisasiToDate >= targetToDate ? "tercapai" : "belum",
  };
}

export function buildAboProgram(raw: AboProgramBlockRaw, selectedWeekLabel: string): AboProgramComputed {
  const selectedIndex = weekLabelIndex(selectedWeekLabel);
  const ultgBreakdown: AboUltgComputed[] = raw.ultgBreakdown.map((u) => ({
    ultg: u.ultg,
    ...computeStats(u, selectedIndex),
  }));

  // Items whose target week is exactly the selected week (both done and
  // not-yet-done), PLUS any earlier-scheduled item that's still not done —
  // an overdue item never silently drops off the list just because its
  // week has passed; it keeps showing (against its own original target
  // week) until it's actually realized, so it stays monitorable. Per user
  // feedback, applies to both ABO Proteksi and Hargi (shared here).
  const ruasItems: AboRuasComputed[] = raw.ruasItems
    .filter((item) => {
      if (item.targetWeekLabel === selectedWeekLabel) return true;
      const itemIndex = item.targetWeekLabel ? weekLabelIndex(item.targetWeekLabel) : -1;
      return itemIndex !== -1 && itemIndex < selectedIndex && !item.done;
    })
    .map((item) => ({
      ultg: item.ultg,
      asset: item.asset,
      targetWeekLabel: item.targetWeekLabel,
      realisasiWeekLabel: item.realisasiWeekLabel,
      done: item.done,
      kondisi: item.kondisi,
    }));

  return {
    code: raw.code,
    description: raw.description,
    satuan: raw.upt.satuan,
    master: raw.upt.master,
    ultgBreakdown,
    ruasItems,
    ...computeStats(raw.upt, selectedIndex),
  };
}

export function buildAboSnapshotComputed(snapshot: AboSnapshot, selectedWeekLabel: string): AboProgramComputed[] {
  return snapshot.programs.map((p) => buildAboProgram(p, selectedWeekLabel));
}

/** Today's week label via a plain ceil(day/7) estimate (capped at M4) — no
 *  DATASET-style real-date lookup needed here, since ABO's own week labels
 *  are matched by label alone, not real calendar boundaries (confirmed with
 *  the user, unlike 4DX). */
export function defaultAboWeekLabel(): string {
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [, monthStr, dayStr] = todayISO.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);
  const weekOfMonth = Math.min(Math.ceil(day / 7), 4);
  return `${ABO_MONTH_ABBR[month - 1]}-M${weekOfMonth}`;
}
