// Work-type -> indicator mapping for Verifikasi Efektivitas (FASE 2) — which
// metric actually gets evaluated for a given kind of maintenance work.
// Per the user's own instruction: Anti Binatang work is checked against
// animal-caused gangguan, Penebangan ROW/Pohon against vegetation-caused
// gangguan, equipment re-testing/repair against AHI condition, and pure
// civil/facility work (Atap/AC/Pagar/Pondasi) isn't evaluated at all — a
// repaired fence has no AHI score and isn't expected to move gangguan
// frequency, so forcing a verdict on it would just be noise.
//
// NOT YET LIVE-EDITABLE IN SETTINGS. The user's spec asks for this table to
// be editable from a Settings page, but Settings has no persistence layer
// of any kind today (it's a literal "Coming Soon" placeholder — see
// src/app/dashboard/settings/page.tsx) and this app has no database by
// design (AGENTS.md). Making this genuinely user-editable means picking a
// storage mechanism — the user's own instructions ask to be asked before
// adding new storage, so that's flagged back to them rather than guessed.
// Until that's decided, this file IS the table — grounded in the real
// vocabulary confirmed live in both sheets (RENUS's own free-text
// "DETAIL PEKERJAAN" values, CE's own structured "Indikator" column), kept
// in one place so moving it into a real settings store later is a
// find-and-replace, not a redesign.
export type EffectivenessCategory = "binatang" | "row" | "ahi" | "tidak_relevan";

export const EFFECTIVENESS_CATEGORY_LABEL: Record<EffectivenessCategory, string> = {
  binatang: "Anti Binatang",
  row: "Penebangan ROW/Pohon",
  ahi: "Pengujian Ulang/Perbaikan Peralatan",
  tidak_relevan: "Fasilitas/Sipil (tidak dinilai)",
};

/** The Gangguan `cause` label (see src/services/disturbances.ts's own
 *  CAUSE_LABEL map) each category's gangguan-side verdict is scoped to —
 *  null means "every cause" (the AHI category's gangguan count isn't
 *  cause-filtered, same as before this FASE 2 change), and
 *  tidak_relevan is never gangguan-scored at all regardless of this map. */
export const EFFECTIVENESS_CATEGORY_CAUSE: Record<EffectivenessCategory, string | null> = {
  binatang: "Hewan",
  row: "Tegakan / Pohon",
  ahi: null,
  tidak_relevan: null,
};

// CE's own "Indikator" column is already structured as "<kode>-<suffix>"
// (e.g. "08_SUTT/ET-ROW", "09_FACILITY-Pagar GI") — classified by suffix,
// confirmed live against every distinct value this sheet currently uses.
// A suffix not listed here defaults to "tidak_relevan" (the safe default:
// skip rather than wrongly force a verdict) rather than guessing.
const CE_SUFFIX_MAP: [RegExp, EffectivenessCategory][] = [
  [/binatang/i, "binatang"],
  [/\brow\b/i, "row"],
  [/tanah tapak/i, "row"], // ROW-adjacent: vegetation/land clearing around the tower base
  [/\bahi\b/i, "ahi"],
  [/hotspot/i, "ahi"], // thermal condition — part of the AHI test battery
  [/\bgnd\b/i, "ahi"], // grounding condition
  [/bocor/i, "ahi"], // GIS leak — equipment condition
  [/\bpd\b/i, "ahi"], // partial discharge — equipment condition
  [/mekanik ops/i, "ahi"], // mechanical operation condition
  [/atap gedung/i, "tidak_relevan"],
  [/pondasi/i, "tidak_relevan"],
  [/air conditioner/i, "tidak_relevan"],
  [/pagar gi/i, "tidak_relevan"],
  [/dak kabel/i, "tidak_relevan"],
  [/desain/i, "tidak_relevan"], // design issues — not AHI- or gangguan-trackable
];

export function classifyCeIndikator(indikator: string): EffectivenessCategory {
  for (const [pattern, category] of CE_SUFFIX_MAP) {
    if (pattern.test(indikator)) return category;
  }
  return "tidak_relevan";
}

// RENUS's own "DETAIL PEKERJAAN" is free text, no structured category —
// classified by keyword, confirmed live against a sample of distinct
// values this sheet currently uses. RENUS work is essentially always
// equipment/line maintenance (facility/civil work is CE's domain, not
// RENUS's), so an unmatched item defaults to "ahi" rather than
// "tidak_relevan" — the opposite default from CE's own unmatched case,
// deliberately, since the two sheets cover different kinds of work.
const RENUS_KEYWORD_MAP: [RegExp, EffectivenessCategory][] = [
  [/anti\s*binatang|\bbinatang\b/i, "binatang"],
  [/penebangan|\brow\b|\bpohon\b|tegakan|vegetasi/i, "row"],
  [/\batap\b|pagar|pondasi|air\s*condition(er)?\b/i, "tidak_relevan"],
];

export function classifyRenusWorkDetail(workDetail: string): EffectivenessCategory {
  for (const [pattern, category] of RENUS_KEYWORD_MAP) {
    if (pattern.test(workDetail)) return category;
  }
  return "ahi";
}
