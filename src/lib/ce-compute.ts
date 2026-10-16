// Pure, period-specific CE computation — deliberately NOT "server-only".
// src/services/ce-proteksi.ts does the one-time spreadsheet parse
// (server-only, produces the flat CeItem[] list), and this file derives
// summaries/filters from it — same "load once, derive many things" shape
// as src/lib/abo-proteksi-compute.ts and src/lib/four-dx-compute.ts.
import type { CeItem } from "@/types";

// CE's own week-label casing ("T Aug-M4", "R Jun-M4") uses ENGLISH month
// abbreviations — confirmed live, different from ABO's Indonesian ones.
// Kept local/self-contained rather than shared, same precedent as ABO/4DX
// each keeping their own month list.
export const CE_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const CE_MONTH_FULL_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export const CE_WEEK_LABELS: string[] = CE_MONTH_ABBR.flatMap((m) => [1, 2, 3, 4].map((w) => `${m}-M${w}`));

export function ceWeekLabelIndex(label: string): number {
  return CE_WEEK_LABELS.indexOf(label);
}

export function ceMonthAbbrIndex(abbr: string): number {
  return CE_MONTH_ABBR.indexOf(abbr);
}

/** Today's week label via a plain ceil(day/7) estimate (capped at M4) — no
 *  real-date lookup needed, same reasoning as ABO: CE's own week labels are
 *  matched by label alone, not real calendar boundaries. */
export function defaultCeWeekLabel(): string {
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
  return `${CE_MONTH_ABBR[month - 1]}-M${weekOfMonth}`;
}

export interface CeBreakdownEntry {
  label: string;
  total: number;
  close: number;
  open: number;
}

