import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { parseDurationMinutes, requireText } from "@/lib/parse";
import type {
  DisturbanceBayCount,
  DisturbanceBaySummary,
  DisturbanceCategoryResult,
  DisturbanceCategorySummary,
  DisturbanceCause,
  DisturbanceCauseMonthlyYear,
  DisturbanceDurationRecord,
  DisturbanceFollowUpSummary,
  DisturbanceGiCount,
  DisturbanceMonthlyYearPoint,
  DisturbanceUltgSummary,
} from "@/types";

const SOURCE = dataSources.disturbances;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// "KODE GGN" only ever holds these three raw values in the sheet (confirmed
// against live data) — anything else is folded into "Lainnya" rather than
// silently dropped, so a new value added later doesn't just vanish.
const KIND_LABELS: Record<string, string> = {
  TRIP: "Trip",
  "RECLOSE SUKSES": "AR Sukses",
  "TIDAK TRIP": "Tidak Trip",
};

// "PENYEBAB" is a fixed set of PLN disturbance-cause codes (confirmed
// against live data) — mapped to readable Indonesian labels; an
// unrecognized code still renders (title-cased) instead of disappearing.
const CAUSE_LABELS: Record<string, string> = {
  PETIR: "Petir",
  HEWAN: "Hewan",
  TEGAKAN: "Tegakan / Pohon",
  ALAT: "Alat",
  "BENDA ASING": "Benda Asing",
  "AKIBAT PIHAK LAIN (APPL)": "Pihak Lain (APPL)",
  "GGN DIST": "Gangguan Distribusi",
  SISTEM: "Sistem",
  WIRING: "Wiring",
  "MALFUNGSI RELAY PROTEKSI": "Malfungsi Relay Proteksi",
  "MANUSIA (NSF)": "Manusia (NSF)",
};

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

// The sheet's own GARDU INDUK column reads e.g. "GI 150 KV KUALA KURUN" /
// "GIS 150 KV MINTIN" — stripping the "GI(S) <voltage> KV" prefix gives the
// bare GI name, matching how AHI's own GI column names the same substations.
function normalizeGiName(raw: string): string {
  return raw.replace(/^GIS?\s*\d+\s*KV\s*/i, "").trim();
}

// STATUS TINDAK LANJUT GGN holds "OPEN"/"CLOSED", but a handful of rows are
// blank or carry a sheet formula error ("#DIV/0!") — genuinely unknown, not
// silently folded into either real status.
function normalizeFollowUpStatus(raw: string | null): "OPEN" | "CLOSED" | "UNKNOWN" {
  const upper = raw?.trim().toUpperCase();
  if (upper === "OPEN") return "OPEN";
  if (upper === "CLOSED") return "CLOSED";
  return "UNKNOWN";
}

