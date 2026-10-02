// Pure filter/option-building helpers for the Data Aset "Scanning Proteksi"
// view — deliberately NOT "server-only" so the client component owning the
// ULTG/GI/Ruas filter state can call it directly, same "load once in the
// service, derive many things here" split already used by
// src/lib/ce-compute.ts and src/lib/disturbance-presentation-compute.ts.

export const ALL_VALUE = "__all__";

export function uniqueSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const trimmed = (v ?? "").trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function buildUltgOptions(rows: { ultg: string }[]): string[] {
  return uniqueSorted(rows.map((r) => r.ultg));
}

// --- Bay-line shaped rows (MPU BAY LINE / BPU BAY LINE) ---------------------
// A line connects two GIs (dariGi/keGi) — filtering "by GI" matches either
// direction, since a technician looking up "SAMPIT" wants every line that
// touches Sampit regardless of which end it's listed as.

export function buildGiOptionsForBayLine(rows: { ultg: string; dariGi: string; keGi: string }[], ultg: string): string[] {
  const scoped = ultg === ALL_VALUE ? rows : rows.filter((r) => r.ultg === ultg);
  return uniqueSorted(scoped.flatMap((r) => [r.dariGi, r.keGi]));
}

export function buildBayOptionsForBayLine(
  rows: { ultg: string; dariGi: string; keGi: string; bay: string }[],
  ultg: string,
  gi: string,
): string[] {
  const scoped = rows.filter(
    (r) => (ultg === ALL_VALUE || r.ultg === ultg) && (gi === ALL_VALUE || r.dariGi === gi || r.keGi === gi),
  );
  return uniqueSorted(scoped.map((r) => r.bay));
}

export function filterBayLineRows<T extends { ultg: string; dariGi: string; keGi: string; bay: string }>(
  rows: T[],
  ultg: string,
  gi: string,
  bay: string,
): T[] {
  return rows.filter(
    (r) =>
      (ultg === ALL_VALUE || r.ultg === ultg) &&
      (gi === ALL_VALUE || r.dariGi === gi || r.keGi === gi) &&
      (bay === ALL_VALUE || r.bay === bay),
  );
}

// --- Per-GI shaped rows (MPU BUSPRO) -----------------------------------------
// Bus protection lives at the Gardu Induk level, not per bay — only 2
// filter levels (ULTG, GI), no third "ruas" level.

export function buildGiOptionsForGardu(rows: { ultg: string; gardu: string }[], ultg: string): string[] {
  const scoped = ultg === ALL_VALUE ? rows : rows.filter((r) => r.ultg === ultg);
  return uniqueSorted(scoped.map((r) => r.gardu));
}

export function filterGarduRows<T extends { ultg: string; gardu: string }>(rows: T[], ultg: string, gi: string): T[] {
  return rows.filter((r) => (ultg === ALL_VALUE || r.ultg === ultg) && (gi === ALL_VALUE || r.gardu === gi));
}

// --- ANOMALI rows (BAY/GI already combined in one column) -------------------

export function buildBayGiOptions(rows: { ultg: string; bayGi: string }[], ultg: string): string[] {
  const scoped = ultg === ALL_VALUE ? rows : rows.filter((r) => r.ultg === ultg);
  return uniqueSorted(scoped.map((r) => r.bayGi));
}

export function filterAnomaliRows<T extends { ultg: string; bayGi: string }>(rows: T[], ultg: string, bayGi: string): T[] {
  return rows.filter((r) => (ultg === ALL_VALUE || r.ultg === ultg) && (bayGi === ALL_VALUE || r.bayGi === bayGi));
}
