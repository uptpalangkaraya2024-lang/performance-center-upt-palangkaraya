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
  /** Conductor POSITION(S) that faulted — the raw R/S/T letters translated
   *  through this circuit's own phase sequence at the faulted tower
   *  (SIGAP `fasa`, top-to-bottom). null when PHASE FAULT is blank. See
   *  positionBucket(). */
  phasePosition: PhasePosition | null;
  /** The top-to-bottom phase sequence used for that translation, e.g.
   *  "TSR"; null when it couldn't be determined for this incident. */
  phaseOrder: string | null;
  /** Why phasePosition is "Urutan belum diketahui" — shown as a reminder
   *  note on the Fasa Terganggu card so the missing data can be filled in.
   *  null whenever the position is known. */
  phaseUnknownReason: string | null;
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
//
// Per user: R/S/T letters are NOT a fixed physical position — on most
// circuits the top-to-bottom order is RST, but some circuits are strung
// differently and some are transposed partway (confirmed in SIGAP's own
// `fasa` field: SUKAMARA - KENDAWANGAN goes STR -> TRS -> RST along the
// line; PANGKALAN BUN - SUKAMARA changes at T.132; PALANGKARAYA -
// KASONGAN is "TSR / RST", i.e. circuit 1 TSR, circuit 2 RST). Reporting
// "T-N" across circuits would therefore mix top, middle and bottom
// conductors. Every fault is instead translated into the POSITION(S) it
// hit, using the phase sequence at the faulted tower.

export const PHASE_POSITIONS = [
  "Atas",
  "Tengah",
  "Bawah",
  "Atas-Tengah",
  "Tengah-Bawah",
  "Atas-Bawah",
  "3 fasa",
  "Urutan belum diketahui",
] as const;
export type PhasePosition = (typeof PHASE_POSITIONS)[number];
/** Kept for the legend/colour map; same list. */
export const PHASE_BUCKETS = PHASE_POSITIONS;
export type PhaseBucket = PhasePosition;

const POSITION_NAMES = ["Atas", "Tengah", "Bawah"] as const;

/** Parses one circuit's phase sequence ("TSR") — exactly the three letters
 *  R, S, T once each, top to bottom — or null. */
function parseOrder(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^RST]/g, "");
  return s.length === 3 && new Set(s).size === 3 ? s : null;
}

/** SIGAP writes one sequence for a whole double-circuit tower ("RST", both
 *  circuits identical) or one per circuit ("TSR / RST" = circuit 1 /
 *  circuit 2, matching SIGAP's own "L1 ... | L2 ..." labelling). Returns
 *  the sequence for `circuit` ("1"/"2"/""), or null if it can't be told —
 *  e.g. a two-sequence tower but the incident's circuit is unknown. */
export function orderForCircuit(sigapFasa: string, circuit: string): string | null {
  const parts = sigapFasa.split("/").map((p) => parseOrder(p)).filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (circuit === "1") return parts[0];
  if (circuit === "2") return parts[1];
  return parts[0] === parts[1] ? parts[0] : null;
}

/** Faulted conductor position(s) for a PHASE FAULT value ("R-N", "S-T",
 *  "R-S-T-N", ...) given the top-to-bottom sequence. Three phases is
 *  "3 fasa" regardless of order. Without a sequence, a 1- or 2-phase
 *  fault's position is genuinely unknown and says so — never assumed RST. */
export function positionBucket(rawPhase: string, order: string | null): PhasePosition | null {
  const letters = [...new Set(rawPhase.toUpperCase().split(/[^RST]+/).join("").split(""))].filter((x) =>
    ["R", "S", "T"].includes(x),
  );
  if (letters.length === 0) return null;
  if (letters.length === 3) return "3 fasa";
  if (!order) return "Urutan belum diketahui";
  const idx = letters.map((l) => order.indexOf(l)).sort((a, b) => a - b);
  return idx.map((i) => POSITION_NAMES[i]).join("-") as PhasePosition;
}

