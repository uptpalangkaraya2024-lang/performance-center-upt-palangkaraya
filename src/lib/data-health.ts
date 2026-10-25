// Pure, cross-module "data quality" compute — proactively surfaces the same
// classes of live-data inconsistency that had to be discovered by hand,
// module by module, over the course of this dashboard's build-out (ULTG
// spelling variants, blank attribution fields, near-duplicate GI names).
// Nothing here reads a sheet itself; every check takes already-fetched
// module data (same promises the homepage/each page already awaits) and
// looks for rows that don't fit the shape every *-compute.ts file assumes.
import { normalizeGiName } from "@/lib/asset-correlation";
import { ULTG_CANONICAL_KEYS, ultgKey } from "@/lib/ultg";
import type { AboSnapshot, AhiAnomalyRecord, CeItem, FourDxLm, RenusRow, SuttRuas, UptKpi, UltgKpi } from "@/types";

export interface DataHealthCheck {
  id: string;
  /** Which module's own sheet this would need fixing in. */
  module: string;
  title: string;
  severity: "warning" | "info";
  detail: string;
  /** A few concrete examples — never the full list, so this stays
   *  skimmable even when a check finds dozens of rows. */
  samples: string[];
  count: number;
}

const CANONICAL_SET = new Set<string>(ULTG_CANONICAL_KEYS);

/** Any raw ULTG string whose own ultgKey() doesn't land in one of the 3
 *  known buckets — ultgKey already absorbs every spelling/casing/prefix
 *  variant confirmed live across every module (see ultg.ts's own comment),
 *  so anything still falling outside the 3 buckets here is either blank,
 *  a genuine typo, or a 4th ULTG value nothing in this codebase has ever
 *  seen before. */
function unrecognizedUltgCheck(module: string, values: string[]): DataHealthCheck | null {
  const bad = new Map<string, number>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!CANONICAL_SET.has(ultgKey(trimmed))) {
      bad.set(trimmed, (bad.get(trimmed) ?? 0) + 1);
    }
  }
  if (bad.size === 0) return null;
  const entries = [...bad.entries()].sort((a, b) => b[1] - a[1]);
  return {
    id: `ultg-unrecognized-${module}`,
    module,
    title: "Nilai ULTG tidak dikenali",
    severity: "warning",
    detail: `${entries.reduce((s, [, n]) => s + n, 0)} baris dengan nilai ULTG yang tidak cocok ke salah satu dari 3 ULTG yang dikenal (Palangkaraya/Pangkalan Bun/Muara Teweh) — kemungkinan typo atau baris kosong di sheet sumber.`,
    samples: entries.slice(0, 5).map(([v, n]) => `"${v}" (${n}x)`),
    count: entries.reduce((s, [, n]) => s + n, 0),
  };
}

/** Rows missing the field the rest of this dashboard assumes is present
 *  for GI/ULTG attribution (per-GI risk scoring, ULTG rollups, etc.) — a
 *  blank value here silently drops that row from every per-GI/per-ULTG
 *  view rather than erroring, so it's otherwise invisible. */
