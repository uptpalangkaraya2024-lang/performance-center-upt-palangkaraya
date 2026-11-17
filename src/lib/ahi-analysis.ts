// Analysis behind the AHI Overview tab. Pure and client-safe: the page
// hands the HI UPT snapshot (category blocks + AM:BA Poor/Critical recap)
// to the client, which re-runs these per ULTG filter.
//
// One AM:BA row is one *condition* (an equipment phase — or the whole unit
// for RST/3-phase rows — rated Poor/Critical). Several rows can describe the
// same physical equipment (R, S and T of one CT), so counts are reported
// both as conditions and as unique equipment.
import type { AhiAnomalyRecord, AhiSectionSummary } from "@/types";

export const shortAhiUltg = (s: string) => s.replace(/^ULTG\s+/i, "").trim() || "—";

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const prettyUltg = (s: string) => titleCase(shortAhiUltg(s));
export const prettyGi = (s: string) => (s.length <= 4 ? s : titleCase(s));

/** Physical equipment: bay + jenis aset + keterangan (DS LINE / DS BUS A ...). */
export const equipmentKey = (a: AhiAnomalyRecord) =>
  [a.ultg, a.gi, a.bay, a.jenisAset, a.keterangan === "-" ? "" : a.keterangan].join("|");

const isCritical = (a: AhiAnomalyRecord) => a.kategoriAhi >= 5;
const isBlank = (s: string) => {
  const t = s.trim();
  return t === "" || t === "-" || t === "#N/A";
};

/** Splits "Tan Delta, Ratio" into parameters (commas inside "(...)" kept)
 *  and folds "Ratio (hasil sesuai dengan kelas CT)" into "Ratio". */
export function splitParams(raw: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out
    .map((p) => p.trim().replace(/^Ratio \(hasil sesuai dengan kelas \w+\)$/i, "Ratio"))
    .filter((p) => p && p !== "-");
}

/** "AHI: 5 > SKDIR: 2" → { ahi: 5, skdir: 2 }. */
export function parseSkdir(raw: string): { ahi: number; skdir: number } | null {
  const m = /AHI:\s*(\d)\s*[=<>]\s*SKDIR:\s*(\d)/i.exec(raw);
  return m ? { ahi: Number(m[1]), skdir: Number(m[2]) } : null;
}

export type SkdirRelation = "sama" | "ahiLebihBuruk" | "ahiLebihBaik" | "kosong";
export function skdirRelation(a: AhiAnomalyRecord): SkdirRelation {
  const p = parseSkdir(a.kategoriAhiVsSkdir);
  if (!p) return "kosong";
  if (p.ahi === p.skdir) return "sama";
  return p.ahi > p.skdir ? "ahiLebihBuruk" : "ahiLebihBaik";
}

/** Sub-system labels as typed are mixed Indonesian/English and casing. */
export function normalizeSubSistem(raw: string): string[] {
  if (isBlank(raw)) return ["Belum terisi"];
  return raw.split(",").map((s) => {
    const t = s.trim().toLowerCase();
    if (/dielekt|dielectric/.test(t)) return "Dielektrik";
    if (/^isolasi$|insulation/.test(t)) return "Insulation";
    return titleCase(s.trim());
  });
}

function groupBy<T>(list: T[], keyOf: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of list) {
    const k = keyOf(t);
    const arr = map.get(k);
    if (arr) arr.push(t);
    else map.set(k, [t]);
  }
  return map;
}

const uniqueCount = (list: AhiAnomalyRecord[]) => new Set(list.map(equipmentKey)).size;

// --- KPIs ----------------------------------------------------------------

export interface AhiKpis {
  conditions: number;
  critical: number;
  poor: number;
  equipment: number;
  bays: number;
  gis: number;
  noFollowUp: number;
  noTarget: number;
  skdirWorse: number;
  skdirSame: number;
  skdirBetter: number;
}

export function buildAhiKpis(list: AhiAnomalyRecord[]): AhiKpis {
  const rel = list.map(skdirRelation);
  return {
    conditions: list.length,
    critical: list.filter(isCritical).length,
    poor: list.filter((a) => !isCritical(a)).length,
    equipment: uniqueCount(list),
    bays: new Set(list.map((a) => `${a.gi}|${a.bay}`)).size,
    gis: new Set(list.map((a) => a.gi)).size,
    noFollowUp: list.filter((a) => isBlank(a.rencanaTindakLanjut)).length,
    noTarget: list.filter((a) => isBlank(a.targetWaktu)).length,
    skdirWorse: rel.filter((r) => r === "ahiLebihBuruk").length,
    skdirSame: rel.filter((r) => r === "sama").length,
    skdirBetter: rel.filter((r) => r === "ahiLebihBaik").length,
  };
}

