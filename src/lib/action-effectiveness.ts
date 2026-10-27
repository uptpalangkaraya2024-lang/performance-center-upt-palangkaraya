// Post-action effectiveness verification ("Verifikasi Efektivitas Tindak
// Lanjut") — closes the loop this dashboard otherwise leaves open: once a
// RENUS or CE item is marked done, nothing previously checked whether the
// underlying AHI condition at that GI actually improved afterward, or
// whether gangguan frequency there went down. This is a plain before/after
// comparison around the completion date — never a causal claim (other
// factors can move AHI/gangguan too), but a concrete, traceable answer to
// "did this actually help," which this app didn't have anywhere before.
//
// FASE 2 additions: (1) multiple raw RENUS/CE rows for the same physical
// intervention (same GI, same work category, same completion date — e.g.
// CE's own "Pengujian Ulang" visit logging one row per tested parameter)
// are merged into one intervention before scoring, so the summary counts
// interventions, not sheet rows; (2) which metric gets evaluated now
// depends on the work's own category (Anti Binatang -> animal-caused
// gangguan only, ROW/Pohon -> vegetation-caused gangguan only, equipment
// work -> AHI, facility/civil work -> not evaluated at all — see
// src/config/effectiveness-indicator-map.ts); (3) each gangguan verdict
// now carries a baseline: the same before/after change averaged across
// every OTHER GI with no intervention of its own in that same window, so
// "gangguan went down" can be read against whether gangguan went down
// everywhere that period anyway (a system-wide trend, e.g. a drier month)
// rather than only at this one GI.
import { canonicalGiKey, giTowerKey } from "@/lib/gi-name";
import { extractRenusTowerNumbers } from "@/lib/ruas-correlation";
import {
  classifyCeIndikator,
  classifyRenusWorkDetail,
  EFFECTIVENESS_CATEGORY_CAUSE,
  EFFECTIVENESS_CATEGORY_LABEL,
  type EffectivenessCategory,
} from "@/config/effectiveness-indicator-map";
import type { BayLineReport, CeItem, DisturbanceBayEventRecord, GangguanHistoryEntry, RenusRow } from "@/types";

// The cause-filtered gangguan categories' RAW sheet value (gangguan-
// history.ts reads PENYEBAB unmapped) — EFFECTIVENESS_CATEGORY_CAUSE
// holds the user-facing MAPPED label ("Hewan"/"Tegakan / Pohon", for
// disturbanceEvents.cause), this is its tower-level counterpart for
// gangguanByTowerGi.penyebab, used only when a check can be scoped to a
// specific tower (see extractInterventionTowers below).
const RAW_CAUSE_FOR_CATEGORY: Partial<Record<EffectivenessCategory, string>> = {
  binatang: "HEWAN",
  row: "TEGAKAN",
};

/** CE's own "span" column names a single tower ("#293") — simpler than
 *  RENUS's spanTower (which can name a two-tower span, "#227-#228").
 *  Reuses the same "#digits" extraction either way. */
