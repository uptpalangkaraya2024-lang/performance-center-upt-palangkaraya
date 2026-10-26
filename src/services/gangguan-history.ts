import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { canonicalGiKey, giTowerKey } from "@/lib/gi-name";
import type { GangguanHistoryEntry } from "@/types";

// Per-tower gangguan history for the "Cari Titik Gangguan" fault locator —
// reuses the SAME source as the main Gangguan dashboard
// (src/services/disturbances.ts: "REKAP GANGGUAN UPT PALANGKARAYA" ->
// "INPUT & REKAP GANGGUAN"), per the user's own instruction to pull
// historical gangguan counts from the UPT's own verified rekap rather than
// SIGAP's own ambiguous-unit "Gangguan <year>" figure. readConfiguredSource
// already caches at the (provider, file, sheet) level (src/lib/data-
// connector.ts), so calling it again here is cheap — no extra cache layer
// needed, same as every other service that reads an already-cached source.
const SOURCE = dataSources.disturbances;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

function extractYear(tahun: string, tgl: string): string {
  const t = tahun.trim();
  if (/^\d{4}$/.test(t)) return t;
  const m = /^(\d{4})-/.exec(tgl.trim());
  return m ? m[1] : "";
}

/** TEMUAN LAPANGAN is free-text field-investigation narrative — confirmed
 *  live it references specific towers in several interchangeable formats
 *  ("T.373", "T. 376", "Tower 373", "tower 202"), including ranges
 *  ("T.373 - T.379", "T.241-250", "Tower 237 - Tower 246", "span tower 124
 *  - 126") where the second number of a range often drops its own
 *  "T."/"Tower" prefix. A SEPARATE, more structured format also shows up
 *  on some rows — the exact same "TOWER SUTT 150 KV <ruas> #NNN" string
 *  the VAISALA/SMDE-DE columns use (confirmed live some rows copy that
 *  same string into TEMUAN LAPANGAN itself) — pulled out first via its
 *  own "#NNN" pattern, since prose mentions never use "#". Ranges are
 *  parsed next and masked out of the text before the single-mention pass
 *  runs, so a range's own start number is never double-counted as a
 *  standalone mention too. A sanity cap (<60 towers) guards against a
 *  mis-parsed range swallowing unrelated numbers elsewhere in the
 *  sentence (dates, measurements, ...) as "towers". Rows saying literally
 *  "Tidak ada temuan" are treated as having no tower reference, same as a
 *  blank field. Both prose regexes require a WORD BOUNDARY immediately
 *  before "T" (`\bT`) — without it, the trailing "T" in words like "SUTT"
 *  (as in the ever-present "TOWER SUTT 150 KV ..." prefix) would itself
 *  satisfy "T" + whitespace + digits and spuriously extract "150" as a
 *  tower number from the voltage rating text — confirmed live as a real
 *  false positive (SAMPIT tower "150" showing 36 fabricated matches)
 *  before this boundary was added. */
function extractTowerNumbers(text: string): Set<string> {
  const result = new Set<string>();
  if (!text || /^tidak ada temuan\.?$/i.test(text.trim())) return result;

  const hashRe = /#(\d{1,3})\b/g;
  let hashMatch: RegExpExecArray | null;
  while ((hashMatch = hashRe.exec(text)) !== null) result.add(hashMatch[1]);

  const rangeRe = /\bT(?:ower)?\.?\s*(\d{1,3})\s*[-–]\s*(?:\bT(?:ower)?\.?\s*)?(\d{1,3})\b/gi;
  const consumed: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start < 60) {
      for (let n = start; n <= end; n++) result.add(String(n));
      consumed.push([m.index, m.index + m[0].length]);
    }
  }

  let masked = text;
  for (const [s, e] of consumed.sort((a, b) => b[0] - a[0])) {
    masked = masked.slice(0, s) + " ".repeat(e - s) + masked.slice(e);
  }
  const singleRe = /\bT(?:ower)?\.?\s*(\d{1,3})\b/gi;
  while ((m = singleRe.exec(masked)) !== null) {
    result.add(m[1]);
  }
  return result;
}

interface ParsedEvent {
  towerNumbers: Set<string>;
  gi: string; // already normalized
  year: string;
  tgl: string;
  penyebab: string;
}

function parseEvents(records: Record<string, string>[]): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  for (const r of records) {
    const towerNumbers = extractTowerNumbers((r["TEMUAN LAPANGAN"] ?? "").trim());
    if (towerNumbers.size === 0) continue;
    const gardu = (r["GARDU INDUK"] ?? "").trim();
    if (!gardu) continue;
    const tgl = (r["TGL"] ?? "").trim();
    const year = extractYear(r["TAHUN"] ?? "", tgl);
    if (!year) continue;
    events.push({ towerNumbers, gi: canonicalGiKey(gardu), year, tgl, penyebab: (r["PENYEBAB"] ?? "").trim() });
  }
  return events;
}

/** funcLoc isn't available on this sheet, so matching falls back to
 *  (normalized GARDU INDUK, tower number) — exact for every ruas except
 *  the handful confirmed to reuse tower numbers across two different
 *  physical lines sharing one hub GI (e.g. "KASONGAN - SKS" and
 *  "KASONGAN - SUDAN" both touch GI Kasongan and both number towers
 *  1-236ish — see data-sources.ts's own comment on `suttAsset`). In that
 *  narrow overlap window a match could in principle attribute an event to
 *  the wrong one of the two lines; accepted as a known limitation rather
 *  than over-engineering a disambiguator for a handful of towers. Tower
 *  number uses the same shared giTowerKey() every consumer of this map
 *  uses (src/lib/gi-name.ts) — this free-text narrative sometimes
 *  preserves a leading zero ("T.093") that the SUTT asset registry's own
 *  "NO TOWER" column never carries ("93"); without normalizing both sides
 *  to the same (unpadded) form, a real repeat-offender tower would never
 *  resolve a ruas/unit on the pages that join against it. */
export async function getGangguanHistoryByTowerGi(): Promise<Record<string, GangguanHistoryEntry[]>> {
  const results = await readConfiguredSource(SOURCE);
  const sheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);
  if (!sheet) return {};

  const events = parseEvents(sheet.records);
  const byKey: Record<string, GangguanHistoryEntry[]> = {};
  for (const ev of events) {
    for (const towerNo of ev.towerNumbers) {
      const k = giTowerKey(ev.gi, towerNo);
      const list = byKey[k] ?? [];
      list.push({ year: ev.year, tgl: ev.tgl, penyebab: ev.penyebab });
      byKey[k] = list;
    }
  }
  for (const k of Object.keys(byKey)) {
    byKey[k].sort((a, b) => a.tgl.localeCompare(b.tgl));
  }
  return byKey;
}
