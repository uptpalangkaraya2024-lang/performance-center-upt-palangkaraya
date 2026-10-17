// Pure matching + WhatsApp-text formatting for the Gangguan "Cari Titik
// Gangguan" fault locator. No "server-only" here on purpose — the ruas list
// is fetched once server-side (src/services/sutt-asset.ts) and handed to
// the client component as plain data; every search after that (VAISALA/
// TWFL/SMDE/Fault Locator Relay distance -> nearest tower) runs instantly
// in the browser against that already-loaded list, the same "load once,
// derive many" shape used by every other module's own compute lib
// (ce-compute.ts, four-dx-compute.ts, ...).
import type { SuttRuas, SuttTower } from "@/types";
import type { SigapTowerInsight } from "@/services/sigap";

// User-specified order (not alphabetical): VAISALA, TWFL, SMDE, then Fault
// Locator Relay last.
export const FAULT_METHODS = ["VAISALA", "TWFL", "SMDE", "FAULT_LOCATOR_RELAY"] as const;
export type FaultMethod = (typeof FAULT_METHODS)[number];

export const FAULT_METHOD_LABELS: Record<FaultMethod, string> = {
  VAISALA: "VAISALA",
  TWFL: "TWFL",
  SMDE: "SMDE",
  FAULT_LOCATOR_RELAY: "Fault Locator Relay",
};

/** Which end of the ruas the entered distance is measured from — a ruas's
 *  own `originGi`/`farEndLabel` (km 0 / km lengthKm) are fixed by the data,
 *  but a relay/device can sit at either physical end, so this flips which
 *  one the input distance counts from. Shared by all 3 methods in one
 *  search (see sutt-asset.ts's own comment on why: in practice one fault
 *  report uses one agreed reference end, not a different one per device). */
export type FaultDirection = "origin" | "far";

export interface TowerMatch {
  tower: SuttTower;
  /** matched tower's own distance minus the (direction-adjusted) input distance — signed, km. */
  deltaKm: number;
  before: SuttTower | null;
  after: SuttTower | null;
  /** true when the input distance fell outside [0, ruas.lengthKm] — the
   *  match is still the nearest valid tower (clamped to an end), just
   *  flagged so the UI can warn instead of presenting it as exact. */
  outOfRange: boolean;
}

/** `towers` must already be sorted ascending by distanceKm (true of every
 *  SuttRuas.towers — see sutt-asset.ts). */
export function findNearestTower(towers: SuttTower[], distanceKm: number): TowerMatch | null {
  if (towers.length === 0) return null;

  let nearest = towers[0];
  let nearestAbsDelta = Math.abs(towers[0].distanceKm - distanceKm);
  let before: SuttTower | null = null;
  let after: SuttTower | null = null;

  for (const t of towers) {
    const absDelta = Math.abs(t.distanceKm - distanceKm);
    if (absDelta < nearestAbsDelta) {
      nearest = t;
      nearestAbsDelta = absDelta;
    }
    if (t.distanceKm <= distanceKm) before = t;
    if (t.distanceKm >= distanceKm && after === null) after = t;
  }

  const last = towers[towers.length - 1];
  const outOfRange = distanceKm < towers[0].distanceKm || distanceKm > last.distanceKm;

  return {
    tower: nearest,
    deltaKm: Math.round((nearest.distanceKm - distanceKm) * 1000) / 1000,
    before,
    after,
    outOfRange,
  };
}

/** Converts a raw entered distance into the ruas's own fixed (origin ->
 *  far-end) coordinate frame before matching — "far" means the distance
 *  counts down from the far end instead of up from the origin. */
export function effectiveDistanceKm(ruas: SuttRuas, rawDistanceKm: number, direction: FaultDirection): number {
  return direction === "origin" ? rawDistanceKm : ruas.lengthKm - rawDistanceKm;
}

export function locateFault(ruas: SuttRuas, rawDistanceKm: number, direction: FaultDirection): TowerMatch | null {
  return findNearestTower(ruas.towers, effectiveDistanceKm(ruas, rawDistanceKm, direction));
}

