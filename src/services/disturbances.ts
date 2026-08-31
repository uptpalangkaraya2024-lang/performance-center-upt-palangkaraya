import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { requireText } from "@/lib/parse";
import type {
  DisturbanceBayCount,
  DisturbanceCategoryResult,
  DisturbanceCategorySummary,
  DisturbanceCause,
  DisturbanceCauseMonthlyYear,
  DisturbanceMonthlyYearPoint,
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

function formatDateLabel(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTH_ID[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName.slice(0, 3)} ${year}`;
}

type DisturbanceCategory = "transmisi" | "trafo";

interface DisturbanceRow {
  year: string;
  month: string; // raw "NN. Nama"
  tgl: string; // "yyyy-MM-dd HH:mm:ss" — sorts correctly as a plain string
  namaBay: string;
  category: DisturbanceCategory;
  kind: string; // raw KODE GGN
  cause: string; // raw PENYEBAB
}

// "KODE BAY" values confirmed against live data: "T/L Bay" (Transmisi/Line),
// "T/R Bay" and "T/R Bay (LOW VOLTAGE)" (Trafo). Anything else (REAKTOR,
// COUPLE, ...) is neither and falls out of both category charts.
function categorizeBay(kodeBay: string): DisturbanceCategory | null {
  if (kodeBay.startsWith("T/L")) return "transmisi";
  if (kodeBay.startsWith("T/R")) return "trafo";
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

  return { year, month, tgl, namaBay, category, kind, cause };
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
  };
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

  const topBay: DisturbanceBayCount[] = [...bayCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([bay, count]) => ({ bay, count }));

  const summary: DisturbanceCategorySummary = {
    total: rows.length,
    trip: kindCounts.get("TRIP") ?? 0,
    arSukses: kindCounts.get("RECLOSE SUKSES") ?? 0,
    tidakTrip: kindCounts.get("TIDAK TRIP") ?? 0,
    latestDisturbance: latestTgl ? formatDateLabel(latestTgl) : null,
  };

  return { summary, causePareto, kindBreakdown, monthlyByYear, monthlyByYearByCause, years: sortedYears, topBay };
}

export interface DisturbancesResult {
  transmisi: DisturbanceCategoryResult;
  trafo: DisturbanceCategoryResult;
  error: string | null;
}

export async function getDisturbances(): Promise<DisturbancesResult> {
  const results = await readConfiguredSource(SOURCE);
  const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);

  if (!sheetResult) {
    return {
      transmisi: emptyCategory(),
      trafo: emptyCategory(),
      error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const rows = sheetResult.records.map(normalizeRow).filter((row): row is DisturbanceRow => row !== null);

  return {
    transmisi: buildCategoryAggregates(rows.filter((r) => r.category === "transmisi")),
    trafo: buildCategoryAggregates(rows.filter((r) => r.category === "trafo")),
    error: null,
  };
}
