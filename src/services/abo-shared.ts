import "server-only";

import type { DataSourceConfig } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { AboProgramBlockRaw, AboProgramRaw, AboRuasItem, AboSnapshot, AboUltgProgramRaw } from "@/types";

// Shared between ABO Proteksi and ABO Hargi (same author, same block shapes)
// — confirmed live that both files' "🖥️ PKY"/"📝 INPUT PKY" sheets follow
// the same structure, with a few column differences (see buildColumnMap and
// parseInputPkySheet below, both resolved by header NAME, not fixed index,
// specifically because of these differences).

export function textAt(row: unknown[] | undefined, col: number): string {
  if (!row || col < 0 || col >= row.length) return "";
  return String(row[col] ?? "").trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function findCol(row: unknown[], label: string): number {
  const needle = normalize(label);
  return row.findIndex((c) => normalize(String(c ?? "")) === needle);
}

function findColStartsWith(row: unknown[], prefix: string): number {
  const needle = normalize(prefix);
  return row.findIndex((c) => normalize(String(c ?? "")).startsWith(needle));
}

export function parseNumber(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

interface AboColumnMap {
  subInitiativeCol: number;
  descriptionCol: number;
  satuanCol: number;
  masterCol: number;
  statusCol: number;
  targetRencanaCol: number;
  targetCols: { label: string; col: number }[];
  realisasiCols: { label: string; col: number }[];
}

/** "🖥️ PKY"'s header row is identical (index-for-index) across its UPT and
 *  ULTG blocks — read once from the sheet's first "ID" header row and reused
 *  for every block. Columns resolved by header NAME, not fixed index:
 *  confirmed live that ABO Proteksi and ABO Hargi use different column
 *  layouts (Proteksi has a separate "MASTER" column; Hargi has none and
 *  "Target UPT"/"Target ULTG" itself is the master value; STATUS/Target
 *  Rencana also sit at different positions between the two files). */
function buildColumnMap(headerRow: unknown[]): AboColumnMap {
  const masterCol = findCol(headerRow, "MASTER") !== -1 ? findCol(headerRow, "MASTER") : findColStartsWith(headerRow, "Target U");

  const targetCols: { label: string; col: number }[] = [];
  const realisasiCols: { label: string; col: number }[] = [];
  for (let c = 0; c < headerRow.length; c++) {
    const cell = textAt(headerRow, c);
    if (cell.startsWith("T ")) targetCols.push({ label: cell.slice(2).trim(), col: c });
    else if (cell.startsWith("R ")) realisasiCols.push({ label: cell.slice(2).trim(), col: c });
  }

  return {
    subInitiativeCol: findCol(headerRow, "Sub initiative"),
    descriptionCol: findCol(headerRow, "Uraian Program"),
    satuanCol: findCol(headerRow, "Satuan"),
    masterCol,
    statusCol: findCol(headerRow, "STATUS"),
    targetRencanaCol: findCol(headerRow, "Target Rencana"),
    targetCols,
    realisasiCols,
  };
}

function parseProgramRow(row: unknown[], columnMap: AboColumnMap): AboProgramRaw {
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
    subInitiative: textAt(row, columnMap.subInitiativeCol),
    description: textAt(row, columnMap.descriptionCol),
    satuan: textAt(row, columnMap.satuanCol),
    master: parseNumber(row[columnMap.masterCol]) ?? 0,
    targetRencana: parseNumber(row[columnMap.targetRencanaCol]) ?? 0,
    status: textAt(row, columnMap.statusCol),
    targetWeekly,
    realisasiWeekly,
  };
}

/** Parses "🖥️ PKY" into its UPT block + per-ULTG blocks. Each block is a
 *  header row (own "ID" cell) followed by N program rows (code like
 *  "PRO_01" or "GI_01" — any <letters>_<digits> code), with a ULTG-only
 *  block SOMETIMES preceded by its own label row (col 0/1 blank, col 2 =
 *  the ULTG name, e.g. "PALANGKARAYA") — confirmed live for ABO Proteksi.
 *  ABO Hargi's ULTG blocks carry no such label at all (confirmed live) —
 *  `fixedUltgOrder`, when given, names each label-less ULTG block in that
 *  fixed order instead (confirmed with the user: Hargi's own PKY sheet is
 *  always UPT, then PALANGKARAYA, MUARA TEWEH, PANGKALAN BUN, in that
 *  order — cross-checked against INPUT PKY's own per-ULTG row counts).
 *  Block boundaries are found by scanning for "ID" header rows rather than
 *  hardcoding row numbers, so the parser survives the sheet gaining/losing
 *  blank rows. */
function parsePkySheet(
  rows: unknown[][],
  fixedUltgOrder?: string[],
): { upt: AboProgramRaw[]; ultgBlocks: { ultg: string; programs: AboProgramRaw[] }[] } {
  const headerIndexes: { index: number; ultgLabel: string | null }[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (textAt(rows[i], 0) !== "ID") continue;
    const prevRow = rows[i - 1];
    const ultgLabel = !textAt(prevRow, 0) && !textAt(prevRow, 1) && textAt(prevRow, 2) ? textAt(prevRow, 2) : null;
    headerIndexes.push({ index: i, ultgLabel });
  }
  if (headerIndexes.length === 0) return { upt: [], ultgBlocks: [] };

  const columnMap = buildColumnMap(rows[headerIndexes[0].index]);
  const blocks = headerIndexes.map(({ index, ultgLabel }) => {
    const programs: AboProgramRaw[] = [];
    let i = index + 1;
    while (i < rows.length && /^[A-Za-z]+_\d+/.test(textAt(rows[i], 0))) {
      programs.push(parseProgramRow(rows[i], columnMap));
      i += 1;
    }
    return { ultgLabel, programs };
  });

  const [uptBlock, ...ultgRest] = blocks;
  const ultgBlocks = ultgRest.map((b, i) => ({
    ultg: b.ultgLabel ?? fixedUltgOrder?.[i] ?? `ULTG ${i + 1}`,
    programs: b.programs,
  }));

  return { upt: uptBlock?.programs ?? [], ultgBlocks };
}

function extractWeekLabel(raw: string): string | null {
  const m = /^[TR]\s+(.+)$/.exec(raw.trim());
  return m ? m[1].trim() : null;
}

/** Parses "📝 INPUT PKY" into one array of ruas items per program, aligned
 *  to `programDescriptions` (🖥️ PKY's own UPT-block program order) —
 *  confirmed live that both sheets list programs in the same order.
 *
 *  Block boundaries are found by CONTENT, not position: a row starting the
 *  Nth program's block is one containing that program's exact description
 *  text (normalized) in any cell — not by assuming it always lands in a
 *  fixed column. This was tightened after a live discrepancy: an earlier
 *  version assumed the title always sits at column 3 (true when this was
 *  first audited), but a later re-check found ABO Hargi's own sheet had
 *  since been edited (a row inserted, shifting the title to column 4) and
 *  the position-based version silently produced zero ruas items for every
 *  program as a result — content-matching survives that kind of live
 *  editing instead of breaking silently. Per-block columns are still
 *  resolved by header NAME once a block's own header row is found (ULTG +
 *  TARGET MINGGU both present in that row) — already position-independent,
 *  confirmed live that Proteksi and Hargi use different column layouts
 *  here too (Hargi has an extra leading "CODE" column shifting everything
 *  over one, plus no "KERAWANAN" column). */
function parseInputPkySheet(rows: unknown[][], programDescriptions: string[]): AboRuasItem[][] {
  const blocks: AboRuasItem[][] = programDescriptions.map(() => []);
  const normalizedDescriptions = programDescriptions.map(normalize);

  let blockIndex = -1;
  let cols: {
    id: number;
    ultg: number;
    asset: number;
    targetWeek: number;
    realisasiWeek: number;
    tanggalRealisasi: number;
    hasilBa: number;
    kondisi: number;
  } | null = null;

  for (const row of rows) {
    const nextIndex = blockIndex + 1;
    if (nextIndex < normalizedDescriptions.length) {
      const nextDescription = normalizedDescriptions[nextIndex];
      const isNextTitleRow = row.some((c) => normalize(String(c ?? "")) === nextDescription);
      if (isNextTitleRow) {
        blockIndex = nextIndex;
        cols = null;
        continue;
      }
    }
    if (blockIndex === -1) continue; // before the first recognized block

    const ultgCol = findCol(row, "ULTG");
    const targetMingguCol = findCol(row, "TARGET MINGGU");
    if (ultgCol !== -1 && targetMingguCol !== -1) {
      const idCol = findColStartsWith(row, "ID");
      cols = {
        id: idCol,
        ultg: ultgCol,
        asset: ultgCol + 1,
        targetWeek: targetMingguCol,
        realisasiWeek: findCol(row, "REALISASI MINGGU"),
        tanggalRealisasi: findCol(row, "TANGGAL REALISASI"),
        hasilBa: findCol(row, "HASIL / BA"),
        kondisi: findCol(row, "KONDISI"),
      };
      continue;
    }

    if (!cols) continue;
    const idCell = textAt(row, cols.id);
    if (!/^\d+$/.test(idCell)) continue;
    const ultg = textAt(row, cols.ultg);
    if (!ultg) continue;

    // `done` is driven by TANGGAL REALISASI (a real date filled in), NOT
    // CLS/OPN — confirmed with the user: CLS/OPN can still read OPEN after
    // the date is filled in, whenever the Berita Acara (HASIL/BA) simply
    // hasn't been uploaded yet. That's a documentation gap, not evidence
    // the work is unrealized, so it's surfaced separately as `baMissing`.
    const realisasiDate = cols.tanggalRealisasi === -1 ? "" : textAt(row, cols.tanggalRealisasi);
    const done = realisasiDate.length > 0;
    const hasilBa = cols.hasilBa === -1 ? "" : textAt(row, cols.hasilBa);

    blocks[blockIndex].push({
      ultg,
      asset: textAt(row, cols.asset),
      targetWeekLabel: extractWeekLabel(textAt(row, cols.targetWeek)),
      realisasiWeekLabel: cols.realisasiWeek === -1 ? null : extractWeekLabel(textAt(row, cols.realisasiWeek)),
      realisasiDate: realisasiDate || null,
      done,
      baMissing: done && !hasilBa,
      kondisi: cols.kondisi === -1 ? "" : textAt(row, cols.kondisi),
    });
  }
  return blocks;
}

export async function getAboSnapshot(
  source: DataSourceConfig,
  moduleLabel: string,
  options?: { fixedUltgOrder?: string[] },
): Promise<AboSnapshot> {
  const file = source.sources[0].file;
  const pkySheetName = "🖥️ PKY";
  const inputSheetName = "📝 INPUT PKY";

  const results = await readConfiguredSourceRaw(source);
  const pkySheet = results.find((r) => r.file === file && r.sheet === pkySheetName);
  const inputSheet = results.find((r) => r.file === file && r.sheet === inputSheetName);

  const { upt, ultgBlocks } = pkySheet ? parsePkySheet(pkySheet.rows, options?.fixedUltgOrder) : { upt: [], ultgBlocks: [] };
  const ruasBlocks = inputSheet ? parseInputPkySheet(inputSheet.rows, upt.map((p) => p.description)) : [];

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

  return { programs, error: programs.length === 0 ? `Data ${moduleLabel} belum tersedia.` : null };
}
