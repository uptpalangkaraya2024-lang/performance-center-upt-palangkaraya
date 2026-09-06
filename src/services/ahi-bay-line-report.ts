import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { AhiKlasifikasi, BayEquipmentParameter, BayEquipmentUnit, BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const FILE = SOURCE.sources[0].file;

// Every Input sheet has a 2-row header (row 1 = group label spanning several
// sub-columns, row 2 = the actual per-parameter/per-phase sub-label) — same
// reason HI UPT needs readSheetRaw instead of the header-keyed reader (a
// single header row can't uniquely name every column here).
interface SheetGrid {
  row1: unknown[];
  row2: unknown[];
  dataRows: unknown[][];
}

function textAt(row: unknown[] | undefined, col: number): string {
  if (!row || col < 0 || col >= row.length) return "";
  return String(row[col] ?? "").trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Exact match (whitespace-normalized) against row 1's own label text. */
function findCol(row1: unknown[], label: string): number {
  const needle = normalize(label);
  return row1.findIndex((c) => normalize(String(c ?? "")) === needle);
}

/** Prefix match — needed for Input CT's own multi-line "TECHIDENT NUMBER /
 *  TID / NO di PST" header, which every other sheet just calls "TECHIDENT NUMBER". */
function findColStartsWith(row1: unknown[], prefix: string): number {
  const needle = normalize(prefix);
  return row1.findIndex((c) => normalize(String(c ?? "")).startsWith(needle));
}

/** A group's row 1 cell holds the label; the sub-columns that belong to it
 *  are blank in row 1 up to the next labeled column — read generically
 *  instead of hardcoding a column count that could silently drift if the
 *  sheet gains or loses a sub-column. */
function groupCols(row1: unknown[], startCol: number): number[] {
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
function findAnyLabelCol(row1: unknown[], row2: unknown[], label: string): number {
  const needle = normalize(label);
  const inRow2 = row2.findIndex((c) => normalize(String(c ?? "")) === needle);
  if (inRow2 !== -1) return inRow2;
  return row1.findIndex((c) => normalize(String(c ?? "")) === needle);
}

function toGrid(rawRows: unknown[][]): SheetGrid {
  return { row1: rawRows[0] ?? [], row2: rawRows[1] ?? [], dataRows: rawRows.slice(2) };
}

const LEGEND: Record<number, AhiKlasifikasi> = { 1: "BEST", 2: "GOOD", 3: "FAIR", 4: "POOR", 5: "CRITICAL" };

function classify(score: number | null): AhiKlasifikasi {
  if (score === null) return "NO DATA";
  return LEGEND[score] ?? "NO DATA";
}

function parseScore(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function extractDateOnly(raw: unknown): string | null {
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

interface EquipmentTypeConfig {
  sheetName: string;
  /** Fixed section title, when every row of this sheet is the same kind of equipment. */
  roleFixed?: string;
  /** Column holding the role text instead — only Input PMS needs this
   *  ("Keterangan Alat": "DS LINE" / "DS BUS A" / "DS BUS B" — a bay can
   *  legitimately have 2 or 3 of these depending on its GI's busbar
   *  configuration, never assumed to always be 3). */
  roleColumnLabel?: string;
  /** true: one row per phase (R/S/T) that must be grouped by equipment and
   *  pivoted. false: already wide — one row is the whole equipment (Input PMT). */
  phasePivot: boolean;
}

const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  // PMS's own PHASA column reads "RST" (already combined) — confirmed
  // against live data — one row is one complete role (DS LINE / DS BUS A /
  // DS BUS B), not one phase, unlike LA/PT/CT below.
  { sheetName: "Input PMS", roleColumnLabel: "Keterangan Alat", phasePivot: false },
  // LA/PT/CT: confirmed each phase (R/S/T) is its own row with its OWN
  // distinct TECHIDENT NUMBER (one physical device per phase, not one
  // 3-phase device sharing an ID) — grouping must merge every row for the
  // bay into one logical unit, not split further by techident.
  { sheetName: "Input LA", roleFixed: "Lightning Arrester", phasePivot: true },
  { sheetName: "Input PT", roleFixed: "Capacitive Voltage Transformer", phasePivot: true },
  { sheetName: "Input PMT", roleFixed: "Circuit Breaker", phasePivot: false },
  { sheetName: "Input CT", roleFixed: "Current Transformer", phasePivot: true },
];

// One Evaluasi AHI parameter (e.g. "Tahanan Isolasi") is derived from one or
// more raw measurement columns elsewhere in the same sheet — mapped
// explicitly per equipment type below rather than guessed, since a single
// row 1 group sometimes fans out into several distinct Evaluasi AHI
// parameters (Input PMT's one "Pengujian SF6" group covers Purity, Dew
// Point, and SO2 separately).
type RawSource =
  | { kind: "group"; label: string } // row 1 group label — use every one of its sub-columns
  | { kind: "single"; label: string }; // one exact row 1 or row 2 label — use just that column

const RAW_MAPPINGS: Record<string, Record<string, RawSource[]>> = {
  "Input LA": {
    "Tahanan Isolasi": [{ kind: "group", label: "Hasil Ukur Tahanan Isolasi (Mega Ohm)" }],
    LCM: [{ kind: "group", label: "Hasil LCM (micro Ampere)" }],
    "Thermovisi Bodi LA": [{ kind: "group", label: "Thermovisi pada Bodi LA" }],
    "Kondisi visual": [{ kind: "group", label: "Inpseksi Visual #1 - Kondisi Insulator" }],
  },
  "Input PMS": {
    "Tahanan Isolasi": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi Terendah (Mega Ohm)" }],
    "Tahanan Kontak": [{ kind: "group", label: "Pengujian Tahanan Kontak (mikro Ohm)" }],
    "Thermovisi Kontak PMS": [{ kind: "group", label: "Thermovisi pada Kontak Finger/Pisau" }],
    "Kondisi penggerak": [
      { kind: "single", label: "Inspeksi Visual #2 - Kondisi penggerak" },
      { kind: "single", label: "Uji Fungsi Penggerak" },
    ],
    "Kondisi insulator": [{ kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" }],
  },
  "Input PT": {
    "Tahanan Isolasi Primer": [{ kind: "group", label: "Uji Tahanan Isolasi" }],
    "Tan Delta": [{ kind: "group", label: "Hasil Uji Tan Delta (%)" }],
    Ratio: [{ kind: "group", label: "Deviasi/ Error Hasil Uji Rasio (%)" }],
    Kapasitansi: [{ kind: "group", label: "Deviasi Hasil Uji Kapasitansi (%) khusus CVT" }],
    Thermovisi: [{ kind: "group", label: "Thermovisi Body Insulator" }],
    "Kondisi Visual": [
      { kind: "single", label: "Inspeksi Visual #4 - Spark Gap PT (shutdown inspection) jika ada" },
      { kind: "single", label: "Inspeksi Visual #3 - Terminal Sekunder PT (shutdown inspection)" },
      { kind: "single", label: "Inspeksi Visual #2 - Kebocoran PT" },
      { kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" },
    ],
  },
  "Input PMT": {
    "Tahanan Isolasi": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi Minimum (Mega Ohm)" }],
    "Tahanan Kontak": [{ kind: "group", label: "Pengujian Tahanan Kontak (mikro Ohm)" }],
    "Closing Time": [{ kind: "group", label: "Pengujian Closing Time (ms)" }],
    "Opening Time": [{ kind: "group", label: "Pengujian Opening Time (ms)" }],
    // No distinct raw column exists for Keserempakan (SKDIR/Evaluasi AHI
    // computes it) — left empty rather than guessed.
    Keserempakan: [],
    Purity: [{ kind: "single", label: "Purity (%)" }],
    "Dew Point": [{ kind: "single", label: "Dew Point (deg Celcius)" }],
    SO2: [{ kind: "single", label: "SO2 (ppmv)" }],
    Kevakuman: [{ kind: "group", label: "Pengujian Kevakuman" }],
    "BDV Minyak": [{ kind: "group", label: "Pengujian BDV Minyak Main Tank (kV/mm)" }],
    "Thermovisi Body PMT": [{ kind: "group", label: "Thermovisi Body Insulator" }],
    "Kondisi Visual": [
      { kind: "single", label: "Inspeksi Visual #2 - Kebocoran PMT" },
      { kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" },
    ],
  },
  "Input CT": {
    "Tahanan Isolasi Primer": [{ kind: "group", label: "Uji Tahanan Insulasi" }],
    "Tan Delta": [{ kind: "group", label: "Hasil Uji Tan Delta (%)" }],
    Ratio: [{ kind: "group", label: "Deviasi/ Error Hasil Uji Rasio (%)" }],
    "V knee point": [{ kind: "group", label: "Perbandingan Hasil Ukur dengan V knee Nameplate (%)" }],
    Thermovisi: [{ kind: "group", label: "Thermovisi Body Insulator" }],
    "Kondisi Visual": [
      { kind: "single", label: "Inspeksi Visual #3 - Terminal Sekunder CT (shutdown inspection)" },
      { kind: "single", label: "Inspeksi Visual #2 - Kebocoran CT" },
      { kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" },
    ],
  },
};

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

// Report sections read top-to-bottom in this fixed, human-meaningful order —
// same order the sheet's own REPORT BAY LINE uses.
const ROLE_ORDER = [
  "Lightning Arrester",
  "DS LINE",
  "Capacitive Voltage Transformer",
  "Circuit Breaker",
  "Current Transformer",
  "DS BUS A",
  "DS BUS B",
];

function roleSortKey(role: string): number {
  const idx = ROLE_ORDER.indexOf(role);
  return idx === -1 ? ROLE_ORDER.length : idx;
}

function parseUnitsForBay(grid: SheetGrid, bay: string, config: EquipmentTypeConfig, todayISO: string): BayEquipmentUnit[] {
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

  const rowsForBay = dataRows.filter((r) => textAt(r, bayCol) === bay);
  if (rowsForBay.length === 0) return [];

  // Group rows into one equipment unit each:
  //  - phase-pivoted (LA/PT/CT): every row for this bay is the SAME logical
  //    unit's R/S/T phase — one physical device per phase, each with its
  //    own distinct techident, so grouping can't key on techident. All rows
  //    for the bay merge into a single group.
  //  - not phase-pivoted (PMS/PMT): each row already is its own complete
  //    unit (PMS: one row per role DS LINE/BUS A/BUS B; PMT: one row per
  //    breaker) — never merged with another row.
  const groups = new Map<string, unknown[][]>();
  rowsForBay.forEach((row, idx) => {
    const key = config.phasePivot ? "unit" : `row-${idx}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  });

  const units: BayEquipmentUnit[] = [];
  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    const role = config.roleColumnLabel ? textAt(first, keteranganCol) || "—" : (config.roleFixed ?? "—");
    const tanggal = extractDateOnly(first[tglCol]);
    const ageYears = yearsSince(tanggal, todayISO);

    const parameters: BayEquipmentParameter[] = evalLabels.map((label, i) => {
      const col = evalCols[i];
      // Worst (max) score across every row in the group — for a
      // phase-pivoted unit this is the worst of R/S/T; for a non-pivoted
      // unit the group has exactly one row.
      let worst: number | null = null;
      for (const row of groupRows) {
        const score = parseScore(row[col]);
        if (score !== null && (worst === null || score > worst)) worst = score;
      }
      const klasifikasi = classify(worst);
      const { mandatory, retest } = computeFlags(klasifikasi, ageYears);
      const byPhase = (phasaValue: string) => {
        const row = groupRows.find((r) => textAt(r, phasaCol) === phasaValue);
        return row ? (row[col] as string | number | null) : null;
      };
      const rawSources = RAW_MAPPINGS[config.sheetName]?.[label] ?? [];
      const rawReadings = extractRawReadings(groupRows, row1, row2, phasaCol, config.phasePivot, rawSources);
      return {
        label: label || `Parameter ${i + 1}`,
        r: config.phasePivot ? byPhase("R") : (first[col] as string | number | null),
        s: config.phasePivot ? byPhase("S") : null,
        t: config.phasePivot ? byPhase("T") : null,
        skorAhi: worst,
        klasifikasi,
        mandatoryPengujian: mandatory,
        pengujianUlang: retest,
        rawReadings,
      };
    });

    const skorAhiOverall = parseScore(first[skorAhiCol]);
    units.push({
      role,
      merk: textAt(first, merkCol) || null,
      type: textAt(first, typeCol) || null,
      nomorSeri: textAt(first, nomorSeriCol) || null,
      techident: textAt(first, techCol) || null,
      tanggalPemeliharaanTerakhir: tanggal,
      skorAhi: skorAhiOverall,
      klasifikasi: classify(skorAhiOverall),
      kualitasData: parseScore(first[kualitasDataCol]),
      tindakLanjut: textAt(first, tindakLanjutCol) || null,
      keterangan: textAt(first, keteranganCol) || null,
      sourceLink: textAt(first, sourceLinkCol) || null,
      parameters,
    });
  }

  return units.sort((a, b) => roleSortKey(a.role) - roleSortKey(b.role));
}

function getJakartaTodayISO(): string {
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

async function loadGrids(): Promise<Map<string, SheetGrid>> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const grids = new Map<string, SheetGrid>();
  for (const config of EQUIPMENT_TYPES) {
    const sheetResult = results.find((r) => r.file === FILE && r.sheet === config.sheetName);
    if (sheetResult) grids.set(config.sheetName, toGrid(sheetResult.rows));
  }
  return grids;
}

function bayOptionsFromGrids(grids: Map<string, SheetGrid>): BayLineOption[] {
  const seen = new Map<string, BayLineOption>();
  for (const config of EQUIPMENT_TYPES) {
    const grid = grids.get(config.sheetName);
    if (!grid) continue;
    const giCol = findCol(grid.row1, "GARDU INDUK");
    const bayCol = findCol(grid.row1, "BAY");
    const ultgCol = findCol(grid.row1, "ULTG");
    for (const row of grid.dataRows) {
      const bay = textAt(row, bayCol);
      if (!bay.startsWith("BAY LINE")) continue;
      if (!seen.has(bay)) {
        seen.set(bay, { bay, gi: textAt(row, giCol), ultg: textAt(row, ultgCol) });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.bay.localeCompare(b.bay));
}

function buildReportFromGrids(grids: Map<string, SheetGrid>, option: BayLineOption, todayISO: string): BayLineReport {
  const units: BayEquipmentUnit[] = [];
  for (const config of EQUIPMENT_TYPES) {
    const grid = grids.get(config.sheetName);
    if (!grid) continue;
    units.push(...parseUnitsForBay(grid, option.bay, config, todayISO));
  }
  return { gi: option.gi, bay: option.bay, ultg: option.ultg, units: units.sort((a, b) => roleSortKey(a.role) - roleSortKey(b.role)) };
}

/** Every "BAY LINE ..." entry available across the 5 Input sheets, for the
 *  page's GI/Bay selector — deduplicated, sorted. */
export async function getBayLineOptions(): Promise<BayLineOption[]> {
  const grids = await loadGrids();
  return bayOptionsFromGrids(grids);
}

export async function getBayLineReport(bay: string): Promise<BayLineReport | null> {
  const grids = await loadGrids();
  const option = bayOptionsFromGrids(grids).find((o) => o.bay === bay);
  if (!option) return null;
  return buildReportFromGrids(grids, option, getJakartaTodayISO());
}

/** Every bay line's report in one pass. Loads each of the 5 Input sheets
 *  exactly once (a single readConfiguredSourceRaw() call) and reuses those
 *  in-memory grids for all ~67 bays — critical, since looping a per-bay
 *  fetch here would re-trigger the provider's own file lookup on every
 *  iteration even with the sheet-row cache warm (confirmed: that loop took
 *  130+ seconds against the live Apps Script gateway before this fix).
 *  Hands the whole dataset to the client component once, so switching the
 *  GI/Bay selector needs no server round-trip (same pattern as RENUS). */
export async function getAllBayLineReports(): Promise<BayLineReport[]> {
  const grids = await loadGrids();
  const todayISO = getJakartaTodayISO();
  return bayOptionsFromGrids(grids).map((option) => buildReportFromGrids(grids, option, todayISO));
}
