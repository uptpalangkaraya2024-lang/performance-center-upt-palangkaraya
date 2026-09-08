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
          {
            // required: false on all 5 Input sheets below — they feed the
            // new Bay Line report only, a separate sub-tab. A failure to
            // read any of them must never take down the existing AHI
            // Overview (HI UPT), which stays the only required sheet here.
            name: "Input LA",
            required: false,
            purpose:
              "Per-equipment Lightning Arrester test results (one row per phase R/S/T) feeding the Bay Line report. Read via readSheetRaw (see src/services/ahi-bay-line-report.ts) — 2-row header (group label + sub-label), same reason as HI UPT.",
          },
          {
            name: "Input PMS",
            required: false,
            purpose:
              "Per-equipment Disconnecting Switch (Pemisah) test results — Bay Line's own line/bus-A/bus-B disconnectors, distinguished by the sheet's own \"Keterangan Alat\" column, not a fixed count (a single-busbar GI legitimately has only 2, not 3).",
          },
          {
            name: "Input PT",
            required: false,
            purpose: "Per-equipment CVT (Capacitive Voltage Transformer, filed under PT) test results.",
          },
          {
            name: "Input PMT",
            required: false,
            purpose: "Per-equipment Circuit Breaker test results — already wide-format (R/S/T as separate columns), unlike LA/PMS/PT/CT's one-row-per-phase layout.",
          },
          {
            name: "Input CT",
            required: false,
            purpose: "Per-equipment Current Transformer test results.",
          },
        ],
      },
    ],
  },
  // Separate from ahiPerformance (not another entry in its sources[]) so
  // that a plain getAllBayLineReports() call — used by the Bay Line
  // selector list and by the dashboard's Management Attention aggregation —
  // never has to pay for reading these 5 extra sheets too. Only
  // getAllBayLineReportsWithHistory() (the Report tab's own trend view)
  // reads this source. See apps-script/ahi-history.gs for how it's filled.
  ahiHistory: {
    id: "ahi-history",
    label: "AHI Riwayat Pengujian",
    sources: [
      {
        file: "AHI UPT Palangkaraya - Riwayat Pengujian",
        sheets: [
          { name: "Riwayat LA", required: false, purpose: "Append-only history of Input LA rows — one snapshot per test event, oldest kept." },
          { name: "Riwayat PMS", required: false, purpose: "Append-only history of Input PMS rows." },
          { name: "Riwayat PT", required: false, purpose: "Append-only history of Input PT rows." },
          { name: "Riwayat PMT", required: false, purpose: "Append-only history of Input PMT rows." },
          { name: "Riwayat CT", required: false, purpose: "Append-only history of Input CT rows." },
        ],
      },
    ],
  },
  // TARGET WIG * sheets are read raw (readConfiguredSourceRaw) — each is a
  // sequence of per-LM blocks (title row, own header row, asset rows), not
  // one clean header at row 1, so the header-keyed reader can't apply here.
  // The 4 realization-log sheets (ULTG */K3) have one ordinary header row
  // each and use the normal header-keyed reader instead. See
  // src/services/four-dx.ts for how both shapes get parsed.
  fourDx: {
    id: "four-dx",
    label: "4DX Transmisi",
    sources: [
      {
        file: "[02] Monitoring 4DX Transmisi UPT Palangkaraya 2026",
        sheets: [
          { name: "TARGET WIG 1", required: false, purpose: "Per-LM weekly target/rotation matrix for WIG 1 (Trafo). Read raw — headers repeat per LM block, not just at row 1." },
          { name: "TARGET WIG 2", required: false, purpose: "Per-LM weekly target matrix for WIG 2 (Transmisi) — rows are ULTG-level targets, with extra non-numbered reference rows listing individual towers/spans that carry no weekly numbers and must be skipped." },
          { name: "TARGET WIG 3", required: false, purpose: "Per-LM weekly target/rotation matrix for WIG 3 (Emergency Response Time) — per-GI rotation." },
          { name: "TARGET WIG 4", required: false, purpose: "Per-LM weekly target matrix for WIG 4 (K3/Zero Accident) — rows are ULTG-level targets." },
          { name: "ULTG PALANGKARAYA", required: false, purpose: "Realization log (one row per completed action) for ULTG Palangkaraya — LM code, action plan, asset, date." },
          { name: "ULTG PANGKALAN BUN", required: false, purpose: "Realization log for ULTG Pangkalan Bun." },
          { name: "ULTG MUARA TEWEH", required: false, purpose: "Realization log for ULTG Muara Teweh." },
          { name: "K3 UPT PALANGKARAYA", required: false, purpose: "Realization log for WIG 4 (K3/Zero Accident) actions, UPT-wide rather than per-ULTG." },
          { name: "Monitoring", required: false, purpose: "Reconciled weekly realisasi count per (ULTG, LM) across the whole year — the authoritative realisasi number (some realizations are entered here manually rather than in the ULTG/K3 logs). Used for the Target/Realisasi/% numbers; the ULTG/K3 logs are still used for the per-asset checklist, since this sheet has no per-bay detail." },
          { name: "DATASET", required: false, purpose: "One row per calendar day of the year with that day's own WEEK NUMBER (4 WEEKS) label (e.g. \"SEP-M1\") — the authoritative source for which real dates each week-of-month label actually covers. Confirmed NOT a fixed ceil(day/7) rule (September's M1 is only 6 days, M4 is 10) — every month must be looked up here rather than computed, per user correction." },
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
