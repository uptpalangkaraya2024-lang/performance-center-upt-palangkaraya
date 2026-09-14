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
