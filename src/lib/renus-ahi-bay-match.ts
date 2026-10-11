// Matches one RENUS row's own free-text `bay` field against the AHI Bay
// Report system's own BAY-column naming — confirmed live these two sheets
// name the same physical equipment differently in at least 3 distinct ways
// (GI order reversed for Bay Line corridors, "#1" vs " 1" numbering style,
// and outright different vocabulary like "BAY COUPLE" vs "BAY KOPEL"), so
// this can never be a plain string-equality check. Deliberately picks the
// TARGET KIND first from the RENUS bay's own prefix, then only searches
// that one kind's own AHI bay list — never a cross-kind fuzzy match, so a
// Kapasitor row can never accidentally resolve to a Kopel bay just because
// they share a GI name.
//
// Every alias below was confirmed against live data, not guessed — see the
// comments on each. New ones surface over time the same way these did (a
// RENUS bay with zero candidates here); add them to ALIASES/the per-kind
// extractor rather than loosening the matching logic itself.
import type { BayLineOption, BayReportKind } from "@/types";

export interface BayMatchCandidate {
  kind: BayReportKind;
  bay: string;
  gi: string;
  ultg: string;
}

// Word-level aliases applied before tokenizing — confirmed live: RENUS and
// AHI use outright different vocabulary for the same physical thing in
// these 2 cases ("COUPLE"/"KOPEL" for the bus-coupler bay kind, "PAMBUANG"
// a confirmed misspelling of "PEMBUANG" already flagged on the Kesehatan
// Data page). Keyed by the word AS WRITTEN in RENUS's own sheet; expand
// this table as new mismatches are found, never by relaxing the matcher.
const WORD_ALIASES: Record<string, string> = {
  COUPLE: "KOPEL",
  PAMBUANG: "PEMBUANG",
};

function applyWordAliases(s: string): string {
  return s
    .split(/\b/)
    .map((word) => WORD_ALIASES[word.toUpperCase()] ?? word)
    .join("");
}

/** Strips voltage boilerplate ("150 KV", "150/20 KV", "11/150 KV") and the
 *  generic GI/GIS/PLTU/BAY/GI-code words every bay name carries somewhere —
 *  none of these distinguish one bay from another, they're just noise
 *  around the part that does (the GI name, the circuit/unit number, the
 *  bus letter). Confirmed live both RENUS and AHI use all of these words
 *  interchangeably/inconsistently, never as a meaningful signal. */
function stripBoilerplate(s: string): string {
  return s
    .replace(/\b\d+(\s*\/\s*\d+)?\s*KV\b/gi, " ")
    .replace(/\bMVA\b/gi, " ")
    .replace(/\(NEW\)/gi, " ")
    .replace(/\bGIS?\b/gi, " ")
    .replace(/\bPLTU\b/gi, " ")
    .replace(/\bBAY\b/gi, " ");
}

function giTokenSet(s: string): string {
  return [...new Set(s.toUpperCase().split(/[^A-Z]+/).filter((t) => t.length > 1))].sort().join("|");
}

interface ExtractResult {
  giKey: string;
  /** Extra discriminator beyond the GI name — circuit number, bus letter,
   *  diameter position code. null when the bay kind has no such thing
   *  (Reaktor/Kapasitor: only 1 unit per GI exists today). */
  discriminator: string | null;
}

/** Bay Line: "BAY LINE <GI1> - <GI2>[ N|#N]" (both sides) — GI order is
 *  confirmed reversed between the two sheets for the same physical
 *  corridor, so the GI pair is compared as a SET, not a sequence. The
 *  trailing circuit number (when present) is kept as a separate
 *  discriminator — it's the one thing that's NOT interchangeable (circuit
 *  1 and circuit 2 are two different physical conductors). */
