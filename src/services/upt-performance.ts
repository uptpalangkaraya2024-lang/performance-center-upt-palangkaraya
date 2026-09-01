import "server-only";

import { dataSources } from "@/config/data-sources";
import { UPT_KPI_CONFIG } from "@/config/upt-kpi";
import { hasAllRequiredSheets, readConfiguredSource } from "@/lib/data-connector";
import { calculateStatus } from "@/lib/kpi-engine";
import { parseNumber, requireText } from "@/lib/parse";
import { listSyncStatus } from "@/lib/sync-status";
import type {
  UptKpi,
  UptKpiDirection,
  UptOverallPerformance,
  UptPeriodOption,
  UptPerformanceResult,
  UptPerformanceSnapshot,
} from "@/types";

const SOURCE = dataSources.uptPerformance;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// The sheet's own header text has an unexplained trailing space on "Target
// s/d " (verified live via the Apps Script gateway) — matching case- and
// whitespace-insensitively means a future re-export of the same contract
// template with the space fixed doesn't silently break every KPI.
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
  return null; // e.g. "Range" (Anggaran Investasi) — genuinely ambiguous, not guessed.
}

// Real KPI rows are the lettered sub-items ("a. Faktor Ketersediaan
// Trafo..."); one KPI (Legal Aset Tanah) is instead the top-level numbered
// row itself with no lettered prefix. Formula-component rows ("Σ MVA Trafo
// terganggu...") and pure category rollups ("1 Faktor Ketersediaan
// Transmisi (TRAF dan CCAF)") never match any configured sourceLabel, so
// stripping the prefix and comparing against the explicit alias list is
// enough to isolate exactly the 19 KPIs without a separate structural filter.
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

/**
 * Finds the row that carries the "as of" month annotation (blank INDIKATOR,
 * with the "Target s/d " / "Realisasi s/d" / "Pencapaian" columns all set to
 * the same 3-letter month abbreviation, e.g. "AUG") — this tells us which
 * single month the sheet's snapshot columns (H/I/J/K) currently represent.
 */
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

/** Extracts the contract year from the "Target Tahun 2026"-style header key present on every row. */
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

function normalizeKpi(records: Record<string, string>[], warnings: string[]): UptKpi[] {
  const byLabel = new Map<string, Record<string, string>>();
  const matchedKeys = new Set<string>();

  for (const row of records) {
    const indikatorRaw = getField(row, "INDIKATOR KINERJA KUNCI");
    if (!indikatorRaw) continue;
    const candidates = [normalizeLabel(indikatorRaw), normalizeLabel(stripLetterPrefix(indikatorRaw))];
    for (const config of UPT_KPI_CONFIG) {
      const target = normalizeLabel(config.sourceLabel);
      if (!candidates.includes(target)) continue;
      if (matchedKeys.has(config.key)) {
        warnings.push(`DUPLICATE_KPI_SOURCE: "${config.displayName}" matched more than one row — first match kept.`);
        continue;
      }
      matchedKeys.add(config.key);
      byLabel.set(config.key, row);
    }
  }

  return UPT_KPI_CONFIG.map((config): UptKpi => {
    const row = byLabel.get(config.key);
    if (!row) {
      return {
        key: config.key,
        displayName: config.displayName,
        abbreviation: config.abbreviation,
        category: config.category,
        direction: null,
        directionConflict: false,
        unit: null,
        targetLabel: null,
        targetValue: null,
        actualLabel: null,
        actualValue: null,
        achievement: null,
        status: "none",
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
      directionConflict: direction !== null && direction !== config.expectedDirection,
      unit: getField(row, "SATUAN"),
      targetLabel,
      targetValue: parseNumber(targetLabel ?? undefined),
      actualLabel,
      actualValue: parseNumber(actualLabel ?? undefined),
      achievement,
      // The sheet's Pencapaian already IS the achievement percentage — calculateStatus's
      // >=100/>=90 thresholds apply directly, no target/actual division needed here.
      status: achievement === null ? "none" : calculateStatus(achievement),
    };
  });
}

function summarize(kpis: UptKpi[]): UptOverallPerformance {
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

export async function getUptPerformance(): Promise<UptPerformanceResult> {
  const results = await readConfiguredSource(SOURCE);

  if (!hasAllRequiredSheets(SOURCE, results)) {
    return {
      data: null,
      error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);
  if (!sheetResult) {
    return {
      data: null,
      error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const warnings: string[] = [];
  const kpis = normalizeKpi(sheetResult.records, warnings);

  const year = detectYear(sheetResult.records);
  const currentMonthAbbrev = detectCurrentMonthAbbrev(sheetResult.records);
  const currentMonthIndex = currentMonthAbbrev
    ? MONTH_ABBREVIATIONS.findIndex((m) => m.toLowerCase() === currentMonthAbbrev.toLowerCase())
    : -1;

  const period = year !== null && currentMonthIndex >= 0
    ? `${year}-${String(currentMonthIndex + 1).padStart(2, "0")}`
    : "unknown";
  const periodLabel = year !== null && currentMonthIndex >= 0
    ? `${MONTH_NAMES_ID[currentMonthIndex]} ${year}`
    : "Periode Terkini";

  const syncEntry = listSyncStatus().find(
    (entry) => entry.file === EXPECTED_FILE && entry.sheet === EXPECTED_SHEET,
  );

  const snapshot: UptPerformanceSnapshot = {
    period,
    periodLabel,
    kpis,
    overall: summarize(kpis),
    periodOptions: buildPeriodOptions(year, period),
    lastUpdate: formatTime(syncEntry?.lastSync ?? null),
    warnings,
  };

  return { data: snapshot, error: null };
}