/** Looks up this ruas's own SIGAP "bayLine" shorthand (e.g. "PKY-KSG") via
 *  each tower's funcLoc — see src/services/sigap.ts for why that's a
 *  reliable join key. Returns the first match found (a ruas maps to one
 *  bayLine in practice); null when SIGAP's map is empty/unreachable or no
 *  tower here has a funcLoc match, so callers can simply hide the field. */
export function findSigapBayLine(ruas: SuttRuas, insightsByFuncLoc: Record<string, SigapTowerInsight>): string | null {
  for (const t of ruas.towers) {
    const insight = insightsByFuncLoc[t.funcLoc];
    if (insight?.bayLine) return insight.bayLine;
  }
  return null;
}

/** Looks up this ruas's own SIGAP phase sequence (e.g. "RST") — same
 *  pattern as findSigapBayLine, since SIGAP's `fasa` is confirmed live to
 *  be constant across every tower on one circuit (phase order is a
 *  whole-circuit property), not something that varies tower by tower. */
export function findSigapFasa(ruas: SuttRuas, insightsByFuncLoc: Record<string, SigapTowerInsight>): string | null {
  for (const t of ruas.towers) {
    const insight = insightsByFuncLoc[t.funcLoc];
    if (insight?.fasa) return insight.fasa;
  }
  return null;
}

/** The matched TOWER's own SIGAP data (lightning strikes/gangguan history
 *  per year, height, peak current) — unlike findSigapBayLine (one code per
 *  whole ruas), this is genuinely per-tower: two towers on the same ruas
 *  can have very different strike histories. null when unmatched. */
export function findSigapInsight(tower: SuttTower, insightsByFuncLoc: Record<string, SigapTowerInsight>): SigapTowerInsight | null {
  return insightsByFuncLoc[tower.funcLoc] ?? null;
}

// The UPT's own curated Google My Maps with every SUTT tower already
// plotted as a point (user-provided — a map they maintain in their own
// Drive, not something this app builds or edits). My Maps' public viewer
// has no documented way to select one specific placemark by id, but
// centering the viewer URL on a tower's own lat/long via `ll=` at a tight
// zoom opens this authoritative map already looking at the right spot,
// with every neighboring tower still visible for context.
const SUTT_MY_MAPS_ID = "1CmUoRNb6iqw8wDsFhivqCqWEj4XELKg";

export function buildSuttMyMapsLink(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  return `https://www.google.com/maps/d/viewer?mid=${SUTT_MY_MAPS_ID}&ll=${lat},${lon}&z=18`;
}

/** Turn-by-turn navigation to the tower, as distinct from buildSuttMyMapsLink's
 *  "look at this map" purpose — a plain `maps?q=` pin drops a marker but
 *  doesn't offer directions, which is the more practical ask for a field crew. */
