export type StatusLevel = "good" | "warning" | "critical" | "none";

export interface UltgPerformance {
  id: string;
  name: string;
  kpi: string;
  target: number;
  actual: number;
  achievement: number;
  status: StatusLevel;
  trend: "up" | "down" | "flat";
  rank: number;
}

export interface DisturbanceCause {
  cause: string;
  count: number;
}

/** One row per month, one numeric field per year present in the data — e.g.
 *  `{ month: "Januari", "2024": 12, "2025": 9 }`. Lets the YoY chart plot an
 *  arbitrary number of year-lines from one flat Recharts-friendly shape. */
export interface DisturbanceMonthlyYearPoint {
  month: string;
  [year: string]: string | number;
}

export interface DisturbanceBayCount {
  bay: string;
  count: number;
}

/** Straight from the sheet's own "GARDU INDUK" column — a single, unambiguous
 *  GI per disturbance row (even for a Transmisi/line event, unlike the bay
 *  name which names both line endpoints). See src/services/disturbances.ts. */
export interface DisturbanceGiCount {
  gi: string;
  count: number;
}

export interface DisturbanceFollowUpSummary {
  open: number;
  closed: number;
  /** Blank cell or a sheet formula error (e.g. "#DIV/0!") — genuinely
   *  unknown, never guessed as open or closed. */
  unknown: number;
}

export interface DisturbanceDurationRecord {
  bay: string;
  gi: string;
  /** Formatted "DD Mon YYYY". */
  tgl: string;
  durationMinutes: number;
}

/** Per-ULTG breakdown — ULTG is UPT Palangkaraya's own sub-unit, read
 *  directly from the sheet's own ULTG column (3 distinct values, no
 *  normalization needed, unlike GARDU INDUK). */
export interface DisturbanceUltgSummary {
  ultg: string;
  total: number;
  trip: number;
  /** Always 0 for the Trafo category — no auto-reclose scheme exists there. */
  arSukses: number;
  tidakTrip: number;
  followUp: DisturbanceFollowUpSummary;
  causePareto: DisturbanceCause[];
}

/** Per-bay ("ruas") breakdown — the same NAMA BAY GANGGUAN values as
 *  `topBay`/`allBayCounts`, just with kind (Trip/AR/Tidak Trip) and cause
 *  detail added per bay instead of a bare count. */
export interface DisturbanceBaySummary {
  bay: string;
  ultg: string;
  gi: string;
  total: number;
  trip: number;
  arSukses: number;
  tidakTrip: number;
  followUp: DisturbanceFollowUpSummary;
  causePareto: DisturbanceCause[];
}

export interface DisturbanceCategorySummary {
  total: number;
  trip: number;
  arSukses: number;
  tidakTrip: number;
  /** Formatted "DD Mon YYYY", or null if the category has no data. */
  latestDisturbance: string | null;
}

export interface DisturbanceCauseMonthlyYear {
  cause: string;
  data: DisturbanceMonthlyYearPoint[];
}

/** Same shape as DisturbanceCauseMonthlyYear, sliced by KODE GGN (Trip / AR
 *  Sukses / Tidak Trip) instead of PENYEBAB — lets the YoY chart filter to
 *  one jenis gangguan instead of one cause. */
export interface DisturbanceKindMonthlyYear {
  kind: string;
  data: DisturbanceMonthlyYearPoint[];
}

/** Same shape again, sliced by ULTG — lets the YoY chart filter to one sub
 *  unit to see how much of the year-over-year trend it's driving. */
export interface DisturbanceUltgMonthlyYear {
  ultg: string;
  data: DisturbanceMonthlyYearPoint[];
}

/** Everything needed to render one category's (Transmisi or Trafo) section
 *  of the Gangguan page — see src/services/disturbances.ts. */
