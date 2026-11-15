import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { extractCircuitSuffix, lineGiPairKey } from "@/lib/gi-name";
import { LOCATOR_TOOLS, type LocatorTool, type TransmissionAnalyticsEvent } from "@/lib/transmission-analytics";
import { labelCause, labelKind } from "@/services/disturbances";
import { extractTowerNumbers } from "@/services/gangguan-history";

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
  const results = await readConfiguredSource(SOURCE);
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
    const actual = towerNumbers(text(r["TEMUAN LAPANGAN"]));
    const locator: { tool: LocatorTool; delta: number }[] = [];
    if (actual.length > 0) {
      for (const tool of LOCATOR_TOOLS) {
        const delta = closestDelta(towerNumbers(text(r[tool])), actual);
        if (delta !== null) locator.push({ tool, delta });
      }
    }
    const phase = text(r["PHASE FAULT"]);
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
      locator,
    };
  });

  const years = [...new Set(events.map((e) => e.year))].sort();
  return { events, years, todayISO, error: null };
}
