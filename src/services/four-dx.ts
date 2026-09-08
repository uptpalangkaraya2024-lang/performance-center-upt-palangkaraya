import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import { dayOfMonthToWeek, MONTH_ABBR_ID } from "@/lib/four-dx-compute";
import type {
  FourDxAssetTargetRaw,
  FourDxLmRaw,
  FourDxMonitoringRow,
  FourDxRealization,
  FourDxSnapshot,
  FourDxWigRaw,
} from "@/types";

const SOURCE = dataSources.fourDx;
const FILE = SOURCE.sources[0].file;

const TARGET_SHEETS = [
  { name: "TARGET WIG 1", wigNumber: 1 },
  { name: "TARGET WIG 2", wigNumber: 2 },
  { name: "TARGET WIG 3", wigNumber: 3 },
  { name: "TARGET WIG 4", wigNumber: 4 },
];

const REALIZATION_SHEETS = ["ULTG PALANGKARAYA", "ULTG PANGKALAN BUN", "ULTG MUARA TEWEH", "K3 UPT PALANGKARAYA"];

function textAt(row: unknown[] | undefined, col: number): string {
  if (!row || col < 0 || col >= row.length) return "";
  return String(row[col] ?? "").trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function findCol(row1: unknown[], label: string): number {
  const needle = normalize(label);
  return row1.findIndex((c) => normalize(String(c ?? "")) === needle);
}

function findColStartsWith(row1: unknown[], prefix: string): number {
  const needle = normalize(prefix);
  return row1.findIndex((c) => normalize(String(c ?? "")).startsWith(needle));
}

function parseNumber(raw: unknown): number | null {
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

function extractLmCode(raw: unknown): string | null {
  const m = /(\d+\.\d+)/.exec(String(raw ?? ""));
  return m ? m[1] : null;
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

/** Parses one TARGET WIG * sheet's raw grid into per-LM blocks. Each sheet is
 *  a sequence of blocks: a title row ("LM 1.1 Kesesuaian Implementasi..."),
 *  its own header row (No, Asset, <week columns>), then asset rows until a
 *  blank row. Two row shapes get skipped without ending the block: a
 *  "Target N ... tiap Minggu" aggregate total row, and a non-numbered
 *  reference row (WIG 2 lists individual towers under a ULTG's target row
 *  with no "No" and no weekly numbers — confirmed against the live sheet,
 *  not guessed) — only a row whose own "No" cell is a real number is an
 *  actual per-week target row. */
function parseTargetWigSheet(grid: unknown[][], wigNumber: number, weekLabels: Set<string>): FourDxLmRaw[] {
  const lms: FourDxLmRaw[] = [];
  let i = 0;
  while (i < grid.length) {
    const firstCell = textAt(grid[i], 0);
    const lmMatch = /^LM\s+(\d+\.\d+)\s*(.*)$/i.exec(firstCell);
    if (!lmMatch) {
      i += 1;
      continue;
    }
    const lmCode = lmMatch[1];
    const lmDescription = lmMatch[2].trim();
    i += 1; // move to this block's own header row

    const headerRow = grid[i] ?? [];
    const weekCols: { col: number; label: string }[] = [];
    for (let c = 2; c < headerRow.length; c++) {
      const label = textAt(headerRow, c);
      if (label) {
        weekCols.push({ col: c, label });
        weekLabels.add(label);
      }
    }
    i += 1; // move to first asset row

    const assets: FourDxAssetTargetRaw[] = [];
    while (i < grid.length) {
      const row = grid[i];
      const noCell = textAt(row, 0);
      const assetName = textAt(row, 1);
      if (!noCell && !assetName) {
        i += 1;
        break; // blank separator row ends the block
      }
      // Blank "No" covers both the non-numbered reference rows (WIG 2 lists
      // individual towers under a ULTG's own target row) and the
      // "TOTAL REALISASI" rows some blocks end with — Number("") is 0 (a
      // finite number), so this must be checked before Number.isFinite,
      // not folded into it, or both get misparsed as a valid asset #0.
      if (!noCell || noCell.toLowerCase().startsWith("target") || !Number.isFinite(Number(noCell))) {
        i += 1;
        continue; // aggregate total row or non-numbered reference row — skip, block continues
      }
      const weeklyTargets: Record<string, number> = {};
      for (const wc of weekCols) {
        const value = parseNumber(row[wc.col]);
        if (value !== null && value > 0) weeklyTargets[wc.label] = value;
      }
      assets.push({ asset: assetName, weeklyTargets });
      i += 1;
    }
    // An LM with no target anywhere in the whole year (e.g. WIG 2's LM 2.5,
    // confirmed with the user to be a completed/no-longer-tracked LM) is
    // dropped entirely rather than shown as a permanently-empty, always-
    // "belum" card — a data-driven rule, not a hardcoded LM code, so any
    // future LM in the same state gets the same treatment automatically.
    const hasAnyTarget = assets.some((a) => Object.keys(a.weeklyTargets).length > 0);
    if (hasAnyTarget) lms.push({ code: lmCode, description: lmDescription, assets });
  }
  return lms;
}

/** Parses the "Monitoring" sheet — one row per (ULTG, LM), a manually-
 *  reconciled weekly realisasi count across the whole year (JAN-M1..DES-M4,
 *  unlike TARGET WIG's MEI-DES-only range). No LM code column, so matching
 *  back to a FourDxLmRaw happens by normalized description text. */
function parseMonitoringSheet(grid: unknown[][]): FourDxMonitoringRow[] {
  const row1 = grid[0] ?? [];
  const dataRows = grid.slice(1);
  const ultgCol = findCol(row1, "ULTG");
  const detailCol = findCol(row1, "Detail");
  if (ultgCol === -1 || detailCol === -1) return [];

  const weekCols: { col: number; label: string }[] = [];
  for (let c = detailCol + 1; c < row1.length; c++) {
    const label = textAt(row1, c);
    if (/^[A-Z]{3}-M\d$/.test(label)) weekCols.push({ col: c, label });
  }

  const rows: FourDxMonitoringRow[] = [];
  for (const row of dataRows) {
    const description = textAt(row, detailCol);
    if (!description) continue;
    const weeklyRealisasi: Record<string, number> = {};
    for (const wc of weekCols) {
      const value = parseNumber(row[wc.col]);
      if (value !== null) weeklyRealisasi[wc.label] = value;
    }
    rows.push({ ultg: textAt(row, ultgCol), description, weeklyRealisasi });
  }
  return rows;
}

/** Parses one realization-log sheet's raw grid (single ordinary header row,
 *  unlike TARGET WIG's repeating blocks) into a flat list of completed
 *  actions. */
function parseRealizationSheet(grid: unknown[][]): FourDxRealization[] {
  const row1 = grid[0] ?? [];
  const dataRows = grid.slice(1);
  const tanggalCol = findColStartsWith(row1, "TANGGAL REALISASI");
  const lmCol = findCol(row1, "Lead Measure");
  const assetCol = findCol(row1, "Bay Line/Trafo");
  const ultgCol = findCol(row1, "ULTG");
  if (tanggalCol === -1 || lmCol === -1) return [];

  const records: FourDxRealization[] = [];
  for (const row of dataRows) {
    const lmCode = extractLmCode(row[lmCol]);
    const tanggal = extractDateOnly(row[tanggalCol]);
    if (!lmCode || !tanggal) continue;
    records.push({ lmCode, asset: textAt(row, assetCol), ultg: textAt(row, ultgCol), tanggal });
  }
  return records;
}

export async function getFourDxSnapshot(): Promise<FourDxSnapshot> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const weekLabels = new Set<string>();

  const wigs: FourDxWigRaw[] = [];
  for (const { name, wigNumber } of TARGET_SHEETS) {
    const found = results.find((r) => r.file === FILE && r.sheet === name);
    if (!found || found.rows.length === 0) continue;
    const title = textAt(found.rows[0], 0);
    const lms = parseTargetWigSheet(found.rows, wigNumber, weekLabels);
    if (lms.length > 0) wigs.push({ number: wigNumber, title, lms });
  }

  const realizations: FourDxRealization[] = [];
  for (const name of REALIZATION_SHEETS) {
    const found = results.find((r) => r.file === FILE && r.sheet === name);
    if (found) realizations.push(...parseRealizationSheet(found.rows));
  }

  const monitoringSheet = results.find((r) => r.file === FILE && r.sheet === "Monitoring");
  const monitoring = monitoringSheet ? parseMonitoringSheet(monitoringSheet.rows) : [];

  const todayISO = getJakartaTodayISO();
  const [year, month, day] = todayISO.split("-").map(Number);

  return {
    currentMonthAbbr: MONTH_ABBR_ID[month - 1],
    currentWeekOfMonth: dayOfMonthToWeek(day),
    currentYear: year,
    availableWeekLabels: [...weekLabels],
    wigs,
    realizations,
    monitoring,
    error: wigs.length === 0 ? "Data 4DX belum tersedia." : null,
  };
}