function blankFieldCheck(module: string, field: string, values: (string | null | undefined)[]): DataHealthCheck | null {
  const blankCount = values.filter((v) => !v || !v.trim()).length;
  if (blankCount === 0) return null;
  return {
    id: `blank-${field}-${module}`,
    module,
    title: `Kolom "${field}" kosong`,
    severity: "info",
    detail: `${blankCount} dari ${values.length} baris tidak memiliki nilai "${field}" — baris ini tidak ikut terhitung di breakdown per-GI/per-ULTG manapun.`,
    samples: [],
    count: blankCount,
  };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export interface GiNamePair {
  a: string;
  b: string;
  distance: number;
}

/** Near-duplicate GI names across the pooled set of normalized names every
 *  per-GI view (buildGiCorrelation) already reads — a distance-1/2 pair
 *  among names long enough that a small typo is a more likely explanation
 *  than two genuinely different GIs having similar names (short names like
 *  "GI A" vs "GI B" are excluded). Doesn't prove either name is wrong, only
 *  that they're worth a human glance before trusting the per-GI table to
 *  have merged them correctly (it won't — normalizeGiName does prefix
 *  stripping only, never fuzzy matching). */
export function findSimilarGiNamePairs(names: string[]): GiNamePair[] {
  const distinct = [...new Set(names.map((n) => normalizeGiName(n).trim()).filter((n) => n.length >= 5))];
  const pairs: GiNamePair[] = [];
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      const d = levenshtein(distinct[i], distinct[j]);
      if (d > 0 && d <= 2) pairs.push({ a: distinct[i], b: distinct[j], distance: d });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}

/** A weekly realisasi far past its own target — 4DX's own
 *  `percentRealisasiMingguan` is a raw, uncapped ratio (confirmed never
 *  recomputed/capped, unlike UPT/ULTG's own "Pencapaian" column, whose
 *  capping-110% formula is PLN's own contract rule this app doesn't
 *  reimplement — see UptKpi's own comment — so that one isn't a reliable
 *  ">100% = suspicious" signal, only 4DX's is). The 200% threshold (not
 *  100%) is deliberate: genuinely exceeding a weekly target 1.5x isn't
 *  unusual for a small count-based Lead Measure, but 2x+ is a more
 *  plausible typo/unit mistake than real over-performance. */
function overRealisasiCheck(lms: { code: string; description: string; percentRealisasiMingguan: number | null }[]): DataHealthCheck | null {
  const bad = lms.filter((lm) => lm.percentRealisasiMingguan !== null && lm.percentRealisasiMingguan > 2);
  if (bad.length === 0) return null;
  return {
    id: "4dx-realisasi-over-200pct",
    module: "4DX",
    title: "Realisasi mingguan jauh di atas target",
    severity: "warning",
    detail: `${bad.length} Lead Measure dengan realisasi mingguan lebih dari 200% dari target — kemungkinan salah input jumlah atau salah satuan.`,
    samples: bad.slice(0, 5).map((lm) => `${lm.code} (${Math.round((lm.percentRealisasiMingguan ?? 0) * 100)}%)`),
    count: bad.length,
  };
}

/** A realization date earlier than its own planned/target date — can't
 *  realize something before it was planned, so this is always a data
 *  entry mistake (wrong date typed, or the two columns swapped), never a
 *  legitimate state. */
function backwardDateCheck(module: string, pairs: { label: string; plannedDate: string; actualDate: string | null }[]): DataHealthCheck | null {
  const bad = pairs.filter((p) => p.actualDate !== null && p.actualDate < p.plannedDate);
  if (bad.length === 0) return null;
  return {
    id: `backward-date-${module}`,
    module,
    title: "Tanggal realisasi mendahului tanggal rencana",
    severity: "warning",
    detail: `${bad.length} baris dengan tanggal realisasi LEBIH AWAL dari tanggal rencana/target — kemungkinan salah ketik tanggal atau kolom rencana/realisasi tertukar.`,
    samples: bad.slice(0, 5).map((p) => `${p.label} (rencana ${p.plannedDate}, realisasi ${p.actualDate})`),
    count: bad.length,
  };
}

/** A KPI whose every synced month reads exactly 0 — distinct from a KPI
 *  with no data at all (monthlyTrend null, or every point null, both
 *  already excluded here): a run of real zeros across every month this
 *  far into the year is far more likely an unfilled sheet cell than a
 *  genuine zero result every single month. Needs at least 2 non-null
 *  months before flagging, so a KPI that only just started being tracked
 *  this month isn't mistaken for a long-standing gap. */
function allZeroMonthsCheck(
  module: string,
  kpis: { displayName: string; monthlyTrend: { month: string; value: number | null }[] | null }[],
): DataHealthCheck | null {
  const bad = kpis.filter((k) => {
    const points = (k.monthlyTrend ?? []).filter((p) => p.value !== null);
    return points.length >= 2 && points.every((p) => p.value === 0);
  });
  if (bad.length === 0) return null;
  return {
    id: `all-zero-months-${module}`,
    module,
    title: "Tren bulanan bernilai 0 di semua bulan",
    severity: "info",
    detail: `${bad.length} KPI dengan nilai 0 di seluruh bulan yang sudah tersinkron tahun ini — kemungkinan sel realisasi belum diisi, bukan hasil 0 yang sebenarnya.`,
    samples: bad.slice(0, 5).map((k) => k.displayName),
    count: bad.length,
  };
}

/** Towers recorded in Data Aset (DATA SUTT UPT PKY) with no usable
 *  coordinate — every per-tower map/fault-locator feature silently skips
 *  these (see sutt-map.ts's own `.filter((t) => t.lat !== null ...)`), so
 *  a tower missing LAT,LONG is invisible everywhere except this check. */
function missingAssetCoordsCheck(ruasList: SuttRuas[]): DataHealthCheck | null {
  let missing = 0;
  let total = 0;
  const samples: string[] = [];
  for (const ruas of ruasList) {
    for (const tower of ruas.towers) {
      total++;
      if (tower.lat === null || tower.lon === null) {
        missing++;
        if (samples.length < 5) samples.push(`${ruas.section} Tower ${tower.towerNo}`);
      }
    }
  }
  if (missing === 0) return null;
  return {
    id: "data-aset-missing-coords",
    module: "Data Aset",
    title: "Tower tanpa koordinat",
    severity: "warning",
    detail: `${missing} dari ${total} tower di Data Aset tidak punya LAT,LONG yang valid — tower ini tidak muncul di peta maupun fitur cari titik gangguan.`,
    samples,
    count: missing,
  };
}

/** A DATA GARDU INDUK row with a GI name but no usable unit/coordinates —
 *  buildGiRegistry (sutt-asset.ts) drops this row with no trace, so that GI
 *  never gets a map marker and never counts as "terdaftar" anywhere; this
 *  is the only place that drop becomes visible. */
function giRegistryDroppedCheck(dropped: string[]): DataHealthCheck | null {
  if (dropped.length === 0) return null;
  return {
    id: "data-gardu-induk-dropped",
    module: "Data Aset",
    title: "GI di DATA GARDU INDUK tanpa unit/koordinat",
    severity: "warning",
    detail: `${dropped.length} baris di sheet DATA GARDU INDUK punya nama GI tapi UNIT/LATITUDE/LONGITUDE kosong — GI ini tidak muncul di peta maupun hitungan "GI terdaftar".`,
    samples: dropped.slice(0, 5),
    count: dropped.length,
  };
}

/** Every check this page runs, combined — each module's data passed in
 *  exactly as its own service already returns it (no new reads), so this
 *  stays as cheap as any other *-compute.ts call and never drifts from
 *  what the rest of the dashboard is actually working with. */
export function buildDataHealthReport(params: {
  ceItems: CeItem[];
  renusRows: RenusRow[];
  anomalies: AhiAnomalyRecord[];
  aboSnapshots: { label: string; snapshot: AboSnapshot }[];
  fourDxLms: FourDxLm[];
  uptKpis: UptKpi[];
  ultgKpis: UltgKpi[];
  suttRuasList: SuttRuas[];
  giRegistryDropped: string[];
}): { checks: DataHealthCheck[]; giNamePairs: GiNamePair[] } {
  const checks: DataHealthCheck[] = [];

  const ceUltgCheck = unrecognizedUltgCheck("CE", params.ceItems.map((i) => i.ultg));
  if (ceUltgCheck) checks.push(ceUltgCheck);

  const renusUltgCheck = unrecognizedUltgCheck("RENUS", params.renusRows.map((r) => r.ultg));
  if (renusUltgCheck) checks.push(renusUltgCheck);

  const ahiUltgCheck = unrecognizedUltgCheck("AHI", params.anomalies.map((a) => a.ultg));
  if (ahiUltgCheck) checks.push(ahiUltgCheck);

  for (const { label, snapshot } of params.aboSnapshots) {
    const ultgValues = snapshot.programs.flatMap((p) => [
      ...p.ultgBreakdown.map((u) => u.ultg),
      ...p.ruasItems.map((r) => r.ultg),
    ]);
    const aboCheck = unrecognizedUltgCheck(`ABO ${label}`, ultgValues);
    if (aboCheck) checks.push(aboCheck);
  }

  const ceGiBlank = blankFieldCheck("CE", "GARDU INDUK", params.ceItems.map((i) => i.gardu));
  if (ceGiBlank) checks.push(ceGiBlank);

  const renusGiBlank = blankFieldCheck("RENUS", "GI", params.renusRows.map((r) => r.gi));
  if (renusGiBlank) checks.push(renusGiBlank);

  const ahiGiBlank = blankFieldCheck("AHI", "GI", params.anomalies.map((a) => a.gi));
  if (ahiGiBlank) checks.push(ahiGiBlank);

  const overRealisasi = overRealisasiCheck(params.fourDxLms);
  if (overRealisasi) checks.push(overRealisasi);

  const renusBackwardDates = backwardDateCheck(
    "RENUS",
    params.renusRows.map((r) => ({ label: `${r.gi} — ${r.workDetail}`, plannedDate: r.rencanaDate, actualDate: r.realisasiDate })),
  );
  if (renusBackwardDates) checks.push(renusBackwardDates);

  const ceBackwardDates = backwardDateCheck(
    "CE",
    params.ceItems
      .filter((i) => i.tanggalTarget !== null)
      .map((i) => ({ label: `${i.gardu} — ${i.namaProgram}`, plannedDate: i.tanggalTarget as string, actualDate: i.tanggalRealisasi })),
  );
  if (ceBackwardDates) checks.push(ceBackwardDates);

  const uptAllZero = allZeroMonthsCheck("Kinerja UPT", params.uptKpis);
  if (uptAllZero) checks.push(uptAllZero);

  const ultgAllZero = allZeroMonthsCheck("Kinerja ULTG", params.ultgKpis);
  if (ultgAllZero) checks.push(ultgAllZero);

  const missingCoords = missingAssetCoordsCheck(params.suttRuasList);
  if (missingCoords) checks.push(missingCoords);

  const giRegistryDropped = giRegistryDroppedCheck(params.giRegistryDropped);
  if (giRegistryDropped) checks.push(giRegistryDropped);

  const giNamePairs = findSimilarGiNamePairs([
    ...params.ceItems.map((i) => i.gardu),
    ...params.renusRows.map((r) => r.gi),
    ...params.anomalies.map((a) => a.gi),
  ]);

  return { checks, giNamePairs };
}