export function buildDirectionsLink(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

export function buildEarthLink(lat: number | null, lon: number | null): string | null {
  if (lat === null || lon === null) return null;
  return `https://earth.google.com/web/@${lat},${lon},500a,1000d,35y,0h,0t,0r`;
}

export function isTowerKritis(tower: SuttTower): boolean {
  return Boolean(tower.towerKritisPenanganan || tower.towerKritisMitigasi || tower.towerKritisTglEksekusi);
}

export function hasFaultHistory(tower: SuttTower): boolean {
  return Boolean(tower.historyGangguan || tower.historyGangguanPetir);
}

export interface MethodEntry {
  method: FaultMethod;
  /** null = this method's field was left blank, skipped entirely. */
  distanceKm: number | null;
}

function formatKm(km: number): string {
  return `${km.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
}

function formatSignedKm(km: number): string {
  const sign = km > 0 ? "+" : "";
  return `${sign}${km.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`;
}

/** One method's full result block — what the UI result card and the WA
 *  text block both render from (buildMethodResults feeds both), so the
 *  two never drift out of sync. */
export interface MethodResult {
  method: FaultMethod;
  distanceKm: number;
  match: TowerMatch;
}

export function buildMethodResults(ruas: SuttRuas, direction: FaultDirection, entries: MethodEntry[]): MethodResult[] {
  const results: MethodResult[] = [];
  for (const entry of entries) {
    if (entry.distanceKm === null) continue;
    const match = locateFault(ruas, entry.distanceKm, direction);
    if (match) results.push({ method: entry.method, distanceKm: entry.distanceKm, match });
  }
  return results;
}

/** The spread of towers the filled-in methods point to — a tight cluster
 *  (all matches close together) is a confidence signal for line patrol;
 *  a wide spread means the methods disagree and the search area is larger. */
export function summarizeSpread(results: MethodResult[]): { lowest: SuttTower; highest: SuttTower; spreadKm: number } | null {
  if (results.length === 0) return null;
  let lowest = results[0].match.tower;
  let highest = results[0].match.tower;
  for (const r of results) {
    if (r.match.tower.distanceKm < lowest.distanceKm) lowest = r.match.tower;
    if (r.match.tower.distanceKm > highest.distanceKm) highest = r.match.tower;
  }
  return { lowest, highest, spreadKm: Math.round((highest.distanceKm - lowest.distanceKm) * 1000) / 1000 };
}

function towerHeadline(tower: SuttTower): string {
  const bits = [tower.jenisTower, tower.tipeTower, tower.tahunOperasi ? `Thn ${tower.tahunOperasi}` : ""].filter(Boolean);
  return bits.join(" · ");
}

/** Compact lines for one tower's SIGAP history — last 3 years of recorded
 *  lightning strikes (not the full history, to keep the WA text short), and
 *  the FULL per-year breakdown of SIGAP's own "Gangguan <year>" series
 *  (every year it recorded a value > 0 for this tower, with that value),
 *  plus how many distinct years that covers. NOTE on the Gangguan number
 *  itself: SIGAP's API never documents its unit, and the live values are
 *  fractional and grow in scale year over year (e.g. low single digits in
 *  2021 vs up to ~200 by 2025) — not what a plain incident COUNT should
 *  look like, so this is shown as SIGAP's own recorded value, not
 *  asserted to be "N kejadian". The one thing confirmed live: it's sparse
 *  (only ~1-2% of towers have any value a given year), consistent with it
 *  tracking real tower-specific events rather than a universal computed
 *  figure — so a nonzero entry is still a meaningful corroborating signal,
 *  just not a number to quote as a literal incident tally. Returns [] when
 *  SIGAP has nothing for this tower (not matched, or genuinely zero on
 *  record) — callers just skip the section rather than showing an empty one. */
export function formatSigapInsightLines(insight: SigapTowerInsight): string[] {
  const lines: string[] = [];
  const recentSambaran = insight.sambaranPerTahun.slice(-3);
  if (recentSambaran.length > 0) {
    lines.push(`⚡ Sambaran petir (SIGAP): ${recentSambaran.map((y) => `${y.year}: ${y.value}`).join(" · ")}`);
  }
  const gangguanTercatat = insight.gangguanPerTahun.filter((y) => y.value > 0);
  if (gangguanTercatat.length > 0) {
    lines.push(
      `⚠️ Indikasi gangguan per tahun (SIGAP): ${gangguanTercatat.map((y) => `${y.year}: ${y.value}`).join(" · ")}`,
    );
    lines.push(`Jumlah tahun tercatat pernah gangguan: ${gangguanTercatat.length} tahun`);
  }
  if (insight.arusTertinggiKa !== null) {
    lines.push(`Arus sambaran tertinggi tercatat: ${insight.arusTertinggiKa} kA`);
  }
  return lines;
}

/** UNBALANCE from DATA SUTT UPT PKY — descriptive text (e.g. "EKSTERNAL
 *  (LINE 2)"), not a flag, with its own realisasi date when present.
 *  NOTE: there is no "urutan fasa" (phase sequence) column anywhere in
 *  that sheet — confirmed live by scanning every header for "fasa"/
 *  "phase"/"urutan" — so that specific field genuinely isn't tracked
 *  there and isn't fabricated here. */
export function formatUnbalanceLine(tower: SuttTower): string | null {
  if (!tower.unbalance) return null;
  return tower.unbalanceRealisasi
    ? `Unbalance isolator: ${tower.unbalance} (realisasi ${tower.unbalanceRealisasi})`
    : `Unbalance isolator: ${tower.unbalance}`;
}

/** Plain text, WhatsApp-ready (single asterisks for *bold*, no tables/HTML)
 *  — the same thing the result cards show, just flattened into one
 *  copy-paste block. direction/originLabel/farEndLabel come straight off
 *  the ruas so the message always states which end the km figures count
 *  from, since that's invisible once a number is typed in. */
export function formatWaMessage(
  ruas: SuttRuas,
  direction: FaultDirection,
  entries: MethodEntry[],
  insightsByFuncLoc?: Record<string, SigapTowerInsight>,
): string {
  const refLabel = direction === "origin" ? ruas.originLabel : ruas.farEndLabel;
  const sigapBayLine = insightsByFuncLoc ? findSigapBayLine(ruas, insightsByFuncLoc) : null;
  const sigapFasa = insightsByFuncLoc ? findSigapFasa(ruas, insightsByFuncLoc) : null;
  const lines: string[] = [];
  lines.push("*LOKALISIR TITIK GANGGUAN*");
  lines.push(`Ruas: *${ruas.section}* (${ruas.unit})`);
  lines.push(
    `Panjang ruas ${formatKm(ruas.lengthKm)} — jarak diukur dari *${refLabel}*`,
  );
  if (sigapBayLine) lines.push(`Kode SIGAP: *${sigapBayLine}*`);
  if (sigapFasa) lines.push(`Urutan fasa (SIGAP): *${sigapFasa}*`);
  lines.push("");

  const results = buildMethodResults(ruas, direction, entries);
  const resultByMethod = new Map(results.map((r) => [r.method, r]));

  for (const entry of entries) {
    lines.push(`📍 *${FAULT_METHOD_LABELS[entry.method]}*`);
    if (entry.distanceKm === null) {
      lines.push("Tidak diisi");
      lines.push("");
      continue;
    }
    const result = resultByMethod.get(entry.method);
    if (!result) {
      lines.push("Data ruas tidak tersedia");
      lines.push("");
      continue;
    }
    const { match } = result;

    lines.push(`Jarak dilaporkan: ${formatKm(entry.distanceKm)}`);
    lines.push(`→ Tower *${match.tower.towerNo}* (${formatKm(match.tower.distanceKm)}, selisih ${formatSignedKm(match.deltaKm)})`);
    if (match.outOfRange) {
      lines.push(`⚠️ Jarak di luar panjang ruas (0 – ${formatKm(ruas.lengthKm)}) — tower terdekat ditampilkan.`);
    }
    if (match.before && match.after && match.before.towerNo !== match.after.towerNo) {
      lines.push(
        `Di antara Tower ${match.before.towerNo} (${formatKm(match.before.distanceKm)}) – Tower ${match.after.towerNo} (${formatKm(match.after.distanceKm)})`,
      );
    }
    const headline = towerHeadline(match.tower);
    if (headline) lines.push(headline);
    if (isTowerKritis(match.tower)) lines.push("⚠️ Tower Kritis — ada catatan penanganan/mitigasi.");
    if (hasFaultHistory(match.tower)) lines.push("⚡ Ada riwayat gangguan tercatat di tower ini.");
    const unbalanceLine = formatUnbalanceLine(match.tower);
    if (unbalanceLine) lines.push(unbalanceLine);
    const sigapInsight = insightsByFuncLoc ? findSigapInsight(match.tower, insightsByFuncLoc) : null;
    if (sigapInsight) lines.push(...formatSigapInsightLines(sigapInsight));
    const myMaps = buildSuttMyMapsLink(match.tower.lat, match.tower.lon);
    if (myMaps) lines.push(`Peta SUTT (Tower): ${myMaps}`);
    const directions = buildDirectionsLink(match.tower.lat, match.tower.lon);
    if (directions) lines.push(`Petunjuk arah: ${directions}`);
    const earth = buildEarthLink(match.tower.lat, match.tower.lon);
    if (earth) lines.push(`Google Earth: ${earth}`);
    lines.push("");
  }

  if (results.length > 1) {
    const spread = summarizeSpread(results);
    if (spread) {
      lines.push(
        spread.spreadKm === 0
          ? `✅ Semua metode mengarah ke Tower ${spread.lowest.towerNo} — konsisten.`
          : `Rentang gabungan: Tower ${spread.lowest.towerNo} – Tower ${spread.highest.towerNo} (selisih ${formatKm(spread.spreadKm)}).`,
      );
    }
  }

  return lines.join("\n").trimEnd();
}
