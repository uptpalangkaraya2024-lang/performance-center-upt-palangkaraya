import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { AboProgramBlockRaw, AboProgramRaw, AboRuasItem, AboSnapshot, AboUltgProgramRaw } from "@/types";

const SOURCE = dataSources.aboProteksi;
const FILE = SOURCE.sources[0].file;
const PKY_SHEET = "🖥️ PKY";
const INPUT_PKY_SHEET = "📝 INPUT PKY";

function textAt(row: unknown[] | undefined, col: number): string {
  if (!row || col < 0 || col >= row.length) return "";
  return String(row[col] ?? "").trim();
}

function parseNumber(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

interface WeekColumnMap {
  targetCols: { label: string; col: number }[];
  realisasiCols: { label: string; col: number }[];
}

/** "🖥️ PKY"'s header row is identical (index-for-index) across its UPT and
 *  ULTG blocks — read once from the sheet's first "ID" header row and reused
 *  for every block. */
function buildWeekColumnMap(headerRow: unknown[]): WeekColumnMap {
  const targetCols: { label: string; col: number }[] = [];
  const realisasiCols: { label: string; col: number }[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const cell = textAt(headerRow, c);
    if (cell.startsWith("T ")) targetCols.push({ label: cell.slice(2).trim(), col: c });
    else if (cell.startsWith("R ")) realisasiCols.push({ label: cell.slice(2).trim(), col: c });
  }
  return { targetCols, realisasiCols };
}

function parseProgramRow(row: unknown[], columnMap: WeekColumnMap): AboProgramRaw {
  const targetWeekly: Record<string, number> = {};
  for (const { label, col } of columnMap.targetCols) {
    const value = parseNumber(row[col]);
    if (value !== null) targetWeekly[label] = value;
  }
  const realisasiWeekly: Record<string, number> = {};
  for (const { label, col } of columnMap.realisasiCols) {
    const value = parseNumber(row[col]);
    if (value !== null) realisasiWeekly[label] = value;
  }
  return {
    code: textAt(row, 0),
    subInitiative: textAt(row, 1),
    description: textAt(row, 2),
    satuan: textAt(row, 3),
    master: parseNumber(row[4]) ?? 0,
    targetRencana: parseNumber(row[8]) ?? 0,
    status: textAt(row, 7),
    targetWeekly,
    realisasiWeekly,
  };
}

/** Parses "🖥️ PKY" into its UPT block + per-ULTG blocks. Each block is a
 *  header row (own "ID" cell) followed by 14 PRO_xx program rows, with a
 *  ULTG-only block preceded by its own label row (col 0/1 blank, col 2 =
 *  the ULTG name, e.g. "PALANGKARAYA") — confirmed against the live sheet,
 *  not guessed. Block boundaries are found by scanning for "ID" header
 *  rows rather than hardcoding row numbers, so the parser survives the
 *  sheet gaining/losing blank rows. */
function parsePkySheet(rows: unknown[][]): { upt: AboProgramRaw[]; ultgBlocks: { ultg: string; programs: AboProgramRaw[] }[] } {
  const headerIndexes: { index: number; ultgLabel: string | null }[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (textAt(rows[i], 0) !== "ID") continue;
    const prevRow = rows[i - 1];
    const ultgLabel =
      !textAt(prevRow, 0) && !textAt(prevRow, 1) && textAt(prevRow, 2) ? textAt(prevRow, 2) : null;
    headerIndexes.push({ index: i, ultgLabel });
  }
  if (headerIndexes.length === 0) return { upt: [], ultgBlocks: [] };

  const columnMap = buildWeekColumnMap(rows[headerIndexes[0].index]);
  const blocks = headerIndexes.map(({ index, ultgLabel }) => {
    const programs: AboProgramRaw[] = [];
    let i = index + 1;
    while (i < rows.length && /^PRO_\d+/.test(textAt(rows[i], 0))) {
      programs.push(parseProgramRow(rows[i], columnMap));
      i += 1;
    }
    return { ultgLabel, programs };
  });

  const [uptBlock, ...ultgRest] = blocks;
  const ultgBlocks = ultgRest
    .filter((b): b is { ultgLabel: string; programs: AboProgramRaw[] } => b.ultgLabel !== null)
    .map((b) => ({ ultg: b.ultgLabel, programs: b.programs }));

  return { upt: uptBlock?.programs ?? [], ultgBlocks };
}

function extractWeekLabel(raw: string): string | null {
  const m = /^[TR]\s+(.+)$/.exec(raw.trim());
  return m ? m[1].trim() : null;
}

/** Parses "📝 INPUT PKY" into one array of ruas items per program block, in
 *  the same order the blocks appear in the sheet — confirmed live to match
 *  "🖥️ PKY"'s PRO_01..14 order exactly (matched by title text during the
 *  audit). A block starts at a title row (col 0/1/2 blank, col 3 = the
 *  program's description) and ends at the next title row or end of sheet. */
function parseInputPkySheet(rows: unknown[][]): AboRuasItem[][] {
  const blocks: AboRuasItem[][] = [];
  let current: AboRuasItem[] | null = null;

  for (const row of rows) {
    const col0 = textAt(row, 0);
    const col1 = textAt(row, 1);
    const col2 = textAt(row, 2);
    const col3 = textAt(row, 3);
    const isTitleRow = !col0 && !col1 && !col2 && !!col3;

    if (isTitleRow) {
      if (current) blocks.push(current);
      current = [];
      continue;
    }
    if (!current || col1 === "ID 1" || !/^\d+$/.test(col1)) continue;

    const ultg = textAt(row, 3);
    if (!ultg) continue;
    current.push({
      ultg,
      asset: textAt(row, 4),
      targetWeekLabel: extractWeekLabel(textAt(row, 5)),
      realisasiWeekLabel: extractWeekLabel(textAt(row, 7)),
      done: textAt(row, 14).toUpperCase() === "CLOSE",
      kondisi: textAt(row, 15),
    });
  }
  if (current) blocks.push(current);
  return blocks;
}

export async function getAboProteksiSnapshot(): Promise<AboSnapshot> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const pkySheet = results.find((r) => r.file === FILE && r.sheet === PKY_SHEET);
  const inputSheet = results.find((r) => r.file === FILE && r.sheet === INPUT_PKY_SHEET);

  const { upt, ultgBlocks } = pkySheet ? parsePkySheet(pkySheet.rows) : { upt: [], ultgBlocks: [] };
  const ruasBlocks = inputSheet ? parseInputPkySheet(inputSheet.rows) : [];

  const programs: AboProgramBlockRaw[] = upt.map((uptProgram, index) => {
    const ultgBreakdown: AboUltgProgramRaw[] = ultgBlocks
      .filter((block) => block.programs[index])
      .map((block) => ({ ...block.programs[index], ultg: block.ultg }));
    return {
      code: uptProgram.code,
      description: uptProgram.description,
      upt: uptProgram,
      ultgBreakdown,
      ruasItems: ruasBlocks[index] ?? [],
    };
  });

  return { programs, error: programs.length === 0 ? "Data ABO Proteksi belum tersedia." : null };
}