export interface DisturbanceCategoryResult {
  summary: DisturbanceCategorySummary;
  causePareto: DisturbanceCause[];
  kindBreakdown: DisturbanceCause[];
  /** "Semua Penyebab" (all-causes) monthly-by-year matrix. */
  monthlyByYear: DisturbanceMonthlyYearPoint[];
  /** Same shape, one entry per cause (see causePareto for the same set/order) — lets the YoY chart filter to a single cause. */
  monthlyByYearByCause: DisturbanceCauseMonthlyYear[];
  /** Same shape, one entry per KODE GGN (Trip/AR Sukses/Tidak Trip) — lets the YoY chart filter to a single jenis gangguan. */
  monthlyByYearByKind: DisturbanceKindMonthlyYear[];
  /** Same shape, one entry per ULTG — lets the YoY chart filter to a single sub unit. */
  monthlyByYearByUltg: DisturbanceUltgMonthlyYear[];
  years: string[];
  topBay: DisturbanceBayCount[];
  /** Every bay's count, not just the top 8 in `topBay` — kept for anything
   *  that still needs a bay-level (not GI-level) breakdown. */
  allBayCounts: DisturbanceBayCount[];
  /** Every GI's count, straight from the sheet's own GARDU INDUK column —
   *  the accurate replacement for bay-name-derived GI matching, see
   *  src/lib/asset-correlation.ts. */
  giBreakdown: DisturbanceGiCount[];
  /** Tally of the sheet's own STATUS TINDAK LANJUT GGN column. */
  followUp: DisturbanceFollowUpSummary;
  /** Mean DURASI GGN (MENIT) across this category's TRIP events only — AR
   *  Sukses/Tidak Trip carry no real outage time (confirmed near-universally
   *  0 in the source) and would otherwise dilute the average toward
   *  meaninglessness. Null when no TRIP row has a parseable duration. */
  avgDurationMinutes: number | null;
  /** Longest-duration TRIP disturbances, longest first — capped at 10. */
  longestDisturbances: DisturbanceDurationRecord[];
  /** Sorted by total desc. */
  ultgBreakdown: DisturbanceUltgSummary[];
  /** Sorted by total desc — every bay in this category, not just `topBay`'s 8. */
  bayBreakdown: DisturbanceBaySummary[];
}

export interface AiInsight {
  id: string;
  tone: StatusLevel;
  text: string;
  /** Deep link to where this insight's underlying data lives — e.g. the
   *  specific KPI card on Kinerja UPT, or the AHI section it's about.
   *  Absent when the insight has no single destination worth linking to. */
  href?: string;
}

export type UptKpiDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";

export type UptKpiCategory =
  | "availability"
  | "disturbance"
  | "protection"
  | "finance"
  | "asset-legal"
  | "asset-maturity";

/** One of the 19 configured KPIs, resolved against its matched row (if any)
 *  in the "DRAFT BARU" sheet for the current period — see src/services/upt-performance.ts. */
export interface UptKpi {
  key: string;
  displayName: string;
  abbreviation?: string;
  category: UptKpiCategory;
  /** From the sheet's own POLARITAS column (Positif/Negatif) for the matched
   *  row — null when the row is missing or its polarity is neither
   *  ("Range", e.g. Anggaran Investasi — see Business Logic Requires Confirmation). */
  direction: UptKpiDirection | null;
  /** True when config.expectedDirection disagrees with the sheet's own
   *  resolved `direction` — surfaced rather than silently overridden. */
  directionConflict: boolean;
  unit: string | null;
  /** Raw text as it appears in the sheet (e.g. "95-100") — always shown even when unparseable. */
  targetLabel: string | null;
  targetValue: number | null;
  actualLabel: string | null;
  actualValue: number | null;
  /** The sheet's own "Pencapaian" column — not recomputed locally (see
   *  Business Logic Requires Confirmation: PLN's own contract-scoring
   *  formula includes capping/bobot-hilang rules this app doesn't reimplement). */
  achievement: number | null;
  status: StatusLevel; // good=ACHIEVED, warning=WARNING, critical=CRITICAL, none=NO_DATA
  /** Real monthly "Realisasi Komulatif" (cumulative realization) trend read
   *  straight from the sheet's own monthly-columns block — null when the
   *  KPI's row wasn't found there, or the block itself isn't readable. Only
   *  months up to the currently-synced reporting month are ever included —
   *  see src/services/upt-performance.ts extractMonthlyTrends(). */
  monthlyTrend: UptKpiMonthlyPoint[] | null;
  /** The sheet's own official weight/scoring columns (BOBOT, Capping 110%,
   *  Bobot Hilang) — read directly, never recomputed. Null when this KPI's
   *  row (or its group's) has no weight in the sheet. */
  weightInfo: UptWeightInfo | null;
}

