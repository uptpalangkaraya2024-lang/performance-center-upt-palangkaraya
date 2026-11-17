// Analysis behind the CE page ("Monitoring Common Enemy UPT Palangkaraya").
// Pure and client-safe: the page hands the flat CeItem[] to the client,
// which re-runs these per ULTG / periode filter. Every number is computed
// from the per-ULTG INPUT sheets (+ ALOKASI ANGGARAN), never from the
// file's own DASHBOARD sheets.
import { ceStreamCodeOf } from "@/lib/ce-compute";
import type { CeItem } from "@/types";

export const CE_STATUS_ORDER = ["NO TARGET", "ON TARGET", "LAGGING", "FINISH (LEAD)", "FINISH (LAGGING)"] as const;

export const isInCe = (i: CeItem) => /^CE\b/i.test(i.periode.trim());
export const shortUltg = (s: string) => s.replace(/^ULTG\s+/i, "").trim() || "—";
export const shortGi = (s: string) => s.replace(/^GIS?\s*\d+\s*KV\s*/i, "").trim();

/** One row can name several GIs ("GI 150 KV KASONGAN, GI 150 KV KUALA
 *  KURUN, ...") — a UPT-wide program such as Wi-Fi. */
export function giList(item: CeItem): string[] {
  const parts = item.gardu.split(",").map((g) => shortGi(g)).filter(Boolean);
  return parts.length > 0 ? parts : ["—"];
}

export function isOverdue(item: CeItem, todayISO: string): boolean {
  return !item.done && item.tanggalTarget !== null && item.tanggalTarget < todayISO;
}

/** Budget behind a set of items. ALOKASI ANGGARAN often repeats one RAB
 *  package's NILAI on every item it covers (confirmed live: "053. RAB
 *  Perbaikan HMI" = 224,442,000 on 7 items), so a RAB counts once per
 *  distinct value; items without a RAB number count individually.
 *  `perItem` is the plain per-row sum, shown alongside for transparency. */
