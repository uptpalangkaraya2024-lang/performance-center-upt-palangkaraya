// Post-action effectiveness verification ("Verifikasi Efektivitas Tindak
// Lanjut") — closes the loop this dashboard otherwise leaves open: once a
// RENUS or CE item is marked done, nothing previously checked whether the
// underlying AHI condition at that GI actually improved afterward, or
// whether gangguan frequency there went down. This is a plain before/after
// comparison around the completion date — never a causal claim (other
// factors can move AHI/gangguan too), but a concrete, traceable answer to
// "did this actually help," which this app didn't have anywhere before.
import { canonicalGiKey } from "@/lib/gi-name";
import type { BayLineReport, CeItem, DisturbanceBayEventRecord, RenusRow } from "@/types";

export type EffectivenessVerdict = "membaik" | "tetap" | "memburuk" | "belum_cukup_data";

export interface ActionEffectivenessCheck {
  source: "RENUS" | "CE";
  gi: string;
  description: string;
  realisasiDate: string;
  daysSinceAction: number;

  /** PLN's own 1-5 scale, 1=BEST..5=CRITICAL — lower is better. */
  ahiBeforeAvg: number | null;
  ahiAfterAvg: number | null;
  ahiVerdict: EffectivenessVerdict;

  gangguanBefore: number;
  gangguanAfter: number;
  gangguanVerdict: EffectivenessVerdict;
}

// Only actions completed within this window are worth re-checking — a
// 3-year-old completion has nothing left to say about "did it help," it's
// just history.
const LOOKBACK_DAYS = 365;
// Before/after gangguan comparison window — matches root-cause-links.ts's
// own 90-day lookback convention for "recent enough to be relevant."
const GANGGUAN_WINDOW_DAYS = 90;

