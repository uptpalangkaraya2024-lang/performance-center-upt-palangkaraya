// Pure matching + WhatsApp-text formatting for the Gangguan "Cari Titik
// Gangguan" fault locator. No "server-only" here on purpose — the ruas list
// is fetched once server-side (src/services/sutt-asset.ts) and handed to
// the client component as plain data; every search after that (VAISALA/
// TWFL/SMDE/Fault Locator Relay distance -> nearest tower) runs instantly
// in the browser against that already-loaded list, the same "load once,
// derive many" shape used by every other module's own compute lib
// (ce-compute.ts, four-dx-compute.ts, ...).
import type { GangguanHistoryEntry, SuttRuas, SuttTower } from "@/types";
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
  /** matched tower's own distance minus the (direction-adjusted) input distance — signed, km. 0 for an exact match. */
  deltaKm: number;
  before: SuttTower | null;
  after: SuttTower | null;
  /** true when the input distance fell outside [0, ruas.lengthKm] — the
   *  match is still the nearest valid tower (clamped to an end), just
   *  flagged so the UI can warn instead of presenting it as exact. Always
   *  false for an exact match (there's no "nearest" guess to flag). */
  outOfRange: boolean;
  /** true when this came from a direct tower-number (VAISALA) or tower-ke
   *  ordinal (SMDE) input rather than a nearest-match-to-a-distance guess
   *  — no selisih/bracketing towers to show, since there's no ambiguity. */
  exact: boolean;
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
    exact: false,
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

function exactMatch(tower: SuttTower): TowerMatch {
  return { tower, deltaKm: 0, before: null, after: null, outOfRange: false, exact: true };
}

/** Strips a leading zero run before a digit ("001A" -> "1A", "036" ->
 *  "36") so a user typing the number as they'd naturally say it ("1A",
 *  "36") still matches the sheet's own zero-padded sub-tower labels. */
function normalizeTowerNoForMatch(raw: string): string {
  return raw.trim().toUpperCase().replace(/^0+(?=\d)/, "");
}

/** VAISALA's own report names a tower directly (it locates a strike point,
 *  not a distance along the conductor) — exact lookup by label, not a
 *  nearest-km guess. */
export function findTowerByNumber(ruas: SuttRuas, towerNo: string): SuttTower | null {
  const needle = normalizeTowerNoForMatch(towerNo);
  if (!needle) return null;
  return ruas.towers.find((t) => normalizeTowerNoForMatch(t.towerNo) === needle) ?? null;
}

/** SMDE can report "tower ke-N dari GI X" (the Nth physical tower counting
 *  from one end) instead of a km figure — resolved by indexing straight
 *  into `ruas.towers` (already physical order, ascending by distanceKm),
 *  reversed when counting from the far end. This deliberately ignores the
 *  tower's own NO TOWER label for the counting itself: that label can
 *  skip/insert (e.g. "036A" between 36 and 37), so "the Nth physical
 *  structure" and "the tower labeled N" are not the same thing — counting
 *  array position sidesteps that mismatch entirely. */
export function findTowerByOrdinal(ruas: SuttRuas, ordinal: number, direction: FaultDirection): SuttTower | null {
  if (!Number.isInteger(ordinal) || ordinal < 1) return null;
  const ordered = direction === "origin" ? ruas.towers : [...ruas.towers].reverse();
  return ordered[ordinal - 1] ?? null;
}

/** A "ruas" whose own NAMA_SECTION starts with "INCOMER " is a short spur
 *  line, not a point-to-point line between two original GIs — it exists
 *  because a newer GI was built that physically taps into (splices onto)
 *  one circuit of an EXISTING line at one specific tower, then runs its
 *  own few extra towers out to the new substation. DATA SUTT UPT PKY
 *  records the incomer's own towers as their own ruas, but never records
 *  WHERE on the original line it taps from — that's only in the user's
 *  own field knowledge, given here by hand and confirmed live (every
 *  entry below: the named tap tower really exists on the named ruas, with
 *  a sane cumulative distance and sequential neighbors — none fabricated
 *  or guessed from the sheet alone).
 *
 *  INCOMER SKS (the 7th "INCOMER " ruas in the data) has no entry here —
 *  its own tap point/tower wasn't given — so it's still flagged as an
 *  incomer in the UI, just without the "taps from X at tower Y" detail. */
