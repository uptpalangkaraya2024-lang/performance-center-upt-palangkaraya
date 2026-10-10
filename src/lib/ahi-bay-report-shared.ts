import "server-only";

import type { DataSourceConfig } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type {
  AhiKlasifikasi,
  BayEquipmentParameter,
  BayEquipmentUnit,
  BayLineOption,
  BayLineReport,
  EquipmentHistoryPoint,
  EquipmentParameterHistoryPoint,
} from "@/types";

// Generic per-bay AHI report engine, shared by the Bay Line report
// (src/services/ahi-bay-line-report.ts) and the Bay Trafo report
// (src/services/ahi-bay-trafo-report.ts) — both read the SAME kind of
// Input sheet (2-row header: group label + sub-label, one row per
// equipment unit or one row per phase), just a different set of sheets and
// a different BAY-column prefix ("BAY LINE " vs "BAY TRAFO "). Everything
// below is config-driven (no "line" or "trafo" assumption anywhere in this
// file) so a 3rd bay kind (Bay GT, Bus, Kapasitor, ...) only needs a new
// EquipmentTypeConfig list + createBayReportService() call, never a copy of
// this logic. BayLineOption/BayLineReport are reused as-is for Bay Trafo
// too (both shapes are already bay-kind-agnostic — gi/bay/ultg/units).

export interface SheetGrid {
  row1: unknown[];
  row2: unknown[];
  dataRows: unknown[][];
}

export function toGrid(rawRows: unknown[][]): SheetGrid {
  return { row1: rawRows[0] ?? [], row2: rawRows[1] ?? [], dataRows: rawRows.slice(2) };
}