function extractCeTowerNumbers(span: string | null): string[] {
  if (!span) return [];
  return [...span.matchAll(/#?(\d+)/g)].map((m) => m[1]);
}

export type EffectivenessVerdict = "membaik" | "tetap" | "memburuk" | "belum_cukup_data" | "tidak_relevan";

export interface GangguanBaseline {
  /** Average (after - before) gangguan-count change across every OTHER GI
   *  with no intervention of its own in this same window, same cause
   *  filter as this check's own gangguan count — null when there weren't
   *  enough qualifying GIs to compare against. */
  avgOtherGiDelta: number | null;
  /** How many GIs that average is built from. */
  controlGiCount: number;
  /** This GI's own delta (gangguanAfter - gangguanBefore) vs avgOtherGiDelta
   *  — "lebih_baik" means this GI improved MORE than its peers did in the
   *  same period (stronger evidence of a localized effect), "sama" means
   *  it tracked the general trend, "lebih_buruk" means peers improved more
   *  than this GI did. Supplementary context only — never changes the
   *  verdict above, which stays based on this GI's own raw before/after
   *  numbers for traceability. */
  relativeToBaseline: "lebih_baik" | "sama" | "lebih_buruk" | null;
}

export interface ActionEffectivenessCheck {
  source: ("RENUS" | "CE")[];
  gi: string;
  category: EffectivenessCategory;
  categoryLabel: string;
  description: string;
  /** How many raw RENUS/CE rows merged into this one intervention (same
   *  GI, same category, same realisasi date). 1 when nothing merged. */
  mergedCount: number;
  realisasiDate: string;
  daysSinceAction: number;

  /** PLN's own 1-5 scale, 1=BEST..5=CRITICAL — lower is better. Only
   *  scored for category "ahi" — every other category's ahiVerdict is
   *  "tidak_relevan" and ahiBeforeAvg/ahiAfterAvg stay null. */
  ahiBeforeAvg: number | null;
  ahiAfterAvg: number | null;
  ahiVerdict: EffectivenessVerdict;

  /** Cause-filtered per EFFECTIVENESS_CATEGORY_CAUSE (all-cause for "ahi",
   *  not scored at all for "tidak_relevan"). */
  gangguanBefore: number;
  gangguanAfter: number;
  gangguanVerdict: EffectivenessVerdict;
  gangguanBaseline: GangguanBaseline | null;
  /** "tower" when this check's own source named a specific tower/span
   *  (RENUS's SPAN/TOWER or CE's span column) and the gangguan count
   *  above is scoped to exactly that tower; "gi" when it falls back to
   *  every gangguan at the whole GI — the honest case for Trafo work
   *  (no tower concept at all) and for any row that simply didn't name
   *  one. Only meaningful for "binatang"/"row" categories; always "gi"
   *  for "ahi" (GI-wide AHI condition is the actual point there) and
   *  irrelevant for "tidak_relevan". */
  gangguanScopedTo: "tower" | "gi";
}

// Only actions completed within this window are worth re-checking — a
// 3-year-old completion has nothing left to say about "did it help," it's
// just history.
const LOOKBACK_DAYS = 365;
// Before/after gangguan comparison window — matches root-cause-links.ts's
// own 90-day lookback convention for "recent enough to be relevant."
const GANGGUAN_WINDOW_DAYS = 90;
// A relative change smaller than this (as a share of the larger of the two
// averages being compared) reads as "tracked the same trend," not a real
// difference — avoids calling a 2.1 vs 2.0 average a meaningful gap.
const BASELINE_MEANINGFUL_GAP = 0.15;
// Below this many qualifying control GIs, "the average of N other GIs"
// is really just "what 1-2 other specific GIs happened to do" — too thin
// to present as a trend comparison, so the baseline stays null (shown as
// no comparison available) rather than overstating confidence.
const MIN_CONTROL_GIS = 3;

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
function collectAhiPoints(bayLineReports: BayLineReport[]): { tanggal: string; skorAhi: number }[] {
  const points: { tanggal: string; skorAhi: number }[] = [];
  for (const report of bayLineReports) {
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
  centerISO: string,
  direction: "before" | "after",
  cause: string | null,
): number {
  // `events` is expected to already be scoped to one GI (see eventsByGi in
  // buildActionEffectivenessChecks) — this used to re-filter the FULL
  // disturbance-events array by GI on every single call (238 interventions
  // x up to ~20 baseline GIs x 2 directions each), measured live as the
  // dominant cost behind Verifikasi Efektivitas's own ~1.2-1.4s server
  // compute time. Pre-grouping by GI once turns each of these calls into a
  // scan over just that GI's own (much smaller) event list.
  return events.filter((e) => {
    if (cause !== null && e.cause !== cause) return false;
    if (direction === "before") {
      const d = daysBetween(e.dateISO, centerISO);
      return d > 0 && d <= GANGGUAN_WINDOW_DAYS;
    }
    const d = daysBetween(centerISO, e.dateISO);
    return d > 0 && d <= GANGGUAN_WINDOW_DAYS;
  }).length;
}

/** Tower-precise counterpart of countGangguanInWindow, for the Anti
 *  Binatang/ROW checks that know exactly which tower(s) the work was
 *  done at (RENUS's own SPAN/TOWER column, or CE's own span column — see
 *  extractInterventionTowers) — scoped to those specific towers instead
 *  of every gangguan at the whole GI, per the user's own point: Anti
 *  Binatang work on one tower should be judged by whether gangguan at
 *  THAT tower went down, not by the GI's gangguan count overall. Uses
 *  `.tgl`/`.penyebab` (gangguan-history.ts's own raw-PENYEBAB shape),
 *  not `.dateISO`/`.cause` — a different data source than the GI-level
 *  disturbanceEvents (see RAW_CAUSE_FOR_CATEGORY's own comment). */
function countGangguanInWindowByTower(
  entries: GangguanHistoryEntry[],
  centerISO: string,
  direction: "before" | "after",
  rawCause: string,
): number {
  return entries.filter((e) => {
    if (e.penyebab !== rawCause) return false;
    // e.tgl carries a trailing " 00:00:00" (gangguan-history.ts reads TGL
    // unstripped) — daysBetween appends its own "T00:00:00Z", so the raw
    // value has to be truncated to "yyyy-MM-dd" first or the concatenated
    // string fails to parse.
    const tglDate = e.tgl.slice(0, 10);
    if (direction === "before") {
      const d = daysBetween(tglDate, centerISO);
      return d > 0 && d <= GANGGUAN_WINDOW_DAYS;
    }
    const d = daysBetween(centerISO, tglDate);
    return d > 0 && d <= GANGGUAN_WINDOW_DAYS;
  }).length;
}

// --- Raw-row collection + merge -------------------------------------------

interface RawIntervention {
  source: "RENUS" | "CE";
  gi: string;
  category: EffectivenessCategory;
  description: string;
  realisasiDate: string;
  /** Specific tower(s) this row's own source names — RENUS's SPAN/TOWER
   *  column or CE's span column — empty when the row doesn't name one
   *  (most CE rows, and all Trafo-category RENUS work, which has no
   *  tower concept at all). */
  towerNumbers: string[];
}

function collectRawInterventions(renusRows: RenusRow[], ceItems: CeItem[], todayISO: string): RawIntervention[] {
  const raw: RawIntervention[] = [];

  for (const r of renusRows) {
    if (!r.realisasiDate || !r.gi) continue;
    const daysSinceAction = daysBetween(r.realisasiDate, todayISO);
    if (daysSinceAction < 0 || daysSinceAction > LOOKBACK_DAYS) continue;
    raw.push({
      source: "RENUS",
      gi: r.gi,
      category: classifyRenusWorkDetail(r.workDetail),
      description: r.workDetail,
      realisasiDate: r.realisasiDate,
      towerNumbers: extractRenusTowerNumbers(r.spanTower),
    });
  }

  for (const c of ceItems) {
    if (!c.done || !c.tanggalRealisasi || !c.gardu) continue;
    const daysSinceAction = daysBetween(c.tanggalRealisasi, todayISO);
    if (daysSinceAction < 0 || daysSinceAction > LOOKBACK_DAYS) continue;
    raw.push({
      source: "CE",
      gi: c.gardu,
      category: classifyCeIndikator(c.indikator),
      description: c.namaProgram || c.anomaliPemicu || `Temuan #${c.id}`,
      realisasiDate: c.tanggalRealisasi,
      towerNumbers: extractCeTowerNumbers(c.span),
    });
  }

  return raw;
}

interface MergedIntervention {
  source: ("RENUS" | "CE")[];
  gi: string; // canonical key, used for scoring — display GI comes from the first raw row
  giDisplay: string;
  category: EffectivenessCategory;
  description: string;
  mergedCount: number;
  realisasiDate: string;
  /** Union of every merged raw row's own tower numbers, deduped. */
  towerNumbers: string[];
}

/** One intervention per (GI, category, realisasi date) — several raw rows
 *  sharing all three merge into one, per the user's own instruction ("satu
 *  intervensi = GI + jenis pekerjaan + tanggal realisasi"). Most common
 *  case: CE logging one row per tested parameter for the same re-testing
 *  visit (confirmed live — "Pengujian Ulang DGA C2H6", "Pengujian Ulang
 *  Moisture", ... all same GI/date/category). */
function mergeInterventions(raw: RawIntervention[]): MergedIntervention[] {
  const byKey = new Map<string, MergedIntervention>();
  for (const r of raw) {
    const key = `${canonicalGiKey(r.gi)}::${r.category}::${r.realisasiDate}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        source: [r.source],
        gi: canonicalGiKey(r.gi),
        giDisplay: r.gi,
        category: r.category,
        description: r.description,
        mergedCount: 1,
        realisasiDate: r.realisasiDate,
        towerNumbers: [...r.towerNumbers],
      });
      continue;
    }
    existing.mergedCount += 1;
    if (!existing.source.includes(r.source)) existing.source.push(r.source);
    for (const t of r.towerNumbers) if (!existing.towerNumbers.includes(t)) existing.towerNumbers.push(t);
    // Keep the merged description short and non-repetitive — list up to 3
    // distinct descriptions, then "+N lainnya", same overflow convention
    // used elsewhere in this app (e.g. root-cause-links' own card).
    const parts = existing.description.split(" · ");
    if (!parts.includes(r.description) && parts.filter((p) => !p.startsWith("+")).length < 3) {
      existing.description = [...parts.filter((p) => !p.startsWith("+")), r.description].join(" · ");
    } else if (!parts.includes(r.description)) {
      const extra = existing.mergedCount - 3;
      const base = parts.filter((p) => !p.startsWith("+"));
      existing.description = extra > 0 ? `${base.join(" · ")} · +${extra} lainnya` : base.join(" · ");
    }
  }
  return [...byKey.values()];
}

// --- Baseline comparison ---------------------------------------------------

function classifyRelative(giDelta: number, baselineDelta: number): GangguanBaseline["relativeToBaseline"] {
  const scale = Math.max(Math.abs(giDelta), Math.abs(baselineDelta), 1);
  const gap = baselineDelta - giDelta; // positive => this GI did better than peers (smaller/more-negative delta)
  if (Math.abs(gap) / scale < BASELINE_MEANINGFUL_GAP) return "sama";
  return gap > 0 ? "lebih_baik" : "lebih_buruk";
}

/** Average gangguan-count change (after - before, same window/cause as the
 *  check under test) across every OTHER GI that had NO intervention of its
 *  own in that window — the "what would this GI's change have looked like
 *  anyway" comparison the user asked for. A GI qualifies as a control only
 *  if it has no merged intervention of its own whose realisasi date falls
 *  within the same +/-GANGGUAN_WINDOW_DAYS window (otherwise its own
 *  change is confounded by its own action, not a clean baseline).
 *
 *  Takes pre-grouped-by-GI maps (built once in buildActionEffectivenessChecks)
 *  rather than the flat lists + per-call giMatches() filtering this used to
 *  do — see countGangguanInWindow's own comment for the measured cost that
 *  fixed. */
function buildGangguanBaseline(
  testGi: string,
  realisasiDate: string,
  cause: string | null,
  giDelta: number,
  allGiKeys: string[],
  interventionsByGi: Map<string, MergedIntervention[]>,
  eventsByGi: Map<string, DisturbanceBayEventRecord[]>,
): GangguanBaseline {
  const deltas: number[] = [];
  for (const giKey of allGiKeys) {
    if (giKey === testGi) continue;
    const ownInterventions = interventionsByGi.get(giKey);
    const hasOwnInterventionInWindow = ownInterventions?.some(
      (iv) => Math.abs(daysBetween(iv.realisasiDate, realisasiDate)) <= GANGGUAN_WINDOW_DAYS,
    );
    if (hasOwnInterventionInWindow) continue;
    const giEvents = eventsByGi.get(giKey) ?? [];
    const before = countGangguanInWindow(giEvents, realisasiDate, "before", cause);
    const after = countGangguanInWindow(giEvents, realisasiDate, "after", cause);
    if (before === 0 && after === 0) continue; // no signal either way at this GI, not useful as a control
    deltas.push(after - before);
  }
  if (deltas.length < MIN_CONTROL_GIS) {
    return { avgOtherGiDelta: null, controlGiCount: deltas.length, relativeToBaseline: null };
  }
  const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  return {
    avgOtherGiDelta: Math.round(avg * 100) / 100,
    controlGiCount: deltas.length,
    relativeToBaseline: classifyRelative(giDelta, avg),
  };
}

// --- Per-intervention scoring -----------------------------------------------

function buildCheck(params: {
  intervention: MergedIntervention;
  daysSinceAction: number;
  bayLineReportsByGi: Map<string, BayLineReport[]>;
  allGiKeys: string[];
  interventionsByGi: Map<string, MergedIntervention[]>;
  eventsByGi: Map<string, DisturbanceBayEventRecord[]>;
  gangguanByTowerGi: Record<string, GangguanHistoryEntry[]>;
}): ActionEffectivenessCheck {
  const { intervention, daysSinceAction, bayLineReportsByGi, allGiKeys, interventionsByGi, eventsByGi, gangguanByTowerGi } = params;
  const { gi, giDisplay, category, description, mergedCount, realisasiDate, source, towerNumbers } = intervention;

  if (category === "tidak_relevan") {
    return {
      source,
      gi: giDisplay,
      category,
      categoryLabel: EFFECTIVENESS_CATEGORY_LABEL[category],
      description,
      mergedCount,
      realisasiDate,
      daysSinceAction,
      ahiBeforeAvg: null,
      ahiAfterAvg: null,
      ahiVerdict: "tidak_relevan",
      gangguanBefore: 0,
      gangguanAfter: 0,
      gangguanVerdict: "tidak_relevan",
      gangguanBaseline: null,
      gangguanScopedTo: "gi",
    };
  }

  let ahiBeforeAvg: number | null = null;
  let ahiAfterAvg: number | null = null;
  let ahiVerdict: EffectivenessVerdict = "tidak_relevan";
  if (category === "ahi") {
    const ahiPoints = collectAhiPoints(bayLineReportsByGi.get(gi) ?? []);
    ahiBeforeAvg = averageAroundDate(ahiPoints, realisasiDate, "before");
    ahiAfterAvg = averageAroundDate(ahiPoints, realisasiDate, "after");
    ahiVerdict =
      ahiBeforeAvg === null || ahiAfterAvg === null
        ? "belum_cukup_data"
        : ahiAfterAvg < ahiBeforeAvg
          ? "membaik"
          : ahiAfterAvg > ahiBeforeAvg
            ? "memburuk"
            : "tetap";
  }

  const cause = EFFECTIVENESS_CATEGORY_CAUSE[category];
  const rawCause = RAW_CAUSE_FOR_CATEGORY[category];

  // Tower-precise when this intervention's own source named one (and the
  // category has a RAW cause to filter by — "ahi" doesn't, it's scored
  // GI-wide on purpose) — otherwise the honest fallback is GI-wide, which
  // is also simply CORRECT for Trafo work (no tower concept exists for a
  // trafo at all, so GI-level is the right scope, not a compromise).
  let gangguanBefore: number;
  let gangguanAfter: number;
  let gangguanScopedTo: "tower" | "gi";
  if (rawCause && towerNumbers.length > 0) {
    const towerEntries = towerNumbers.flatMap((t) => gangguanByTowerGi[giTowerKey(giDisplay, t)] ?? []);
    gangguanBefore = countGangguanInWindowByTower(towerEntries, realisasiDate, "before", rawCause);
    gangguanAfter = countGangguanInWindowByTower(towerEntries, realisasiDate, "after", rawCause);
    gangguanScopedTo = "tower";
  } else {
    const giEvents = eventsByGi.get(gi) ?? [];
    gangguanBefore = countGangguanInWindow(giEvents, realisasiDate, "before", cause);
    gangguanAfter = countGangguanInWindow(giEvents, realisasiDate, "after", cause);
    gangguanScopedTo = "gi";
  }

  const gangguanVerdict: EffectivenessVerdict =
    daysSinceAction < GANGGUAN_WINDOW_DAYS
      ? "belum_cukup_data"
      : gangguanAfter < gangguanBefore
        ? "membaik"
        : gangguanAfter > gangguanBefore
          ? "memburuk"
          : "tetap";
  const gangguanBaseline =
    daysSinceAction < GANGGUAN_WINDOW_DAYS
      ? null
      : buildGangguanBaseline(gi, realisasiDate, cause, gangguanAfter - gangguanBefore, allGiKeys, interventionsByGi, eventsByGi);

  return {
    source,
    gi: giDisplay,
    category,
    categoryLabel: EFFECTIVENESS_CATEGORY_LABEL[category],
    description,
    mergedCount,
    realisasiDate,
    daysSinceAction,
    ahiBeforeAvg,
    ahiAfterAvg,
    ahiVerdict,
    gangguanBefore,
    gangguanAfter,
    gangguanVerdict,
    gangguanBaseline,
    gangguanScopedTo,
  };
}

/** One check per merged intervention (GI + jenis pekerjaan + tanggal
 *  realisasi) completed within the last year — every intervention gets an
 *  entry, including ones where verification isn't possible yet
 *  ("belum_cukup_data") or isn't applicable at all ("tidak_relevan"), so
 *  this is a complete accounting of recent work, never a silently filtered
 *  subset. */
export function buildActionEffectivenessChecks(params: {
  renusRows: RenusRow[];
  ceItems: CeItem[];
  bayLineReports: BayLineReport[];
  disturbanceEvents: DisturbanceBayEventRecord[];
  /** Tower-precise gangguan history (same source Infografis Ruas/FASE 1's
   *  Gangguan Hotspots use) — enables tower-scoped Anti Binatang/ROW
   *  checks, see gangguanScopedTo. */
  gangguanByTowerGi: Record<string, GangguanHistoryEntry[]>;
  todayISO: string;
}): ActionEffectivenessCheck[] {
  const { renusRows, ceItems, bayLineReports, disturbanceEvents, gangguanByTowerGi, todayISO } = params;

  const raw = collectRawInterventions(renusRows, ceItems, todayISO);
  const merged = mergeInterventions(raw);

  // Grouped once up front, keyed by the same canonical GI form every
  // MergedIntervention.gi already uses — every per-check/per-baseline-GI
  // lookup below becomes a Map.get() into a small per-GI list instead of a
  // full-array scan with a canonicalGiKey() call on every element. See
  // countGangguanInWindow's own comment for the measured cost this fixed.
  const eventsByGi = new Map<string, DisturbanceBayEventRecord[]>();
  for (const e of disturbanceEvents) {
    if (e.gi === null) continue;
    const key = canonicalGiKey(e.gi);
    const list = eventsByGi.get(key);
    if (list) list.push(e);
    else eventsByGi.set(key, [e]);
  }

  const interventionsByGi = new Map<string, MergedIntervention[]>();
  for (const iv of merged) {
    const list = interventionsByGi.get(iv.gi);
    if (list) list.push(iv);
    else interventionsByGi.set(iv.gi, [iv]);
  }

  const bayLineReportsByGi = new Map<string, BayLineReport[]>();
  for (const report of bayLineReports) {
    if (!report.gi) continue;
    const key = canonicalGiKey(report.gi);
    const list = bayLineReportsByGi.get(key);
    if (list) list.push(report);
    else bayLineReportsByGi.set(key, [report]);
  }

  // Same candidate pool as before: GIs that appear in disturbance events
  // (a GI with only an intervention and no disturbance history at all
  // can't be scored as a baseline anyway — see the before===0 && after===0
  // skip in buildGangguanBaseline).
  const allGiKeys = [...eventsByGi.keys()];

  const checks = merged.map((intervention) =>
    buildCheck({
      intervention,
      daysSinceAction: daysBetween(intervention.realisasiDate, todayISO),
      bayLineReportsByGi,
      allGiKeys,
      interventionsByGi,
      eventsByGi,
      gangguanByTowerGi,
    }),
  );

  return checks.sort((a, b) => b.realisasiDate.localeCompare(a.realisasiDate));
}