export function sumBudget(items: CeItem[]): { nilai: number; perItem: number; count: number } {
  const seen = new Set<string>();
  let nilai = 0;
  let perItem = 0;
  let count = 0;
  for (const i of items) {
    const v = i.budget?.nilai;
    if (!v) continue;
    count++;
    perItem += v;
    const key = i.budget!.rab ? `${i.budget!.rab.trim().toUpperCase()}|${Math.round(v)}` : `item:${i.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nilai += v;
  }
  return { nilai, perItem, count };
}

/** Same-meaning anomaly texts written slightly differently ("Counter LA
 *  tidak terbaca" / "counter LA tdk terbaca.") collapse to one key. */
export function anomalyKey(item: CeItem): string {
  const text = (item.anomaliPemicu || item.actionPlan || "(tanpa uraian)")
    .toLowerCase()
    .replace(/\btdk\b/g, "tidak")
    .replace(/[^a-z0-9%<>.,]+/g, " ")
    .replace(/[.,]+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${item.jenisAsset.trim().toUpperCase() || "—"}::${text}`;
}

// --- KPIs --------------------------------------------------------------

export interface CeKpis {
  total: number;
  inCe: number;
  notInCe: number;
  close: number;
  open: number;
  ceClose: number;
  lagging: number;
  overdue: number;
  noActionPlan: number;
  withBudget: number;
  budgetTotal: number;
  budgetPerItem: number;
}

export function buildKpis(items: CeItem[], todayISO: string): CeKpis {
  const ce = items.filter(isInCe);
  const budget = sumBudget(items);
  return {
    total: items.length,
    inCe: ce.length,
    notInCe: items.length - ce.length,
    close: items.filter((i) => i.done).length,
    open: items.filter((i) => !i.done).length,
    ceClose: ce.filter((i) => i.done).length,
    lagging: items.filter((i) => i.status.toUpperCase().includes("LAGGING") && !i.done).length,
    overdue: items.filter((i) => isOverdue(i, todayISO)).length,
    noActionPlan: items.filter((i) => !i.done && !i.actionPlan).length,
    withBudget: budget.count,
    budgetTotal: budget.nilai,
    budgetPerItem: budget.perItem,
  };
}

// --- per ULTG ------------------------------------------------------------

export interface UltgRow {
  ultg: string;
  total: number;
  inCe: number;
  notInCe: number;
  close: number;
  closePct: number | null;
  byStatus: Record<string, number>;
  overdue: number;
  budget: number;
}

export function buildUltgRows(items: CeItem[], todayISO: string): UltgRow[] {
  const groups = groupBy(items, (i) => shortUltg(i.ultg));
  return [...groups.entries()]
    .map(([ultg, list]) => {
      const ce = list.filter(isInCe);
      const byStatus: Record<string, number> = {};
      for (const i of list) byStatus[i.status || "—"] = (byStatus[i.status || "—"] ?? 0) + 1;
      return {
        ultg,
        total: list.length,
        inCe: ce.length,
        notInCe: list.length - ce.length,
        close: list.filter((i) => i.done).length,
        closePct: ce.length ? ce.filter((i) => i.done).length / ce.length : null,
        byStatus,
        overdue: list.filter((i) => isOverdue(i, todayISO)).length,
        budget: sumBudget(list).nilai,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// --- breakdowns ----------------------------------------------------------

export interface BreakdownRow {
  label: string;
  total: number;
  inCe: number;
  notInCe: number;
  open: number;
  close: number;
  /** Share of all items, cumulative from the top (Pareto). */
  cumPct: number;
}

export function buildBreakdown(items: CeItem[], keyOf: (i: CeItem) => string): BreakdownRow[] {
  const rows = [...groupBy(items, (i) => keyOf(i) || "—").entries()]
    .map(([label, list]) => {
      const inCe = list.filter(isInCe).length;
      const close = list.filter((i) => i.done).length;
      return { label, total: list.length, inCe, notInCe: list.length - inCe, open: list.length - close, close, cumPct: 0 };
    })
    .sort((a, b) => b.total - a.total);
  let run = 0;
  for (const r of rows) {
    run += r.total;
    r.cumPct = items.length ? run / items.length : 0;
  }
  return rows;
}

export interface GiMatrix {
  streams: string[];
  rows: { gi: string; ultg: string; total: number; open: number; byStream: Record<string, number> }[];
}

/** GI × stream count of OPEN anomalies (a multi-GI row counts at each). */
export function buildGiStreamMatrix(items: CeItem[]): GiMatrix {
  const open = items.filter((i) => !i.done);
  const streams = buildBreakdown(open, (i) => i.stream).map((r) => r.label);
  const map = new Map<string, { gi: string; ultg: string; total: number; open: number; byStream: Record<string, number> }>();
  for (const item of items) {
    for (const gi of giList(item)) {
      const row = map.get(gi) ?? { gi, ultg: shortUltg(item.ultg), total: 0, open: 0, byStream: {} };
      row.total++;
      if (!item.done) {
        row.open++;
        const s = item.stream || "—";
        row.byStream[s] = (row.byStream[s] ?? 0) + 1;
      }
      map.set(gi, row);
    }
  }
  return { streams, rows: [...map.values()].sort((a, b) => b.open - a.open || b.total - a.total) };
}

// --- hotspots & systemic -------------------------------------------------

export interface BayHotspot {
  bay: string;
  gi: string;
  ultg: string;
  items: CeItem[];
  open: number;
  jenis: string[];
}

/** Bays carrying 3+ anomalies — one piece of equipment collecting
 *  several problems at once (a candidate for a single combined outage). */
export function buildBayHotspots(items: CeItem[], min = 3): BayHotspot[] {
  return [...groupBy(items, (i) => i.bay || i.gardu).entries()]
    .filter(([, list]) => list.length >= min)
    .map(([bay, list]) => ({
      bay,
      gi: giList(list[0]).join(", "),
      ultg: shortUltg(list[0].ultg),
      items: list,
      open: list.filter((i) => !i.done).length,
      jenis: [...new Set(list.map((i) => i.jenisAsset || "—"))],
    }))
    .sort((a, b) => b.open - a.open || b.items.length - a.items.length);
}

export interface SystemicIssue {
  jenisAsset: string;
  anomaly: string;
  items: CeItem[];
  gis: string[];
  ultgs: string[];
  inCe: number;
  open: number;
  budget: number;
}

/** The same anomaly on the same asset type at 2+ GIs — a fleet/type
 *  problem better solved as one program (one RAB, one contract) than as
 *  separate per-GI findings. */
export function buildSystemicIssues(items: CeItem[]): SystemicIssue[] {
  return [...groupBy(items, anomalyKey).values()]
    .map((list) => {
      const gis = [...new Set(list.flatMap(giList))];
      return {
        jenisAsset: list[0].jenisAsset || "—",
        anomaly: list[0].anomaliPemicu || list[0].actionPlan || "(tanpa uraian)",
        items: list,
        gis,
        ultgs: [...new Set(list.map((i) => shortUltg(i.ultg)))],
        inCe: list.filter(isInCe).length,
        open: list.filter((i) => !i.done).length,
        budget: sumBudget(list).nilai,
      };
    })
    .filter((g) => g.gis.length >= 2)
    .sort((a, b) => b.items.length - a.items.length || b.gis.length - a.gis.length);
}

// --- candidates for CE ---------------------------------------------------

/** Streams that act directly on supply reliability rank above facility /
 *  building items when choosing what to adopt into CE next. */
const STREAM_WEIGHT: Record<string, number> = {
  PROTEKSI: 3,
  SWITCHYARD: 3,
  TRAFO: 3,
  GIS: 3,
  SUTT: 3,
  "CATU DAYA": 2,
  "MV APPARATUS": 2,
  FACILITY: 1,
};

export interface CeCandidate {
  jenisAsset: string;
  stream: string;
  anomaly: string;
  items: CeItem[];
  gis: string[];
  ultgs: string[];
  budget: number;
  hasPrk: boolean;
  hasActionPlan: boolean;
  score: number;
  reasons: string[];
}

/** "Belum masuk CE" OPEN items, grouped by anomaly (same problem on the
 *  same asset type = one candidate program), ordered by readiness and
 *  importance: reliability-critical stream, a budget line already exists,
 *  an action plan is written, and how many GIs share the problem. The
 *  score is only an ordering aid — the reasons are what's shown. */
export function buildCeCandidates(items: CeItem[]): CeCandidate[] {
  const pool = items.filter((i) => !isInCe(i) && !i.done);
  return [...groupBy(pool, anomalyKey).values()]
    .map((list) => {
      const first = list[0];
      const gis = [...new Set(list.flatMap(giList))];
      const budget = sumBudget(list).nilai;
      const hasPrk = list.some((i) => !!i.budget?.nomorPrk);
      const hasActionPlan = list.some((i) => !!i.actionPlan);
      const reasons: string[] = [];
      let score = STREAM_WEIGHT[first.stream.trim().toUpperCase()] ?? 1;
      if (score >= 3) reasons.push(`stream ${first.stream}`);
      if (budget > 0) {
        score += 3;
        reasons.push(hasPrk ? "sudah ada PRK" : "sudah ada RAB");
      }
      if (hasActionPlan) {
        score += 1;
        reasons.push("action plan ada");
      }
      if (gis.length >= 2) {
        score += Math.min(gis.length, 6) / 2;
        reasons.push(`${gis.length} GI`);
      }
      return {
        jenisAsset: first.jenisAsset || "—",
        stream: first.stream || "—",
        anomaly: first.anomaliPemicu || first.actionPlan || "(tanpa uraian)",
        items: list,
        gis,
        ultgs: [...new Set(list.map((i) => shortUltg(i.ultg)))],
        budget,
        hasPrk,
        hasActionPlan,
        score,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score || b.items.length - a.items.length);
}

// --- target timeline -------------------------------------------------------

export interface TargetMonth {
  key: string; // yyyy-MM
  target: number;
  closed: number;
  open: number;
  overdue: number;
}

export function buildTargetTimeline(items: CeItem[], todayISO: string): TargetMonth[] {
  const map = new Map<string, TargetMonth>();
  for (const i of items) {
    if (!i.tanggalTarget) continue;
    const key = i.tanggalTarget.slice(0, 7);
    const m = map.get(key) ?? { key, target: 0, closed: 0, open: 0, overdue: 0 };
    m.target++;
    if (i.done) m.closed++;
    else if (isOverdue(i, todayISO)) m.overdue++;
    else m.open++;
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// --- budget -------------------------------------------------------------

export interface BudgetGroup {
  label: string;
  count: number;
  nilai: number;
}

export function buildBudgetGroups(items: CeItem[], keyOf: (i: CeItem) => string): BudgetGroup[] {
  return [...groupBy(items.filter((i) => i.budget?.nilai), (i) => keyOf(i) || "Belum ditentukan").entries()]
    .map(([label, list]) => {
      const b = sumBudget(list);
      return { label, count: b.count, nilai: b.nilai };
    })
    .sort((a, b) => b.nilai - a.nilai);
}

// --- data completeness ----------------------------------------------------

export const COMPLETENESS_FIELDS: { label: string; test: (i: CeItem) => boolean; scope: "all" | "ce" }[] = [
  { label: "Uraian anomali", test: (i) => !!i.anomaliPemicu, scope: "all" },
  { label: "Action plan", test: (i) => !!i.actionPlan, scope: "all" },
  { label: "Tanggal temuan", test: (i) => !!i.tanggalTemuan, scope: "all" },
  { label: "BA temuan", test: (i) => !!i.linkBaTemuan, scope: "all" },
  { label: "Target (item CE)", test: (i) => !!i.tanggalTarget, scope: "ce" },
  { label: "Nilai anggaran", test: (i) => !!i.budget?.nilai, scope: "all" },
];

export function buildCompleteness(items: CeItem[]): { ultg: string; values: (number | null)[] }[] {
  const groups = [["Semua", items] as const, ...[...groupBy(items, (i) => shortUltg(i.ultg)).entries()]];
  return groups.map(([ultg, list]) => ({
    ultg,
    values: COMPLETENESS_FIELDS.map((f) => {
      const scoped = f.scope === "ce" ? list.filter(isInCe) : list;
      return scoped.length ? scoped.filter(f.test).length / scoped.length : null;
    }),
  }));
}

// -------------------------------------------------------------------------

function groupBy<T>(list: T[], keyOf: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const t of list) {
    const k = keyOf(t);
    const arr = map.get(k) ?? [];
    arr.push(t);
    map.set(k, arr);
  }
  return map;
}

export function formatRupiah(n: number): string {
  if (n >= 1e9) return `Rp ${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// --- rekap ULTG × stream ---------------------------------------------------

export interface RecapRow {
  label: string;
  total: number;
  inCe: number;
  notInCe: number;
  close: number;
  open: number;
  items: CeItem[];
}

export interface RecapGroup {
  ultg: string;
  streams: RecapRow[];
  subtotal: RecapRow;
}

function recapRow(label: string, list: CeItem[]): RecapRow {
  const inCe = list.filter(isInCe).length;
  const close = list.filter((i) => i.done).length;
  return {
    label,
    total: list.length,
    inCe,
    notInCe: list.length - inCe,
    close,
    open: list.length - close,
    items: list,
  };
}

/** Streams in their CE code order (01..09), unknown labels last. */
function streamRows(list: CeItem[]): RecapRow[] {
  return [...groupBy(list, (i) => i.stream.trim() || "—").entries()]
    .map(([label, l]) => ({
      row: recapRow(label, l),
      code: ceStreamCodeOf(l[0]) ?? "99",
    }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.row.label.localeCompare(b.row.label))
    .map((x) => x.row);
}

/** One table: every ULTG with its streams + subtotal, then (when more than
 *  one ULTG) the UPT-wide per-stream rows and grand total. */
export function buildUltgStreamRecap(items: CeItem[]): {
  groups: RecapGroup[];
  upt: RecapGroup | null;
} {
  const groups = [...groupBy(items, (i) => shortUltg(i.ultg)).entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([ultg, list]) => ({
      ultg,
      streams: streamRows(list),
      subtotal: recapRow(`Total ULTG ${ultg}`, list),
    }));
  const upt =
    groups.length > 1
      ? {
          ultg: "UPT Palangkaraya",
          streams: streamRows(items),
          subtotal: recapRow("Total UPT Palangkaraya", items),
        }
      : null;
  return { groups, upt };
}