export function textAt(row: unknown[] | undefined, col: number): string {
  if (!row || col < 0 || col >= row.length) return "";
  return String(row[col] ?? "").trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Exact match (whitespace-normalized) against row 1's own label text. */
export function findCol(row1: unknown[], label: string): number {
  const needle = normalize(label);
  return row1.findIndex((c) => normalize(String(c ?? "")) === needle);
}

/** Prefix match — needed for Input CT's own multi-line "TECHIDENT NUMBER /
 *  TID / NO di PST" header, which every other sheet just calls "TECHIDENT NUMBER". */
export function findColStartsWith(row1: unknown[], prefix: string): number {
  const needle = normalize(prefix);
  return row1.findIndex((c) => normalize(String(c ?? "")).startsWith(needle));
}

/** A group's row 1 cell holds the label; the sub-columns that belong to it
 *  are blank in row 1 up to the next labeled column — read generically
 *  instead of hardcoding a column count that could silently drift if the
 *  sheet gains or loses a sub-column. */
export function groupCols(row1: unknown[], startCol: number): number[] {
  if (startCol < 0) return [];
  const cols = [startCol];
  for (let c = startCol + 1; c < row1.length; c++) {
    if (textAt(row1, c) !== "") break;
    cols.push(c);
  }
  return cols;
}

/** Exact match against row 2's own sub-label first (the specific reading a
 *  raw group fans out into, e.g. "Purity (%)" / "Dew Point (deg Celcius)" /
 *  "SO2 (ppmv)" all sharing one "Pengujian SF6" row 1 group), falling back
 *  to row 1 for a single-column group with no distinct sub-label. */
export function findAnyLabelCol(row1: unknown[], row2: unknown[], label: string): number {
  const needle = normalize(label);
  const inRow2 = row2.findIndex((c) => normalize(String(c ?? "")) === needle);
  if (inRow2 !== -1) return inRow2;
  return row1.findIndex((c) => normalize(String(c ?? "")) === needle);
}

const LEGEND: Record<number, AhiKlasifikasi> = { 1: "BEST", 2: "GOOD", 3: "FAIR", 4: "POOR", 5: "CRITICAL" };

export function classify(score: number | null): AhiKlasifikasi {
  if (score === null) return "NO DATA";
  return LEGEND[score] ?? "NO DATA";
}

export function parseScore(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function extractDateOnly(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return m ? m[1] : null;
}

function yearsSince(dateISO: string | null, todayISO: string): number | null {
  if (!dateISO) return null;
  const y1 = Number(dateISO.slice(0, 4));
  const y2 = Number(todayISO.slice(0, 4));
  if (!Number.isFinite(y1) || !Number.isFinite(y2)) return null;
  return y2 - y1;
}

// Exact formulas confirmed against the live sheet (user-provided):
//   Mandatory Pengujian = AND(klasifikasi == "NO DATA", ageYears < 2)
//   Pengujian Ulang     = OR(klasifikasi in {POOR, CRITICAL}, ageYears >= 2)
// ageYears is null when TANGGAL PEMELIHARAAN TERAKHIR is missing — the
// age-based branch is then simply skipped rather than guessed in either
// direction (never fabricate).
function computeFlags(klasifikasi: AhiKlasifikasi, ageYears: number | null): { mandatory: boolean; retest: boolean } {
  const mandatory = klasifikasi === "NO DATA" && ageYears !== null && ageYears < 2;
  const retest = klasifikasi === "POOR" || klasifikasi === "CRITICAL" || (ageYears !== null && ageYears >= 2);
  return { mandatory, retest };
}

// One Evaluasi AHI parameter (e.g. "Tahanan Isolasi") is derived from one or
// more raw measurement columns elsewhere in the same sheet — mapped
// explicitly per equipment type rather than guessed.
export type RawSource =
  | { kind: "group"; label: string } // row 1 group label — use every one of its sub-columns
  | { kind: "single"; label: string }; // one exact row 1 or row 2 label — use just that column

export interface EquipmentTypeConfig {
  sheetName: string;
  /** Fixed section title, when every row of this sheet is the same kind of equipment. */
  roleFixed?: string;
  /** Column holding the role text instead — only Input PMS needs this
   *  ("Keterangan Alat": "DS LINE" / "DS BUS A" / "DS BUS B" — a bay can
   *  legitimately have 2 or 3 of these depending on its GI's busbar
   *  configuration, never assumed to always be 3). */
  roleColumnLabel?: string;
  /** true: one row per phase (R/S/T) that must be grouped by equipment and
   *  pivoted. false: already wide — one row is the whole equipment. */
  phasePivot: boolean;
  /** Evaluasi AHI labels dropped entirely for this equipment type — never
   *  built into a parameter, so absent from the table, the Resume
   *  breakdown, and the trend filter dropdown. */
  excludeParameterLabels?: string[];
  /** Merges several independently-scored Evaluasi AHI columns into one
   *  displayed parameter (worst score of the group wins, same worst-case
   *  rule used everywhere else in this file). */
  mergeParameterLabels?: { into: string; from: string[] }[];
  /** Keeps only rows whose resolved role text passes this predicate — added
   *  for the Bay Trafo report's own Input PMS config, which must include
   *  "DS BUS A"/"DS BUS B" but exclude any "DS LINE" row that happens to
   *  share a BAY TRAFO value (confirmed live: a handful of such rows exist
   *  in the source sheet — data entry mistakes, not real Bay Trafo
   *  equipment). Absent means "every row for this bay," the original
   *  behavior. */
  roleFilter?: (role: string) => boolean;
  /** Which raw measurement column(s) feed each displayed parameter label —
   *  was a module-level dict keyed by sheet name; now lives directly on the
   *  config it belongs to, since every config already identifies its own
   *  sheet. */
  rawMappings?: Record<string, RawSource[]>;
}

function extractRawReadings(
  groupRows: unknown[][],
  row1: unknown[],
  row2: unknown[],
  phasaCol: number,
  phasePivot: boolean,
  sources: RawSource[],
): { label: string; r: string | number | null; s: string | number | null; t: string | number | null }[] {
  const readByPhase = (col: number, phasaValue: string) => {
    const row = groupRows.find((r) => textAt(r, phasaCol) === phasaValue);
    return row ? (row[col] as string | number | null) : null;
  };
  const readSingleRow = (col: number) => (groupRows[0]?.[col] as string | number | null) ?? null;

  const pushOne = (
    out: { label: string; r: string | number | null; s: string | number | null; t: string | number | null }[],
    label: string,
    col: number,
  ) => {
    if (col === -1) return;
    if (phasePivot) {
      out.push({ label, r: readByPhase(col, "R"), s: readByPhase(col, "S"), t: readByPhase(col, "T") });
    } else {
      out.push({ label, r: readSingleRow(col), s: null, t: null });
    }
  };

  const readings: { label: string; r: string | number | null; s: string | number | null; t: string | number | null }[] = [];
  for (const source of sources) {
    if (source.kind === "single") {
      pushOne(readings, source.label, findAnyLabelCol(row1, row2, source.label));
    } else {
      const startCol = findCol(row1, source.label);
      for (const col of groupCols(row1, startCol)) {
        pushOne(readings, textAt(row2, col) || textAt(row1, col), col);
      }
    }
  }
  return readings;
}

function roleSortKeyFactory(roleOrder: string[]): (role: string) => number {
  return (role: string) => {
    const idx = roleOrder.indexOf(role);
    return idx === -1 ? roleOrder.length : idx;
  };
}

/** This unit's own Riwayat rows, grouped by exact TANGGAL PEMELIHARAAN
 *  TERAKHIR (every row sharing that date is one test event, e.g. all R/S/T
 *  phases tested together), oldest first. Shared by both the unit-level
 *  and per-parameter history builders below so the bay/role/techident
 *  filtering only happens once per unit. */
function groupHistoryRowsByDate(
  historyGrid: SheetGrid,
  bay: string,
  config: EquipmentTypeConfig,
  unit: { role: string; techident: string | null },
): { tanggal: string; rows: unknown[][] }[] {
  const { row1, dataRows } = historyGrid;
  const bayCol = findCol(row1, "BAY");
  const techCol = findColStartsWith(row1, "TECHIDENT");
  const tglCol = findCol(row1, "TANGGAL PEMELIHARAAN TERAKHIR");
  const keteranganCol = config.roleColumnLabel ? findCol(row1, config.roleColumnLabel) : findColStartsWith(row1, "KETERANGAN");
  if (bayCol === -1 || tglCol === -1) return [];

  let rowsForUnit = dataRows.filter((r) => textAt(r, bayCol) === bay);
  if (config.roleColumnLabel) {
    rowsForUnit = rowsForUnit.filter((r) => textAt(r, keteranganCol) === unit.role);
  } else if (!config.phasePivot && unit.techident) {
    rowsForUnit = rowsForUnit.filter((r) => textAt(r, techCol) === unit.techident);
  }

  const byDate = new Map<string, unknown[][]>();
  for (const row of rowsForUnit) {
    const tanggal = extractDateOnly(row[tglCol]);
    if (!tanggal) continue;
    const list = byDate.get(tanggal) ?? [];
    list.push(row);
    byDate.set(tanggal, list);
  }
  return [...byDate.entries()].map(([tanggal, rows]) => ({ tanggal, rows })).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

function buildHistoryForUnit(
  historyGrid: SheetGrid | undefined,
  bay: string,
  config: EquipmentTypeConfig,
  unit: { role: string; techident: string | null },
): EquipmentHistoryPoint[] {
  if (!historyGrid) return [];
  const skorAhiCol = findCol(historyGrid.row1, "Skor AHI");
  if (skorAhiCol === -1) return [];

  return groupHistoryRowsByDate(historyGrid, bay, config, unit).map(({ tanggal, rows }) => {
    let worst: number | null = null;
    for (const row of rows) {
      const score = parseScore(row[skorAhiCol]);
      if (score !== null && (worst === null || score > worst)) worst = score;
    }
    return { tanggal, skorAhi: worst, klasifikasi: classify(worst) };
  });
}

function buildParameterHistoryForUnit(
  historyGrid: SheetGrid | undefined,
  bay: string,
  config: EquipmentTypeConfig,
  unit: { role: string; techident: string | null },
  sourceLabels: string[],
  rawSources: RawSource[],
): EquipmentParameterHistoryPoint[] {
  if (!historyGrid) return [];
  const { row1, row2 } = historyGrid;
  const phasaCol = findCol(row1, "PHASA");
  const evalStart = findCol(row1, "Evaluasi AHI");
  const evalCols = groupCols(row1, evalStart);
  const evalLabels = evalCols.map((c) => textAt(row2, c) || textAt(row1, c));
  const targetCols = sourceLabels
    .map((label) => evalCols[evalLabels.indexOf(label)])
    .filter((c): c is number => c !== undefined && c !== -1);
  if (targetCols.length === 0) return [];

  return groupHistoryRowsByDate(historyGrid, bay, config, unit).map(({ tanggal, rows }) => {
    let worst: number | null = null;
    for (const row of rows) {
      for (const col of targetCols) {
        const score = parseScore(row[col]);
        if (score !== null && (worst === null || score > worst)) worst = score;
      }
    }
    const rawReadings = extractRawReadings(rows, row1, row2, phasaCol, config.phasePivot, rawSources);
    return { tanggal, skorAhi: worst, klasifikasi: classify(worst), rawReadings };
  });
}

/** Resolves the sheet's raw Evaluasi AHI columns into the parameters that
 *  actually get displayed for this equipment type — most labels pass
 *  through 1:1, but config.excludeParameterLabels drops some entirely and
 *  config.mergeParameterLabels folds several into one. */
function resolveParameterGroups(
  evalLabels: string[],
  evalCols: number[],
  config: EquipmentTypeConfig,
): { label: string; cols: number[]; sourceLabels: string[] }[] {
  const exclude = new Set(config.excludeParameterLabels ?? []);
  const mergeTarget = new Map<string, string>();
  for (const m of config.mergeParameterLabels ?? []) {
    for (const from of m.from) mergeTarget.set(from, m.into);
  }

  const groups = new Map<string, { cols: number[]; sourceLabels: string[] }>();
  for (let i = 0; i < evalLabels.length; i++) {
    const label = evalLabels[i];
    if (exclude.has(label)) continue;
    const outputLabel = mergeTarget.get(label) ?? label;
    const group = groups.get(outputLabel) ?? { cols: [], sourceLabels: [] };
    group.cols.push(evalCols[i]);
    group.sourceLabels.push(label);
    groups.set(outputLabel, group);
  }
  return [...groups.entries()].map(([label, g]) => ({ label, cols: g.cols, sourceLabels: g.sourceLabels }));
}

function parseUnitsForBay(
  grid: SheetGrid,
  bay: string,
  config: EquipmentTypeConfig,
  todayISO: string,
  roleOrder: string[],
  historyGrid?: SheetGrid,
): BayEquipmentUnit[] {
  const { row1, row2, dataRows } = grid;
  const bayCol = findCol(row1, "BAY");
  const techCol = findColStartsWith(row1, "TECHIDENT");
  const nomorSeriCol = findCol(row1, "NOMOR SERI");
  const merkCol = findCol(row1, "MERK");
  const typeCol = findCol(row1, "TYPE");
  const tglCol = findCol(row1, "TANGGAL PEMELIHARAAN TERAKHIR");
  const skorAhiCol = findCol(row1, "Skor AHI");
  const kualitasDataCol = findCol(row1, "Kualitas Data");
  const tindakLanjutCol = findColStartsWith(row1, "TINDAK LANJUT");
  const sourceLinkCol = findCol(row1, "SOURCE LINK");
  const keteranganCol = config.roleColumnLabel ? findCol(row1, config.roleColumnLabel) : findColStartsWith(row1, "KETERANGAN");

  const evalStart = findCol(row1, "Evaluasi AHI");
  const evalCols = groupCols(row1, evalStart);
  const evalLabels = evalCols.map((c) => textAt(row2, c) || textAt(row1, c));
  const phasaCol = findCol(row1, "PHASA");

  let rowsForBay = dataRows.filter((r) => textAt(r, bayCol) === bay);
  if (config.roleFilter) {
    rowsForBay = rowsForBay.filter((r) =>
      config.roleFilter!(config.roleColumnLabel ? textAt(r, keteranganCol) : config.roleFixed ?? ""),
    );
  }
  if (rowsForBay.length === 0) return [];

  // Group rows into one equipment unit each:
  //  - phase-pivoted: every row for this bay is the SAME logical unit's
  //    R/S/T phase — merged into a single group.
  //  - not phase-pivoted: each row already is its own complete unit, never
  //    merged with another row.
  const groups = new Map<string, unknown[][]>();
  rowsForBay.forEach((row, idx) => {
    const key = config.phasePivot ? "unit" : `row-${idx}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  });

  const roleSortKey = roleSortKeyFactory(roleOrder);
  const units: BayEquipmentUnit[] = [];
  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    const role = config.roleColumnLabel ? textAt(first, keteranganCol) || "—" : (config.roleFixed ?? "—");
    const techident = textAt(first, techCol) || null;
    const unitIdentity = { role, techident };
    const tanggal = extractDateOnly(first[tglCol]);
    const ageYears = yearsSince(tanggal, todayISO);

    const parameterGroups = resolveParameterGroups(evalLabels, evalCols, config);
    const parameters: BayEquipmentParameter[] = parameterGroups.map(({ label, cols, sourceLabels }, i) => {
      const primaryCol = cols[0];
      let worst: number | null = null;
      for (const row of groupRows) {
        for (const col of cols) {
          const score = parseScore(row[col]);
          if (score !== null && (worst === null || score > worst)) worst = score;
        }
      }
      const klasifikasi = classify(worst);
      const { mandatory, retest } = computeFlags(klasifikasi, ageYears);
      const byPhase = (phasaValue: string) => {
        const row = groupRows.find((r) => textAt(r, phasaCol) === phasaValue);
        return row ? (row[primaryCol] as string | number | null) : null;
      };
      const rawSources = config.rawMappings?.[label] ?? [];
      const rawReadings = extractRawReadings(groupRows, row1, row2, phasaCol, config.phasePivot, rawSources);
      const paramLabel = label || `Parameter ${i + 1}`;
      return {
        label: paramLabel,
        r: config.phasePivot ? byPhase("R") : worst,
        s: config.phasePivot ? byPhase("S") : null,
        t: config.phasePivot ? byPhase("T") : null,
        skorAhi: worst,
        klasifikasi,
        mandatoryPengujian: mandatory,
        pengujianUlang: retest,
        rawReadings,
        history: buildParameterHistoryForUnit(historyGrid, bay, config, unitIdentity, sourceLabels, rawSources),
      };
    });

    const skorAhiOverall = parseScore(first[skorAhiCol]);
    units.push({
      role,
      merk: textAt(first, merkCol) || null,
      type: textAt(first, typeCol) || null,
      nomorSeri: textAt(first, nomorSeriCol) || null,
      techident,
      tanggalPemeliharaanTerakhir: tanggal,
      skorAhi: skorAhiOverall,
      klasifikasi: classify(skorAhiOverall),
      kualitasData: parseScore(first[kualitasDataCol]),
      tindakLanjut: textAt(first, tindakLanjutCol) || null,
      keterangan: textAt(first, keteranganCol) || null,
      sourceLink: textAt(first, sourceLinkCol) || null,
      parameters,
      history: buildHistoryForUnit(historyGrid, bay, config, unitIdentity),
    });
  }

  return units.sort((a, b) => roleSortKey(a.role) - roleSortKey(b.role));
}

export function getJakartaTodayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export interface BayReportModuleConfig {
  source: DataSourceConfig;
  historySource: DataSourceConfig;
  equipmentTypes: EquipmentTypeConfig[];
  /** Input sheet name -> its matching Riwayat sheet name. An equipment type
   *  with no entry here simply gets an empty `history` — never an error
   *  (e.g. Bay Trafo's "Input Trafo"/"Input NGR" have no Riwayat sheet yet). */
  historySheetMap: Record<string, string>;
  /** Only BAY-column values starting with this (case-sensitive, matches the
   *  sheet's own convention) belong to this report — e.g. "BAY LINE" or
   *  "BAY TRAFO". */
  bayPrefix: string;
  roleOrder: string[];
}

/** Builds one bay-kind's full report service (options/report/all-reports,
 *  with-and-without history) from a config — see this file's own top
 *  comment for why this is config-driven rather than copy-pasted per bay
 *  kind. */
export function createBayReportService(moduleConfig: BayReportModuleConfig) {
  const FILE = moduleConfig.source.sources[0].file;
  const HISTORY_FILE = moduleConfig.historySource.sources[0].file;
  const roleSortKey = roleSortKeyFactory(moduleConfig.roleOrder);

  async function loadGrids(): Promise<Map<string, SheetGrid>> {
    const results = await readConfiguredSourceRaw(moduleConfig.source);
    const grids = new Map<string, SheetGrid>();
    for (const config of moduleConfig.equipmentTypes) {
      const sheetResult = results.find((r) => r.file === FILE && r.sheet === config.sheetName);
      if (sheetResult) grids.set(config.sheetName, toGrid(sheetResult.rows));
    }
    return grids;
  }

  async function loadHistoryGrids(): Promise<Map<string, SheetGrid>> {
    const results = await readConfiguredSourceRaw(moduleConfig.historySource);
    const grids = new Map<string, SheetGrid>();
    for (const [inputSheetName, historySheetName] of Object.entries(moduleConfig.historySheetMap)) {
      const sheetResult = results.find((r) => r.file === HISTORY_FILE && r.sheet === historySheetName);
      if (sheetResult) grids.set(inputSheetName, toGrid(sheetResult.rows));
    }
    return grids;
  }

  function bayOptionsFromGrids(grids: Map<string, SheetGrid>): BayLineOption[] {
    const seen = new Map<string, BayLineOption>();
    for (const config of moduleConfig.equipmentTypes) {
      const grid = grids.get(config.sheetName);
      if (!grid) continue;
      const giCol = findCol(grid.row1, "GARDU INDUK");
      const bayCol = findCol(grid.row1, "BAY");
      const ultgCol = findCol(grid.row1, "ULTG");
      for (const row of grid.dataRows) {
        const bay = textAt(row, bayCol);
        if (!bay.startsWith(moduleConfig.bayPrefix)) continue;
        if (!seen.has(bay)) {
          seen.set(bay, { bay, gi: textAt(row, giCol), ultg: textAt(row, ultgCol) });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.bay.localeCompare(b.bay));
  }

  function buildReportFromGrids(
    grids: Map<string, SheetGrid>,
    option: BayLineOption,
    todayISO: string,
    historyGrids?: Map<string, SheetGrid>,
  ): BayLineReport {
    const units: BayEquipmentUnit[] = [];
    for (const config of moduleConfig.equipmentTypes) {
      const grid = grids.get(config.sheetName);
      if (!grid) continue;
      units.push(
        ...parseUnitsForBay(grid, option.bay, config, todayISO, moduleConfig.roleOrder, historyGrids?.get(config.sheetName)),
      );
    }
    return { gi: option.gi, bay: option.bay, ultg: option.ultg, units: units.sort((a, b) => roleSortKey(a.role) - roleSortKey(b.role)) };
  }

  async function getOptions(): Promise<BayLineOption[]> {
    const grids = await loadGrids();
    return bayOptionsFromGrids(grids);
  }

  async function getReport(bay: string): Promise<BayLineReport | null> {
    const grids = await loadGrids();
    const option = bayOptionsFromGrids(grids).find((o) => o.bay === bay);
    if (!option) return null;
    return buildReportFromGrids(grids, option, getJakartaTodayISO());
  }

  async function getAllReports(): Promise<BayLineReport[]> {
    const grids = await loadGrids();
    const todayISO = getJakartaTodayISO();
    return bayOptionsFromGrids(grids).map((option) => buildReportFromGrids(grids, option, todayISO));
  }

  async function getAllReportsWithHistory(): Promise<BayLineReport[]> {
    const [grids, historyGrids] = await Promise.all([loadGrids(), loadHistoryGrids()]);
    const todayISO = getJakartaTodayISO();
    return bayOptionsFromGrids(grids).map((option) => buildReportFromGrids(grids, option, todayISO, historyGrids));
  }

  return { getOptions, getReport, getAllReports, getAllReportsWithHistory };
}