export interface IncomerTapInfo {
  incomerSection: string; // the INCOMER ruas's own NAMA_SECTION
  gi: string; // the new GI's bare name (no "GI ### KV " prefix)
  tapRuasSection: string; // the EXISTING ruas it splices into
  tapTowerNo: string; // that ruas's own tower number at the splice point
}

export const INCOMER_TAPS: IncomerTapInfo[] = [
  { incomerSection: "INCOMER PANGKALAN BANTENG", gi: "PANGKALAN BANTENG", tapRuasSection: "SAMPIT - PANGKALAN BUN", tapTowerNo: "345" },
  { incomerSection: "INCOMER NANGABULIK", gi: "NANGABULIK", tapRuasSection: "PANGKALAN BUN - SUKAMARA", tapTowerNo: "137" },
  // KASONGAN - SUDAN's own NAMA_SIRKIT is literally "KASONGAN - SAMPIT"
  // (confirmed live) — a double-circuit line sharing one set of physical
  // towers, where Parenggean splices into one circuit at 335 and Sudan
  // splices into the other at 370; both tap towers genuinely exist on
  // this one ruas's own tower list.
  { incomerSection: "INCOMER PARENGGEAN", gi: "PARENGGEAN", tapRuasSection: "KASONGAN - SUDAN", tapTowerNo: "335" },
  { incomerSection: "INCOMER SUDAN", gi: "SUDAN", tapRuasSection: "KASONGAN - SUDAN", tapTowerNo: "370" },
  { incomerSection: "INCOMER SEBANGAU", gi: "SEBANGAU", tapRuasSection: "MINTIN - PALANGKARAYA", tapTowerNo: "330" },
  { incomerSection: "INCOMER PULANG PISAU", gi: "PULANG PISAU", tapRuasSection: "MINTIN - PALANGKARAYA", tapTowerNo: "117" },
];

export function isIncomerRuas(section: string): boolean {
  return section.toUpperCase().startsWith("INCOMER ");
}

export function findIncomerTapInfo(incomerSection: string): IncomerTapInfo | null {
  return INCOMER_TAPS.find((t) => t.incomerSection === incomerSection) ?? null;
}

/** Every known incomer that splices into this specific ruas — a main ruas
 *  can have more than one (KASONGAN - SUDAN and MINTIN - PALANGKARAYA each
 *  have two), so this always returns an array, never a single value. */
export function findIncomersTappingFrom(ruasSection: string): IncomerTapInfo[] {
  return INCOMER_TAPS.filter((t) => t.tapRuasSection === ruasSection);
}

/** True when the matched tower IS a known incomer's own splice point on
 *  this ruas — the strongest possible signal that the fault could be on
 *  the incomer spur instead of (or as well as) the ruas being searched,
 *  since the physical junction sits exactly there. */
