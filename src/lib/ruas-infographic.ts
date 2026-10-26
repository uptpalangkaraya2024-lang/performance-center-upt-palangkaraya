// Per-ruas infographic (feature #1) — one combined "report card" per SUTT
// line segment: AHI equipment condition, open CE findings, gangguan
// history, ABO program items, and the nearest RENUS outage at either
// endpoint GI, plus a rule-based readiness checklist for "what to do when
// this ruas is next padam." Pure, server-safe — every input is data a page
// already loads elsewhere in this app; this only re-groups it by ruas.
import { canonicalGiKey, correctGiSpelling, giTowerKey } from "@/lib/gi-name";
import { isRenusCancelled, isRenusDone, isRenusHighRisk } from "@/lib/renus-helpers";
import type { OutageImpactResult } from "@/lib/outage-impact";
import type {
  AboRuasItem,
  AhiAnomalyRecord,
  AhiKlasifikasi,
  BayLineReport,
  CeItem,
  GangguanHistoryEntry,
  RenusRow,
  SuttRuas,
} from "@/types";

// Worst-to-best order, mirrors ahi-bay-report-shared.ts's own LEGEND
// (1=BEST..5=CRITICAL) — used to pick the single worst klasifikasi across
// every equipment unit matched to a ruas for a one-glance badge.
const KLASIFIKASI_SEVERITY: Record<AhiKlasifikasi, number> = {
  CRITICAL: 5,
  POOR: 4,
  FAIR: 3,
  GOOD: 2,
  BEST: 1,
  "NO DATA": 0,
};

// AHI's own 1-5 numeric kategoriAhi -> klasifikasi, same LEGEND as
// ahi-bay-report-shared.ts (duplicated locally since this file never
// touches that module's grid-parsing code, same per-file-constant
// convention used throughout this codebase).
const KATEGORI_TO_KLASIFIKASI: Record<number, AhiKlasifikasi> = {
  1: "BEST",
  2: "GOOD",
  3: "FAIR",
  4: "POOR",
  5: "CRITICAL",
};

// "KUALA PAMBUANG" (the DATA GARDU INDUK registry's own spelling, also
// what SUTT asset/RENUS/CE/Gangguan all use) vs "KUALA PEMBUANG" (AHI's
// own sheet, the sole outlier) name the SAME GI — correctGiSpelling (src/
// lib/gi-name.ts) folds AHI's spelling toward the registry's before
// tokenizing, so every "BAY LINE ... KUALA PEMBUANG" AHI entry still
// matches this ruas's own "KUALA PAMBUANG" endpoint label even though the
// two sheets spell it differently.
function giTokenSet(s: string): string {
  return [
    ...new Set(
      correctGiSpelling(s)
        .toUpperCase()
        .replace(/\b\d+(\s*\/\s*\d+)?\s*KV\b/g, " ")
        .replace(/\bGIS?\b/g, " ")
        .replace(/\bPLTU\b/g, " ")
        .split(/[^A-Z]+/)
        .filter((t) => t.length > 1),
    ),
  ]
    .sort()
    .join("|");
}

