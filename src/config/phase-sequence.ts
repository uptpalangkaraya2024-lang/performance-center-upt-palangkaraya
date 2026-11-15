// Phase sequence (top -> middle -> bottom conductor) per line, from the
// user's own reference document "TRANSMISI ULTG PANGKALAN BUN" (PLN
// transmission map PDF, sent 2026-11-15). Used by the Gangguan page's
// "Fasa Terganggu" view to translate R/S/T into a physical position.
//
// Why this table exists alongside SIGAP's per-tower `fasa`: it is keyed by
// the LINE itself (the bay name in REKAP GANGGUAN), which settles corridors
// where one tower carries two different lines. Confirmed case: towers
// 1-131 out of GI Pangkalan Bun carry both PANGKALAN BUN - NANGABULIK
// (S-R-T) and PANGKALAN BUN - SUKAMARA (S-T-R); SIGAP only records
// "STR / SRT" there without saying which line is which. Every line below
// that SIGAP also covers agrees with SIGAP.
//
// `ranges` is for a transposed line: the sequence changes at given towers
// (both ends inclusive; the document writes shared boundary towers like
// "111-226" / "226-333", resolved here the same way SIGAP records them —
// the boundary tower belongs to the earlier range). A line with ranges
// needs the faulted tower number to be resolved.

export interface PhaseSequenceRange {
  fromTower: number;
  toTower: number;
  /** Top -> bottom, e.g. "SRT". */
  order: string;
}

export interface PhaseSequenceReference {
  /** Line name as "GI A - GI B" (order and spelling are normalized when
   *  matched, so either direction works). */
  line: string;
  /** "1" / "2" for one circuit of a double-circuit line; omitted = applies
   *  to every circuit of that line. */
  circuit?: string;
  order?: string;
  ranges?: PhaseSequenceRange[];
}

const SUKAMARA_KENDAWANGAN_RANGES: PhaseSequenceRange[] = [
  { fromTower: 1, toTower: 111, order: "SRT" },
  { fromTower: 112, toTower: 226, order: "STR" },
  { fromTower: 227, toTower: 333, order: "TRS" },
  { fromTower: 334, toTower: 438, order: "RST" },
];

export const PHASE_SEQUENCE_REFERENCE: PhaseSequenceReference[] = [
  { line: "SAMPIT - PARENGGEAN", order: "SRT" },
  { line: "SAMPIT - SUDAN", order: "SRT" },
  { line: "SAMPIT - BAGENDANG", order: "RST" },
  { line: "BAGENDANG - KUALA PAMBUANG", order: "SRT" },
  { line: "SAMPIT - PANGKALAN BANTENG", order: "SRT" },
  { line: "PANGKALAN BANTENG - PANGKALAN BUN", order: "SRT" },
  { line: "SAMPIT - PANGKALAN BUN", order: "SRT" },
  { line: "PANGKALAN BUN - NANGABULIK", order: "SRT" },
  { line: "PANGKALAN BUN - SUKAMARA", order: "STR" },
  { line: "NANGABULIK - SUKAMARA", order: "STR" },
  { line: "SUKAMARA - KENDAWANGAN", ranges: SUKAMARA_KENDAWANGAN_RANGES },
];