function buildBreakdown(items: CeItem[], keyOf: (item: CeItem) => string): CeBreakdownEntry[] {
  const order: string[] = [];
  const map = new Map<string, CeItem[]>();
  for (const item of items) {
    const key = keyOf(item) || "Lainnya";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((label) => {
    const group = map.get(label)!;
    return { label, total: group.length, close: group.filter((i) => i.done).length, open: group.filter((i) => !i.done).length };
  });
}

export interface CeSummary {
  total: number;
  close: number;
  open: number;
  percentAchieve: number | null;
  byUltg: CeBreakdownEntry[];
  byJenisAsset: CeBreakdownEntry[];
  byKriteriaBefore: CeBreakdownEntry[];
}

export function buildCeSummary(items: CeItem[]): CeSummary {
  const close = items.filter((i) => i.done).length;
  const open = items.length - close;
  return {
    total: items.length,
    close,
    open,
    percentAchieve: items.length > 0 ? close / items.length : null,
    byUltg: buildBreakdown(items, (i) => i.ultg),
    byJenisAsset: buildBreakdown(items, (i) => i.jenisAsset),
    byKriteriaBefore: buildBreakdown(items, (i) => i.kriteriaBefore),
  };
}

export interface CeAttentionItem {
  item: CeItem;
  issue: "Critical & Belum Selesai" | "Alert" | "Terlambat";
}

/** Flat "needs attention" list — Critical items still open, items flagged
 *  with "!", and overdue items (target week already past, still open).
 *  Same idea as collectAboAttentionItems, just at the top level since CE
 *  has no program wrapper above its items. */
export function buildCeAttentionItems(items: CeItem[], selectedWeekLabel: string): CeAttentionItem[] {
  const selectedIndex = ceWeekLabelIndex(selectedWeekLabel);
  const result: CeAttentionItem[] = [];
  for (const item of items) {
    if (!item.done && item.kriteriaBefore.trim().toLowerCase() === "critical") {
      result.push({ item, issue: "Critical & Belum Selesai" });
    }
    if (item.alert.trim() === "!") {
      result.push({ item, issue: "Alert" });
    }
    const itemIndex = item.targetWeekLabel ? ceWeekLabelIndex(item.targetWeekLabel) : -1;
    if (!item.done && itemIndex !== -1 && itemIndex < selectedIndex) {
      result.push({ item, issue: "Terlambat" });
    }
  }
  return result;
}

/** Items due in the selected week (both done and not-yet-done) PLUS any
 *  earlier-targeted item still open (overdue) — same rule already proven
 *  for ABO's ruas checklist, applied here at the top level since CE items
 *  aren't nested under a program. */
export function filterCeItemsForPeriod(items: CeItem[], selectedWeekLabel: string): CeItem[] {
  const selectedIndex = ceWeekLabelIndex(selectedWeekLabel);
  return items.filter((item) => {
    if (item.targetWeekLabel === selectedWeekLabel) return true;
    const itemIndex = item.targetWeekLabel ? ceWeekLabelIndex(item.targetWeekLabel) : -1;
    return itemIndex !== -1 && itemIndex < selectedIndex && !item.done;
  });
}

/** Today's real calendar date (Asia/Jakarta), as "YYYY-MM-DD" — separate
 *  from defaultCeWeekLabel's week-label estimate: date-based overdue/recent
 *  filters below need a real day, not just a week bucket. */
export function todayISODate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isoDateMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// The 9 "stream" categories the reference dashboard groups findings into,
// derived from the Indikator column's own "NN_Label-..." prefix (e.g.
// "01_TRF-AHI", "08_SUTT/ET-ROW") — confirmed live: summing items by this
// 2-digit prefix reproduces the reference site's per-stream totals exactly
// (e.g. Switchyard=68, SUTT/SUTET=469), unlike the raw Jenis_Asset column
// which leaves ~200 items in an uninformative "Lainnya" bucket.
export const CE_STREAM_LABELS: Record<string, string> = {
  "01": "Trafo",
  "02": "MV Apparatus",
  "03": "Switchyard",
  "04": "GIS",
  "05": "Proteksi",
  "06": "Catu Daya",
  "07": "SKTT/SKLT",
  "08": "SUTT/SUTET",
  "09": "Facility",
};

// The 3 "Sub Bidang" groupings the reference site rolls those 9 streams up
// into — confirmed live by exact arithmetic match against the reference
// site's per-sub-bidang totals (Gardu Induk=122, Proteksi=43, Jaringan=469):
// only that split of the 9 streams into these 3 groups reproduces all three
// totals simultaneously.
export const CE_SUB_BIDANG_BY_STREAM: Record<string, string> = {
  "01": "Gardu Induk",
  "02": "Gardu Induk",
  "03": "Gardu Induk",
  "04": "Gardu Induk",
  "07": "Gardu Induk",
  "09": "Gardu Induk",
  "05": "Proteksi",
  "06": "Proteksi",
  "08": "Jaringan",
};

export function extractCeStreamCode(indikator: string): string | null {
  const m = /^(\d{2})_/.exec(indikator.trim());
  return m ? m[1] : null;
}

export interface CeStreamEntry {
  code: string;
  label: string;
  subBidang: string;
  total: number;
  close: number;
  open: number;
}

/** Fixed-order (01..09) so the table always shows all 9 streams, including
 *  ones with zero items in the current data — matches the reference site's
 *  own always-9-rows table. */
export function buildCeStreamBreakdown(items: CeItem[]): CeStreamEntry[] {
  return Object.entries(CE_STREAM_LABELS).map(([code, label]) => {
    const group = items.filter((i) => extractCeStreamCode(i.indikator) === code);
    return {
      code,
      label,
      subBidang: CE_SUB_BIDANG_BY_STREAM[code],
      total: group.length,
      close: group.filter((i) => i.done).length,
      open: group.filter((i) => !i.done).length,
    };
  });
}

export interface CeSubBidangEntry {
  label: string;
  total: number;
  close: number;
  open: number;
}

const CE_SUB_BIDANG_ORDER = ["Gardu Induk", "Proteksi", "Jaringan"];

export function buildCeSubBidangBreakdown(streamBreakdown: CeStreamEntry[]): CeSubBidangEntry[] {
  return CE_SUB_BIDANG_ORDER.map((label) => {
    const streams = streamBreakdown.filter((s) => s.subBidang === label);
    return {
      label,
      total: streams.reduce((sum, s) => sum + s.total, 0),
      close: streams.reduce((sum, s) => sum + s.close, 0),
      open: streams.reduce((sum, s) => sum + s.open, 0),
    };
  });
}

export interface CeMonthlyTrendEntry {
  month: string;
  target: number;
  realisasi: number;
}

/** Target = items whose TANGGAL TARGET real date falls in that month;
 *  Realisasi = items whose TANGGAL REALISASI real date falls in that month
 *  — uses the actual dates rather than the nominal week-label month, since
 *  an item finished later than its original schedule keeps its old label
 *  but its real completion date has moved (confirmed live: label-based
 *  grouping overstated Jul/Aug realisasi relative to the reference site's
 *  own chart; date-based grouping is the more defensible source of truth
 *  either way). */
export function buildCeMonthlyTrend(items: CeItem[]): CeMonthlyTrendEntry[] {
  const target = new Array(12).fill(0) as number[];
  const realisasi = new Array(12).fill(0) as number[];
  for (const item of items) {
    if (item.tanggalTarget) {
      const monthIdx = Number(item.tanggalTarget.slice(5, 7)) - 1;
      if (monthIdx >= 0 && monthIdx < 12) target[monthIdx] += 1;
    }
    if (item.tanggalRealisasi) {
      const monthIdx = Number(item.tanggalRealisasi.slice(5, 7)) - 1;
      if (monthIdx >= 0 && monthIdx < 12) realisasi[monthIdx] += 1;
    }
  }
  return CE_MONTH_ABBR.map((month, idx) => ({ month, target: target[idx], realisasi: realisasi[idx] }));
}

export interface CeUltgIdealEntry {
  ultg: string;
  total: number;
  close: number;
  open: number;
  onTarget: number;
  lagging: number;
  actualPercent: number | null;
  idealPercent: number;
  gapPts: number | null;
}

/** "Ideal" trajectory = proportion of this year's 48 weekly milestones
 *  already elapsed as of the selected week (e.g. week 34 of 48 ≈ 71%) —
 *  confirmed live: matches the reference site's own "ideal 71%" line for
 *  the current week almost exactly. Actual = CLS/OPN-based close rate per
 *  ULTG (see the plan note on why "Close Valid" itself isn't reproduced). */
export function buildCeUltgIdeal(items: CeItem[], selectedWeekLabel: string): CeUltgIdealEntry[] {
  const idealPercent = ((ceWeekLabelIndex(selectedWeekLabel) + 1) / CE_WEEK_LABELS.length) * 100;
  const order: string[] = [];
  const map = new Map<string, CeItem[]>();
  for (const item of items) {
    const key = item.ultg || "Lainnya";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((ultg) => {
    const group = map.get(ultg)!;
    const close = group.filter((i) => i.done).length;
    const openItems = group.filter((i) => !i.done);
    const lagging = openItems.filter((i) => i.status.trim().toUpperCase() === "LAGGING").length;
    const actualPercent = group.length > 0 ? (close / group.length) * 100 : null;
    return {
      ultg,
      total: group.length,
      close,
      open: openItems.length,
      onTarget: openItems.length - lagging,
      lagging,
      actualPercent,
      idealPercent,
      gapPts: actualPercent !== null ? actualPercent - idealPercent : null,
    };
  });
}

export interface CeProgramRollupEntry {
  program: string;
  totalTarget: number;
  realisasiKini: number;
  percentCapaian: number;
  status: "Finish" | "On Target" | "Lagging";
  realisasi3Minggu: number;
}

/** Programs (grouped by Nama Program) that had at least one realization in
 *  the last 3 weeks — same "what actually moved recently" framing as the
 *  reference site's "Realisasi Program 3 Minggu Terakhir" slide. */
export function buildCeProgramRollup(items: CeItem[], todayISO: string): CeProgramRollupEntry[] {
  const cutoff = isoDateMinusDays(todayISO, 21);
  const order: string[] = [];
  const map = new Map<string, CeItem[]>();
  for (const item of items) {
    const key = item.namaProgram.trim();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  const result: CeProgramRollupEntry[] = [];
  for (const program of order) {
    const group = map.get(program)!;
    const realisasi3Minggu = group.filter(
      (i) => i.tanggalRealisasi !== null && i.tanggalRealisasi >= cutoff && i.tanggalRealisasi <= todayISO,
    ).length;
    if (realisasi3Minggu === 0) continue;

    const realisasiKini = group.filter((i) => i.done).length;
    const anyLagging = group.some((i) => !i.done && i.status.trim().toUpperCase() === "LAGGING");
    const status: CeProgramRollupEntry["status"] =
      realisasiKini === group.length ? "Finish" : anyLagging ? "Lagging" : "On Target";

    result.push({
      program,
      totalTarget: group.length,
      realisasiKini,
      percentCapaian: group.length > 0 ? realisasiKini / group.length : 0,
      status,
      realisasi3Minggu,
    });
  }
  return result;
}

export interface CeRecentActivityItem {
  item: CeItem;
  tanggalRealisasi: string;
}

/** Items realized in the last 3 weeks, most recent first — the "kegiatan
 *  yang dikerjakan" activity feed on the reference site. */
export function buildCeRecentActivity(items: CeItem[], todayISO: string): CeRecentActivityItem[] {
  const cutoff = isoDateMinusDays(todayISO, 21);
  return items
    .filter((i) => i.tanggalRealisasi !== null && i.tanggalRealisasi >= cutoff && i.tanggalRealisasi <= todayISO)
    .map((i) => ({ item: i, tanggalRealisasi: i.tanggalRealisasi as string }))
    .sort((a, b) => b.tanggalRealisasi.localeCompare(a.tanggalRealisasi));
}

export interface CeUltgStreamCell {
  ultg: string;
  total: number;
  open: number;
  close: number;
}

export interface CeUltgStreamRow {
  streamCode: string;
  streamLabel: string;
  total: number;
  open: number;
  close: number;
  byUltg: CeUltgStreamCell[];
}

/** Stream × ULTG detail matrix — one row per of the 9 streams (same labels
 *  as buildCeStreamBreakdown), each ULTG's own total/open/close shown side
 *  by side. The detail view behind buildCeUltgIdeal's own per-ULTG summary:
 *  that table answers "which ULTG is behind," this answers "behind on
 *  which kind of equipment." ULTG column order follows first-seen order in
 *  `items`, same convention already used by buildCeUltgIdeal above, rather
 *  than a hardcoded list — keeps this resilient to however many distinct
 *  ULTG values the sheet actually has. */
export function buildCeUltgStreamMatrix(items: CeItem[]): CeUltgStreamRow[] {
  const ultgOrder: string[] = [];
  for (const item of items) {
    const key = item.ultg || "Lainnya";
    if (!ultgOrder.includes(key)) ultgOrder.push(key);
  }

  return Object.entries(CE_STREAM_LABELS).map(([code, label]) => {
    const group = items.filter((i) => extractCeStreamCode(i.indikator) === code);
    const byUltg = ultgOrder.map((ultg) => {
      const ultgGroup = group.filter((i) => (i.ultg || "Lainnya") === ultg);
      return {
        ultg,
        total: ultgGroup.length,
        open: ultgGroup.filter((i) => !i.done).length,
        close: ultgGroup.filter((i) => i.done).length,
      };
    });
    return {
      streamCode: code,
      streamLabel: label,
      total: group.length,
      open: group.filter((i) => !i.done).length,
      close: group.filter((i) => i.done).length,
      byUltg,
    };
  });
}

export interface CeOpenItemsStreamGroup {
  /** null = item's Indikator didn't match the "NN_" stream-code prefix at
   *  all (same "Lainnya" fallback as buildCeStreamBreakdown's own uncoded
   *  leftovers) — sorted last, after the fixed 01..09 stream order. */
  streamCode: string | null;
  streamLabel: string;
  /** BOTH open and closed items — open ones first (most-overdue first),
   *  closed ones after (most-recently-closed first). Each item still
   *  carries its own `done` flag for the UI to tell them apart. */
  items: CeItem[];
  openCount: number;
  closeCount: number;
  overdueCount: number;
}

export interface CeOpenItemsUltgGroup {
  ultg: string;
  streams: CeOpenItemsStreamGroup[];
  openCount: number;
  closeCount: number;
  overdueCount: number;
}

/** Every item (open AND closed), grouped by ULTG then by stream (same 9
 *  streams as buildCeStreamBreakdown/buildCeUltgStreamMatrix) — the
 *  literal list behind buildCeUltgIdeal's own per-ULTG open/close COUNTS,
 *  meant as each ULTG's own reminder/checklist, organized the same way
 *  the rest of the page already breaks equipment down (by stream), not
 *  a flat pile of rows. Per user feedback: an earlier version of this
 *  only included open items — closed ones are now included too (each
 *  stream's own open/close counts mirror buildCeStreamBreakdown's own
 *  numbers), so a stream can be inspected on its own instead of only
 *  being able to see what's still outstanding.
 *
 *  Within each stream, open items sort first (overdue ones before
 *  not-yet-due ones, then by target week ascending, no-target-week
 *  last), followed by closed items (most recently realized first, items
 *  with no realisasi date last) — open work stays the most prominent
 *  part of what's still primarily a reminder list. A stream with zero
 *  items total (open or closed) for a given ULTG is simply omitted
 *  (unlike buildCeStreamBreakdown's always-9-rows table) — an entirely
 *  empty stream would just be clutter here. ULTG order follows
 *  first-seen order in `items`, same convention as
 *  buildCeUltgIdeal/buildCeUltgStreamMatrix above. */
export function buildCeOpenItemsByUltg(items: CeItem[], selectedWeekLabel: string): CeOpenItemsUltgGroup[] {
  const selectedIndex = ceWeekLabelIndex(selectedWeekLabel);

  function itemWeekIndex(item: CeItem): number {
    return item.targetWeekLabel ? ceWeekLabelIndex(item.targetWeekLabel) : -1;
  }
  function isOverdue(item: CeItem): boolean {
    if (item.done) return false;
    const idx = itemWeekIndex(item);
    return idx !== -1 && idx < selectedIndex;
  }
  function sortItems(a: CeItem, b: CeItem): number {
    // Open before closed, always.
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.done) {
      // Both open: overdue first, then by target week ascending.
      const aOverdue = isOverdue(a);
      const bOverdue = isOverdue(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const aIdx = itemWeekIndex(a);
      const bIdx = itemWeekIndex(b);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    }
    // Both closed: most recently realized first.
    if (a.tanggalRealisasi && b.tanggalRealisasi) return b.tanggalRealisasi.localeCompare(a.tanggalRealisasi);
    if (a.tanggalRealisasi) return -1;
    if (b.tanggalRealisasi) return 1;
    return 0;
  }

  const ultgOrder: string[] = [];
  const byUltg = new Map<string, CeItem[]>();
  for (const item of items) {
    const key = item.ultg || "Lainnya";
    if (!byUltg.has(key)) {
      byUltg.set(key, []);
      ultgOrder.push(key);
    }
    byUltg.get(key)!.push(item);
  }

  const streamCodeOrder = Object.keys(CE_STREAM_LABELS);

  return ultgOrder.map((ultg) => {
    const ultgItems = byUltg.get(ultg)!;
    const byStream = new Map<string | null, CeItem[]>();
    for (const item of ultgItems) {
      const code = extractCeStreamCode(item.indikator);
      const key = code && CE_STREAM_LABELS[code] ? code : null;
      if (!byStream.has(key)) byStream.set(key, []);
      byStream.get(key)!.push(item);
    }

    function toStreamGroup(code: string | null, label: string, group: CeItem[]): CeOpenItemsStreamGroup {
      const sorted = [...group].sort(sortItems);
      return {
        streamCode: code,
        streamLabel: label,
        items: sorted,
        openCount: sorted.filter((i) => !i.done).length,
        closeCount: sorted.filter((i) => i.done).length,
        overdueCount: sorted.filter(isOverdue).length,
      };
    }

    const streams: CeOpenItemsStreamGroup[] = [];
    for (const code of streamCodeOrder) {
      const group = byStream.get(code);
      if (!group || group.length === 0) continue;
      streams.push(toStreamGroup(code, CE_STREAM_LABELS[code], group));
    }
    const uncoded = byStream.get(null);
    if (uncoded && uncoded.length > 0) {
      streams.push(toStreamGroup(null, "Lainnya", uncoded));
    }

    return {
      ultg,
      streams,
      openCount: ultgItems.filter((i) => !i.done).length,
      closeCount: ultgItems.filter((i) => i.done).length,
      overdueCount: ultgItems.filter(isOverdue).length,
    };
  });
}

export interface CeExecutiveSummary {
  criticalOpen: number;
  criticalTotal: number;
  criticalOpenPct: number | null;
  backlogStream: { label: string; open: number; criticalOpen: number } | null;
}

/** Headline "ringkasan eksekusi" cards — critical-open share of all-time
 *  critical findings, and the stream currently carrying the most open
 *  backlog (with its own critical-open count) — same two headline facts as
 *  the reference site's executive summary panel. */
export function buildCeExecutiveSummary(items: CeItem[], streamBreakdown: CeStreamEntry[]): CeExecutiveSummary {
  const criticalTotal = items.filter((i) => i.kriteriaBefore.trim().toLowerCase() === "critical").length;
  const criticalOpen = items.filter(
    (i) => !i.done && i.kriteriaBefore.trim().toLowerCase() === "critical",
  ).length;

  const withOpen = streamBreakdown.filter((s) => s.open > 0);
  const topStream = withOpen.reduce<CeStreamEntry | null>(
    (best, s) => (best === null || s.open > best.open ? s : best),
    null,
  );
  const backlogStream = topStream
    ? {
        label: topStream.label,
        open: topStream.open,
        criticalOpen: items.filter(
          (i) => !i.done && extractCeStreamCode(i.indikator) === topStream.code && i.kriteriaBefore.trim().toLowerCase() === "critical",
        ).length,
      }
    : null;

  return {
    criticalOpen,
    criticalTotal,
    criticalOpenPct: criticalTotal > 0 ? criticalOpen / criticalTotal : null,
    backlogStream,
  };
}
