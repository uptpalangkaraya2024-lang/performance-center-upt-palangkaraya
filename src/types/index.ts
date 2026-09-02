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
  years: string[];
  topBay: DisturbanceBayCount[];
}

export interface AiInsight {
  id: string;
  tone: StatusLevel;
  text: string;
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
}