function extractLine(raw: string): ExtractResult | null {
  const afterPrefix = raw.replace(/^BAY\s+LINE\s+/i, "");
  const numberMatch = /[\s#](\d+)\s*$/.exec(afterPrefix);
  const discriminator = numberMatch ? numberMatch[1] : null;
  const withoutNumber = numberMatch ? afterPrefix.slice(0, numberMatch.index) : afterPrefix;
  const sides = withoutNumber.split(/\s*-\s*/).map((s) => giTokenSet(stripBoilerplate(s)));
  if (sides.length !== 2 || sides.some((s) => !s)) return null;
  return { giKey: [...sides].sort().join("||"), discriminator };
}

/** Bay Trafo via RENUS's own "TD" naming ("TD <n> 150/20 KV <GI>") — a
 *  structurally different word ("TD" = Trafo Distribusi, the LV side)
 *  for the exact same physical transformer AHI calls "BAY TRAFO <n> <GI>"
 *  — confirmed live by matching GI + unit number together (e.g. "TD 1 ...
 *  BUNTOK" <-> "BAY TRAFO 1 BUNTOK"). Also handles the rare case RENUS
 *  already writes "BAY TRAFO" directly. */
function extractTrafo(raw: string): ExtractResult | null {
  const tdMatch = /^TD\s+(\d+)\s+/i.exec(raw);
  const trafoMatch = /^BAY\s+TRAFO\s+(\d+)\s+/i.exec(raw);
  const match = tdMatch ?? trafoMatch;
  if (!match) return null;
  const discriminator = match[1];
  const gi = giTokenSet(stripBoilerplate(raw.slice(match[0].length)));
  if (!gi) return null;
  return { giKey: gi, discriminator };
}

/** Bay Reaktor/Bay Kapasitor: "BAY REAKTOR [GI] <GI>" / "BAY KAPASITOR
 *  [GI] <GI>" — no unit number on either sheet (only 1 unit per GI exists
 *  today for either kind), so no discriminator. */
function extractSingleUnitByGi(raw: string, kindPrefix: RegExp): ExtractResult | null {
  const afterPrefix = raw.replace(kindPrefix, "");
  const gi = giTokenSet(stripBoilerplate(afterPrefix));
  if (!gi) return null;
  return { giKey: gi, discriminator: null };
}

/** Bay Kopel: "BAY KOPEL <GI>" (AHI) / "BAY COUPLE <voltage> KV <GI>"
 *  (RENUS, after the COUPLE->KOPEL word alias already ran) — no unit
 *  number, a GI only ever has one coupler bay. */
function extractKopel(raw: string): ExtractResult | null {
  return extractSingleUnitByGi(raw, /^BAY\s+KOPEL\s+/i);
}

/** Bay GT: "BAY GT [#]<n> <GI>" on both sides, but AHI's own GIS Mintin
 *  entries drop "GIS"/"GI" while others don't — stripBoilerplate already
 *  removes that word either way, so only the number + GI matter. */
function extractGt(raw: string): ExtractResult | null {
  const match = /^BAY\s+GT\s*#?\s*(\d+)\s+/i.exec(raw);
  if (!match) return null;
  const gi = giTokenSet(stripBoilerplate(raw.slice(match[0].length)));
  if (!gi) return null;
  return { giKey: gi, discriminator: match[1] };
}

/** Bay Bus: "BUS <A|B> [GI] <GI>" — the bus letter is the discriminator
 *  (never a number), since a GI's own 2 bus sections are never
 *  interchangeable. */
function extractBus(raw: string): ExtractResult | null {
  const match = /^BUS\s+([AB])\b\s*/i.exec(raw);
  if (!match) return null;
  const gi = giTokenSet(stripBoilerplate(raw.slice(match[0].length)));
  if (!gi) return null;
  return { giKey: gi, discriminator: match[1].toUpperCase() };
}

/** Bay Diameter: both sheets write the position+number code directly
 *  ("5A3"/"5AB1"/"5B2") right before the word "DIAMETER" — that code
 *  alone already uniquely identifies the bay (Bagendang-only today), so
 *  it's used as-is rather than re-parsed into GI + sub-fields. */
function extractDiameter(raw: string): ExtractResult | null {
  const codeMatch = /(5A?B?\d+)\s*DIAMETER/i.exec(raw);
  if (!codeMatch) return null;
  return { giKey: codeMatch[1].toUpperCase(), discriminator: null };
}

const KIND_EXTRACTORS: { test: RegExp; kind: BayReportKind; extract: (raw: string) => ExtractResult | null }[] = [
  { test: /^BAY\s+LINE\b/i, kind: "bay-line", extract: extractLine },
  { test: /^(TD|BAY\s+TRAFO)\b/i, kind: "bay-trafo", extract: extractTrafo },
  { test: /^BAY\s+REAKTOR\b/i, kind: "bay-reaktor", extract: (r) => extractSingleUnitByGi(r, /^BAY\s+REAKTOR\s+/i) },
  { test: /^BAY\s+KAPASITOR\b/i, kind: "bay-kapasitor", extract: (r) => extractSingleUnitByGi(r, /^BAY\s+KAPASITOR\s+/i) },
  { test: /^BAY\s+KOPEL\b/i, kind: "bay-kopel", extract: extractKopel },
  { test: /^BAY\s+GT\b/i, kind: "bay-gt", extract: extractGt },
  { test: /^BUS\b/i, kind: "bay-bus", extract: extractBus },
  { test: /DIAMETER/i, kind: "bay-diameter", extract: extractDiameter },
];

/** Resolves one RENUS bay string to its target AHI report kind + a 0/1/N
 *  candidate match within that kind's own bay options — never searches
 *  across kinds. A RENUS bay whose prefix doesn't match any of the 8 known
 *  kinds, or whose own text doesn't parse into a GI, comes back with an
 *  empty candidate list and `kind: null` — shown as "belum ada Report AHI
 *  yang cocok" rather than silently dropped. */
export function matchRenusBay(
  renusBay: string,
  ahiOptionsByKind: Record<BayReportKind, BayLineOption[]>,
): { kind: BayReportKind | null; candidates: BayMatchCandidate[] } {
  const aliased = applyWordAliases(renusBay.trim());

  for (const { test, kind, extract } of KIND_EXTRACTORS) {
    if (!test.test(aliased)) continue;
    const parsed = extract(aliased);
    if (!parsed) return { kind, candidates: [] };

    const candidates = ahiOptionsByKind[kind]
      .map((option) => {
        const extracted = KIND_EXTRACTORS.find((k) => k.kind === kind)!.extract(option.bay);
        return { option, extracted };
      })
      .filter(({ extracted }) => extracted && extracted.giKey === parsed.giKey)
      .filter(({ extracted }) => parsed.discriminator === null || extracted!.discriminator === parsed.discriminator)
      .map(({ option }) => ({ kind, bay: option.bay, gi: option.gi, ultg: option.ultg }));

    return { kind, candidates };
  }

  return { kind: null, candidates: [] };
}
