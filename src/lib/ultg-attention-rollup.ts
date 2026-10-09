// Cross-module "which ULTG needs the most attention, overall" rollup — each
// module already has its own per-ULTG view (ABO, 4DX, CE, AHI, RENUS), but
// none of them answer the question a manager actually has: across every
// program/gangguan/temuan/anomali/pekerjaan combined, which ULTG is behind
// in the most places? This reads the SAME already-computed per-module
// numbers (reusing each module's own builder where one exists) and sums
// them into one small table, canonicalizing every module's own raw ULTG
// spelling via src/lib/ultg.ts.
import { ULTG_CANONICAL_KEYS, ultgDisplayName, ultgKey } from "@/lib/ultg";

export interface UltgCountEntry {
  ultg: string;
  count: number;
}

export interface UltgAttentionRollupEntry {
  ultg: string;
  abo: number;
  fourDx: number;
  ce: number;
  ahi: number;
  renus: number;
  disturbances: number;
  dataAset: number;
  total: number;
}

export interface UltgAttentionRollupInput {
  /** ABO: programsEvaluated - programsTercapai per ULTG, from buildAboUltgResume. */
  abo: UltgCountEntry[];
  /** 4DX: lmsEvaluated - lmsTercapai per ULTG, from buildFourDxUltgResume. */
  fourDx: UltgCountEntry[];
  /** CE: open findings per ULTG, from buildCeSummary(items).byUltg. */
  ce: UltgCountEntry[];
  /** AHI: Critical (kategoriAhi 5) anomalies per ULTG, from buildAhiUltgResume. */
  ahi: UltgCountEntry[];
  /** RENUS: overdue work per ULTG (all periods, not view-scoped), from buildRenusUltgResume. */
  renus: UltgCountEntry[];
  /** Disturbances: open follow-up per ULTG, summed across Transmisi/Trafo HV/Trafo LV. */
  disturbances: UltgCountEntry[];
  /** Data Aset: open (not SELESAI) relay-scanning anomali per ULTG. */
  dataAset: UltgCountEntry[];
}

const FIELDS: (keyof UltgAttentionRollupInput)[] = ["abo", "fourDx", "ce", "ahi", "renus", "disturbances", "dataAset"];

/** One row per ULTG (always exactly 3, in a fixed order), one column per
 *  module plus a summed total. An ULTG string from a module's own data
 *  that doesn't canonicalize to one of the 3 known ULTGs is skipped for
 *  that module rather than inventing a 4th row — this is a summary view,
 *  not a data-quality report (a genuinely new 4th ULTG would need its own
 *  decision about where it belongs, not a silent row here). */
export function buildUltgAttentionRollup(input: UltgAttentionRollupInput): UltgAttentionRollupEntry[] {
  const rows = new Map<string, UltgAttentionRollupEntry>();
  for (const key of ULTG_CANONICAL_KEYS) {
    rows.set(key, { ultg: ultgDisplayName(key), abo: 0, fourDx: 0, ce: 0, ahi: 0, renus: 0, disturbances: 0, dataAset: 0, total: 0 });
  }

  for (const field of FIELDS) {
    for (const entry of input[field]) {
      const key = ultgKey(entry.ultg);
      const row = rows.get(key);
      if (!row) continue;
      row[field] = entry.count;
    }
  }

  const result = [...rows.values()];
  for (const row of result) {
    row.total = row.abo + row.fourDx + row.ce + row.ahi + row.renus + row.disturbances + row.dataAset;
  }
  return result;
}
