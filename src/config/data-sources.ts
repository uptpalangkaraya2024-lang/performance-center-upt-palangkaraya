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
} satisfies Record<string, DataSourceConfig>;
