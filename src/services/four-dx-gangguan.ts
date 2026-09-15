import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { FourDxOutcomeMonthly, FourDxOutcomeSnapshot } from "@/types";

const SOURCE = dataSources.fourDxGangguan;
const FILE = SOURCE.sources[0].file;
const SHEET = "Data Gangguan";
const UPT_LABEL = "UPT PALANGKA RAYA";

function normalize(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

function parseNumber(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** The "Kumulatif" section's own sub-header row reads "TARGET TRAFO" at the
 *  first column of a 12-column block, exactly 2 rows below "UPT PALANGKA
 *  RAYA" at THE SAME column — found by content match rather than a fixed
 *  index, since this UIP3B-wide sheet's block widths differ per UPT/UP2B
 *  (System Operators only carry ERT/ACC, no TRAFO/TRANS) and any shift
 *  elsewhere in the sheet must not silently misalign Palangkaraya's own
 *  numbers.
 *
 *  Must be an EXACT same-column match, not a "nearby within N columns"
 *  fuzzy search — confirmed live that a wide lookahead window (originally
 *  14 columns) false-matches the PRECEDING UPT's own "TARGET TRAFO" cell,
 *  since adjacent blocks are only ~12 columns apart and Palangkaraya's own
 *  name label falls inside that neighbor's lookahead window. This silently
 *  produced a real UPT's set of numbers (Balikpapan's, in the case that
 *  surfaced the bug) mislabeled as Palangkaraya's. */
function findPalangkarayaKumulatifBlock(grid: unknown[][]): { headerRow: number; startCol: number } | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (normalize(row[c]) !== UPT_LABEL) continue;
      const headerRow = grid[r + 2] ?? [];
      if (normalize(headerRow[c]) === "TARGET TRAFO") return { headerRow: r + 2, startCol: c };
    }
  }
  return null;
}

function monthAbbr(label: string): string {
  return String(label ?? "").trim().slice(0, 3).toUpperCase();
}

interface MonthRow {
  month: string;
  targetTrafo: number | null;
  targetTrans: number | null;
  targetErt: number | null;
  targetAcc: number | null;
  trafoBulanan: number | null;
  transBulanan: number | null;
  ertBulanan: number | null;
  accBulanan: number | null;
  trafoKumulatif: number | null;
  transKumulatif: number | null;
  ertKumulatif: number | null;
  accKumulatif: number | null;
}

function parseMonthRows(grid: unknown[][]): MonthRow[] {
  const block = findPalangkarayaKumulatifBlock(grid);
  if (!block) return [];
  const { headerRow, startCol } = block;
  const col = {
    targetTrafo: startCol,
    targetTrans: startCol + 1,
    targetErt: startCol + 2,
    targetAcc: startCol + 3,
    trafoBulanan: startCol + 4,
    transBulanan: startCol + 5,
    ertBulanan: startCol + 6,
    accBulanan: startCol + 7,
    trafoKumulatif: startCol + 8,
    transKumulatif: startCol + 9,
    ertKumulatif: startCol + 10,
    accKumulatif: startCol + 11,
  };

  const rows: MonthRow[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const label = String(grid[r]?.[0] ?? "").trim();
    if (!label || /^total/i.test(label)) break;
    const row = grid[r];
    rows.push({
      month: monthAbbr(label),
      targetTrafo: parseNumber(row[col.targetTrafo]),
      targetTrans: parseNumber(row[col.targetTrans]),
      targetErt: parseNumber(row[col.targetErt]),
      targetAcc: parseNumber(row[col.targetAcc]),
      trafoBulanan: parseNumber(row[col.trafoBulanan]),
      transBulanan: parseNumber(row[col.transBulanan]),
      ertBulanan: parseNumber(row[col.ertBulanan]),
      accBulanan: parseNumber(row[col.accBulanan]),
      trafoKumulatif: parseNumber(row[col.trafoKumulatif]),
      transKumulatif: parseNumber(row[col.transKumulatif]),
      ertKumulatif: parseNumber(row[col.ertKumulatif]),
      accKumulatif: parseNumber(row[col.accKumulatif]),
    });
  }
  return rows;
}

function toTrafoSeries(rows: MonthRow[]): FourDxOutcomeMonthly[] {
  return rows.map((row) => ({ month: row.month, target: row.targetTrafo, bulanan: row.trafoBulanan, kumulatif: row.trafoKumulatif }));
}
function toTransSeries(rows: MonthRow[]): FourDxOutcomeMonthly[] {
  return rows.map((row) => ({ month: row.month, target: row.targetTrans, bulanan: row.transBulanan, kumulatif: row.transKumulatif }));
}
function toErtSeries(rows: MonthRow[]): FourDxOutcomeMonthly[] {
  return rows.map((row) => ({ month: row.month, target: row.targetErt, bulanan: row.ertBulanan, kumulatif: row.ertKumulatif }));
}
function toAccSeries(rows: MonthRow[]): FourDxOutcomeMonthly[] {
  return rows.map((row) => ({ month: row.month, target: row.targetAcc, bulanan: row.accBulanan, kumulatif: row.accKumulatif }));
}

export async function getFourDxOutcomeSnapshot(): Promise<FourDxOutcomeSnapshot> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const sheet = results.find((r) => r.file === FILE && r.sheet === SHEET);
  const rows = sheet ? parseMonthRows(sheet.rows) : [];

  return {
    trafo: toTrafoSeries(rows),
    transmisi: toTransSeries(rows),
    ert: toErtSeries(rows),
    accident: toAccSeries(rows),
    error: rows.length === 0 ? "Data korelasi gangguan 4DX belum tersedia." : null,
  };
}
