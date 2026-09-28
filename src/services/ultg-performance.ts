import "server-only";

import { dataSources } from "@/config/data-sources";
import { ULTG_KPI_CONFIG } from "@/config/ultg-kpi";
import {
  readConfiguredSource,
  readConfiguredSourceRaw,
  type RawSheetReadResult,
  type SheetReadResult,
} from "@/lib/data-connector";
import { calculateStatus } from "@/lib/kpi-engine";
import { parseNumber, requireText } from "@/lib/parse";
import { listSyncStatus } from "@/lib/sync-status";
import type {
  UltgKpi,
  UltgPerformanceResult,
  UltgPerformanceSnapshot,
  UptKpiDirection,
  UptKpiMonthlyPoint,
  UptOverallPerformance,
  UptPeriodOption,
  UptWeightInfo,
} from "@/types";

// Same parsing approach as src/services/upt-performance.ts (that file's own
// comments explain the reasoning in more depth) — deliberately kept as its
// own self-contained copy rather than a shared module: the two contracts
// (19 UPT-level KPIs vs 33 per-ULTG KPIs) happen to share a column layout
// today, but nothing guarantees they stay identical, and this module now
// runs the same logic 3x (once per ULTG sheet) rather than once.
const SOURCE = dataSources.ultgPerformance;
const EXPECTED_FILE = SOURCE.sources[0].file;

const ULTG_DISPLAY_NAMES: Record<string, string> = {
  "ULTG PALANGKARAYA": "ULTG Palangkaraya",
  "ULTG PANGKALAN BUN": "ULTG Pangkalan Bun",
  "ULTG MUARA TEWEH": "ULTG Muara Teweh",
};

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTH_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function getField(row: Record<string, string>, name: string): string | null {
  const target = name.trim().toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === target) return requireText(row[key]);
  }
  return null;
}

function resolveDirection(polaritas: string | null): UptKpiDirection | null {
  if (polaritas === "Positif") return "HIGHER_IS_BETTER";
  if (polaritas === "Negatif") return "LOWER_IS_BETTER";
  return null; // e.g. the "Konten" KPI, whose POLARITAS cell is blank in the source.
}

function stripLetterPrefix(text: string): string {
  return text.replace(/^[a-zA-Z]\.\s*/, "").trim();
}

function normalizeLabel(text: string): string {
  return text.trim().toLowerCase();
}

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

function detectCurrentMonthAbbrev(records: Record<string, string>[]): string | null {
  for (const row of records) {
    const indikator = getField(row, "INDIKATOR KINERJA KUNCI");
    if (indikator) continue;
    const targetSd = getField(row, "Target s/d");
    if (targetSd && MONTH_ABBREVIATIONS.some((m) => m.toLowerCase() === targetSd.toLowerCase())) {
      return targetSd;
    }
  }
  return null;
}

function detectYear(records: Record<string, string>[]): number | null {
  for (const row of records) {
    for (const key of Object.keys(row)) {
      const match = /Target Tahun (\d{4})/i.exec(key);
      if (match) return Number(match[1]);
    }
  }
  return null;
}

function buildPeriodOptions(year: number | null, currentPeriod: string | null): UptPeriodOption[] {
  if (year === null) return [];
  return MONTH_NAMES_ID.map((label, index) => {
    const month = String(index + 1).padStart(2, "0");
    const value = `${year}-${month}`;
    return { value, label: `${label} ${year}`, hasData: value === currentPeriod };
  });
}

function findHeaderRowIndex(raw: unknown[][]): number {
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (String(row?.[0] ?? "").trim() === "NO" && String(row?.[1] ?? "").trim().toUpperCase().includes("INDIKATOR")) {
      return i;
    }
  }
  return -1;
}

function findRealisasiKomulatifStartCol(headerRow: unknown[]): number {
  const janIndices: number[] = [];
  headerRow.forEach((cell, idx) => {
    if (String(cell ?? "").trim() === "Jan") janIndices.push(idx);
  });
  return janIndices[3] ?? -1;
}

