import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { calculateAchievement, calculateStatus, calculateTrend } from "@/lib/kpi-engine";
import { parseNumber, requireText } from "@/lib/parse";
import type { UltgPerformance } from "@/types";

const SOURCE = dataSources.ultgPerformance;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

// Expected header row in the "Kinerja ULTG" sheet: ULTG | KPI | Target |
// Actual | Actual Bulan Lalu (optional, enables the trend arrow).
function normalizeRow(row: Record<string, string>): Omit<UltgPerformance, "rank"> | null {
  const name = requireText(row["ULTG"]);
  const kpi = requireText(row["KPI"]) ?? "Performance Score";
  const target = parseNumber(row["Target"]);
  const actual = parseNumber(row["Actual"]);
  const previous = parseNumber(row["Actual Bulan Lalu"]);
  // A row missing its name or numbers is unusable for this shape — skip it
  // rather than let one bad spreadsheet row take the whole page down.
  if (!name || target === null || actual === null) return null;

  const achievement = calculateAchievement(target, actual);
  return {
    id: `ultg-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    kpi,
    target,
    actual,
    achievement,
    status: calculateStatus(achievement),
    trend: calculateTrend(actual, previous),
  };
}

export interface UltgPerformanceResult {
  data: UltgPerformance[];
  error: string | null;
}

// No cache here — readConfiguredSource() (src/lib/data-connector.ts) already
// caches the raw rows per provider+file+sheet. Normalizing/sorting them
// again on every call is cheap (pure in-memory transform of a handful of
// rows), so there's no need for a second cache layer just for this shape.
export async function getUltgPerformance(): Promise<UltgPerformanceResult> {
  const results = await readConfiguredSource(SOURCE);
  const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);

  if (!sheetResult) {
    return {
      data: [],
      error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const normalized = sheetResult.records
    .map(normalizeRow)
    .filter((row): row is Omit<UltgPerformance, "rank"> => row !== null)
    .sort((a, b) => b.achievement - a.achievement)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return { data: normalized, error: null };
}