function giMatches(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return canonicalGiKey(a) === canonicalGiKey(b);
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

/** Every dated, scored AHI test across every unit at the given GI — pooled
 *  from all bay-line reports touching that GI, since the verification is
 *  "did this GI's overall condition move," not one specific equipment's
 *  own history (RENUS/CE items rarely name a single unit precisely enough
 *  to match bay-for-bay, same limitation already documented in
 *  ruas-infographic.ts and root-cause-links.ts). */
function collectAhiPoints(gi: string, bayLineReports: BayLineReport[]): { tanggal: string; skorAhi: number }[] {
  const points: { tanggal: string; skorAhi: number }[] = [];
  for (const report of bayLineReports) {
    if (!giMatches(report.gi, gi)) continue;
    for (const unit of report.units) {
      for (const h of unit.history) {
        if (h.skorAhi !== null) points.push({ tanggal: h.tanggal, skorAhi: h.skorAhi });
      }
    }
  }
  return points;
}

/** Average of every reading sharing the single most-recent "before" date
 *  (or earliest "after" date) — several units are often tested the same
 *  day, so this is a same-day batch average, not just one arbitrary unit's
 *  reading. */
function averageAroundDate(
  points: { tanggal: string; skorAhi: number }[],
  dateISO: string,
  direction: "before" | "after",
): number | null {
  const filtered = direction === "before" ? points.filter((p) => p.tanggal < dateISO) : points.filter((p) => p.tanggal > dateISO);
  if (filtered.length === 0) return null;
  const targetDate =
    direction === "before"
      ? filtered.reduce((max, p) => (p.tanggal > max ? p.tanggal : max), filtered[0].tanggal)
      : filtered.reduce((min, p) => (p.tanggal < min ? p.tanggal : min), filtered[0].tanggal);
  const sameDate = filtered.filter((p) => p.tanggal === targetDate);
  return sameDate.reduce((s, p) => s + p.skorAhi, 0) / sameDate.length;
}

function countGangguanInWindow(
  events: DisturbanceBayEventRecord[],
  gi: string,
  centerISO: string,
  direction: "before" | "after",
): number {
  return events.filter((e) => {
    if (!giMatches(e.gi, gi)) return false;
    if (direction === "before") {
      const d = daysBetween(e.dateISO, centerISO);
      return d > 0 && d <= GANGGUAN_WINDOW_DAYS;
    }
    const d = daysBetween(centerISO, e.dateISO);
    return d > 0 && d <= GANGGUAN_WINDOW_DAYS;
  }).length;
}

function buildCheck(params: {
  source: "RENUS" | "CE";
  gi: string;
  description: string;
  realisasiDate: string;
  daysSinceAction: number;
  bayLineReports: BayLineReport[];
  disturbanceEvents: DisturbanceBayEventRecord[];
}): ActionEffectivenessCheck {
  const { source, gi, description, realisasiDate, daysSinceAction, bayLineReports, disturbanceEvents } = params;

  const ahiPoints = collectAhiPoints(gi, bayLineReports);
  const ahiBeforeAvg = averageAroundDate(ahiPoints, realisasiDate, "before");
  const ahiAfterAvg = averageAroundDate(ahiPoints, realisasiDate, "after");
  const ahiVerdict: EffectivenessVerdict =
    ahiBeforeAvg === null || ahiAfterAvg === null
      ? "belum_cukup_data"
      : ahiAfterAvg < ahiBeforeAvg
        ? "membaik"
        : ahiAfterAvg > ahiBeforeAvg
          ? "memburuk"
          : "tetap";

  const gangguanBefore = countGangguanInWindow(disturbanceEvents, gi, realisasiDate, "before");
  const gangguanAfter = countGangguanInWindow(disturbanceEvents, gi, realisasiDate, "after");
  const gangguanVerdict: EffectivenessVerdict =
    daysSinceAction < GANGGUAN_WINDOW_DAYS
      ? "belum_cukup_data"
      : gangguanAfter < gangguanBefore
        ? "membaik"
        : gangguanAfter > gangguanBefore
          ? "memburuk"
          : "tetap";

  return {
    source,
    gi,
    description,
    realisasiDate,
    daysSinceAction,
    ahiBeforeAvg,
    ahiAfterAvg,
    ahiVerdict,
    gangguanBefore,
    gangguanAfter,
    gangguanVerdict,
  };
}

/** One check per completed RENUS/CE item within the last year — every
 *  completion gets an entry, including ones where verification isn't
 *  possible yet ("belum_cukup_data"), so this is a complete accounting of
 *  recent work, never a silently filtered subset. */
export function buildActionEffectivenessChecks(params: {
  renusRows: RenusRow[];
  ceItems: CeItem[];
  bayLineReports: BayLineReport[];
  disturbanceEvents: DisturbanceBayEventRecord[];
  todayISO: string;
}): ActionEffectivenessCheck[] {
  const { renusRows, ceItems, bayLineReports, disturbanceEvents, todayISO } = params;
  const checks: ActionEffectivenessCheck[] = [];

  for (const r of renusRows) {
    if (!r.realisasiDate || !r.gi) continue;
    const daysSinceAction = daysBetween(r.realisasiDate, todayISO);
    if (daysSinceAction < 0 || daysSinceAction > LOOKBACK_DAYS) continue;
    checks.push(
      buildCheck({
        source: "RENUS",
        gi: r.gi,
        description: r.workDetail,
        realisasiDate: r.realisasiDate,
        daysSinceAction,
        bayLineReports,
        disturbanceEvents,
      }),
    );
  }

  for (const c of ceItems) {
    if (!c.done || !c.tanggalRealisasi || !c.gardu) continue;
    const daysSinceAction = daysBetween(c.tanggalRealisasi, todayISO);
    if (daysSinceAction < 0 || daysSinceAction > LOOKBACK_DAYS) continue;
    checks.push(
      buildCheck({
        source: "CE",
        gi: c.gardu,
        description: c.namaProgram || c.anomaliPemicu || `Temuan #${c.id}`,
        realisasiDate: c.tanggalRealisasi,
        daysSinceAction,
        bayLineReports,
        disturbanceEvents,
      }),
    );
  }

  return checks.sort((a, b) => b.realisasiDate.localeCompare(a.realisasiDate));
}