// --- breakdowns ------------------------------------------------------------

export interface AhiCountRow {
  label: string;
  conditions: number;
  critical: number;
  equipment: number;
  items: AhiAnomalyRecord[];
  /** Secondary breakdown, e.g. jenis aset per parameter. */
  by: { label: string; n: number }[];
}

function countRow(label: string, list: AhiAnomalyRecord[], byOf?: (a: AhiAnomalyRecord) => string): AhiCountRow {
  const by = byOf
    ? [...groupBy(list, byOf).entries()].map(([l, g]) => ({ label: l, n: g.length })).sort((a, b) => b.n - a.n)
    : [];
  return {
    label,
    conditions: list.length,
    critical: list.filter(isCritical).length,
    equipment: uniqueCount(list),
    items: list,
    by,
  };
}

/** Pareto of trigger parameters (one row may name several). */
export function buildTriggerPareto(list: AhiAnomalyRecord[]): AhiCountRow[] {
  const map = new Map<string, AhiAnomalyRecord[]>();
  for (const a of list) {
    const params = splitParams(a.parameterPemicuAhi);
    for (const p of params.length ? params : ["(tidak disebut)"]) {
      const arr = map.get(p) ?? [];
      arr.push(a);
      map.set(p, arr);
    }
  }
  return [...map.entries()]
    .map(([p, l]) => countRow(p, l, (a) => a.jenisAset))
    .sort((a, b) => b.conditions - a.conditions);
}

export function buildSubSistemRows(list: AhiAnomalyRecord[]): AhiCountRow[] {
  const map = new Map<string, AhiAnomalyRecord[]>();
  for (const a of list)
    for (const s of new Set(normalizeSubSistem(a.subSistem))) {
      const arr = map.get(s) ?? [];
      arr.push(a);
      map.set(s, arr);
    }
  return [...map.entries()]
    .map(([s, l]) => countRow(s, l, (a) => a.jenisAset))
    .sort((a, b) => b.conditions - a.conditions);
}

export interface AhiMatrix {
  assets: string[];
  rows: { ultg: string; total: AhiCountRow; cells: Record<string, AhiCountRow> }[];
  totals: Record<string, AhiCountRow>;
}

export function buildUltgAssetMatrix(list: AhiAnomalyRecord[]): AhiMatrix {
  const assets = [...groupBy(list, (a) => a.jenisAset).entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k]) => k);
  const rows = [...groupBy(list, (a) => prettyUltg(a.ultg)).entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([ultg, l]) => {
      const byAsset = groupBy(l, (a) => a.jenisAset);
      const cells: Record<string, AhiCountRow> = {};
      for (const as of assets) cells[as] = countRow(as, byAsset.get(as) ?? []);
      return { ultg, total: countRow(ultg, l), cells };
    });
  const totals: Record<string, AhiCountRow> = {};
  const byAsset = groupBy(list, (a) => a.jenisAset);
  for (const as of assets) totals[as] = countRow(as, byAsset.get(as) ?? []);
  return { assets, rows, totals };
}

export interface AhiGiRow extends AhiCountRow {
  ultg: string;
  bays: number;
}

export function buildGiRanking(list: AhiAnomalyRecord[]): AhiGiRow[] {
  return [...groupBy(list, (a) => a.gi).entries()]
    .map(([gi, l]) => ({
      ...countRow(prettyGi(gi), l, (a) => a.jenisAset),
      ultg: prettyUltg(l[0].ultg),
      bays: new Set(l.map((a) => a.bay)).size,
    }))
    .sort((a, b) => b.equipment - a.equipment || b.conditions - a.conditions);
}

export interface AhiBayHotspot extends AhiCountRow {
  gi: string;
  ultg: string;
  /** Distinct equipment types with a Poor/Critical finding in this bay. */
  assetTypes: string[];
}

/** Bays where two or more pieces of equipment are Poor/Critical — one
 *  outage can address all of them. */
