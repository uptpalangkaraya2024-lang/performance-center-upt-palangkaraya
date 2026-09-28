// Centralized mapping for the 33 "Kinerja ULTG" KPIs, shared by all 3 ULTG
// sheets (ULTG PALANGKARAYA / ULTG PANGKALAN BUN / ULTG MUARA TEWEH) inside
// "LPTK ULTG 2026" — confirmed live to share one identical contract
// template (same indicators, same categories, same weights), unlike UPT's
// own 19-KPI contract. Every KPI's row is matched by exact `sourceLabel`
// text (the INDIKATOR KINERJA KUNCI cell with its "a. "/"b. " lettered
// prefix stripped) — no fuzzy matching, so a renamed row simply stops
// matching instead of silently binding to the wrong KPI. See
// src/services/ultg-performance.ts for how this is used.
import type { UltgKpiCategory } from "@/types";

export interface UltgKpiConfig {
  key: string;
  displayName: string;
  abbreviation?: string;
  category: UltgKpiCategory;
  /** Exact "INDIKATOR KINERJA KUNCI" text once a leading "a. "/"b. " (etc.) prefix is stripped. */
  sourceLabel: string;
}

export const ULTG_KPI_CONFIG: UltgKpiConfig[] = [
  // 1. Faktor Ketersediaan Transmisi (TRAF dan CCAF) — shared group weight
  {
    key: "TRAF",
    displayName: "Faktor Ketersediaan Trafo",
    abbreviation: "TRAF",
    category: "availability",
    sourceLabel: "Faktor Ketersediaan Trafo (Transformator Avaliability Factor = TRAF)",
  },
  {
    key: "CCAF",
    displayName: "Faktor Ketersediaan Transmisi",
    abbreviation: "CCAF",
    category: "availability",
    sourceLabel: "Faktor Ketersediaan Transmisi (Circuit Avaliability Factor = CCAF)",
  },
  {
    key: "MTTR_TR",
    displayName: "Mean Time To Recovery of Transformer",
    abbreviation: "MTTR-TR",
    category: "availability",
    sourceLabel: "Mean Time To Recovery of Transformer (MTTR-TR)",
  },
  {
    key: "MTTR_TL",
    displayName: "Mean Time To Recovery of Transmission Line",
    abbreviation: "MTTR-TL",
    category: "availability",
    sourceLabel: "Mean Time To Recovery of Transmission Line (MTTR-TL)",
  },

  // 2. Keandalan Line Transmisi dan Trafo Transmisi
  {
    key: "SIRKIT_PADAM",
    displayName: "Kali Sirkit Padam Karena Gangguan",
    category: "disturbance",
    sourceLabel: "Kali sirkit padam karena gangguan",
  },
  {
    key: "TRAFO_PADAM",
    displayName: "Kali Trafo GI Padam Karena Gangguan",
    category: "disturbance",
    sourceLabel: "Kali trafo GI padam karena gangguan",
  },
  {
    key: "GANGGUAN_BAY",
    displayName: "Kali Gangguan Pada Peralatan di Bay",
    category: "disturbance",
    sourceLabel: "Kali gangguan pada peralatan di bay",
  },

  // 3. Pengendalian Kinerja Proteksi — shared group weight
  {
    key: "SI",
    displayName: "Security Index",
    abbreviation: "SI",
    category: "protection",
    sourceLabel: "Security Index (SI)",
  },
  {
    key: "DI",
    displayName: "Dependability Index",
    abbreviation: "DI",
    category: "protection",
    sourceLabel: "Dependability Index (DI)",
  },
  {
    key: "ARI",
    displayName: "Auto Reclose Index",
    abbreviation: "ARI",
    category: "protection",
    sourceLabel: "Auto Reclose Index (ARI)",
  },
  {
    key: "RPAG",
    displayName: "Reclose PMT Akibat Gangguan",
    abbreviation: "RPAG",
    category: "protection",
    sourceLabel: "Reclose PMT Akibat Gangguan (RPAG)",
  },

  // 4. Optimalisasi Pendukung Pemeliharaan
  {
    key: "SLO",
    displayName: "SLO",
    category: "maintenance-support",
    sourceLabel: "SLO",
  },
  {
    key: "HEALTHY_INDEX_PERALATAN",
    displayName: "Healthy Index Peralatan",
    category: "maintenance-support",
    sourceLabel: "Healthy Index Peralatan",
  },

  // 5. Program Kerja ABO Bidang Proteksi
  {
    key: "SCANNING_DISTANCE_RELAY",
    displayName: "Scanning Koordinasi Setting Distance Relay",
    category: "abo-proteksi",
    sourceLabel: "Scanning koordinasi setting distance relay",
  },
  {
    key: "SCANNING_OCR_TRAFO",
    displayName: "Scanning Koordinasi Setting OCR Trafo - Penyulang",
    category: "abo-proteksi",
    sourceLabel: "Scanning koordinasi setting OCR Trafo - Penyulang",
  },
  {
    key: "SCANNING_DEADTIME",
    displayName: "Scanning Koordinasi Waktu Deadtime AR + OCR + OLS",
    category: "abo-proteksi",
    sourceLabel: "Scanning koordinasi waktu deadtime AR + OCR + OLS",
  },
  {
    key: "SCANNING_DIFF_REF",
    displayName: "Scanning Setting DIFF REF Bay Trafo Sesuai Dokumen Approval",
    category: "abo-proteksi",
    sourceLabel: "Scanning Setting DIFF REF Bay Trafo sesuai Dokumen Approval",
  },
  {
    key: "LAPORAN_PROTEKSI_TRAFO",
    displayName: "Pengelolaan dan Evaluasi Laporan Proteksi Bay Trafo",
    category: "abo-proteksi",
    sourceLabel: "Pengelolaan dan evaluasi Laporan Proteksi bay trafo",
  },
  {
    key: "LAPORAN_PROTEKSI_PENGHANTAR",
    displayName: "Pengelolaan dan Evaluasi Laporan Proteksi Bay Penghantar",
    category: "abo-proteksi",
    sourceLabel: "Pengelolaan dan evaluasi Laporan Proteksi bay penghantar",
  },

  // 6. Program Kerja ABO Bidang Jaringan
  {
    key: "VALIDASI_ROW",
    displayName: "Validasi ROW Pohon / Metode Drone",
    category: "abo-jaringan",
    sourceLabel: "Validasi ROW Pohon/ Metode Drone",
  },
  {
    key: "PENEBANGAN_ROW",
    displayName: "Penebangan/Pemangkasan ROW Kritis New Srintami (P0,P1,P2)",
    category: "abo-jaringan",
    sourceLabel: "Penebangan/ Pemangkasan ROW kritis New Srintami (P0,P1,P2)",
  },
  {
    key: "THERMOVISI",
    displayName: "Thermovisi Titik Sambungan SUTT",
    category: "abo-jaringan",
    sourceLabel: "Thermovisi Titik Sambungan SUTT",
  },
  {
    key: "TAHANAN_PENTANAHAN",
    displayName: "Pengukuran Tahanan Pentanahan Kaki Tower",
    category: "abo-jaringan",
    sourceLabel: "Pengukuran Tahanan Pentanahan kaki Tower (ohm)",
  },
  {
    key: "ANTI_HEWAN",
    displayName: "Pemasangan Anti Hewan",
    category: "abo-jaringan",
    sourceLabel: "Pemasangan anti Hewan",
  },
  {
    key: "SRINTAMI_NEXT_LEVEL",
    displayName: "Implementasi New Srintami Next Level",
    category: "abo-jaringan",
    sourceLabel: "Implementasi New Srintami Next Level",
  },

  // 7. Program Kerja ABO Gardu Induk
  {
    key: "THERMO_GI",
    displayName: "Assessment Lv. 2 Thermo (Kubikel, Terminasi Kabel)",
    category: "abo-gardu-induk",
    sourceLabel: "Assessment Lv. 2 Thermo (kubikel, terminasi kabel)",
  },
  {
    key: "PARTIAL_DISCHARGE",
    displayName: "Assesmen Lv. 2 Partial Discharge",
    category: "abo-gardu-induk",
    sourceLabel:
      "Assesmen Lv. 2 Partial Discharge Pengujian PD (Clamp Bushing HV, LV Trafo, Bushing, Anti Binatang, Kabel XLPE, Kubikel 20kV)",
  },
  {
    key: "LCM_LA",
    displayName: "Pengukuran LCM LA",
    category: "abo-gardu-induk",
    sourceLabel: "Pengukuran LCM LA",
  },
  {
    key: "KELENGKAPAN_INSPEKSI",
    displayName: "Kelengkapan Inspeksi (Power Inspect)",
    category: "abo-gardu-induk",
    sourceLabel: "Kelengkapan Inspeksi (Power Inspect)",
  },
  {
    key: "PROTEKSI_BINATANG_GI",
    displayName: "Implementasi Proteksi Binatang Gardu Induk",
    category: "abo-gardu-induk",
    sourceLabel: "Implementasi Proteksi Binatang Gardu Induk sesuai dokumen Juknis",
  },

  // 8. Pelaporan — 2 standalone numbered KPIs (no lettered sub-items)
  {
    key: "LAPORAN_PEMELIHARAAN_PERIODIK",
    displayName: "Pengelolaan Laporan Pemeliharaan Periodik",
    category: "reporting",
    sourceLabel: "Pengelolaan Laporan Pemeliharaan Periodik",
  },
  {
    key: "LAPORAN_FASHAR",
    displayName: "Pengelolaan Laporan Fashar",
    category: "reporting",
    sourceLabel: "Pengelolaan Laporan Fashar",
  },

  // 9. Konten — standalone, POLARITAS blank in the source (direction genuinely unknown, not guessed)
  {
    key: "KONTEN_CTM",
    displayName: "Pembuatan Produksi Konten Tema Capturing The Moment",
    category: "konten",
    sourceLabel: "Pembuatan Produksi Konten Tema Capturing The Moment",
  },
];