function extractMonthlyTrends(
  raw: unknown[][],
  currentMonthIndex: number,
  warnings: string[],
): Map<string, UptKpiMonthlyPoint[]> {
  const result = new Map<string, UptKpiMonthlyPoint[]>();
  if (currentMonthIndex < 0) return result;

  const headerRowIdx = findHeaderRowIndex(raw);
  if (headerRowIdx < 0) {
    warnings.push("HISTORICAL_TREND_UNAVAILABLE: baris header blok bulanan tidak ditemukan.");
    return result;
  }
  const startCol = findRealisasiKomulatifStartCol(raw[headerRowIdx] as unknown[]);
  if (startCol < 0) {
    warnings.push("HISTORICAL_TREND_UNAVAILABLE: kolom REALISASI KOMULATIF tidak ditemukan.");
    return result;
  }

  const matchedKeys = new Set<string>();
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const indikatorRaw = requireText(row[1] != null ? String(row[1]) : undefined);
    if (!indikatorRaw) continue;
    const candidates = [normalizeLabel(indikatorRaw), normalizeLabel(stripLetterPrefix(indikatorRaw))];
    for (const config of ULTG_KPI_CONFIG) {
      if (matchedKeys.has(config.key)) continue;
      if (!candidates.includes(normalizeLabel(config.sourceLabel))) continue;
      matchedKeys.add(config.key);

      const points: UptKpiMonthlyPoint[] = [];
      for (let m = 0; m <= currentMonthIndex; m++) {
        const cell = row[startCol + m];
        const value = typeof cell === "number" ? cell : parseNumber(cell != null ? String(cell) : undefined);
        points.push({ month: MONTH_SHORT_ID[m], value });
      }
      if (points.some((p) => p.value !== null)) {
        result.set(config.key, points);
      }
    }
  }

  return result;
}

function cellNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return parseNumber(v != null ? String(v) : undefined);
}

function findColByHeader(headerRow: unknown[], name: string): number {
  return headerRow.findIndex((cell) => String(cell ?? "").trim() === name);
}

function extractWeightInfo(
  raw: unknown[][],
  warnings: string[],
): { perKpi: Map<string, UptWeightInfo>; overallWeightedScore: number | null } {
  const perKpi = new Map<string, UptWeightInfo>();

  const headerRowIdx = findHeaderRowIndex(raw);
  if (headerRowIdx < 0) {
    warnings.push("WEIGHT_INFO_UNAVAILABLE: baris header tidak ditemukan.");
    return { perKpi, overallWeightedScore: null };
  }
  const headerRow = raw[headerRowIdx] as unknown[];
  const bobotCol = findColByHeader(headerRow, "BOBOT");
  const cappingCol = findColByHeader(headerRow, "Capping 110%");
  const bobotHilangCol = findColByHeader(headerRow, "Bobot Hilang");
  if (bobotCol < 0 || cappingCol < 0) {
    warnings.push("WEIGHT_INFO_UNAVAILABLE: kolom BOBOT/Capping 110% tidak ditemukan.");
    return { perKpi, overallWeightedScore: null };
  }

  let overallWeightedScore: number | null = null;
  let currentGroup: (UptWeightInfo & { sharedWith: string }) | null = null;
  const matchedKeys = new Set<string>();

  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const no = row[0];
    const indikatorRaw = requireText(row[1] != null ? String(row[1]) : undefined);

    if (indikatorRaw && /^TOTAL BOBOT PROPORSIONAL$/i.test(indikatorRaw)) {
      overallWeightedScore = cellNumber(row[cappingCol]);
      continue;
    }
    if (!indikatorRaw) continue;

    const candidates = [normalizeLabel(indikatorRaw), normalizeLabel(stripLetterPrefix(indikatorRaw))];
    const matchedConfig = ULTG_KPI_CONFIG.find(
      (config) => !matchedKeys.has(config.key) && candidates.includes(normalizeLabel(config.sourceLabel)),
    );

    if (matchedConfig) {
      matchedKeys.add(matchedConfig.key);
      const ownWeight = cellNumber(row[bobotCol]);
      if (ownWeight !== null) {
        perKpi.set(matchedConfig.key, {
          weight: ownWeight,
          weightedScore: cellNumber(row[cappingCol]),
          weightLost: bobotHilangCol >= 0 ? cellNumber(row[bobotHilangCol]) : null,
        });
      } else if (currentGroup) {
        perKpi.set(matchedConfig.key, { ...currentGroup });
      }
      continue;
    }

    if (typeof no === "number") {
      const weight = cellNumber(row[bobotCol]);
      currentGroup =
        weight !== null
          ? {
              weight,
              weightedScore: cellNumber(row[cappingCol]),
              weightLost: bobotHilangCol >= 0 ? cellNumber(row[bobotHilangCol]) : null,
              sharedWith: indikatorRaw,
            }
          : null;
    }
  }

  return { perKpi, overallWeightedScore };
}