export function findIncomerTapAtTower(ruasSection: string, towerNo: string): IncomerTapInfo | null {
  const needle = normalizeTowerNoForMatch(towerNo);
  return INCOMER_TAPS.find((t) => t.tapRuasSection === ruasSection && normalizeTowerNoForMatch(t.tapTowerNo) === needle) ?? null;
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

/** Every method funnels through one of these. Which modes a given method's
 *  own UI actually offers is a UI concern (see sutt-fault-locator-view.tsx)
 *  — this type itself doesn't restrict e.g. VAISALA to "tower"/"no-strike"
 *  only, since the matching/formatting logic below is happy to resolve
 *  any mode for any method. */
export type MethodEntry =
  | { method: FaultMethod; mode: "empty" }
  | { method: FaultMethod; mode: "distance"; distanceKm: number }
  | { method: FaultMethod; mode: "tower"; towerNo: string }
  | { method: FaultMethod; mode: "ordinal"; ordinal: number }
  /** VAISALA-specific: a positive "no lightning recorded here" finding,
   *  distinct from "the field was left blank" — both skip a tower match,
   *  but the WA text says something different for each. */
  | { method: FaultMethod; mode: "no-strike" };

export function resolveMethodEntry(ruas: SuttRuas, entry: MethodEntry, direction: FaultDirection): TowerMatch | null {
  switch (entry.mode) {
    case "distance":
      return locateFault(ruas, entry.distanceKm, direction);
    case "tower": {
      const tower = findTowerByNumber(ruas, entry.towerNo);
      return tower ? exactMatch(tower) : null;
    }
    case "ordinal": {
      const tower = findTowerByOrdinal(ruas, entry.ordinal, direction);
      return tower ? exactMatch(tower) : null;
    }
    default:
      return null; // "empty" / "no-strike" — nothing to resolve
  }
}

function describeEntry(entry: MethodEntry, direction: FaultDirection, ruas: SuttRuas): string {
  switch (entry.mode) {
    case "distance":
      return formatKm(entry.distanceKm);
    case "tower":
      return `Tower ${entry.towerNo} (dilaporkan langsung)`;
    case "ordinal":
      return `Tower ke-${entry.ordinal} dari ${direction === "origin" ? ruas.originLabel : ruas.farEndLabel}`;
    default:
      return "";
  }
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
  entry: MethodEntry;
  /** human-readable description of what was entered, e.g. "12,40 km",
   *  "Tower 36 (dilaporkan langsung)", "Tower ke-12 dari BAGENDANG". */
  inputLabel: string;
  match: TowerMatch;
}

export function buildMethodResults(ruas: SuttRuas, direction: FaultDirection, entries: MethodEntry[]): MethodResult[] {
  const results: MethodResult[] = [];
  for (const entry of entries) {
    if (entry.mode === "empty" || entry.mode === "no-strike") continue;
    const match = resolveMethodEntry(ruas, entry, direction);
    if (match) results.push({ method: entry.method, entry, inputLabel: describeEntry(entry, direction, ruas), match });
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
 *  lightning strikes (not the full history, to keep the WA text short).
 *  SIGAP's own "Gangguan <year>" series used to be shown here too, but was
 *  dropped per the user's own direction: its unit was never documented by
 *  SIGAP's API and the live values are fractional and grow in scale year
 *  over year (low single digits in 2021 vs up to ~200 by 2025) — not what
 *  a plain incident count should look like. Real gangguan history now
 *  comes from the UPT's own REKAP GANGGUAN instead — see
 *  formatGangguanHistoryLines() below and src/services/gangguan-
 *  history.ts. Returns [] when SIGAP has nothing for this tower (not
 *  matched, or genuinely zero on record) — callers just skip the section
 *  rather than showing an empty one. */
export function formatSigapInsightLines(insight: SigapTowerInsight): string[] {
  const lines: string[] = [];
  const recentSambaran = insight.sambaranPerTahun.slice(-3);
  if (recentSambaran.length > 0) {
    lines.push(`⚡ Sambaran petir (SIGAP): ${recentSambaran.map((y) => `${y.year}: ${y.value}`).join(" · ")}`);
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

// Same GI-name prefix stripping as src/services/gangguan-history.ts's own
// copy (which is what actually built the lookup keys) — must match
// exactly for the lookup below to hit.
function normalizeGiNameForLookup(raw: string): string {
  return raw.replace(/^GIS?\s*\d+\s*KV\s*/i, "").trim().toUpperCase();
}

/** This tower's own past gangguan events from the UPT's REKAP GANGGUAN —
 *  see src/services/gangguan-history.ts for how TEMUAN LAPANGAN gets
 *  parsed into (GI, tower number) matches. Sorted oldest first. */
export function findGangguanHistory(
  tower: SuttTower,
  historyByGiTower: Record<string, GangguanHistoryEntry[]>,
): GangguanHistoryEntry[] {
  const key = `${normalizeGiNameForLookup(tower.gi)}::${tower.towerNo}`;
  return historyByGiTower[key] ?? [];
}

/** Per-year cause breakdown (e.g. "2024: Petir ×2, Hewan ×1 · 2025: Petir
 *  ×1") plus a total count — unlike SIGAP's own ambiguous "Gangguan
 *  <year>" figure, every number here is a literal count of rows in the
 *  UPT's own gangguan rekap that named this tower, so "Total gangguan
 *  tercatat sebelumnya" can be stated as an exact count, not hedged. */
export function formatGangguanHistoryLines(entries: GangguanHistoryEntry[]): string[] {
  if (entries.length === 0) return [];
  const byYear = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const causeMap = byYear.get(e.year) ?? new Map<string, number>();
    const causeLabel = e.penyebab || "Tidak diketahui";
    causeMap.set(causeLabel, (causeMap.get(causeLabel) ?? 0) + 1);
    byYear.set(e.year, causeMap);
  }
  const perYear = [...byYear.keys()].sort().map((year) => {
    const causes = [...byYear.get(year)!.entries()].map(([c, n]) => (n > 1 ? `${c} ×${n}` : c)).join(", ");
    return `${year}: ${causes}`;
  });
  return [
    `⚠️ Riwayat gangguan tercatat (REKAP GANGGUAN): ${perYear.join(" · ")}`,
    `Total gangguan tercatat sebelumnya: ${entries.length} kali`,
  ];
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
  gangguanHistoryByGiTower?: Record<string, GangguanHistoryEntry[]>,
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
  const ownTap = isIncomerRuas(ruas.section) ? findIncomerTapInfo(ruas.section) : null;
  if (ownTap) {
    lines.push(`🔀 Ruas Incomer — tersambung dari *${ownTap.tapRuasSection}* di Tower ${ownTap.tapTowerNo}`);
  }
  const incomersHere = findIncomersTappingFrom(ruas.section);
  if (incomersHere.length > 0) {
    lines.push(
      `🔀 Ada ${incomersHere.length} percabangan Incomer dari ruas ini: ${incomersHere
        .map((t) => `${t.gi} (Tower ${t.tapTowerNo})`)
        .join(", ")}`,
    );
  }
  lines.push("");

  const results = buildMethodResults(ruas, direction, entries);
  const resultByMethod = new Map(results.map((r) => [r.method, r]));

  for (const entry of entries) {
    lines.push(`📍 *${FAULT_METHOD_LABELS[entry.method]}*`);
    if (entry.mode === "empty") {
      lines.push("Tidak diisi");
      lines.push("");
      continue;
    }
    if (entry.mode === "no-strike") {
      lines.push("Tidak terdapat sambaran petir");
      lines.push("");
      continue;
    }
    const result = resultByMethod.get(entry.method);
    if (!result) {
      lines.push(
        entry.mode === "tower"
          ? `Nomor tower "${entry.towerNo}" tidak ditemukan di ruas ini`
          : entry.mode === "ordinal"
            ? `Tower ke-${entry.ordinal} melebihi jumlah tower di ruas ini`
            : "Data ruas tidak tersedia",
      );
      lines.push("");
      continue;
    }
    const { match } = result;

    if (entry.mode === "distance") {
      lines.push(`Jarak dilaporkan: ${formatKm(entry.distanceKm)}`);
      lines.push(`→ Tower *${match.tower.towerNo}* (${formatKm(match.tower.distanceKm)}, selisih ${formatSignedKm(match.deltaKm)})`);
    } else {
      lines.push(`${result.inputLabel}`);
      lines.push(`→ Tower *${match.tower.towerNo}* (${formatKm(match.tower.distanceKm)}) — pasti, bukan estimasi`);
    }
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
    const tapHere = findIncomerTapAtTower(ruas.section, match.tower.towerNo);
    if (tapHere) {
      lines.push(
        `🔀 Tower ini titik sambung Incomer ${tapHere.gi} — jika gangguan diduga di jalur incomer, cek juga ruas "${tapHere.incomerSection}".`,
      );
    }
    if (isTowerKritis(match.tower)) lines.push("⚠️ Tower Kritis — ada catatan penanganan/mitigasi.");
    if (hasFaultHistory(match.tower)) lines.push("⚡ Ada riwayat gangguan tercatat di tower ini.");
    const unbalanceLine = formatUnbalanceLine(match.tower);
    if (unbalanceLine) lines.push(unbalanceLine);
    const sigapInsight = insightsByFuncLoc ? findSigapInsight(match.tower, insightsByFuncLoc) : null;
    if (sigapInsight) lines.push(...formatSigapInsightLines(sigapInsight));
    const gangguanHistory = gangguanHistoryByGiTower ? findGangguanHistory(match.tower, gangguanHistoryByGiTower) : [];
    if (gangguanHistory.length > 0) lines.push(...formatGangguanHistoryLines(gangguanHistory));
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