export interface PhaseRow {
  label: string;
  /** Top-to-bottom sequence when every incident in this row used the same
   *  one (always true for a single non-transposed circuit), else null. */
  order: string | null;
  /** True when incidents in this row used more than one sequence (a
   *  transposed circuit, or a cause row spanning many circuits). */
  orderVaries: boolean;
  total: number;
  buckets: Record<PhaseBucket, number>;
  dominant: PhaseBucket;
}

function phaseRow(label: string, items: TransmissionAnalyticsEvent[]): PhaseRow {
  const buckets = Object.fromEntries(PHASE_BUCKETS.map((b) => [b, 0])) as Record<PhaseBucket, number>;
  let total = 0;
  const orders = new Set<string>();
  for (const e of items) {
    if (!e.phasePosition) continue;
    buckets[e.phasePosition] += 1;
    total += 1;
    if (e.phaseOrder) orders.add(e.phaseOrder);
  }
  const dominant = PHASE_BUCKETS.reduce((best, b) => (buckets[b] > buckets[best] ? b : best), PHASE_BUCKETS[0]);
  return { label, order: orders.size === 1 ? [...orders][0] : null, orderVaries: orders.size > 1, total, buckets, dominant };
}

export function buildPhaseBreakdown(
  events: TransmissionAnalyticsEvent[],
  topCauses = 3,
  topCircuits = 8,
): { byCause: PhaseRow[]; byCircuit: PhaseRow[] } {
  const group = (key: (e: TransmissionAnalyticsEvent) => string) => {
    const m = new Map<string, TransmissionAnalyticsEvent[]>();
    for (const e of events) {
      if (!e.phasePosition) continue;
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

export interface LocatorGroupRow {
  /** Ruas name, or cause label — whichever the breakdown groups by. */
  label: string;
  /** Per tool: share within 2 towers (0-100) and sample size; null when
   *  that tool never had a prediction in this group in the period. */
  tools: Record<LocatorTool, { within2Pct: number; count: number } | null>;
  total: number;
}
/** Kept for existing callers. */
export type LocatorRuasRow = LocatorGroupRow;

function locatorBreakdown(
  events: TransmissionAnalyticsEvent[],
  key: (e: TransmissionAnalyticsEvent) => string,
): LocatorGroupRow[] {
  const groups = new Map<string, TransmissionAnalyticsEvent[]>();
  for (const e of events) if (e.locator.length > 0) groups.set(key(e), [...(groups.get(key(e)) ?? []), e]);
  return [...groups.entries()]
    .map(([label, items]) => {
      const tools = Object.fromEntries(
        LOCATOR_TOOLS.map((tool) => {
          const d = items.flatMap((e) => e.locator.filter((l) => l.tool === tool).map((l) => l.delta));
          return [tool, d.length === 0 ? null : { within2Pct: stats(tool, d).within2Pct, count: d.length }];
        }),
      ) as LocatorGroupRow["tools"];
      return { label, tools, total: items.length };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** Overall per-tool stats plus two breakdowns: per ruas (which line's
 *  impedance/settings to review) and per cause (per user — e.g. whether a
 *  tool locates lightning faults well but high-impedance vegetation faults
 *  poorly, which changes how far the patrol should search around the
 *  predicted tower for each cause). */
export function buildLocatorAccuracy(events: TransmissionAnalyticsEvent[]): {
  overall: LocatorStats[];
  byRuas: LocatorGroupRow[];
  byCause: LocatorGroupRow[];
} {
  const overall = LOCATOR_TOOLS.map((tool) =>
    stats(tool, events.flatMap((e) => e.locator.filter((l) => l.tool === tool).map((l) => l.delta))),
  );
  return { overall, byRuas: locatorBreakdown(events, (e) => e.ruas), byCause: locatorBreakdown(events, (e) => e.cause) };
}
