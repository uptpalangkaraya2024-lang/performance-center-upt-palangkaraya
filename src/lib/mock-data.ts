// Mock data reserved ONLY for modules that genuinely have no spreadsheet
// integration yet (Open Case, Data Aset, ...) — shown as "Coming Soon" on
// Data & Sync, never as if it were live data. Kinerja UPT, Kinerja ULTG,
// Gangguan, and AHI all read real data via src/services/* now; do not add
// mock entries back for them here.
import type { DataSourceHealth } from "@/types";

export const dataSourceHealth: DataSourceHealth[] = [
  { key: "open-case", module: "Open Case", file: "Open Case", sheet: "Open Case", provider: null, lastSync: null, rows: null, status: "pending" },
  { key: "aset", module: "Data Aset", file: "Data Aset", sheet: "Trafo, PMT", provider: null, lastSync: null, rows: null, status: "pending" },
];