export interface UptWeightInfo {
  /** BOBOT — this KPI's own weight, or its group's shared weight (see `sharedWith`). */
  weight: number;
  /** "Capping 110%" — the weighted, capped contribution score. */
  weightedScore: number | null;
  /** "Bobot Hilang" — weight lost (negative) or gained (positive) vs the base weight. */
  weightLost: number | null;
  /** Set when this KPI has no individually-weighted row of its own and
   *  instead shares one combined weight with sibling KPIs under the same
   *  category header (e.g. TRAF/CCAF/MTTR-TR/MTTR-TL all share "Faktor
   *  Ketersediaan Transmisi (TRAF dan CCAF)"'s weight) — holds that
   *  category's display name so the UI can say so explicitly. */
  sharedWith?: string;
}

export interface UptKpiMonthlyPoint {
  /** Short Indonesian month label, e.g. "Jan". */
  month: string;
  /** null when the sheet's own cell for this month is blank/unparseable — a
   *  gap, never fabricated as 0. */
  value: number | null;
}

export interface UptOverallPerformance {
  total: number;
  achieved: number;
  warning: number;
  critical: number;
  noData: number;
}

export interface UptPeriodOption {
  /** "2026-08" */
  value: string;
  /** "Agustus 2026" */
  label: string;
  hasData: boolean;
}

export interface UptPerformanceSnapshot {
  /** The one period the sheet's "Target s/d" / "Realisasi s/d" columns actually reflect, e.g. "2026-08". */
  period: string;
  periodLabel: string;
  kpis: UptKpi[];
  overall: UptOverallPerformance;
  periodOptions: UptPeriodOption[];
  lastUpdate: string | null;
  /** The sheet's own "TOTAL BOBOT PROPORSIONAL" row (Capping 110% column) —
   *  the official weighted contract score across all 19 KPIs, read directly
   *  rather than summed locally. Null when that row can't be found. */
  overallWeightedScore: number | null;
  /** Non-fatal anomalies worth surfacing (e.g. a KPI alias matching more than one row) — see AGENTS.md section 33. */
  warnings: string[];
}

export interface UptPerformanceResult {
  data: UptPerformanceSnapshot | null;
  error: string | null;
}

export type AhiSectionKey = "mtu" | "catu-daya" | "trafo" | "reaktor";

export interface AhiParameterResult {
  name: string;
  kosong: number | null;
  best: number | null;
  good: number | null;
  fair: number | null;
  poor: number | null;
  critical: number | null;
}

export interface AhiDistribution {
  best: number | null;
  good: number | null;
  fair: number | null;
  poor: number | null;
  critical: number | null;
}

/** One AHI category (e.g. "AHI PMS") — one block in the "HI UPT" sheet's A:W report layout. */
export interface AhiCategory {
  key: string;
  displayName: string;
  section: AhiSectionKey;
  jumlahDataTercatat: number | null;
  /** 0-1 fraction, as stored in the sheet. */
  kualitasData: number | null;
  /** 0-1 fraction — the sheet's own "Score AHI" value, not recomputed. */
  score: number | null;
  distribution: AhiDistribution;
  parameters: AhiParameterResult[];
  /** Derived from `distribution` (any critical -> critical, any poor -> warning,
   *  else good) — not a score threshold, since none is sourced. See
   *  src/services/ahi-performance.ts for the reasoning. */
  status: StatusLevel;
}

/** One of the 4 main KPIs — AHI MTU / CATU DAYA / TRAFO / REAKTOR. */
export interface AhiSectionSummary {
  key: AhiSectionKey;
  displayName: string;
  /** 0-1 fraction. For MTU/CATU DAYA: mean of member categories' scores (only
   *  when the sheet has no section-level aggregate itself — see report).
   *  For TRAFO/REAKTOR: the single category's own score, unchanged. */
  score: number | null;
  status: StatusLevel;
  categories: AhiCategory[];
}

/** One row from the AM:BA "REKAP ANOMALI POOR & CRITICAL" recap — field
 *  names mirror the sheet's own header text (AM:BA row 2). */
export interface AhiAnomalyRecord {
  no: number;
  ultg: string;
  gi: string;
  bay: string;
  jenisAset: string;
  fasa: string;
  merk: string;
  keterangan: string;
  /** The sheet's own numeric AHI level for this finding (4 = Poor, 5 = Critical). */
  kategoriAhi: number;
  parameterPemicuAhi: string;
  parameterAhi2: string;
  kategoriAhiVsSkdir: string;
  subSistem: string;
  rencanaTindakLanjut: string;
  targetWaktu: string;
}

