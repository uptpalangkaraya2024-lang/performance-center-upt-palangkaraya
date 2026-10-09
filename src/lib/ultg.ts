// Shared canonical-ULTG matching, used wherever two or more modules' own
// raw ULTG strings need to land in the same 3 buckets. Confirmed live that
// every module spells these differently: ABO's own "🖥️ PKY" sheet reads
// "PANGKALANBUN" with no space; ABO's "📝 INPUT PKY" mixes "PANGKALAN BUN"
// and "PANGKALANBUN" across rows; 4DX/CE/AHI/RENUS/Disturbances all use
// "ULTG PALANGKARAYA" style (with the "ULTG " prefix, space-separated);
// Data Aset's anomali sheet has no "ULTG " prefix at all. A single
// space-stripped, prefix-stripped, uppercased key normalizes all of these
// to the same 3 buckets regardless of which module supplied the string.
export const ULTG_CANONICAL_KEYS = ["PALANGKARAYA", "PANGKALANBUN", "MUARATEWEH"] as const;

export function ultgKey(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^ULTG\s*/, "")
    .replace(/\s+/g, "");
}

/** Canonical "ULTG <Name>" display string for any of the 3 known ULTGs,
 *  regardless of the raw spelling/casing/prefix it came from. Falls back to
 *  a best-effort "ULTG <raw>" for anything unrecognized, rather than
 *  silently dropping a 4th value a future sheet edit might introduce. */
export function ultgDisplayName(raw: string): string {
  const key = ultgKey(raw);
  if (key === "PALANGKARAYA") return "ULTG Palangkaraya";
  if (key === "PANGKALANBUN") return "ULTG Pangkalan Bun";
  if (key === "MUARATEWEH") return "ULTG Muara Teweh";
  return raw.toUpperCase().startsWith("ULTG") ? raw : `ULTG ${raw}`;
}