function lineGiPairKey(raw: string): string | null {
  const afterPrefix = raw.replace(/^BAY\s+LINE\s+/i, "");
  const withoutNumber = afterPrefix.replace(/[\s#]\d+\s*$/, "");
  const sides = withoutNumber.split(/\s*-\s*/).map(giTokenSet);
  if (sides.length !== 2 || sides.some((s) => !s)) return null;
  return [...sides].sort().join("||");
}

// Most SUTT corridors are built as double-circuit lines sharing the same
// towers — confirmed live AHI's own "BAY LINE" naming distinguishes the
// two circuits almost everywhere ("BAY LINE BAGENDANG - KUALA PEMBUANG#1"
// / "#2", "BAY LINE BUNTOK - MUARA TEWEH 1" / "2" — both a "#N" and a
// plain " N" suffix style appear in the live sheet). lineGiPairKey() above
// deliberately STRIPS this suffix to confirm the corridor; this extracts
// the same suffix instead, so AHI condition for circuit 1 and circuit 2
// — which fail/get tested independently — never get merged into one
// ruas card the way they used to. Null means no circuit suffix at all
// (a genuine single-circuit corridor, e.g. "BAY LINE MINTIN - PULANG
// PISAU" — confirmed live some corridors have only one circuit).
function extractCircuitSuffix(raw: string): string | null {
  const afterPrefix = raw.replace(/^BAY\s+LINE\s+/i, "");
  const m = /[\s#](\d+)\s*$/.exec(afterPrefix);
  return m ? m[1] : null;
}

/** Every distinct circuit AHI's own data references for this ruas's GI
 *  pair, sorted — [null] when nothing references a circuit number at all
 *  (single-circuit corridor, or simply no AHI data yet for it), so the
 *  caller always gets at least one card instead of silently dropping the
 *  ruas. The SUTT tower/asset data itself has no circuit concept (towers
 *  are physically shared by both circuits), so AHI's own naming is the
 *  only available source of truth for how many circuits a corridor has. */
export function detectRuasCircuits(
  ruas: SuttRuas,
  ahiBayLineReports: BayLineReport[],
  ahiAnomalies: AhiAnomalyRecord[],
): (string | null)[] {
  const ruasGiKey = [giTokenSet(ruas.originLabel.toUpperCase()), giTokenSet(ruas.farEndLabel.toUpperCase())].sort().join("||");
  const circuits = new Set<string>();
  for (const r of ahiBayLineReports) {
    if (lineGiPairKey(r.bay) !== ruasGiKey) continue;
    const c = extractCircuitSuffix(r.bay);
    if (c) circuits.add(c);
  }
  for (const a of ahiAnomalies) {
    if (lineGiPairKey(a.bay) !== ruasGiKey) continue;
    const c = extractCircuitSuffix(a.bay);
    if (c) circuits.add(c);
  }
  if (circuits.size === 0) return [null];
  return [...circuits].sort((a, b) => Number(a) - Number(b));
}

export interface RuasInfographicSummary {
  section: string;
  /** Which physical circuit this card covers — "1", "2", or null when the
   *  corridor has no circuit distinction in AHI's own data at all (a
   *  genuine single-circuit line). Towers/route/outage data is identical
   *  across every circuit card of the same section (physically shared
   *  structure); only AHI condition is actually circuit-specific — CE,
   *  ABO, and RENUS don't carry a circuit reference in their own source
   *  sheets, so the same CE/ABO/RENUS items appear on every circuit card
   *  of a section rather than being arbitrarily split. */
  circuit: string | null;
  unit: string;
  originGi: string;
  farEndGi: string;
  lengthKm: number;
  towerCount: number;

  ahiAnomalies: AhiAnomalyRecord[];
  ahiBayLineReports: BayLineReport[];
  ahiWorstKlasifikasi: AhiKlasifikasi | null;

  ceItems: CeItem[];
  ceOpenCount: number;

  gangguanTotal: number;
  gangguanRecent: GangguanHistoryEntry[];

  aboItems: AboRuasItem[];
  aboOpenCount: number;

  /** Every RENUS row at either endpoint GI, not cancelled, oldest first —
   *  doubles as both the outage timeline and the source for `nextOutage`. */
  outageRows: RenusRow[];
  nextOutage: RenusRow | null;
  daysUntilNextOutage: number | null;

  /** Rule-based, data-driven only — never generic boilerplate, same
   *  principle as every other AiInsight-style list in this app. Empty when
   *  nothing in the joined data warrants a note. */
  readinessChecklist: string[];

  /** Graph-connectivity answer to "if this ruas is taken out, does any GI
   *  lose its only path to the network" — see outage-impact.ts for exactly
   *  what this does and doesn't claim to simulate. Null when the impact
   *  wasn't computed for this ruas (shouldn't happen in practice, since the
   *  caller runs buildOutageImpact over the same ruasList). */
  outageImpact: OutageImpactResult | null;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

export function buildRuasInfographic(params: {
  ruas: SuttRuas;
  /** null = build the "no specific circuit" card (every AHI entry with no
   *  circuit suffix at all, i.e. a single-circuit corridor); "1"/"2"/... =
   *  scope AHI matching to only that circuit's own entries. Always pass
   *  one of detectRuasCircuits()'s own results, never guessed. */
  circuit: string | null;
  ahiAnomalies: AhiAnomalyRecord[];
  ahiBayLineReports: BayLineReport[];
  ceItems: CeItem[];
  aboRuasItems: AboRuasItem[];
  renusRows: RenusRow[];
  gangguanByTowerGi: Record<string, GangguanHistoryEntry[]>;
  todayISO: string;
  /** Pre-computed over the WHOLE ruasList by the caller (buildOutageImpact
   *  needs the full network graph, not just this one ruas) — looked up by
   *  section here. */
  outageImpactBySection?: Map<string, OutageImpactResult>;
}): RuasInfographicSummary {
  const {
    ruas,
    circuit,
    ahiAnomalies,
    ahiBayLineReports,
    ceItems,
    aboRuasItems,
    renusRows,
    gangguanByTowerGi,
    todayISO,
    outageImpactBySection,
  } = params;

  const originGi = ruas.originLabel.toUpperCase();
  const farEndGi = ruas.farEndLabel.toUpperCase();
  const ruasGiKey = [giTokenSet(originGi), giTokenSet(farEndGi)].sort().join("||");
  // Canonicalized (spelling-corrected) endpoint set for matching against
  // other modules' own GI fields — kept separate from originGi/farEndGi
  // above (which only feed giTokenSet, itself already spelling-correcting)
  // so this Set agrees with canonicalGiKey(...) on the comparison side.
  const endpointGis = new Set([canonicalGiKey(ruas.originLabel), canonicalGiKey(ruas.farEndLabel)]);

  // --- AHI: match "BAY LINE <GI1> - <GI2>" entries to this ruas's own GI
  // pair (exact line match) AND this card's own circuit (see
  // extractCircuitSuffix's own comment — most corridors run 2 circuits on
  // shared towers, each with independent AHI condition), falling back to
  // "touches either endpoint GI" for anomalies whose bay isn't a Bay Line
  // string at all (other equipment kinds, not circuit-specific — shown on
  // every circuit card of this section, not just one, since there's no
  // signal to pick a single one).
  const ahiBayLineReportsMatched = ahiBayLineReports.filter(
    (r) => lineGiPairKey(r.bay) === ruasGiKey && extractCircuitSuffix(r.bay) === circuit,
  );
  const anomaliesByLine = ahiAnomalies.filter(
    (a) => lineGiPairKey(a.bay) === ruasGiKey && extractCircuitSuffix(a.bay) === circuit,
  );
  const anomaliesByGiFallback =
    anomaliesByLine.length > 0 ? [] : ahiAnomalies.filter((a) => endpointGis.has(canonicalGiKey(a.gi)));
  // Worst-first — the whole point of a one-glance infographic is surfacing
  // what needs attention, not whatever order the sheet happened to list it.
  const ahiAnomaliesMatched = [...(anomaliesByLine.length > 0 ? anomaliesByLine : anomaliesByGiFallback)].sort(
    (a, b) => b.kategoriAhi - a.kategoriAhi,
  );

  let worstSeverity = 0;
  let ahiWorstKlasifikasi: AhiKlasifikasi | null = null;
  for (const report of ahiBayLineReportsMatched) {
    for (const unit of report.units) {
      const sev = KLASIFIKASI_SEVERITY[unit.klasifikasi] ?? 0;
      if (sev > worstSeverity) {
        worstSeverity = sev;
        ahiWorstKlasifikasi = unit.klasifikasi;
      }
    }
  }
  // Bay Line report matching needs an exact GI-pair match and can miss a
  // real line (new/renamed bay, a spelling variant not yet in
  // gi-name.ts's own alias list) even when the anomaly rekap itself still lists
  // findings for this ruas — fold the anomaly list's own kategoriAhi in as
  // a second signal so the headline badge is never blank while findings
  // are visibly listed right below it.
  for (const anomaly of ahiAnomaliesMatched) {
    const klas = KATEGORI_TO_KLASIFIKASI[anomaly.kategoriAhi];
    const sev = klas ? (KLASIFIKASI_SEVERITY[klas] ?? 0) : 0;
    if (sev > worstSeverity) {
      worstSeverity = sev;
      ahiWorstKlasifikasi = klas;
    }
  }

  // --- CE: gardu is a single GI (not a ruas), so match on either endpoint.
  // OPEN items first — the actionable ones — so a short preview list never
  // happens to show only already-CLOSE items while OPEN ones scroll off.
  const ceItemsMatched = ceItems
    .filter((item) => item.gardu && endpointGis.has(canonicalGiKey(item.gardu)))
    .sort((a, b) => Number(a.done) - Number(b.done));
  const ceOpenCount = ceItemsMatched.filter((item) => !item.done).length;

  // --- Gangguan: sum per-tower history across every tower this ruas owns
  // (see gangguan-history.ts) — more precise than a GI-level count, since
  // it's scoped to this physical line's own towers, not just "something
  // happened at this GI."
  const gangguanEntries: GangguanHistoryEntry[] = [];
  for (const tower of ruas.towers) {
    const key = giTowerKey(tower.gi, tower.towerNo);
    const entries = gangguanByTowerGi[key];
    if (entries) gangguanEntries.push(...entries);
  }
  gangguanEntries.sort((a, b) => b.tgl.localeCompare(a.tgl));

  // --- ABO: free-text `asset` field, no structured GI/ruas column — a
  // best-effort match requiring BOTH endpoint GI names to appear as tokens
  // in the asset text, the same bar `lineGiPairKey` uses for an AHI line
  // match (never a single-GI match here, since that would also catch
  // unrelated bay/trafo work at the same GI that has nothing to do with
  // this specific line).
  const aboItemsMatched = aboRuasItems
    .filter((item) => {
      const tokens = giTokenSet(item.asset);
      return tokens.includes(giTokenSet(originGi)) && tokens.includes(giTokenSet(farEndGi));
    })
    .sort((a, b) => Number(a.done) - Number(b.done));
  const aboOpenCount = aboItemsMatched.filter((item) => !item.done).length;

  // --- RENUS: outage rows at either endpoint GI.
  const outageRows = renusRows
    .filter((r) => !isRenusCancelled(r) && endpointGis.has(canonicalGiKey(r.gi)))
    .sort((a, b) => a.rencanaDate.localeCompare(b.rencanaDate));
  const nextOutage =
    outageRows.find((r) => !isRenusDone(r) && r.rencanaDate >= todayISO) ??
    outageRows.find((r) => !isRenusDone(r)) ??
    null;
  const daysUntilNextOutage = nextOutage ? daysBetween(todayISO, nextOutage.rencanaDate) : null;

  // --- Readiness checklist: strictly derived from the above, never
  // generic boilerplate.
  const readinessChecklist: string[] = [];
  if (worstSeverity >= 4) {
    const unitsFromReports = ahiBayLineReportsMatched
      .flatMap((r) => r.units)
      .filter((u) => (KLASIFIKASI_SEVERITY[u.klasifikasi] ?? 0) >= 4)
      .map((u) => `${u.role}${u.techident ? ` (${u.techident})` : ""} — ${u.klasifikasi}`);
    // Falls back to the anomaly rekap's own bay/keterangan text when no Bay
    // Line report matched (see the comment above on anomaly-derived
    // worstSeverity) — same reason that fallback exists for the badge.
    const items =
      unitsFromReports.length > 0
        ? unitsFromReports
        : ahiAnomaliesMatched
            .filter((a) => (KATEGORI_TO_KLASIFIKASI[a.kategoriAhi] ? (KLASIFIKASI_SEVERITY[KATEGORI_TO_KLASIFIKASI[a.kategoriAhi]] ?? 0) : 0) >= 4)
            .map((a) => `${a.bay}${a.jenisAset ? ` (${a.jenisAset})` : ""} — Kategori ${a.kategoriAhi}`);
    readinessChecklist.push(
      `Uji/perbaiki peralatan berklasifikasi ${ahiWorstKlasifikasi} saat padam: ${[...new Set(items)].slice(0, 5).join(", ")}.`,
    );
  }
  if (ceOpenCount > 0) {
    readinessChecklist.push(`Selesaikan ${ceOpenCount} temuan Common Enemy yang masih OPEN di GI ${ruas.originLabel}/${ruas.farEndLabel}.`);
  }
  if (aboOpenCount > 0) {
    readinessChecklist.push(`Realisasikan ${aboOpenCount} item program ABO pada ruas ini yang belum tercapai.`);
  }
  const gangguanThisYear = gangguanEntries.filter((e) => e.year === todayISO.slice(0, 4)).length;
  if (gangguanThisYear >= 2) {
    readinessChecklist.push(`Ruas ini sudah ${gangguanThisYear}x gangguan tahun ini — cek potensi penyebab berulang di titik yang sama.`);
  }
  if (nextOutage && isRenusHighRisk(nextOutage)) {
    readinessChecklist.push(`Pekerjaan padam berikutnya berisiko ${nextOutage.risk} — pastikan mitigasi risiko sudah disiapkan.`);
  }
  const outageImpact = outageImpactBySection?.get(ruas.section) ?? null;
  if (outageImpact && outageImpact.isBridge) {
    readinessChecklist.push(
      `Ruas ini adalah satu-satunya jalur ke ${outageImpact.isolatedGis.length} GI (${outageImpact.isolatedGis.slice(0, 5).join(", ")}) — pastikan koordinasi padam total di GI tersebut sebelum dijadwalkan.`,
    );
  }

  return {
    section: ruas.section,
    circuit,
    unit: ruas.unit,
    originGi: ruas.originLabel,
    farEndGi: ruas.farEndLabel,
    lengthKm: ruas.lengthKm,
    towerCount: ruas.towers.length,
    ahiAnomalies: ahiAnomaliesMatched,
    ahiBayLineReports: ahiBayLineReportsMatched,
    ahiWorstKlasifikasi,
    ceItems: ceItemsMatched,
    ceOpenCount,
    gangguanTotal: gangguanEntries.length,
    gangguanRecent: gangguanEntries.slice(0, 5),
    aboItems: aboItemsMatched,
    aboOpenCount,
    outageRows,
    nextOutage,
    daysUntilNextOutage,
    readinessChecklist,
    outageImpact,
  };
}