export function buildBayHotspots(list: AhiAnomalyRecord[]): AhiBayHotspot[] {
  return [...groupBy(list, (a) => `${a.gi}|${a.bay}`).values()]
    .map((l) => ({
      ...countRow(l[0].bay, l, (a) => a.jenisAset),
      gi: prettyGi(l[0].gi),
      ultg: prettyUltg(l[0].ultg),
      assetTypes: [...new Set(l.map((a) => a.jenisAset))],
    }))
    .filter((b) => b.equipment >= 2)
    .sort((a, b) => b.equipment - a.equipment || b.critical - a.critical || b.conditions - a.conditions);
}

export interface AhiMerkRow extends AhiCountRow {
  gis: number;
  topParam: string;
}

/** Brand × jenis aset — a brand failing the same parameter at several GIs
 *  points at a type/batch issue rather than a site issue. */
export function buildMerkRows(list: AhiAnomalyRecord[]): AhiMerkRow[] {
  return [...groupBy(list, (a) => `${a.merk.trim() || "(tanpa merk)"}|${a.jenisAset}`).entries()]
    .map(([key, l]) => {
      const params = buildTriggerPareto(l);
      return {
        ...countRow(key.replace("|", " · "), l),
        gis: new Set(l.map((a) => a.gi)).size,
        topParam: params[0]?.label ?? "—",
      };
    })
    .sort((a, b) => b.equipment - a.equipment || b.conditions - a.conditions);
}

export interface AhiSkdirRow {
  jenisAset: string;
  sama: number;
  ahiLebihBuruk: number;
  ahiLebihBaik: number;
  kosong: number;
  items: Record<SkdirRelation, AhiAnomalyRecord[]>;
}

export function buildSkdirRows(list: AhiAnomalyRecord[]): AhiSkdirRow[] {
  return [...groupBy(list, (a) => a.jenisAset).entries()]
    .map(([jenisAset, l]) => {
      const items: Record<SkdirRelation, AhiAnomalyRecord[]> = {
        sama: [],
        ahiLebihBuruk: [],
        ahiLebihBaik: [],
        kosong: [],
      };
      for (const a of l) items[skdirRelation(a)].push(a);
      return {
        jenisAset,
        sama: items.sama.length,
        ahiLebihBuruk: items.ahiLebihBuruk.length,
        ahiLebihBaik: items.ahiLebihBaik.length,
        kosong: items.kosong.length,
        items,
      };
    })
    .sort((a, b) => b.ahiLebihBuruk + b.sama - (a.ahiLebihBuruk + a.sama));
}

// --- category scores (UPT-wide; the sheet has no per-ULTG split) ------------

export interface AhiParamGap {
  category: string;
  parameter: string;
  kosong: number;
  total: number;
  ratio: number;
}

/** Parameters with the largest share of untested/empty readings. */
export function buildParameterGaps(sections: AhiSectionSummary[], limit = 10): AhiParamGap[] {
  const out: AhiParamGap[] = [];
  for (const s of sections)
    for (const c of s.categories) {
      const total = c.jumlahDataTercatat ?? 0;
      if (!total) continue;
      for (const p of c.parameters) {
        const kosong = p.kosong ?? 0;
        if (kosong > 0) out.push({ category: c.displayName, parameter: p.name, kosong, total, ratio: kosong / total });
      }
    }
  return out.sort((a, b) => b.ratio - a.ratio || b.kosong - a.kosong).slice(0, limit);
}

export interface AhiParamProblem {
  category: string;
  parameter: string;
  poor: number;
  critical: number;
}

/** Parameters with Poor/Critical results in the category blocks. */
export function buildParameterProblems(sections: AhiSectionSummary[]): AhiParamProblem[] {
  const out: AhiParamProblem[] = [];
  for (const s of sections)
    for (const c of s.categories)
      for (const p of c.parameters) {
        const poor = p.poor ?? 0;
        const critical = p.critical ?? 0;
        if (poor + critical > 0) out.push({ category: c.displayName, parameter: p.name, poor, critical });
      }
  return out.sort((a, b) => b.critical + b.poor - (a.critical + a.poor));
}

/** Data-weighted mean of the category scores. */
export function weightedScore(sections: AhiSectionSummary[]): number | null {
  let w = 0;
  let sum = 0;
  for (const s of sections)
    for (const c of s.categories)
      if (c.score !== null && c.jumlahDataTercatat) {
        w += c.jumlahDataTercatat;
        sum += c.score * c.jumlahDataTercatat;
      }
  return w ? sum / w : null;
}