export interface AhiSnapshot {
  /** Always 4 entries, in order: mtu, catu-daya, trafo, reaktor. */
  sections: AhiSectionSummary[];
  anomalies: AhiAnomalyRecord[];
  lastUpdate: string | null;
  /** Non-fatal parsing notices (e.g. a category label not found in the sheet this period). */
  warnings: string[];
}

export interface AhiResult {
  data: AhiSnapshot | null;
  error: string | null;
}

export interface DataSourceHealth {
  key: string;
  module: string;
  file: string | null;
  sheet: string | null;
  provider: string | null;
  lastSync: string | null;
  rows: number | null;
  status: "healthy" | "error" | "pending";
  /** Technical detail shown only on the admin Data Health page — see AGENTS.md section 28/32. */
  error?: string | null;
  /** Recent sync attempts for this row, most-recent-first — see
   *  listSyncHistory() in src/lib/sync-status.ts. Empty for a module with no
   *  real sync activity yet (e.g. a "Coming Soon" mock-data row). */
  history?: SyncHistoryPoint[];
}

export interface SyncHistoryPoint {
  /** Pre-formatted "HH:mm WIB", same convention as `lastSync` above. */
  timestamp: string;
  status: "healthy" | "error";
  rows: number | null;
  error: string | null;
}

/** One maintenance work item from MONITORING — see src/services/renus.ts.
 *  Only rows that pass the sheet's own validity signal (TAHUN non-blank —
 *  every blank-TAHUN row is a broken formula/padding row, confirmed against
 *  live data) ever become a RenusRow. */
export interface RenusRow {
  id: string;
  year: string;
  /** "Januari".."Desember" — stripped of the sheet's own "NN. " prefix. */
  month: string;
  /** RENCANA date, "yyyy-MM-dd" — always present (guaranteed by validity filter), the authoritative planning date for every period calculation. */
  rencanaDate: string;
  /** REALISASI date, "yyyy-MM-dd" — null on ~94% of rows (most work is still planned, not yet realized). */
  realisasiDate: string | null;
  ultg: string;
  gi: string;
  bay: string;
  workDetail: string;
  /** The sheet's secondary "(PASTIKAN CAPSLOCK...)" detail column — often blank/duplicate, shown only as a supplementary note when present and different. */
  workDetailAlt: string | null;
  pic: string | null;
  /** Raw STATUS value — "" (blank) is a real, common state (~35% of rows), never assumed to mean RENCANA. */
  status: string;
  /** Raw RESIKO PEKERJAAN value — only "EXTREME-CRITICAL" / "HIGH" / "" exist in the source; never invented as Low/Medium/Critical. */
  risk: string;
  kodeBay: string | null;
  section: string | null;
  spanTower: string | null;
  docName: string | null;
  docLink: string | null;
  /** "HH:mm:ss", extracted from the sheet's TIME-only cell (date part is a Sheets epoch placeholder, discarded). */
  padamStart: string | null;
  padamEnd: string | null;
  /** SAP work-order status (TECO/CRTD/SFTY/PLAN/CANC) — a separate backend workflow status, not the same thing as `status`. */
  sapWoStatus: string | null;
  /** 1-indexed row number in the actual MONITORING sheet, for traceability. */
  sourceRow: number;
}

export interface RenusWeekPeriod {
  /** "yyyy-MM-dd", the Friday that starts this period. */
  start: string;
  /** "yyyy-MM-dd", the Thursday that ends this period. */
  end: string;
  /** "4 Sep – 10 Sep 2026". */
  label: string;
}

export interface RenusSummary {
  total: number;
  thisWeek: number;
  highRisk: number;
  upcoming: number;
}

export interface RenusData {
  /** "yyyy-MM-dd" in Asia/Jakarta, computed server-side — the client scopes "today"/"overdue" views against this rather than the browser's own clock/timezone. */
  today: string;
  rows: RenusRow[];
  years: string[];
  months: string[];
  ultgs: string[];
  gis: string[];
  bays: string[];
  /** Distinct non-blank STATUS values actually present in the source. */
  statuses: string[];
  /** Distinct non-blank RESIKO PEKERJAAN values actually present in the source. */
  risks: string[];
  summary: RenusSummary;
  weekPeriod: RenusWeekPeriod;
  nextMonth: { year: string; monthLabel: string; monthIndex: number; rows: RenusRow[] };
  /** Rule-based, priority-ordered — overdue, then today, then high risk, then this week's upcoming count. Empty when no condition applies. */
  reminders: AiInsight[];
  error: string | null;
}
