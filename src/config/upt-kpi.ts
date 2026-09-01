// Centralized mapping for the 19 "Kinerja UPT" KPIs — see AGENTS.md/Phase 3A
// section 7. Every KPI's row in the "DRAFT BARU" sheet is matched by exact
// `sourceLabel` text (the INDIKATOR KINERJA KUNCI cell with its "a. "/"b. "
// lettered prefix stripped) — no fuzzy matching, so a renamed row simply
// stops matching (surfaced as NO_DATA) instead of silently binding to the
// wrong KPI. See src/services/upt-performance.ts for how this is used.
import type { UptKpiCategory, UptKpiDirection } from "@/types";

export interface UptKpiConfig {
  key: string;
  displayName: string;
  abbreviation?: string;
  category: UptKpiCategory;
  /** Documented/expected direction per the Phase 3A brief — cross-checked at
   *  read time against the sheet's own POLARITAS column for this row. A
   *  mismatch is not silently resolved either way: see `directionConflict`
   *  on the resulting UptKpi and "Business Logic Requires Confirmation" in
   *  the Phase 3A report for the two KPIs where these actually disagree. */
  expectedDirection: UptKpiDirection;
  /** Exact "INDIKATOR KINERJA KUNCI" text once a leading "a. "/"b. " (etc.) prefix is stripped. */
  sourceLabel: string;
}

export const UPT_KPI_CONFIG: UptKpiConfig[] = [
  // A. Availability & Recovery
  {
    key: "TRAF",
    displayName: "Faktor Ketersediaan Trafo",
    abbreviation: "TRAF",
    category: "availability",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Faktor Ketersediaan Trafo (Transformator Avaliability Factor = TRAF)",
  },
  {
    key: "CCAF",
    displayName: "Faktor Ketersediaan Transmisi",
    abbreviation: "CCAF",
    category: "availability",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Faktor Ketersediaan Transmisi (Circuit Avaliability Factor = CCAF)",
  },
  {
    key: "MTTR_TR",
    displayName: "Mean Time To Recovery of Transformer",
    abbreviation: "MTTR-TR",
    category: "availability",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Mean Time To Recovery of Transformer (MTTR-TR)",
  },
  {
    key: "MTTR_TL",
    displayName: "Mean Time To Recovery of Transmission Line",
    abbreviation: "MTTR-TL",
    category: "availability",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Mean Time To Recovery of Transmission Line (MTTR-TL)",
  },

  // B. Disturbance Performance
  {
    key: "SIRKIT_PADAM",
    displayName: "Kali Sirkit Padam Karena Gangguan",
    category: "disturbance",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Kali sirkit padam karena gangguan",
  },
  {
    key: "TRAFO_PADAM",
    displayName: "Kali Trafo GI Padam Karena Gangguan",
    category: "disturbance",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Kali trafo GI padam karena gangguan",
  },
  {
    key: "GANGGUAN_BAY",
    displayName: "Kali Gangguan Pada Peralatan di Bay",
    category: "disturbance",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Kali gangguan pada peralatan di bay",
  },

  // C. Protection Performance
  {
    key: "SI",
    displayName: "Security Index",
    abbreviation: "SI",
    category: "protection",
    // Phase 3A brief lists SI as HIGHER_IS_BETTER, but the sheet's own
    // POLARITAS column marks it "Negatif" (consistent with its unit "Kali"
    // — a count of non-system-fault/out-of-zone events, where fewer is
    // better, and with actual=0 < target=2 yielding a 110% achievement).
    // Kept as documented here; see directionConflict + Phase 3A report.
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Security Index (SI)",
  },
  {
    key: "DI",
    displayName: "Dependability Index",
    abbreviation: "DI",
    category: "protection",
    // Same conflict as SI above — sheet says "Negatif" (count-based, lower is better).
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Dependability Index (DI)",
  },
  {
    key: "ARI",
    displayName: "Auto Reclose Index",
    abbreviation: "ARI",
    category: "protection",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Auto Reclose Index (ARI)",
  },
  {
    key: "RPAG",
    displayName: "Reclose PMT Akibat Gangguan",
    abbreviation: "RPAG",
    category: "protection",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Reclose PMT Akibat Gangguan (RPAG)",
  },

  // D. Finance & Control
  {
    key: "ANGGARAN_INVESTASI",
    displayName: "Anggaran Investasi",
    category: "finance",
    // Sheet's POLARITAS for this row is "Range" (target is literally "95-100"),
    // neither Positif nor Negatif — see Business Logic Requires Confirmation.
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Anggaran Investasi",
  },
  {
    key: "PENGENDALIAN_AI",
    displayName: "Pengendalian AI",
    category: "finance",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Pengendalian AI",
  },
  {
    key: "USULAN_PENGHAPUSAN_ATTB",
    displayName: "Usulan Penghapusan ATTB",
    category: "finance",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Usulan Penghapusan ATTB",
  },
  {
    key: "PENGENDALIAN_NAC",
    displayName: "Pengendalian NAC",
    category: "finance",
    expectedDirection: "LOWER_IS_BETTER",
    sourceLabel: "Pengendalian NAC (Non Allowable Cost)",
  },

  // E. Asset Legal
  {
    key: "LEGAL_ASET_TANAH",
    displayName: "Penyelesaian Dokumen Legal Aset Tanah PLN",
    category: "asset-legal",
    expectedDirection: "HIGHER_IS_BETTER",
    // The only KPI whose row is the top-level numbered item itself (no
    // lettered "a."/"b." child row) — matched directly, no prefix to strip.
    sourceLabel: "Penyelesaian Dokumen Legal Aset Tanah PLN",
  },

  // F. Asset Management Maturity
  {
    key: "MATURITY_TATA_KELOLA_ASET",
    displayName: "Maturity Level Tata Kelola Manajemen Aset Transmisi",
    category: "asset-maturity",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Maturity Level Tata Kelola Manajemen Aset Transmisi",
  },
  {
    key: "KUALITAS_DATA_MATERIAL",
    displayName: "Kualitas Data Perhitungan Material Cadang Transmisi",
    category: "asset-maturity",
    // Sheet's target cell (H) for this row holds a date ("2026-09-30
    // 00:00:00") rather than a number — a source data anomaly, not a
    // direction question. See Business Logic Requires Confirmation.
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Kualitas Data Perhitungan Material Cadang Transmisi",
  },
  {
    key: "MATURITY_EAM",
    displayName: "Maturity Level EAM",
    category: "asset-maturity",
    expectedDirection: "HIGHER_IS_BETTER",
    sourceLabel: "Maturity Level EAM",
  },
];
