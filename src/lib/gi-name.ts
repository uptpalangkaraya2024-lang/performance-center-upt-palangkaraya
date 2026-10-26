// Shared GI-name and tower-number normalization — the single place this
// logic lives now. Before this module, 7 different files each carried
// their own copy of the "strip GI/GIS <n> KV prefix" regex, and 3 separate,
// mutually-INCONSISTENT alias mechanisms handled the PAMBUANG/PEMBUANG
// spelling split (two of them folded in opposite directions). Confirmed
// live against the DATA GARDU INDUK registry sheet (src/services/sutt-
// asset.ts's own buildGiRegistry, the one sheet maintained directly by the
// asset team): the registry's own spelling is "PAMBUANG" and "NANGABULIK"
// (no space) — every other sheet (CE, RENUS, SUTT asset, Gangguan) already
// agrees with the registry; AHI's own sheet is the sole outlier using
// "PEMBUANG". So PAMBUANG/NANGABULIK are treated as canonical here, not an
// arbitrary pick.
//
// Two different concerns, kept separate on purpose:
//  - `correctGiSpelling` only fixes known spelling drift, case-preserving —
//    safe to apply to a value that will be DISPLAYED to a user.
//  - `canonicalGiKey` additionally strips the voltage prefix and uppercases
//    everything — a join/lookup key only, never meant for display (its
//    whole point is throwing away exactly the distinctions — case, prefix
//    wording — that would otherwise fracture one real GI into two rows).

const GI_PREFIX_RE = /^GIS?\s*(\d+(?:\s*\/\s*\d+)?\s*KV\s*)?/i;

/** Strips the "GI 150 KV "/"GIS 150 KV " prefix only — case and the rest
 *  of the string untouched. The common first step for every GI-name
 *  reader in this codebase (CE's "GI X", RENUS's "GI 150 KV X", AHI/
 *  Disturbances/SUTT asset's own bare-or-prefixed forms). */
export function stripGiPrefix(raw: string): string {
  return raw.replace(GI_PREFIX_RE, "").trim();
}

// Add new confirmed spelling-variant pairs here, never by relaxing a
// matcher elsewhere — keyed as (pattern to fix) -> (registry's own
// spelling). Order matters only in that multi-word patterns should run
// before any per-word tokenizer downstream would otherwise split them.
const GI_SPELLING_ALIASES: [RegExp, string][] = [
  [/\bNANGA\s+BULIK\b/gi, "NANGABULIK"],
  [/\bPEMBUANG\b/gi, "PAMBUANG"],
];

/** Case-preserving spelling correction — fixes known sheet-to-sheet
 *  drift (e.g. AHI's "Kuala Pembuang" -> "Kuala Pambuang") without
 *  uppercasing or otherwise touching the rest of the string. Safe for
 *  display. */
export function correctGiSpelling(raw: string): string {
  let s = raw;
  for (const [pattern, replacement] of GI_SPELLING_ALIASES) s = s.replace(pattern, replacement);
  return s;
}

/** Prefix-stripped, spelling-corrected, uppercased — a join/lookup key
 *  only. Two GI names that are "the same GI" by any sheet's own spelling
 *  or letter case resolve to the same key here. */
export function canonicalGiKey(raw: string): string {
  return correctGiSpelling(stripGiPrefix(raw)).toUpperCase();
}

/** Tower numbers are formatted inconsistently across sheets — the SUTT
 *  asset registry's own "NO TOWER" column stores them unpadded ("93"),
 *  while the Gangguan rekap's free-text TEMUAN LAPANGAN narrative
 *  preserves whatever padding was typed ("093") when extracting a tower
 *  reference. Normalizing to the plain integer form makes a GI+tower join
 *  key match regardless of which sheet it came from. Falls back to the
 *  trimmed original for a non-numeric value (should not happen for a real
 *  tower number, but never silently drop a value that doesn't parse). */
export function canonicalTowerNo(raw: string): string {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  return trimmed !== "" && Number.isFinite(n) ? String(n) : trimmed;
}

/** The shared GI+tower join key used everywhere a gangguan event needs to
 *  be matched back to a specific physical tower (fault locator, repeat-
 *  offender hotspots, ruas infographic). */
export function giTowerKey(gi: string, towerNo: string): string {
  return `${canonicalGiKey(gi)}::${canonicalTowerNo(towerNo)}`;
}
