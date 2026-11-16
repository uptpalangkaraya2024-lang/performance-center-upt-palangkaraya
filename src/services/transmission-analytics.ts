import "server-only";

import { dataSources } from "@/config/data-sources";
import { PHASE_SEQUENCE_REFERENCE } from "@/config/phase-sequence";
import { readConfiguredSource } from "@/lib/data-connector";
import { canonicalTowerNo, extractCircuitSuffix, giTokenSet, lineGiPairKey } from "@/lib/gi-name";
import {
  LOCATOR_TOOLS,
  orderForCircuit,
  positionBucket,
  type LocatorTool,
  type TransmissionAnalyticsEvent,
} from "@/lib/transmission-analytics";
import { labelCause, labelKind } from "@/services/disturbances";
import { extractTowerNumbers } from "@/services/gangguan-history";
import { getSigapTowerInsights, type SigapTowerInsight } from "@/services/sigap";
import { buildSigapTowerLookup } from "@/services/sigap-join";
import { getSuttSnapshot } from "@/services/sutt-asset";
import type { SuttRuas } from "@/types";

// Reduces REKAP GANGGUAN to one small record per Transmisi incident for the
// "Analisa Lanjutan Transmisi" section — see src/lib/transmission-analytics.ts
// for what each view does. Same sheet the rest of the Gangguan page already
// reads, and readConfiguredSource caches at the (provider, file, sheet)
// level, so this adds no new network call.
const SOURCE = dataSources.disturbances;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

const text = (v: string | undefined) => (v ?? "").trim();

