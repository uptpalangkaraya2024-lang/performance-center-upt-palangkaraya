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
  // A separate UIP3B-Kalimantan-wide "kertas kerja" file — NOT the 4DX
  // targeting file itself (dataSources.fourDx) — used only to correlate
  // each WIG's Lead Measures against the actual recorded outcome numbers
  // (disturbance/incident counts), per the user's explicit request. Read
  // raw: the sheet is a stacked "Bulanan" section then a "Kumulatif"
  // section, each a grid of per-UPT/UP2B column blocks, not a clean single
  // header row — UPT PALANGKA RAYA's own block is found by content match
  // (searching for "UPT PALANGKA RAYA" then "TARGET TRAFO" 2 rows below,
  // not a fixed column index), same defensive approach as every other
  // block-structured sheet in this app.
  fourDxGangguan: {
    id: "four-dx-gangguan",
    label: "4DX Data Gangguan",
    sources: [
      {
        file: "2026_Kertas Kerja 4DX UIP3B Kalimantan",
        sheets: [
          {
            name: "Data Gangguan",
            required: false,
            purpose:
              "UIP3B Kalimantan-wide monthly disturbance/incident rollup. Only the 'Kumulatif' section's UPT PALANGKA RAYA column block is used (12 sub-columns: TARGET/​ /BULAN/​kumulatif x TRAFO,TRANS,ERT,ACC) — confirmed live at columns AX-BI, found by content match. Gives both the monthly count and the running cumulative total per outcome metric (Gangguan Trafo = WIG 1, Gangguan Transmisi = WIG 2, Emergency Response Time = WIG 3, Accident = WIG 4).",
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
  // Sheet names carry real emoji characters — confirmed via the gateway's
  // listSheets action (a plain terminal/JSON viewer can make them look
  // garbled, but the bytes are correct UTF-8 emoji). Both read raw
  // (readConfiguredSourceRaw) — headers repeat mid-sheet per block, not just
  // at row 1, same reason as 4DX's TARGET WIG sheets.
  aboProteksi: {
    id: "abo-proteksi",
    label: "ABO Proteksi",
    sources: [
      {
        file: "ABO 2026 SUB BID. PROTEKSI UIP3B KAL",
        sheets: [
          {
            name: "🖥️ PKY",
            required: false,
            purpose:
              "4 stacked blocks: one UPT-level block + 3 per-ULTG blocks (PALANGKARAYA/MUARA TEWEH/PANGKALANBUN — no space in this sheet's own ULTG label), each with the same 14 programs (PRO_01..14) and full-year weekly target+realisasi columns (T/R <Mon>-M<n>). ULTG blocks carry their own Realisasi columns too, not just Target — this sheet alone gives UPT and per-ULTG target/realisasi/% at every week.",
          },
          {
            name: "📝 INPUT PKY",
            required: false,
            purpose:
              "14 blocks in the same order as PKY's PRO_01..14 (confirmed by title-row match) — one row per ruas/GI/Bay action item, with its own target/realisasi week label and a CLS/OPN completion flag (CLOSE=done, OPEN/blank=not done). Feeds the per-ruas checklist only; UPT/ULTG-level numbers come from PKY.",
          },
        ],
      },
    ],
  },
  // Same block shapes as aboProteksi (see src/services/abo-shared.ts), but
  // NOT identical column layouts — confirmed live: no separate "MASTER"
  // column (Target UPT/ULTG itself is the master value), different STATUS
  // column position, and no ULTG label row before its 3 per-ULTG blocks at
  // all (confirmed with the user: always UPT, then PALANGKARAYA, MUARA
  // TEWEH, PANGKALAN BUN in that fixed order — cross-checked against INPUT
  // PKY's own per-ULTG row counts before asking).
  aboHargi: {
    id: "abo-hargi",
    label: "ABO Hargi",
    sources: [
      {
        file: "ABO 2026 SUB BID. HARGI UIP3B KAL",
        sheets: [
          {
            name: "🖥️ PKY",
            required: false,
            purpose:
              "4 stacked blocks: one UPT-level block + 3 per-ULTG blocks (label-less — order confirmed with the user as PALANGKARAYA/MUARA TEWEH/PANGKALAN BUN), each with the same 16 programs (GI_01..16) and full-year weekly target+realisasi columns. No separate MASTER column — Target UPT/ULTG is the master value directly.",
          },
          {
            name: "📝 INPUT PKY",
            required: false,
            purpose:
              "16 blocks in the same order as PKY's GI_01..16 — one row per ruas/GI action item. Column layout differs from ABO Proteksi's INPUT PKY (extra leading CODE column, no KERAWANAN column), parsed by header name, not fixed index.",
          },
        ],
      },
    ],
  },
  // UIP3B Kalimantan-wide file (also holds Input CE for BPP/BJB/PNK, plus
  // pan-UPT rollup sheets DASHBOARD CE / KAL-CE Weekly) — per the user's
  // explicit instruction, only Palangkaraya's own sheet is read here, and
  // every rollup (target/realisasi count, %achieve, breakdown) is computed
  // independently rather than trusting the pan-UPT DASHBOARD CE sheet
  // (same "don't rely on a manually-maintained rollup" principle already
  // applied to 4DX's REKAP and ABO).
  ceProteksi: {
    id: "ce-proteksi",
    label: "CE Proteksi",
    sources: [
      {
        file: "NEXT LEVEL MONITORING Common Enemy 2026",
        sheets: [
          {
            name: "🏭 INPUT CE PKY",
            required: false,
            purpose:
              "Flat list (no block/LM structure) — one row per finding/anomaly, not grouped by program. Real header sits one row below the sheet's own literal row 1 (a helper row with month labels for a pivot area) — found by content match, not a fixed index. Confirmed live: 983 numbered rows, but 349 are empty placeholders (numeric ID, everything else blank) — a real item requires Nama Program or GARDU INDUK to also be non-blank, leaving 634 real findings. CLS/OPN (CLOSE/OPEN) is the sole completion signal; LINK BA/LAP. PENGUJIAN is confirmed blank on every CLOSE item so, unlike ABO, it carries no BA-missing signal here.",
          },
        ],
      },
    ],
  },
} satisfies Record<string, DataSourceConfig>;
