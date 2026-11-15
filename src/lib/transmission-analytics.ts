// "Analisa Lanjutan Transmisi" — four simple views over columns of the
// REKAP GANGGUAN sheet that the Gangguan page never used before (per user
// request: simple, but high-impact for analysis & evaluation):
//
//   1. Laju gangguan per 100 kms per sirkit  (KMS/MVA, KODE GGN)
//   2. Pola jam kejadian per penyebab        (WAKTU TRIP, PENYEBAB)
//   3. Fasa terganggu per penyebab/sirkit    (PHASE FAULT)
//   4. Akurasi alat fault locator            (VAISALA, SMDE/DE, TWS vs
//                                             TEMUAN LAPANGAN — confirmed by
//                                             the user to be the actual
//                                             tower found for each incident)
//
// Pure and client-safe: the service (src/services/transmission-analytics.ts)
// reduces the sheet to a small per-incident list once, and every view below
// is recomputed in the browser for whichever year the user picks — no
// extra fetch per filter change.

export const LOCATOR_TOOLS = ["VAISALA", "SMDE/DE", "TWS"] as const;
export type LocatorTool = (typeof LOCATOR_TOOLS)[number];

export interface TransmissionAnalyticsEvent {
  year: string;
  /** "yyyy-MM-dd". */
  dateISO: string;
  /** Line + circuit, e.g. "PALANGKARAYA - KASONGAN 1" (no suffix for a
   *  single-circuit line). One label per physical circuit regardless of
   *  which end's report the row came from. */
  circuit: string;
  /** Line without circuit number, e.g. "PALANGKARAYA - KASONGAN". */
  ruas: string;
  /** Circuit length from the sheet's KMS/MVA column, null if blank. */
  kms: number | null;
  /** "Trip" / "AR Sukses" / "Tidak Trip" — same labels as the page. */
  kind: string;
  /** 0-23 from WAKTU TRIP, null if unparseable. */
  hour: number | null;
  /** Display label, same mapping as the page ("Petir", "Hewan", ...). */
  cause: string;
  /** Raw PHASE FAULT value, e.g. "R-N", "S-T-N"; null if blank. */
  phase: string | null;
  /** Tower-count distance between each locator tool's predicted tower(s)
   *  and the tower(s) actually found (TEMUAN LAPANGAN) — closest pair.
   *  Only present for tools that had a prediction AND the incident had a
   *  field finding. */
  locator: { tool: LocatorTool; delta: number }[];
}

// --- period -----------------------------------------------------------------

function yearFraction(year: number, todayISO: string): number {
  const todayYear = Number(todayISO.slice(0, 4));
  if (year < todayYear) return 1;
  if (year > todayYear) return 0;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const today = Date.UTC(year, Number(todayISO.slice(5, 7)) - 1, Number(todayISO.slice(8, 10)));
  return (today - start) / (end - start);
}

/** Length of the selected period in years — a still-running current year
 *  counts only the elapsed fraction, so a rate "per tahun" isn't diluted
 *  by months that haven't happened yet. */
export function periodYears(years: string[], todayISO: string): number {
  return years.reduce((sum, y) => sum + yearFraction(Number(y), todayISO), 0);
}

// --- 1. rate per 100 kms ----------------------------------------------------

export interface CircuitRateRow {
  circuit: string;
  kms: number;
  count: number;
  trip: number;
  /** Incidents per 100 kms per year over the selected period. */
  ratePer100KmsYear: number;
}

/** Circuits with fewer than `minEvents` incidents are left out — on a very
 *  short line (MINTIN - SELAT is 4 kms) a single event otherwise produces
 *  a rate that tops the list and means nothing. */
export function buildCircuitRates(
  events: TransmissionAnalyticsEvent[],
  years: number,
  minEvents: number,
): CircuitRateRow[] {
  const byCircuit = new Map<string, { kms: number; count: number; trip: number }>();
  for (const e of events) {
    const x = byCircuit.get(e.circuit) ?? { kms: 0, count: 0, trip: 0 };
    if (e.kms && e.kms > x.kms) x.kms = e.kms;
    x.count += 1;
    if (e.kind === "Trip") x.trip += 1;
    byCircuit.set(e.circuit, x);
  }
  if (years <= 0) return [];
  return [...byCircuit.entries()]
    .filter(([, x]) => x.kms > 0 && x.count >= minEvents)
    .map(([circuit, x]) => ({ circuit, ...x, ratePer100KmsYear: x.count / years / (x.kms / 100) }))
    .sort((a, b) => b.ratePer100KmsYear - a.ratePer100KmsYear);
}

// --- 2. hour of day ---------------------------------------------------------

export interface HourSeries {
  cause: string;
  counts: number[];
  total: number;
}

/** Top `topCauses` causes by count get their own row; the rest fold into
 *  "Lainnya" so the grid stays readable. */
