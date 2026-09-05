// Central registry of every Drive-backed data source. Adding a new module
// (Gangguan, Open Case, ABO, ...) means adding one entry here plus a
// normalizer in src/services/ — nothing else in the app should hard-code a
// file name or column header. Files are found by NAME inside one shared
// Drive folder (GOOGLE_DRIVE_FOLDER_ID, see src/services/google-drive.ts),
// never by a per-source spreadsheet ID.
export interface SheetRef {
  /** Tab name inside the file, matched exactly (case-sensitive). */
  name: string;
  /** Human-readable note for admins reading src/config/data-sources.ts — not used at runtime. */
  purpose?: string;
  /** Default true. A required sheet failing (missing/errored) means the module
   *  should treat itself as unavailable; an optional one failing is fine to
   *  render around — see hasAllRequiredSheets() in src/lib/data-connector.ts.
   *  The connector itself doesn't enforce this — it always attempts every
   *  sheet and returns whatever succeeded; a service decides what "usable"
   *  means for its own shape (see AGENTS.md section 15). */
  required?: boolean;
  /** 1-indexed row number the real column headers live on. Default 1 (the
   *  first row). Some spreadsheets have a helper row above the real headers
   *  (e.g. numbered column references) — set this instead of expecting row 1
   *  to always be the header. */
  headerRow?: number;
}

export interface FileSource {
  /** File name in the Drive folder, extension optional — "Kinerja ULTG" matches
   *  both a native Google Sheet and "Kinerja ULTG.xlsx". */
  file: string;
  /** Only these tabs are read — everything else in the file (Pivot, Dashboard, Backup, ...) is ignored. */
  sheets: SheetRef[];
  /** Default true. false skips this file entirely — no provider call, no
   *  Data & Sync entry, not treated as a failure. For a module not ready yet. */
  enabled?: boolean;
}

export interface DataSourceConfig {
  id: string;
  label: string;
  /** Usually one file, but a module MAY span several (e.g. Gangguan Transmisi + Gangguan Trafo merged later). */
  sources: FileSource[];
}

export const dataSources = {
  uptPerformance: {
    id: "upt-performance",
    label: "Kinerja UPT",
    sources: [
      {
        file: "LPTK UPT PALANGKARAYA & ULTG 2026",
        sheets: [
          {
            name: "DRAFT BARU",
            purpose: "UPT Palangkaraya KPI contract — 19 indicators, target/realisasi s.d. current period",
            // Rows 1-13 are the contract cover page + a group-header row for
            // the monthly-columns block (TARGET BULANAN / TARGET KOMULATIF /
            // ...) — the real column header (NO, INDIKATOR KINERJA KUNCI,
            // POLARITAS, SATUAN, ..., Jan, Feb, ...) lives on row 14.
            headerRow: 14,
          },
        ],
      },
    ],
  },
  ultgPerformance: {
    id: "ultg-performance",
    label: "Kinerja ULTG",
    sources: [
      {
        file: "Kinerja ULTG",
        sheets: [{ name: "Kinerja ULTG", purpose: "ULTG performance data" }],
      },
    ],
  },
  ahiPerformance: {
    id: "ahi-performance",
    label: "AHI UPT",
    sources: [
      {
        file: "AHI UPT Palangkaraya 2026 fixed",
        sheets: [
          {
            name: "HI UPT",
            purpose:
              "Asset Healthy Index report — A:W category/parameter blocks + AM:BA poor/critical anomaly recap. Read via readSheetRaw (see src/services/ahi-performance.ts) — a single header row can't uniquely name every column here.",
          },
        ],
      },
    ],
  },
  disturbances: {
    id: "disturbances",
    label: "Gangguan",
    sources: [
      {
        file: "REKAP GANGGUAN UPT PALANGKARAYA",
        sheets: [
          {
            name: "INPUT & REKAP GANGGUAN",
            purpose: "Transmission disturbance log (trip/AR, cause, ULTG, duration)",
            // Row 1 is a numbered column-reference helper row, not the real header.
            headerRow: 2,
          },
        ],
      },
    ],
  },
  renus: {
    id: "renus",
    label: "RENUS",
    sources: [
      {
        file: "02. MONEV PEMELIHARAAN 2026",
        sheets: [
          {
            name: "MONITORING",
            purpose:
              "Maintenance work plan/monitoring log — RENCANA/REALISASI dates, ULTG/GI/Bay, status, risk. Read via readSheetRaw (see src/services/renus.ts) — row 1 is a numbered helper row, not the real header.",
            headerRow: 2,
          },
        ],
      },
    ],
  },
} satisfies Record<string, DataSourceConfig>;
