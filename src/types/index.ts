export type StatusLevel = "good" | "warning" | "critical" | "none";

export interface KpiSummary {
  id: string;
  label: string;
  value: number;
  unit: string;
  target: number;
  previous: number;
  status: StatusLevel;
  format: "percent" | "number" | "score";
}

export interface TrendPoint {
  period: string;
  value: number;
  target?: number;
}

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

export interface OpenCaseSummary {
  total: number;
  overdue: number;
  dueSoon: number;
  inProgress: number;
}

export interface AiInsight {
  id: string;
  tone: StatusLevel;
  text: string;
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