function formatDateLabel(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTH_ID[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName.slice(0, 3)} ${year}`;
}

type DisturbanceCategory = "transmisi" | "trafo-hv" | "trafo-lv";

interface DisturbanceRow {
  year: string;
  month: string; // raw "NN. Nama"
  tgl: string; // "yyyy-MM-dd HH:mm:ss" — sorts correctly as a plain string
  namaBay: string;
  category: DisturbanceCategory;
  kind: string; // raw KODE GGN
  cause: string; // raw PENYEBAB
  gi: string | null; // normalized GARDU INDUK
  ultg: string | null; // ULTG — UPT Palangkaraya's own sub-unit, used as-is
  durationMinutes: number | null; // DURASI GGN (MENIT)
  followUp: "OPEN" | "CLOSED" | "UNKNOWN";
}

// "KODE BAY" values confirmed against live data: "T/L Bay" (Transmisi/Line),
// "T/R Bay" (Trafo HV side) and "T/R Bay (LOW VOLTAGE)" (Trafo LV/incoming
// 20kV side). These are kept as two separate categories rather than one
// combined "Trafo": a HV-side trip and an LV-side-only trip mean different
// things operationally (only the LV/incoming side dropped vs. the whole
// transformer), so folding them together would blur which side actually
// tripped. Anything else (REAKTOR, COUPLE, ...) is neither and falls out of
// every category chart.
function categorizeBay(kodeBay: string): DisturbanceCategory | null {
  if (kodeBay.startsWith("T/L")) return "transmisi";
  if (kodeBay === "T/R Bay (LOW VOLTAGE)") return "trafo-lv";
  if (kodeBay.startsWith("T/R")) return "trafo-hv";
  return null;
}

// Expected columns in "INPUT & REKAP GANGGUAN": JUSTIFIKASI KINERJA, TAHUN,
// BULAN, TGL, NAMA BAY GANGGUAN, KODE BAY, KODE GGN, PENYEBAB.
function normalizeRow(row: Record<string, string>): DisturbanceRow | null {
  // Only disturbances the business itself counts toward performance are
  // charted — "TIDAK MASUK KINERJA" rows exist in the sheet but are
  // deliberately excluded from every aggregate below.
  if (requireText(row["JUSTIFIKASI KINERJA"]) !== "MASUK KINERJA") return null;

  const year = requireText(row["TAHUN"]);
  const month = requireText(row["BULAN"]);
  const tgl = requireText(row["TGL"]);
  const namaBay = requireText(row["NAMA BAY GANGGUAN"]);
  const kodeBay = requireText(row["KODE BAY"]);
  const kind = requireText(row["KODE GGN"]);
  const cause = requireText(row["PENYEBAB"]);
  if (!year || !month || !tgl || !namaBay || !kodeBay || !kind || !cause) return null;

  const category = categorizeBay(kodeBay);
  if (!category) return null;

  const gardu = requireText(row["GARDU INDUK"]);
  const gi = gardu ? normalizeGiName(gardu) : null;
  const ultg = requireText(row["ULTG"]);
  const durationMinutes = parseDurationMinutes(row["DURASI GGN (MENIT)"]);
  const followUp = normalizeFollowUpStatus(requireText(row["STATUS TINDAK LANJUT GGN"]));

  return { year, month, tgl, namaBay, category, kind, cause, gi, ultg, durationMinutes, followUp };
}

function emptyCategory(): DisturbanceCategoryResult {
  return {
    summary: { total: 0, trip: 0, arSukses: 0, tidakTrip: 0, latestDisturbance: null },
    causePareto: [],
    kindBreakdown: [],
    monthlyByYear: [],
    monthlyByYearByCause: [],
    years: [],
    topBay: [],
    allBayCounts: [],
    giBreakdown: [],
    followUp: { open: 0, closed: 0, unknown: 0 },
    avgDurationMinutes: null,
    longestDisturbances: [],
    ultgBreakdown: [],
    bayBreakdown: [],
  };
}

function kindSplit(rows: DisturbanceRow[]): { trip: number; arSukses: number; tidakTrip: number } {
  let trip = 0;
  let arSukses = 0;
  let tidakTrip = 0;
  for (const row of rows) {
    if (row.kind === "TRIP") trip += 1;
    else if (row.kind === "RECLOSE SUKSES") arSukses += 1;
    else if (row.kind === "TIDAK TRIP") tidakTrip += 1;
  }
  return { trip, arSukses, tidakTrip };
}

function causeParetoFor(rows: DisturbanceRow[]): DisturbanceCause[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.cause, (counts.get(row.cause) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cause, count]) => ({ cause: CAUSE_LABELS[cause] ?? titleCase(cause), count }));
}

function followUpFor(rows: DisturbanceRow[]): DisturbanceFollowUpSummary {
  const summary: DisturbanceFollowUpSummary = { open: 0, closed: 0, unknown: 0 };
  for (const row of rows) {
    if (row.followUp === "OPEN") summary.open += 1;
    else if (row.followUp === "CLOSED") summary.closed += 1;
    else summary.unknown += 1;
  }
  return summary;
}

// Per-ULTG detail — kind split (Trip/AR/Tidak Trip) and cause distribution
// for each of UPT Palangkaraya's own sub-units, straight from the sheet's
// ULTG column (only 3 distinct values, all populated — no normalization
// needed, unlike GARDU INDUK's "GI 150 KV ..." prefix).
function buildUltgBreakdown(rows: DisturbanceRow[]): DisturbanceUltgSummary[] {
  const byUltg = new Map<string, DisturbanceRow[]>();
  for (const row of rows) {
    if (!row.ultg) continue;
    const list = byUltg.get(row.ultg) ?? [];
    list.push(row);
    byUltg.set(row.ultg, list);
  }
  return [...byUltg.entries()]
    .map(([ultg, ultgRows]) => {
      const { trip, arSukses, tidakTrip } = kindSplit(ultgRows);
      return {
        ultg,
        total: ultgRows.length,
        trip,
        arSukses,
        tidakTrip,
        followUp: followUpFor(ultgRows),
        causePareto: causeParetoFor(ultgRows),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// Per-bay ("ruas") detail — same kind split + cause distribution, one row
// per NAMA BAY GANGGUAN value (every bay in the category, not capped).
function buildBayBreakdown(rows: DisturbanceRow[]): DisturbanceBaySummary[] {
  const byBay = new Map<string, DisturbanceRow[]>();
  for (const row of rows) {
    const list = byBay.get(row.namaBay) ?? [];
    list.push(row);
    byBay.set(row.namaBay, list);
  }
  return [...byBay.entries()]
    .map(([bay, bayRows]) => {
      const { trip, arSukses, tidakTrip } = kindSplit(bayRows);
      return {
        bay,
        ultg: bayRows[0].ultg ?? "-",
        gi: bayRows[0].gi ?? "-",
        total: bayRows.length,
        trip,
        arSukses,
        tidakTrip,
        followUp: followUpFor(bayRows),
        causePareto: causeParetoFor(bayRows),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// Shared by the all-causes total and each single-cause slice below — same
// month x year matrix shape either way, just over a smaller row subset.
function buildMonthlyByYear(rows: DisturbanceRow[], sortedYears: string[]): DisturbanceMonthlyYearPoint[] {
  const monthYearCounts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const monthLabel = row.month.replace(/^\d+\.\s*/, "");
    const yearMap = monthYearCounts.get(monthLabel) ?? new Map<string, number>();
    yearMap.set(row.year, (yearMap.get(row.year) ?? 0) + 1);
    monthYearCounts.set(monthLabel, yearMap);
  }
  return MONTH_ID.map((month) => {
    const point: DisturbanceMonthlyYearPoint = { month };
    const yearMap = monthYearCounts.get(month);
    for (const year of sortedYears) point[year] = yearMap?.get(year) ?? 0;
    return point;
  });
}

function buildCategoryAggregates(rows: DisturbanceRow[]): DisturbanceCategoryResult {
  if (rows.length === 0) return emptyCategory();

  const causeCounts = new Map<string, number>();
  const kindCounts = new Map<string, number>();
  const bayCounts = new Map<string, number>();
  const years = new Set<string>();
  let latestTgl: string | null = null;

  for (const row of rows) {
    causeCounts.set(row.cause, (causeCounts.get(row.cause) ?? 0) + 1);
    kindCounts.set(row.kind, (kindCounts.get(row.kind) ?? 0) + 1);
    bayCounts.set(row.namaBay, (bayCounts.get(row.namaBay) ?? 0) + 1);
    years.add(row.year);
    if (!latestTgl || row.tgl > latestTgl) latestTgl = row.tgl;
  }

  // Sorted by count desc — causePareto and monthlyByYearByCause share this
  // same order, so a "top N causes" UI reads consistently across both.
  const causeOrder = [...causeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([cause]) => cause);

  const causePareto: DisturbanceCause[] = causeOrder.map((cause) => ({
    cause: CAUSE_LABELS[cause] ?? titleCase(cause),
    count: causeCounts.get(cause) ?? 0,
  }));

  const kindBreakdown: DisturbanceCause[] = [...kindCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ cause: KIND_LABELS[kind] ?? titleCase(kind), count }));

  const sortedYears = [...years].sort();
  const monthlyByYear = buildMonthlyByYear(rows, sortedYears);
  const monthlyByYearByCause: DisturbanceCauseMonthlyYear[] = causeOrder.map((rawCause) => ({
    cause: CAUSE_LABELS[rawCause] ?? titleCase(rawCause),
    data: buildMonthlyByYear(rows.filter((r) => r.cause === rawCause), sortedYears),
  }));

  const allBayCounts: DisturbanceBayCount[] = [...bayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([bay, count]) => ({ bay, count }));
  const topBay = allBayCounts.slice(0, 8);

  const giCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.gi) continue;
    giCounts.set(row.gi, (giCounts.get(row.gi) ?? 0) + 1);
  }
  const giBreakdown: DisturbanceGiCount[] = [...giCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([gi, count]) => ({ gi, count }));

  const followUp: DisturbanceFollowUpSummary = { open: 0, closed: 0, unknown: 0 };
  for (const row of rows) {
    if (row.followUp === "OPEN") followUp.open += 1;
    else if (row.followUp === "CLOSED") followUp.closed += 1;
    else followUp.unknown += 1;
  }

  // Only TRIP events actually left the bay de-energized — RECLOSE SUKSES
  // (auto-reclose succeeded, confirmed live: 274/276 rows record exactly 0
  // minutes) and TIDAK TRIP have no real recovery time. Averaging across all
  // three kinds would drag a real ~86-minute mean down to a meaningless ~11
  // minutes, so duration stats are scoped to TRIP rows only.
  const withDuration = rows.filter(
    (r): r is DisturbanceRow & { durationMinutes: number } => r.kind === "TRIP" && r.durationMinutes !== null,
  );
  const avgDurationMinutes =
    withDuration.length > 0
      ? withDuration.reduce((sum, r) => sum + r.durationMinutes, 0) / withDuration.length
      : null;
  const longestDisturbances: DisturbanceDurationRecord[] = [...withDuration]
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .slice(0, 10)
    .map((r) => ({
      bay: r.namaBay,
      gi: r.gi ?? "-",
      tgl: formatDateLabel(r.tgl) ?? r.tgl,
      durationMinutes: r.durationMinutes,
    }));

  const summary: DisturbanceCategorySummary = {
    total: rows.length,
    trip: kindCounts.get("TRIP") ?? 0,
    arSukses: kindCounts.get("RECLOSE SUKSES") ?? 0,
    tidakTrip: kindCounts.get("TIDAK TRIP") ?? 0,
    latestDisturbance: latestTgl ? formatDateLabel(latestTgl) : null,
  };

  return {
    summary,
    causePareto,
    kindBreakdown,
    monthlyByYear,
    monthlyByYearByCause,
    years: sortedYears,
    topBay,
    allBayCounts,
    giBreakdown,
    followUp,
    avgDurationMinutes,
    longestDisturbances,
    ultgBreakdown: buildUltgBreakdown(rows),
    bayBreakdown: buildBayBreakdown(rows),
  };
}

export interface DisturbancesResult {
  transmisi: DisturbanceCategoryResult;
  /** Trafo HV side ("T/R Bay") — the whole transformer, both sides, tripped. */
  trafoHv: DisturbanceCategoryResult;
  /** Trafo LV/incoming 20kV side only ("T/R Bay (LOW VOLTAGE)") — the HV
   *  side stayed energized. Kept separate from trafoHv rather than combined,
   *  since which side tripped changes what actually happened operationally. */
  trafoLv: DisturbanceCategoryResult;
  error: string | null;
}

export async function getDisturbances(): Promise<DisturbancesResult> {
  const results = await readConfiguredSource(SOURCE);
  const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);

  if (!sheetResult) {
    return {
      transmisi: emptyCategory(),
      trafoHv: emptyCategory(),
      trafoLv: emptyCategory(),
      error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const rows = sheetResult.records.map(normalizeRow).filter((row): row is DisturbanceRow => row !== null);

  return {
    transmisi: buildCategoryAggregates(rows.filter((r) => r.category === "transmisi")),
    trafoHv: buildCategoryAggregates(rows.filter((r) => r.category === "trafo-hv")),
    trafoLv: buildCategoryAggregates(rows.filter((r) => r.category === "trafo-lv")),
    error: null,
  };
}
