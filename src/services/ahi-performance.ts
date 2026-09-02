import "server-only";

import { AHI_CATEGORY_DEFS, AHI_SECTION_META } from "@/config/ahi-categories";
import { dataSources } from "@/config/data-sources";
import { hasAllRequiredSheets, readConfiguredSourceRaw } from "@/lib/data-connector";
import { listSyncStatus } from "@/lib/sync-status";
import type {
  AhiAnomalyRecord,
  AhiCategory,
  AhiDistribution,
  AhiParameterResult,
  AhiResult,
  AhiSectionKey,
  AhiSectionSummary,
  AhiSnapshot,
  StatusLevel,
} from "@/types";

const SOURCE = dataSources.ahiPerformance;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

// Each category block occupies 7 columns (name/label + 6 data columns); three
// blocks sit side by side per "row group" at these start columns (A, I, Q —
// H and P are always-blank spacer columns between them). AHI TRAFO / AHI
// REAKTOR use only the first two of these (their own block spans the same
// 7-column width, just not tiled 3-wide).
const BLOCK_START_COLUMNS = [0, 8, 16];

// AM:BA column positions (0-indexed) — verified against the sheet's own row 2
// header text, not assumed. AM=38 ("No") through BA=52 ("Target Waktu").
const AMBA = {
  no: 38,
  ultg: 39,
  gi: 40,
  bay: 41,
  jenisAset: 42,
  fasa: 43,
  merk: 44,
  keterangan: 45,
  kategoriAhi: 46,
  parameterPemicuAhi: 47,
  parameterAhi2: 48,
  kategoriAhiVsSkdir: 49,
  subSistem: 50,
  rencanaTindakLanjut: 51,
  targetWaktu: 52,
};

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function cellNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const text = cellText(v);
  if (!text) return null;
  const cleaned = text.replace(/%/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function formatTime(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
}

interface ParsedBlock {
  jumlahDataTercatat: number | null;
  kualitasData: number | null;
  score: number | null;
  distribution: AhiDistribution;
  parameters: AhiParameterResult[];
}

/**
 * Parses one category block starting at the cell holding its name (e.g.
 * "AHI PMS" at row R, col A). Structure, verified against the live sheet:
 *   R+0: category name
 *   R+1: "Akurasi Data" (section label, not read)
 *   R+2: "Jumlah Data Tercatat" | value
 *   R+3: "Kualitas Data" | value
 *   R+4: "Pengujian" | "Kosong" | "1-Best" | "2-Good" | "3-Fair" | "4-Poor" | "5-Critical" (sub-header)
 *   R+5..: one row per parameter, until a row whose name cell is "Score AHI"
 *   then: "1-Best".."5-Critical", each with its count in col+1; the overall
 *   score is a cell merged across those 5 rows in col+3, so it only appears
 *   non-blank on the first of them — scanned defensively across all 5.
 * Parameter count varies per category (5 for AHI PMS, 28 for AHI TRAFO, ...),
 * so this walks forward until "Score AHI" rather than assuming a fixed length.
 * Returns null if the row 2 below `row` isn't "Jumlah Data Tercatat" — used
 * to reject a category name's *decorative* appearance (AHI TRAFO/REAKTOR
 * each appear once as a bare section divider before their real block).
 */
function parseBlock(rows: unknown[][], row: number, col: number): ParsedBlock | null {
  if (cellText(rows[row + 2]?.[col]) !== "Jumlah Data Tercatat") return null;

  const jumlahDataTercatat = cellNumber(rows[row + 2]?.[col + 1]);
  const kualitasData = cellNumber(rows[row + 3]?.[col + 1]);

  const parameters: AhiParameterResult[] = [];
  let r = row + 5;
  let scoreAhiRow = -1;
  const maxScan = row + 5 + 60; // generous bound — longest real block (AHI TRAFO) has 28 parameter rows
  while (r < rows.length && r < maxScan) {
    const name = cellText(rows[r]?.[col]);
    if (name === "Score AHI") {
      scoreAhiRow = r;
      break;
    }
    // A shorter category block (e.g. AHI LA's 4 parameters vs AHI CT's 6, in
    // the same row group) is padded with blank rows so every block in the
    // group reaches its own "Score AHI" label at a shared row — skip the
    // padding rather than stopping at the first blank cell.
    if (name) {
      parameters.push({
        name,
        kosong: cellNumber(rows[r]?.[col + 1]),
        best: cellNumber(rows[r]?.[col + 2]),
        good: cellNumber(rows[r]?.[col + 3]),
        fair: cellNumber(rows[r]?.[col + 4]),
        poor: cellNumber(rows[r]?.[col + 5]),
        critical: cellNumber(rows[r]?.[col + 6]),
      });
    }
    r += 1;
  }

  const distribution: AhiDistribution = { best: null, good: null, fair: null, poor: null, critical: null };
  let score: number | null = null;
  if (scoreAhiRow >= 0) {
    const levelRows: (keyof AhiDistribution)[] = ["best", "good", "fair", "poor", "critical"];
    levelRows.forEach((level, index) => {
      const levelRow = scoreAhiRow + 1 + index;
      distribution[level] = cellNumber(rows[levelRow]?.[col + 1]);
      if (score === null) {
        const maybeScore = cellNumber(rows[levelRow]?.[col + 3]);
        if (maybeScore !== null) score = maybeScore;
      }
    });
  }

  return { jumlahDataTercatat, kualitasData, score, distribution, parameters };
}

function findAndParseCategory(rows: unknown[][], displayName: string): ParsedBlock | null {
  for (let r = 0; r < rows.length; r++) {
    for (const col of BLOCK_START_COLUMNS) {
      if (cellText(rows[r]?.[col]) === displayName) {
        const parsed = parseBlock(rows, r, col);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

// Derived from the sheet's own Best/Good/Fair/Poor/Critical distribution —
// not an invented score-percentage threshold (no such threshold is stated
// anywhere in the source; see Phase 3B report, "Business Logic Requires
// Confirmation"). Any Critical finding is critical; any Poor (with none
// Critical) is a warning; otherwise good. No data at all is "none".
function statusFromDistribution(dist: AhiDistribution): StatusLevel {
  if (dist.critical === null && dist.poor === null && dist.best === null && dist.good === null && dist.fair === null) {
    return "none";
  }
  if ((dist.critical ?? 0) > 0) return "critical";
  if ((dist.poor ?? 0) > 0) return "warning";
  return "good";
}

function buildCategories(rows: unknown[][], warnings: string[]): AhiCategory[] {
  return AHI_CATEGORY_DEFS.map((def): AhiCategory => {
    const parsed = findAndParseCategory(rows, def.displayName);
    if (!parsed) {
      warnings.push(`Kategori "${def.displayName}" tidak ditemukan pada sheet "${EXPECTED_SHEET}" periode ini.`);
      return {
        key: def.key,
        displayName: def.displayName,
        section: def.section,
        jumlahDataTercatat: null,
        kualitasData: null,
        score: null,
        distribution: { best: null, good: null, fair: null, poor: null, critical: null },
        parameters: [],
        status: "none",
      };
    }
    return {
      key: def.key,
      displayName: def.displayName,
      section: def.section,
      jumlahDataTercatat: parsed.jumlahDataTercatat,
      kualitasData: parsed.kualitasData,
      score: parsed.score,
      distribution: parsed.distribution,
      parameters: parsed.parameters,
      status: statusFromDistribution(parsed.distribution),
    };
  });
}

function buildSections(categories: AhiCategory[]): AhiSectionSummary[] {
  const sectionKeys: AhiSectionKey[] = ["mtu", "catu-daya", "trafo", "reaktor"];
  return sectionKeys.map((key): AhiSectionSummary => {
    const members = categories.filter((c) => c.section === key);
    const scores = members.map((c) => c.score).filter((s): s is number => s !== null);
    // AHI TRAFO/REAKTOR are single-category sections — their "aggregate" IS
    // the category's own score. AHI MTU/CATU DAYA have no section-level
    // aggregate anywhere in the sheet (verified during inspection), so per
    // the "source value > calculated value" principle this falls back to a
    // simple mean of the member categories' own (source) scores.
    const score = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
    const statuses = members.map((c) => c.status);
    const status: StatusLevel = statuses.includes("critical")
      ? "critical"
      : statuses.includes("warning")
        ? "warning"
        : statuses.includes("good")
          ? "good"
          : "none";
    return { key, displayName: AHI_SECTION_META[key].displayName, score, status, categories: members };
  });
}

function parseAnomalies(rows: unknown[][]): AhiAnomalyRecord[] {
  const records: AhiAnomalyRecord[] = [];
  // Row index 0 = "REKAP ANOMALI..." title, index 1 = column headers — data starts at index 2.
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const ultg = cellText(row?.[AMBA.ultg]);
    const kategoriAhi = cellNumber(row?.[AMBA.kategoriAhi]);
    // A row missing both its ULTG and its AHI category isn't a real anomaly
    // record — trailing template rows in this range have neither (see report).
    if (!ultg || kategoriAhi === null) continue;
    records.push({
      no: cellNumber(row?.[AMBA.no]) ?? records.length + 1,
      ultg,
      gi: cellText(row?.[AMBA.gi]),
      bay: cellText(row?.[AMBA.bay]),
      jenisAset: cellText(row?.[AMBA.jenisAset]),
      fasa: cellText(row?.[AMBA.fasa]),
      merk: cellText(row?.[AMBA.merk]),
      keterangan: cellText(row?.[AMBA.keterangan]),
      kategoriAhi,
      parameterPemicuAhi: cellText(row?.[AMBA.parameterPemicuAhi]),
      parameterAhi2: cellText(row?.[AMBA.parameterAhi2]),
      kategoriAhiVsSkdir: cellText(row?.[AMBA.kategoriAhiVsSkdir]),
      subSistem: cellText(row?.[AMBA.subSistem]),
      rencanaTindakLanjut: cellText(row?.[AMBA.rencanaTindakLanjut]),
      targetWaktu: cellText(row?.[AMBA.targetWaktu]),
    });
  }
  return records;
}

export async function getAhiPerformance(): Promise<AhiResult> {
  const results = await readConfiguredSourceRaw(SOURCE);

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
  const categories = buildCategories(sheetResult.rows, warnings);
  const sections = buildSections(categories);
  const anomalies = parseAnomalies(sheetResult.rows);

  const syncEntry = listSyncStatus().find((entry) => entry.file === EXPECTED_FILE && entry.sheet === EXPECTED_SHEET);

  const snapshot: AhiSnapshot = {
    sections,
    anomalies,
    lastUpdate: formatTime(syncEntry?.lastSync ?? null),
    warnings,
  };

  return { data: snapshot, error: null };
}