export function buildHourMatrix(events: TransmissionAnalyticsEvent[], topCauses = 3): HourSeries[] {
  const byCause = new Map<string, number[]>();
  for (const e of events) {
    if (e.hour === null) continue;
    const arr = byCause.get(e.cause) ?? Array<number>(24).fill(0);
    arr[e.hour] += 1;
    byCause.set(e.cause, arr);
  }
  const sorted = [...byCause.entries()]
    .map(([cause, counts]) => ({ cause, counts, total: counts.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const head = sorted.slice(0, topCauses);
  const rest = sorted.slice(topCauses);
  if (rest.length > 0) {
    const counts = Array<number>(24).fill(0);
    for (const r of rest) r.counts.forEach((v, i) => (counts[i] += v));
    head.push({ cause: "Lainnya", counts, total: counts.reduce((a, b) => a + b, 0) });
  }
  return head;
}

// --- 3. faulted phase -------------------------------------------------------

export const PHASE_BUCKETS = ["R-N", "S-N", "T-N", "2 fasa", "3 fasa", "Lainnya"] as const;
export type PhaseBucket = (typeof PHASE_BUCKETS)[number];

/** Single-phase-to-ground faults keep their own phase (that's where the
 *  physical signal is); any two-phase combo (with or without ground) and
 *  any three-phase combo are grouped, since those point to a cause (e.g.
 *  a strike or a tree spanning conductors) rather than one position. */
export function phaseBucket(raw: string): PhaseBucket {
  const p = raw.toUpperCase().replace(/\s+/g, "");
  if (p === "R-N" || p === "S-N" || p === "T-N") return p;
  const phases = new Set(p.split("-").filter((x) => x === "R" || x === "S" || x === "T"));
  if (phases.size === 3) return "3 fasa";
  if (phases.size === 2) return "2 fasa";
  return "Lainnya";
}

export interface PhaseRow {
  label: string;
  total: number;
  buckets: Record<PhaseBucket, number>;
  dominant: PhaseBucket;
}

function phaseRow(label: string, items: TransmissionAnalyticsEvent[]): PhaseRow {
  const buckets = Object.fromEntries(PHASE_BUCKETS.map((b) => [b, 0])) as Record<PhaseBucket, number>;
  let total = 0;
  for (const e of items) {
    if (!e.phase) continue;
    buckets[phaseBucket(e.phase)] += 1;
    total += 1;
  }
  const dominant = PHASE_BUCKETS.reduce((best, b) => (buckets[b] > buckets[best] ? b : best), PHASE_BUCKETS[0]);
  return { label, total, buckets, dominant };
}

export function buildPhaseBreakdown(
  events: TransmissionAnalyticsEvent[],
  topCauses = 3,
  topCircuits = 8,
): { byCause: PhaseRow[]; byCircuit: PhaseRow[] } {
  const group = (key: (e: TransmissionAnalyticsEvent) => string) => {
    const m = new Map<string, TransmissionAnalyticsEvent[]>();
    for (const e of events) {
      if (!e.phase) continue;
      const k = key(e);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].map(([label, items]) => phaseRow(label, items)).sort((a, b) => b.total - a.total);
  };
  return { byCause: group((e) => e.cause).slice(0, topCauses), byCircuit: group((e) => e.circuit).slice(0, topCircuits) };
}

// --- 4. locator accuracy ----------------------------------------------------

export interface LocatorStats {
  tool: LocatorTool;
  count: number;
  /** Shares 0-100, rounded. */
  exactPct: number;
  within2Pct: number;
  within5Pct: number;
  over20Pct: number;
  medianDelta: number | null;
}

function stats(tool: LocatorTool, deltas: number[]): LocatorStats {
  const n = deltas.length;
  const pct = (f: (d: number) => boolean) => (n === 0 ? 0 : Math.round((deltas.filter(f).length / n) * 100));
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    tool,
    count: n,
    exactPct: pct((d) => d === 0),
    within2Pct: pct((d) => d <= 2),
    within5Pct: pct((d) => d <= 5),
    over20Pct: pct((d) => d > 20),
    medianDelta: n === 0 ? null : sorted[Math.floor(n / 2)],
  };
}

export interface LocatorRuasRow {
  ruas: string;
  /** Per tool: share within 2 towers (0-100) and sample size; null when
   *  that tool never had a prediction on this ruas in the period. */
  tools: Record<LocatorTool, { within2Pct: number; count: number } | null>;
  total: number;
}

export function buildLocatorAccuracy(events: TransmissionAnalyticsEvent[]): {
  overall: LocatorStats[];
  byRuas: LocatorRuasRow[];
} {
  const overall = LOCATOR_TOOLS.map((tool) =>
    stats(tool, events.flatMap((e) => e.locator.filter((l) => l.tool === tool).map((l) => l.delta))),
  );
  const ruasMap = new Map<string, TransmissionAnalyticsEvent[]>();
  for (const e of events) if (e.locator.length > 0) ruasMap.set(e.ruas, [...(ruasMap.get(e.ruas) ?? []), e]);
  const byRuas = [...ruasMap.entries()]
    .map(([ruas, items]) => {
      const tools = Object.fromEntries(
        LOCATOR_TOOLS.map((tool) => {
          const d = items.flatMap((e) => e.locator.filter((l) => l.tool === tool).map((l) => l.delta));
          return [tool, d.length === 0 ? null : { within2Pct: stats(tool, d).within2Pct, count: d.length }];
        }),
      ) as LocatorRuasRow["tools"];
      return { ruas, tools, total: items.length };
    })
    .sort((a, b) => b.total - a.total);
  return { overall, byRuas };
}