function parseHour(raw: string): number | null {
  // WAKTU TRIP arrives as a spreadsheet TIME serialized onto 1899-12-30
  // ("1899-12-30 19:05:00"); a plain "19:05" is accepted too.
  const m = /(?:^|\s)(\d{1,2}):\d{2}/.exec(raw);
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

function parseKms(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function towerNumbers(raw: string): number[] {
  return [...extractTowerNumbers(raw)].map(Number).filter(Number.isFinite);
}

function closestDelta(predicted: number[], actual: number[]): number | null {
  let best = Infinity;
  for (const p of predicted) for (const a of actual) best = Math.min(best, Math.abs(p - a));
  return Number.isFinite(best) ? best : null;
}

// --- phase sequence lookup ------------------------------------------------
//
// SIGAP's `fasa` (top-to-bottom phase sequence) is stored per tower and
// keyed by funcLoc; DATA SUTT carries the same funcLoc per tower plus the
// ruas it belongs to. Joined here so an incident can be given the sequence
// at the tower where it actually happened — necessary because some
// circuits are transposed partway along (see transmission-analytics.ts).

interface RuasPhaseIndex {
  sides: string[];
  pairKey: string;
  /** canonical tower number -> SIGAP fasa string for that tower */
  fasaByTower: Map<string, string>;
}

function buildPhaseIndex(ruasList: SuttRuas[], sigap: Record<string, SigapTowerInsight>): RuasPhaseIndex[] {
  const lookup = buildSigapTowerLookup(sigap);
  return ruasList.map((ruas) => {
    const sides = [giTokenSet(ruas.originLabel), giTokenSet(ruas.farEndLabel)];
    const fasaByTower = new Map<string, string>();
    for (const [towerNo, insight] of lookup(ruas)) {
      if (insight.fasa) fasaByTower.set(canonicalTowerNo(towerNo), insight.fasa);
    }
    return { sides, pairKey: [...sides].sort().join("||"), fasaByTower };
  });
}

/** Share of towers that must carry one sequence before an incident with
 *  NO recorded tower is given it. Tolerates the handful of shared/corridor
 *  towers a ruas's list picks up from a neighbouring line (PALANGKARAYA -
 *  KASONGAN: 187 TSR/RST + 7 SRT at the 185.x junction), while a genuinely
 *  transposed line (SUKAMARA - KENDAWANGAN: three segments of roughly a
 *  third each) never reaches it and stays "unknown". */
const DOMINANT_ORDER_SHARE = 0.8;

/** The top-to-bottom sequence for one incident, or null when it can't be
 *  pinned down to exactly one. Candidate ruas: the one whose two end GIs
 *  match the bay name; failing that, any ruas sharing one GI with it (a
 *  circuit tapped off a registered line, e.g. PALANGKARAYA - PULANG PISAU
 *  riding the MINTIN - PALANGKARAYA towers). The faulted tower(s) from
 *  TEMUAN LAPANGAN narrow it to the exact tower — the only way to get the
 *  right answer on a transposed line. With no tower, the whole candidate
 *  set must agree on one sequence, otherwise it's left unknown rather
 *  than guessed. */
/** The user's reference document (src/config/phase-sequence.ts), matched
 *  on the bay's own line name — checked BEFORE SIGAP because it names the
 *  line, so it can't confuse two lines sharing one corridor of towers.
 *  undefined = no reference entry for this line (fall through to SIGAP);
 *  null = entry exists but this incident can't be placed (transposed line
 *  and no faulted tower recorded, or towers spanning two ranges). */
function referenceOrder(pair: string, circuit: string, towers: string[]): string | null | undefined {
  const entries = PHASE_SEQUENCE_REFERENCE.filter((r) => lineGiPairKey(r.line) === pair);
  const entry = entries.find((r) => r.circuit === circuit) ?? entries.find((r) => !r.circuit);
  if (!entry) return undefined;
  if (entry.order) return entry.order;
  const nums = towers.map(Number).filter(Number.isFinite);
  if (!entry.ranges || nums.length === 0) return null;
  const orders = new Set(
    nums.map((n) => entry.ranges!.find((r) => n >= r.fromTower && n <= r.toTower)?.order ?? null),
  );
  if (orders.has(null) || orders.size !== 1) return null;
  return [...orders][0];
}

/** Reminder text for an incident whose position couldn't be determined:
 *  a transposed line in the reference with no faulted tower recorded is a
 *  data-entry gap in REKAP GANGGUAN; anything else means no phase sequence
 *  is on file for that line yet (e.g. lines outside ULTG Pangkalan Bun's
 *  map, per user). */
function unknownReason(bay: string, towers: string[]): string {
  const pair = lineGiPairKey(bay);
  const transposed = PHASE_SEQUENCE_REFERENCE.some((r) => r.ranges && pair && lineGiPairKey(r.line) === pair);
  return transposed && towers.length === 0
    ? "nomor tower tidak tercatat di TEMUAN LAPANGAN (ruas ditranspose)"
    : "data urutan fasa line ini belum tersedia";
}

function resolveOrder(index: RuasPhaseIndex[], bay: string, circuit: string, towers: string[]): string | null {
  const pair = lineGiPairKey(bay);
  if (!pair) return null;
  const fromReference = referenceOrder(pair, circuit, towers);
  if (fromReference !== undefined) return fromReference;
  const baySides = pair.split("||");
  let candidates = index.filter((r) => r.pairKey === pair);
  if (candidates.length === 0) candidates = index.filter((r) => r.sides.some((side) => baySides.includes(side)));
  if (candidates.length === 0) return null;

  // At the faulted tower(s): every one must agree — no majority vote.
  const unanimous = (fasaList: string[]) => {
    const orders = new Set(fasaList.map((f) => orderForCircuit(f, circuit)));
    if (orders.has(null)) return null;
    return orders.size === 1 ? ([...orders][0] as string) : null;
  };
  // Whole-ruas fallback: one sequence must cover DOMINANT_ORDER_SHARE.
  const dominant = (fasaList: string[]) => {
    const counts = new Map<string, number>();
    for (const f of fasaList) {
      const o = orderForCircuit(f, circuit);
      if (o) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top && fasaList.length > 0 && top[1] / fasaList.length >= DOMINANT_ORDER_SHARE ? top[0] : null;
  };

  if (towers.length > 0) {
    const atTowers = candidates.flatMap((r) =>
      towers.map((t) => r.fasaByTower.get(t)).filter((f): f is string => !!f),
    );
    if (atTowers.length > 0) return unanimous(atTowers);
  }
  return dominant(candidates.flatMap((r) => [...r.fasaByTower.values()]));
}

export interface TransmissionAnalyticsResult {
  events: TransmissionAnalyticsEvent[];
  /** Ascending. */
  years: string[];
  /** Asia/Jakarta "yyyy-MM-dd" — lets the client compute the elapsed share
   *  of a running year for per-year rates without its own clock. */
  todayISO: string;
  error: string | null;
}

export async function getTransmissionAnalytics(): Promise<TransmissionAnalyticsResult> {
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  // SUTT + SIGAP only feed the phase-position view; both are best-effort
  // (SIGAP falls back to its last cached copy, or {} — then every 1- and
  // 2-phase fault shows as "urutan belum diketahui" instead of failing).
  const [results, sutt, sigap] = await Promise.all([readConfiguredSource(SOURCE), getSuttSnapshot(), getSigapTowerInsights()]);
  const phaseIndex = sutt.error ? [] : buildPhaseIndex(sutt.ruasList, sigap);
  const sheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);
  if (!sheet) {
    return { events: [], years: [], todayISO, error: `Gagal membaca sheet "${EXPECTED_SHEET}".` };
  }

  // Same scope as the page's Transmisi section: T/L Bay rows counted toward
  // performance. A trip can be reported from both ends of the line; those
  // reports share date, GI pair, circuit and trip time, so they're merged
  // into one incident here (otherwise a line's rate would double).
  const seen = new Set<string>();
  const raw: { r: Record<string, string>; key: string; ruasLabel: string }[] = [];
  for (const r of sheet.records) {
    if (text(r["KODE BAY"]) !== "T/L Bay" || text(r["JUSTIFIKASI KINERJA"]) !== "MASUK KINERJA") continue;
    const bay = text(r["NAMA BAY GANGGUAN"]);
    const tgl = text(r["TGL"]);
    const year = text(r["TAHUN"]);
    if (!bay || !/^\d{4}-\d{2}-\d{2}/.test(tgl) || !/^\d{4}$/.test(year)) continue;
    const pair = lineGiPairKey(bay) ?? bay.toUpperCase();
    const circuit = extractCircuitSuffix(bay) ?? "";
    const dedupe = `${tgl.slice(0, 10)}|${pair}|${circuit}|${text(r["WAKTU TRIP"]).slice(-8, -3)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    raw.push({ r, key: `${pair}#${circuit}`, ruasLabel: text(r["NAMA SIRKIT"]) || bay.replace(/[\s#]\d+\s*$/, "") });
  }

  // One display label per physical circuit: the most frequent NAMA SIRKIT
  // spelling among its rows (either end may have filed it).
  const labelVotes = new Map<string, Map<string, number>>();
  for (const { key, ruasLabel } of raw) {
    const votes = labelVotes.get(key) ?? new Map<string, number>();
    votes.set(ruasLabel, (votes.get(ruasLabel) ?? 0) + 1);
    labelVotes.set(key, votes);
  }
  const ruasFor = (key: string) =>
    [...(labelVotes.get(key) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;

  const events: TransmissionAnalyticsEvent[] = raw.map(({ r, key }) => {
    const circuitNo = key.split("#")[1];
    const ruas = ruasFor(key);
    const temuanTowers = [...extractTowerNumbers(text(r["TEMUAN LAPANGAN"]))].map(canonicalTowerNo);
    const actual = temuanTowers.map(Number).filter(Number.isFinite);
    const locator: { tool: LocatorTool; delta: number }[] = [];
    if (actual.length > 0) {
      for (const tool of LOCATOR_TOOLS) {
        const delta = closestDelta(towerNumbers(text(r[tool])), actual);
        if (delta !== null) locator.push({ tool, delta });
      }
    }
    const phase = text(r["PHASE FAULT"]);
    const phaseOrder = phase ? resolveOrder(phaseIndex, text(r["NAMA BAY GANGGUAN"]), circuitNo, temuanTowers) : null;
    return {
      year: text(r["TAHUN"]),
      dateISO: text(r["TGL"]).slice(0, 10),
      circuit: circuitNo ? `${ruas} ${circuitNo}` : ruas,
      ruas,
      kms: parseKms(text(r["KMS/MVA"])),
      kind: labelKind(text(r["KODE GGN"])),
      hour: parseHour(text(r["WAKTU TRIP"])),
      cause: labelCause(text(r["PENYEBAB"]) || "LAINNYA"),
      phase: phase || null,
      phasePosition: phase ? positionBucket(phase, phaseOrder) : null,
      phaseOrder,
      phaseUnknownReason:
        phase && positionBucket(phase, phaseOrder) === "Urutan belum diketahui"
          ? unknownReason(text(r["NAMA BAY GANGGUAN"]), temuanTowers)
          : null,
      locator,
    };
  });

  const years = [...new Set(events.map((e) => e.year))].sort();
  return { events, years, todayISO, error: null };
}
