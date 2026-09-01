// Mock data for Phase 1 UI development only.
// Will be replaced by data coming through src/services/* once the
// Google Spreadsheet integration lands in a later phase.
import type {
  AiInsight,
  DataSourceHealth,
  DisturbanceCause,
  KpiSummary,
  OpenCaseSummary,
  TrendPoint,
  UltgPerformance,
} from "@/types";

export const lastUpdated = "31 Agu 2026, 14:05 WIB";

export const kpiSummaries: KpiSummary[] = [
  { id: "performance", label: "Performance Score", value: 92.4, unit: "%", target: 90, previous: 88.2, status: "good", format: "percent" },
  { id: "disturbance", label: "Gangguan Bulan Ini", value: 12, unit: "kejadian", target: 10, previous: 15, status: "warning", format: "number" },
  { id: "open-case", label: "Open Case", value: 8, unit: "kasus", target: 5, previous: 11, status: "warning", format: "number" },
  { id: "abo", label: "ABO", value: 96.1, unit: "%", target: 95, previous: 94.8, status: "good", format: "percent" },
  { id: "4dx", label: "4DX Score", value: 81.5, unit: "%", target: 85, previous: 83.0, status: "warning", format: "percent" },
  { id: "ce", label: "CE", value: 99.2, unit: "%", target: 99, previous: 99.4, status: "good", format: "percent" },
  { id: "ahi", label: "Asset Health Index", value: 78.6, unit: "%", target: 80, previous: 76.9, status: "warning", format: "percent" },
];

export const performanceTrend: TrendPoint[] = [
  { period: "Mar", value: 85, target: 90 },
  { period: "Apr", value: 87, target: 90 },
  { period: "Mei", value: 84, target: 90 },
  { period: "Jun", value: 89, target: 90 },
  { period: "Jul", value: 88, target: 90 },
  { period: "Agu", value: 92, target: 90 },
];

export const ultgPerformance: UltgPerformance[] = [
  { id: "ultg-plk", name: "ULTG Palangkaraya", kpi: "Performance Score", target: 90, actual: 92, achievement: 102, status: "good", trend: "up", rank: 1 },
  { id: "ultg-ksg", name: "ULTG Kasongan", kpi: "Performance Score", target: 90, actual: 88, achievement: 98, status: "warning", trend: "flat", rank: 2 },
  { id: "ultg-pgs", name: "ULTG Pangkalan Bun", kpi: "Performance Score", target: 90, actual: 84, achievement: 93, status: "warning", trend: "down", rank: 3 },
  { id: "ultg-smp", name: "ULTG Sampit", kpi: "Performance Score", target: 90, actual: 79, achievement: 88, status: "critical", trend: "down", rank: 4 },
];

export const disturbanceCauses: DisturbanceCause[] = [
  { cause: "Equipment Failure", count: 18 },
  { cause: "Lightning", count: 14 },
  { cause: "Vegetation", count: 9 },
  { cause: "Protection", count: 6 },
  { cause: "Human Error", count: 3 },
  { cause: "Other", count: 2 },
];

export const openCaseSummary: OpenCaseSummary = {
  total: 8,
  overdue: 3,
  dueSoon: 2,
  inProgress: 3,
};

export const aiInsights: AiInsight[] = [
  { id: "1", tone: "good", text: "Performance UPT meningkat 4.2% dibanding bulan sebelumnya." },
  { id: "2", tone: "warning", text: "Gangguan akibat equipment failure menjadi penyebab terbesar, kontribusi 35%." },
  { id: "3", tone: "critical", text: "3 open case telah melewati SLA dan memerlukan tindak lanjut segera." },
  { id: "4", tone: "warning", text: "7 aset berada dalam kategori Asset Health Index Alert." },
];

// Still-mock modules — spreadsheets for these haven't been wired up yet
// (Kinerja ULTG, Gangguan, and Kinerja UPT have — see src/services/). Status
// "pending" reflects that honestly instead of pretending they're live.
// file/sheet show the *planned* names so an admin can see what's coming.
export const dataSourceHealth: DataSourceHealth[] = [
  { key: "open-case", module: "Open Case", file: "Open Case", sheet: "Open Case", provider: null, lastSync: null, rows: null, status: "pending" },
  { key: "aset", module: "Data Aset", file: "Data Aset", sheet: "Trafo, PMT", provider: null, lastSync: null, rows: null, status: "pending" },
];