function normalizeKpi(
  records: Record<string, string>[],
  trends: Map<string, UptKpiMonthlyPoint[]>,
  weightInfo: Map<string, UptWeightInfo>,
): UltgKpi[] {
  const byLabel = new Map<string, Record<string, string>>();
  const matchedKeys = new Set<string>();

  for (const row of records) {
    const indikatorRaw = getField(row, "INDIKATOR KINERJA KUNCI");
    if (!indikatorRaw) continue;
    const candidates = [normalizeLabel(indikatorRaw), normalizeLabel(stripLetterPrefix(indikatorRaw))];
    for (const config of ULTG_KPI_CONFIG) {
      const target = normalizeLabel(config.sourceLabel);
      if (!candidates.includes(target)) continue;
      if (matchedKeys.has(config.key)) continue;
      matchedKeys.add(config.key);
      byLabel.set(config.key, row);
    }
  }

  return ULTG_KPI_CONFIG.map((config): UltgKpi => {
    const row = byLabel.get(config.key);
    if (!row) {
      return {
        key: config.key,
        displayName: config.displayName,
        abbreviation: config.abbreviation,
        category: config.category,
        direction: null,
        unit: null,
        targetLabel: null,
        targetValue: null,
        actualLabel: null,
        actualValue: null,
        achievement: null,
        status: "none",
        monthlyTrend: null,
        weightInfo: null,
      };
    }

    const direction = resolveDirection(getField(row, "POLARITAS"));
    const achievement = parseNumber(getField(row, "Pencapaian") ?? undefined);
    const targetLabel = getField(row, "Target s/d");
    const actualLabel = getField(row, "Realisasi s/d");

    return {
      key: config.key,
      displayName: config.displayName,
      abbreviation: config.abbreviation,
      category: config.category,
      direction,
      unit: getField(row, "SATUAN"),
      targetLabel,
      targetValue: parseNumber(targetLabel ?? undefined),
      actualLabel,
      actualValue: parseNumber(actualLabel ?? undefined),
      achievement,
      status: achievement === null ? "none" : calculateStatus(achievement),
      monthlyTrend: trends.get(config.key) ?? null,
      weightInfo: weightInfo.get(config.key) ?? null,
    };
  });
}

function summarize(kpis: UltgKpi[]): UptOverallPerformance {
  return kpis.reduce<UptOverallPerformance>(
    (acc, kpi) => {
      if (kpi.status === "good") acc.achieved += 1;
      else if (kpi.status === "warning") acc.warning += 1;
      else if (kpi.status === "critical") acc.critical += 1;
      else acc.noData += 1;
      return acc;
    },
    { total: kpis.length, achieved: 0, warning: 0, critical: 0, noData: 0 },
  );
}

function slugFor(sheetName: string): string {
  return sheetName.toLowerCase().replace(/^ultg\s+/, "").replace(/\s+/g, "-");
}

function buildSnapshot(
  sheetName: string,
  sheetResult: SheetReadResult,
  rawSheetResult: RawSheetReadResult | undefined,
): UltgPerformanceSnapshot {
  const warnings: string[] = [];

  const year = detectYear(sheetResult.records);
  const currentMonthAbbrev = detectCurrentMonthAbbrev(sheetResult.records);
  const currentMonthIndex = currentMonthAbbrev
    ? MONTH_ABBREVIATIONS.findIndex((m) => m.toLowerCase() === currentMonthAbbrev.toLowerCase())
    : -1;

  const trends = rawSheetResult
    ? extractMonthlyTrends(rawSheetResult.rows, currentMonthIndex, warnings)
    : new Map<string, UptKpiMonthlyPoint[]>();
  const weightData = rawSheetResult
    ? extractWeightInfo(rawSheetResult.rows, warnings)
    : { perKpi: new Map<string, UptWeightInfo>(), overallWeightedScore: null };

  const kpis = normalizeKpi(sheetResult.records, trends, weightData.perKpi);

  const period = year !== null && currentMonthIndex >= 0
    ? `${year}-${String(currentMonthIndex + 1).padStart(2, "0")}`
    : "unknown";
  const periodLabel = year !== null && currentMonthIndex >= 0
    ? `${MONTH_NAMES_ID[currentMonthIndex]} ${year}`
    : "Periode Terkini";

  const syncEntry = listSyncStatus().find((entry) => entry.file === EXPECTED_FILE && entry.sheet === sheetName);

  return {
    ultg: ULTG_DISPLAY_NAMES[sheetName] ?? sheetName,
    ultgSlug: slugFor(sheetName),
    period,
    periodLabel,
    kpis,
    overall: summarize(kpis),
    periodOptions: buildPeriodOptions(year, period),
    lastUpdate: formatTime(syncEntry?.lastSync ?? null),
    overallWeightedScore: weightData.overallWeightedScore,
    warnings,
  };
}

export async function getUltgPerformance(): Promise<UltgPerformanceResult> {
  const [results, rawResults] = await Promise.all([
    readConfiguredSource(SOURCE),
    readConfiguredSourceRaw(SOURCE),
  ]);

  const sheetNames = SOURCE.sources[0].sheets.map((s) => s.name);
  const snapshots: UltgPerformanceSnapshot[] = [];

  for (const sheetName of sheetNames) {
    const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === sheetName);
    if (!sheetResult) continue; // This ULTG's sheet failed to read — skip it, keep the others.
    const rawSheetResult = rawResults.find((r) => r.file === EXPECTED_FILE && r.sheet === sheetName);
    snapshots.push(buildSnapshot(sheetName, sheetResult, rawSheetResult));
  }

  if (snapshots.length === 0) {
    return {
      data: null,
      error: `Gagal membaca sheet ULTG dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  return { data: snapshots, error: null };
}
